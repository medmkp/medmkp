import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../../modules/medmkp/service"
import { requirePractice } from "../../../../../utils/practice"
import { loadOwnedLocation } from "../../../../../utils/inventory"

// DELETE /medmkp/locations/:id/items — permanently remove every inventory item
// captured at this location (the "Clear list" action). Inventory is normally
// append-only compliance evidence, but a user explicitly clearing a location's
// list (e.g. resetting mis-scans) wants the captures gone for good and synced
// to every device — not just blanked from one view. Scan-session lines keep
// their own history; inventory_item_id is a plain reference, so dropping the
// items here leaves that audit trail intact (same as the location DELETE path).
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const location = await loadOwnedLocation(medmkp, req.params.id, practiceId, res)
  if (!location) return

  const items = await medmkp.listInventoryItems({ location_id: location.id })
  if (items.length) {
    await medmkp.deleteInventoryItems((items as any[]).map((i) => i.id))
  }
  res.json({ ok: true, deleted: items.length })
}
