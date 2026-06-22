import { model } from "@medusajs/framework/utils"

// A stocked item at a location: a matched catalog product
// (canonical_product_id, with the specific SKU in supplier_product_id when
// known), counted, with traceability fields (lot_number, expiration_date,
// package_condition). `photo_url` is a column now but the actual upload lands in
// Phase 3 (object storage). "Needs attention" (expired/expiring, at/below par,
// missing lot or expiration) is derived in the API, not stored.
const InventoryItem = model.define("medmkp_inventory_item", {
  id: model.id({ prefix: "inv" }).primaryKey(),
  location_id: model.text(),
  canonical_product_id: model.text().nullable(),
  supplier_product_id: model.text().nullable(),
  name: model.text(),
  quantity_on_hand: model.number().default(0),
  par_level: model.number().nullable(),
  shelf_area: model.text().nullable(),
  lot_number: model.text().nullable(),
  expiration_date: model.dateTime().nullable(),
  package_condition: model.text().nullable(),
  photo_url: model.text().nullable(),
  last_counted_at: model.dateTime().nullable(),
  counted_by: model.text().nullable(),
})

export default InventoryItem
