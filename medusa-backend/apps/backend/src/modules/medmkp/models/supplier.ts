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
})

export default Supplier
