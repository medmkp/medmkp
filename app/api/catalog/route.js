import { NextResponse } from "next/server";
import { MEDUSA_URL } from "../../../lib/medusaAuth";

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
    return NextResponse.json({
      categories: body.categories || [],
      source: "medusa",
    });
  } catch (error) {
    return NextResponse.json({
      categories: [],
      source: "fallback",
      warning: "Medusa backend is not reachable.",
    });
  }
}
