import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { requirePractice } from "../../../../utils/practice"
import { LOCATION_TYPES, needsAttention, loadOwnedLocation, attachInventoryImages } from "../../../../utils/inventory"

// GET /medmkp/locations/:id — one location plus its inventory items.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const location = await loadOwnedLocation(medmkp, req.params.id, practiceId, res)
  if (!location) return

  const items = await medmkp.listInventoryItems({ location_id: location.id })
  const withImages = await attachInventoryImages(medmkp, items as any[])
  const now = new Date()
  res.json({
    location: {
      ...location,
      item_count: items.length,
      needs_attention_count: (items as any[]).filter((i) => needsAttention(i, now)).length,
    },
    items: withImages.map((i) => ({ ...i, needs_attention: needsAttention(i, now) })),
  })
}

// PATCH /medmkp/locations/:id — partial update (name, type, notes, layout_x/y).
export async function PATCH(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const location = await loadOwnedLocation(medmkp, req.params.id, practiceId, res)
  if (!location) return

  const body = (req.body ?? {}) as Record<string, any>
  const update: Record<string, any> = { id: location.id, updated_by: req.auth_context?.actor_id ?? null }
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim()
  if (body.type !== undefined) {
    if (!LOCATION_TYPES.includes(body.type)) {
      res.status(422).json({ error: "Invalid location type." })
      return
    }
    update.type = body.type
  }
  if (body.notes !== undefined) update.notes = body.notes
  if (body.layout_x !== undefined) update.layout_x = body.layout_x
  if (body.layout_y !== undefined) update.layout_y = body.layout_y

  const saved = await medmkp.updateLocations(update)
  res.json({ location: saved })
}

// DELETE /medmkp/locations/:id — guarded; 409 if it still holds inventory unless ?force=1.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const location = await loadOwnedLocation(medmkp, req.params.id, practiceId, res)
  if (!location) return

  const items = await medmkp.listInventoryItems({ location_id: location.id })
  const force = req.query.force === "1" || req.query.force === "true"
  if (items.length && !force) {
    res.status(409).json({
      error: `Location has ${items.length} inventory item(s). Pass ?force=1 to delete it and its items.`,
    })
    return
  }
  if (items.length) {
    await medmkp.deleteInventoryItems((items as any[]).map((i) => i.id))
  }
  await medmkp.deleteLocations(location.id)
  res.json({ ok: true })
}
