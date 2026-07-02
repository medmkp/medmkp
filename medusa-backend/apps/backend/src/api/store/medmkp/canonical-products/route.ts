import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { getPostgresPool } from "../../../../utils/postgres"
import {
  latestPriceSnapshotsByProduct,
  type LatestPriceSnapshot,
} from "../../../../utils/latest-price-snapshots"
import { analyzeOffers, compareOffers, isUnitComparable } from "../../../../matching/offers"
import { MARKETPLACE_SUPPLIER_IDS } from "../../../../ingestion/marketplace/suppliers"

function normalize(value: string | null) {
  return value?.trim().toLowerCase() || ""
}

// Derive a slug-prefix matcher for a stale canonical handle whose trailing id
// suffix changed across a re-match. Auto handles are "auto-<slug>-<idSuffix>";
// the slug is stable but the suffix is regenerated each match (the pre-#321
// positional scheme produced base-36 suffixes like "9i0", the current scheme
// produces 6 hex chars like "093332"). Stripping the final token leaves the
// shared slug, so "...-24-pack-9i0" and "...-24-pack-093332" prefix-match each
// other. Returns null when there is no strippable suffix or the remainder is
// too short to prefix-match safely. The regex anchors the match to exactly one
// trailing id token so a longer slug that merely starts with this one (e.g.
// "...-24-pack-deluxe-093332") can't be mistaken for the same product. (A handle
// carrying a collision counter like "...-093332-2" is intentionally not matched
// — counters require an identical slug AND hash suffix, which is vanishingly
// rare, and the caller's exactly-one guard would reject the ambiguity anyway.)
export function slugPrefixMatcher(
  handle: string
): { like: string; regex: string } | null {
  const stripped = handle.replace(/-[a-z0-9]+$/, "")
  if (!stripped || stripped === handle || !stripped.includes("-")) return null
  return { like: `${stripped}-%`, regex: `^${stripped}-[a-z0-9]+$` }
}

// Synthesize a single-product response for a supplier-product-backed identity
// hit (id "msp_<supplier_product_id>"). The search route returns these for
// products matched by barcode/SKU that have no persisted canonical row (e.g. a
// login-gated Henry Schein item with no price). The product page links to that
// synthetic id, so resolve it directly from the supplier product here instead
// of 404ing. Returns null when the supplier product can't be found.
async function resolveSupplierProductPage(
  medmkp: MedMKPModuleService,
  handle: string
) {
  // The handle is the supplier product's own id (the "msp_" prefix is part of
  // the model id, not an added marker). Fall back to a stripped variant in case
  // a caller prepended the prefix to a bare id.
  const candidateIds = [handle, handle.slice("msp_".length)]
  const [supplierProducts, latestPrices, suppliers] = await Promise.all([
    medmkp.listSupplierProducts({ id: candidateIds }),
    latestPriceSnapshotsByProduct(candidateIds),
    medmkp.listSuppliers(),
  ])
  const supplierProduct = supplierProducts[0]
  if (!supplierProduct) {
    return null
  }
  const supplierProductId = supplierProduct.id
  const supplier = suppliers.find((s) => s.id === supplierProduct.supplier_id)
  const latest = latestPrices.get(supplierProductId)
  const offer =
    latest && latest.price_cents > 0
      ? {
          supplier_product_id: supplierProduct.id,
          supplier_id: supplierProduct.supplier_id,
          supplier_name: supplier?.name ?? "Unknown supplier",
          sku: supplierProduct.sku,
          name: supplierProduct.name,
          brand: supplierProduct.brand,
          image_url: supplierProduct.image_url || "",
          product_url: supplierProduct.product_url || "",
          price_cents: latest.price_cents,
          unit_price_cents: latest.unit_price_cents ?? null,
          pack_quantity: supplierProduct.pack_quantity ?? null,
          base_unit: supplierProduct.base_unit ?? null,
          pack_basis: supplierProduct.pack_basis ?? null,
          pack_size: supplierProduct.pack_size || "",
          availability: latest.availability,
          match_status: "exact",
          unit_comparable: false,
        }
      : null

  return {
    id: handle,
    handle: "",
    name: supplierProduct.name,
    category: (supplierProduct as any).category ?? null,
    description: "",
    unit_of_measure: supplierProduct.base_unit ?? "",
    attributes_text: JSON.stringify({
      brands: supplierProduct.brand ? [supplierProduct.brand] : [],
    }),
    family_id: null,
    family_handle: null,
    family_name: null,
    variant_label: null,
    variant_rank: null,
    offer_count: offer ? 1 : 0,
    best_offer: offer,
    offers: offer ? [offer] : [],
    image_url: supplierProduct.image_url || "",
    price_range_cents: offer
      ? { lowest: offer.price_cents, highest: offer.price_cents }
      : null,
    unit_price_range_cents: null,
    base_unit: supplierProduct.base_unit ?? null,
    unit_comparable: false,
    unit_comparison_basis: offer?.base_unit ?? null,
  }
}

