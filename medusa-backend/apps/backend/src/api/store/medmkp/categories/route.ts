import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getPostgresPool } from "../../../../utils/postgres"

const CATEGORY_LIMIT = 12
// The drill-down catalog buckets every live category into a department, so it
// needs the full set, not just the featured dozen. Cap defensively.
const CATEGORY_LIMIT_MAX = 500
const CATEGORY_CACHE_TTL_MS = 60 * 1000

type CategoryRow = {
  category: string
  product_count: string
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

  const categories = await pool.query<CategoryRow>(
    `SELECT category, product_count, supplier_count
     FROM medmkp_supplier_category_summary
     ORDER BY product_count DESC
     LIMIT $1`,
    [limit]
  )

  const bestValue = await pool.query<BestValueRow>(
    `SELECT DISTINCT ON (p.category)
            p.category, p.name, p.sku, p.supplier_id, sup.name AS supplier_name,
            p.price_cents
     FROM medmkp_supplier_product_current_offer p
     LEFT JOIN medmkp_supplier sup ON sup.id = p.supplier_id AND sup.deleted_at IS NULL
     WHERE p.category = ANY($1)
     ORDER BY p.category, p.price_cents ASC`,
    [categories.rows.map((row) => row.category)]
  )
  const bestByCategory = new Map(bestValue.rows.map((row) => [row.category, row]))

  return {
    categories: categories.rows.map((row) => {
      const best = bestByCategory.get(row.category)
      return {
        id: row.category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name: row.category,
        product_count: Number(row.product_count),
        supplier_count: Number(row.supplier_count),
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
