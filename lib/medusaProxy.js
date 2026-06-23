import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MEDUSA_URL, SESSION_COOKIE, isTokenExpired } from "./medusaAuth";

// Reads the session JWT from the httpOnly cookie. The web app never holds the
// raw token client-side, so the proxy layer is the only place it gets forwarded
// to Medusa as a Bearer credential.
export async function bearer() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || isTokenExpired(token)) return null;
  return token;
}

// Forward an authed request to a Medusa `/medmkp/...` path and relay its JSON +
// status back to the browser. Shared by the locations and scan-session proxies
// so each route file stays a one-liner. `path` includes any query string.
export async function forward(path, { method = "GET", body } = {}) {
  const token = await bearer();
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const init = {
      method,
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${MEDUSA_URL}${path}`, init);
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable." }, { status: 503 });
  }
}
