import { model } from "@medusajs/framework/utils"

const CanonicalProduct = model.define("medmkp_canonical_product", {
  id: model.id({ prefix: "mcp" }).primaryKey(),
  handle: model.text().searchable(),
  name: model.text().searchable(),
  category: model.text().searchable(),
  description: model.text(),
  unit_of_measure: model.text(),
  attributes_text: model.text(),
  // Display-only variant family (see matching/family.ts). Null = standalone.
  family_id: model.text().nullable(),
  family_handle: model.text().nullable(),
  family_name: model.text().nullable(),
  variant_label: model.text().nullable(),
  variant_rank: model.number().nullable(),
})

export default CanonicalProduct
