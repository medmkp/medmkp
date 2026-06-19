import {
  decodeHtml,
  flattenJsonLd,
  jsonLdBlocks,
  nestedString,
  stringValue,
} from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

/**
 * Henry Schein (henryschein.com) is a distributor on Microsoft Commerce Server.
 * Prices are login-gated (the public `offers.price` is $0.00), but the catalog
 * is otherwise open: every search / category listing page embeds one
 * `application/ld+json` Product block per item with name, brand, mpn and sku.
 * We ingest those as **identity only** (no price) so a scanned HS item resolves
 * to a real product, then surface priced substitutes from other suppliers.
 *
 * The JSON-LD `sku` is the Henry Schein item number (e.g. "1014583"), which is
 * exactly the REF printed on the box and the Product/Catalog Number encoded in
 * the HIBC barcode — so it doubles as the scan-to-identity key (see hibc.ts).
 *
 * A listing page carries many products, so this adapter implements
 * extractProducts() (plural); extractProduct() returns the first for the
 * single-product pipeline contract.
 */

type HsProduct = Record<string, unknown>

// Turn a URL path slug ("elements-biodeg-nitrile-glv") into a display label.
function humanize(slug: string) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// HS product URLs look like
//   /us-en/dental/p/<category>/<subcategory>/<product-slug>/<itemId>?...
// so the two path segments after "/p/" are the taxonomy.
function categoryFromUrl(url: string): { category: string; subcategory: string } {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean)
    const pIndex = segments.indexOf("p")
    const taxonomy = pIndex >= 0 ? segments.slice(pIndex + 1) : []
    return {
      category: taxonomy[0] ? humanize(taxonomy[0]) : "Dental supplies",
      subcategory: taxonomy[1] ? humanize(taxonomy[1]) : "",
    }
  } catch {
    return { category: "Dental supplies", subcategory: "" }
  }
}

// Pull the pack descriptor the name or description carries ("… 200/Bx").
function packSize(text: string) {
  const match = text.match(
    /([0-9][0-9,]*\s*\/\s*(?:bag|box|bx|case|cs|pack|pk|pkg|bottle|tube|syringe|sleeve|slv|unit|cartridge|roll)s?)\b/i
  )
  return match ? match[1].replace(/\s+/g, "") : ""
}

function brandName(product: HsProduct): string {
  const brand = product.brand
  if (typeof brand === "string") return decodeHtml(brand)
  if (brand && typeof brand === "object") {
    return nestedString(brand as Record<string, unknown>, ["name"])
  }
  return ""
}

function isProduct(record: HsProduct): boolean {
  const type = record["@type"]
  return Array.isArray(type)
    ? type.some((t) => String(t).toLowerCase() === "product")
    : String(type).toLowerCase() === "product"
}

// Every Product JSON-LD block on a Henry Schein listing/search page, as
// identity-only catalog rows (no price → no snapshot is written downstream).
export function extractHenryScheinProducts(html: string): ExtractedProductRow[] {
  const products = jsonLdBlocks(html)
    .flatMap(flattenJsonLd)
    .filter(isProduct)

  const rows: ExtractedProductRow[] = []
  const seen = new Set<string>()

  for (const product of products) {
    const sku = stringValue(product.sku)
    const name = stringValue(product.name)
    if (!sku || !name) continue
    if (seen.has(sku)) continue
    seen.add(sku)

    const url = stringValue(product.url)
    const mpn = stringValue(product.mpn)
    const description = stringValue(product.description) || name
    const { category, subcategory } = categoryFromUrl(url)

    rows.push({
      sku,
      // For HS house brand the mpn is an HS-internal code; for distributed
      // manufacturer brands it's the real MPN (cross-matches other suppliers).
      manufacturer_sku: mpn || sku,
      brand: brandName(product),
      name,
      description,
      category,
      subcategory,
      product_url: url,
      image_url: stringValue(product.image),
      pack_size: packSize(`${name} ${description}`),
      // No price: Henry Schein gates pricing behind login, so HS rows are an
      // identity layer only. Omitting price_cents means no price snapshot.
      availability: "unknown",
      raw: {
        extracted_by: "henryschein",
        sku,
        mpn,
        source_page_url: url,
      },
    })
  }

  return rows
}

// Every dental category/subcategory URL linked on a page, absolute and
// de-duplicated. Used by the catalog crawl to walk the tree (top category →
// hub → leaf listing). The browse root is excluded so the crawl doesn't loop
// back to the start.
export function extractHenryScheinCategoryLinks(html: string): string[] {
  const set = new Set<string>()
  for (const m of html.matchAll(/\/us-en\/dental\/c\/([a-z0-9][a-z0-9/_-]*)/gi)) {
    const path = m[1].split("?")[0].replace(/\/+$/, "").toLowerCase()
    if (!path || path.startsWith("browsesupplies")) continue
    set.add(`https://www.henryschein.com/us-en/dental/c/${path}`)
  }
  return [...set]
}

function extractProducts(
  _candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow[] {
  return extractHenryScheinProducts(html)
}

function extractProduct(
  candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow {
  return (
    extractProducts(candidate, html)[0] ?? {
      sku: "",
      name: "",
      product_url: candidate.url,
      raw: { extracted_by: "henryschein", source_page_url: candidate.url },
    }
  )
}

export const henryScheinAdapter: SupplierProductAdapter = {
  id: "henryschein",
  matches: (candidate: ProductPageCandidate) =>
    /henryschein\.com/i.test(candidate.url) ||
    /henry\s*schein/i.test(candidate.distributor),
  extractProduct,
  extractProducts,
}
