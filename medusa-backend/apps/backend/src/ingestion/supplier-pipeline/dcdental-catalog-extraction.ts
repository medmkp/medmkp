import { stripTags } from "./html"
import { downloadText } from "./sitemap-discovery"
import { normalizeSiteUrl } from "./suppliers"
import {
  apiImageValues,
  availability,
  normalizeBarcode,
  packSize,
  price,
} from "./adapters/dcdental"
import type {
  ExtractedProductRow,
  ProductExtractionResult,
  ProductPageCandidate,
  SupplierSeedRow,
} from "./types"

// DC Dental runs on NetSuite SuiteCommerce. Its /api/items endpoint refuses
// offset >= 5000, so the catalog (~40k items) cannot be walked flat. Instead we
// page it one category at a time (every category is well under the cap), reading
// the category tree from the API's own `category` facet. An explicit `fields`
// list (not fieldset=details) returns the GTIN/UPC `upccode` alongside the
// nested price/image objects a row needs, so rows are built directly here
// without a per-product fetch. Products cross-list across categories, so results
// are deduped by SKU; a final completeness check against the catalog `total`
// guards against a partial set being handed to the delete-and-replace commit.
const DC_DENTAL_COMPANY_ID = "1075085"
const DC_DENTAL_SITE_ID = "3"
const CATALOG_PAGE_SIZE = 100
const MAX_OFFSET = 5000 // NetSuite hard cap; pages must keep offset < this
const PAGE_FETCH_ATTEMPTS = 3
// Categories at/above the offset cap are inclusive parents whose products are
// also reachable through their (smaller) child categories, so they are skipped.
const CATEGORY_SKIP_AT = MAX_OFFSET
// The original per-category crawl recovered ~99.7% of `total`; require most of
// the catalog so a broken partition can't silently shrink it.
const MIN_COMPLETE_RATIO = 0.97

const CATALOG_FIELDS = [
  "internalid", "itemid", "upccode", "manufacturer",
  "storedisplayname2", "storedescription", "storedetaileddescription",
  "custitem_quik_view_subcat2", "custitem_dc_specs",
  "onlinecustomerprice_detail", "isinstock", "isbackorderable",
  "quantityavailable", "urlcomponent", "itemimages_detail", "itemimages", "itemimage",
].join(",")
const DISCOVERY_FIELDS = ["internalid", "itemid", "urlcomponent"].join(",")

type DcDentalCatalogItem = {
  internalid?: number | string
  itemid?: string
  upccode?: string
  manufacturer?: string
  storedisplayname2?: string
  storedescription?: string
  storedetaileddescription?: string
  custitem_quik_view_subcat2?: string
  custitem_dc_specs?: string
  urlcomponent?: string
  quantityavailable?: number
  isinstock?: boolean
  isbackorderable?: boolean
  onlinecustomerprice_detail?: {
    onlinecustomerprice?: number
    onlinecustomerprice_formatted?: string
  }
  itemimage?: unknown
  itemimages?: unknown
  itemimages_detail?: unknown
}

