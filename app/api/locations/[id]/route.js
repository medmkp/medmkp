import { forward } from "../../../../lib/medusaProxy";

// GET    /api/locations/:id    → one location + its inventory items
// PATCH  /api/locations/:id    → update a location
// DELETE /api/locations/:id    → delete a location (?force=1 if it has items)
export async function GET(request, { params }) {
  const { id } = await params;
  return forward(`/medmkp/locations/${encodeURIComponent(id)}`);
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forward(`/medmkp/locations/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { search } = new URL(request.url);
  return forward(`/medmkp/locations/${encodeURIComponent(id)}${search}`, { method: "DELETE" });
}
