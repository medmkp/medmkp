import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { requirePractice } from "../../../../utils/practice"
import { getStripe, stripeConfigured } from "../../../../utils/billing"

// POST /medmkp/billing/portal — open a Stripe Customer Portal session for the
// authenticated practice's Stripe customer, so a practice can update payment
// method / view invoices / cancel without any support surgery. Returns { url }.
//
// return_url is where Stripe sends the browser back after the portal; we take it
// from the request body (the storefront knows its own Settings→Billing URL),
// falling back to the request Origin, then BILLING_PORTAL_RETURN_URL. On return
// the storefront should hit POST /medmkp/billing/reconcile so a just-made change
// reflects immediately instead of waiting for the webhook.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  if (!stripeConfigured()) {
    res.status(503).json({ error: "Billing is not configured." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [sub] = await medmkp.listPracticeSubscriptions(
    { practice_id: practiceId },
    { order: { created_at: "DESC" }, take: 1 }
  )
  const customerId = (sub as any)?.stripe_customer_id
  if (!customerId) {
    res.status(409).json({ error: "No billing account for this practice." })
    return
  }

  const body = (req.body ?? {}) as { return_url?: unknown }
  const returnUrl =
    (typeof body.return_url === "string" && body.return_url) ||
    (typeof req.headers.origin === "string" && req.headers.origin) ||
    process.env.BILLING_PORTAL_RETURN_URL ||
    ""
  if (!returnUrl) {
    res.status(422).json({ error: "A return_url is required." })
    return
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error("[billing] portal session create failed", err)
    res.status(502).json({ error: "Could not open the billing portal." })
  }
}
