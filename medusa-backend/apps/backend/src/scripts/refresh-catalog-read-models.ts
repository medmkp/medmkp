import { Client } from "pg"
import { refreshMatchIndex } from "../matching/match-index"
import { resolveDatabaseUrl } from "../utils/database-url"

async function main() {
  const databaseUrl = resolveDatabaseUrl()

  const client = new Client({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
    // Matview refreshes run for minutes against remote prod; without TCP
    // keepalive a dropped connection leaves node-pg hanging instead of erroring.
    keepAlive: true,
    keepAliveInitialDelayMillis: 30000,
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
    // Browse-by-supplier listing; depends on the current-offer + current-price models above.
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medmkp_supplier_catalog_listing`)
    // Category drill-down listing; depends on medmkp_supplier_current_price above.
    // Created WITH NO DATA, so the first ever refresh can't use CONCURRENTLY
    // (Postgres rejects it on a never-populated matview). Try CONCURRENTLY and fall
    // back to a plain populate once to bootstrap; thereafter CONCURRENTLY works.
    try {
      await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medmkp_category_catalog_listing`)
    } catch (error: any) {
      // 55000 = object_not_in_prerequisite_state ("not populated").
      if (error?.code !== "55000") throw error
      await client.query(`REFRESH MATERIALIZED VIEW medmkp_category_catalog_listing`)
    }
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
