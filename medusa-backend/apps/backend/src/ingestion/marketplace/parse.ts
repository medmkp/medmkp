import { createHash } from "crypto"
import {
  decodeHtml,
  flattenJsonLd,
  jsonLdBlocks,
  stringValue,
  stripTags,
} from "../supplier-pipeline/html"
import type { MarketplaceSearchResult } from "./types"

export function absoluteUrl(value: string, baseUrl: string): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ""
  }

  try {
    return new URL(trimmed, baseUrl).href
  } catch {
    return ""
  }
}

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "CNY",
}

// US$/USD/$ etc. followed by a number. We require a currency marker so that
// random numbers in surrounding markup (ratings, MOQ, "10 pieces") aren't read
// as prices.
const PRICE_TOKEN_RE =
  /(US\s*\$|USD|RMB|CNY|\$|€|£|¥)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gi

export type ParsedMoney = {
  price_cents: number
  price_text: string
  currency: string
}

// A price immediately followed by "/count", "/fl oz", "/each" etc. is a derived
// per-unit price (Amazon shows it next to the headline price). We skip those so
// the snapshot is the actual purchase price, not "$0.09/Count".
const PER_UNIT_SUFFIX_RE =
  /^\s*\/\s*(?:count|ct|each|ea|piece|pcs?|pair|sheet|load|wash|oz|fl\s?oz|g|gram|grams|kg|mg|ml|l|m|ft|sq\s?ft|capsule|tablet)\b/i

// A currency marker at the very start of a string — the precision guard for
// looksLikePriceOnly below. Real product names don't lead with a price.
const LEADING_PRICE_RE = /^\s*(?:US\s*\$|USD|RMB|CNY|\$|€|£|¥)\s*[0-9]/i

// Words that legitimately appear inside a price block (comparison labels and the
// per-unit denominators) but carry no product identity on their own. A "title"
// left with only these after its prices are stripped is really a price string.
const PRICE_CONTEXT_WORDS = new Set([
  "typical", "list", "sale", "was", "now", "off", "reg", "price",
  "count", "ct", "each", "ea", "piece", "pieces", "pcs", "pc", "pair",
  "sheet", "sheets", "load", "loads", "wash", "washes", "oz", "fl", "fluid",
  "ounce", "ounces", "gram", "grams", "kg", "mg", "ml", "capsule", "capsules",
  "tablet", "tablets", "per", "and", "of", "the",
])

// True when a card "title" is really the price block, not a product name — e.g.
// an Amazon /dp/ link that wraps only the split-span price yields inner text like
// "$11.50 $ 11 . 50" or "$27.95 ( $1.50 /fluid ounce)". Ingesting those verbatim
// produced garbage catalog listings (244 Amazon canonicals named "$11.50"). We
// require the string to LEAD with a price (so a real name that merely mentions
// one is never dropped) and to carry no word beyond price-context labels/units.
export function looksLikePriceOnly(title: string): boolean {
  const trimmed = title.trim()
  if (!trimmed || !LEADING_PRICE_RE.test(trimmed)) {
    return false
  }
  const words = trimmed.replace(PRICE_TOKEN_RE, " ").toLowerCase().match(/[a-z]{2,}/g)
  return !words || words.every((word) => PRICE_CONTEXT_WORDS.has(word))
}

/**
 * Parse the headline price out of a chunk of text. Returns the FIRST
 * currency-marked price that isn't a per-unit derived price. For a range
 * ("US $1.20 - $3.40") that's the low end (written first), which is the per-unit
 * comparison price a buyer cares about. Returns undefined when none is present.
 */
export function parseMoney(text: string): ParsedMoney | undefined {
  if (!text) {
    return undefined
  }

  for (const match of text.matchAll(PRICE_TOKEN_RE)) {
    const amount = Number(match[2].replace(/,/g, ""))
    if (!Number.isFinite(amount) || amount <= 0) {
      continue
    }

    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 12)
    if (PER_UNIT_SUFFIX_RE.test(after)) {
      continue
    }

    const marker = match[1].toUpperCase().replace(/\s+/g, "")
    const currency =
      marker === "US$" || marker === "USD"
        ? "USD"
        : marker === "RMB"
          ? "CNY"
          : CURRENCY_BY_SYMBOL[match[1].trim()] ?? "USD"

    return {
      price_cents: Math.round(amount * 100),
      price_text: decodeHtml(match[0]),
      currency,
    }
  }

  return undefined
}

