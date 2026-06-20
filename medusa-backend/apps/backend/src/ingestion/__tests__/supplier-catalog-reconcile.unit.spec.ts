import {
  assertCatalogReplaceNotDestructive,
  reconcileSupplierCatalog,
  type ReconcileService,
} from "../supplier-catalog-reconcile"

type Row = { id: string; deleted_at?: Date | string | null; [key: string]: unknown }

/**
 * In-memory stand-in for the MedMKP module service that records calls and keeps
 * just enough state to exercise the diff branches.
 */
function makeService(seed: {
  products?: Row[]
  sources?: Row[]
  matches?: Row[]
  snapshots?: Row[]
}) {
  const products = [...(seed.products ?? [])]
  const sources = [...(seed.sources ?? [])]
  const matches = [...(seed.matches ?? [])]
  const snapshots = [...(seed.snapshots ?? [])]

  const calls = {
    createProducts: [] as Row[],
    updateProducts: [] as Row[],
    restoreProducts: [] as string[],
    softDeleteProducts: [] as string[],
    createMatches: [] as Row[],
    restoreMatches: [] as string[],
    softDeleteMatches: [] as string[],
    createSnapshots: [] as Row[],
    updateSnapshots: [] as Row[],
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
    if (!config?.withDeleted) {
      out = out.filter((r) => r.deleted_at == null)
    }
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

    listSupplierCatalogSources: (f, c) => filterRows(sources, f, c),
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

    listSupplierPriceSnapshots: (f, c) => filterRows(snapshots, f, c),
    createSupplierPriceSnapshots: async (rows) => {
      calls.createSnapshots.push(...(rows as Row[]))
    },
    updateSupplierPriceSnapshots: async (rows) => {
      calls.updateSnapshots.push(...(rows as Row[]))
    },
  }

  return { service, calls }
}

const base = {
  supplier_id: "msup_x",
  source_catalog: "x-source",
  source: { id: "mscs_x", supplier_id: "msup_x", source_catalog: "x-source" },
}

