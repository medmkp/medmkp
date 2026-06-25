import { forward } from "../../../../lib/medusaProxy";

// DELETE /api/inventory/:id → remove a lot-at-location evidence record (a
// mis-scan or wrong item). The append-only model has no bulk delete, but a
// single mistaken record can be removed from the location's items table.
export async function DELETE(request, { params }) {
  const { id } = await params;
  return forward(`/medmkp/inventory/${encodeURIComponent(id)}`, { method: "DELETE" });
}
