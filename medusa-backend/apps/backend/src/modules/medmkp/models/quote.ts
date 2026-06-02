import { model } from "@medusajs/framework/utils"

const Quote = model.define("medmkp_quote", {
  id: model.id({ prefix: "mq" }).primaryKey(),
  procurement_request_id: model.text().searchable(),
  supplier_id: model.text().searchable(),
  status: model.enum(["draft", "sent", "approved", "rejected", "expired"]),
  subtotal_cents: model.number(),
  estimated_shipping_cents: model.number(),
  platform_fee_cents: model.number(),
  estimated_savings_cents: model.number(),
  lead_time_days: model.number(),
  replacement_policy: model.enum(["exact_only", "buyer_flexible", "concierge_recommended"]),
})

export default Quote
