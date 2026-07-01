import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { requirePractice } from "../../../../utils/practice"
import { getStripe, reconcilePracticeFromStripe, stripeConfigured } from "../../../../utils/billing"

// POST /medmkp/billing/reconcile — checkout / portal return read. The storefront
// calls this when the browser comes back from Stripe Checkout or the Customer
// Portal, so a just-made change (new subscription, cancel, payment fix) reflects
// immediately instead of waiting for the webhook to arrive. Reconciles the
// caller's own practice against Stripe and returns the fresh status.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

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
    res.json({
      entitled,
      reconciled,
      status: sub?.status ?? null,
    })
  } catch (err) {
    console.error("[billing] reconcile failed", err)
    res.status(502).json({ error: "Could not reconcile billing." })
  }
}
