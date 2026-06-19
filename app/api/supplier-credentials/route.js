import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MEDUSA_URL, SESSION_COOKIE, isTokenExpired } from "../../../lib/medusaAuth";

// Proxies the signed-in practice's stored supplier logins. The raw password is
// never handled here — the buyer's password goes straight to the backend, which
// seals it; only masked hints come back.
async function bearer() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || isTokenExpired(token)) return null;
  return token;
}

async function forward(method, body) {
  const token = await bearer();
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/supplier-credentials`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Upstream unavailable." }, { status: 503 });
  }
}

export async function GET() {
  const token = await bearer();
  if (!token) return NextResponse.json({ credentials: [] });
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/supplier-credentials`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ credentials: [] });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ credentials: [] });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return forward("POST", body);
}

export async function DELETE(request) {
  const body = await request.json().catch(() => ({}));
  return forward("DELETE", body);
}
