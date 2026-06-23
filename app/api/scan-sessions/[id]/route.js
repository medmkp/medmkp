import { forward } from "../../../../lib/medusaProxy";

// GET    /api/scan-sessions/:id → session header + counts + lines
// PATCH  /api/scan-sessions/:id → rename / complete / abandon / reopen
// DELETE /api/scan-sessions/:id → discard the session (keeps promoted inventory)
export async function GET(request, { params }) {
  const { id } = await params;
  return forward(`/medmkp/scan-sessions/${encodeURIComponent(id)}`);
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forward(`/medmkp/scan-sessions/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  return forward(`/medmkp/scan-sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}
