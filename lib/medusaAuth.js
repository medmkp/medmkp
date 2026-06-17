import { NextResponse } from "next/server";

export const MEDUSA_URL = process.env.MEDUSA_BACKEND_URL || "http://127.0.0.1:9000";
export const SESSION_COOKIE = "medmkp_session";

// Exchanges email/password for a Medusa customer JWT, or null if invalid.
export async function authenticate(email, password) {
  const response = await fetch(`${MEDUSA_URL}/auth/customer/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return data.token || null;
}

// Returns a JSON response that also sets the session cookie.
export function sessionResponse(token, payload = { ok: true }) {
  const response = NextResponse.json(payload);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return response;
}

// Decodes a JWT payload WITHOUT verifying the signature — used only to read the
// expiry for gating. Edge-safe (no Node-only APIs), so it can run in proxy.js.
export function decodeJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

// True when the token is missing, malformed, or its `exp` (seconds) has passed.
export function isTokenExpired(token) {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return Date.now() / 1000 >= payload.exp;
}

// Requests a password reset. Always resolves and never reveals whether the
// account exists. Uses the built-in emailpass reset route (no publishable key).
export async function requestPasswordReset(email) {
  try {
    await fetch(`${MEDUSA_URL}/auth/customer/emailpass/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email }),
    });
  } catch {
    /* swallow: do not leak account existence or service state */
  }
}

// Sets a new password using a reset token. Returns { ok, status }.
export async function updatePassword(token, email, password) {
  try {
    const response = await fetch(`${MEDUSA_URL}/auth/customer/emailpass/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email, password }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 503 };
  }
}
