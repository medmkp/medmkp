import { NextResponse } from "next/server";
import { MEDUSA_URL } from "../../../../lib/medusaAuth";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const code = searchParams.get("code") || "";
  const barcode = searchParams.get("barcode") || "";
  const limit = searchParams.get("limit") || "8";

  if (!q.trim() && !code.trim() && !barcode.trim()) {
    return NextResponse.json({ canonical_products: [], source: "medusa", kind: "none" });
  }

  const params = new URLSearchParams({ limit });
  if (barcode.trim()) params.set("barcode", barcode.trim());
  else if (code.trim()) params.set("code", code.trim());
  else params.set("q", q.trim());

  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/products/search?${params}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Medusa returned ${response.status}`);
    const body = await response.json();
    return NextResponse.json({
      canonical_products: body.products || [],
      kind: body.kind || "none",
      source: "medusa",
      // Lot / expiry / production date the backend decoded off the package
      // (GS1 / HIBC). Present only on barcode scans that carry traceability.
      ...(body.scanned ? { scanned: body.scanned } : {}),
      ...(body.identified ? { identified: body.identified } : {}),
    });
  } catch {
    return NextResponse.json({
      canonical_products: [],
      kind: "none",
      source: "fallback",
      warning: "Medusa backend is not reachable.",
    });
  }
}
