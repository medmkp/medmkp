import { model } from "@medusajs/framework/utils"

const DentalPractice = model.define("medmkp_dental_practice", {
  id: model.id({ prefix: "mdp" }).primaryKey(),
  name: model.text().searchable(),
  primary_contact_name: model.text().searchable(),
  primary_contact_email: model.text(),
  phone: model.text(),
  website_url: model.text(),
  address_text: model.text(),
  practice_management_system: model.text(),
  status: model.enum(["lead", "active", "paused", "churned"]),
  // Structured default shipping address (edited from Settings → Profile). The
  // legacy free-text `address_text` is kept for the existing CRM views.
  ship_address_line1: model.text().nullable(),
  ship_address_line2: model.text().nullable(),
  ship_city: model.text().nullable(),
  ship_state: model.text().nullable(),
  ship_zip: model.text().nullable(),
  ship_country: model.text().nullable(),
  shipping_notes: model.text().nullable(),
  use_as_billing: model.boolean().default(false),
  // Buyer display/shopping preferences (currency, items per page, default UOM,
  // timezone, email + tax toggles) as a free-form blob.
  preferences: model.json().nullable(),
})

export default DentalPractice
