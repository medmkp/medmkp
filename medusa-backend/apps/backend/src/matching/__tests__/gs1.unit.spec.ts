import { parseGs1, yymmddToIso } from "../gs1"

// Real GS1 codes read off dental products on a practice shelf. The guarantee:
// parseGs1 pulls the GTIN (for the catalog lookup) AND the lot + expiry (the
// package-only data that feeds expiry alerts and recall pull-lists).
describe("parseGs1", () => {
  it("parses GTIN + lot + expiry from a 3M Filtek Data Matrix (parenthesised form)", () => {
    expect(parseGs1("(01)00605861017657(10)13593092(17)281204")).toEqual({
      gtin: "00605861017657",
      lot: "13593092",
      expiry: "2028-12-04",
    })
  })

  it("parses the same Filtek payload in raw FNC1 form, with or without a separator", () => {
    // 17 (fixed) before 10 (variable, last) needs no separator.
    expect(parseGs1("01" + "00605861017657" + "17" + "281204" + "10" + "13593092")).toMatchObject({
      gtin: "00605861017657",
      lot: "13593092",
      expiry: "2028-12-04",
    })
    // 10 (variable) before 17 requires an FNC1 (\x1d) terminator after the lot.
    expect(parseGs1("0100605861017657" + "10" + "13593092" + "\x1d" + "17" + "281204")).toMatchObject({
      gtin: "00605861017657",
      lot: "13593092",
      expiry: "2028-12-04",
    })
  })

  it("strips a leading symbology identifier the reader may prepend", () => {
    expect(parseGs1("]d2" + "0100605861017657172812041013593092")).toMatchObject({
      gtin: "00605861017657",
      expiry: "2028-12-04",
    })
  })

  it("does NOT fabricate an expiry from a production date (blue box: AI 11, no AI 17)", () => {
    expect(parseGs1("(01)00616784430225(10)24140121021Z(11)241212(30)10")).toEqual({
      gtin: "00616784430225",
      lot: "24140121021Z",
      productionDate: "2024-12-12",
    })
  })

  it("reads lot + expiry even when no GTIN is present (GS1-128 tail, e.g. HS gloves)", () => {
    expect(parseGs1("(17)291019(30)300(10)24015414")).toEqual({
      gtin: null,
      lot: "24015414",
      expiry: "2029-10-19",
    })
  })

  it("captures lot + expiry even when the GTIN check digit fails (still no false match)", () => {
    expect(parseGs1("(01)00605861017650(10)ABC123(17)281204")).toEqual({
      gtin: null, // bad check digit → gtinVariants rejects it → no catalog lookup
      lot: "ABC123",
      expiry: "2028-12-04",
    })
  })

  it("parses a GS1 Digital Link URL", () => {
    expect(parseGs1("https://id.gs1.org/01/00605861017657/10/13593092/17/281204")).toEqual({
      gtin: "00605861017657",
      lot: "13593092",
      expiry: "2028-12-04",
    })
  })

  it("returns no GTIN or traceability fields for a plain UPC or junk", () => {
    expect(parseGs1("036000291452")).toEqual({ gtin: null }) // plain UPC: route falls back to gtinVariants(barcode)
    expect(parseGs1("")).toEqual({ gtin: null })
    expect(parseGs1(null)).toEqual({ gtin: null })
  })
})

describe("yymmddToIso", () => {
  it("expands a YYMMDD date to a 21st-century ISO date", () => {
    expect(yymmddToIso("281204")).toBe("2028-12-04")
  })

  it("treats day 00 as the end of that month (GS1 'no specific day')", () => {
    expect(yymmddToIso("281200")).toBe("2028-12-31")
    expect(yymmddToIso("280200")).toBe("2028-02-29") // 2028 is a leap year
  })

  it("returns undefined for a malformed date rather than fabricating one", () => {
    expect(yymmddToIso("281301")).toBeUndefined() // month 13
    expect(yymmddToIso("2812")).toBeUndefined() // too short
    expect(yymmddToIso("28120X")).toBeUndefined() // non-digit
  })
})
