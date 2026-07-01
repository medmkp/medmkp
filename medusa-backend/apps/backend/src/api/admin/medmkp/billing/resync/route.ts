import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../../modules/medmkp/service"
import { getStripe, reconcilePracticeFromStripe, stripeConfigured } from "../../../../../utils/billing"

// POST /admin/medmkp/billing/resync { practice_id } — support tool to force a
// live Stripe re-read of one practice's subscription and write it back, so an
// operator can heal a drifted row without DB surgery. Admin-authed by Medusa's
// default /admin/* guard. Same one-shot reconcile as the storefront return read.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { practice_id?: unknown }
  const practiceId = typeof body.practice_id === "string" ? body.practice_id.trim() : ""
  if (!practiceId) {
    res.status(422).json({ error: "practice_id is required." })
    return
  }

  if (!stripeConfigured()) {
    res.status(503).json({ error: "Billing is not configured." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  try {
    const { sub, entitled, reconciled } = await reconcilePracticeFromStripe(
      medmkp,
      practiceId,
      getStripe()
    )
    res.json({ practice_id: practiceId, entitled, reconciled, subscription: sub })
  } catch (err) {
    console.error("[billing] admin resync failed", err)
    res.status(502).json({ error: "Could not reconcile billing." })
  }
}
