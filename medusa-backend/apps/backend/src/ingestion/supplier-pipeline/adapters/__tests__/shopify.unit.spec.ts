import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { adapterForCandidate } from "../index"
import { loadShopifyConfigs, makeShopifyRouter } from "../shopify-config"
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

describe("makeShopifyRouter", () => {
  const router = makeShopifyRouter([
    {
      supplier_id: "msup_example_com",
      origin: "https://example-dental.com",
      origin_aliases: ["https://example-dental-alias.com"],
      distributor_aliases: ["example dental co"],
    },
  ])

  it("keeps id 'shopify' so the downstream products.json gate still fires", () => {
    expect(router.id).toBe("shopify")
  })

  it("routes by origin host (apex and subdomain)", () => {
    expect(
      router.matches(candidate({ distributor: "Whoever", url: "https://example-dental.com/products/x" }))
    ).toBe(true)
    expect(
      router.matches(candidate({ distributor: "Whoever", url: "https://www.example-dental.com/products/x" }))
    ).toBe(true)
  })

  it("routes by an origin alias host (e.g. a 301 domain)", () => {
    expect(
      router.matches(candidate({ distributor: "Whoever", url: "https://example-dental-alias.com/products/x" }))
    ).toBe(true)
  })

  it("routes by distributor alias regardless of URL", () => {
    expect(
      router.matches(candidate({ distributor: "Example Dental Co., Inc.", url: "https://supplier.test/x" }))
    ).toBe(true)
  })

  it("does not claim unrelated candidates", () => {
    expect(
      router.matches(candidate({ distributor: "Some Other Supplier", url: "https://example.com/products/x" }))
    ).toBe(false)
  })

  it("validates fail-closed: the loader throws on a platform:shopify entry with a bad origin", () => {
    const dir = mkdtempSync(join(tmpdir(), "shopify-config-"))
    try {
      writeFileSync(
        join(dir, "broken-catalog-sources.json"),
        JSON.stringify([{ supplier_id: "msup_broken", platform: "shopify", origin: "not-a-url" }])
      )
      expect(() => loadShopifyConfigs(dir)).toThrow(/origin/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("ignores entries that omit platform, even alongside a valid shopify entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "shopify-config-"))
    try {
      writeFileSync(
        join(dir, "mixed-catalog-sources.json"),
        JSON.stringify([
          { supplier_id: "msup_legacy", origin: "https://legacy.test" },
          { supplier_id: "msup_ok", platform: "shopify", origin: "https://ok.test" },
        ])
      )
      const loaded = loadShopifyConfigs(dir)
      expect(loaded.map((c) => c.supplier_id)).toEqual(["msup_ok"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("loadShopifyConfigs (real vetting files)", () => {
  const configs = loadShopifyConfigs()
  const bySupplier = new Map(configs.map((c) => [c.supplier_id, c]))

  it("auto-discovers every platform:shopify vendor without an index.ts edit", () => {
    for (const id of [
      "msup_amerdental_com",
      "msup_carolinadental_com",
      "msup_thedentaldistributors_com",
      "msup_davisdentalsupply_com",
      "msup_bitesupply_com",
      "msup_wisdomdentalsupply_com",
    ]) {
      expect(bySupplier.has(id)).toBe(true)
    }
  })

  it("does not pick up legacy vetting entries that omit platform (e.g. practicon)", () => {
    expect(bySupplier.has("msup_practicon_com")).toBe(false)
  })
})

describe("adapterForCandidate routes migrated Shopify vendors (origin + distributor)", () => {
  const cases: Array<{ name: string; origin: ProductPageCandidate; distributor: ProductPageCandidate }> = [
    {
      name: "DDI Supply (thedentaldistributors.com + ddisupply.com alias)",
      origin: candidate({ url: "https://ddisupply.com/products/implacare-ii" }),
      distributor: candidate({ distributor: "Dental Distributors, Inc.", url: "https://supplier.test/x" }),
    },
    {
      name: "amerdental",
      origin: candidate({ distributor: "Whoever", url: "https://amerdental.com/products/test-product" }),
      distributor: candidate({ distributor: "American Dental Accessories", url: "https://supplier.test/x" }),
    },
    {
      name: "carolinadental",
      origin: candidate({ distributor: "Whoever", url: "https://carolinadental.com/products/test-product" }),
      distributor: candidate({ distributor: "Carolina Dental Supply", url: "https://supplier.test/x" }),
    },
    {
      name: "davisdentalsupply (CF-fronted)",
      origin: candidate({ distributor: "Whoever", url: "https://www.davisdentalsupply.com/products/x" }),
      distributor: candidate({ distributor: "Davis Dental Supply", url: "https://supplier.test/x" }),
    },
    {
      name: "bite supply (CF-fronted)",
      origin: candidate({ distributor: "Whoever", url: "https://bitesupply.com/products/x" }),
      distributor: candidate({ distributor: "Bite Supply", url: "https://supplier.test/x" }),
      name: "wisdomdentalsupply (CF-fronted)",
      origin: candidate({ distributor: "Whoever", url: "https://www.wisdomdentalsupply.com/products/x" }),
      distributor: candidate({ distributor: "Wisdom Dental Supply", url: "https://supplier.test/x" }),
    },
  ]

  for (const { name, origin, distributor } of cases) {
    it(`routes ${name} to the Shopify adapter via origin`, () => {
      expect(adapterForCandidate(origin).id).toBe("shopify")
    })
    it(`routes ${name} to the Shopify adapter via distributor alias`, () => {
      expect(adapterForCandidate(distributor).id).toBe("shopify")
    })
  }

  it("does not route unrelated suppliers to the Shopify adapter", () => {
    expect(
      adapterForCandidate(candidate({ distributor: "Some Other Supplier", url: "https://example.com/products/x" })).id
    ).not.toBe("shopify")
  })
})
