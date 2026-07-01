import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MEDUSA_URL, SESSION_COOKIE, isTokenExpired } from "../../../../lib/medusaAuth";

// Starts a Stripe Checkout session so a free practice can upgrade to Practice.
// "Upgrade to Practice" in Settings → the backend creates the checkout session
// for this practice → returns `{ url }` and we hand it back for the redirect.
export async function POST(request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || isTokenExpired(token)) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const origin = new URL(request.url).origin;
  const success_url = `${origin}/app/settings?tab=billing&checkout=success`;
  const cancel_url = `${origin}/app/settings?tab=billing&checkout=canceled`;
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ success_url, cancel_url }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Upstream unavailable." }, { status: 503 });
  }
}
