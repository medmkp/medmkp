import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { getPostgresPool } from "../../../../utils/postgres"

function latestSnapshotsByProduct(snapshots: Awaited<ReturnType<MedMKPModuleService["listSupplierPriceSnapshots"]>>) {
  return snapshots.reduce((acc, snapshot) => {
    const existing = acc.get(snapshot.supplier_product_id)

    if (
      !existing ||
      new Date(snapshot.captured_at).getTime() >
        new Date(existing.captured_at).getTime()
    ) {
      acc.set(snapshot.supplier_product_id, snapshot)
    }

    return acc
  }, new Map<string, (typeof snapshots)[number]>())
}

function normalize(value: string | null) {
  return value?.trim().toLowerCase() || ""
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
    match_status: string
  }
  offers: never[]
  image_url: string
  price_range_cents: null
}

type CategoryListResult = { count: number; canonical_products: CategoryListItem[] }

const CATEGORY_LIST_CACHE_TTL_MS = 60 * 1000
const categoryListCache = new Map<string, { loadedAt: number; result: CategoryListResult }>()
const categoryListPromises = new Map<string, Promise<CategoryListResult>>()

async function queryCategoryProducts(
  category: string,
  q: string | undefined,
  limit: number,
  offset: number
): Promise<CategoryListResult> {
  const pool = getPostgresPool()
  const qLike = q ? `%${q}%` : null

  const { rows } = await pool.query(
    `
    WITH cat AS (
      SELECT id, handle, name, category
      FROM medmkp_canonical_product
      WHERE category ILIKE $1 AND deleted_at IS NULL
        AND ($2::text IS NULL OR name ILIKE $2 OR handle ILIKE $2 OR category ILIKE $2)
    ),
    priced AS (
      SELECT m.canonical_product_id, m.supplier_product_id, cp.price_cents
      FROM medmkp_canonical_product_match m
      JOIN medmkp_supplier_current_price cp ON cp.supplier_product_id = m.supplier_product_id
      WHERE m.canonical_product_id IN (SELECT id FROM cat)
        AND m.match_status <> 'unmatched' AND m.deleted_at IS NULL
    ),
    agg AS (
      SELECT canonical_product_id, COUNT(*)::int AS offer_count, MIN(price_cents) AS best_price
      FROM priced GROUP BY canonical_product_id
    ),
    best AS (
      SELECT DISTINCT ON (canonical_product_id)
             canonical_product_id, supplier_product_id, price_cents
      FROM priced ORDER BY canonical_product_id, price_cents ASC
    )
    SELECT
      cat.id, cat.handle, cat.name, cat.category,
      a.offer_count, a.best_price,
      b.supplier_product_id AS best_sp_id,
      sp.sku AS best_sku, sp.name AS best_name, sp.brand AS best_brand,
      sp.image_url AS best_image, sp.product_url AS best_url,
      sp.supplier_id AS best_supplier_id, s.name AS best_supplier_name,
      COUNT(*) OVER() AS total_count
    FROM cat
    JOIN agg a ON a.canonical_product_id = cat.id
    JOIN best b ON b.canonical_product_id = cat.id
    JOIN medmkp_supplier_product sp ON sp.id = b.supplier_product_id AND sp.deleted_at IS NULL
    LEFT JOIN medmkp_supplier s ON s.id = sp.supplier_id AND s.deleted_at IS NULL
    ORDER BY a.best_price ASC, cat.name ASC
    LIMIT $3 OFFSET $4
    `,
    [category, qLike, limit, offset]
  )

  const canonical_products: CategoryListItem[] = rows.map((row) => {
    const image = row.best_image || ""
    return {
      id: row.id,
      handle: row.handle,
      name: row.name,
      category: row.category,
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
        match_status: "matched",
      },
      offers: [],
      image_url: image,
      price_range_cents: null,
    }
  })

  return { count: rows.length ? Number(rows[0].total_count) : 0, canonical_products }
}

async function listCategoryProducts(
  category: string,
  q: string | undefined,
  limit: number,
  offset: number
): Promise<CategoryListResult> {
  const key = `${category}|${q ?? ""}|${limit}|${offset}`
  const cached = categoryListCache.get(key)
  if (cached && Date.now() - cached.loadedAt < CATEGORY_LIST_CACHE_TTL_MS) {
    return cached.result
  }

  // Single-flight: collapse a burst of identical requests (e.g. the landing
  // firing one fetch per source category) onto one database query.
  let promise = categoryListPromises.get(key)
  if (!promise) {
    promise = queryCategoryProducts(category, q, limit, offset)
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

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const url = new URL(req.url, "http://localhost")
  const q = url.searchParams.get("q")?.trim()
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
      res.json(await listCategoryProducts(category, q, limit, offset))
      return
    } catch (error) {
      // Fall through to the general path if the read model is unavailable.
    }
  }

  // Filter at the database instead of loading the entire canonical catalog and
  // filtering in memory. The previous approach fetched every canonical product
  // on each request (~20s in production on the small Render instance), which
  // made both this product page and search crawl. $ilike/$or/$and reproduce the
  // earlier substring/equality matching, but the database does the work.
  const where: Record<string, any>[] = []
  if (handle) {
    where.push({ $or: [{ handle: { $ilike: handle } }, { id: { $ilike: handle } }] })
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
  const filteredCanonicalProducts = await medmkp.listCanonicalProducts(
    productFilters as any,
    listOptions as any
  )

  if (!filteredCanonicalProducts.length) {
    res.json({ count: 0, canonical_products: [] })
    return
  }

  const matches = await medmkp.listCanonicalProductMatches({
    canonical_product_id: filteredCanonicalProducts.map((product) => product.id),
  })
  const supplierProductIds = [
    ...new Set(matches.map((match) => match.supplier_product_id)),
  ]

  const [supplierProducts, priceSnapshots, suppliers] = supplierProductIds.length
    ? await Promise.all([
        medmkp.listSupplierProducts({ id: supplierProductIds }),
        medmkp.listSupplierPriceSnapshots({
          supplier_product_id: supplierProductIds,
        }),
        medmkp.listSuppliers(),
      ])
    : [[], [], []]
  const latestPrices = latestSnapshotsByProduct(priceSnapshots)
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
  // Index supplier products and group matches by canonical product up front so
  // enrichment is linear. The previous nested filter()/find() per product was
  // O(products × matches × supplierProducts) and dominated CPU on large pages.
  const supplierProductById = new Map(
    supplierProducts.map((supplierProduct) => [supplierProduct.id, supplierProduct])
  )
  const matchesByCanonical = new Map<string, typeof matches>()
  for (const match of matches) {
    if (match.match_status === "unmatched") {
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
    const offers = (matchesByCanonical.get(product.id) ?? [])
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
          availability: latestPrice.availability,
          match_status: match.match_status,
        }
      })
      .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer))
      .sort((a, b) => a.price_cents - b.price_cents)

    const bestOffer = offers[0] ?? null
    const range = offerPriceRange(offers)
    const imageUrl = bestOffer?.image_url || offers.find((offer) => offer.image_url)?.image_url || ""

    return {
      ...product,
      offer_count: offers.length,
      best_offer: bestOffer,
      offers,
      image_url: imageUrl,
      price_range_cents: range,
    }
  })

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
