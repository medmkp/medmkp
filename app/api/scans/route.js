import { forward } from "../../../lib/medusaProxy";

// POST /api/scans → record one scan as lot-at-location evidence at the
// designated location (no scan session — it lands immediately). Returns
// { item, outcome } where outcome is added | merged | unmatched.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return forward("/medmkp/scans", { method: "POST", body });
}
