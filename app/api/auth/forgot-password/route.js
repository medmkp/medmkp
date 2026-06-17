import { NextResponse } from "next/server";
import { requestPasswordReset } from "../../../../lib/medusaAuth";

export async function POST(request) {
  const { email } = await request.json().catch(() => ({}));
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (normalized) {
    await requestPasswordReset(normalized);
  }

  // Always succeed regardless of whether an account exists (no existence leak).
  return NextResponse.json({ ok: true });
}
