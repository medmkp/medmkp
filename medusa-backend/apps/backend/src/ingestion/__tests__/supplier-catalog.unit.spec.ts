import { buildSupplierCatalogIngestion } from "../supplier-catalog"

describe("buildSupplierCatalogIngestion", () => {
  it("keeps generated price snapshot IDs unique when long parts are truncated", () => {
    const rows = [
      {
        sku: "21-M407-BUBBLE-GUM-SUPER-LONG-SKU-WITH-A-SHARED-PREFIX-AAAAAAAAAAAA",
        name: "Bubble Gum Prophy Paste",
        price_cents: 1250,
        product_url: "https://supplier.test/products/bubble-gum",
      },
      {
        sku: "21-M407-BUBBLE-GUM-SUPER-LONG-SKU-WITH-A-SHARED-PREFIX-BBBBBBBBBBBB",
        name: "Bubble Gum Prophy Paste",
        price_cents: 1250,
        product_url: "https://supplier.test/products/bubble-gum",
      },
    ]

    const ingestion = buildSupplierCatalogIngestion(
      {
        supplier_id: "msup_amerdental_com",
        source_type: "website",
        source_catalog: "american_dental_accessories_website_public",
        rows,
        captured_at: "2026-06-14T21:05:00.000Z",
      },
      []
    )
    const ids = ingestion.priceSnapshots.map((snapshot) =>
      (snapshot as { id: string }).id
    )

    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every((id) => id.length <= 96)).toBe(true)
  })

  it("writes only unmatched canonical placeholders, even when candidates would overlap", () => {
    // The canonical match engine is the single source of truth for clustering.
    // Ingestion must never write a servable match, otherwise a re-ingest would
    // clobber the matcher's output. Pass a candidate whose name/category overlap
    // the product heavily; the old token-overlap scorer would have produced a
    // "variant"/"exact" match — we now defer unconditionally.
    const ingestion = buildSupplierCatalogIngestion(
      {
        supplier_id: "msup_test",
        source_type: "website",
        source_catalog: "test-catalog",
        rows: [
          {
            sku: "GAUZE-1",
            name: "Cotton Gauze Sponge 4x4",
            category: "Infection Control",
            brand: "Acme",
            price_cents: 100,
          },
        ],
        captured_at: "2026-06-19T00:00:00.000Z",
      },
      [{ id: "mcp_existing", name: "Cotton Gauze Sponge 4x4", category: "Infection Control" }]
    )

    const match = ingestion.canonicalProductMatches[0] as {
      canonical_product_id: string
      match_status: string
      confidence_score: number
    }
    expect(match.canonical_product_id).toBe("")
    expect(match.match_status).toBe("unmatched")
    expect(match.confidence_score).toBe(0)
  })

  it("cleans weird characters out of the persisted product name", () => {
    const ingestion = buildSupplierCatalogIngestion(
      {
        supplier_id: "msup_test",
        source_type: "website",
        source_catalog: "test-catalog",
        rows: [
          {
            sku: "ABC-1",
            // U+FFFD from a bad-charset ingest, a leftover entity, a smart
            // quote and a non-breaking hyphen — plus a legit ™ that must stay.
            name: "Calset� Quik‑Tip&#8482; 5.5” Tray",
            price_cents: 100,
          },
        ],
        captured_at: "2026-06-18T00:00:00.000Z",
      },
      []
    )

    const name = (ingestion.supplierProducts[0] as { name: string }).name
    expect(name).toBe('Calset Quik-Tip™ 5.5" Tray')
  })

  const baseInput = (rows: { sku?: string; name?: string; price_cents?: number }[]) => ({
    supplier_id: "msup_pearson",
    source_type: "website" as const,
    source_catalog: "pearson-dental-website-public",
    rows,
    captured_at: "2026-06-17T00:00:00.000Z",
  })

  it("derives stable supplier product ids independent of row order (idempotent re-ingestion)", () => {
    const a = buildSupplierCatalogIngestion(
      baseInput([
        { sku: "F87-0022", name: "Glove S", price_cents: 299 },
        { sku: "F87-0028", name: "Glove XL", price_cents: 299 },
      ]),
      []
    )
    const b = buildSupplierCatalogIngestion(
      baseInput([
        { sku: "F87-0028", name: "Glove XL", price_cents: 299 },
        { sku: "F87-0022", name: "Glove S", price_cents: 299 },
      ]),
      []
    )
    const ids = (ingestion: ReturnType<typeof buildSupplierCatalogIngestion>) =>
      new Set(ingestion.supplierProducts.map((product) => (product as { id: string }).id))
    expect(ids(a)).toEqual(ids(b))
  })

  it("collapses a SKU that repeats within one catalog into a single product", () => {
    const ingestion = buildSupplierCatalogIngestion(
      baseInput([
        { sku: "F87-0022", name: "Glove S (page 1)", price_cents: 299 },
        { sku: "F87-0022", name: "Glove S (page 2)", price_cents: 305 },
      ]),
      []
    )
    expect(ingestion.supplierProducts).toHaveLength(1)
    expect(ingestion.canonicalProductMatches).toHaveLength(1)
  })

  it("drops scraper-artifact rows whose cleaned name is junk (#606)", () => {
    const ingestion = buildSupplierCatalogIngestion(
      baseInput([
        { sku: "JUNK-1", name: "Debug info copied.", price_cents: 100 },
        { sku: "JUNK-2", name: "Ea", price_cents: 200 },
        { sku: "JUNK-3", name: "Box", price_cents: 300 },
        { sku: "REAL-1", name: "Cotton Gauze Sponge 4x4", price_cents: 400 },
      ]),
      []
    )
    // Only the real listing survives — no supplier product, match, or price
    // snapshot is emitted for any junk row.
    expect(ingestion.supplierProducts).toHaveLength(1)
    expect((ingestion.supplierProducts[0] as { name: string }).name).toBe(
      "Cotton Gauze Sponge 4x4"
    )
    expect(ingestion.canonicalProductMatches).toHaveLength(1)
    expect(ingestion.priceSnapshots).toHaveLength(1)
  })

  it("keeps distinct ids for SKUs that slugify identically (e.g. 809-151 vs 809-151+)", () => {
    // Real DC Dental collision that aborted a full-catalog commit on a duplicate
    // primary key: the '+' is stripped by slugification.
    const ingestion = buildSupplierCatalogIngestion(
      baseInput([
        { sku: "809-151", name: "Widget", price_cents: 100 },
        { sku: "809-151+", name: "Widget Plus", price_cents: 200 },
      ]),
      []
    )
    const productIds = ingestion.supplierProducts.map((p) => (p as { id: string }).id)
    const matchIds = ingestion.canonicalProductMatches.map((m) => (m as { id: string }).id)
    const priceIds = ingestion.priceSnapshots.map((s) => (s as { id: string }).id)
    expect(ingestion.supplierProducts).toHaveLength(2)
    expect(new Set(productIds).size).toBe(2)
    expect(new Set(matchIds).size).toBe(2)
    expect(new Set(priceIds).size).toBe(2)
  })

  it("does not disambiguate a non-colliding SKU (stable id preserved)", () => {
    const ingestion = buildSupplierCatalogIngestion(
      baseInput([{ sku: "809-151", name: "Widget", price_cents: 100 }]),
      []
    )
    // No collision -> plain slug id, no hash suffix.
    expect((ingestion.supplierProducts[0] as { id: string }).id).toBe(
      "msp_msup_pearson_pearson_dental_website_public_809_151"
    )
  })
})
