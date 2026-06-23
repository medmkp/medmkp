import { model } from "@medusajs/framework/utils"

// A stateful, resumable inventory audit at one location: the buyer chooses a
// location, scans the items on its shelves, and each scan becomes a
// scan_session_line. One active session per location at a time; completing it
// freezes the count. The review buckets (confirmed / needs details / needs
// review) are derived from the lines, not stored — see utils/scan-sessions.ts.
const ScanSession = model.define("medmkp_scan_session", {
  id: model.id({ prefix: "ssn" }).primaryKey(),
  practice_id: model.text(),
  location_id: model.text(),
  name: model.text().nullable(),
  // active | completed | abandoned
  status: model.text().default("active"),
  started_by: model.text().nullable(),
  completed_at: model.dateTime().nullable(),
})

export default ScanSession
