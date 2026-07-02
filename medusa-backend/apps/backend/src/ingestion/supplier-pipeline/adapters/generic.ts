import {
  decodeHtml,
  firstMatch,
  flattenJsonLd,
  jsonLdBlocks,
  metaContent,
  nestedString,
  productImageUrls,
  productJsonLd,
  stringValue,
  stripTags,
} from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

function offerRecord(product: Record<string, unknown> | undefined) {
  const offers = product?.offers
  const firstOffer = Array.isArray(offers) ? offers[0] : offers

  return firstOffer && typeof firstOffer === "object"
    ? (firstOffer as Record<string, unknown>)
    : undefined
}

function priceFromProductJson(product: Record<string, unknown> | undefined) {
  return stringValue(offerRecord(product)?.price)
}

function availabilityFromProductJson(
  product: Record<string, unknown> | undefined
) {
  const raw = stringValue(offerRecord(product)?.availability).toLowerCase()

  if (raw.includes("instock")) {
    return "in_stock"
  }

  if (raw.includes("outofstock")) {
    return "unknown"
  }

  return undefined
}

function extractPrice(html: string, product: Record<string, unknown> | undefined) {
  return (
    priceFromProductJson(product) ||
    metaContent(html, ["product:price:amount", "og:price:amount"]) ||
    firstMatch(html, [
      /(?:price|sale-price|product-price)[^$]{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
      /\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    ])
  )
}

// Roots that carry no categorical meaning — drop them so a product filed
// directly under the shop root doesn't get "All Products" as its category.
const BREADCRUMB_ROOT_LABELS = new Set([
  "home",
  "shop",
  "all products",
  "products",
  "catalog",
  "store",
])

// A Schema.org BreadcrumbList's last crumb is the product itself; the one before
// it is the product's (deepest) category.
function categoryFromBreadcrumbList(html: string): string {
  for (const block of jsonLdBlocks(html).flatMap(flattenJsonLd)) {
    const type = block["@type"]
    const isBreadcrumb = Array.isArray(type)
      ? type.some((entry) => String(entry).toLowerCase() === "breadcrumblist")
      : String(type).toLowerCase() === "breadcrumblist"
    if (!isBreadcrumb) continue

    const items = Array.isArray(block.itemListElement) ? block.itemListElement : []
    const names = items
      .map((entry) => {
        const record = (entry ?? {}) as Record<string, unknown>
        const item = (record.item as Record<string, unknown>) ?? record
        return stringValue(item.name ?? record.name).trim()
      })
      .filter((name) => name && !BREADCRUMB_ROOT_LABELS.has(name.toLowerCase()))
    if (names.length >= 2) return names[names.length - 2]
  }
  return ""
}

// Fallback for pages that render a visible breadcrumb trail but omit the
// BreadcrumbList JSON-LD (e.g. WooCommerce's <nav class="woocommerce-breadcrumb">).
// The current product is unlinked text, so the last <a> is its category.
function categoryFromBreadcrumbNav(html: string): string {
  const container =
    /<nav[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/nav>/i.exec(html)?.[1] ??
    /<(ol|ul)[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/\1>/i.exec(html)?.[2] ??
    ""
  if (!container) return ""

  const linkTexts = [...container.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => decodeHtml(stripTags(match[1])).trim())
    .filter((text) => text && !BREADCRUMB_ROOT_LABELS.has(text.toLowerCase()))
  return linkTexts.length ? linkTexts[linkTexts.length - 1] : ""
}

// Real product category from the page, in order of reliability. Falls back to ""
// so the caller can decide (generic uses the distributor name only as a last
// resort). Stamping the distributor name unconditionally made every generic-
// crawled supplier's catalog invisible: the catalog read models treat a category
// equal to a supplier name as junk and filter it out.
export function genericCategory(
  html: string,
  product: Record<string, unknown> | undefined
): string {
  return (
    stringValue(product?.category).trim() ||
    categoryFromBreadcrumbList(html) ||
    categoryFromBreadcrumbNav(html)
  )
}

export function genericProductExtract(
  candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow {
  const product = productJsonLd(html)
  const plainText = stripTags(html)
  const title = firstMatch(html, [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ])
  const name =
    nestedString(product, ["name"]) ||
    metaContent(html, ["og:title", "twitter:title"]) ||
    stripTags(title)
  const description =
    nestedString(product, ["description"]) ||
    metaContent(html, ["og:description", "description", "twitter:description"])
  const imageUrls = productImageUrls(html, candidate.url, product)

  return {
    sku:
      nestedString(product, ["sku"]) ||
      firstMatch(html, [/sku[:#\s-]*([A-Za-z0-9._-]{3,})/i]),
    manufacturer_sku:
      nestedString(product, ["mpn"]) ||
      firstMatch(html, [
        /(?:mfg|manufacturer)\s*(?:sku|#|number)[:#\s-]*([A-Za-z0-9._-]{3,})/i,
      ]),
    brand:
      nestedString(product, ["brand", "name"]) ||
      stringValue(product?.brand) ||
      metaContent(html, ["product:brand"]),
    name,
    description,
    category: genericCategory(html, product) || candidate.distributor,
    subcategory: "",
    product_line: "",
    product_url: candidate.url,
    pack_size: firstMatch(plainText, [
      /((?:box|pkg|pack|package|case|bag|bottle|tube|syringe|unit)\s+of\s+[0-9][A-Za-z0-9/-]*)/i,
    ]),
    unit_of_measure: "",
    image_url: imageUrls[0] ?? "",
    price: extractPrice(html, product),
    price_basis: "each",
    availability: availabilityFromProductJson(product),
    min_quantity: 1,
    raw: {
      extracted_by: "generic",
      sitemap_url: candidate.sitemap_url,
      confidence_score: candidate.confidence_score,
      reasons: candidate.reasons,
      image_urls: imageUrls,
    },
  }
}

export const genericAdapter: SupplierProductAdapter = {
  id: "generic",
  matches: () => true,
  extractProduct: genericProductExtract,
}
