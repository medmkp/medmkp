import { downloadText } from "./sitemap-discovery"
import { normalizeSiteUrl } from "./suppliers"
import type {
  IndexedSupplierUrl,
  SupplierSeedRow,
} from "./types"

const PEARSON_ORIGIN = "https://www.pearsondental.com"
const PEARSON_CATALOG_PATH = /^\/catalog\//i
const PEARSON_PRODUCT_PATH = /^\/catalog\/product2?\.asp$/i
const PEARSON_LISTING_PATHS = [
  /^\/catalog\/category_alph_dent\.asp$/i,
  /^\/catalog\/cat\.asp$/i,
  /^\/catalog\/cat_alphabetical\.asp$/i,
  /^\/catalog\/subcat_thumb\.asp$/i,
  /^\/catalog\/product_thumb/i,
  /^\/catalog\/newprod_thumb/i,
]

type PearsonCatalogPage = {
  url: string
  category?: string
  subcategory?: string
  depth: number
}

type PearsonDiscoveryOptions = {
  timeoutMs?: number
  debug?: boolean
  concurrency?: number
  maxPages?: number
}

function debugLog(enabled: boolean | undefined, ...args: unknown[]) {
  if (enabled) {
    console.log("[pearson-catalog-discovery]", ...args)
  }
}

function cleanText(value: string) {
  return decodeHtml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
}

function trimPearsonSuffix(value: string) {
  return cleanText(value)
    .replace(/\s*-\s*Pearson Dental Supply Co\.?$/i, "")
    .replace(/\s*\([0-9,]+\)\s*$/g, "")
    .trim()
}

function pageTitleParts(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""
  return trimPearsonSuffix(title)
    .split(/\s+-\s+/)
    .map((part) => trimPearsonSuffix(part))
    .filter(Boolean)
}

function attr(tag: string, name: string) {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i")
  return tag.match(pattern)?.[2] ?? ""
}

function htmlLinks(html: string, baseUrl: string) {
  const links: Array<{ url: string; label: string; title: string }> = []

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1]
    const href = attr(attrs, "href").trim()
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) {
      continue
    }

    try {
      links.push({
        url: new URL(decodeHtml(href), baseUrl).href,
        label: cleanText(match[2]),
        title: trimPearsonSuffix(attr(attrs, "title")),
      })
    } catch {
      // Ignore malformed legacy hrefs.
    }
  }

  return links
}

function pearsonSupplier(supplier: SupplierSeedRow) {
  try {
    const site = normalizeSiteUrl(supplier.website_url)
    return /pearsondental\.com$/i.test(new URL(site.origin).hostname) ||
      /pearson dental/i.test(supplier.distributor)
  } catch {
    return /pearson dental/i.test(supplier.distributor)
  }
}

function samePearsonCatalogUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.origin === PEARSON_ORIGIN && PEARSON_CATALOG_PATH.test(parsed.pathname)
  } catch {
    return false
  }
}

function isListingUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.origin === PEARSON_ORIGIN &&
      PEARSON_LISTING_PATHS.some((pattern) => pattern.test(parsed.pathname))
  } catch {
    return false
  }
}

function productCanonicalUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.origin !== PEARSON_ORIGIN || !PEARSON_PRODUCT_PATH.test(parsed.pathname)) {
      return ""
    }

    const canonical = new URL(`${PEARSON_ORIGIN}/catalog/product.asp`)
    for (const param of ["majcatid", "catid", "subcatid", "pid", "bin2"]) {
      const value = parsed.searchParams.get(param)
      if (value) {
        canonical.searchParams.set(param, value)
      }
    }

    if (!canonical.searchParams.get("pid") && !canonical.searchParams.get("bin2")) {
      return ""
    }

    return canonical.href
  } catch {
    return ""
  }
}

function listingCanonicalUrl(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ""

    const keep = new URL(`${parsed.origin}${parsed.pathname}`)
    for (const param of ["letter", "majcatid", "catid", "subcatid", "sort", "page"]) {
      const value = parsed.searchParams.get(param)
      if (value) {
        keep.searchParams.set(param, value)
      }
    }

    return keep.href
  } catch {
    return ""
  }
}

function alphabetSeeds() {
  return ["3", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")].map((letter) => ({
    url: `${PEARSON_ORIGIN}/catalog/category_alph_dent.asp?letter=${letter}`,
    depth: 0,
  }))
}

