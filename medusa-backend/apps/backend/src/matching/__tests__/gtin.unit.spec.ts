import { gtinVariants, isValidGtin, baseUnitGtinVariants, canonicalGtin } from "../gtin"

// A real, check-digit-valid UPC-A and its wider GTIN representations (the same
// number with leading-zero padding). DC Dental stores the 12-digit UPC-A.
const UPC_A = "036000291452"
const EAN_13 = "0036000291452" // "0" + UPC-A, as a phone reader often returns
const GTIN_14 = "00036000291452" // "00" + UPC-A, as a case label carries

describe("isValidGtin", () => {
  it("accepts valid GTIN-8/12/13/14", () => {
    expect(isValidGtin("96385074")).toBe(true) // EAN-8
    expect(isValidGtin(UPC_A)).toBe(true)
    expect(isValidGtin(EAN_13)).toBe(true)
    expect(isValidGtin(GTIN_14)).toBe(true)
  })

  it("rejects a wrong check digit", () => {
    expect(isValidGtin("036000291453")).toBe(false)
  })

  it("rejects implausible lengths and non-digits", () => {
    expect(isValidGtin("1234567")).toBe(false) // too short
    expect(isValidGtin("012345678901234")).toBe(false) // 15 digits, too long
    expect(isValidGtin("not-a-barcode")).toBe(false)
    expect(isValidGtin("")).toBe(false)
  })
})

describe("gtinVariants", () => {
  // The key guarantee: whatever width the reader returns, the candidate list
  // includes the stored UPC-A, so the exact-match lookup resolves to the same
  // supplier product (and thus the same canonical product).
  it("EAN-13 and GTIN-14 forms both yield the stored 12-digit UPC-A", () => {
    expect(gtinVariants(UPC_A)).toContain(UPC_A)
    expect(gtinVariants(EAN_13)).toContain(UPC_A)
    expect(gtinVariants(GTIN_14)).toContain(UPC_A)
  })

  it("raw and EAN-13 forms share a lookup candidate (resolve identically)", () => {
    const fromUpcA = new Set(gtinVariants(UPC_A))
    const shared = gtinVariants(EAN_13).filter((v) => fromUpcA.has(v))
    expect(shared).toContain(UPC_A)
  })

  it("includes the as-scanned form and the zero-stripped core", () => {
    const variants = gtinVariants(EAN_13)
    expect(variants).toContain(EAN_13) // as scanned
    expect(variants).toContain("36000291452") // zero-stripped core
  })

  it("strips non-digit separators before matching", () => {
    expect(gtinVariants("0 36000 29145 2")).toContain(UPC_A)
  })

  it("returns [] for a non-GTIN or misread (caller short-circuits to 'none')", () => {
    expect(gtinVariants("12345")).toEqual([]) // too short
    expect(gtinVariants("036000291453")).toEqual([]) // bad check digit
    expect(gtinVariants("abcdefgh")).toEqual([]) // non-numeric
    expect(gtinVariants("")).toEqual([])
  })
})

describe("baseUnitGtinVariants", () => {
  // A case/inner-pack GTIN-14 (indicator 1–8) maps to the base unit that shares
  // its item reference. The Covidien Shiley case "30884522026721" (indicator 3)
  // is the each "00884522026720" / UPC-A "884522026720" — same 884522 02672 item
  // reference, with the check digit recomputed for indicator 0.
  it("derives the base-unit GTIN from a case GTIN (indicator 3 → 0)", () => {
    const variants = baseUnitGtinVariants("30884522026721")
    expect(variants).toContain("00884522026720") // base GTIN-14
    expect(variants).toContain("884522026720") // base UPC-A (likely stored form)
    expect(variants).not.toContain("30884522026721") // never the scanned case itself
  })

  it("returns [] when there's no separate base unit to fall back to", () => {
    expect(baseUnitGtinVariants("00036000291452")).toEqual([]) // indicator 0 = already base
    expect(baseUnitGtinVariants("90884522026723")).toEqual([]) // indicator 9 = variable measure
    expect(baseUnitGtinVariants("036000291452")).toEqual([]) // UPC-A, not a GTIN-14
    expect(baseUnitGtinVariants("30884522026720")).toEqual([]) // bad check digit
    expect(baseUnitGtinVariants("")).toEqual([])
  })
})

describe("canonicalGtin", () => {
  // The same item's 1D barcode (UPC-A) and 2D GS1 Data Matrix (GTIN-14 in AI 01)
  // must reduce to one identity so the scanner can merge the two reads.
  it("reduces every padding of one GTIN to the same core", () => {
    expect(canonicalGtin(UPC_A)).toBe("36000291452")
    expect(canonicalGtin(EAN_13)).toBe("36000291452")
    expect(canonicalGtin(GTIN_14)).toBe("36000291452")
  })

  it("ignores non-digit formatting (the HRI's spacing)", () => {
    expect(canonicalGtin("0 36000 29145 2")).toBe("36000291452")
  })

  it("returns null for anything that isn't a valid GTIN", () => {
    expect(canonicalGtin("036000291453")).toBeNull() // bad check digit
    expect(canonicalGtin("ER24")).toBeNull() // an HIBC PCN / SKU
    expect(canonicalGtin("")).toBeNull()
  })
})
