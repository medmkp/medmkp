import { model } from "@medusajs/framework/utils"

// A lot-at-location compliance evidence record: a matched catalog product
// (canonical_product_id, with the specific SKU in supplier_product_id when
// known) seen at a location, with the traceability the package carries
// (lot_number, expiration_date) and how it was captured (capture_type:
// receiving | shelf_audit). Per the decided model this is EVIDENCE, not a live
// census: `quantity_on_hand` is an estimate (is_estimated) used only for reorder
// timing, never asserted as exact, and `par_level` no longer drives alerts.
// Lifecycle (active/expiring/expired/pulled) is derived from expiration_date +
// pulled_at in utils/inventory.ts; a lot only leaves the active set when a human
// confirms it was pulled (pulled_at/pulled_reason) — expiry escalates a lot to
// "pull now", it never auto-archives. `photo_url` upload lands in Phase 3.
const InventoryItem = model.define("medmkp_inventory_item", {
  id: model.id({ prefix: "inv" }).primaryKey(),
  location_id: model.text(),
  canonical_product_id: model.text().nullable(),
  supplier_product_id: model.text().nullable(),
  // The raw code scanned. Carried so an UNIDENTIFIED scan (no catalog match) can
  // still be filed as evidence and deduped by barcode-at-location, then linked to
  // a product later. Null for manually-added or already-identified items.
  barcode: model.text().nullable(),
  name: model.text(),
  // Estimate only (is_estimated): for reorder timing, never an exact count.
  quantity_on_hand: model.number().default(0),
  is_estimated: model.boolean().default(true),
  par_level: model.number().nullable(),
  shelf_area: model.text().nullable(),
  lot_number: model.text().nullable(),
  expiration_date: model.dateTime().nullable(),
  package_condition: model.text().nullable(),
  // receiving | shelf_audit — how this record was last captured.
  capture_type: model.text().nullable(),
  // When a receiving scan logged the delivery arriving (distinct from
  // last_counted_at, which is when the record was last scanned/touched).
  received_date: model.dateTime().nullable(),
  // Set only when a human confirms the lot was physically pulled (reason:
  // expiry | recall | manual). Until then an expired lot stays loudly visible.
  pulled_at: model.dateTime().nullable(),
  pulled_reason: model.text().nullable(),
  photo_url: model.text().nullable(),
  last_counted_at: model.dateTime().nullable(),
  counted_by: model.text().nullable(),
})

export default InventoryItem
