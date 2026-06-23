import { forward } from "../../../../lib/medusaProxy";

// PATCH  /api/scan-lines/:id → capture/correct a line (qty, lot, link product…)
// DELETE /api/scan-lines/:id → remove a mis-scan
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forward(`/medmkp/scan-lines/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  return forward(`/medmkp/scan-lines/${encodeURIComponent(id)}`, { method: "DELETE" });
}
