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
    // JIT compiles dozens of functions for these analytical queries and its memory
    // lives outside work_mem; on the small instance that tips builds into an OOM.
    await client.query(`SET jit = off`)
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
    // Its build is the heaviest read model — the plan runs several sort/aggregate
    // nodes at once and the SUM of their work_mem allocations OOM'd the instance at
    // 64MB even with parallelism off. 8MB forces every node to spill to disk; the
    // build then fits (~95s) instead of crashing. Created WITH NO DATA, so the
    // first ever refresh can't use CONCURRENTLY (Postgres rejects it on a
    // never-populated matview) — try CONCURRENTLY and fall back to a plain populate
    // once to bootstrap; thereafter CONCURRENTLY works.
    await client.query(`SET work_mem = '8MB'`)
    try {
      await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medmkp_category_catalog_listing`)
    } catch (error: any) {
      // Postgres raises 0A000 (feature_not_supported, "CONCURRENTLY cannot be
      // used when the materialized view is not populated"); 55000
      // (object_not_in_prerequisite_state) kept for safety across versions.
      if (error?.code !== "0A000" && error?.code !== "55000") throw error
      await client.query(`REFRESH MATERIALIZED VIEW medmkp_category_catalog_listing`)
    }
    await client.query(`SET work_mem = '64MB'`)
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
