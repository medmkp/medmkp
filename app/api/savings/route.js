import { forward } from "../../../lib/medusaProxy";

// GET /api/savings → the practice's server-computed savings. The Savings surface
// computes its display client-side, so this is used as the entitlement probe:
// a 402 (BILLING_ENFORCE + a practice without an active subscription) tells the
// UI to raise the Unlock Practice paywall.
export async function GET() {
  return forward("/medmkp/savings");
}
