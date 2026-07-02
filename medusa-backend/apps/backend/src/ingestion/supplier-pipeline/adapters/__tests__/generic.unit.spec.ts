import { genericAdapter, genericCategory } from "../generic"
import type { ProductPageCandidate } from "../../types"

function candidate(partial: Partial<ProductPageCandidate> = {}): ProductPageCandidate {
  return {
    distributor: "Young Specialties",
    website_url: "https://www.youngspecialties.com",
    origin: "https://www.youngspecialties.com",
    prices: "Y",
    sitemap_url: "https://www.youngspecialties.com/sitemap.xml",
    url: "https://www.youngspecialties.com/product/orapro-kelly-forceps-5-5-straight/",
    url_type: "product",
    confidence_score: 90,
    reasons: ["test"],
    category: "",
    subcategory: "",
    ...partial,
  }
}

// The real shape Young Specialties (WooCommerce) renders: no category in the
// Product JSON-LD, but a full visible breadcrumb whose deepest link is the
// category. Before the fix the adapter stamped the distributor name, which the
// catalog read models treat as junk and hide.
const wooBreadcrumbHtml = `<html><body>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "ORAPRO Kelly Forceps 5.5in Straight",
    sku: "875-305U",
  })}</script>
  <div class="woocommerce-breadcrumb-wrapper">
    <nav class="woocommerce-breadcrumb" aria-label="Breadcrumb">
      <a href="https://www.youngspecialties.com/shop/">All Products</a>&nbsp;/&nbsp;
      <a href="https://www.youngspecialties.com/product-category/orthodontics/">Orthodontics</a>&nbsp;/&nbsp;
      <a href="https://www.youngspecialties.com/product-category/orthodontics/orthodontic-instruments/">Orthodontic Instruments</a>&nbsp;/&nbsp;ORAPRO Kelly Forceps 5.5in Straight
    </nav>
  </div>
</body></html>`

describe("generic adapter category extraction", () => {
  it("reads the deepest category from a WooCommerce breadcrumb nav", () => {
    expect(genericCategory(wooBreadcrumbHtml, undefined)).toBe("Orthodontic Instruments")
  })

  it("uses the breadcrumb category on the extracted row, not the distributor", () => {
    const row = genericAdapter.extractProduct(candidate(), wooBreadcrumbHtml)
    expect(row.category).toBe("Orthodontic Instruments")
  })

  it("takes the penultimate crumb from a BreadcrumbList JSON-LD", () => {
    const html = `<html><body><script type="application/ld+json">${JSON.stringify({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, item: { name: "Home" } },
        { "@type": "ListItem", position: 2, item: { name: "Instruments" } },
        { "@type": "ListItem", position: 3, item: { name: "Forceps" } },
        { "@type": "ListItem", position: 4, item: { name: "Kelly Forceps 5.5in" } },
      ],
    })}</script></body></html>`
    expect(genericCategory(html, undefined)).toBe("Forceps")
  })

  it("prefers an explicit Schema.org Product.category", () => {
    expect(genericCategory("<html></html>", { category: "Sterilization" })).toBe("Sterilization")
  })

  it("falls back to the distributor name when the page has no breadcrumb", () => {
    const row = genericAdapter.extractProduct(candidate(), "<html><body>no crumbs</body></html>")
    expect(row.category).toBe("Young Specialties")
  })

  it("ignores breadcrumb root labels like 'All Products'", () => {
    const html = `<nav class="breadcrumb"><a href="/shop/">All Products</a> / Some Product</nav>`
    expect(genericCategory(html, undefined)).toBe("")
  })
})
