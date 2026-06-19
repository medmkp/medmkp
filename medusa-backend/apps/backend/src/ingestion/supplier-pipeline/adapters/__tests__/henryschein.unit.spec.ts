import {
  extractHenryScheinCategoryLinks,
  extractHenryScheinProducts,
  henryScheinAdapter,
} from "../henryschein"

// Faithful to the real henryschein.com listing markup: one application/ld+json
// Product block per item, brand as an Organization object, sku = HS item number
// (= the REF on the box = the HIBC PCN), mpn present, and no price (gated).
const LISTING_HTML = `
<html><head>
<script type="application/ld+json">
{"@context":"http://schema.org/","@type":"Product",
 "name":"Syngauze 50 Rayon/Polyester Blend Non-Woven Sponge 4x4\\" 4pl NS Sq NWvn LF",
 "description":"Syngauze 50 Non-Woven Sponge 4x4 4ply 200/Box",
 "sku":"1014583",
 "image":"https://www.henryschein.com/Products/1014583_US_Front_01_600x600.jpg",
 "brand":{"@type":"Organization","name":"Henry Schein Inc."},
 "url":"https://www.henryschein.com/us-en/dental/p/infection-control/gauze-sponges/syngauze50-nw-4ply-ns/1014583?FullPageMode=true",
 "mpn":"2100-HS"}
</script>
<script type="application/ld+json">
{"@context":"http://schema.org/","@type":"Product",
 "name":"Ocean Pacific Elements Nitrile Exam Gloves Large Blue Non-Sterile 200/Bx",
 "description":"OPL Nitrile Exam Gloves Large",
 "sku":"1462858",
 "image":"https://www.henryschein.com/Products/1462858_US_Front_01_600x600.jpg",
 "brand":{"@type":"Organization","name":"Medicom"},
 "url":"https://www.henryschein.com/us-en/dental/p/gloves/nitrile/elements-biodeg-nitrile-glv/1462858?FullPageMode=true",
 "mpn":"OPL-BIO"}
</script>
<script type="application/ld+json">
{"@type":"BreadcrumbList","itemListElement":[]}
</script>
<script type="application/ld+json">
{"@context":"http://schema.org/","@type":"Product","name":"Syngauze duplicate","sku":"1014583","brand":"Henry Schein Inc.","url":"https://www.henryschein.com/us-en/dental/p/infection-control/gauze-sponges/x/1014583"}
</script>
</head><body></body></html>
`

describe("extractHenryScheinProducts", () => {
  const rows = extractHenryScheinProducts(LISTING_HTML)

  it("extracts every Product block (and skips non-Product JSON-LD)", () => {
    expect(rows).toHaveLength(2)
  })

  it("maps house-brand identity: sku = HS REF/HIBC PCN, mpn → manufacturer_sku, no price", () => {
    const gauze = rows.find((r) => r.sku === "1014583")!
    expect(gauze.sku).toBe("1014583") // = REF 101-4583 = HIBC PCN
    expect(gauze.manufacturer_sku).toBe("2100-HS")
    expect(gauze.brand).toBe("Henry Schein Inc.")
    expect(gauze.name).toContain("Syngauze 50")
    expect(gauze.category).toBe("Infection Control")
    expect(gauze.subcategory).toBe("Gauze Sponges")
    expect(gauze.pack_size).toBe("200/Box")
    expect(gauze.image_url).toContain("1014583_US_Front")
    expect(gauze.price_cents).toBeUndefined() // identity only — no price snapshot
  })

  it("reads the real manufacturer + MPN for distributed brands (cross-supplier match key)", () => {
    const glove = rows.find((r) => r.sku === "1462858")!
    expect(glove.brand).toBe("Medicom")
    expect(glove.manufacturer_sku).toBe("OPL-BIO")
    expect(glove.category).toBe("Gloves")
    expect(glove.subcategory).toBe("Nitrile")
  })

  it("dedupes repeated skus within a page", () => {
    expect(rows.filter((r) => r.sku === "1014583")).toHaveLength(1)
  })

  it("extracts dental category links (absolute, deduped, browse root excluded)", () => {
    const html = `
      <a href="https://www.henryschein.com/us-en/dental/c/gloves">Gloves</a>
      <a href="/us-en/dental/c/gloves/nitrile">Nitrile</a>
      <a href="/us-en/dental/c/gloves/nitrile/">Nitrile dup</a>
      <a href="/us-en/dental/c/browsesupplies?id=2">Browse root (skip)</a>
      <a href="/us-en/medical/c/other">Medical (skip)</a>`
    const links = extractHenryScheinCategoryLinks(html)
    expect(links).toContain("https://www.henryschein.com/us-en/dental/c/gloves")
    expect(links).toContain("https://www.henryschein.com/us-en/dental/c/gloves/nitrile")
    expect(links.filter((l) => l.endsWith("/gloves/nitrile"))).toHaveLength(1) // deduped
    expect(links.some((l) => l.includes("browsesupplies"))).toBe(false)
    expect(links.some((l) => l.includes("/medical/"))).toBe(false)
  })

  it("adapter matches henryschein.com candidates", () => {
    expect(
      henryScheinAdapter.matches({ url: "https://www.henryschein.com/us-en/x/1.aspx" } as any)
    ).toBe(true)
    expect(henryScheinAdapter.matches({ url: "https://dcdental.com/x" } as any)).toBe(false)
  })
})
