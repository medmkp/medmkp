import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// The route reads current prices through one DISTINCT ON query (see
// utils/latest-price-snapshots), not the module service — mock it to resolve
// from each test service's stubbed snapshot rows so fixtures stay plain rows.
jest.mock("../../../../../utils/latest-price-snapshots", () => ({
  latestPriceSnapshotsByProduct: jest.fn(async () => new Map()),
}))

import { latestPriceSnapshotsByProduct } from "../../../../../utils/latest-price-snapshots"
import { GET } from "../route"

// Exercises the scan route's HIBC wiring end-to-end against a stubbed module
// service: a scanned HIBC code (no GS1 GTIN) must extract the product/catalog
// number and resolve it through the manufacturer-SKU index — the same path the
// SKU scan uses. Mirrors the real Pulpdent Etch Royale label "+D701ER242/…",
// whose PCN "ER24" is stored as a manufacturer_sku.

const ER24_HIT = {
  id: "sp_er24",
  supplier_id: "sup_1",
  sku: "38-ER24",
  manufacturer_sku: "ER24",
  name: "Etch Royale Bulk Pack ER24",
  brand: "Pulpdent",
  category: "Etchants",
  image_url: "",
  pack_size: "",
  pack_quantity: null,
  base_unit: null,
}

function makeService(overrides: Record<string, any> = {}) {
  const calls: Record<string, any[]> = { listSupplierProducts: [] }
  const service = {
    listSupplierProducts: jest.fn(async (filter: any) => {
      calls.listSupplierProducts.push(filter)
      if (filter.manufacturer_sku?.includes("ER24") || filter.sku?.includes("ER24")) {
        return filter.manufacturer_sku?.includes("ER24") ? [ER24_HIT] : []
      }
      return []
    }),
    listCanonicalProductMatches: jest.fn(async () => []),
    listCanonicalProducts: jest.fn(async () => []),
    listSupplierPriceSnapshots: jest.fn(async () => []),
    listSuppliers: jest.fn(async () => []),
    ...overrides,
  }
  return { service, calls }
}

function run(service: any, query: string) {
  ;(latestPriceSnapshotsByProduct as jest.Mock).mockImplementation(
    async (ids: string[]) => {
      const rows = await service.listSupplierPriceSnapshots({ supplier_product_id: ids })
      return new Map(rows.map((row: any) => [row.supplier_product_id, row]))
    }
  )
  // The GUDID-reference fallback resolves the PG connection and calls knex.raw();
  // stub it so a barcode that misses every earlier path doesn't throw. All other
  // tokens (i.e. MEDMKP_MODULE) resolve to the module service mock.
  const knex = { raw: async () => ({ rows: [] }) }
  const resolve = (token: string) =>
    token === ContainerRegistrationKeys.PG_CONNECTION ? knex : service
  const req: any = { url: `/medmkp/products/search?${query}`, scope: { resolve } }
  let body: any
  const res: any = { json: (payload: any) => { body = payload } }
  return GET(req, res).then(() => body)
}

const ETCH_ROYALE_HIBC = "+D701ER242/$$32802122602122"

