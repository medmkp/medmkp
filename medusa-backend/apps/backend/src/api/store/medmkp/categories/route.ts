import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"

const CATEGORY_LIMIT = 12

/**
 * Buyer-facing reorder categories derived from the ingested supplier
 * catalog: the most-stocked categories, each with its cheapest currently
 * priced product as the best-value offer.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    res.status(500).json({ error: "DATABASE_URL is not set" })
    return
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    const categories = await client.query(
      `SELECT category, count(*) AS product_count, count(DISTINCT supplier_id) AS supplier_count
       FROM medmkp_supplier_product
       WHERE deleted_at IS NULL AND category <> ''
       GROUP BY category
       ORDER BY product_count DESC
       LIMIT $1`,
      [CATEGORY_LIMIT]
    )

    const bestValue = await client.query(
      `SELECT DISTINCT ON (p.category)
              p.category, p.name, p.sku, p.supplier_id, sup.name AS supplier_name,
              price.price_cents
       FROM medmkp_supplier_product p
       JOIN LATERAL (
         SELECT price_cents FROM medmkp_supplier_price_snapshot s
         WHERE s.supplier_product_id = p.id AND s.deleted_at IS NULL
         ORDER BY s.captured_at DESC LIMIT 1
       ) price ON price.price_cents > 0
       LEFT JOIN medmkp_supplier sup ON sup.id = p.supplier_id AND sup.deleted_at IS NULL
       WHERE p.deleted_at IS NULL AND p.category = ANY($1)
       ORDER BY p.category, price.price_cents ASC`,
      [categories.rows.map((row) => row.category)]
    )
    const bestByCategory = new Map(bestValue.rows.map((row) => [row.category, row]))

    res.json({
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
    })
  } finally {
    await client.end()
  }
}
