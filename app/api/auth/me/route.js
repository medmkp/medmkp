import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MEDUSA_URL, SESSION_COOKIE, isTokenExpired } from "../../../../lib/medusaAuth";

export async function GET() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const authenticated = Boolean(token) && !isTokenExpired(token);
  if (!authenticated) return NextResponse.json({ authenticated: false });

  // Enrich with the buyer's name + practice so the app shell can show who's
  // signed in instead of a hardcoded placeholder. Non-fatal if Medusa is slow.
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.ok) {
      // `subscription` is forwarded when the backend emits it (billing) so the
      // app can read entitlement. It's optional — older backends omit it, in
      // which case the app treats the account as fully active (no banner, no
      // read-only gate) and the billing tab treats it as Free (no plan/status).
      const { customer, practice, subscription } = await response.json();
      return NextResponse.json({ authenticated: true, customer, practice, subscription });
    }
  } catch {
    // fall through — still authenticated, just without profile details
  }
  return NextResponse.json({ authenticated: true });
}

// Persists the buyer-editable profile (customer name/phone + practice name,
// shipping address, preferences). Proxies to the backend with the session
// cookie as a Bearer token.
export async function PUT(request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const authenticated = Boolean(token) && !isTokenExpired(token);
  if (!authenticated) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Could not save your profile." }, { status: 503 });
  }
}
