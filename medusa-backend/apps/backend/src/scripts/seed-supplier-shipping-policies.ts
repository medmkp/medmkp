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

type ShipTier = { min_subtotal_cents: number; flat_cents: number }

type Policy = {
  slug: string
  free_shipping_threshold_cents: number | null
  flat_shipping_cents: number | null
  // Tiered flat rate (highest tier whose min_subtotal_cents <= basket wins).
  // Takes precedence over flat_shipping_cents; leave undefined for single-flat.
  shipping_flat_tiers?: ShipTier[] | null
  shipping_policy_notes: string
  // Layer 1 delivery promise. Stated ground transit window in business days +
  // optional same-day cutoff. Leave undefined when the supplier publishes no
  // usable delivery promise (we then show "ship time not estimated").
  transit_days_min?: number | null
  transit_days_max?: number | null
  order_cutoff_local?: string | null
  ships_same_day?: boolean | null
  // Layer 2 origin(s) for per-destination ground estimation. Only set when the
  // DC location is confirmed — an incomplete origin would contradict the promise.
  dist_center_zips?: string | null
  ship_carrier?: string | null
  shipping_time_notes?: string | null
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
  {
    slug: "darby-dental",
    free_shipping_threshold_cents: null,
    // Two-tier flat rate: $13.95 under $150, $10.95 at $150+.
    flat_shipping_cents: null,
    shipping_flat_tiers: [
      { min_subtotal_cents: 0, flat_cents: 1395 },
      { min_subtotal_cents: 15000, flat_cents: 1095 },
    ],
    shipping_policy_notes:
      "Published policy: flat-rate shipping — $13.95 on orders under $150, $10.95 on orders $150+ (darbydental.com/Scripts/Policies.aspx, retrieved 2026-06-21).",
    // Door-to-door promise. DCs are not individually confirmed, so Layer 2
    // distance refinement is intentionally left off (no dist_center_zips) to
    // avoid contradicting the published 1–2 day reach.
    transit_days_min: 1,
    transit_days_max: 2,
    shipping_time_notes:
      "Published: 1–2 business day delivery to most of the US via regional distribution centers + automated/barcode picking (darbydental.com/about-us, retrieved 2026-06-21).",
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
    const tierLabel = policy.shipping_flat_tiers
      ? policy.shipping_flat_tiers.map((t) => `${usd(t.flat_cents)}@${usd(t.min_subtotal_cents)}+`).join(" / ")
      : null
    const transitLabel =
      policy.transit_days_min != null || policy.transit_days_max != null
        ? `, transit ${policy.transit_days_min ?? "?"}–${policy.transit_days_max ?? "?"}d`
        : ""
    logger.info(
      `  ${rows[0].name} (${policy.slug}): free≥${usd(policy.free_shipping_threshold_cents)}, flat ${tierLabel ?? usd(policy.flat_shipping_cents)}${transitLabel}`
    )
    if (commit) {
      await knex("medmkp_supplier")
        .where("slug", policy.slug)
        .whereNull("deleted_at")
        .update({
          free_shipping_threshold_cents: policy.free_shipping_threshold_cents,
          flat_shipping_cents: policy.flat_shipping_cents,
          shipping_flat_tiers:
            policy.shipping_flat_tiers != null ? JSON.stringify(policy.shipping_flat_tiers) : null,
          shipping_policy_notes: policy.shipping_policy_notes,
          transit_days_min: policy.transit_days_min ?? null,
          transit_days_max: policy.transit_days_max ?? null,
          order_cutoff_local: policy.order_cutoff_local ?? null,
          ships_same_day: policy.ships_same_day ?? null,
          dist_center_zips: policy.dist_center_zips ?? null,
          ship_carrier: policy.ship_carrier ?? null,
          shipping_time_notes: policy.shipping_time_notes ?? null,
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
