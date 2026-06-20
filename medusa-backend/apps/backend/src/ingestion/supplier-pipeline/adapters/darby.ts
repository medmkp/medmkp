import {
  cleanProductName,
  firstMatch,
  metaContent,
  productImageUrls,
  uniqueImageUrls,
} from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

/**
 * Darby Dental (darbydental.com) is a Magento 2 storefront. Product pages carry
 * two reliable JSON payloads even when fetched logged-out:
 *
 *   1. `magentoStorefrontEvents.context.setProduct({...})` — the authoritative
 *      product object: sku, name, productType, pricing.regularPrice, image.
 *   2. A GA4 `dl4Objects` dataLayer array whose `ecommerce.items[0]` carries
 *      item_brand, item_category2 (the real department) and item_stock_status.
 *
 * Pricing is public on Darby, so `product:price:amount` meta + the JSON price
 * agree. We extract from the JSON first and fall back to meta tags.
 *
 * Darby's `name` is always `"<darbySku>, <description...>, <mfrCatalog#>"`, so
 * the leading token is the Darby item number and the trailing token is the
 * manufacturer catalog number (the cross-supplier match key).
 */

function jsonAfter(html: string, marker: string): Record<string, unknown> | undefined {
  const start = html.indexOf(marker)

  if (start < 0) {
    return undefined
  }

  const braceStart = html.indexOf("{", start)

  if (braceStart < 0) {
    return undefined
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = braceStart; i < html.length; i++) {
    const char = html[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === "{") {
      depth++
    } else if (char === "}") {
      depth--

      if (depth === 0) {
        try {
          return JSON.parse(html.slice(braceStart, i + 1)) as Record<string, unknown>
        } catch {
          return undefined
        }
      }
    }
  }

  return undefined
}

function setProductPayload(html: string) {
  return jsonAfter(html, "setProduct(")
}

function ga4Item(html: string): Record<string, unknown> | undefined {
  // The GA4 `dl4Objects` array nests product fields under ecommerce.items[].
  // jsonAfter("[") returns the first object inside that items array.
  const start = html.indexOf("dl4Objects")

  if (start < 0) {
    return undefined
  }

  const itemMarker = html.indexOf('"items"', start)

  if (itemMarker < 0) {
    return undefined
  }

  return jsonAfter(html.slice(itemMarker), "[")
}

function priceString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString()
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim()
  }

  return ""
}

function pricing(product: Record<string, unknown> | undefined) {
  const p = product?.pricing

  if (p && typeof p === "object") {
    const record = p as Record<string, unknown>
    return priceString(record.specialPrice) || priceString(record.regularPrice) || priceString(record.minimalPrice)
  }

  return ""
}

function stringField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key]
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Darby names lead with the Darby item number and end with the manufacturer
 * catalog number, e.g. "9543404, Mity K-Files, , #15, 6/Pkg, 21mm, 2K1015".
 */
function splitDarbyName(rawName: string, sku: string) {
  const tokens = rawName
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  // Drop the leading Darby item number when present.
  if (tokens.length && (tokens[0] === sku || /^\d{5,}$/.test(tokens[0]))) {
    tokens.shift()
  }

  const last = tokens[tokens.length - 1] ?? ""
  const looksLikeMpn =
    /[A-Za-z0-9]/.test(last) &&
    /\d/.test(last) &&
    last.length >= 3 &&
    !/\//.test(last) &&
    !/^\d+\s*(?:mm|cm|ml|mg|g|oz|ga|gauge)$/i.test(last) &&
    !/^#/.test(last)

  const manufacturerSku = looksLikeMpn ? last : ""
  const nameTokens = manufacturerSku ? tokens.slice(0, -1) : tokens

  return {
    name: cleanProductName(nameTokens.join(", ")),
    manufacturerSku,
  }
}

function packSize(name: string) {
  return firstMatch(name, [
    /([0-9][0-9,]*\s*\/\s*(?:bag|box|case|pack|pkg|bottle|tube|syringe|unit|roll|sheet))/i,
    /((?:bag|box|case|pack|pkg|bottle|tube|syringe|unit)\s+of\s+[0-9][A-Za-z0-9/-]*)/i,
  ])
}

function priceBasis(name: string): "each" | "case" | "pack" {
  if (/\bcase\b/i.test(name) || /\/\s*case/i.test(name)) {
    return "case"
  }

  if (/\/\s*(?:bag|box|pack|pkg|bottle|tube)|\b(?:box|bag|pack|pkg)\s+of\b/i.test(name)) {
    return "pack"
  }

  return "each"
}

function availability(value: string): "in_stock" | "backordered" | "unknown" {
  const lower = value.toLowerCase()

  if (lower.includes("in stock") || lower.includes("instock")) {
    return "in_stock"
  }

  if (lower.includes("backorder")) {
    return "backordered"
  }

  return "unknown"
}

function imageUrls(
  candidate: ProductPageCandidate,
  html: string,
  product: Record<string, unknown> | undefined
) {
  const mainImage = stringField(product, "mainImageUrl")

  return uniqueImageUrls(
    [mainImage, ...productImageUrls(html, candidate.url)],
    candidate.url
  )
}

export function darbyProductExtract(
  candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow {
  const product = setProductPayload(html)
  const ga4 = ga4Item(html)

  const sku =
    stringField(product, "sku") ||
    stringField(product, "topLevelSku") ||
    firstMatch(html, [/class=["']mr-2["']>\s*Item\s*#:\s*<\/span>\s*<span[^>]*>\s*([A-Za-z0-9._-]+)/i]) ||
    firstMatch(candidate.url, [/\/([0-9][A-Za-z0-9-]*)\.html?$/i])

  const rawName = stringField(product, "name") || stringField(ga4, "item_name")
  const { name, manufacturerSku } = splitDarbyName(rawName, sku)

  const brand = stringField(ga4, "item_brand")
  const subcategory = stringField(ga4, "item_category2")
  const price =
    pricing(product) ||
    priceString(ga4?.price) ||
    metaContent(html, ["product:price:amount", "og:price:amount"])
  const stock = stringField(ga4, "item_stock_status")
  const images = imageUrls(candidate, html, product)

  return {
    sku,
    manufacturer_sku: manufacturerSku || undefined,
    brand: brand || undefined,
    name: name || cleanProductName(rawName),
    description: name || cleanProductName(rawName),
    category: subcategory || candidate.category || "Dental supplies",
    subcategory,
    product_line: "",
    product_url: stringField(product, "canonicalUrl") || candidate.url,
    image_url: images[0] ?? "",
    pack_size: packSize(name),
    unit_of_measure: "",
    price,
    price_basis: priceBasis(name),
    availability: availability(stock),
    min_quantity: 1,
    raw: {
      extracted_by: "darby",
      darby_item_number: sku,
      product_type: stringField(product, "productType"),
      source_page_url: candidate.url,
      sitemap_url: candidate.sitemap_url,
      confidence_score: candidate.confidence_score,
      reasons: candidate.reasons,
      image_urls: images,
    },
  }
}

export const darbyDentalAdapter: SupplierProductAdapter = {
  id: "darby",
  matches: (candidate: ProductPageCandidate) =>
    /darbydental\.com/i.test(candidate.url) ||
    candidate.distributor.toLowerCase().includes("darby"),
  extractProduct: darbyProductExtract,
}
