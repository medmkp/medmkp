import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

// Curated, source-cited shipping policies for suppliers that PUBLISH a usable
// rule on their website. This makes the otherwise-manual prod write reproducible
// and auditable: re-runnable after a DB reset, reviewable in code, and clear
// about where each number came from.
//
// Most B2B dental distributors quote shipping at checkout or under an account,
// so they are intentionally absent here — leaving their policy null makes the
// app honestly show "Not estimated" rather than inventing a number. Add an entry
// only when the supplier publishes a flat fee and/or a free-shipping threshold,
// or when you have account-specific terms to record.
//
//   npm run supplier:seed-shipping-policies                              # dry-run
//   SEED_SHIPPING_POLICIES_COMMIT=true npm run supplier:seed-shipping-policies          # write (local)
//   SEED_SHIPPING_POLICIES_COMMIT=true ALLOW_REMOTE_DB_DESTRUCTIVE=true npm run supplier:seed-shipping-policies   # write (remote)

type Policy = {
  slug: string
  free_shipping_threshold_cents: number | null
  flat_shipping_cents: number | null
  shipping_policy_notes: string
}

const PUBLISHED_POLICIES: Policy[] = [
  {
    slug: "dc-dental",
    free_shipping_threshold_cents: null,
    flat_shipping_cents: 800,
    shipping_policy_notes:
      "Published policy: $8 minimum handling fee includes shipping (dcdental.com/terms-conditions, retrieved 2026-06-19).",
  },
  {
    slug: "carolina-dental-supply",
    free_shipping_threshold_cents: 25000,
    flat_shipping_cents: null,
    shipping_policy_notes:
      "Published policy: free standard shipping on US orders over $250; under $250 calculated at checkout (carolinadental.com/policies/shipping-policy, retrieved 2026-06-19).",
  },
]

const usd = (cents: number | null) => (cents == null ? "—" : `$${(cents / 100).toFixed(2)}`)

export default async function seedSupplierShippingPolicies({ container, args }: { container: any; args: string[] }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const commit = process.env.SEED_SHIPPING_POLICIES_COMMIT === "true" || (args || []).includes("--commit")
  const dbUrl = process.env.DATABASE_URL || ""
  const host = (() => { try { return new URL(dbUrl).hostname } catch { return "?" } })()

  logger.info(`Seed supplier shipping policies: host=${host} mode=${commit ? "COMMIT" : "DRY-RUN"}`)
  if (commit) assertDestructiveDbOperationAllowed("seed-supplier-shipping-policies", dbUrl)

  let updated = 0
  let missing = 0
  for (const policy of PUBLISHED_POLICIES) {
    const rows: Array<{ id: string; name: string }> = await knex("medmkp_supplier")
      .select("id", "name")
      .where("slug", policy.slug)
      .whereNull("deleted_at")
    if (!rows.length) {
      logger.warn(`  skip ${policy.slug}: no matching supplier`)
      missing += 1
      continue
    }
    logger.info(`  ${rows[0].name} (${policy.slug}): free≥${usd(policy.free_shipping_threshold_cents)}, flat ${usd(policy.flat_shipping_cents)}`)
    if (commit) {
      await knex("medmkp_supplier")
        .where("slug", policy.slug)
        .whereNull("deleted_at")
        .update({
          free_shipping_threshold_cents: policy.free_shipping_threshold_cents,
          flat_shipping_cents: policy.flat_shipping_cents,
          shipping_policy_notes: policy.shipping_policy_notes,
          updated_at: knex.fn.now(),
        })
      updated += rows.length
    }
  }

  logger.info(
    commit
      ? `COMMIT complete — updated ${updated} supplier(s), ${missing} not found.`
      : `DRY-RUN complete — ${PUBLISHED_POLICIES.length - missing} supplier(s) would be updated, ${missing} not found. Re-run with --commit to persist.`
  )
}
