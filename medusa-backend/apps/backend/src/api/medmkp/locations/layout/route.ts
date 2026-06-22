import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { requirePractice } from "../../../../utils/practice"
import { loadOwnedLocation } from "../../../../utils/inventory"

// PATCH /medmkp/locations/layout — bulk-save Office Layout positions.
// Body: { positions: [{ id, layout_x, layout_y }] }
export async function PATCH(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  const body = (req.body ?? {}) as Record<string, any>
  const positions = Array.isArray(body.positions) ? body.positions : null
  if (!positions) {
    res.status(422).json({ error: "Expected { positions: [{ id, layout_x, layout_y }] }." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  // Verify every targeted location belongs to this practice before writing any.
  for (const p of positions) {
    const owned = await loadOwnedLocation(medmkp, p.id, practiceId, res)
    if (!owned) return
  }
  for (const p of positions) {
    await medmkp.updateLocations({ id: p.id, layout_x: p.layout_x ?? null, layout_y: p.layout_y ?? null })
  }

  res.json({ ok: true })
}
