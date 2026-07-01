import Stripe from "stripe"
import type MedMKPModuleService from "../modules/medmkp/service"

// Thin billing helpers shared by the Customer-Portal route, the checkout/portal
// return reconcile, the deny-path read-through in assertEntitled, and the admin
// re-sync. Deliberately NO cron and NO cache layer (premature at zero customers,
// per the billing plan) — reconcile is only ever pulled on an explicit trigger.

let _stripe: Stripe | null = null

// Lazy singleton Stripe client from STRIPE_SECRET_KEY. Throws when the key is
// unset so callers can decide how to degrade (routes → 503; read-through → skip).
export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  _stripe = new Stripe(key)
  return _stripe
}

// Whether Stripe is configured at all — used to skip the read-through when the
// env isn't wired (keeps the dark-launch and local/test paths inert).
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

// The subset of the persisted subscription row this module reads/writes.
export type SubscriptionRow = {
  id: string
  status: string
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  renews_at?: string | null
}

export type ReconcileResult = {
  // The subscription row after reconcile (or the untouched local row when there
  // was nothing to reconcile against). Null only when the practice has no row.
  sub: SubscriptionRow | null
  // Entitled == the reconciled status is "active".
  entitled: boolean
  // True when a live Stripe read updated the local row.
  reconciled: boolean
}

// Re-read one practice's subscription from Stripe and write status / renews_at /
// last_reconciled_at back to the local row. This is the single reconcile path:
// it self-heals a row that drifted because a webhook was missed, delayed, or
// arrived out of order. Bounded to one Stripe read; caller supplies the client
// so it stays testable and the deny-path read-through can pass a shared client.
export async function reconcilePracticeFromStripe(
  medmkp: MedMKPModuleService,
  practiceId: string,
  stripe: Stripe
): Promise<ReconcileResult> {
  const [row] = await medmkp.listPracticeSubscriptions(
    { practice_id: practiceId },
    { order: { created_at: "DESC" }, take: 1 }
  )
  const sub = (row ?? null) as SubscriptionRow | null

  // Nothing to reconcile against without a Stripe subscription id.
  if (!sub?.stripe_subscription_id) {
    return { sub, entitled: sub?.status === "active", reconciled: false }
  }

  const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
  const status = live.status
  // current_period_end is a Unix seconds timestamp; keep renews_at as an ISO
  // string to match how the row is written elsewhere. Best-effort — leave the
  // stored value untouched if Stripe doesn't return one for this API version.
  const periodEnd = (live as any).current_period_end as number | undefined
  const renews_at =
    typeof periodEnd === "number"
      ? new Date(periodEnd * 1000).toISOString()
      : sub.renews_at ?? null

  // Only status / renews_at / last_reconciled_at are reconcilable here (customer
  // + subscription ids and plan are set at checkout). Cast the patch: Stripe's
  // status union and our column enum are the same value set, and renews_at may be
  // left unchanged (nullable in practice) — the module accepts a partial by id.
  const patch: Record<string, unknown> = { id: sub.id, status, last_reconciled_at: new Date() }
  if (renews_at != null) patch.renews_at = renews_at
  const updated = (await medmkp.updatePracticeSubscriptions(
    patch as any
  )) as unknown as SubscriptionRow

  return { sub: updated, entitled: status === "active", reconciled: true }
}
