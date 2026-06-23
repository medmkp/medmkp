import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MEDUSA_URL, SESSION_COOKIE, isTokenExpired } from "../../../lib/medusaAuth";

// Reads the session JWT from the httpOnly cookie. The web app never holds the
// raw token client-side, so this proxy is the only place it gets forwarded to
// Medusa as a Bearer credential.
async function bearer() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || isTokenExpired(token)) return null;
  return token;
}

// GET the practice's saved reorder-list blob. Returns { state: null } when the
// caller is signed out so the page just falls back to localStorage.
export async function GET(request) {
  const token = await bearer();
  if (!token) return NextResponse.json({ state: null });

  // Forward the poll's ?since= version token so the backend can answer
  // { unchanged: true } cheaply when the list hasn't changed.
  const since = new URL(request.url).searchParams.get("since");
  const upstream = `${MEDUSA_URL}/medmkp/reorder-list${since ? `?since=${encodeURIComponent(since)}` : ""}`;

  try {
    const response = await fetch(upstream, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ state: null });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ state: null });
  }
}

// PUT the whole app-state blob for the practice (last-write-wins).
export async function PUT(request) {
  const token = await bearer();
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/reorder-list`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ ok: false }, { status: response.status });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
