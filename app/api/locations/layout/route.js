import { forward } from "../../../../lib/medusaProxy";

// PATCH /api/locations/layout → bulk-save Office Layout coordinates
export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  return forward("/medmkp/locations/layout", { method: "PATCH", body });
}
