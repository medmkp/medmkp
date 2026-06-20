import type {
  IndexedSupplierUrl,
  SupplierSitemapSummary,
} from "./types"
import { xmlUrls } from "./sitemap-discovery"

const productPatterns = [
  /\/product/i,
  /product\.asp/i,
  /product2\.asp/i,
  /\/p\//i,
  /\/item/i,
  /pid=/i,
  /sku=/i,
  /\.htm$/i,
]

const categoryPatterns = [
  /\/c\//i,
  /\/category/i,
  /\/categories/i,
  /\/collections/i,
  /\/dental-supplies/i,
  /\/supplies/i,
  /\/catalog/i,
]

function classifyDarbyUrl(url: string) {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }

  if (!/darbydental\.com$/i.test(parsed.hostname)) {
    return undefined
  }

  const pathname = parsed.pathname.replace(/\/+$/, "")
  const segments = pathname.split("/").filter(Boolean)

  if (!segments.length) {
    return undefined
  }

  // Darby category pages live under /categories/... (and /categories.html).
  if (/^categories(?:\.html?)?$/i.test(segments[0])) {
    return {
      url_type: "category" as const,
      confidence_score: 80,
      reasons: ["Darby category URL"],
    }
  }

  // Darby product pages are a single numeric item-number segment, optionally
  // with a variant suffix, e.g. /9543404.html or /5259695-01.html.
  if (segments.length === 1 && /^[0-9]+(?:-[0-9A-Za-z]+)?\.html?$/i.test(segments[0])) {
    return {
      url_type: "product" as const,
      confidence_score: 90,
      reasons: ["Darby numeric item-number product URL"],
    }
  }

  return undefined
}

function classifyDcDentalUrl(url: string) {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }

  if (!/dcdental\.com$/i.test(parsed.hostname)) {
    return undefined
  }

  const pathname = parsed.pathname.replace(/\/+$/, "")
  const segments = pathname.split("/").filter(Boolean)
  const firstSegment = segments[0]?.toLowerCase() ?? ""

  if (!segments.length) {
    return undefined
  }

  if (/^(?:search|cart|checkout|about-us|contact-us|privacy-policy|terms-conditions|careers|equipment-service)$/i.test(firstSegment)) {
    return {
      url_type: "other" as const,
      confidence_score: 15,
      reasons: ["DC Dental non-catalog URL"],
    }
  }

  if (/^(?:supplies|small-equipment|3m-merchandise)$/i.test(firstSegment)) {
    return {
      url_type: "category" as const,
      confidence_score: 80,
      reasons: ["DC Dental catalog category URL"],
    }
  }

  if (
    segments.length === 1 &&
    /-[A-Za-z0-9]{4,}$/.test(segments[0]) &&
    !/\.(?:css|js|png|jpe?g|gif|svg|webp|ico)$/i.test(segments[0])
  ) {
    return {
      url_type: "product" as const,
      confidence_score: 85,
      reasons: ["DC Dental SuiteCommerce product URL"],
    }
  }

  return undefined
}

export function classifySupplierUrl(
  url: string
): Pick<IndexedSupplierUrl, "url_type" | "confidence_score" | "reasons"> {
  const reasons: string[] = []

  if (/\.xml($|\?)/i.test(url)) {
    return {
      url_type: "sitemap_index",
      confidence_score: 90,
      reasons: ["XML sitemap/feed URL"],
    }
  }

  if (/pearsondental\.com\/catalog\/product_thumb_multi\.asp/i.test(url)) {
    return {
      url_type: "category",
      confidence_score: 70,
      reasons: ["Pearson product-family page, not SKU-level product URL"],
    }
  }

  const darbyClassification = classifyDarbyUrl(url)

  if (darbyClassification) {
    return darbyClassification
  }

  const dcDentalClassification = classifyDcDentalUrl(url)

  if (dcDentalClassification) {
    return dcDentalClassification
  }

  const productHits = productPatterns.filter((pattern) => pattern.test(url))
  const categoryHits = categoryPatterns.filter((pattern) => pattern.test(url))

  if (productHits.length) {
    reasons.push(`Product URL pattern hits: ${productHits.length}`)
  }

  if (categoryHits.length) {
    reasons.push(`Category URL pattern hits: ${categoryHits.length}`)
  }

  if (productHits.length && !categoryHits.length) {
    return {
      url_type: "product",
      confidence_score: Math.min(95, 65 + productHits.length * 10),
      reasons,
    }
  }

  if (productHits.length && categoryHits.length) {
    return {
      url_type: "product",
      confidence_score: 70,
      reasons: [...reasons, "Both product and category patterns matched"],
    }
  }

  if (categoryHits.length) {
    return {
      url_type: "category",
      confidence_score: Math.min(90, 55 + categoryHits.length * 10),
      reasons,
    }
  }

  return {
    url_type: "other",
    confidence_score: 20,
    reasons: ["No product/category pattern matched"],
  }
}

export function indexSupplierSitemapUrls(
  sitemapSummaries: SupplierSitemapSummary[]
) {
  const indexed: IndexedSupplierUrl[] = []

  for (const supplier of sitemapSummaries) {
    for (const sitemap of supplier.sitemaps) {
      if (!sitemap.ok || !sitemap.body) {
        continue
      }

      for (const url of xmlUrls(sitemap.body)) {
        if (/\.xml($|\?)/i.test(url)) {
          continue
        }

        indexed.push({
          distributor: supplier.distributor,
          website_url: supplier.website_url,
          origin: supplier.origin,
          prices: supplier.prices,
          sitemap_url: sitemap.url,
          url,
          ...classifySupplierUrl(url),
        })
      }
    }
  }

  return indexed
}

export function summarizeIndexedUrls(indexed: IndexedSupplierUrl[]) {
  const byType = indexed.reduce((acc, row) => {
    acc[row.url_type] = (acc[row.url_type] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    indexed_urls: indexed.length,
    by_type: byType,
    product_candidates: byType.product ?? 0,
    category_candidates: byType.category ?? 0,
  }
}
