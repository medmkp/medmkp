import { adapterForCandidate } from "../index"
import { shopifyAdapter } from "../shopify"
import type { ProductPageCandidate } from "../../types"

function candidate(partial: Partial<ProductPageCandidate> = {}): ProductPageCandidate {
  return {
    distributor: "DDI Supply",
    website_url: "https://thedentaldistributors.com",
    origin: "https://thedentaldistributors.com",
    prices: "Y",
    sitemap_url: "https://thedentaldistributors.com/sitemap_products_1.xml",
    url: "https://thedentaldistributors.com/products/implacare-ii",
    url_type: "product",
    confidence_score: 90,
    reasons: ["test"],
    category: "Dental supplies",
    subcategory: "",
    ...partial,
  }
}

describe("Shopify adapter matching", () => {
  it("matches DDI Supply product URLs (thedentaldistributors.com and the ddisupply.com alias)", () => {
    expect(shopifyAdapter.matches(candidate())).toBe(true)
    expect(
      shopifyAdapter.matches(
        candidate({ url: "https://ddisupply.com/products/implacare-ii" })
      )
    ).toBe(true)
  })

  it("matches DDI Supply by distributor name regardless of URL", () => {
    expect(
      shopifyAdapter.matches(
        candidate({ distributor: "DDI Supply", url: "https://supplier.test/x" })
      )
    ).toBe(true)
    expect(
      shopifyAdapter.matches(
        candidate({ distributor: "Dental Distributors, Inc.", url: "https://supplier.test/x" })
      )
    ).toBe(true)
  })

  it("routes DDI Supply candidates to the Shopify adapter so the full /products.json catalog path runs", () => {
    expect(adapterForCandidate(candidate()).id).toBe("shopify")
  })

  it("matches Davis Dental Supply product URLs and distributor name (Shopify, CF-fronted)", () => {
    expect(
      shopifyAdapter.matches(
        candidate({
          distributor: "Davis Dental Supply",
          url: "https://davisdentalsupply.com/products/some-item",
        })
      )
    ).toBe(true)
    expect(
      shopifyAdapter.matches(
        candidate({
          distributor: "Davis Dental Supply",
          url: "https://www.davisdentalsupply.com/products/some-item",
        })
      )
    ).toBe(true)
    expect(
      shopifyAdapter.matches(
        candidate({ distributor: "Davis Dental Supply", url: "https://supplier.test/x" })
      )
    ).toBe(true)
  })

  it("routes Davis Dental Supply candidates to the Shopify adapter so the full /products.json catalog path runs", () => {
    expect(
      adapterForCandidate(
        candidate({
          distributor: "Davis Dental Supply",
          url: "https://davisdentalsupply.com/products/some-item",
        })
      ).id
    ).toBe("shopify")
  })

  it("still matches the existing Shopify-sourced suppliers", () => {
    expect(
      shopifyAdapter.matches(
        candidate({
          distributor: "American Dental Accessories",
          url: "https://amerdental.com/products/test-product",
        })
      )
    ).toBe(true)
    expect(
      shopifyAdapter.matches(
        candidate({
          distributor: "Carolina Dental Supply",
          url: "https://carolinadental.com/products/test-product",
        })
      )
    ).toBe(true)
  })

  it("does not claim unrelated supplier URLs", () => {
    expect(
      shopifyAdapter.matches(
        candidate({ distributor: "Some Other Supplier", url: "https://example.com/products/x" })
      )
    ).toBe(false)
  })
})
