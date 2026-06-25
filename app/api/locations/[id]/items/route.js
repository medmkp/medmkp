import { forward } from "../../../../../lib/medusaProxy";

// DELETE /api/locations/:id/items → permanently clear every inventory item
// captured at this location (the "Clear list" action on the location detail).
export async function DELETE(request, { params }) {
  const { id } = await params;
  return forward(`/medmkp/locations/${encodeURIComponent(id)}/items`, { method: "DELETE" });
}
