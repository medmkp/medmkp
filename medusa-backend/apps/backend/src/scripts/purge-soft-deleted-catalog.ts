import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

/**
 * Reaper for the gap-free catalog reconcile.
 *
 * The ingestion commit soft-deletes rows that disappear from a supplier's crawl
 * (so live reads never see a gap during refresh — see supplier-catalog-reconcile).
 * Those rows accumulate as `deleted_at`-stamped tombstones. This job hard-deletes
 * tombstones older than a retention window, keeping the tables from growing
 * unbounded while leaving a grace period to recover from a bad crawl.
 *
 * Usage:
 *   medusa exec ./src/scripts/purge-soft-deleted-catalog.ts -- --older-than-days=30
 *   medusa exec ./src/scripts/purge-soft-deleted-catalog.ts -- --dry-run
 */

const CHUNK = 500
const DEFAULT_RETENTION_DAYS = 30

type Tombstone = { id: string; deleted_at?: Date | string | null }

function optionValue(arg: string) {
  const [, ...parts] = arg.split("=")
  return parts.join("=")
}

function parseOptions() {
  let olderThanDays = process.env.CATALOG_PURGE_OLDER_THAN_DAYS
    ? Number(process.env.CATALOG_PURGE_OLDER_THAN_DAYS)
    : DEFAULT_RETENTION_DAYS
  let dryRun = process.env.CATALOG_PURGE_DRY_RUN === "1"

  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") {
      dryRun = true
    } else if (arg.startsWith("--older-than-days=")) {
      olderThanDays = Number(optionValue(arg))
    }
  }

  if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
    throw new Error(`--older-than-days must be a non-negative number`)
  }

  return { olderThanDays, dryRun }
}

async function inChunks<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>) {
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    await fn(rows.slice(offset, offset + CHUNK))
  }
}

function tombstoneIdsOlderThan(rows: Tombstone[], cutoff: Date) {
  return rows
    .filter((row) => row.deleted_at != null && new Date(row.deleted_at) < cutoff)
    .map((row) => row.id)
}

export default async function purgeSoftDeletedCatalog({
  container,
}: {
  container: MedusaContainer
}) {
  const { olderThanDays, dryRun } = parseOptions()

  if (!dryRun) {
    assertDestructiveDbOperationAllowed(
      "catalog:purge-soft-deleted (hard-deletes soft-deleted catalog rows)"
    )
  }

  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  const [products, matches, sources] = await Promise.all([
    medmkp.listSupplierProducts(
      {},
      { withDeleted: true, select: ["id", "deleted_at"] }
    ) as Promise<Tombstone[]>,
    medmkp.listCanonicalProductMatches(
      {},
      { withDeleted: true, select: ["id", "deleted_at"] }
    ) as Promise<Tombstone[]>,
    medmkp.listSupplierCatalogSources(
      {},
      { withDeleted: true, select: ["id", "deleted_at"] }
    ) as Promise<Tombstone[]>,
  ])

  const productIds = tombstoneIdsOlderThan(products, cutoff)
  const matchIds = tombstoneIdsOlderThan(matches, cutoff)
  const sourceIds = tombstoneIdsOlderThan(sources, cutoff)

  console.log(
    `[catalog-purge] cutoff=${cutoff.toISOString()} (>${olderThanDays}d) dry_run=${dryRun} — ` +
      `products=${productIds.length} matches=${matchIds.length} sources=${sourceIds.length}`
  )

  if (dryRun) {
    return
  }

  // Matches first (they reference products), then products, then sources.
  await inChunks(matchIds, (chunk) => medmkp.deleteCanonicalProductMatches(chunk))
  await inChunks(productIds, (chunk) => medmkp.deleteSupplierProducts(chunk))
  await inChunks(sourceIds, (chunk) => medmkp.deleteSupplierCatalogSources(chunk))

  console.log(
    `[catalog-purge] complete — hard-deleted products=${productIds.length} matches=${matchIds.length} sources=${sourceIds.length}`
  )
}
