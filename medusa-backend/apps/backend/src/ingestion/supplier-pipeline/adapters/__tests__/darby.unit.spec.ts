import { darbyDentalAdapter } from "../darby"
import { classifySupplierUrl } from "../../url-index"
import type { ProductPageCandidate } from "../../types"

function candidate(partial: Partial<ProductPageCandidate> = {}): ProductPageCandidate {
  return {
    distributor: "Darby Dental",
    website_url: "https://www.darbydental.com",
    origin: "https://www.darbydental.com",
    prices: "Y",
    sitemap_url: "https://www.darbydental.com/media/sitemap-1-2.xml",
    url: "https://www.darbydental.com/9543404.html",
    url_type: "product",
    confidence_score: 90,
    reasons: ["test"],
    category: "",
    subcategory: "",
    ...partial,
  }
}

/**
 * Mirrors the two JSON payloads Darby emits on every product page.
 */
function darbyHtml(
  product: Record<string, unknown>,
  ga4Item: Record<string, unknown>
) {
  return `<html><head>
    <meta name="title" content="${product.name} | ${ga4Item.item_brand} | Darby Dental"/>
    <meta property="product:price:amount" content="${
      (product.pricing as Record<string, unknown>)?.regularPrice ?? ""
    }"/>
  </head><body>
    <script>
      magentoStorefrontEvents.context.setProduct(${JSON.stringify(product)})
    </script>
    <script>
      var dl4Objects = [{"pageType":"product","ecommerce":{"currency":"USD","items":[${JSON.stringify(
        ga4Item
      )}]},"event":"view_item"}];
    </script>
    <div class="sku-wrapper"><span class="mr-2">Item #:</span><span class="sku-container">${
      product.sku
    }</span></div>
  </body></html>`
}

describe("Darby Dental adapter", () => {
  it("extracts the Darby item number, mfr catalog number, brand and price", () => {
    const row = darbyDentalAdapter.extractProduct(
      candidate(),
      darbyHtml(
        {
          productId: 34690,
          name: "9543404, Mity K-Files, , #15, 6/Pkg, 21mm, 2K1015",
          sku: "9543404",
          topLevelSku: "9543404",
          productType: "simple",
          pricing: { regularPrice: 20.73, minimalPrice: null, specialPrice: null },
          canonicalUrl: "https://www.darbydental.com/9543404.html",
          mainImageUrl: "https://www.darbydental.com/media/catalog/product/1/1/11032_2k1015.jpg",
        },
        {
          item_name: "9543404, Mity K-Files, , #15, 6/Pkg, 21mm, 2K1015",
          item_id: "9543404",
          price: 20.73,
          item_brand: "JS Dental",
          item_category2: "Endodontics",
          item_stock_status: "In stock",
        }
      )
    )

    expect(row.sku).toBe("9543404")
    expect(row.manufacturer_sku).toBe("2K1015")
    expect(row.brand).toBe("JS Dental")
    expect(row.price).toBe("20.73")
    expect(row.price_basis).toBe("pack")
    expect(row.availability).toBe("in_stock")
    expect(row.category).toBe("Endodontics")
    expect(row.image_url).toContain("11032_2k1015.jpg")
    expect(row.name).not.toMatch(/^9543404/)
    expect(row.name).toMatch(/Mity K-Files/)
    expect((row.raw as Record<string, unknown>).extracted_by).toBe("darby")
  })

  it("prefers the special price when present", () => {
    const row = darbyDentalAdapter.extractProduct(
      candidate(),
      darbyHtml(
        {
          name: "5259763, Aurelia Nitrile Gloves, X-Small, 100/Box, 17765",
          sku: "5259763",
          productType: "simple",
          pricing: { regularPrice: 15.25, specialPrice: 11.99 },
          canonicalUrl: "https://www.darbydental.com/5259763.html",
          mainImageUrl: "",
        },
        {
          item_name: "5259763, Aurelia Nitrile Gloves, X-Small, 100/Box, 17765",
          item_brand: "Aurelia",
          item_category2: "Gloves",
          item_stock_status: "In stock",
        }
      )
    )

    expect(row.price).toBe("11.99")
    expect(row.manufacturer_sku).toBe("17765")
    expect(row.brand).toBe("Aurelia")
  })

  it("leaves manufacturer_sku empty when the trailing token is a size, not a catalog number", () => {
    const row = darbyDentalAdapter.extractProduct(
      candidate(),
      darbyHtml(
        {
          name: "8000001, Some Generic Tip, 21mm",
          sku: "8000001",
          productType: "simple",
          pricing: { regularPrice: 5.0 },
          canonicalUrl: "https://www.darbydental.com/8000001.html",
        },
        { item_brand: "", item_category2: "Misc", item_stock_status: "In stock" }
      )
    )

    expect(row.manufacturer_sku).toBeUndefined()
    expect(row.name).toMatch(/21mm/)
  })

  it("matches Darby product URLs and distributor names", () => {
    expect(darbyDentalAdapter.matches(candidate())).toBe(true)
    expect(
      darbyDentalAdapter.matches(
        candidate({ url: "https://example.com/x", distributor: "Darby" })
      )
    ).toBe(true)
    expect(
      darbyDentalAdapter.matches(
        candidate({ url: "https://www.dcdental.com/x", distributor: "DC Dental" })
      )
    ).toBe(false)
  })
})

describe("Darby URL classification", () => {
  it("classifies numeric item-number URLs as products", () => {
    expect(classifySupplierUrl("https://www.darbydental.com/9543404.html").url_type).toBe(
      "product"
    )
    expect(classifySupplierUrl("https://www.darbydental.com/5259695-01.html").url_type).toBe(
      "product"
    )
  })

  it("classifies /categories URLs as categories, not products", () => {
    expect(classifySupplierUrl("https://www.darbydental.com/categories/gloves.html").url_type).toBe(
      "category"
    )
    expect(classifySupplierUrl("https://www.darbydental.com/categories.html").url_type).toBe(
      "category"
    )
  })
})
