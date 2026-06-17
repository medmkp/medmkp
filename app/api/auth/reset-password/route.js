import { NextResponse } from "next/server";
import { updatePassword } from "../../../../lib/medusaAuth";

export async function POST(request) {
  const { token, email, password } = await request.json().catch(() => ({}));
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!token || !normalizedEmail || !password) {
    return NextResponse.json(
      { error: "Missing reset token, email, or password." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const result = await updatePassword(token, normalizedEmail, password);
  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  if (result.status === 401 || result.status === 400) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }
  return NextResponse.json(
    { error: "Could not reset your password. Please try again." },
    { status: 500 }
  );
}
