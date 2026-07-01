import { forward } from "../../../../lib/medusaProxy";

// POST /api/billing/checkout → start a Stripe Checkout session for the practice
// (the "Upgrade" action on the Unlock Practice paywall). Relays the backend's
// { url } so the browser can redirect. Backend route: #546.
export async function POST() {
  return forward("/medmkp/billing/checkout", { method: "POST" });
}