type DcDentalCategoryNode = { id?: string; values?: DcDentalCategoryNode[] }
type DcDentalApiResponse = {
  total?: number
  items?: DcDentalCatalogItem[]
  facets?: Array<{ id?: string; values?: DcDentalCategoryNode[] }>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function dcDentalSupplier(supplier: SupplierSeedRow) {
  try {
    const site = normalizeSiteUrl(supplier.website_url)
    return /dcdental\.com$/i.test(new URL(site.origin).hostname) ||
      /dc dental/i.test(supplier.distributor)
  } catch {
    return /dc dental/i.test(supplier.distributor)
  }
}

function isDcDentalCandidate(candidate: ProductPageCandidate) {
  try {
    return /dcdental\.com$/i.test(new URL(candidate.url).hostname)
  } catch {
    return false
  }
}

function supplierOrigin(supplier: SupplierSeedRow) {
  try {
    return new URL(normalizeSiteUrl(supplier.website_url).origin).origin
  } catch {
    return "https://www.dcdental.com"
  }
}

function apiUrl(origin: string, params: Record<string, string>) {
  const search = new URLSearchParams({
    c: DC_DENTAL_COMPANY_ID,
    country: "US",
    currency: "USD",
    language: "en",
    n: DC_DENTAL_SITE_ID,
    pricelevel: "10",
    ...params,
  })
  return `${origin}/api/items?${search.toString()}`
}

async function fetchJson(url: string, timeoutMs?: number): Promise<DcDentalApiResponse> {
  for (let attempt = 1; attempt <= PAGE_FETCH_ATTEMPTS; attempt += 1) {
    const response = await downloadText(url, timeoutMs)
    if (response.ok && response.body) {
      try {
        return JSON.parse(response.body) as DcDentalApiResponse
      } catch {
        throw new Error(`DC Dental API returned non-JSON: ${url}`)
      }
    }
    if (attempt === PAGE_FETCH_ATTEMPTS) {
      throw new Error(`DC Dental API fetch failed (status ${response.status}): ${url}`)
    }
    await sleep(500 * attempt)
  }
  throw new Error(`DC Dental API fetch failed: ${url}`)
}

function flattenCategoryPaths(nodes: DcDentalCategoryNode[] | undefined, acc: string[]) {
  for (const node of nodes ?? []) {
    if (typeof node.id === "string" && node.id !== "Home") {
      acc.push("/" + node.id.replace(/^Home\//, ""))
    }
    flattenCategoryPaths(node.values, acc)
  }
}

async function fetchCategoryPaths(origin: string, timeoutMs?: number): Promise<string[]> {
  const json = await fetchJson(
    apiUrl(origin, { include: "facets", fields: "internalid", limit: "1", offset: "0" }),
    timeoutMs
  )
  const categoryFacet = (json.facets ?? []).find((facet) => facet.id === "category")
  const paths: string[] = []
  flattenCategoryPaths(categoryFacet?.values, paths)
  return [...new Set(paths)]
}

// Page a single category. Skips inclusive parents at/above the offset cap (their
// products are reached via child categories); every other category is fully read.
async function fetchCategoryItems(
  origin: string,
  categoryUrl: string,
  fields: string,
  timeoutMs?: number
): Promise<DcDentalCatalogItem[]> {
  const first = await fetchJson(
    apiUrl(origin, { commercecategoryurl: categoryUrl, fields, limit: String(CATALOG_PAGE_SIZE), offset: "0" }),
    timeoutMs
  )
  const total = typeof first.total === "number" ? first.total : 0
  const items = [...(first.items ?? [])]
  if (total >= CATEGORY_SKIP_AT) {
    return items
  }
  for (let offset = CATALOG_PAGE_SIZE; offset < total && offset < MAX_OFFSET; offset += CATALOG_PAGE_SIZE) {
    const page = await fetchJson(
      apiUrl(origin, { commercecategoryurl: categoryUrl, fields, limit: String(CATALOG_PAGE_SIZE), offset: String(offset) }),
      timeoutMs
    )
    items.push(...(page.items ?? []))
  }
  return items
}

// A run that can't confirm it has most of the catalog must abort, never return a
// partial set: the extracted products feed a delete-and-replace commit, so a stub
// hard-deletes the rest of the catalog. An unknown size (total<=0, e.g. a transient
// head-request hiccup) is treated as a failure rather than silently "complete" —
// the bug that let a 1,002-row partial replace 39,559 real rows.
export function assertDcDentalCatalogComplete(
  collected: number,
  total: number,
  categories: number
) {
  if (total <= 0) {
    throw new Error(
      `DC Dental catalog size unknown (total=${total}); refusing to treat it as complete — aborting rather than risk a partial replace`
    )
  }
  if (collected < total * MIN_COMPLETE_RATIO) {
    throw new Error(
      `DC Dental catalog incomplete: collected ${collected} of ${total} items across ${categories} categories; aborting to avoid a partial replace`
    )
  }
}

// Walk every category and dedupe by SKU. All-or-nothing: any unrecoverable page
// fetch throws, and an unknown/short collected count throws, so the commit never
// replaces the supplier with a partial catalog.
async function fetchCatalogItems(
  origin: string,
  fields: string,
  options: { timeoutMs?: number } = {}
): Promise<DcDentalCatalogItem[]> {
  const head = await fetchJson(apiUrl(origin, { fields: "internalid", limit: "1", offset: "0" }), options.timeoutMs)
  const total = typeof head.total === "number" ? head.total : 0
  // Fail before the (expensive) category walk when the catalog size is unknown.
  if (total <= 0) {
    assertDcDentalCatalogComplete(0, total, 0)
  }
  const paths = await fetchCategoryPaths(origin, options.timeoutMs)

  const bySku = new Map<string, DcDentalCatalogItem>()
  for (const path of paths) {
    const items = await fetchCategoryItems(origin, path, fields, options.timeoutMs)
    for (const item of items) {
      const sku = item.itemid?.trim()
      if (sku && !bySku.has(sku)) {
        bySku.set(sku, item)
      }
    }
  }

  const collected = [...bySku.values()]
  assertDcDentalCatalogComplete(collected.length, total, paths.length)
  return collected
}

// itemimages_detail is shaped { urls: [{ url, altimagetext }] }, which the
// adapter's apiImageValues (url/src/fullurl/... keys) does not traverse — the
// per-product path got images from page HTML instead. Pull the urls array here.
function detailImageUrls(detail: unknown): string[] {
  if (!detail || typeof detail !== "object") {
    return []
  }
  const urls = (detail as { urls?: unknown }).urls
  if (!Array.isArray(urls)) {
    return apiImageValues(detail)
  }
  return urls.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry]
    }
    if (entry && typeof entry === "object") {
      const url = (entry as { url?: unknown }).url
      return typeof url === "string" ? [url] : []
    }
    return []
  })
}

