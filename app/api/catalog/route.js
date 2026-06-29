import { NextResponse } from "next/server";
import { MEDUSA_URL } from "../../../lib/medusaAuth";

// Public catalog summary; only changes on ingestion. Edge-cache with
// stale-while-revalidate so visitors never wait on the cold backend recompute
// (~31s for the priced/coverage aggregation) — it revalidates in the background.
const CATALOG_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=86400";

export async function GET(request) {
  const query = new URL(request.url).search || "";

  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/categories${query}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Medusa returned ${response.status}`);
    }

    const body = await response.json();
    return NextResponse.json(
      {
        categories: body.categories || [],
        source: "medusa",
      },
      { headers: { "Cache-Control": CATALOG_CACHE_CONTROL } }
    );
  } catch (error) {
    return NextResponse.json({
      categories: [],
      source: "fallback",
      warning: "Medusa backend is not reachable.",
    });
  }
}
