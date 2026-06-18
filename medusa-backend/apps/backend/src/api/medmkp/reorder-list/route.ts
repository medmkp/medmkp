import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { resolvePracticeId } from "../../../utils/practice"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }
  const practiceId = await resolvePracticeId(req)
  if (!practiceId) {
    res.status(404).json({ error: "No practice linked to this account." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [existing] = await medmkp.listReorderLists({ practice_id: practiceId })

  res.json({
    state: existing?.state ?? null,
    updated_at: existing?.updated_at ?? null,
  })
}

export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }
  const practiceId = await resolvePracticeId(req)
  if (!practiceId) {
    res.status(404).json({ error: "No practice linked to this account." })
    return
  }

  // The whole app-state blob is the body; we store it as-is (last-write-wins).
  const state = (req.body ?? {}) as Record<string, unknown>

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [existing] = await medmkp.listReorderLists({ practice_id: practiceId })

  const saved = existing
    ? await medmkp.updateReorderLists({ id: existing.id, state })
    : await medmkp.createReorderLists({ practice_id: practiceId, state })

  res.json({ ok: true, updated_at: saved.updated_at })
}
