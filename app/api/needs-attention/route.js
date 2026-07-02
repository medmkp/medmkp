import { forward } from "../../../lib/medusaProxy";

// GET /api/needs-attention → the practice-wide worklist (stats, snapshot, issues,
// recent) rolled from every location's inventory evidence.
export async function GET() {
  return forward("/medmkp/needs-attention");
}
