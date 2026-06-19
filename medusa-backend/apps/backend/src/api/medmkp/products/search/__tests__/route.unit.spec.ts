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
  const req: any = { url: `/medmkp/products/search?${query}`, scope: { resolve: () => service } }
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