function imageUrls(origin: string, item: DcDentalCatalogItem) {
  const apiImages = [
    ...apiImageValues(item.itemimage),
    ...apiImageValues(item.itemimages),
    ...detailImageUrls(item.itemimages_detail),
  ]
  return [
    ...new Set(
      apiImages
        .map((url) => {
          try {
            return new URL(url, origin).href
          } catch {
            return ""
          }
        })
        .filter(Boolean)
    ),
  ]
}

function productUrl(origin: string, item: DcDentalCatalogItem) {
  if (!item.urlcomponent) {
    return ""
  }
  try {
    return new URL(`/${item.urlcomponent}`, origin).href
  } catch {
    return ""
  }
}

// storedisplayname2 is usually the product name but is occasionally just the
// SKU; fall back to the (tag-stripped) store description before using the SKU.
function productName(item: DcDentalCatalogItem, sku: string) {
  const display = item.storedisplayname2?.trim() || ""
  const described = stripTags(item.storedescription ?? "").trim()
  if (display && display !== sku) {
    return display
  }
  return described || display || sku
}

export function dcDentalItemToRow(item: DcDentalCatalogItem, origin: string): ExtractedProductRow {
  const sku = item.itemid?.trim() || ""
  const name = productName(item, sku)
  const description = stripTags(item.storedetaileddescription ?? "").trim() || name
  const subcategory = item.custitem_quik_view_subcat2?.trim() || ""
  const images = imageUrls(origin, item)
  const url = productUrl(origin, item)

  return {
    sku,
    manufacturer_sku: sku,
    barcode: normalizeBarcode(item),
    brand: item.manufacturer ?? "",
    name,
    description,
    category: subcategory || "Dental supplies",
    subcategory,
    product_line: subcategory,
    product_url: url,
    image_url: images[0] ?? "",
    pack_size: packSize(`${name} ${description} ${item.custitem_dc_specs ?? ""}`),
    unit_of_measure: "",
    price: price(item),
    price_basis: "each",
    availability: availability(item),
    min_quantity: 1,
    raw: {
      extracted_by: "dcdental-catalog-api",
      internalid: item.internalid,
      quantityavailable: item.quantityavailable,
      source_page_url: url || origin,
      image_urls: images,
    },
  }
}

// Index-stage helper: enumerate every product URL once via the category walk
// (lightweight fields), so the index stage produces real product candidates.
export async function discoverDcDentalCatalogProductUrls(
  suppliers: SupplierSeedRow[],
  options: { timeoutMs?: number } = {}
): Promise<{ supplier: SupplierSeedRow; origin: string; urls: string[] } | null> {
  const supplier = suppliers.find(dcDentalSupplier)
  if (!supplier) {
    return null
  }

  const origin = supplierOrigin(supplier)
  const items = await fetchCatalogItems(origin, DISCOVERY_FIELDS, options)
  const urls = items.map(
    (item) => productUrl(origin, item) || `${origin}/item-${item.internalid ?? item.itemid}`
  )
  return { supplier, origin, urls }
}

// Extract-stage pre-pass mirroring the Shopify products.json pre-pass: produce
// every DC Dental row (with barcode) directly from the category walk, and drop
// DC Dental candidates from `remaining` so per-product extraction skips them.
export async function extractDcDentalCatalogProducts(
  candidates: ProductPageCandidate[],
  suppliers: SupplierSeedRow[],
  options: { timeoutMs?: number } = {}
): Promise<ProductExtractionResult & { remaining: ProductPageCandidate[] }> {
  const supplier = suppliers.find(dcDentalSupplier)
  if (!supplier) {
    return { products: [], failures: [], remaining: candidates }
  }

  const origin = supplierOrigin(supplier)
  const remaining = candidates.filter((candidate) => !isDcDentalCandidate(candidate))
  const items = await fetchCatalogItems(origin, CATALOG_FIELDS, options)
  const products = items.map((item) => dcDentalItemToRow(item, origin))

  return { products, failures: [], remaining }
}
