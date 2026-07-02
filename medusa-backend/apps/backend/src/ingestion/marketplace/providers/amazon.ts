import {
  dedupeResults,
  looksLikePriceOnly,
  parseJsonLdResults,
  parseProximityCards,
} from "../parse"
import type { MarketplaceProvider } from "../types"

const SEARCH_BASE = "https://www.amazon.com/s"

// Amazon product URLs are /dp/<ASIN> or /gp/product/<ASIN>, often prefixed with
// a slug. Result cards don't emit JSON-LD, so the proximity parser does the work.
export const AMAZON_DETAIL_PATTERN = /\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}/i

// The path segment right before the detail marker: "/<slug>/dp/<ASIN>".
const AMAZON_SLUG_PATTERN = /\/([^/]+)\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}/i

// Recover a product name from an Amazon detail URL's slug. Amazon prefixes the
// /dp/<ASIN> path with a hyphenated product name ("McKesson-Non-Sterile-Clear-
// Vinyl-Gloves"), which is the real name when a result card wraps only the price
// block. Returns undefined for a bare /dp/<ASIN> (no slug) or a slug with no
// real word (all-numeric / ASIN-shaped / price-like), so the caller still drops
// a card it genuinely can't name.
export function amazonTitleFromUrl(url: string): string | undefined {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return undefined
  }
  const slug = pathname.match(AMAZON_SLUG_PATTERN)?.[1]
  if (!slug) {
    return undefined
  }
  let name: string
  try {
    name = decodeURIComponent(slug)
  } catch {
    name = slug
  }
  name = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
  // Require at least two word tokens so an ASIN-y or all-numeric slug is rejected.
  const words = name.match(/[a-z]{2,}/gi)
  if (!words || words.length < 2 || looksLikePriceOnly(name)) {
    return undefined
  }
  return name
}

export const amazonProvider: MarketplaceProvider = {
  id: "amazon",
  supplier: {
    name: "Amazon",
    slug: "amazon",
    website_url: "https://www.amazon.com",
  },
  buildSearchUrl(query: string): string {
    const params = new URLSearchParams({ k: query })
    return `${SEARCH_BASE}?${params.toString()}`
  },
  parseResults(html, context) {
    return dedupeResults([
      parseJsonLdResults(html, context.baseUrl),
      parseProximityCards(html, context.baseUrl, {
        detailUrlPattern: AMAZON_DETAIL_PATTERN,
        titleFromUrl: amazonTitleFromUrl,
      }),
    ])
  },
}
