import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { requirePractice } from "../../../../utils/practice"
import {
  loadOwnedLine,
  deriveLineStatus,
  sessionCounts,
  syncInventoryFromLine,
  isPackageCondition,
} from "../../../../utils/scan-sessions"

// PATCH /medmkp/scan-lines/:id — capture or correct a scanned line: quantity,
// shelf, package condition, lot/expiry, or link it to a catalog product. The
// review bucket is re-derived from the merged result and the line's inventory
// item is kept in sync (created when it first becomes identified, dropped if it
// loses its identity).
export async function PATCH(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const owned = await loadOwnedLine(medmkp, req.params.id, practiceId, res)
  if (!owned) return
  const { line, session } = owned

  const body = (req.body ?? {}) as Record<string, any>
  if (body.package_condition !== undefined && !isPackageCondition(body.package_condition)) {
    res.status(422).json({ error: "Invalid package condition." })
    return
  }

  const update: Record<string, any> = { id: line.id }
  for (const f of [
    "barcode",
    "canonical_product_id",
    "supplier_product_id",
    "image_url",
    "shelf_area",
    "lot_number",
    "expiration_date",
    "production_date",
    "package_condition",
  ]) {
    if (body[f] !== undefined) update[f] = body[f]
  }
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim()
  if (body.quantity !== undefined) {
    update.quantity = Number.isFinite(body.quantity) && body.quantity > 0 ? body.quantity : 1
  }

  // Re-derive the bucket from the merged identity + traceability.
  const merged = { ...line, ...update }
  update.status = deriveLineStatus(merged)

  const saved = await medmkp.updateScanSessionLines(update)
  const actor = req.auth_context?.actor_id ?? null
  const inventoryItemId = await syncInventoryFromLine(medmkp, saved, session.location_id, actor)
  const line2 =
    inventoryItemId !== saved.inventory_item_id
      ? await medmkp.updateScanSessionLines({ id: saved.id, inventory_item_id: inventoryItemId })
      : saved

  const lines = await medmkp.listScanSessionLines({ session_id: session.id })
  res.json({ line: line2, counts: sessionCounts(lines as any[]) })
}

// DELETE /medmkp/scan-lines/:id — remove a mis-scan. While the session is still
// active, also undo the inventory item this line created; once the session is
// completed the inventory is durable and left alone.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const owned = await loadOwnedLine(medmkp, req.params.id, practiceId, res)
  if (!owned) return
  const { line, session } = owned

  if (line.inventory_item_id && session.status === "active") {
    await medmkp.deleteInventoryItems(line.inventory_item_id).catch(() => {})
  }
  await medmkp.deleteScanSessionLines(line.id)

  const lines = await medmkp.listScanSessionLines({ session_id: session.id })
  res.json({ ok: true, counts: sessionCounts(lines as any[]) })
}
