import { alibabaProvider } from "../providers/alibaba"
import { amazonProvider } from "../providers/amazon"
import { conflictsOnProductAxis, resultToRow, searchCanonicalOnMarketplace } from "../search"
import type { MarketplaceFetcher } from "../types"

const ALIBABA_HTML = `
  <h2 class="search-card-e-title">
    <a href="https://www.alibaba.com/product-detail/Dental-Composite-Resin_1600999.html?spm=a">Dental Composite Resin Kit</a>
  </h2>
  <a class="slider" href="https://www.alibaba.com/product-detail/Dental-Composite-Resin_1600999.html?spm=a">
    <img class="search-card-e-slider__img" src="//s.alicdn.com/kf/H99.jpg">
  </a>
  <div class="search-card-e-price-main">US $2.00 - $5.00</div>
`

function stubFetcher(body: string, overrides = {}): MarketplaceFetcher {
  return async (url) => ({
    url,
    final_url: url,
    status: 200,
    ok: true,
    body,
    blocked: false,
    ...overrides,
  })
}

const canonical = {
  id: "mcp_composite_resin",
  name: "Composite Resin",
  category: "Restorative",
  unit_of_measure: "syringe",
}

describe("searchCanonicalOnMarketplace", () => {
  it("maps marketplace results into canonical-tagged rows", async () => {
    const result = await searchCanonicalOnMarketplace(
      alibabaProvider,
      stubFetcher(ALIBABA_HTML),
      canonical,
      { maxResults: 3 }
    )

    expect(result.query).toBe("Composite Resin")
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row.sku).toBe("alibaba:1600999")
    expect(row.canonical_product_id).toBe("mcp_composite_resin")
    expect(row.image_url).toBe("https://s.alicdn.com/kf/H99.jpg")
    expect(row.price_cents).toBe(200)
    expect(row.category).toBe("Restorative")
    expect(row.canonical_match_status).toBe("exact") // both canonical tokens present
  })

  it("returns no rows when the fetch is anti-bot blocked", async () => {
    const result = await searchCanonicalOnMarketplace(
      alibabaProvider,
      stubFetcher("<title>Captcha Interception</title>", { blocked: true }),
      canonical
    )

    expect(result.blocked).toBe(true)
    expect(result.rows).toHaveLength(0)
  })

  it("resolves relative hrefs against the marketplace URL, not the scraper proxy", async () => {
    // Through a scraper proxy, final_url is the proxy; relative Amazon hrefs must
    // still resolve to amazon.com, not the proxy host.
    const proxyFetcher: MarketplaceFetcher = async (url) => ({
      url,
      final_url: "https://api.scraperapi.com/?api_key=x&url=" + encodeURIComponent(url),
      status: 200,
      ok: true,
      blocked: false,
      body: `
        <a href="/Bur-Block/dp/B0D7QTDD94/ref=sr_1_1"><img class="s-image" src="https://m.media-amazon.com/images/I/51X2.jpg"></a>
        <h2><a href="/Bur-Block/dp/B0D7QTDD94/ref=sr_1_1"><span>Dental Bur Block 8 Hole</span></a></h2>
        <span class="a-price"><span class="a-offscreen">$19.36</span></span>
      `,
    })

    const result = await searchCanonicalOnMarketplace(amazonProvider, proxyFetcher, canonical)
    expect(result.rows[0].product_url).toBe(
      "https://www.amazon.com/Bur-Block/dp/B0D7QTDD94/ref=sr_1_1"
    )
    expect(result.rows[0].sku).toBe("amazon:B0D7QTDD94")
    expect(result.rows[0].price_cents).toBe(1936)
  })

  it("applies a query prefix", async () => {
    const result = await searchCanonicalOnMarketplace(
      alibabaProvider,
      stubFetcher(""),
      canonical,
      { queryPrefix: "dental " }
    )
    expect(result.query).toBe("dental Composite Resin")
  })
})

describe("resultToRow", () => {
  it("grades a weak title overlap as needs_review but still attaches the canonical", () => {
    const row = resultToRow(alibabaProvider, canonical, {
      title: "Generic Plastic Tray",
      product_url: "https://www.alibaba.com/product-detail/tray_222222.html",
      image_url: "",
    })
    expect(row.canonical_match_status).toBe("needs_review")
    expect(row.canonical_product_id).toBe("mcp_composite_resin")
  })
})

