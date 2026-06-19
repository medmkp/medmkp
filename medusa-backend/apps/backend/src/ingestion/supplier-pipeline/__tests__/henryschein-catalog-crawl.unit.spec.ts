import { crawlHenryScheinCatalog } from "../henryschein-catalog-crawl"

// Build a listing page with N product JSON-LD blocks.
function listing(skus: string[], subcatPaths: string[] = []): string {
  const products = skus
    .map(
      (sku) =>
        `<script type="application/ld+json">{"@type":"Product","name":"Product ${sku}","sku":"${sku}","brand":{"@type":"Organization","name":"Acme"},"url":"https://www.henryschein.com/us-en/dental/p/x/y/z/${sku}","mpn":"MPN-${sku}"}</script>`
    )
    .join("\n")
  const links = subcatPaths
    .map((p) => `<a href="https://www.henryschein.com/us-en/dental/c/${p}">x</a>`)
    .join("\n")
  return `<html><body>${links}${products}</body></html>`
}

// Category graph: gloves hub → {nitrile, latex} leaves; nitrile paginates 2 pages.
const C = "https://www.henryschein.com/us-en/dental/c"
const GRAPH: Record<string, string> = {
  [`${C}/gloves`]: listing([], ["gloves/nitrile", "gloves/latex"]),
  [`${C}/gloves/nitrile`]: listing(["A", "B"]),
  [`${C}/gloves/nitrile?pageNumber=2`]: listing(["C"]),
  [`${C}/gloves/nitrile?pageNumber=3`]: listing([]), // empty → stop
  [`${C}/gloves/latex`]: listing(["D"]),
  [`${C}/gloves/latex?pageNumber=2`]: listing([]),
}

describe("crawlHenryScheinCatalog", () => {
  it("walks hub → leaves, paginates listings, and dedupes products by sku", async () => {
    const fetched: string[] = []
    const fetchHtml = async (url: string) => {
      fetched.push(url)
      return GRAPH[url] ?? ""
    }

    const rows = await crawlHenryScheinCatalog({
      fetchHtml,
      seedUrls: [`${C}/gloves`],
      concurrency: 2,
    })

    const skus = rows.map((r) => r.sku).sort()
    expect(skus).toEqual(["A", "B", "C", "D"])
    // Followed subcategory links discovered on the hub page.
    expect(fetched).toContain(`${C}/gloves/nitrile`)
    expect(fetched).toContain(`${C}/gloves/latex`)
    // Paginated nitrile until the empty page; never fetched a 4th page.
    expect(fetched).toContain(`${C}/gloves/nitrile?pageNumber=2`)
    expect(fetched).not.toContain(`${C}/gloves/nitrile?pageNumber=4`)
    // Identity-only rows (no price).
    expect(rows.every((r) => r.price_cents === undefined)).toBe(true)
  })

  it("respects the global page cap", async () => {
    let calls = 0
    const fetchHtml = async (url: string) => {
      calls++
      return GRAPH[url] ?? ""
    }
    await crawlHenryScheinCatalog({
      fetchHtml,
      seedUrls: [`${C}/gloves`],
      maxPages: 2,
      concurrency: 1,
    })
    expect(calls).toBeLessThanOrEqual(3) // stops shortly after the cap
  })
})
