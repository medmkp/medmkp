import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MEDUSA_URL, SESSION_COOKIE, isTokenExpired } from "../../../../lib/medusaAuth";

// Opens a Stripe Customer Portal session for the signed-in practice. The buyer
// clicks "Manage billing" in Settings → we ask the backend to mint a portal
// session for their stripe_customer_id → the backend returns `{ url }` and we
// hand it back so the client can redirect. Nothing is mutated here.
export async function POST(request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || isTokenExpired(token)) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  // Send the buyer back to the billing tab when they leave the portal.
  const return_url = new URL("/app/settings?tab=billing", request.url).toString();
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/billing/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ return_url }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Upstream unavailable." }, { status: 503 });
  }
}