function offerPriceRange(offers: {
  price_cents: number
}[]) {
  if (!offers.length) {
    return null
  }

  const prices = offers.map((offer) => offer.price_cents).sort((a, b) => a - b)
  return {
    lowest: prices[0],
    highest: prices[prices.length - 1],
  }
}

// ---------------------------------------------------------------------------
// Fast category listing
//
// The category drill-down (/app/catalog/[slug]) only needs each product's best
// current offer + offer count, ranked by price. The general path below loads and
// ORM-hydrates the whole capped result's offer graph (e.g. Burs = 533 products →
// 4,300 matches + 4,300 supplier products + 4,300 snapshots) just to return 24
// cards, which took ~8s in production (the take:600 cap does nothing for Burs,
// which is under 600). Here we rank and page in the database using the
// precomputed medmkp_supplier_current_price read model and hydrate nothing — one
// indexed query returns exactly the page. Results are cached briefly since the
// catalog only changes on ingestion.
// ---------------------------------------------------------------------------

type CategoryListItem = {
  id: string
  handle: string
  name: string
  category: string
  // Present when this card represents a multi-variant family (size selector
  // lives on the product page). variant_count is the number of sizes/specs.
  family_id: string | null
  variant_count: number
  offer_count: number
  best_offer: {
    supplier_product_id: string
    supplier_id: string
    supplier_name: string
    sku: string
    name: string
    brand: string | null
    image_url: string
    product_url: string
    price_cents: number
    unit_price_cents: number | null
    pack_quantity: number | null
    base_unit: string | null
    pack_basis: string | null
    pack_size: string
    unit_comparable: boolean
    match_status: string
  }
  offers: never[]
  image_url: string
  price_range_cents: null
}

type CategoryListResult = { count: number; canonical_products: CategoryListItem[] }

// 15 min: the catalog only changes on ingestion, so a cold recompute of a large
// category (~15s) should be paid rarely. The Vercel edge serves stale-while-
// revalidate on top, so this is just the background-revalidation cost.
const CATEGORY_LIST_CACHE_TTL_MS = 15 * 60 * 1000
const categoryListCache = new Map<string, { loadedAt: number; result: CategoryListResult }>()
const categoryListPromises = new Map<string, Promise<CategoryListResult>>()

