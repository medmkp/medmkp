import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MEDUSA_URL, SESSION_COOKIE, isTokenExpired } from "../../../lib/medusaAuth";

// Proxies cart-build jobs for the headless buying agent: POST enqueues a job for
// one supplier, GET polls status. The agent (on the NUC) drives the actual cart.
async function bearer() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || isTokenExpired(token)) return null;
  return token;
}

export async function GET(request) {
  const token = await bearer();
  if (!token) return NextResponse.json({ jobs: [] });
  const id = new URL(request.url).searchParams.get("id") || "";
  const qs = id ? `?id=${encodeURIComponent(id)}` : "";
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/cart-builds${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ jobs: [] });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}

export async function POST(request) {
  const token = await bearer();
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/cart-builds`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Upstream unavailable." }, { status: 503 });
  }
}
