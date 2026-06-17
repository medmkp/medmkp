import { NextResponse } from "next/server";
import { SESSION_COOKIE, isTokenExpired } from "./lib/medusaAuth";

// Auth pages an already-authenticated user should be bounced away from.
const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password"];

// Server-side route gate (Next.js "proxy", formerly "middleware"). Checks for a
// present, unexpired session cookie. It does NOT verify the JWT signature (the
// web app doesn't hold the secret) — the API routes calling Medusa are the real
// boundary. This adds defense-in-depth on top of the client-side guard so the
// authenticated app shell is never served to a signed-out visitor.
export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authed = Boolean(token) && !isTokenExpired(token);

  // Protect the authenticated app.
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    if (!authed) {
      const url = request.nextUrl.clone();
      url.search = "";
      url.pathname = "/login";
      url.searchParams.set("next", pathname + search);
      const response = NextResponse.redirect(url);
      if (token) response.cookies.delete(SESSION_COOKIE); // clear an expired cookie
      return response;
    }
    return NextResponse.next();
  }

  // Keep signed-in users out of the auth pages.
  if (authed && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.search = "";
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup", "/forgot-password", "/reset-password"],
};
