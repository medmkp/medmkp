import { model } from "@medusajs/framework/utils"

const SupplierProduct = model.define("medmkp_supplier_product", {
  id: model.id({ prefix: "msp" }).primaryKey(),
  supplier_id: model.text().searchable(),
  source_catalog: model.text().searchable(),
  source_page: model.number(),
  source_section: model.text().searchable(),
  source_group_name: model.text().searchable(),
  source_variant: model.text().searchable(),
  sku: model.text().searchable(),
  name: model.text().searchable(),
  description: model.text().searchable(),
  category: model.text().searchable(),
  subcategory: model.text().searchable(),
  product_line: model.text().searchable(),
  features_text: model.text(),
  raw_text: model.text(),
})

export default SupplierProduct
