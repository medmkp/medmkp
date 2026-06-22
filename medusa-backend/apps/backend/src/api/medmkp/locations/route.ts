import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { requirePractice } from "../../../utils/practice"
import { LOCATION_TYPES, needsAttention, mintQrCode } from "../../../utils/inventory"

// GET /medmkp/locations — the practice's locations, each with item_count and
// needs_attention_count rolled on for the Location Board.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const locations = await medmkp.listLocations({ practice_id: practiceId })

  const locationIds = locations.map((l: any) => l.id)
  const items = locationIds.length
    ? await medmkp.listInventoryItems({ location_id: locationIds })
    : []

  const now = new Date()
  const counts = new Map<string, { item_count: number; needs_attention_count: number }>()
  for (const it of items as any[]) {
    const c = counts.get(it.location_id) ?? { item_count: 0, needs_attention_count: 0 }
    c.item_count++
    if (needsAttention(it, now)) c.needs_attention_count++
    counts.set(it.location_id, c)
  }

  res.json({
    locations: locations.map((l: any) => ({
      ...l,
      item_count: counts.get(l.id)?.item_count ?? 0,
      needs_attention_count: counts.get(l.id)?.needs_attention_count ?? 0,
    })),
  })
}

// POST /medmkp/locations — create a location (server mints its qr_code).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  const body = (req.body ?? {}) as Record<string, any>
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) {
    res.status(422).json({ error: "Location name is required." })
    return
  }
  if (!LOCATION_TYPES.includes(body.type)) {
    res.status(422).json({ error: `Invalid location type. Expected one of: ${LOCATION_TYPES.join(", ")}.` })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const actor = req.auth_context?.actor_id ?? null
  const created = await medmkp.createLocations({
    practice_id: practiceId,
    name,
    type: body.type,
    qr_code: mintQrCode(),
    layout_x: body.layout_x ?? null,
    layout_y: body.layout_y ?? null,
    notes: typeof body.notes === "string" ? body.notes : null,
    created_by: actor,
    updated_by: actor,
  })

  res.status(201).json({ location: { ...created, item_count: 0, needs_attention_count: 0 } })
}
