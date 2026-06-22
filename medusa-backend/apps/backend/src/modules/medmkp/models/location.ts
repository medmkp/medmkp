import { model } from "@medusajs/framework/utils"

// A physical place supplies live within a dental practice (Hygiene Cabinet,
// Operatory 1, Sterilization, ...). The spine of the TraceDDS inventory model:
// inventory_item rows hang off a location. `qr_code` is the opaque token printed
// on the cabinet label; scanning it opens the location. `layout_x`/`layout_y`
// position the location on the Office Layout floor plan (null = not yet placed).
// `type` is one of cabinet|operatory|sterilization|lab|storage|emergency_kit|other
// (validated at the API layer, stored as text for forward flexibility).
const Location = model.define("medmkp_location", {
  id: model.id({ prefix: "loc" }).primaryKey(),
  practice_id: model.text(),
  name: model.text(),
  type: model.text(),
  qr_code: model.text().unique(),
  layout_x: model.number().nullable(),
  layout_y: model.number().nullable(),
  notes: model.text().nullable(),
  created_by: model.text().nullable(),
  updated_by: model.text().nullable(),
})

export default Location