async function queryCategoryProducts(
  category: string,
  q: string | undefined,
  pattern: string | undefined,
  limit: number,
  offset: number
): Promise<CategoryListResult> {
  const pool = getPostgresPool()
  const qLike = q ? `%${q}%` : null
  // Subcategory drill-down sends a curated POSIX-regex alternation (e.g.
  // "scaler|curette") instead of the chip's display label, because the label is
  // a plural/compound marketing term that rarely appears verbatim in product
  // names (a literal "Scalers & Curettes" substring matched nothing). The regex
  // runs over the already category-scoped CTE (a few thousand rows), so it stays
  // cheap even though ~* can't use the trigram indexes.
  const patternRe = pattern || null

  // Group size/spec variants under one card: the listing unit is the family
  // (COALESCE(family_id, id)). The card's best offer is the cheapest by PER-UNIT
  // price (F1), not sticker; families with no unit price fall back to sticker and
  // rank after the priced ones. unit_price_cents comes straight from the
  // medmkp_supplier_current_price read model (a column, not a per-row join), so
  // this stays the one fast indexed query the listing was built around. The
  // cross-base-unit guard (F2) lives on the product page where offers are
  // compared side by side; a family is variants of one product, so its offers
  // share a base unit in practice. variant_count is the family's size count.
  const { rows } = await pool.query(
    `
    WITH cat AS (
      SELECT id, handle, name, category,
             family_id, family_handle, family_name,
             COALESCE(family_id, id) AS grp
      FROM medmkp_canonical_product
      WHERE category ILIKE $1 AND deleted_at IS NULL
        AND ($2::text IS NULL OR name ILIKE $2 OR handle ILIKE $2
             OR category ILIKE $2 OR family_name ILIKE $2)
        AND ($5::text IS NULL OR name ~* $5 OR handle ~* $5
             OR category ~* $5 OR family_name ~* $5)
    ),
    priced AS (
      SELECT cat.grp, m.supplier_product_id, sp.supplier_id, cp.price_cents, cp.unit_price_cents
      FROM medmkp_canonical_product_match m
      JOIN medmkp_supplier_current_price cp ON cp.supplier_product_id = m.supplier_product_id
      JOIN medmkp_supplier_product sp ON sp.id = m.supplier_product_id
      JOIN cat ON cat.id = m.canonical_product_id
      WHERE m.match_status NOT IN ('unmatched', 'substitute') AND m.deleted_at IS NULL
    ),
    agg AS (
      -- Count distinct suppliers, not raw offers: a family's offers span its
      -- variants (and one supplier may carry several packs), so COUNT(*) inflated
      -- the "N suppliers" badge for multi-variant products.
      SELECT grp, COUNT(DISTINCT supplier_id)::int AS offer_count FROM priced GROUP BY grp
    ),
    best AS (
      SELECT DISTINCT ON (grp) grp, supplier_product_id, price_cents, unit_price_cents
      FROM priced
      ORDER BY grp, (unit_price_cents IS NULL) ASC, unit_price_cents ASC, price_cents ASC
    ),
    grpinfo AS (
      SELECT grp,
             COUNT(*)::int AS variant_count,
             MAX(family_id) AS family_id,
             MAX(family_handle) AS family_handle,
             MAX(family_name) AS family_name,
             (ARRAY_AGG(handle ORDER BY name))[1] AS any_handle,
             (ARRAY_AGG(name ORDER BY name))[1] AS any_name,
             (ARRAY_AGG(category ORDER BY name))[1] AS any_category
      FROM cat GROUP BY grp
    )
    SELECT
      g.grp AS id, g.variant_count, g.family_id, g.family_handle, g.family_name,
      g.any_handle, g.any_name, g.any_category,
      a.offer_count,
      b.price_cents AS best_price, b.unit_price_cents AS best_unit_price,
      b.supplier_product_id AS best_sp_id,
      sp.sku AS best_sku, sp.name AS best_name, sp.brand AS best_brand,
      sp.image_url AS best_image, sp.product_url AS best_url,
      sp.pack_size AS best_pack_size, sp.pack_quantity AS best_pack_qty, sp.base_unit AS best_base_unit, sp.pack_basis AS best_pack_basis,
      sp.supplier_id AS best_supplier_id, s.name AS best_supplier_name,
      COUNT(*) OVER() AS total_count
    FROM grpinfo g
    JOIN agg a ON a.grp = g.grp
    JOIN best b ON b.grp = g.grp
    JOIN medmkp_supplier_product sp ON sp.id = b.supplier_product_id AND sp.deleted_at IS NULL
    LEFT JOIN medmkp_supplier s ON s.id = sp.supplier_id AND s.deleted_at IS NULL
    ORDER BY (b.unit_price_cents IS NULL) ASC, b.unit_price_cents ASC, b.price_cents ASC, g.any_name ASC
    LIMIT $3 OFFSET $4
    `,
    [category, qLike, limit, offset, patternRe]
  )

  const canonical_products = rows.map(listRowToItem)

  return { count: rows.length ? Number(rows[0].total_count) : 0, canonical_products }
}

// Fast plain-category listing: read the precomputed medmkp_category_catalog_listing
// read model (one row per category × product family, holding the family's best
// current offer + counts) and join the supplier product for display fields of
// just this page. The live CTE query above ranked the whole category's offer
// graph on every cache miss (~13s for Gloves on prod); this is a single indexed
// page read (~60ms), the category-keyed twin of querySupplierProducts. Used only
// when there's no text/subcategory filter — the (category, unit_price, price)
// index serves the ORDER BY + LIMIT/OFFSET directly. The category key is
// lower(btrim(category)); the route already normalizes the param the same way.
async function queryCategoryListing(
  category: string,
  limit: number,
  offset: number
): Promise<CategoryListResult> {
  const pool = getPostgresPool()
  // Page the read model FIRST (the (category_key, unit_price, price) index serves
  // the ORDER BY + LIMIT as a top-N), then join supplier rows for just that page.
  // Joining before the LIMIT — and computing the total with COUNT(*) OVER() over
  // the joined set — forced a per-family pkey lookup into supplier_product for the
  // whole category (~17k loops, ~5.5s on the biggest one) just to return 24 rows.
  // The total now comes from a cheap index count over the read model alone.
  const { rows } = await pool.query(
    `
    WITH page AS (
      SELECT grp, variant_count, family_id, family_handle, family_name,
             any_handle, any_name, any_category, offer_count,
             price_cents, unit_price_cents, best_sp_id
      FROM medmkp_category_catalog_listing
      WHERE category_key = $1
      ORDER BY (unit_price_cents IS NULL) ASC, unit_price_cents ASC, price_cents ASC, any_name ASC
      LIMIT $2 OFFSET $3
    )
    SELECT
      page.grp AS id, page.variant_count, page.family_id, page.family_handle, page.family_name,
      page.any_handle, page.any_name, page.any_category,
      page.offer_count,
      page.price_cents AS best_price, page.unit_price_cents AS best_unit_price,
      page.best_sp_id,
      sp.sku AS best_sku, sp.name AS best_name, sp.brand AS best_brand,
      sp.image_url AS best_image, sp.product_url AS best_url,
      sp.pack_size AS best_pack_size, sp.pack_quantity AS best_pack_qty,
      sp.base_unit AS best_base_unit, sp.pack_basis AS best_pack_basis,
      sp.supplier_id AS best_supplier_id, s.name AS best_supplier_name,
      (SELECT count(*) FROM medmkp_category_catalog_listing WHERE category_key = $1) AS total_count
    FROM page
    JOIN medmkp_supplier_product sp ON sp.id = page.best_sp_id AND sp.deleted_at IS NULL
    LEFT JOIN medmkp_supplier s ON s.id = sp.supplier_id AND s.deleted_at IS NULL
    ORDER BY (page.unit_price_cents IS NULL) ASC, page.unit_price_cents ASC, page.price_cents ASC, page.any_name ASC
    `,
    [category, limit, offset]
  )

  const canonical_products = rows.map(listRowToItem)

  return { count: rows.length ? Number(rows[0].total_count) : 0, canonical_products }
}