// Amazon splits its price across spans when JS hasn't run, so there's no clean
// `a-offscreen` "$9.99" for parseMoney to read — only:
//   <span class="a-price-symbol">$</span>
//   <span class="a-price-whole">9<span class="a-price-decimal">.</span></span>
//   <span class="a-price-fraction">99</span>
// stripTags collapses that to "$ 9 . 99", which parseMoney truncates to "$9"
// (cents dropped). Reconstruct whole+fraction straight from the raw HTML so the
// free, no-JS fetch (e.g. direct from the NUC) yields a correct price. Restricted
// to USD ($) so a mis-geo'd exit (e.g. NOK) yields no price, not a wrong currency.
const SPLIT_PRICE_RE =
  /a-price-symbol"[^>]*>\s*\$[^<]*<\/span>\s*<span[^>]*\ba-price-whole"[^>]*>\s*([0-9][0-9,]*)[\s\S]{0,60}?\ba-price-fraction"[^>]*>\s*([0-9]{2})/i

export function parseSplitPriceSpans(html: string): ParsedMoney | undefined {
  const match = html.match(SPLIT_PRICE_RE)
  if (!match) {
    return undefined
  }
  const amount = Number(`${match[1].replace(/,/g, "")}.${match[2]}`)
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined
  }
  return {
    price_cents: Math.round(amount * 100),
    price_text: `$${match[1]}.${match[2]}`,
    currency: "USD",
  }
}

const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/
const ALIBABA_ID_RE = /_(\d{6,})\.html/

/**
 * A stable, listing-identifying id derived from the product URL, so re-running
 * ingestion updates the same supplier_product row instead of creating dupes.
 * Falls back to a short hash of the normalized URL when no native id is present.
 */
export function marketplaceProductId(url: string): string {
  if (!url) {
    return ""
  }

  const asin = url.match(ASIN_RE)?.[1]
  if (asin) {
    return asin
  }

  const alibabaId = url.match(ALIBABA_ID_RE)?.[1]
  if (alibabaId) {
    return alibabaId
  }

  const longRun = normalizeProductUrl(url).match(/(\d{8,})/)?.[1]
  if (longRun) {
    return longRun
  }

  return createHash("sha1").update(normalizeProductUrl(url)).digest("hex").slice(0, 12)
}

/** Drop query/hash so tracking params don't fragment the same listing. */
export function normalizeProductUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url.split("?")[0].split("#")[0]
  }
}

const WORD_RE = /[a-z0-9]+/g

function tokens(value: string): string[] {
  return Array.from(value.toLowerCase().matchAll(WORD_RE), (match) => match[0]).filter(
    (token) => token.length > 2
  )
}

/**
 * 0..100 confidence that `title` is the same product as `canonicalName`, by the
 * fraction of canonical-name tokens present in the title. Mirrors the
 * deterministic overlap scoring used for supplier-catalog matching.
 */
export function titleOverlapConfidence(
  title: string,
  canonicalName: string
): number {
  const wanted = tokens(canonicalName)
  if (!wanted.length) {
    return 0
  }

  const haystack = new Set(tokens(title))
  const hits = wanted.filter((token) => haystack.has(token)).length

  return Math.round((hits / wanted.length) * 100)
}

function looksLikeImageUrl(value: string): boolean {
  if (!value || value.startsWith("data:")) {
    return false
  }
  return (
    /\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(value) ||
    /(?:alicdn|amazon|ssl-images-amazon|media-amazon|cdn)/i.test(value)
  )
}

