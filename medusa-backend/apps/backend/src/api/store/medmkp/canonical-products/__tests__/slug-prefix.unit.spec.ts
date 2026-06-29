import { slugPrefixMatcher } from "../route"

// The PDP route falls back to a slug-prefix match when a saved handle's trailing
// id suffix changed across a re-match (the pre-#321 positional scheme minted
// base-36 suffixes like "9i0"; the current content-hash scheme mints 6 hex chars
// like "093332"). The slug is stable, so stripping the suffix lets the old and
// new handles prefix-match each other. These cases pin the derivation logic.
describe("slugPrefixMatcher", () => {
  it("strips a legacy positional suffix and matches the new content-hash handle", () => {
    const m = slugPrefixMatcher(
      "auto-etch-rite-dental-etching-gel-bulk-pack-24-pack-9i0"
    )
    expect(m).toEqual({
      like: "auto-etch-rite-dental-etching-gel-bulk-pack-24-pack-%",
      regex: "^auto-etch-rite-dental-etching-gel-bulk-pack-24-pack-[a-z0-9]+$",
    })
    // The derived regex matches the live handle but not a longer-slug sibling
    // (extra slug word) — even when that sibling's own suffix is numeric.
    const re = new RegExp(m!.regex)
    expect(re.test("auto-etch-rite-dental-etching-gel-bulk-pack-24-pack-093332")).toBe(true)
    expect(
      re.test("auto-etch-rite-dental-etching-gel-bulk-pack-24-pack-deluxe-093332")
    ).toBe(false)
    expect(
      re.test("auto-etch-rite-dental-etching-gel-bulk-pack-24-pack-jumbo-2bacd1")
    ).toBe(false)
  })

  it("returns null when there is no hyphen-delimited suffix to strip", () => {
    // msp_ ids are underscore-delimited (handled by their own branch upstream).
    expect(slugPrefixMatcher("msp_supplier_product_123")).toBeNull()
    expect(slugPrefixMatcher("single")).toBeNull()
    expect(slugPrefixMatcher("")).toBeNull()
  })
})
