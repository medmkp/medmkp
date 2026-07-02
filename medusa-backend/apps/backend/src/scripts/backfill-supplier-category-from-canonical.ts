import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

// Repairs supplier products whose stored category is the supplier's own name.
// The generic sitemap adapter used to stamp the distributor name as the category
// (`category: candidate.distributor`); the catalog read models
// (medmkp_supplier_product_current_offer) treat a category equal to a supplier
// name as junk and filter those rows out, so whole generic-crawled suppliers
// (Young Specialties, Zirc) showed "0 products" despite having priced, matched
// catalogs.
//
// The replacement comes from the matched canonical product's category, which is
// a real, curated value ("Instruments", "Orthodontics", ...). The forward fix is
// generic.ts extracting categories from the page breadcrumb; this repairs the
// existing rows so re-crawling isn't required.
//
// Deliberately narrow: it only touches rows whose category IS a supplier name —
// the specific generic-adapter bug. It does NOT sweep up the separate population
// of empty / "Dental supplies" categories (~67k rows, mostly price-less Patterson
// identity records and partially-categorised dedicated-adapter suppliers); that's
// a different issue and a much larger blast radius.
//
// After committing, refresh the read models so the change is visible:
//   npm run catalog:refresh-read-models
//
// DRY-RUN by default; pass `--commit` to write. Writing to a remote DB
// additionally requires ALLOW_REMOTE_DB_DESTRUCTIVE=true.
//
//   npm run catalog:backfill-category                                   # dry-run
//   ALLOW_REMOTE_DB_DESTRUCTIVE=true \
//     npm run catalog:backfill-category -- --commit                     # write (remote)

// The generic adapter's bug: category stamped as the supplier's own name. Same
// supplier-name check the current-offer read model uses to hide these rows.
const JUNK_CATEGORY_SQL = `(
  lower(btrim(sp.category)) IN (
    SELECT lower(name) FROM medmkp_supplier WHERE deleted_at IS NULL
  )
)`

// One canonical category per supplier product: prefer an exact match, then a
// stable canonical id. Only canonicals with a non-junk category qualify, so we
// never replace junk with junk.
const BEST_CANONICAL_SQL = `(
  SELECT DISTINCT ON (m.supplier_product_id)
         m.supplier_product_id, c.category
  FROM medmkp_canonical_product_match m
  JOIN medmkp_canonical_product c
    ON c.id = m.canonical_product_id AND c.deleted_at IS NULL
  WHERE m.deleted_at IS NULL
    AND m.match_status NOT IN ('unmatched', 'substitute')
    AND btrim(c.category) <> ''
    AND lower(btrim(c.category)) <> 'dental supplies'
    AND lower(btrim(c.category)) NOT IN (
      SELECT lower(name) FROM medmkp_supplier WHERE deleted_at IS NULL
    )
  ORDER BY m.supplier_product_id, (m.match_status = 'exact') DESC, c.id
)`

export default async function backfillSupplierCategoryFromCanonical({
  container,
  args,
}: {
  container: any
  args: string[]
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const commit = (args || []).includes("--commit")
  const dbUrl = process.env.DATABASE_URL || ""
  const host = (() => {
    try {
      return new URL(dbUrl).hostname
    } catch {
      return "?"
    }
  })()

  logger.info(
    `Backfill supplier category from canonical: host=${host} mode=${commit ? "COMMIT" : "DRY-RUN"}`
  )
  if (commit) {
    assertDestructiveDbOperationAllowed("backfill-supplier-category-from-canonical", dbUrl)
  }

  // Preview: how many rows would change, broken down by supplier, plus samples.
  const { rows: bySupplier } = await knex.raw(
    `
    SELECT s.name AS supplier, count(*)::int AS rows
    FROM medmkp_supplier_product sp
    JOIN ${BEST_CANONICAL_SQL} best ON best.supplier_product_id = sp.id
    JOIN medmkp_supplier s ON s.id = sp.supplier_id AND s.deleted_at IS NULL
    WHERE sp.deleted_at IS NULL
      AND ${JUNK_CATEGORY_SQL}
      AND best.category IS DISTINCT FROM sp.category
    GROUP BY s.name
    ORDER BY rows DESC
    `
  )

  const total = bySupplier.reduce((sum: number, r: any) => sum + Number(r.rows), 0)
  logger.info(`Would update ${total} supplier product(s) across ${bySupplier.length} supplier(s):`)
  bySupplier.forEach((r: any) => logger.info(`  ${r.supplier}: ${r.rows}`))

  const { rows: samples } = await knex.raw(
    `
    SELECT s.name AS supplier, sp.name AS product,
           COALESCE(NULLIF(btrim(sp.category), ''), '(empty)') AS old_category,
           best.category AS new_category
    FROM medmkp_supplier_product sp
    JOIN ${BEST_CANONICAL_SQL} best ON best.supplier_product_id = sp.id
    JOIN medmkp_supplier s ON s.id = sp.supplier_id AND s.deleted_at IS NULL
    WHERE sp.deleted_at IS NULL
      AND ${JUNK_CATEGORY_SQL}
      AND best.category IS DISTINCT FROM sp.category
    LIMIT 15
    `
  )
  samples.forEach((r: any) =>
    logger.info(`  e.g. [${r.supplier}] "${String(r.product).slice(0, 50)}": "${r.old_category}" -> "${r.new_category}"`)
  )

  if (!commit) {
    logger.info("Dry-run complete. Re-run with --commit to apply, then refresh read models.")
    return
  }

  const { rowCount } = await knex.raw(
    `
    UPDATE medmkp_supplier_product sp
    SET category = best.category, updated_at = now()
    FROM ${BEST_CANONICAL_SQL} best
    WHERE sp.id = best.supplier_product_id
      AND sp.deleted_at IS NULL
      AND ${JUNK_CATEGORY_SQL}
      AND best.category IS DISTINCT FROM sp.category
    `
  )

  logger.info(`Updated ${rowCount} supplier product(s). Now run: npm run catalog:refresh-read-models`)
}
