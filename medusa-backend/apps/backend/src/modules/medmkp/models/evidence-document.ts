import { model } from "@medusajs/framework/utils"

// Metadata for a compliance evidence document in the Evidence Library. File
// bytes stay in object storage; this row only carries identity, linkage,
// traceability, review, and attribution fields.
const EvidenceDocument = model.define("medmkp_evidence_document", {
  id: model.id({ prefix: "evdoc" }).primaryKey(),
  practice_id: model.text(),
  document_type: model.enum(["sds", "ifu", "expiration", "lot", "service", "price", "waterline", "other"]),
  status: model.enum(["missing", "captured", "partial", "verified", "rejected", "archived"]).default("captured"),
  file_name: model.text().nullable(),
  file_mime_type: model.text().nullable(),
  file_extension: model.text().nullable(),
  file_size_bytes: model.number().nullable(),
  storage_key: model.text().nullable(),
  source: model.text().nullable(),
  inventory_item_id: model.text().nullable(),
  canonical_product_id: model.text().nullable(),
  supplier_id: model.text().nullable(),
  supplier_product_id: model.text().nullable(),
  location_id: model.text().nullable(),
  lot_number: model.text().nullable(),
  expiration_date: model.dateTime().nullable(),
  review_due_at: model.dateTime().nullable(),
  reviewed_at: model.dateTime().nullable(),
  reviewed_by: model.text().nullable(),
  review_note: model.text().nullable(),
  notes: model.text().nullable(),
  created_by: model.text().nullable(),
  updated_by: model.text().nullable(),
  uploaded_by: model.text().nullable(),
  uploaded_at: model.dateTime().nullable(),
  deleted_by: model.text().nullable(),
})

export default EvidenceDocument
