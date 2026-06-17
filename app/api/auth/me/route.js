import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isTokenExpired } from "../../../../lib/medusaAuth";

export async function GET() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return NextResponse.json({ authenticated: Boolean(token) && !isTokenExpired(token) });
}