// The substitute tier was promoted on title-token overlap alone, which lets a
// listing that shares a brand + a few generic words through even when it is a
// different size or shade. `conflictsOnProductAxis` is the structural veto: it
// fires when the canonical name and listing title disagree on a product-defining
// numeric axis (size / shade / gauge / measure / catalog #). Cosmetic color is
// ignored. Each conflicting pair below is a real over-promotion from the #286
// audit; the accepted ones are still-valid substitutes.
describe("conflictsOnProductAxis", () => {
  it("flags wrong glove size (Large vs XX-Large)", () => {
    expect(
      conflictsOnProductAxis(
        "Purple MAX Nitrile Exam Gloves Large",
        "Aurelia Ignite Nitrile Exam Glove, Orange, XX-Large"
      )
    ).toBe(true)
  })

  it("flags wrong glove size (X-Small vs Extra Large)", () => {
    expect(
      conflictsOnProductAxis(
        "Cranberry Inspire Nitrile Exam Gloves X-Small",
        "Inspire, Extra Large, Nitrile Exam Gloves"
      )
    ).toBe(true)
  })

  it("flags wrong glove size (Small vs X-Large)", () => {
    expect(
      conflictsOnProductAxis(
        "Ultra One Latex Exam Gloves - Small",
        "Ultra One Latex glove: X-Large"
      )
    ).toBe(true)
  })

  it("flags a wrong composite/ionomer shade (A1 vs B1)", () => {
    expect(
      conflictsOnProductAxis(
        "Riva Light Cure HV Glass Ionomer Capsule A1",
        "Riva LC HV B1 Caps"
      )
    ).toBe(true)
  })

  it("flags a wrong measured length (Peeso Reamer 28mm vs 32mm)", () => {
    expect(
      conflictsOnProductAxis(
        "Peeso Reamers, #1-6, 6/Pkg, 28 mm",
        "SUPPRA Stainless Steel Peeso Reamer, #1 - 6, 32mm, Asst, 6/Pk"
      )
    ).toBe(true)
  })

  it("flags a wrong catalog/mold number (Crown Refill #69 vs #50)", () => {
    expect(
      conflictsOnProductAxis(
        "Polycarbonate Crown Refill #69 Pkg. 5",
        "Directa Temporary Crowns Refill, Polycarbonate, #50"
      )
    ).toBe(true)
  })

  it("ignores a cosmetic color-only difference (same size gloves)", () => {
    // A different glove color is still a usable substitute, so it must NOT be
    // vetoed (color is the only cosmetic axis we exclude).
    expect(
      conflictsOnProductAxis(
        "Nitrile Exam Gloves Blue Large",
        "Nitrile Exam Gloves Purple Large"
      )
    ).toBe(false)
  })

  it("does not flag a matching size (genuine cross-brand substitute)", () => {
    expect(
      conflictsOnProductAxis(
        "Purple MAX Nitrile Exam Gloves Large",
        "Aurelia Nitrile Exam Gloves Large"
      )
    ).toBe(false)
  })

  it("does not flag when neither side specifies the axis", () => {
    expect(
      conflictsOnProductAxis("Composite Polishing Disc Kit", "Generic Polishing Discs Assorted")
    ).toBe(false)
  })
})

describe("resultToRow substitute gate wiring", () => {
  it("downgrades a substitute-tier listing with a conflicting size", () => {
    const row = resultToRow(
      alibabaProvider,
      { id: "mcp_glove_l", name: "Purple MAX Nitrile Exam Gloves Large" },
      {
        title: "Aurelia Ignite Nitrile Exam Glove, Orange, XX-Large",
        product_url: "https://www.alibaba.com/product-detail/glove_100001.html",
        image_url: "",
      }
    )
    // Title overlap alone would grade this a substitute...
    expect(row.canonical_match_confidence).toBeGreaterThanOrEqual(30)
    expect(row.canonical_match_confidence).toBeLessThan(55)
    // ...but the size conflict downgrades it short of the reorder drawer.
    expect(row.canonical_match_status).toBe("needs_review")
    expect(row.canonical_match_reason).toMatch(/downgraded/)
  })

  it("keeps a substitute-tier listing with no axis conflict", () => {
    const row = resultToRow(
      alibabaProvider,
      { id: "mcp_glove_l", name: "Purple MAX Nitrile Exam Gloves Large" },
      {
        title: "Nitrile Gloves Large",
        product_url: "https://www.alibaba.com/product-detail/glove_100002.html",
        image_url: "",
      }
    )
    expect(row.canonical_match_confidence).toBeGreaterThanOrEqual(30)
    expect(row.canonical_match_confidence).toBeLessThan(55)
    expect(row.canonical_match_status).toBe("substitute")
  })
})
