import {
  extractHenryScheinCategoryLinks,
  extractHenryScheinProducts,
} from "./adapters/henryschein"
import type { ExtractedProductRow } from "./types"

/**
 * Full Henry Schein dental catalog crawl.
 *
 * HS has no usable sitemap and its category hub pages load products via ASP.NET
 * postback, but the LEAF category pages (e.g. /us-en/dental/c/gloves/nitrile)
 * render every product as server-side JSON-LD and paginate with ?pageNumber=N.
 * So we BFS the category tree from the top categories, harvesting subcategory
 * links + products at each node, and paginate any node that lists products until
 * a page yields no new SKUs.
 *
 * Pure orchestration with an injected fetchHtml so it can be unit-tested against
 * a canned category graph; the ingest script supplies the real (browser-UA,
 * retrying) fetch.
 */

export const HS_DENTAL_BROWSE_ROOT =
  "https://www.henryschein.com/us-en/dental/c/browsesupplies"

// Fallback top categories if the browse root can't be fetched (keeps a run from
// failing on a transient root error). Matches the live /c/browsesupplies tree.
export const HS_TOP_CATEGORY_FALLBACK = [
  "anesthetics", "burs-diamonds", "cad-cam", "crown-bridge",
  "dental-equipment-parts-and-accessories", "disposables", "endodontics",
  "equipment-technology", "evacuation-products", "finishing-polishing",
  "gloves", "handpieces", "health-beauty-otc",
  "impression-materials-accessories", "infection-control-products",
  "instruments", "laboratory", "medical-diagnostic-emergency", "miscellaneous",
  "office-management-supplies", "orthodontic", "pharmaceuticals", "preventive",
  "restorative-cosmetic", "small-equipment", "surgical-implant-products",
  "uniforms-work-wear", "x-ray-and-digital-imaging",
].map((slug) => `https://www.henryschein.com/us-en/dental/c/${slug}`)

export type CrawlDeps = {
  fetchHtml: (url: string) => Promise<string>
  seedUrls: string[]
  log?: (msg: string) => void
  maxPages?: number // global cap on page fetches
  maxPagesPerNode?: number // pagination cap per category
  maxProducts?: number
  concurrency?: number
}

export async function crawlHenryScheinCatalog(
  deps: CrawlDeps
): Promise<ExtractedProductRow[]> {
  const {
    fetchHtml,
    seedUrls,
    log = () => {},
    maxPages = 6000,
    maxPagesPerNode = 60,
    maxProducts = Infinity,
    concurrency = 4,
  } = deps

  const bySku = new Map<string, ExtractedProductRow>()
  const visited = new Set<string>()
  const queue: string[] = []
  let pages = 0

  for (const url of seedUrls) if (!visited.has(url)) queue.push(url)

  const capHit = () => pages >= maxPages || bySku.size >= maxProducts

  // Add a page's products; return how many SKUs were NEW (drives the "stop
  // paginating when a page adds nothing" signal).
  const harvest = (html: string): number => {
    let added = 0
    for (const row of extractHenryScheinProducts(html)) {
      if (!row.sku || bySku.has(row.sku)) continue
      bySku.set(row.sku, row)
      added++
      if (bySku.size >= maxProducts) break
    }
    return added
  }

  // Fetch a category's page 1 (subcats + products), then paginate while pages
  // keep adding SKUs. Returns the subcategory links discovered on page 1.
  const processNode = async (baseUrl: string): Promise<string[]> => {
    const first = await fetchHtml(baseUrl)
    pages++
    if (!first) return []

    const subcats = extractHenryScheinCategoryLinks(first)
    const addedFirst = harvest(first)
    const looksLikeListing = addedFirst > 0 || /"@type"\s*:\s*"Product"/.test(first)

    if (looksLikeListing) {
      for (let pg = 2; pg <= maxPagesPerNode; pg++) {
        if (capHit()) break
        const html = await fetchHtml(`${baseUrl}?pageNumber=${pg}`)
        pages++
        if (!html) break
        if (harvest(html) === 0) break // page added no new SKUs → end of listing
      }
    }
    return subcats
  }

  // Concurrency-limited BFS over the category queue.
  await new Promise<void>((resolve) => {
    let active = 0

    const pump = () => {
      if (active === 0 && (queue.length === 0 || capHit())) {
        resolve()
        return
      }
      while (active < concurrency && queue.length > 0 && !capHit()) {
        const url = queue.shift() as string
        if (visited.has(url)) continue
        visited.add(url)
        active++
        processNode(url)
          .then((subcats) => {
            for (const c of subcats) if (!visited.has(c)) queue.push(c)
            log(
              `[henryschein] crawled ${url.replace("https://www.henryschein.com/us-en/dental/c/", "")} | pages=${pages} products=${bySku.size} queue=${queue.length}`
            )
          })
          .catch(() => {})
          .finally(() => {
            active--
            pump()
          })
      }
    }

    pump()
  })

  return [...bySku.values()]
}
