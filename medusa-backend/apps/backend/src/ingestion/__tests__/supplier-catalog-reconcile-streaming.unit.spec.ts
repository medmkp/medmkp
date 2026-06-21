import {
  beginSupplierCatalogReconcile,
  type ReconcileService,
} from "../supplier-catalog-reconcile"

type Row = { id: string; deleted_at?: Date | string | null; [key: string]: unknown }

// In-memory ReconcileService recording calls, with just enough query support
// (id / supplier_product_id filters, withDeleted) to drive the streaming diff.
function makeService(seed: { products?: Row[]; matches?: Row[] } = {}) {
  const products = [...(seed.products ?? [])]
  const matches = [...(seed.matches ?? [])]

  const calls = {
    createProducts: [] as Row[],
    updateProducts: [] as Row[],
    restoreProducts: [] as string[],
    softDeleteProducts: [] as string[],
    createMatches: [] as Row[],
    restoreMatches: [] as string[],
    softDeleteMatches: [] as string[],
  }

  const filterRows = (
    rows: Row[],
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => {
    let out = rows
    if (Array.isArray(filters.id)) {
      const ids = new Set(filters.id as string[])
      out = out.filter((r) => ids.has(r.id))
    }
    if (Array.isArray(filters.supplier_product_id)) {
      const ids = new Set(filters.supplier_product_id as string[])
      out = out.filter((r) => ids.has(r.supplier_product_id as string))
    }
    if (!config?.withDeleted) out = out.filter((r) => r.deleted_at == null)
    return Promise.resolve(out.map((r) => ({ ...r })))
  }

  const service: ReconcileService = {
    listSupplierProducts: (f, c) => filterRows(products, f, c),
    createSupplierProducts: async (rows) => {
      calls.createProducts.push(...(rows as Row[]))
    },
    updateSupplierProducts: async (rows) => {
      calls.updateProducts.push(...(rows as Row[]))
    },
    softDeleteSupplierProducts: async (ids) => {
      calls.softDeleteProducts.push(...ids)
    },
    restoreSupplierProducts: async (ids) => {
      calls.restoreProducts.push(...ids)
    },
    listSupplierCatalogSources: async () => [],
    createSupplierCatalogSources: async () => {},
    updateSupplierCatalogSources: async () => {},
    softDeleteSupplierCatalogSources: async () => {},
    restoreSupplierCatalogSources: async () => {},
    listCanonicalProductMatches: (f, c) => filterRows(matches, f, c),
    createCanonicalProductMatches: async (rows) => {
      calls.createMatches.push(...(rows as Row[]))
    },
    restoreCanonicalProductMatches: async (ids) => {
      calls.restoreMatches.push(...ids)
    },
    softDeleteCanonicalProductMatches: async (ids) => {
      calls.softDeleteMatches.push(...ids)
    },
    listSupplierPriceSnapshots: async () => [],
    createSupplierPriceSnapshots: async () => {},
    updateSupplierPriceSnapshots: async () => {},
  }

  return { service, calls }
}

const source = { id: "mscs_x", supplier_id: "sup", source_catalog: "cat" }

function batch(skus: string[]) {
  return {
    supplierProducts: skus.map((s) => ({ id: `msp_${s}`, sku: s })),
    canonicalProductMatches: skus.map((s) => ({
      id: `mcpm_${s}`,
      supplier_product_id: `msp_${s}`,
    })),
    priceSnapshots: [] as Array<Record<string, unknown> & { id: string }>,
  }
}

const begin = (service: ReconcileService, allowCatalogShrink = false) =>
  beginSupplierCatalogReconcile(
    service,
    { supplier_id: "sup", source_catalog: "cat", source },
    { allowCatalogShrink, chunkSize: 2 }
  )

describe("streaming supplier catalog reconcile", () => {
  it("creates products + placeholder matches across multiple batches", async () => {
    const { service, calls } = makeService()
    const session = await begin(service)
    await session.upsertBatch(batch(["a", "b"]))
    await session.upsertBatch(batch(["c"]))
    const result = await session.finalize()

    expect(calls.createProducts.map((r) => r.id).sort()).toEqual([
      "msp_a",
      "msp_b",
      "msp_c",
    ])
    expect(calls.createMatches.map((r) => r.id).sort()).toEqual([
      "mcpm_a",
      "mcpm_b",
      "mcpm_c",
    ])
    expect(result.supplier_products.created).toBe(3)
    expect(result.supplier_products.soft_deleted).toBe(0)
    expect(session.desiredProductCount()).toBe(3)
  })

  it("soft-deletes existing products (and their matches) absent from the stream", async () => {
    const { service, calls } = makeService({
      products: [{ id: "msp_a" }, { id: "msp_gone" }],
      matches: [{ id: "mcpm_gone", supplier_product_id: "msp_gone" }],
    })
    const session = await begin(service)
    await session.upsertBatch(batch(["a"])) // 'a' survives (update), 'gone' absent
    const result = await session.finalize()

    expect(calls.updateProducts.map((r) => r.id)).toContain("msp_a")
    expect(calls.createProducts).toHaveLength(0)
    expect(calls.softDeleteProducts).toEqual(["msp_gone"])
    expect(calls.softDeleteMatches).toEqual(["mcpm_gone"])
    expect(result.supplier_products.soft_deleted).toBe(1)
    expect(result.canonical_product_matches.soft_deleted).toBe(1)
  })

  it("restores a soft-deleted product that reappears instead of recreating it", async () => {
    const { service, calls } = makeService({
      products: [{ id: "msp_a", deleted_at: new Date() }],
      matches: [{ id: "mcpm_a", supplier_product_id: "msp_a", deleted_at: new Date() }],
    })
    const session = await begin(service)
    await session.upsertBatch(batch(["a"]))
    const result = await session.finalize()

    expect(calls.restoreProducts).toEqual(["msp_a"])
    expect(calls.createProducts).toHaveLength(0)
    expect(calls.restoreMatches).toEqual(["mcpm_a"])
    expect(result.supplier_products.restored).toBe(1)
  })

  it("processes a SKU repeated across batches only once", async () => {
    const { service, calls } = makeService()
    const session = await begin(service)
    await session.upsertBatch(batch(["a"]))
    await session.upsertBatch(batch(["a"])) // same product on a later page
    await session.finalize()

    expect(calls.createProducts.map((r) => r.id)).toEqual(["msp_a"])
    expect(calls.updateProducts).toHaveLength(0)
  })

  it("skips stale soft-delete when softDeleteStale=false (degraded crawl)", async () => {
    const { service, calls } = makeService({
      products: [{ id: "msp_a" }, { id: "msp_gone" }],
    })
    const session = await begin(service)
    await session.upsertBatch(batch(["a"]))
    const result = await session.finalize({ softDeleteStale: false })

    expect(calls.softDeleteProducts).toHaveLength(0)
    expect(result.supplier_products.soft_deleted).toBe(0)
  })

  it("shrink guard throws at finalize when the catalog collapses", async () => {
    const existing = Array.from({ length: 100 }, (_, i) => ({ id: `msp_old${i}` }))
    const { service } = makeService({ products: existing })
    const session = await begin(service, false)
    await session.upsertBatch(batch(["a"])) // 1 vs 100 existing → >50% shrink
    await expect(session.finalize()).rejects.toThrow(/shrink/i)
  })

  it("allowCatalogShrink lets the collapse through", async () => {
    const existing = Array.from({ length: 100 }, (_, i) => ({ id: `msp_old${i}` }))
    const { service } = makeService({ products: existing })
    const session = await begin(service, true)
    await session.upsertBatch(batch(["a"]))
    const result = await session.finalize()
    expect(result.supplier_products.soft_deleted).toBe(100)
  })
})
