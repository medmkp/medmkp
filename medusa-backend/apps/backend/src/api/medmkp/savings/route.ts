import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { GET as ADMIN_GET, POST } from "../../admin/medmkp/savings/route"
import { assertEntitled } from "../../../utils/practice"

// User-facing savings route. Same handler as the admin dashboard, but gated by the
// paid-tier entitlement check (dark by default) so it can be charged for later.
// Wrapping here keeps the shared /admin/medmkp/savings handler untouched.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!(await assertEntitled(req, res))) return
  return ADMIN_GET(req, res)
}

export { POST }
