import {
  dedupeResults,
  marketplaceProductId,
  normalizeProductUrl,
  parseJsonLdResults,
  parseMoney,
  parseProximityCards,
  parseSplitPriceSpans,
  titleOverlapConfidence,
} from "../parse"
import { ALIBABA_DETAIL_PATTERN } from "../providers/alibaba"
import { AMAZON_DETAIL_PATTERN } from "../providers/amazon"

describe("parseSplitPriceSpans", () => {
  // Amazon's no-JS price markup, split across spans (no clean a-offscreen).
  const split = (symbol: string, whole: string, frac: string) =>
    `<span class="a-price-symbol">${symbol}</span>` +
    `<span class="a-price-whole">${whole}<span class="a-price-decimal">.</span></span>` +
    `<span class="a-price-fraction">${frac}</span>`

  it("reconstructs whole+fraction (keeps the cents stripTags would drop)", () => {
    expect(parseSplitPriceSpans(split("$", "86", "98"))).toMatchObject({
      price_cents: 8698,
      currency: "USD",
    })
  })

  it("handles thousands separators", () => {
    expect(parseSplitPriceSpans(split("$", "1,299", "50"))).toMatchObject({
      price_cents: 129950,
    })
  })

  it("ignores non-USD symbols so a mis-geo'd exit yields no price", () => {
    expect(parseSplitPriceSpans(split("NOK", "86", "98"))).toBeUndefined()
  })

  it("returns undefined when there is no split price", () => {
    expect(parseSplitPriceSpans("<div>no price here</div>")).toBeUndefined()
  })
})

describe("parseMoney", () => {
  it("parses a single US dollar price to cents", () => {
    expect(parseMoney("$24.99")).toMatchObject({ price_cents: 2499, currency: "USD" })
  })

  it("keeps the low end of a range and strips thousands separators", () => {
    expect(parseMoney("US $1.20 - $3.40")).toMatchObject({
      price_cents: 120,
      currency: "USD",
    })
    expect(parseMoney("$1,299.00")).toMatchObject({ price_cents: 129900 })
  })

  it("returns undefined when no currency-marked price is present", () => {
    expect(parseMoney("Min. order: 100 pieces")).toBeUndefined()
  })

  it("skips per-unit prices and keeps the headline price", () => {
    // Amazon shows "$45.99 ($0.09/Count)" — we want the purchase price.
    expect(parseMoney("$45.99 ($0.09/Count)")).toMatchObject({ price_cents: 4599 })
    expect(parseMoney("$8.99$8.99 ($0.09 / Count)")).toMatchObject({ price_cents: 899 })
  })

  it("returns undefined when only a per-unit price is present", () => {
    expect(parseMoney("$0.09/Count")).toBeUndefined()
  })
})

