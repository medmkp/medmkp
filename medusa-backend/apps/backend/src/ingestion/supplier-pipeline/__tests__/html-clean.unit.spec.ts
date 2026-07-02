import {
  cleanProductName,
  decodeHtml,
  decodeHtmlEntities,
  isJunkProductName,
  normalizeText,
} from "../html"

describe("decodeHtmlEntities", () => {
  it("decodes the named entities the old decoder already handled", () => {
    expect(decodeHtmlEntities("A &amp; B")).toBe("A & B")
    expect(decodeHtmlEntities("3&quot; tip")).toBe('3" tip')
    expect(decodeHtmlEntities("Dr&#39;s choice")).toBe("Dr's choice")
  })

  it("decodes numeric decimal and hex entities", () => {
    expect(decodeHtmlEntities("Kerr&#8482;")).toBe("Kerr™")
    expect(decodeHtmlEntities("Wands&#xae; Refills")).toBe("Wands® Refills")
    expect(decodeHtmlEntities("don&#8217;t")).toBe("don’t")
  })

  it("decodes common named symbol entities", () => {
    expect(decodeHtmlEntities("Kerr&trade;")).toBe("Kerr™")
    expect(decodeHtmlEntities("Garrison&reg;")).toBe("Garrison®")
    expect(decodeHtmlEntities("XP&sup2;")).toBe("XP²")
  })

  it("leaves unknown entities untouched", () => {
    expect(decodeHtmlEntities("a &bogus; b")).toBe("a &bogus; b")
  })
})

describe("normalizeText", () => {
  it("strips U+FFFD replacement characters", () => {
    expect(normalizeText("Calset� Composite Tray")).toBe("Calset Composite Tray")
  })

  it("folds smart quotes to ASCII", () => {
    expect(normalizeText("“Mega” Dr’s")).toBe('"Mega" Dr\'s')
  })

  it("folds the non-breaking hyphen to a plain hyphen", () => {
    expect(normalizeText("Quik‑Tip")).toBe("Quik-Tip")
  })

  it("folds non-breaking and exotic spaces and collapses whitespace", () => {
    expect(normalizeText("A  B   C")).toBe("A B C")
  })

  it("removes zero-width characters", () => {
    expect(normalizeText("Bur​s")).toBe("Burs")
  })

  it("keeps legitimate symbols and accented letters intact", () => {
    expect(normalizeText("Kerr™ Wands® XP² café")).toBe(
      "Kerr™ Wands® XP² café"
    )
  })
})

describe("decodeHtml (entities + normalization together)", () => {
  it("handles a realistic mangled product name", () => {
    expect(decodeHtml("UNiPACK&#8482; SLDR  PSP Barrier&nbsp;Envelopes")).toBe(
      "UNiPACK™ SLDR PSP Barrier Envelopes"
    )
  })

  it("recovers entity-encoded smart quotes as straight quotes", () => {
    expect(decodeHtml("Great White Shark&#8217;s Gel")).toBe("Great White Shark's Gel")
  })
})

describe("cleanProductName", () => {
  it("folds '?' mojibake (lost charset bytes) to spaces", () => {
    expect(cleanProductName("Nitrile?Gloves")).toBe("Nitrile Gloves")
    expect(cleanProductName("ValuMax - Easybreathe Jackets?10Pk White Xl")).toBe(
      "ValuMax - Easybreathe Jackets 10Pk White Xl"
    )
  })

  it("drops a trademark '?' and tidies spacing before punctuation", () => {
    expect(cleanProductName("Sensodyne? Fresh Mint")).toBe("Sensodyne Fresh Mint")
    expect(cleanProductName("Surgical Gloves, Size 6?, 50 pr/bx")).toBe(
      "Surgical Gloves, Size 6, 50 pr/bx"
    )
  })

  it("strips a redundant trailing variation suffix", () => {
    expect(
      cleanProductName(
        "HSB?- Nitrile?Gloves, Blue, X-Large 100/Bx - Blue / X-Large / 100/Bx"
      )
    ).toBe("HSB - Nitrile Gloves, Blue, X-Large 100/Bx")
  })

  it("keeps a trailing suffix when an option is not echoed earlier", () => {
    // "200/pack" is not in the title (it says "200/Bx"), so leave the suffix.
    const name =
      "HSB - Self-Sealing Pouch 200/Bx - Blue Film / 2.75 x 10 / 200/pack"
    expect(cleanProductName(name)).toBe(name)
  })

  it("keeps single-option trailing suffixes intact", () => {
    expect(cleanProductName("VITA Toothguide 3D-Master - Each")).toBe(
      "VITA Toothguide 3D-Master - Each"
    )
  })

  it("is idempotent on already-clean names", () => {
    const clean = "HSB - Nitrile Gloves, Blue, X-Large 100/Bx"
    expect(cleanProductName(clean)).toBe(clean)
  })
})

describe("isJunkProductName", () => {
  it("rejects the exact scraper artifacts that leaked into the catalog (#606)", () => {
    expect(isJunkProductName("Debug info copied.")).toBe(true)
    expect(isJunkProductName("Ea")).toBe(true)
  })

  it("rejects empty / too-short names", () => {
    expect(isJunkProductName("")).toBe(true)
    expect(isJunkProductName("   ")).toBe(true)
    expect(isJunkProductName("Bx")).toBe(true)
    expect(isJunkProductName("KT")).toBe(true)
    expect(isJunkProductName("Kit")).toBe(true)
  })

  it("rejects bare unit-of-measure / packaging tokens", () => {
    expect(isJunkProductName("Each")).toBe(true)
    expect(isJunkProductName("each")).toBe(true)
    expect(isJunkProductName("Box")).toBe(true)
    expect(isJunkProductName("Pkg")).toBe(true)
    expect(isJunkProductName("Pack")).toBe(true)
    expect(isJunkProductName("Case")).toBe(true)
  })

  it("keeps real product names", () => {
    expect(isJunkProductName("Cotton Gauze Sponge 4x4")).toBe(false)
    expect(isJunkProductName("Floss")).toBe(false)
    expect(isJunkProductName("HSB - Nitrile Gloves, Blue, X-Large 100/Bx")).toBe(
      false
    )
    // A real name that merely ends in a UOM token is not junk.
    expect(isJunkProductName("Prophy Paste Each")).toBe(false)
  })
})
