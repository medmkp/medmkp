import { forward } from "../../../../../lib/medusaProxy";

// POST /api/scan-sessions/:id/lines → record one scanned item on the session
export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forward(`/medmkp/scan-sessions/${encodeURIComponent(id)}/lines`, { method: "POST", body });
}