// Lazy-loaded marketplace cards put a shared transparent placeholder in `src`
// (e.g. Alibaba's "...tps-196-196.gif") and the real product photo in a data-*
// attribute. Reject placeholders and GIFs so we never persist the same sprite
// for every product.
const PLACEHOLDER_IMAGE_RE =
  /(?:^data:|\.gif(?:[?#]|$)|blank|placeholder|spacer|loading|1x1|transparent)/i

function attrFromTag(tag: string, attr: string): string {
  const match = tag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, "i"))
  return match ? decodeHtml(match[1]) : ""
}

function firstSrcsetUrl(value: string): string {
  return value.split(",")[0]?.trim().split(/\s+/)[0] ?? ""
}

function findFirstImage(windowHtml: string, baseUrl: string): string {
  for (const tagMatch of windowHtml.matchAll(/<img\b[^>]*>/gi)) {
    const tag = tagMatch[0]
    // Prefer the real (lazy) image over the placeholder usually sitting in src.
    const candidates = [
      attrFromTag(tag, "data-src"),
      attrFromTag(tag, "data-image-src"),
      attrFromTag(tag, "data-lazy-src"),
      firstSrcsetUrl(attrFromTag(tag, "data-srcset")),
      firstSrcsetUrl(attrFromTag(tag, "srcset")),
      attrFromTag(tag, "src"),
    ]
    for (const raw of candidates) {
      if (!raw) {
        continue
      }
      const url = absoluteUrl(raw, baseUrl)
      if (looksLikeImageUrl(url) && !PLACEHOLDER_IMAGE_RE.test(url)) {
        return url
      }
    }
  }
  return ""
}

// Inner text of the anchor that opens at `openTagEnd` (the index just past its
// `>`), up to the first closing </a>. Computed per-occurrence so that an
// image-only anchor and a title anchor sharing the same href don't collide.
function anchorInnerTextAt(html: string, openTagEnd: number): string {
  const close = html.indexOf("</a>", openTagEnd)
  if (close === -1) {
    return ""
  }
  return stripTags(html.slice(openTagEnd, close))
}

function attrNear(windowHtml: string, attr: string): string {
  const re = new RegExp(`${attr}=["']([^"']{4,})["']`, "i")
  const value = windowHtml.match(re)?.[1]
  return value ? decodeHtml(value) : ""
}

export type ProximityCardOptions = {
  /** href values matching this are treated as product detail links. */
  detailUrlPattern: RegExp
  /** characters of HTML to scan around each link for image/title/price. */
  windowRadius?: number
  /**
   * Last-resort name recovery from the detail URL, tried only when the card's
   * inner text (and its title=/alt= attributes) is just the price block. The URL
   * slug often carries the real product name (Amazon's "/<slug>/dp/<ASIN>"), so
   * this rescues a listing that would otherwise be dropped. Returns undefined
   * when the URL yields no usable name, leaving the card to be dropped.
   */
  titleFromUrl?: (url: string) => string | undefined
}

/**
 * Generic search-card parser: find product-detail links, then read the title,
 * image, and price out of the surrounding HTML window. Resilient to the exact
 * card class names (which marketplaces churn) because it keys off the detail
 * link and proximity rather than a fixed DOM path.
 */
export function parseProximityCards(
  html: string,
  baseUrl: string,
  options: ProximityCardOptions
): MarketplaceSearchResult[] {
  const radius = options.windowRadius ?? 1800
  const anchorRe = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>/gi

  type Anchor = { url: string; normUrl: string; index: number; inner: string }
  const anchors: Anchor[] = []

  for (const match of html.matchAll(anchorRe)) {
    const href = match[1]
    if (!options.detailUrlPattern.test(href)) {
      continue
    }
    const url = absoluteUrl(decodeHtml(href), baseUrl)
    if (!url) {
      continue
    }
    const index = match.index ?? 0
    anchors.push({
      url,
      normUrl: normalizeProductUrl(url),
      index,
      inner: anchorInnerTextAt(html, index + match[0].length),
    })
  }

  const groups = new Map<string, Anchor[]>()
  for (const anchor of anchors) {
    const group = groups.get(anchor.normUrl) ?? []
    group.push(anchor)
    groups.set(anchor.normUrl, group)
  }

  const results: MarketplaceSearchResult[] = []
  for (const [normUrl, group] of groups) {
    let title = ""
    let image = ""
    let money: ParsedMoney | undefined

    for (const anchor of group) {
      // Scan FORWARD from the link only: a card's image/title/price sit below
      // its link, so a backward window would bleed in the previous card's price.
      const windowHtml = html.slice(anchor.index, anchor.index + radius)

      if (anchor.inner.length > title.length) {
        title = anchor.inner
      }
      if (!image) {
        image = findFirstImage(windowHtml, baseUrl)
      }
      if (!money) {
        // Prefer Amazon's split price spans: on a no-JS fetch parseMoney would
        // read "$ 9 . 99" and drop the cents, so reconstruct it exactly first,
        // then fall back to the generic text price (Alibaba, rendered pages).
        money = parseSplitPriceSpans(windowHtml) ?? parseMoney(stripTags(windowHtml))
      }
    }

    // The anchor text is missing, or is really the price block (an Amazon /dp/
    // link that wraps only the price) — try the card's title=/alt= attribute for
    // the real product name before giving up.
    if (!title || looksLikePriceOnly(title)) {
      const firstWindow = html.slice(group[0].index, group[0].index + radius)
      const fallback =
        attrNear(firstWindow, "title") || attrNear(firstWindow, "alt") || ""
      if (fallback) {
        title = fallback
      }
    }

    // Still only a price string? The detail URL's slug is the last chance at the
    // real name (Amazon's "/<slug>/dp/<ASIN>"). Recovering it turns a card that
    // would be dropped — or shipped named "$11.50" — into a real listing.
    if ((!title || looksLikePriceOnly(title)) && options.titleFromUrl) {
      const fromUrl = options.titleFromUrl(group[0].url)
      if (fromUrl) {
        title = fromUrl
      }
    }

    title = title.trim()
    // Drop a card whose only usable "title" is a price string — better no listing
    // than a product named "$11.50".
    if (!title || looksLikePriceOnly(title)) {
      continue
    }
    // Drop non-product variant/refinement links ("9 Sizes", "See more") that
    // match the detail-URL pattern but have a too-thin title and no price.
    if (tokens(title).length < 2 && money === undefined) {
      continue
    }

    results.push({
      title,
      product_url: group[0].url,
      image_url: image,
      price_cents: money?.price_cents,
      price_text: money?.price_text,
      currency: money?.currency,
      raw: { normalized_url: normUrl, card_count: group.length },
    })
  }

  return results
}

function jsonLdImage(value: unknown, baseUrl: string): string {
  if (typeof value === "string") {
    return absoluteUrl(value, baseUrl)
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = jsonLdImage(entry, baseUrl)
      if (url) {
        return url
      }
    }
    return ""
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return jsonLdImage(record.url ?? record.contentUrl, baseUrl)
  }
  return ""
}

