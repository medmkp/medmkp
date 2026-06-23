import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { requirePractice } from "../../../../utils/practice"
import { loadOwnedSession, serializeSession, SESSION_STATUSES } from "../../../../utils/scan-sessions"

// GET /medmkp/scan-sessions/:id — one session (header + counts) with its lines,
// newest first. The active-session screen and the resume entry render off this.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const session = await loadOwnedSession(medmkp, req.params.id, practiceId, res)
  if (!session) return

  const [lines, location] = await Promise.all([
    medmkp.listScanSessionLines({ session_id: session.id }),
    medmkp.retrieveLocation(session.location_id).catch(() => null),
  ])
  const ordered = (lines as any[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  res.json({ session: serializeSession(session, ordered, location), lines: ordered })
}

// PATCH /medmkp/scan-sessions/:id — rename, or move status (complete / abandon /
// reopen). Completing stamps completed_at; reopening clears it.
export async function PATCH(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const session = await loadOwnedSession(medmkp, req.params.id, practiceId, res)
  if (!session) return

  const body = (req.body ?? {}) as Record<string, any>
  const update: Record<string, any> = { id: session.id }
  if (typeof body.name === "string") update.name = body.name.trim() || null
  if (body.status !== undefined) {
    if (!(SESSION_STATUSES as readonly string[]).includes(body.status)) {
      res.status(422).json({ error: `Invalid status. Expected one of: ${SESSION_STATUSES.join(", ")}.` })
      return
    }
    update.status = body.status
    update.completed_at = body.status === "completed" ? new Date() : null
  }

  const saved = await medmkp.updateScanSessions(update)
  const [lines, location] = await Promise.all([
    medmkp.listScanSessionLines({ session_id: session.id }),
    medmkp.retrieveLocation(session.location_id).catch(() => null),
  ])
  res.json({ session: serializeSession(saved, lines as any[], location) })
}

// DELETE /medmkp/scan-sessions/:id — discard the session and its lines. Promoted
// inventory items persist (they're the durable count); only the audit run is
// removed.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const session = await loadOwnedSession(medmkp, req.params.id, practiceId, res)
  if (!session) return

  const lines = (await medmkp.listScanSessionLines({ session_id: session.id })) as any[]
  if (lines.length) await medmkp.deleteScanSessionLines(lines.map((l) => l.id))
  await medmkp.deleteScanSessions(session.id)
  res.json({ ok: true })
}
