import { NextResponse } from "next/server";
import { MEDUSA_URL } from "../../../lib/medusaAuth";

export async function GET() {
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/suppliers`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Medusa returned ${response.status}`);
    const body = await response.json();
    return NextResponse.json(
      { suppliers: body.suppliers || [], source: "medusa" },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } }
    );
  } catch {
    return NextResponse.json({ suppliers: [], source: "fallback" });
  }
}