describe("GET /medmkp/products/search — HIBC scan path", () => {
  it("resolves an HIBC barcode via its PCN through the manufacturer-SKU index", async () => {
    const { service, calls } = makeService()
    const body = await run(service, `barcode=${encodeURIComponent(ETCH_ROYALE_HIBC)}`)

    expect(body.kind).toBe("hibc")
    expect(body.count).toBe(1)
    expect(body.products[0].name).toBe("Etch Royale Bulk Pack ER24")

    // The extracted PCN (not the raw HIBC string) drove the lookup.
    const mfrLookup = calls.listSupplierProducts.find((f) => f.manufacturer_sku)
    expect(mfrLookup.manufacturer_sku).toContain("ER24")
    expect(mfrLookup.manufacturer_sku.some((v: string) => v.includes("+"))).toBe(false)
  })

  it("returns 'none' when the HIBC product isn't in the catalog", async () => {
    const { service } = makeService()
    // Henry Schein house-brand gauze (REF 112-6757) — not ingested.
    const body = await run(service, `barcode=${encodeURIComponent("+H65811267571L")}`)
    expect(body.kind).toBe("none")
    expect(body.count).toBe(0)
  })

  it("leaves the GS1 GTIN path unchanged (a non-HIBC miss still returns 'none')", async () => {
    const { service } = makeService()
    const body = await run(service, "barcode=00605861017657")
    expect(body.kind).toBe("none")
    // A valid GTIN is queried by barcode; it is never misrouted to the SKU index.
    expect(service.listSupplierProducts).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: expect.any(Array) })
    )
  })

  it.each([
    ["GS1-128", "10304040153939", "01103040401539391729101930300\u001d1024015414"],
    ["GS1 Data Matrix", "00605861017657", "01006058610176571013593092\u001d17281204"],
    ["GS1 Data Matrix", "00616784430225", "010061678443022510241401210212\u001d112412123010"],
  ])("extracts AI 01 from a full %s payload", async (_format, gtin, payload) => {
    const hit = { ...ER24_HIT, id: "sp_gtin", barcode: gtin, name: "Scanned GS1 product" }
    const { service } = makeService({
      listSupplierProducts: jest.fn(async (filter: any) =>
        filter.barcode?.includes(gtin) ? [hit] : []
      ),
    })
    const body = await run(service, `barcode=${encodeURIComponent(payload)}`)

    expect(service.listSupplierProducts).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: expect.arrayContaining([gtin]) })
    )
    expect(body.kind).toBe("barcode")
    expect(body.products[0].name).toBe("Scanned GS1 product")
  })

  it.each([
    ["id.gs1.org canonical", "https://id.gs1.org/01/00302730002188/10/LOT42"],
    ["brand domain + query", "https://example.com/01/00302730002188?17=261231"],
    ["bare path", "https://dental.co/01/00302730002188"],
  ])("extracts AI 01 from a GS1 Digital Link QR (%s)", async (_label, payload) => {
    const gtin = "00302730002188"
    const hit = { ...ER24_HIT, id: "sp_dl", barcode: gtin, name: "Digital Link product" }
    const { service } = makeService({
      listSupplierProducts: jest.fn(async (filter: any) =>
        filter.barcode?.includes(gtin) ? [hit] : []
      ),
    })
    const body = await run(service, `barcode=${encodeURIComponent(payload)}`)

    expect(service.listSupplierProducts).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: expect.arrayContaining([gtin]) })
    )
    expect(body.kind).toBe("barcode")
    expect(body.products[0].name).toBe("Digital Link product")
  })

  it("does not treat a needs-review canonical link as the scanned product", async () => {
    const wrongCanonical = { id: "canon_wrong", name: "Unrelated bur", category: "Burs" }
    const { service } = makeService({
      listCanonicalProductMatches: jest.fn(async () => [{
        supplier_product_id: ER24_HIT.id,
        canonical_product_id: wrongCanonical.id,
        match_status: "needs_review",
      }]),
      listCanonicalProducts: jest.fn(async () => [wrongCanonical]),
    })
    const body = await run(service, `barcode=${encodeURIComponent(ETCH_ROYALE_HIBC)}`)

    expect(body.products[0].name).toBe("Etch Royale Bulk Pack ER24")
    expect(body.products[0].name).not.toBe("Unrelated bur")
  })
})

// A Henry Schein house-brand item ingested as identity only (no price, no
// canonical match). Scanning its HIBC code should identify it and fall back to a
// priced substitute from another supplier.
const HS_HIT = {
  id: "sp_hs",
  supplier_id: "sup_hs",
  sku: "1014583", // = REF 101-4583 = HIBC PCN for "+H65810145831E"
  manufacturer_sku: "2100-HS",
  name: "Syngauze 50 Non-Woven Sponge 4x4 4ply 200/Box",
  brand: "Henry Schein Inc.",
  category: "Infection Control",
  image_url: "",
  pack_size: "200/Box",
  pack_quantity: 200,
  base_unit: "sponge",
}
const BEESURE_SP = {
  id: "sp_beesure",
  supplier_id: "sup_dc",
  sku: "455-BE1344",
  name: "BeeSure Non-Woven Sponge 4-ply NS 4x4 Standard",
  brand: "BeeSure",
  image_url: "",
  pack_size: "2000/Pk",
  pack_quantity: 2000,
  base_unit: "sponge",
}
const SPONGE_CANON = { id: "canon_sponge", name: "Non-Woven Sponge 4x4 4-ply", category: "Infection Control" }

function makeSubstituteService() {
  return {
    // HS lookup by sku/mfr_sku; enrichment lookup by id.
    listSupplierProducts: jest.fn(async (filter: any) => {
      if (filter.sku?.includes("1014583") || filter.manufacturer_sku?.includes("1014583")) {
        return filter.manufacturer_sku?.includes("2100-HS") || filter.sku?.includes("1014583") ? [HS_HIT] : []
      }
      if (filter.id?.includes("sp_beesure")) return [BEESURE_SP]
      return []
    }),
    // HS supplier product has no canonical match; the sponge canonical maps to BeeSure.
    listCanonicalProductMatches: jest.fn(async (filter: any) => {
      if (filter.canonical_product_id?.includes("canon_sponge")) {
        return [{ canonical_product_id: "canon_sponge", supplier_product_id: "sp_beesure", match_status: "exact" }]
      }
      return []
    }),
    listCanonicalProducts: jest.fn(async () => [SPONGE_CANON]),
    listSupplierPriceSnapshots: jest.fn(async (filter: any) => {
      if (filter.supplier_product_id?.includes("sp_beesure")) {
        return [{ supplier_product_id: "sp_beesure", price_cents: 4969, unit_price_cents: 2, availability: "in_stock", captured_at: "2026-06-18T00:00:00Z" }]
      }
      return []
    }),
    listSuppliers: jest.fn(async () => [{ id: "sup_dc", name: "DC Dental" }, { id: "sup_hs", name: "Henry Schein" }]),
  }
}

