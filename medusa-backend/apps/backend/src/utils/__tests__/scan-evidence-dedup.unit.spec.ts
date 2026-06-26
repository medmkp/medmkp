import { scanMatchesItem } from "../inventory"

// upsertScanEvidence dedups a scan against the records already at a location:
// re-scanning the same (item, lot) refreshes the existing record instead of
// stacking a duplicate, while an unidentified re-scan collapses by raw barcode.
// scanMatchesItem(scan, item) is that decision — scan is the incoming read, item
// the stored evidence record.
describe("scanMatchesItem — lot-at-location evidence dedup", () => {
  const rec = (over: Record<string, any> = {}) => ({
    canonical_product_id: null,
    supplier_product_id: null,
    barcode: null,
    lot_number: null,
    ...over,
  })

  it("refreshes the same identified item + lot", () => {
    const scan = rec({ canonical_product_id: "mcp_app6", lot_number: "L1" })
    const item = rec({ canonical_product_id: "mcp_app6", lot_number: "L1" })
    expect(scanMatchesItem(scan, item)).toBe(true)
  })

  it("keeps different lots of the same product separate (FEFO / traceability)", () => {
    const scan = rec({ canonical_product_id: "mcp_etch", lot_number: "L2" })
    const item = rec({ canonical_product_id: "mcp_etch", lot_number: "L1" })
    expect(scanMatchesItem(scan, item)).toBe(false)
  })

  it("keeps a freshly-lotted scan separate from the same item still missing its lot", () => {
    const scan = rec({ canonical_product_id: "mcp_etch", lot_number: "L1" })
    const item = rec({ canonical_product_id: "mcp_etch", lot_number: null })
    expect(scanMatchesItem(scan, item)).toBe(false)
  })

  it("never collapses two different products", () => {
    const scan = rec({ canonical_product_id: "mcp_app6" })
    const item = rec({ canonical_product_id: "mcp_etch" })
    expect(scanMatchesItem(scan, item)).toBe(false)
  })

  it("matches by supplier product when neither side carries a canonical id", () => {
    const scan = rec({ supplier_product_id: "msp_x" })
    const item = rec({ supplier_product_id: "msp_x" })
    expect(scanMatchesItem(scan, item)).toBe(true)
  })

  it("collapses an unidentified re-scan onto a stored unidentified record sharing its barcode", () => {
    const scan = rec({ barcode: "0616784430225" })
    const item = rec({ barcode: "0616784430225" })
    expect(scanMatchesItem(scan, item)).toBe(true)
  })

  it("does not collapse two unidentified records with no shared barcode", () => {
    expect(scanMatchesItem(rec({ barcode: "111" }), rec({ barcode: "222" }))).toBe(false)
    expect(scanMatchesItem(rec(), rec())).toBe(false)
  })

  it("an identified scan does not collapse onto an unidentified placeholder (even same barcode)", () => {
    // The identified scan starts its own matched record; the placeholder stays in
    // Needs Attention until a human links it. (No false upgrade-in-place.)
    const scan = rec({ canonical_product_id: "mcp_app6", barcode: "0616784430225" })
    const item = rec({ barcode: "0616784430225" })
    expect(scanMatchesItem(scan, item)).toBe(false)
  })
})
