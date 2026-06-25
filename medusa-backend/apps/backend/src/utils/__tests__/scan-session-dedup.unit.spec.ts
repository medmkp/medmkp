import { lineMatchesLine, deriveLineStatus } from "../scan-sessions"

// A shelf audit verifies what's present on one shelf, so re-scanning the same
// (item, lot) must collapse onto the existing review line instead of stacking a
// duplicate row. lineMatchesLine is the dedup decision; these cases mirror the
// duplicates a real audit produces (see the "Review Hygiene Cabinet" report).
describe("lineMatchesLine — shelf-audit re-scan dedup", () => {
  const line = (over: Record<string, any> = {}) => ({
    canonical_product_id: null,
    supplier_product_id: null,
    barcode: null,
    lot_number: null,
    ...over,
  })

  it("collapses two byte-identical GS1 scans of the same item (no lot yet)", () => {
    const gs1 = "0100616784430225102414012102120112412123010"
    const a = line({ canonical_product_id: "mcp_app6", barcode: gs1 })
    const b = line({ canonical_product_id: "mcp_app6", barcode: gs1 })
    expect(lineMatchesLine(a, b)).toBe(true)
  })

  it("collapses a unit barcode and a case/GS1 barcode of the same product", () => {
    const a = line({ canonical_product_id: "mcp_app6", barcode: "0616784430225" })
    const b = line({ canonical_product_id: "mcp_app6", barcode: "0100616784430225102414012102120112412123010" })
    expect(lineMatchesLine(a, b)).toBe(true)
  })

  it("collapses an unidentified re-scan onto an identified line sharing its barcode", () => {
    const identified = line({ canonical_product_id: "mcp_app6", barcode: "0616784430225" })
    const unidentified = line({ barcode: "0616784430225" })
    expect(lineMatchesLine(identified, unidentified)).toBe(true)
    expect(lineMatchesLine(unidentified, identified)).toBe(true)
  })

  it("keeps different lots of the same product separate (FEFO / traceability)", () => {
    const a = line({ canonical_product_id: "mcp_etch", lot_number: "L1" })
    const b = line({ canonical_product_id: "mcp_etch", lot_number: "L2" })
    expect(lineMatchesLine(a, b)).toBe(false)
  })

  it("keeps a freshly-lotted scan separate from the same item still missing its lot", () => {
    const a = line({ canonical_product_id: "mcp_etch", lot_number: null })
    const b = line({ canonical_product_id: "mcp_etch", lot_number: "L1" })
    expect(lineMatchesLine(a, b)).toBe(false)
  })

  it("never collapses two different products", () => {
    const a = line({ canonical_product_id: "mcp_app6", barcode: "111" })
    const b = line({ canonical_product_id: "mcp_etch", barcode: "222" })
    expect(lineMatchesLine(a, b)).toBe(false)
  })

  it("matches by supplier product when neither side carries a canonical id", () => {
    const a = line({ supplier_product_id: "msp_x" })
    const b = line({ supplier_product_id: "msp_x" })
    expect(lineMatchesLine(a, b)).toBe(true)
  })

  it("does not collapse two unidentified scans with no shared barcode", () => {
    expect(lineMatchesLine(line(), line())).toBe(false)
  })
})

// On merge the route coalesces fields (incoming ?? existing) and re-derives the
// status, so a later scan can fill in an identity or expiry the first read missed
// without ever demoting a line that was already identified.
describe("merge coalesce keeps the richer line", () => {
  it("an unidentified re-scan does not demote an identified line", () => {
    const existing = { canonical_product_id: "mcp_app6", lot_number: null, expiration_date: null }
    const incoming = { canonical_product_id: null, lot_number: null, expiration_date: null }
    const merged = {
      canonical_product_id: incoming.canonical_product_id ?? existing.canonical_product_id,
      supplier_product_id: null,
      lot_number: incoming.lot_number ?? existing.lot_number,
      expiration_date: incoming.expiration_date ?? existing.expiration_date,
    }
    expect(merged.canonical_product_id).toBe("mcp_app6")
    expect(deriveLineStatus(merged)).toBe("needs_details")
  })

  it("a later scan that reads the expiry promotes the line to confirmed", () => {
    const existing = { canonical_product_id: "mcp_etch", lot_number: "L1", expiration_date: null }
    const incoming = { canonical_product_id: "mcp_etch", lot_number: "L1", expiration_date: "2028-02-11" }
    const merged = {
      canonical_product_id: incoming.canonical_product_id ?? existing.canonical_product_id,
      supplier_product_id: null,
      lot_number: incoming.lot_number ?? existing.lot_number,
      expiration_date: incoming.expiration_date ?? existing.expiration_date,
    }
    expect(deriveLineStatus(merged)).toBe("confirmed")
  })
})
