import { model } from "@medusajs/framework/utils"

const Supplier = model.define("medmkp_supplier", {
  id: model.id({ prefix: "msup" }).primaryKey(),
  name: model.text().searchable(),
  slug: model.text(),
  website_url: model.text(),
  support_email: model.text(),
  onboarding_status: model.enum(["invited", "in_review", "approved", "paused"]),
  ein_last_four: model.text(),
  certification_summary: model.text(),
  default_lead_time_days: model.number(),
  ach_enabled: model.boolean(),
  catalog_source_urls: model.text(),
  catalog_source_notes: model.text(),
  // Published shipping policy, evaluated per-supplier order (basket) when
  // computing landed cost. The dominant pattern for these distributors is
  // "free over $X, otherwise a flat fee" — null on either field means that
  // part of the policy is unknown, so we don't fabricate a shipping estimate.
  free_shipping_threshold_cents: model.number().nullable(),
  flat_shipping_cents: model.number().nullable(),
  shipping_policy_notes: model.text().nullable(),
  // Tiered flat rate for suppliers whose fee steps with the order subtotal
  // (e.g. Darby: $13.95 under $150, $10.95 at $150+). JSON array of
  // { min_subtotal_cents, flat_cents } sorted ascending; the highest tier whose
  // min is <= the basket subtotal wins. Takes precedence over flat_shipping_cents
  // when present; null keeps the simple single-flat path.
  shipping_flat_tiers: model.json().nullable(),
  // Published delivery promise (Layer 1). Stated ground transit window in
  // business days and the same-day order cutoff. Null = unknown, so we show
  // "ship time not estimated" rather than inventing an arrival date.
  transit_days_min: model.number().nullable(),
  transit_days_max: model.number().nullable(),
  order_cutoff_local: model.text().nullable(),
  ships_same_day: model.boolean().nullable(),
  // Distribution-center origin(s) for per-destination ground estimation
  // (Layer 2). Comma-separated origin ZIPs + carrier; only set when the DC
  // location is actually confirmed, since a wrong/incomplete origin would
  // contradict the stated window. Null = fall back to the stated transit window.
  dist_center_zips: model.text().nullable(),
  ship_carrier: model.text().nullable(),
  shipping_time_notes: model.text().nullable(),
})

export default Supplier
