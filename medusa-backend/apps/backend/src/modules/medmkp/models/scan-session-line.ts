import { model } from "@medusajs/framework/utils"

// One scanned item within a scan session. Carries the raw code plus the catalog
// identity we resolved it to (canonical_product_id / supplier_product_id) and
// the traceability read off the physical package by the GS1/HIBC decoder
// (lot_number, expiration_date, production_date) — the data that lives nowhere
// in our catalog or a practice's purchase history. `status` is the review
// bucket:
//   needs_review  — couldn't identify the product (no catalog match)
//   needs_details — identified, but missing the lot/expiry an audit wants
//   confirmed     — identified with traceability captured
// Identified lines (confirmed / needs_details) are promoted to a durable
// medmkp_inventory_item at the session's location; inventory_item_id links it.
const ScanSessionLine = model.define("medmkp_scan_session_line", {
  id: model.id({ prefix: "ssl" }).primaryKey(),
  session_id: model.text(),
  barcode: model.text().nullable(),
  canonical_product_id: model.text().nullable(),
  supplier_product_id: model.text().nullable(),
  name: model.text(),
  image_url: model.text().nullable(),
  quantity: model.number().default(1),
  shelf_area: model.text().nullable(),
  lot_number: model.text().nullable(),
  expiration_date: model.dateTime().nullable(),
  production_date: model.dateTime().nullable(),
  package_condition: model.text().nullable(),
  status: model.text().default("needs_review"),
  inventory_item_id: model.text().nullable(),
  scanned_by: model.text().nullable(),
  // Receiving-mode extras (capture_type = "receiving")
  supplier_name: model.text().nullable(),
  received_date: model.dateTime().nullable(),
  // Shelf-audit outcome (capture_type = "shelf_audit")
  // Values: present | moved | not_found | removed
  shelf_audit_status: model.text().nullable(),
})

export default ScanSessionLine
