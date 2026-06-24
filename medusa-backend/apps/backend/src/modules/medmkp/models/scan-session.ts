import { model } from "@medusajs/framework/utils"

// A stateful, resumable scan session. SHELF AUDIT sessions are an audit of one
// location (location_id set; one active session per location, completing freezes
// the count). RECEIVING sessions log an arriving delivery, which fans out to many
// shelves — so location_id is null on the session and captured per line instead.
// The review buckets (confirmed / needs details / needs review) are derived from
// the lines, not stored — see utils/scan-sessions.ts.
const ScanSession = model.define("medmkp_scan_session", {
  id: model.id({ prefix: "ssn" }).primaryKey(),
  practice_id: model.text(),
  // The audited location for shelf audit; null for receiving (per-line location).
  location_id: model.text().nullable(),
  name: model.text().nullable(),
  // active | completed | abandoned
  status: model.text().default("active"),
  // receiving | shelf_audit — Receiving creates/refreshes evidence + (later)
  // seeds reorder history; Shelf Audit verifies presence/location/status.
  capture_type: model.text().default("shelf_audit"),
  started_by: model.text().nullable(),
  completed_at: model.dateTime().nullable(),
})

export default ScanSession
