import { parseHibc } from "../hibc"

// Real HIBC codes off the dental products that failed to scan. The guarantee:
// parseHibc extracts the Product/Catalog Number, which equals the manufacturer's
// catalog number stored as a supplier SKU (Pulpdent ER24) or the distributor REF
// (Henry Schein 112-6757 / 101-4583, hyphen stripped).
describe("parseHibc", () => {
  it("extracts the PCN from a concatenated code (primary + lot/expiry)", () => {
    // Pulpdent Etch Royale: LIC D701, PCN ER24, UoM 2, then secondary data.
    expect(parseHibc("+D701ER242/$$32802122602122")).toEqual({ lic: "D701", pcn: "ER24" })
  })

  it("extracts the PCN from a standalone primary code", () => {
    // Henry Schein gauze: LIC H658, PCN 1126757 (REF 112-6757), UoM 1, check L.
    expect(parseHibc("+H65811267571L")).toEqual({ lic: "H658", pcn: "1126757" })
    // SYNGAUZE 50: LIC H658, PCN 1014583 (REF 101-4583), UoM 1, check E.
    expect(parseHibc("+H65810145831E")).toEqual({ lic: "H658", pcn: "1014583" })
  })

  it("tolerates Code 39 guards and human-readable spacing a reader may echo", () => {
    expect(parseHibc("*+H6581126757 1L*")).toEqual({ lic: "H658", pcn: "1126757" })
    expect(parseHibc("  +D701ER242/$$32802122602122  ")).toEqual({ lic: "D701", pcn: "ER24" })
  })

  it("returns null for a GS1 GTIN or any non-HIBC string (caller falls through)", () => {
    expect(parseHibc("00605861017657")).toBeNull() // a GTIN, no HIBC flag
    expect(parseHibc("ER24")).toBeNull() // a bare SKU, handled by the SKU path
    expect(parseHibc("+")).toBeNull() // flag only
    expect(parseHibc("+H658")).toBeNull() // LIC but no PCN/UoM/check
    expect(parseHibc("")).toBeNull()
    expect(parseHibc(null)).toBeNull()
  })
})
