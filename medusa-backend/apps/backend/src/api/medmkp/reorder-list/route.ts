import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { resolvePracticeId } from "../../../utils/practice"
import { mergeReorderState } from "./merge"

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

  const incoming = (req.body ?? {}) as Record<string, unknown>

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [existing] = await medmkp.listReorderLists({ practice_id: practiceId })

  // Merge the incoming blob into the stored one instead of overwriting it. The
  // list is edited from multiple devices (desk + phone); a blind last-write-wins
  // PUT lets a stale tab clobber items another device just added. The merge is
  // commutative — an item is only removed by an explicit tombstone
  // (included:false), never by being absent from one device's blob — so devices
  // converge regardless of write order and a scan can't be wiped by a stale save.
  const state = mergeReorderState(
    (existing?.state ?? {}) as Record<string, unknown>,
    incoming,
  )

  const saved = existing
    ? await medmkp.updateReorderLists({ id: existing.id, state })
    : await medmkp.createReorderLists({ practice_id: practiceId, state })

  res.json({ ok: true, state: saved.state, updated_at: saved.updated_at })
}
