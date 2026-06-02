import { model } from "@medusajs/framework/utils"

const CatalogItem = model.define("medmkp_catalog_item", {
  id: model.id({ prefix: "mcat" }).primaryKey(),
  supplier_id: model.text().searchable(),
  sku: model.text().searchable(),
  manufacturer: model.text().searchable(),
  brand: model.text().searchable(),
  name: model.text().searchable(),
  category: model.text().searchable(),
  unit_of_measure: model.text(),
  unit_price_cents: model.number(),
  comparable_score: model.number(),
  lead_time_days: model.number(),
  inventory_status: model.enum(["in_stock", "limited", "backordered", "unknown"]),
  exact_brand_required: model.boolean(),
})

export default CatalogItem
