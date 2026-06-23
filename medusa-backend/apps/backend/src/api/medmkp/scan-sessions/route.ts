import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { requirePractice } from "../../../utils/practice"
import { loadOwnedLocation } from "../../../utils/inventory"
import { SESSION_STATUSES, serializeSession } from "../../../utils/scan-sessions"

// GET /medmkp/scan-sessions — the practice's scan sessions (optionally filtered
// by ?location_id= and/or ?status=), each with its derived review-bucket counts
// and the location's name/type. Used by the Scan Sessions list and to find a
// resumable session for a location.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const filter: Record<string, any> = { practice_id: practiceId }
  const locationId = (req.query.location_id as string)?.trim()
  const status = (req.query.status as string)?.trim()
  if (locationId) filter.location_id = locationId
  if (status && (SESSION_STATUSES as readonly string[]).includes(status)) filter.status = status

  const sessions = await medmkp.listScanSessions(filter)
  const sessionIds = sessions.map((s: any) => s.id)
  const lines = sessionIds.length
    ? await medmkp.listScanSessionLines({ session_id: sessionIds })
    : []
  const locations = await medmkp.listLocations({ practice_id: practiceId })

  const linesBySession = new Map<string, any[]>()
  for (const line of lines as any[]) {
    const arr = linesBySession.get(line.session_id) ?? []
    arr.push(line)
    linesBySession.set(line.session_id, arr)
  }
  const locationById = new Map((locations as any[]).map((l) => [l.id, l]))

  const serialized = (sessions as any[])
    .map((s) => serializeSession(s, linesBySession.get(s.id) ?? [], locationById.get(s.location_id)))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  res.json({ sessions: serialized })
}

// POST /medmkp/scan-sessions — start (or resume) a session for a location. We
// keep at most one active session per location: if one is already open, return
// it rather than fork the count.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const body = (req.body ?? {}) as Record<string, any>
  const locationId = typeof body.location_id === "string" ? body.location_id.trim() : ""
  if (!locationId) {
    res.status(422).json({ error: "location_id is required." })
    return
  }
  const location = await loadOwnedLocation(medmkp, locationId, practiceId, res)
  if (!location) return

  const existing = (await medmkp.listScanSessions({
    practice_id: practiceId,
    location_id: location.id,
    status: "active",
  })) as any[]
  if (existing.length) {
    const lines = await medmkp.listScanSessionLines({ session_id: existing[0].id })
    res.status(200).json({ session: serializeSession(existing[0], lines as any[], location), resumed: true })
    return
  }

  const created = await medmkp.createScanSessions({
    practice_id: practiceId,
    location_id: location.id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : null,
    status: "active",
    started_by: req.auth_context?.actor_id ?? null,
  })

  res.status(201).json({ session: serializeSession(created, [], location), resumed: false })
}