function jsonLdPrice(offers: unknown): ParsedMoney | undefined {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : []
  let best: ParsedMoney | undefined
  for (const offer of list) {
    if (!offer || typeof offer !== "object") {
      continue
    }
    const record = offer as Record<string, unknown>
    const raw = record.lowPrice ?? record.price ?? record.priceSpecification
    const priceValue =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>).price
        : raw
    const amount = Number(stringValue(priceValue).replace(/,/g, ""))
    if (!Number.isFinite(amount) || amount <= 0) {
      continue
    }
    const cents = Math.round(amount * 100)
    if (!best || cents < best.price_cents) {
      best = {
        price_cents: cents,
        price_text: stringValue(priceValue),
        currency: stringValue(record.priceCurrency) || "USD",
      }
    }
  }
  return best
}

function productFromJsonLd(
  record: Record<string, unknown>,
  baseUrl: string
): MarketplaceSearchResult | undefined {
  const title = stringValue(record.name)
  const url = absoluteUrl(
    stringValue(record.url) || stringValue(record["@id"]),
    baseUrl
  )
  if (!title || !url) {
    return undefined
  }
  const money = jsonLdPrice(record.offers)
  const brand =
    typeof record.brand === "object" && record.brand
      ? stringValue((record.brand as Record<string, unknown>).name)
      : stringValue(record.brand)

  return {
    title,
    product_url: url,
    image_url: jsonLdImage(record.image, baseUrl),
    price_cents: money?.price_cents,
    price_text: money?.price_text,
    currency: money?.currency,
    brand: brand || undefined,
    raw: { source: "json-ld" },
  }
}

/**
 * Extract results from schema.org JSON-LD (Product / ItemList). This is the most
 * stable signal when a marketplace emits it, and a no-op (empty array) when it
 * doesn't.
 */
export function parseJsonLdResults(
  html: string,
  baseUrl: string
): MarketplaceSearchResult[] {
  const records = jsonLdBlocks(html).flatMap(flattenJsonLd)
  const results: MarketplaceSearchResult[] = []

  for (const record of records) {
    const type = String(record["@type"] ?? "").toLowerCase()

    if (type === "product") {
      const product = productFromJsonLd(record, baseUrl)
      if (product) {
        results.push(product)
      }
      continue
    }

    if (type === "itemlist" && Array.isArray(record.itemListElement)) {
      for (const element of record.itemListElement) {
        if (!element || typeof element !== "object") {
          continue
        }
        const elementRecord = element as Record<string, unknown>
        const item =
          elementRecord.item && typeof elementRecord.item === "object"
            ? (elementRecord.item as Record<string, unknown>)
            : elementRecord
        const product = productFromJsonLd(item, baseUrl)
        if (product) {
          results.push(product)
        }
      }
    }
  }

  return results
}

/** Merge result sets, preferring the first-seen entry per normalized URL but
 * back-filling missing image/price from later sources. */
export function dedupeResults(
  resultSets: MarketplaceSearchResult[][]
): MarketplaceSearchResult[] {
  const byUrl = new Map<string, MarketplaceSearchResult>()

  for (const set of resultSets) {
    for (const result of set) {
      if (!result.product_url || !result.title.trim()) {
        continue
      }
      const key = normalizeProductUrl(result.product_url)
      const existing = byUrl.get(key)
      if (!existing) {
        byUrl.set(key, { ...result })
        continue
      }
      if (!existing.image_url && result.image_url) {
        existing.image_url = result.image_url
      }
      if (existing.price_cents === undefined && result.price_cents !== undefined) {
        existing.price_cents = result.price_cents
        existing.price_text = result.price_text
        existing.currency = result.currency
      }
    }
  }

  return [...byUrl.values()]
}
