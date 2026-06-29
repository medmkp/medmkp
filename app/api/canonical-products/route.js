import { NextResponse } from "next/server";
import { MEDUSA_URL } from "../../../lib/medusaAuth";

// Public catalog data that only changes on ingestion. Let the Vercel edge serve
// it (stale-while-revalidate), so no visitor ever waits on the cold backend
// recompute (~15s for a large category) — revalidation happens in the background.
const CATALOG_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=86400";

export async function GET(request) {
  const url = new URL(request.url);
  const query = url.search || "";

  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/canonical-products${query}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Medusa returned ${response.status}`);
    }

    const body = await response.json();
    return NextResponse.json(
      {
        ...body,
        source: "medusa",
      },
      { headers: { "Cache-Control": CATALOG_CACHE_CONTROL } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        count: 0,
        canonical_products: [],
        source: "fallback",
        warning: "Medusa backend is not reachable.",
      },
      { status: 503 }
    );
  }
}
