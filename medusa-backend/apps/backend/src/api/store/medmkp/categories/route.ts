import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { displayTaxonomyCategory } from "../../../../catalog/taxonomy"
import { getPostgresPool } from "../../../../utils/postgres"

const CATEGORY_LIMIT = 12
// The drill-down catalog buckets every live category into a department, so it
// needs the full set, not just the featured dozen. Cap defensively.
const CATEGORY_LIMIT_MAX = 500
// 15 min: catalog changes only on ingestion. The cold recompute of the priced/
// coverage aggregation is well under 1s (indexed), but cache it past the Vercel
// edge window anyway; the edge serves stale-while-revalidate so users never wait.
const CATEGORY_CACHE_TTL_MS = 15 * 60 * 1000

type CategoryRow = {
  category: string
  product_count: number
}

type SupplierCoverageRow = {
  category: string
  supplier_count: string
}

type BestValueRow = {
  category: string
  name: string
  sku: string
  supplier_id: string
  supplier_name: string | null
  price_cents: number
}

type CategoriesResponse = {
  categories: {
    id: string
    name: string
    product_count: number
    supplier_count: number
    best_value_item: {
      name: string
      sku: string
      supplier_name: string
      unit_price_cents: number
    } | null
  }[]
}

const categoriesCache = new Map<number, { loadedAt: number; response: CategoriesResponse }>()
const categoriesPromise = new Map<number, Promise<CategoriesResponse>>()

async function loadCategories(limit: number): Promise<CategoriesResponse> {
  const pool = getPostgresPool()

  // The matview's product_count counts raw supplier SKUs (priced or not), which
  // massively overstates what a buyer can actually open: the drill-down
  // (/medmkp/canonical-products?category=) lists deduped, family-grouped
  // canonical products that have at least one priced offer. Showing the SKU
  // count on the landing made the two pages disagree wildly (Laboratory read
  // 1,577 SKUs but only 84 browsable products). The priced canonical-family
  // count per category — the same set, counted the same way as the drill-down
  // query — is precomputed in the medmkp_category_priced_count read model
  // (refreshed by refresh-catalog-read-models). Computing it live here meant a
  // join over the full match + current-price tables on every request, which at
  // prod's tiny work_mem spilled to disk and timed out the catalog landing.
  const categories = await pool.query<CategoryRow>(
    `SELECT category, product_count
     FROM medmkp_category_priced_count
     WHERE product_count > 0`
  )

  // Supplier coverage is now derived from the normalized canonical category
  // carried by medmkp_supplier_catalog_listing.any_category. The older
  // supplier_category_summary read model is intentionally raw supplier taxonomy,
  // so using it here would re-split "Gloves", "Nitrile", "PPE", etc.
  const supplierCoverage = await pool.query<SupplierCoverageRow>(
    `SELECT lower(btrim(any_category)) AS category,
            count(distinct supplier_id)::text AS supplier_count
     FROM medmkp_supplier_catalog_listing
     WHERE any_category <> ''
     GROUP BY lower(btrim(any_category))`
  )
  const supplierCountByCategory = new Map(
    supplierCoverage.rows.map((row) => [row.category, Number(row.supplier_count)])
  )

  // Rank by browsable (priced) product count and keep the requested page.
  const ranked = categories.rows
    .map((row) => ({
      category: row.category,
      supplier_count: supplierCountByCategory.get(row.category.trim().toLowerCase()) ?? 0,
      product_count: Number(row.product_count),
    }))
    .sort((a, b) => b.product_count - a.product_count)
    .slice(0, limit)

  // For each ranked category, fetch its single cheapest row via a LATERAL LIMIT 1,
  // then join supplier_product for just that winner. The expression index
  // IDX_medmkp_supplier_catalog_listing_anycat_price turns each lookup into an
  // index scan (~21 of them), so this is ~80ms cold. A DISTINCT ON over the matview
  // still had to scan all 64k rows by lower(btrim(any_category)) (~2.4s); the
  // earlier join-before-dedup scanned and pkey-looked-up all 64k (~31s).
  const bestValue = await pool.query<BestValueRow>(
    `SELECT c.category, sp.name, sp.sku, sp.supplier_id, sup.name AS supplier_name, b.price_cents
     FROM unnest($1::text[]) AS c(category)
     CROSS JOIN LATERAL (
       SELECT best_sp_id, price_cents
       FROM medmkp_supplier_catalog_listing l
       WHERE lower(btrim(l.any_category)) = c.category
       ORDER BY (l.unit_price_cents IS NULL) ASC, l.unit_price_cents ASC, l.price_cents ASC
       LIMIT 1
     ) b
     JOIN medmkp_supplier_product sp ON sp.id = b.best_sp_id AND sp.deleted_at IS NULL
     LEFT JOIN medmkp_supplier sup ON sup.id = sp.supplier_id AND sup.deleted_at IS NULL`,
    [ranked.map((row) => row.category)]
  )
  const bestByCategory = new Map(bestValue.rows.map((row) => [row.category, row]))

  return {
    categories: ranked.map((row) => {
      const best = bestByCategory.get(row.category)
      const name = displayTaxonomyCategory(row.category)
      return {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name,
        product_count: row.product_count,
        supplier_count: row.supplier_count,
        best_value_item: best
          ? {
              name: best.name,
              sku: best.sku,
              supplier_name: best.supplier_name ?? "Unknown supplier",
              unit_price_cents: best.price_cents,
            }
          : null,
      }
    }),
  }
}

async function getCategories(limit: number): Promise<CategoriesResponse> {
  const cached = categoriesCache.get(limit)
  if (cached && Date.now() - cached.loadedAt < CATEGORY_CACHE_TTL_MS) {
    return cached.response
  }

  if (!categoriesPromise.has(limit)) {
    categoriesPromise.set(limit, loadCategories(limit))
  }

  try {
    const response = await categoriesPromise.get(limit)!
    categoriesCache.set(limit, { loadedAt: Date.now(), response })
    return response
  } finally {
    categoriesPromise.delete(limit)
  }
}

function parseLimit(req: MedusaRequest): number {
  const url = new URL(req.url, "http://localhost")
  if (url.searchParams.get("all") === "1") {
    return CATEGORY_LIMIT_MAX
  }
  const raw = Number(url.searchParams.get("limit"))
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.floor(raw), CATEGORY_LIMIT_MAX)
  }
  return CATEGORY_LIMIT
}

/**
 * Buyer-facing reorder categories derived from the ingested supplier
 * catalog: the most-stocked categories, each with its cheapest currently
 * priced product as the best-value offer.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    res.json(await getCategories(parseLimit(req)))
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL is not set") {
      res.status(500).json({ error: error.message })
      return
    }

    throw error
  }
}
