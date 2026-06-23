import { forward } from "../../../lib/medusaProxy";

// GET  /api/scan-sessions[?location_id=&status=] → sessions with review counts
// POST /api/scan-sessions                        → start/resume a session
export async function GET(request) {
  const { search } = new URL(request.url);
  return forward(`/medmkp/scan-sessions${search}`);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return forward("/medmkp/scan-sessions", { method: "POST", body });
}
