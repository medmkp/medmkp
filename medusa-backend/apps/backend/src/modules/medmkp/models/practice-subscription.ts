import { model } from "@medusajs/framework/utils"

const PracticeSubscription = model.define("medmkp_practice_subscription", {
  id: model.id({ prefix: "mps" }).primaryKey(),
  // One subscription row per practice.
  practice_id: model.text().searchable().unique(),
  plan: model.enum(["starter", "growth", "concierge"]),
  // Full Stripe subscription status set (keeps the original four values).
  status: model.enum([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "unpaid",
    "paused",
    "canceled",
  ]),
  monthly_fee_cents: model.number(),
  started_at: model.text(),
  renews_at: model.text(),
  // Stripe identifiers are one-to-one with a subscription row.
  stripe_customer_id: model.text().unique(),
  stripe_subscription_id: model.text().unique(),
  // Last time this row was reconciled against Stripe (reconcile-on-return).
  last_reconciled_at: model.dateTime().nullable(),
})

export default PracticeSubscription
