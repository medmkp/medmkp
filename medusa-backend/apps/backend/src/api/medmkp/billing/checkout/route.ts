import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { requirePractice } from "../../../../utils/practice"
import { getStripe, stripeConfigured } from "../../../../utils/billing"

// POST /medmkp/billing/checkout — start a Stripe hosted Checkout for the paid
// "Practice" plan for the authenticated practice. Backend only; enforcement stays
// dark behind BILLING_ENFORCE. Returns { url } to the Stripe-hosted page.
//
// Customer reuse / concurrency: we resolve the Stripe customer deterministically
// so two rapid clicks never mint two customers —
//   1. reuse the subscription row's stripe_customer_id when one already exists
//      (a returning practice that once subscribed), else
//   2. create a customer with an idempotency key derived from the practice id, so
//      a rapid re-submit collapses onto the same Stripe customer.
// We deliberately do NOT create the subscription row here: its NOT-NULL Stripe
// ids + plan/fee are only known once payment completes, so the row is created
// from real Stripe data by the webhook (out of scope for this route).
//
// The price + quantity are fixed server-side (STRIPE_PRICE_PRACTICE × 1); a
// client-supplied price/quantity is never trusted. metadata.practice_id +
// client_reference_id (on the session, and mirrored onto the subscription) are
// what the webhook maps the completed checkout back to a practice with.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  if (!stripeConfigured()) {
    res.status(503).json({ error: "Billing is not configured." })
    return
  }
  const priceId = process.env.STRIPE_PRICE_PRACTICE
  if (!priceId) {
    res.status(503).json({ error: "Billing is not configured." })
    return
  }

  // success_url / cancel_url come from the storefront (it knows its own routes),
  // falling back to the request Origin, then env — same precedence as the portal.
  const body = (req.body ?? {}) as { success_url?: unknown; cancel_url?: unknown }
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : ""
  const successUrl =
    (typeof body.success_url === "string" && body.success_url) ||
    (origin && `${origin}/settings/billing?checkout=success`) ||
    process.env.BILLING_CHECKOUT_SUCCESS_URL ||
    ""
  const cancelUrl =
    (typeof body.cancel_url === "string" && body.cancel_url) ||
    (origin && `${origin}/settings/billing?checkout=cancel`) ||
    process.env.BILLING_CHECKOUT_CANCEL_URL ||
    ""
  if (!successUrl || !cancelUrl) {
    res.status(422).json({ error: "A success_url and cancel_url are required." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const stripe = getStripe()

  try {
    // Read the row first so a practice that already has a Stripe customer reuses it.
    const [sub] = await medmkp.listPracticeSubscriptions(
      { practice_id: practiceId },
      { order: { created_at: "DESC" }, take: 1 }
    )
    let customerId = (sub as any)?.stripe_customer_id as string | undefined

    if (!customerId) {
      // No customer yet — create one. The idempotency key is deterministic per
      // practice, so a rapid double-submit returns the same customer instead of a
      // duplicate (Stripe replays the first response for a repeated key).
      const customer = await stripe.customers.create(
        { metadata: { practice_id: practiceId } },
        { idempotencyKey: `practice-checkout-customer:${practiceId}` }
      )
      customerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: practiceId,
      metadata: { practice_id: practiceId },
      // Mirror the tag onto the Subscription so subscription.* webhook events (which
      // carry the Subscription object, not the Session) can also map to the practice.
      subscription_data: { metadata: { practice_id: practiceId } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error("[billing] checkout session create failed", err)
    res.status(502).json({ error: "Could not start checkout." })
  }
}
