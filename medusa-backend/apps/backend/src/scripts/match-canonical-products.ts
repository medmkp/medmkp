import path from "path"
import { Client } from "pg"
import { commitMatchRun, loadSupplierProducts } from "../matching/db"
import { runMatching } from "../matching/engine"
import { normalizeProduct } from "../matching/normalize"
import { isJunkProductName } from "../ingestion/supplier-pipeline/html"
import { writeReports } from "../matching/report"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"
import { resolveDatabaseUrl } from "../utils/database-url"

/**
 * Heap breadcrumbs for the nightly Airflow log: the matcher runs under a hard
 * --max-old-space-size cap on the NUC, and catalog growth pushed it past the
 * cap once already (exit 134, every night 2026-06-22 → 2026-07-01). Per-phase
 * numbers make the next creep visible in the task log before it kills the run.
 */
function logHeap(label: string) {
  const usage = process.memoryUsage()
  const mb = (n: number) => `${Math.round(n / 1024 / 1024)}MB`
  console.log(`[heap] ${label}: used=${mb(usage.heapUsed)} total=${mb(usage.heapTotal)} rss=${mb(usage.rss)}`)
}

async function main() {
  const commit = process.argv.includes("--commit")
  const outputDir = path.resolve(__dirname, "../../.medmkp/matching/latest")

  const databaseUrl = resolveDatabaseUrl()
  if (commit) {
    assertDestructiveDbOperationAllowed(
      "products:match --commit (resets auto-generated matches)",
      databaseUrl
    )
  }
  const client = new Client({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
    // The catalog load runs for minutes against the remote prod DB; without TCP
    // keepalive a dropped connection leaves node-pg waiting forever instead of
    // erroring, so the run hangs silently rather than failing fast.
    keepAlive: true,
    keepAliveInitialDelayMillis: 30000,
  })
  await client.connect()

  try {
    console.log("Loading supplier products and latest prices...")
    const allRows = await loadSupplierProducts(client)
    // Exclude scraper artifacts ("Ea", "Debug info copied.", bare UOM tokens) so
    // they never mint a canonical product. The commit step rebuilds all mcp_auto_*
    // canonicals from this run, so dropping the junk rows here also purges the
    // junk canonicals already in the DB on the next --commit. See #606.
    const rows = allRows.filter((row) => !isJunkProductName(row.name))
    const skipped = allRows.length - rows.length
    console.log(
      `Loaded ${allRows.length} supplier products` +
        (skipped > 0 ? ` (skipped ${skipped} junk-named artifacts)` : "")
    )
    logHeap("after load")

    console.log("Normalizing...")
    const products = rows.map(normalizeProduct)
    logHeap("after normalize")

    console.log("Matching...")
    const startedAt = Date.now()
    const result = runMatching(products)
    console.log(`Matching finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
    logHeap("after matching")

    const summary = writeReports(result, outputDir)
    console.log(JSON.stringify(summary, null, 2))
    console.log(`Reports written to ${outputDir}`)

    if (commit) {
      console.log("Committing matches to Postgres...")
      await commitMatchRun(client, result)
      console.log("Commit complete")
      logHeap("after commit")
    } else {
      console.log("Dry run (no DB writes). Re-run with --commit to persist matches.")
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