function contextFromPage(page: PearsonCatalogPage, html: string) {
  const parts = pageTitleParts(html)
  return {
    category: page.category || parts[0] || "Dental supplies",
    subcategory: page.subcategory || parts[1] || "",
  }
}

function contextFromLink(
  current: PearsonCatalogPage,
  html: string,
  link: { url: string; label: string; title: string }
) {
  const label = trimPearsonSuffix(link.title || link.label)
  const currentContext = contextFromPage(current, html)

  try {
    const parsed = new URL(link.url)
    if (/\/catalog\/cat\.asp$/i.test(parsed.pathname)) {
      return {
        category: label || currentContext.category,
        subcategory: "",
      }
    }

    if (/\/catalog\/subcat_thumb\.asp$/i.test(parsed.pathname)) {
      return {
        category: currentContext.category,
        subcategory: label || currentContext.subcategory,
      }
    }
  } catch {
    // Fall through to current context.
  }

  return currentContext
}

async function promiseMap<T, R>(
  items: T[],
  concurrency: number,
  iterator: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++
        results[currentIndex] = await iterator(items[currentIndex], currentIndex)
      }
    })
  )

  return results
}

export async function discoverPearsonCatalogUrls(
  suppliers: SupplierSeedRow[],
  options: PearsonDiscoveryOptions = {}
) {
  const supplier = suppliers.find(pearsonSupplier)
  if (!supplier) {
    return [] as IndexedSupplierUrl[]
  }

  const site = normalizeSiteUrl(supplier.website_url)
  const origin = site.origin || PEARSON_ORIGIN
  const maxPages = options.maxPages ?? 10000
  const concurrency = options.concurrency ?? 4
  const queue = alphabetSeeds()
  const queued = new Set(queue.map((page) => page.url))
  const crawled = new Set<string>()
  const products = new Map<string, IndexedSupplierUrl>()
  let pagesFetched = 0

  debugLog(options.debug, "Starting Pearson full-catalog discovery")

  while (queue.length && pagesFetched < maxPages) {
    const remainingPageBudget = maxPages - pagesFetched
    const batch = queue.splice(0, Math.min(concurrency, remainingPageBudget))
    const pages = await promiseMap(batch, concurrency, async (page) => {
      if (crawled.has(page.url)) {
        return { page, result: undefined }
      }

      crawled.add(page.url)
      debugLog(options.debug, `Fetching catalog page ${page.url}`)
      const result = await downloadText(page.url, options.timeoutMs)
      return { page, result }
    })

    for (const { page, result } of pages) {
      if (!result || !result.ok || !result.body) {
        continue
      }

      pagesFetched += 1
      const links = htmlLinks(result.body, page.url)
      const currentContext = contextFromPage(page, result.body)

      for (const link of links) {
        if (!samePearsonCatalogUrl(link.url)) {
          continue
        }

        const productUrl = productCanonicalUrl(link.url)
        if (productUrl) {
          if (!products.has(productUrl)) {
            products.set(productUrl, {
              distributor: supplier.distributor,
              website_url: supplier.website_url,
              origin,
              prices: supplier.prices,
              sitemap_url: page.url,
              url: productUrl,
              url_type: "product",
              confidence_score: 95,
              reasons: ["Pearson full-catalog crawl product link"],
              ...currentContext,
            })
          }
          continue
        }

        if (!isListingUrl(link.url)) {
          continue
        }

        const canonical = listingCanonicalUrl(link.url)
        if (!canonical || queued.has(canonical) || crawled.has(canonical)) {
          continue
        }

        const nextContext = contextFromLink(page, result.body, link)
        queued.add(canonical)
        queue.push({
          url: canonical,
          depth: page.depth + 1,
          ...nextContext,
        })
      }
    }

    if (pagesFetched % 25 === 0) {
      debugLog(
        options.debug,
        `Pearson catalog discovery progress: ${pagesFetched} page(s), ${products.size} product URL(s), ${queue.length} queued`
      )
    }
  }

  debugLog(
    options.debug,
    `Pearson full-catalog discovery complete: ${pagesFetched} page(s), ${products.size} product URL(s), ${queue.length} queued`
  )

  return [...products.values()]
}