describe("GET /medmkp/products/search — substitute fallback", () => {
  it("identifies an unpriced HS item and returns a priced substitute", async () => {
    const service = makeSubstituteService()
    const body = await run(service, `barcode=${encodeURIComponent("+H65810145831E")}`)

    expect(body.kind).toBe("substitute")
    expect(body.identified).toMatchObject({ sku: "1014583", brand: "Henry Schein Inc." })
    expect(body.count).toBeGreaterThan(0)
    expect(body.products[0].name).toContain("Non-Woven Sponge") // the canonical match
    expect(body.products[0].match.kind).toBe("substitute")
    // The priced alternative is carried as the best offer.
    expect(body.products[0].best_offer.name).toContain("BeeSure")
    expect(body.products[0].best_offer.price_cents).toBe(4969)
    expect(body.products[0].best_offer.supplier_name).toBe("DC Dental")
  })
})

// House-brand regression: when the scanned item's longest name token is its
// (house) brand — "Criterion N300 Nitrile..." — a single-token retrieval only
// pulls the brand's own price-less siblings. The substitute search must retrieve
// by the next tokens too so the product TYPE ("nitrile") brings in priced
// equivalents from other brands.
const HS_GLOVE = {
  id: "sp_hsglove", supplier_id: "sup_hs", sku: "GLOVE123", manufacturer_sku: "N300",
  name: "Criterion N300 Nitrile Exam Gloves Small Electric Blue Non-Sterile 300/Bx",
  brand: "Henry Schein Inc.", category: "Gloves", image_url: "", pack_size: "300/Bx", pack_quantity: 300, base_unit: "glove",
}
const VELVET_SP = {
  id: "sp_velvet", supplier_id: "sup_dc", sku: "V-300",
  name: "Velvet 300 Nitrile Exam Gloves Small Blue Non-Sterile 300/Bx",
  brand: "Velvet", image_url: "", pack_size: "300/Bx", pack_quantity: 300, base_unit: "glove",
}
const CRITERION_CANON = { id: "canon_criterion", name: HS_GLOVE.name, category: "Gloves" }
const VELVET_CANON = { id: "canon_velvet", name: VELVET_SP.name, category: "Gloves" }

describe("GET /medmkp/products/search — substitute retrieval keys on product type, not brand", () => {
  it("surfaces a priced cross-brand substitute reached only via a type token", async () => {
    const service = {
      listSupplierProducts: jest.fn(async (filter: any) => {
        if (filter.sku?.includes("GLOVE123")) return [HS_GLOVE]
        if (filter.id) return [HS_GLOVE, VELVET_SP].filter((sp) => filter.id.includes(sp.id))
        return []
      }),
      listCanonicalProductMatches: jest.fn(async (filter: any) => {
        const ids: string[] = filter.canonical_product_id ?? []
        const bySp: string[] = filter.supplier_product_id ?? []
        const out: any[] = []
        if (bySp.includes("sp_hsglove") || ids.includes("canon_criterion")) out.push({ canonical_product_id: "canon_criterion", supplier_product_id: "sp_hsglove", match_status: "exact" })
        if (ids.includes("canon_velvet")) out.push({ canonical_product_id: "canon_velvet", supplier_product_id: "sp_velvet", match_status: "exact" })
        return out
      }),
      // Brand token finds only the price-less house-brand canonical; the type
      // token "nitrile" is what reaches the priced Velvet canonical.
      listCanonicalProducts: jest.fn(async (filter: any) => {
        if (filter.id?.includes("canon_criterion")) return [CRITERION_CANON]
        if (filter.q === "criterion") return [CRITERION_CANON]
        if (filter.q === "nitrile") return [VELVET_CANON]
        return []
      }),
      listSupplierPriceSnapshots: jest.fn(async (filter: any) => {
        if (filter.supplier_product_id?.includes("sp_velvet")) return [{ supplier_product_id: "sp_velvet", price_cents: 1539, unit_price_cents: 5, availability: "in_stock", captured_at: "2026-06-20T00:00:00Z" }]
        return []
      }),
      listSuppliers: jest.fn(async () => [{ id: "sup_dc", name: "DC Dental" }, { id: "sup_hs", name: "Henry Schein" }]),
    }
    const body = await run(service, "code=GLOVE123")

    expect(body.kind).toBe("substitute")
    expect(body.products[0].best_offer.name).toContain("Velvet")
    expect(body.products[0].best_offer.price_cents).toBe(1539)
    // The retrieval must have queried by the type token, not just the brand.
    const queried = service.listCanonicalProducts.mock.calls.map((c: any[]) => c[0]?.q).filter(Boolean)
    expect(queried).toContain("nitrile")
  })
})
