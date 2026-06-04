import { model } from "@medusajs/framework/utils"

const CanonicalProduct = model.define("medmkp_canonical_product", {
  id: model.id({ prefix: "mcp" }).primaryKey(),
  handle: model.text().searchable(),
  name: model.text().searchable(),
  category: model.text().searchable(),
  description: model.text(),
  unit_of_measure: model.text(),
  attributes_text: model.text(),
})

export default CanonicalProduct