describe("reconcileSupplierCatalog", () => {
  it("creates new, updates existing, and soft-deletes only the stale diff", async () => {
    const { service, calls } = makeService({
      products: [
        { id: "msp_keep", supplier_id: "msup_x", source_catalog: "x-source" },
        { id: "msp_gone", supplier_id: "msup_x", source_catalog: "x-source" },
      ],
      sources: [{ id: "mscs_x" }],
    })

    const result = await reconcileSupplierCatalog(
      service,
      {
        ...base,
        supplierProducts: [
          { id: "msp_keep", name: "Updated" },
          { id: "msp_new", name: "New" },
        ],
        canonicalProductMatches: [],
        priceSnapshots: [],
      },
      { allowCatalogShrink: true }
    )

    expect(calls.createProducts.map((r) => r.id)).toEqual(["msp_new"])
    expect(calls.updateProducts.map((r) => r.id)).toEqual(["msp_keep"])
    expect(calls.softDeleteProducts).toEqual(["msp_gone"])
    expect(calls.restoreProducts).toEqual([])
    expect(result.supplier_products).toEqual({
      created: 1,
      updated: 1,
      restored: 1 - 1,
      soft_deleted: 1,
    })
  })

  it("restores a previously soft-deleted product that reappears", async () => {
    const { service, calls } = makeService({
      products: [
        {
          id: "msp_back",
          supplier_id: "msup_x",
          source_catalog: "x-source",
          deleted_at: new Date(),
        },
      ],
    })

    await reconcileSupplierCatalog(
      service,
      {
        ...base,
        supplierProducts: [{ id: "msp_back", name: "Back in stock" }],
        canonicalProductMatches: [],
        priceSnapshots: [],
      },
      { allowCatalogShrink: true }
    )

    expect(calls.restoreProducts).toEqual(["msp_back"])
    expect(calls.updateProducts.map((r) => r.id)).toEqual(["msp_back"])
    expect(calls.createProducts).toEqual([])
    expect(calls.softDeleteProducts).toEqual([])
  })

  it("never soft-deletes matches of surviving products, only those of removed products", async () => {
    const { service, calls } = makeService({
      products: [
        { id: "msp_keep", supplier_id: "msup_x", source_catalog: "x-source" },
        { id: "msp_gone", supplier_id: "msup_x", source_catalog: "x-source" },
      ],
      matches: [
        // matcher-resolved placeholder for the surviving product — must be left alone
        { id: "mcpm_keep", supplier_product_id: "msp_keep" },
        // matcher's extra substitute row for the surviving product — must be left alone
        { id: "mcpm_auto_keep_sub", supplier_product_id: "msp_keep" },
        // placeholder + auto rows for the removed product — must be soft-deleted
        { id: "mcpm_gone", supplier_product_id: "msp_gone" },
        { id: "mcpm_auto_gone_sub", supplier_product_id: "msp_gone" },
      ],
    })

    const result = await reconcileSupplierCatalog(
      service,
      {
        ...base,
        supplierProducts: [{ id: "msp_keep", name: "Keep" }],
        // ingestion only ever proposes placeholders for current products
        canonicalProductMatches: [
          { id: "mcpm_keep", supplier_product_id: "msp_keep", canonical_product_id: "" },
        ],
        priceSnapshots: [],
      },
      { allowCatalogShrink: true }
    )

    // surviving product's match rows untouched (no update/delete of matcher work)
    expect(calls.createMatches).toEqual([])
    expect(calls.softDeleteMatches.sort()).toEqual(
      ["mcpm_auto_gone_sub", "mcpm_gone"].sort()
    )
    expect(result.canonical_product_matches.soft_deleted).toBe(2)
  })

  it("creates a placeholder match for a newly-added product", async () => {
    const { service, calls } = makeService({ products: [] })

    await reconcileSupplierCatalog(
      service,
      {
        ...base,
        supplierProducts: [{ id: "msp_new", name: "New" }],
        canonicalProductMatches: [
          { id: "mcpm_new", supplier_product_id: "msp_new", canonical_product_id: "" },
        ],
        priceSnapshots: [],
      },
      { allowCatalogShrink: true }
    )

    expect(calls.createMatches.map((r) => r.id)).toEqual(["mcpm_new"])
    expect(calls.softDeleteMatches).toEqual([])
  })

  it("splits price snapshots into create (new) and update (same-window re-run)", async () => {
    const { service, calls } = makeService({
      snapshots: [{ id: "msps_existing" }],
    })

    await reconcileSupplierCatalog(
      service,
      {
        ...base,
        supplierProducts: [],
        canonicalProductMatches: [],
        priceSnapshots: [{ id: "msps_existing", price_cents: 100 }, { id: "msps_new", price_cents: 200 }],
      },
      { allowCatalogShrink: true }
    )

    expect(calls.createSnapshots.map((r) => r.id)).toEqual(["msps_new"])
    expect(calls.updateSnapshots.map((r) => r.id)).toEqual(["msps_existing"])
  })

  it("honors the shrink guard against the count of ACTIVE existing products", async () => {
    const existing: Row[] = Array.from({ length: 100 }, (_, i) => ({
      id: `msp_${i}`,
      supplier_id: "msup_x",
      source_catalog: "x-source",
    }))
    const { service } = makeService({ products: existing })

    await expect(
      reconcileSupplierCatalog(
        service,
        {
          ...base,
          supplierProducts: [{ id: "msp_0", name: "only one" }],
          canonicalProductMatches: [],
          priceSnapshots: [],
        },
        { allowCatalogShrink: false }
      )
    ).rejects.toThrow(/shrink/)
  })
})

describe("assertCatalogReplaceNotDestructive", () => {
  it("allows growth and small shrinks", () => {
    expect(() =>
      assertCatalogReplaceNotDestructive({
        supplierId: "s",
        sourceCatalog: "c",
        existingCount: 100,
        newCount: 80,
        allowCatalogShrink: false,
      })
    ).not.toThrow()
  })

  it("blocks a >50% shrink unless overridden", () => {
    expect(() =>
      assertCatalogReplaceNotDestructive({
        supplierId: "s",
        sourceCatalog: "c",
        existingCount: 100,
        newCount: 10,
        allowCatalogShrink: false,
      })
    ).toThrow()
    expect(() =>
      assertCatalogReplaceNotDestructive({
        supplierId: "s",
        sourceCatalog: "c",
        existingCount: 100,
        newCount: 10,
        allowCatalogShrink: true,
      })
    ).not.toThrow()
  })
})
