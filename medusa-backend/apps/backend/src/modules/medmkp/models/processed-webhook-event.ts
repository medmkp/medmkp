import { model } from "@medusajs/framework/utils"

// Idempotency ledger for Stripe webhooks: one row per Stripe event id, written
// the first time an event is handled so duplicate/late redeliveries are no-ops.
const ProcessedWebhookEvent = model.define("medmkp_processed_webhook_event", {
  id: model.id({ prefix: "pwe" }).primaryKey(),
  // Stripe event id (evt_...) — unique so a redelivered event can't be reprocessed.
  event_id: model.text().unique(),
  type: model.text(),
  processed_at: model.dateTime(),
})

export default ProcessedWebhookEvent