// Shared row → card mapper for the DB-ranked listing queries (category +
// supplier browse), which select the same column aliases.
function listRowToItem(row: any): CategoryListItem {
  const image = row.best_image || ""
  const isFamily = Boolean(row.family_id)
  return {
    id: row.id,
    handle: isFamily ? row.family_handle : row.any_handle,
    name: isFamily ? row.family_name : row.any_name,
    category: row.any_category,
    family_id: row.family_id ?? null,
    variant_count: Number(row.variant_count),
    offer_count: Number(row.offer_count),
    best_offer: {
      supplier_product_id: row.best_sp_id,
      supplier_id: row.best_supplier_id,
      supplier_name: row.best_supplier_name ?? "Unknown supplier",
      sku: row.best_sku,
      name: row.best_name,
      brand: row.best_brand,
      image_url: image,
      product_url: row.best_url || "",
      price_cents: Number(row.best_price),
      unit_price_cents: row.best_unit_price != null ? Number(row.best_unit_price) : null,
      pack_quantity: row.best_pack_qty != null ? Number(row.best_pack_qty) : null,
      base_unit: row.best_base_unit ?? null,
      pack_basis: row.best_pack_basis ?? null,
      pack_size: row.best_pack_size || "",
      unit_comparable: row.best_unit_price != null,
      match_status: "matched",
    },
    offers: [],
    image_url: image,
    price_range_cents: null,
  }
}

