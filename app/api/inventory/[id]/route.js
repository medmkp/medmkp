import { forward } from "../../../../lib/medusaProxy";

// PATCH /api/inventory/:id → capture or correct an evidence record (lot/expiry/
// qty in the post-scan drawer, or link a product to an unidentified scan).
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forward(`/medmkp/inventory/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

// DELETE /api/inventory/:id → remove a lot-at-location evidence record (a
// mis-scan or wrong item). The append-only model has no bulk delete, but a
// single mistaken record can be removed from the location's items table.
export async function DELETE(request, { params }) {
  const { id } = await params;
  return forward(`/medmkp/inventory/${encodeURIComponent(id)}`, { method: "DELETE" });
}
