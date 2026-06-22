import { Client } from "pg"
import { refreshMatchIndex } from "../matching/match-index"

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set")
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    // The priced-count refresh aggregates the full match + current-price tables.
    // Parallel workers each allocate work_mem, so disable parallelism and give a
    // single bounded budget — keeps the refresh fast on the memory-constrained
    // instance without risking an OOM.
    await client.query(`SET max_parallel_workers_per_gather = 0`)
    await client.query(`SET work_mem = '64MB'`)
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medmkp_supplier_current_price`)
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medmkp_supplier_category_summary`)
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medmkp_supplier_product_current_offer`)
    // Depends on medmkp_supplier_current_price, so refresh it after that one.
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medmkp_category_priced_count`)
    // Per-supplier product count (reads base medmkp_supplier_product directly).
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medmkp_supplier_product_count`)
    const indexed = await refreshMatchIndex(client)
    console.log(`Refreshed match index: ${indexed} products`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