describe("marketplaceProductId", () => {
  it("extracts an Alibaba listing id", () => {
    expect(
      marketplaceProductId(
        "https://www.alibaba.com/product-detail/Dental-Composite_1600123456789.html?spm=a2700"
      )
    ).toBe("1600123456789")
  })

  it("extracts an Amazon ASIN", () => {
    expect(
      marketplaceProductId("https://www.amazon.com/Dental-Composite/dp/B0ABCDE123/ref=sr_1_1")
    ).toBe("B0ABCDE123")
  })

  it("falls back to a stable hash when no native id exists", () => {
    const a = marketplaceProductId("https://example.com/listing/abc")
    const b = marketplaceProductId("https://example.com/listing/abc?utm=1")
    expect(a).toBe(b) // query-insensitive
    expect(a).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe("titleOverlapConfidence", () => {
  it("scores full token coverage as 100", () => {
    expect(
      titleOverlapConfidence("Dental Composite Resin Kit", "composite resin")
    ).toBe(100)
  })

  it("scores partial coverage proportionally", () => {
    expect(titleOverlapConfidence("Nitrile Gloves", "nitrile exam gloves")).toBe(67)
  })
})

describe("normalizeProductUrl", () => {
  it("drops query and hash", () => {
    expect(
      normalizeProductUrl("https://www.alibaba.com/product-detail/x_1.html?spm=a#top")
    ).toBe("https://www.alibaba.com/product-detail/x_1.html")
  })
})

describe("parseProximityCards (Alibaba shape)", () => {
  const baseUrl = "https://www.alibaba.com/trade/search?SearchText=dental"
  const href =
    "https://www.alibaba.com/product-detail/Dental-Composite-Resin-Kit_1600123456789.html?spm=a2700.tracking"
  const html = `
    <div class="fy23-search-card">
      <a class="search-card-e-slider__link" href="${href}">
        <div class="search-card-e-slider__wrapper">
          <img class="search-card-e-slider__img" src="//s.alicdn.com/@sc04/kf/H1234.jpg_300x300.jpg">
        </div>
      </a>
      <h2 class="search-card-e-title">
        <a href="${href}">Dental Composite Resin Kit Light Cure</a>
      </h2>
      <div class="search-card-e-price-main">US $1.20 - $3.40</div>
    </div>
  `

  it("extracts title, image, price and product url from the card", () => {
    const results = parseProximityCards(html, baseUrl, {
      detailUrlPattern: ALIBABA_DETAIL_PATTERN,
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      title: "Dental Composite Resin Kit Light Cure",
      image_url: "https://s.alicdn.com/@sc04/kf/H1234.jpg_300x300.jpg",
      price_cents: 120,
      currency: "USD",
    })
    expect(results[0].product_url).toContain("/product-detail/")
  })

  it("prefers the lazy data-src over a placeholder gif in src", () => {
    const lazyHtml = `
      <h2 class="search-card-e-title"><a href="${href}">Composite Resin</a></h2>
      <a class="slider" href="${href}">
        <img class="search-card-e-slider__img"
             src="//s.alicdn.com/@sc01/O1CN01x_!!6000000-1-tps-196-196.gif"
             data-src="//s.alicdn.com/@sc04/kf/Hreal-product-photo.jpg_350x350.jpg">
      </a>
    `
    const results = parseProximityCards(lazyHtml, baseUrl, {
      detailUrlPattern: ALIBABA_DETAIL_PATTERN,
    })
    expect(results[0].image_url).toBe(
      "https://s.alicdn.com/@sc04/kf/Hreal-product-photo.jpg_350x350.jpg"
    )
  })
})

describe("parseProximityCards (Amazon shape)", () => {
  const baseUrl = "https://www.amazon.com/s?k=dental+composite"
  const href = "/Dental-Composite-Syringe/dp/B0ABCDE123/ref=sr_1_1"
  const html = `
    <div data-component-type="s-search-result" data-asin="B0ABCDE123">
      <a class="a-link-normal s-no-outline" href="${href}">
        <img class="s-image" src="https://m.media-amazon.com/images/I/71abc.jpg">
      </a>
      <h2 class="a-size-mini"><a class="a-link-normal" href="${href}"><span>Dental Composite Syringe 4g</span></a></h2>
      <span class="a-price"><span class="a-offscreen">$24.99</span></span>
    </div>
  `

  it("extracts an Amazon result card", () => {
    const results = parseProximityCards(html, baseUrl, {
      detailUrlPattern: AMAZON_DETAIL_PATTERN,
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      title: "Dental Composite Syringe 4g",
      image_url: "https://m.media-amazon.com/images/I/71abc.jpg",
      price_cents: 2499,
    })
    expect(results[0].product_url).toContain("/dp/B0ABCDE123")
  })

  it("keeps the headline price (not the per-unit) and drops junk variant links", () => {
    const withUnitPriceAndJunk = `
      <a class="a-link-normal" href="/Gloves/dp/B0REAL00001/ref=sr_1_1">
        <img class="s-image" src="https://m.media-amazon.com/images/I/71real.jpg">
      </a>
      <h2><a class="a-link-normal" href="/Gloves/dp/B0REAL00001/ref=sr_1_1"><span>Nitrile Exam Gloves 100 Count Box</span></a></h2>
      <span class="a-price"><span class="a-offscreen">$45.99</span></span>
      <span class="a-price a-text-price"><span class="a-offscreen">$0.46</span></span><span class="a-size-base">/Count</span>
      <a class="a-link-normal" href="/Gloves/dp/B0VARIANT99/ref=sr_swatch"><span>9 sizes</span></a>
    `
    const results = parseProximityCards(withUnitPriceAndJunk, baseUrl, {
      detailUrlPattern: AMAZON_DETAIL_PATTERN,
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      title: "Nitrile Exam Gloves 100 Count Box",
      price_cents: 4599,
    })
  })

  it("drops a card whose only detail link wraps the price block (no product name)", () => {
    // Amazon sometimes makes the price itself a /dp/ link; its inner text is the
    // split-span price ("$11.50 $ 11 . 50"), which was being ingested verbatim as
    // the product name — 244 such Amazon canonicals shipped to the catalog.
    const priceAsTitle = `
      <a class="a-link-normal" href="/dp/B0PRICE0001/ref=sr_1_1"><span class="a-offscreen">$11.50</span><span class="a-price-symbol">$</span><span class="a-price-whole">11<span class="a-price-decimal">.</span></span><span class="a-price-fraction">50</span></a>
    `
    const results = parseProximityCards(priceAsTitle, baseUrl, {
      detailUrlPattern: AMAZON_DETAIL_PATTERN,
    })

    expect(results).toHaveLength(0)
  })

  it("recovers the real name from title=/alt= when the link wraps only the price", () => {
    const priceLinkWithAltName = `
      <div data-asin="B0PRICE0002">
        <a class="a-link-normal" title="Prophy Paste Medium Mint 200/Box" href="/dp/B0PRICE0002/ref=sr_1_1"><span class="a-price-symbol">$</span><span class="a-price-whole">27<span class="a-price-decimal">.</span></span><span class="a-price-fraction">95</span><span class="a-size-base"> ( $1.50 /fluid ounce)</span></a>
      </div>
    `
    const results = parseProximityCards(priceLinkWithAltName, baseUrl, {
      detailUrlPattern: AMAZON_DETAIL_PATTERN,
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      title: "Prophy Paste Medium Mint 200/Box",
      price_cents: 2795,
    })
  })
})

describe("parseJsonLdResults", () => {
  it("reads schema.org ItemList of products", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "item": {
              "@type": "Product",
              "name": "Composite Resin A2",
              "url": "https://www.alibaba.com/product-detail/x_111.html",
              "image": "https://s.alicdn.com/a.jpg",
              "offers": { "@type": "Offer", "price": "2.50", "priceCurrency": "USD" }
            }
          }
        ]
      }
      </script>`

    const results = parseJsonLdResults(html, "https://www.alibaba.com")
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      title: "Composite Resin A2",
      image_url: "https://s.alicdn.com/a.jpg",
      price_cents: 250,
      currency: "USD",
    })
  })
})

describe("dedupeResults", () => {
  it("merges by normalized url, back-filling missing image/price", () => {
    const merged = dedupeResults([
      [
        {
          title: "Composite",
          product_url: "https://x.com/dp/A?ref=1",
          image_url: "",
        },
      ],
      [
        {
          title: "Composite",
          product_url: "https://x.com/dp/A?ref=2",
          image_url: "https://x.com/img.jpg",
          price_cents: 500,
          currency: "USD",
        },
      ],
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      image_url: "https://x.com/img.jpg",
      price_cents: 500,
    })
  })
})
