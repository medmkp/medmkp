import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../../modules/medmkp/service"
import { requirePractice } from "../../../../../utils/practice"
import { PACKAGE_CONDITIONS, needsAttention, loadOwnedLocation } from "../../../../../utils/inventory"

// GET /medmkp/locations/:id/inventory — items at a location.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const location = await loadOwnedLocation(medmkp, req.params.id, practiceId, res)
  if (!location) return

  const items = await medmkp.listInventoryItems({ location_id: location.id })
  const now = new Date()
  res.json({ items: (items as any[]).map((i) => ({ ...i, needs_attention: needsAttention(i, now) })) })
}

// POST /medmkp/locations/:id/inventory — add an item to a location.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const location = await loadOwnedLocation(medmkp, req.params.id, practiceId, res)
  if (!location) return

  const body = (req.body ?? {}) as Record<string, any>
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) {
    res.status(422).json({ error: "Item name is required." })
    return
  }
  if (body.package_condition != null && !PACKAGE_CONDITIONS.includes(body.package_condition)) {
    res.status(422).json({ error: "Invalid package condition." })
    return
  }

  const created = await medmkp.createInventoryItems({
    location_id: location.id,
    canonical_product_id: body.canonical_product_id ?? null,
    supplier_product_id: body.supplier_product_id ?? null,
    name,
    quantity_on_hand: Number.isFinite(body.quantity_on_hand) ? body.quantity_on_hand : 0,
    par_level: body.par_level ?? null,
    shelf_area: body.shelf_area ?? null,
    lot_number: body.lot_number ?? null,
    expiration_date: body.expiration_date ?? null,
    package_condition: body.package_condition ?? null,
    photo_url: body.photo_url ?? null,
    last_counted_at: new Date(),
    counted_by: req.auth_context?.actor_id ?? null,
  })

  res.status(201).json({ item: { ...created, needs_attention: needsAttention(created) } })
}
