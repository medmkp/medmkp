import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

// Backfills supplier_product.external_variant_id from the variant id the
// Shopify adapters have always stashed in raw_text (raw.variant_id) — so cart
// permalinks can use the exact ingested variant without waiting for the next
// full re-ingest of every storefront. One-shot; new ingests write the column
// directly (see ingestion/supplier-catalog.ts). DRY-RUN by default.
//
//   npm run catalog:backfill-variant-ids                      # dry-run (no writes)
//   VARIANT_BACKFILL_COMMIT=true npm run catalog:backfill-variant-ids                   # write (local)
//   VARIANT_BACKFILL_COMMIT=true ALLOW_REMOTE_DB_DESTRUCTIVE=true npm run catalog:backfill-variant-ids   # write (remote)
export default async function backfillExternalVariantId({ container, args }: { container: any; args: string[] }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  // Env var, not argv: `medusa exec` doesn't reliably forward `--` args (same
  // reason pack:backfill commits via PACK_BACKFILL_COMMIT).
  const commit = process.env.VARIANT_BACKFILL_COMMIT === "true" || (args || []).includes("--commit")
  const dbUrl = process.env.DATABASE_URL || ""
  const host = (() => { try { return new URL(dbUrl).hostname } catch { return "?" } })()

  logger.info(`Variant-id backfill: host=${host} mode=${commit ? "COMMIT" : "DRY-RUN"}`)
  if (commit) {
    assertDestructiveDbOperationAllowed("backfill-external-variant-id", dbUrl)
  }

  const batchSize = 5000
  let lastId = ""
  let found = 0
  let updated = 0

  for (;;) {
    // Extract in SQL so raw_text never crosses the wire; the LIKE prefilter
    // keeps each batch to rows that can actually match. Handles both numeric
    // ("variant_id":51368978121025) and string ("variant_id":"513...") forms.
    // The regex's optional quote is written \\? — knex.raw treats a bare ? as
    // a bind placeholder and would mangle the pattern.
    const rows: Array<{ id: string; vid: string | null }> = await knex("medmkp_supplier_product")
      .select("id")
      .select(knex.raw(`substring(raw_text from '"variant_id":\\s*"\\?([0-9]+)') as vid`))
      .where("id", ">", lastId)
      .whereNull("external_variant_id")
      .whereNull("deleted_at")
      .whereLike("raw_text", '%"variant_id":%')
      .orderBy("id", "asc")
      .limit(batchSize)

    if (!rows.length) break
    lastId = rows[rows.length - 1].id

    const withVid = rows.filter((row) => row.vid)
    found += withVid.length
    if (!withVid.length || !commit) continue

    const tuples = withVid.map(() => "(?::text, ?::text)").join(", ")
    const values = withVid.flatMap((row) => [row.id, row.vid])
    const result = await knex.raw(
      `update medmkp_supplier_product p
       set external_variant_id = v.vid
       from (values ${tuples}) as v(id, vid)
       where p.id = v.id and p.external_variant_id is null`,
      values
    )
    updated += result?.rowCount ?? 0
    logger.info(`  …through ${lastId.slice(0, 60)} (${updated} written)`)
  }

  logger.info(
    `Variant-id backfill ${commit ? "wrote" : "would write"} ${commit ? updated : found} rows${commit ? "" : " (dry-run)"}`
  )
}