async function listCategoryProducts(
  category: string,
  q: string | undefined,
  pattern: string | undefined,
  limit: number,
  offset: number
): Promise<CategoryListResult> {
  const key = `${category}|${q ?? ""}|${pattern ?? ""}|${limit}|${offset}`
  const cached = categoryListCache.get(key)
  if (cached && Date.now() - cached.loadedAt < CATEGORY_LIST_CACHE_TTL_MS) {
    return cached.result
  }

  // Single-flight: collapse a burst of identical requests (e.g. the landing
  // firing one fetch per source category) onto one database query.
  let promise = categoryListPromises.get(key)
  if (!promise) {
    // Plain category browse reads the precomputed read model; the text/
    // subcategory variants run the live CTE query over the category-scoped set.
    // If the read model is unavailable (migration not yet applied), fall back to
    // the live query so the listing still renders.
    promise =
      !q && !pattern
        ? queryCategoryListing(category, limit, offset).catch(() =>
            queryCategoryProducts(category, q, pattern, limit, offset)
          )
        : queryCategoryProducts(category, q, pattern, limit, offset)
    categoryListPromises.set(key, promise)
  }

  try {
    const result = await promise
    categoryListCache.set(key, { loadedAt: Date.now(), result })
    return result
  } finally {
    categoryListPromises.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Fast browse-by-supplier listing (/app/catalog/supplier/<id>)
//
// Reads the medmkp_supplier_catalog_listing read model (one row per
// supplier × product family, holding the supplier's own cheapest current offer)
// and joins the supplier product for display fields of just the page. Ranking a
// supplier's whole catalog by price live took ~11-28s; this is a single indexed
// read (~60ms). Cached briefly like the category listing.
// ---------------------------------------------------------------------------

const supplierListCache = new Map<string, { loadedAt: number; result: CategoryListResult }>()
const supplierListPromises = new Map<string, Promise<CategoryListResult>>()

async function querySupplierProducts(
  supplier: string,
  q: string | undefined,
  limit: number,
  offset: number
): Promise<CategoryListResult> {
  const pool = getPostgresPool()
  const qLike = q ? `%${q}%` : null
  const { rows } = await pool.query(
    `
    SELECT
      l.grp AS id, l.variant_count, l.family_id, l.family_handle, l.family_name,
      l.any_handle, l.any_name, l.any_category,
      l.price_cents AS best_price, l.unit_price_cents AS best_unit_price,
      l.best_sp_id,
      sp.sku AS best_sku, sp.name AS best_name, sp.brand AS best_brand,
      sp.image_url AS best_image, sp.product_url AS best_url,
      sp.pack_size AS best_pack_size, sp.pack_quantity AS best_pack_qty,
      sp.base_unit AS best_base_unit, sp.pack_basis AS best_pack_basis,
      sp.supplier_id AS best_supplier_id, s.name AS best_supplier_name,
      COUNT(*) OVER() AS total_count
    FROM medmkp_supplier_catalog_listing l
    JOIN medmkp_supplier_product sp ON sp.id = l.best_sp_id AND sp.deleted_at IS NULL
    LEFT JOIN medmkp_supplier s ON s.id = l.supplier_id AND s.deleted_at IS NULL
    WHERE l.supplier_id = $1
      AND ($2::text IS NULL OR l.any_name ILIKE $2 OR l.any_category ILIKE $2)
    ORDER BY (l.unit_price_cents IS NULL) ASC, l.unit_price_cents ASC, l.price_cents ASC, l.any_name ASC
    LIMIT $3 OFFSET $4
    `,
    [supplier, qLike, limit, offset]
  )

  // offer_count everywhere else means "distinct direct suppliers carrying this
  // family" (category CTE + PDP). The supplier read model has no such column, so
  // this listing used to alias the supplier's OWN pack-listing count
  // (l.variant_count) as offer_count — a single-supplier number masquerading as
  // "N suppliers" (e.g. net32 claimed 7, Amazon 1, for a family carried by 6
  // suppliers). Since the read model holds exactly one row per (supplier, family),
  // the true cross-supplier count is just COUNT(*) per grp; batch it for the page's
  // families so every surface's "N suppliers" means the same thing.
  const grps = rows.map((row) => row.id)
  const offerCountByGrp = new Map<string, number>()
  if (grps.length) {
    const { rows: counts } = await pool.query(
      `SELECT grp, COUNT(*)::int AS offer_count
       FROM medmkp_supplier_catalog_listing
       WHERE grp = ANY($1)
       GROUP BY grp`,
      [grps]
    )
    for (const row of counts) {
      offerCountByGrp.set(row.grp, Number(row.offer_count))
    }
  }

  const canonical_products = rows.map((row) =>
    listRowToItem({ ...row, offer_count: offerCountByGrp.get(row.id) ?? 1 })
  )

  return { count: rows.length ? Number(rows[0].total_count) : 0, canonical_products }
}

async function listSupplierProducts(
  supplier: string,
  q: string | undefined,
  limit: number,
  offset: number
): Promise<CategoryListResult> {
  const key = `${supplier}|${q ?? ""}|${limit}|${offset}`
  const cached = supplierListCache.get(key)
  if (cached && Date.now() - cached.loadedAt < CATEGORY_LIST_CACHE_TTL_MS) {
    return cached.result
  }

  let promise = supplierListPromises.get(key)
  if (!promise) {
    promise = querySupplierProducts(supplier, q, limit, offset)
    supplierListPromises.set(key, promise)
  }

  try {
    const result = await promise
    supplierListCache.set(key, { loadedAt: Date.now(), result })
    return result
  } finally {
    supplierListPromises.delete(key)
  }
}

async function familySiblingIds(familyIds: string[]): Promise<string[]> {
  if (!familyIds.length) {
    return []
  }
  const pool = getPostgresPool()
  const { rows } = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM medmkp_canonical_product
    WHERE deleted_at IS NULL AND family_id = ANY($1::text[])
    ORDER BY variant_rank NULLS LAST, name
    `,
    [familyIds]
  )
  return rows.map((row) => row.id)
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const url = new URL(req.url, "http://localhost")
  const q = url.searchParams.get("q")?.trim()
  const pattern = url.searchParams.get("pattern")?.trim() || undefined
  const handle = normalize(url.searchParams.get("handle"))
  const category = normalize(url.searchParams.get("category"))
  const supplier = normalize(url.searchParams.get("supplier"))
  const limitParam = Number(url.searchParams.get("limit"))
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 50)
      : 10
  const offsetParam = Number(url.searchParams.get("offset"))
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0

  // Category drill-down: rank + page in the database (see above). The supplier
  // filter and single-product (handle) lookup still use the general path below,
  // which returns full offer lists.
  if (category && !handle && !supplier) {
    try {
      res.json(await listCategoryProducts(category, q, pattern, limit, offset))
      return
    } catch (error) {
      // Fall through to the general path if the read model is unavailable.
    }
  }

  // Browse by supplier: rank + page the supplier's catalog from its read model.
  if (supplier && !handle && !category) {
    try {
      res.json(await listSupplierProducts(supplier, q, limit, offset))
      return
    } catch (error) {
      // Fall through to the general (in-memory) supplier filter if unavailable.
    }
  }

  // Filter at the database instead of loading the entire canonical catalog and
  // filtering in memory. The previous approach fetched every canonical product
  // on each request (~20s in production on the small Render instance), which
  // made both this product page and search crawl. $ilike/$or/$and reproduce the
  // earlier substring/equality matching, but the database does the work.
  const where: Record<string, any>[] = []
  if (handle) {
    // Resolve by the product's own handle/id or its family handle, so a family
    // page (and any variant's handle) loads the whole family below. Exact
    // equality (not $ilike): handle/id/family_handle are stored lowercase and the
    // param is normalized to lowercase above, so this is semantically identical to
    // the old case-insensitive match — but it uses the PK / btree indexes (a
    // BitmapOr). $ilike could not use them (only the handle GIN-trigram index), so
    // the OR degraded to a seq scan of every canonical row (~2.6s) on every
    // product page load.
    where.push({
      $or: [
        { handle },
        { id: handle },
        { family_handle: handle },
      ],
    })
  }
  if (q) {
    const term = `%${q}%`
    // Restrict to the trigram-indexed columns so Postgres can use the pg_trgm GIN
    // indexes (name/handle/category, added in Migration20260617190000). Including
    // description/attributes_text/unit_of_measure — which have no trgm index —
    // forces a full seq scan (~1.8s vs ~0.8ms).
    where.push({
      $or: [
        { name: { $ilike: term } },
        { handle: { $ilike: term } },
        { category: { $ilike: term } },
      ],
    })
  }
  if (category) {
    where.push({ category: { $ilike: category } })
  }

  const productFilters =
    where.length === 0 ? {} : where.length === 1 ? where[0] : { $and: where }

  // Cap how many rows we pull + enrich for browse/search. A category like
  // "Instruments" has tens of thousands of products; loading and enriching all
  // of them just to slice off one page makes the catalog crawl. A handle lookup
  // targets a single product, so it is never capped. (Mirrors the bounded
  // candidate fetch in /medmkp/products/search.)
  const listOptions = handle ? undefined : { take: 600 }
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  let filteredCanonicalProducts = await medmkp.listCanonicalProducts(
    productFilters as any,
    listOptions as any
  )

  if (!filteredCanonicalProducts.length) {
    // A synthetic supplier-product-backed id (search identity hit with no
    // persisted canonical row) won't match a canonical handle/id — resolve it
    // straight from the supplier product so the product page can still render.
    if (handle && handle.startsWith("msp_")) {
      const page = await resolveSupplierProductPage(medmkp, handle)
      if (page) {
        res.json({ count: 1, canonical_products: [page], family: null })
        return
      }
    }
    // Handle alias fallback: a URL issued before a re-match renamed the product.
    // Resolve the old handle to the canonical that superseded it so bookmarks,
    // open tabs, and shared links keep working instead of 404-ing. Falls through
    // to not-found if the alias table is absent (migration not yet applied).
    if (handle) {
      try {
        const pool = getPostgresPool()
        const { rows } = await pool.query<{ canonical_id: string }>(
          `SELECT canonical_id FROM medmkp_canonical_handle_alias WHERE handle = $1 LIMIT 1`,
          [handle]
        )
        if (rows.length) {
          filteredCanonicalProducts = await medmkp.listCanonicalProducts({
            id: rows[0].canonical_id,
          } as any)
        }
      } catch {
        // alias table unavailable — treat as not found
      }
    }
    // Slug-prefix fallback: a handle minted by the pre-#321 positional-id scheme
    // (suffix like "-9i0") was never written to the alias table, yet the product
    // still exists under a new content-hash suffix on the SAME slug
    // ("...-24-pack-9i0" -> "...-24-pack-093332"). When the alias also misses,
    // resolve by the slug — but only when it maps to exactly one live product, so
    // we never guess between genuine near-duplicate clusters.
    if (handle && !filteredCanonicalProducts.length) {
      const matcher = slugPrefixMatcher(handle)
      if (matcher) {
        try {
          const pool = getPostgresPool()
          const { rows } = await pool.query<{ id: string }>(
            `SELECT id FROM medmkp_canonical_product
               WHERE deleted_at IS NULL AND handle LIKE $1 AND handle ~ $2
               LIMIT 2`,
            [matcher.like, matcher.regex]
          )
          if (rows.length === 1) {
            filteredCanonicalProducts = await medmkp.listCanonicalProducts({
              id: rows[0].id,
            } as any)
          }
        } catch {
          // lookup failed — treat as not found
        }
      }
    }
    if (!filteredCanonicalProducts.length) {
      res.json({ count: 0, canonical_products: [] })
      return
    }
  }

  // On a handle lookup, pull in the rest of the family so the product page can
  // offer every size/spec as a selectable variant (a member's handle resolves
  // the whole family, not just that one variant).
  if (handle) {
    const familyIds = [
      ...new Set(
        filteredCanonicalProducts
          .map((product) => (product as any).family_id)
          .filter((id): id is string => Boolean(id))
      ),
    ]
    if (familyIds.length) {
      const siblingIds = await familySiblingIds(familyIds)
      const siblings = siblingIds.length
        ? await medmkp.listCanonicalProducts({ id: siblingIds } as any)
        : []
      const byId = new Map(filteredCanonicalProducts.map((p) => [p.id, p]))
      for (const sibling of siblings) {
        byId.set(sibling.id, sibling)
      }
      filteredCanonicalProducts = [...byId.values()]
    }
  }

  const matches = await medmkp.listCanonicalProductMatches({
    canonical_product_id: filteredCanonicalProducts.map((product) => product.id),
  })
  const supplierProductIds = [
    ...new Set(matches.map((match) => match.supplier_product_id)),
  ]

  const [supplierProducts, latestPrices, suppliers] = supplierProductIds.length
    ? await Promise.all([
        medmkp.listSupplierProducts({ id: supplierProductIds }),
        latestPriceSnapshotsByProduct(supplierProductIds),
        medmkp.listSuppliers(),
      ])
    : [[], new Map<string, LatestPriceSnapshot>(), []]
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
  // Index supplier products and group matches by canonical product up front so
  // enrichment is linear. The previous nested filter()/find() per product was
  // O(products × matches × supplierProducts) and dominated CPU on large pages.
  const supplierProductById = new Map(
    supplierProducts.map((supplierProduct) => [supplierProduct.id, supplierProduct])
  )
  const matchesByCanonical = new Map<string, typeof matches>()
  const marketplaceByCanonical = new Map<string, typeof matches>()
  for (const match of matches) {
    const supplierProduct = supplierProductById.get(match.supplier_product_id)

    // Marketplace listings go to a separate "Also available on" section, never
    // into the price comparison. Keep matches + substitutes (≥30% title overlap);
    // drop unmatched and sub-substitute (needs_review) noise.
    if (supplierProduct && MARKETPLACE_SUPPLIER_IDS.has(supplierProduct.supplier_id)) {
      if (
        match.match_status === "exact" ||
        match.match_status === "variant" ||
        match.match_status === "substitute"
      ) {
        const list = marketplaceByCanonical.get(match.canonical_product_id)
        if (list) {
          list.push(match)
        } else {
          marketplaceByCanonical.set(match.canonical_product_id, [match])
        }
      }
      continue
    }

    // Same-product offers only; substitutes are surfaced separately, not mixed
    // into the supplier price comparison.
    if (match.match_status === "unmatched" || match.match_status === "substitute") {
      continue
    }
    const list = matchesByCanonical.get(match.canonical_product_id)
    if (list) {
      list.push(match)
    } else {
      matchesByCanonical.set(match.canonical_product_id, [match])
    }
  }

  const enriched = filteredCanonicalProducts.map((product) => {
    const rawOffers = (matchesByCanonical.get(product.id) ?? [])
      .map((match) => {
        const supplierProduct = supplierProductById.get(match.supplier_product_id)
        const latestPrice = latestPrices.get(match.supplier_product_id)

        if (!supplierProduct || !latestPrice) {
          return null
        }

        const supplier = supplierById.get(supplierProduct.supplier_id)

        return {
          supplier_product_id: supplierProduct.id,
          supplier_id: supplierProduct.supplier_id,
          supplier_name: supplier?.name ?? "Unknown supplier",
          sku: supplierProduct.sku,
          name: supplierProduct.name,
          brand: supplierProduct.brand,
          image_url: supplierProduct.image_url || "",
          product_url: supplierProduct.product_url || "",
          price_cents: latestPrice.price_cents,
          // Comparable per-unit price (price ÷ pack_quantity) + the pack context
          // the UI needs to make the comparison legible.
          unit_price_cents: latestPrice.unit_price_cents ?? null,
          pack_quantity: supplierProduct.pack_quantity ?? null,
          base_unit: supplierProduct.base_unit ?? null,
          pack_basis: supplierProduct.pack_basis ?? null,
          pack_size: supplierProduct.pack_size || "",
          availability: latestPrice.availability,
          match_status: match.match_status,
        }
      })
      .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer))

    // Rank by comparable per-unit price (F1), guarding against comparing across
    // mixed base units (F2). best_offer is the cheapest comparable per-unit offer.
    const ranking = analyzeOffers(rawOffers)
    const offers = rawOffers
      .map((offer) => ({
        ...offer,
        unit_comparable: isUnitComparable(offer, ranking.comparisonBasis),
      }))
      .sort((a, b) => compareOffers(a, b, ranking.comparisonBasis))

    const bestOffer = offers[0] ?? null
    const range = offerPriceRange(offers)
    const imageUrl = bestOffer?.image_url || offers.find((offer) => offer.image_url)?.image_url || ""

    // Marketplace alternatives, surfaced separately. Listings may
    // be price-less (e.g. Alibaba "contact supplier"), so a missing price is kept
    // rather than dropped — the link-out is still useful.
    const rankedMarketplaceListings = (marketplaceByCanonical.get(product.id) ?? [])
      .map((match) => {
        const supplierProduct = supplierProductById.get(match.supplier_product_id)
        if (!supplierProduct) {
          return null
        }
        const latestPrice = latestPrices.get(match.supplier_product_id)
        const supplier = supplierById.get(supplierProduct.supplier_id)

        return {
          supplier_id: supplierProduct.supplier_id,
          supplier_name: supplier?.name ?? "Marketplace",
          supplier_slug: supplier?.slug ?? "",
          sku: supplierProduct.sku,
          name: supplierProduct.name,
          brand: supplierProduct.brand,
          image_url: supplierProduct.image_url || "",
          product_url: supplierProduct.product_url || "",
          price_cents: latestPrice?.price_cents ?? null,
          unit_price_cents: latestPrice?.unit_price_cents ?? null,
          pack_size: supplierProduct.pack_size || "",
          availability: latestPrice?.availability ?? "unknown",
          match_status: match.match_status,
          match_confidence: match.confidence_score ?? null,
        }
      })
      .filter((listing): listing is NonNullable<typeof listing> => Boolean(listing))
      .sort((a, b) => {
        // Closest matches first (exact → variant → substitute), then cheapest.
        const grade = (status: string) =>
          status === "exact" ? 0 : status === "variant" ? 1 : 2
        const byGrade = grade(a.match_status) - grade(b.match_status)
        if (byGrade !== 0) {
          return byGrade
        }
        return (a.price_cents ?? Infinity) - (b.price_cents ?? Infinity)
      })

    // Collapse duplicate matches that resolve to the same marketplace listing.
    // One SKU can be matched to a canonical more than once (e.g. via different
    // source_catalog runs), which would otherwise render as identical rows. The
    // list is already best-match-first, so keeping the first occurrence per
    // listing keeps the strongest match.
    const seenMarketplaceKeys = new Set<string>()
    const marketplaceListings = rankedMarketplaceListings.filter((listing) => {
      const key = listing.product_url || listing.sku
      if (!key) {
        return true
      }
      if (seenMarketplaceKeys.has(key)) {
        return false
      }
      seenMarketplaceKeys.add(key)
      return true
    })

    return {
      ...product,
      offer_count: offers.length,
      best_offer: bestOffer,
      offers,
      marketplace_listings: marketplaceListings,
      image_url: imageUrl,
      price_range_cents: range,
      // True when ≥2 offers can be compared per-unit; basis names the unit.
      unit_comparable: ranking.comparableCount >= 2,
      unit_comparison_basis: ranking.comparisonBasis,
    }
  })

  // Handle lookup powers the product page. Return the family's variants ordered
  // by their selector rank (size S→XL, 25mm→30mm, …) plus a family summary so
  // the page can render a size selector and default to the requested variant.
  if (handle) {
    const variants = [...enriched].sort((a, b) => {
      const aRank = (a as any).variant_rank ?? Number.MAX_SAFE_INTEGER
      const bRank = (b as any).variant_rank ?? Number.MAX_SAFE_INTEGER
      if (aRank !== bRank) {
        return aRank - bRank
      }
      return a.name.localeCompare(b.name)
    })

    const familyMember = variants.find((product) => (product as any).family_id)
    // The variant axis (Size / Shade / Gauge …) is persisted in each canonical's
    // attributes JSON by the matcher; surface it on the family summary so the
    // product page labels the selector from the registry, not a value-shape guess.
    let familyVariantAxisLabel: string | null = null
    if (familyMember) {
      try {
        familyVariantAxisLabel =
          JSON.parse((familyMember as any).attributes_text || "{}").variant_axis_label ?? null
      } catch {
        familyVariantAxisLabel = null
      }
    }
    const family =
      familyMember && variants.length > 1
        ? {
            family_id: (familyMember as any).family_id,
            family_handle: (familyMember as any).family_handle,
            family_name: (familyMember as any).family_name,
            variant_axis_label: familyVariantAxisLabel,
          }
        : null

    res.json({
      count: variants.length,
      canonical_products: variants,
      family,
    })
    return
  }

  const visible = enriched.filter((product) => {
    if (supplier) {
      const matched = product.offers.some((offer) =>
        [offer.supplier_name, offer.supplier_id, offer.brand]
          .filter(Boolean)
          .some((value) => normalize(String(value)).includes(supplier))
      )

      if (!matched) {
        return false
      }
    }

    return true
  })

  const sorted = visible.sort((a, b) => {
    const aPrice = a.best_offer?.price_cents ?? Number.MAX_SAFE_INTEGER
    const bPrice = b.best_offer?.price_cents ?? Number.MAX_SAFE_INTEGER
    if (aPrice !== bPrice) {
      return aPrice - bPrice
    }

    return a.name.localeCompare(b.name)
  })

  const paged = sorted.slice(offset, offset + limit)

  res.json({
    count: visible.length,
    canonical_products: paged,
  })
}
