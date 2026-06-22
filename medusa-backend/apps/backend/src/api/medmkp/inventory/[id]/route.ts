import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { requirePractice } from "../../../../utils/practice"
import { PACKAGE_CONDITIONS, needsAttention, loadOwnedItem } from "../../../../utils/inventory"

// PATCH /medmkp/inventory/:id — update an item (any change counts as a recount).
export async function PATCH(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const owned = await loadOwnedItem(medmkp, req.params.id, practiceId, res)
  if (!owned) return

  const body = (req.body ?? {}) as Record<string, any>
  const update: Record<string, any> = { id: owned.item.id }
  for (const f of [
    "canonical_product_id",
    "supplier_product_id",
    "quantity_on_hand",
    "par_level",
    "shelf_area",
    "lot_number",
    "expiration_date",
    "photo_url",
  ]) {
    if (body[f] !== undefined) update[f] = body[f]
  }
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim()
  if (body.package_condition !== undefined) {
    if (body.package_condition != null && !PACKAGE_CONDITIONS.includes(body.package_condition)) {
      res.status(422).json({ error: "Invalid package condition." })
      return
    }
    update.package_condition = body.package_condition
  }
  update.last_counted_at = new Date()
  update.counted_by = req.auth_context?.actor_id ?? null

  const saved = await medmkp.updateInventoryItems(update)
  res.json({ item: { ...saved, needs_attention: needsAttention(saved) } })
}

// DELETE /medmkp/inventory/:id
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const owned = await loadOwnedItem(medmkp, req.params.id, practiceId, res)
  if (!owned) return

  await medmkp.deleteInventoryItems(owned.item.id)
  res.json({ ok: true })
}
