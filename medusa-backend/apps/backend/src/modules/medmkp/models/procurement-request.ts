import { model } from "@medusajs/framework/utils"

const ProcurementRequest = model.define("medmkp_procurement_request", {
  id: model.id({ prefix: "mpr" }).primaryKey(),
  buyer_name: model.text().searchable(),
  buyer_facility_type: model.enum(["pt", "chiro", "rehab", "dental", "cpap", "other"]),
  buyer_email: model.text(),
  status: model.enum(["uploaded", "reviewing", "quoted", "approved", "ordered", "fulfilled"]),
  source_file_name: model.text(),
  item_count: model.number(),
  target_savings_percent: model.number(),
  notes: model.text(),
})

export default ProcurementRequest
