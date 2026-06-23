import { forward } from "../../../lib/medusaProxy";

// GET  /api/locations          → the practice's locations (with counts)
// POST /api/locations          → create a location
export async function GET() {
  return forward("/medmkp/locations");
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return forward("/medmkp/locations", { method: "POST", body });
}
