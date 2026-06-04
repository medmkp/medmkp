import { model } from "@medusajs/framework/utils"

const CanonicalProductMatch = model.define("medmkp_canonical_product_match", {
  id: model.id({ prefix: "mcpm" }).primaryKey(),
  canonical_product_id: model.text().searchable(),
  supplier_product_id: model.text().searchable(),
  supplier_id: model.text().searchable(),
  match_status: model.enum([
    "exact",
    "variant",
    "substitute",
    "needs_review",
    "unmatched",
  ]),
  confidence_score: model.number(),
  match_reason: model.text(),
  extracted_attributes_text: model.text(),
})

export default CanonicalProductMatch
