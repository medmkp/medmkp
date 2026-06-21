import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { getPostgresPool } from "../../../../utils/postgres"
import { analyzeOffers, compareOffers, isUnitComparable } from "../../../../matching/offers"
import { MARKETPLACE_SUPPLIER_IDS } from "../../../../ingestion/marketplace/suppliers"

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
  const [supplierProducts, snapshots, suppliers] = await Promise.all([
    medmkp.listSupplierProducts({ id: candidateIds }),
    medmkp.listSupplierPriceSnapshots({ supplier_product_id: candidateIds }),
    medmkp.listSuppliers(),
  ])
  const supplierProduct = supplierProducts[0]
  if (!supplierProduct) {
    return null
  }
  const supplierProductId = supplierProduct.id
  const supplier = suppliers.find((s) => s.id === supplierProduct.supplier_id)
  const latest = latestSnapshotsByProduct(snapshots).get(supplierProductId)
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
    ),
    priced AS (
      SELECT cat.grp, m.supplier_product_id, cp.price_cents, cp.unit_price_cents
      FROM medmkp_canonical_product_match m
      JOIN medmkp_supplier_current_price cp ON cp.supplier_product_id = m.supplier_product_id
      JOIN cat ON cat.id = m.canonical_product_id
      WHERE m.match_status NOT IN ('unmatched', 'substitute') AND m.deleted_at IS NULL
    ),
    agg AS (
      SELECT grp, COUNT(*)::int AS offer_count FROM priced GROUP BY grp
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
    [category, qLike, limit, offset]
  )

  const canonical_products: CategoryListItem[] = rows.map((row) => {
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
    // Resolve by the product's own handle/id or its family handle, so a family
    // page (and any variant's handle) loads the whole family below.
    where.push({
      $or: [
        { handle: { $ilike: handle } },
        { id: { $ilike: handle } },
        { family_handle: { $ilike: handle } },
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
    res.json({ count: 0, canonical_products: [] })
    return
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
      const siblings = await medmkp.listCanonicalProducts({ family_id: familyIds } as any)
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
  const marketplaceByCanonical = new Map<string, typeof matches>()
  for (const match of matches) {
    const supplierProduct = supplierProductById.get(match.supplier_product_id)

    // Amazon/Alibaba listings go to a separate "Also available on" section, never
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

    // Marketplace alternatives (Amazon/Alibaba), surfaced separately. Listings may
    // be price-less (e.g. Alibaba "contact supplier"), so a missing price is kept
    // rather than dropped — the link-out is still useful.
    const marketplaceListings = (marketplaceByCanonical.get(product.id) ?? [])
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
    const family =
      familyMember && variants.length > 1
        ? {
            family_id: (familyMember as any).family_id,
            family_handle: (familyMember as any).family_handle,
            family_name: (familyMember as any).family_name,
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
