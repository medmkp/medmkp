import { decodeHtml, decodeHtmlEntities } from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

/**
 * Patterson Dental (pattersondental.com) is a large distributor on a server-
 * rendered ASP.NET stack. Product pages live at /Supplies/ItemDetail/{public
 * item number} and are reachable logged-out, but UnitPrice is null until a
 * customer signs in — so, like Henry Schein, Patterson is an IDENTITY layer
 * (name, brand, MPN, pack) with no public price.
 *
 * The page carries no JSON-LD. Instead the server embeds an HTML-entity-encoded
 * item model (…&quot;PublicItemNumber&quot;:&quot;070107516&quot;…) plus a set
 * of plain hidden inputs (id="ItemSkuDetail_PublicItemNumber" value="…"). The
 * model is DOUBLE-encoded: a special char in a value is first an HTML entity in
 * Patterson's data, then JSON-escaped, then the whole blob is HTML-entity
 * encoded for the page — so "Brush & Paste" ships as `Brush &amp; Paste`.
 * We undo the page entities once, then per field undo the JSON escape and the
 * inner HTML entity (decodeModelValue) so names/brands read correctly. We pull
 * the handful of stable fields:
 *
 *   - PublicItemNumber       → sku (Patterson item number, in the URL)
 *   - ManufacturerItemNumber → manufacturer_sku (the real MPN; cross-matches)
 *   - VendorName             → brand (manufacturer)
 *   - SeoFriendlyProductFamilyTitle + ItemDescription → name
 *   - "Package Quantity" attribute → pack_size
 *   - UnitOfMeasure          → unit_of_measure
 *
 * No price and no GTIN are published logged-out, so Patterson rows write no
 * price snapshot and feed substitute matching by MPN / name+brand.
 */

const ITEM_DETAIL_RE = /\/Supplies\/ItemDetail\/(\d+)/i

// A model string value, after the page-level entity decode, still carries JSON
// escapes plus an inner HTML entity (e.g. `Brush &amp; Paste`). Undo the
// JSON layer (\uXXXX, \", \\, \/, …) then the HTML entity, so the value reads as
// the original text ("Brush & Paste"). Falls back to a manual \uXXXX unescape if
// the captured fragment isn't a parseable JSON string.
function decodeModelValue(raw: string): string {
  let jsonDecoded = raw
  try {
    jsonDecoded = JSON.parse(`"${raw}"`)
  } catch {
    jsonDecoded = raw
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\(["\\/])/g, "$1")
  }
  return decodeHtml(jsonDecoded)
}

function jsonField(decoded: string, key: string): string {
  const match = decoded.match(
    new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`)
  )
  return match ? decodeModelValue(match[1]) : ""
}

function hiddenInput(decoded: string, idSuffix: string): string {
  const match = decoded.match(
    new RegExp(`id="ItemSkuDetail_${idSuffix}"[^>]*value="([^"]*)"`, "i")
  )
  return match ? match[1].trim() : ""
}

// Name/Value attribute pairs the model renders, e.g.
//   {"Name":"Package Quantity","Value":"1/Pkg"}
function attributeValue(decoded: string, name: string): string {
  const match = decoded.match(
    new RegExp(`"Name"\\s*:\\s*"${name}"\\s*,\\s*"Value"\\s*:\\s*"([^"]*)"`, "i")
  )
  return match ? decodeModelValue(match[1]) : ""
}

function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Family is the product ("Resin Handle Ultrasonic Scaler Inserts"), the item
// description is the variant ("Universal 10, 25 kHz, Orange"). Join them, but
// avoid the common case where the description already restates the family.
function buildName(family: string, description: string): string {
  const fam = decodeHtml(humanize(family))
  const desc = description.trim()
  if (!desc) return fam
  if (!fam) return desc
  if (desc.toLowerCase().startsWith(fam.toLowerCase())) return desc
  return `${fam} - ${desc}`
}

const PACK_RE =
  /([0-9][0-9,]*\s*\/\s*(?:bag|box|bx|case|cs|pack|pk|pkg|bottle|btl|tube|syringe|sleeve|slv|unit|ea|each|cartridge|roll|pair|pr)s?)\b/i

function packFromText(text: string): string {
  const match = text.match(PACK_RE)
  return match ? match[1].replace(/\s+/g, "") : ""
}

export function extractPattersonProduct(
  html: string,
  url: string
): ExtractedProductRow | null {
  const decoded = decodeHtmlEntities(html)

  const sku =
    hiddenInput(decoded, "PublicItemNumber") || jsonField(decoded, "PublicItemNumber")
  if (!sku) return null

  const mpn = jsonField(decoded, "ManufacturerItemNumber")
  const brand =
    jsonField(decoded, "VendorName") || attributeValue(decoded, "Manufacturer Name")
  const family = jsonField(decoded, "SeoFriendlyProductFamilyTitle")
  const description = jsonField(decoded, "ItemDescription")
  const name = buildName(family, description)
  if (!name) return null

  const unitOfMeasure = jsonField(decoded, "UnitOfMeasure")
  const packAttribute = attributeValue(decoded, "Package Quantity")
  const packSize = packFromText(packAttribute) || packFromText(`${name} ${description}`)

  return {
    sku,
    // The real manufacturer part number when present; fall back to the Patterson
    // item number so the matcher always has a blocking key.
    manufacturer_sku: mpn || sku,
    brand,
    name,
    description: description || name,
    product_url: url,
    pack_size: packSize,
    unit_of_measure: unitOfMeasure ? unitOfMeasure.toLowerCase() : undefined,
    // No public price logged-out → identity-only row, no snapshot downstream.
    availability: "unknown",
    raw: {
      extracted_by: "patterson",
      sku,
      mpn,
      vendor_name: brand,
      source_page_url: url,
    },
  }
}

function extractProduct(
  candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow {
  return (
    extractPattersonProduct(html, candidate.url) ?? {
      sku: "",
      name: "",
      product_url: candidate.url,
      raw: { extracted_by: "patterson", source_page_url: candidate.url },
    }
  )
}

export const pattersonAdapter: SupplierProductAdapter = {
  id: "patterson",
  matches: (candidate: ProductPageCandidate) =>
    /pattersondental\.com/i.test(candidate.url) ||
    /patterson/i.test(candidate.distributor),
  extractProduct,
}

export function isPattersonItemUrl(url: string): boolean {
  return ITEM_DETAIL_RE.test(url)
}
