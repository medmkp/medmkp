import { model } from "@medusajs/framework/utils"

// A practice's login for one supplier, used by the headless buying agent to
// build carts on their behalf. The password is sealed with AES-256-GCM (see
// utils/secret-vault) — `password_encrypted` is never returned to the client;
// only `username_hint` (a masked echo) is surfaced so a buyer can confirm which
// account is stored.
const SupplierCredential = model.define("medmkp_supplier_credential", {
  id: model.id({ prefix: "sucr" }).primaryKey(),
  practice_id: model.text(),
  supplier_id: model.text(),
  username: model.text(),
  username_hint: model.text(),
  password_encrypted: model.text(),
  // Result of the last login attempt by the agent, so the UI can warn before a
  // cart build that the saved credentials went stale.
  last_verified_at: model.dateTime().nullable(),
  last_status: model.enum(["unverified", "ok", "auth_failed", "error"]).default("unverified"),
  last_error: model.text().nullable(),
})

export default SupplierCredential
