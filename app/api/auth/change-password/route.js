import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MEDUSA_URL, SESSION_COOKIE, isTokenExpired } from "../../../../lib/medusaAuth";

// Changes the signed-in buyer's password. Proxies to the backend
// /medmkp/change-password (authenticated by the session cookie as a Bearer
// token), which verifies the current password and sets the new one via the
// auth module — the built-in emailpass update route only accepts reset tokens.
export async function POST(request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const authenticated = Boolean(token) && !isTokenExpired(token);
  if (!authenticated) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json().catch(() => ({}));
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Enter your current and new password." }, { status: 400 });
  }

  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Could not reach the server." }, { status: 503 });
  }
}
