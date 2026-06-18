import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// The customer<->practice link join table. We read it directly rather than via
// query.graph traversal: the practice model is registered on the service under
// the key "DentalPractice" while its model name is "medmkp_dental_practice", so
// the graph link-resolver looks for a listMedmkpDentalPractices() method that
// doesn't exist and throws. The join-table name is derived deterministically
// from the customer + medmkp module names.
const PRACTICE_LINK_TABLE = "customer_customer_medmkp_medmkp_dental_practice"

// Resolves the dental practice id for the authenticated customer. The
// authenticate middleware (see src/api/middlewares.ts) puts the customer id on
// auth_context. Returns null when unauthenticated or unlinked.
export async function resolvePracticeId(req: AuthenticatedMedusaRequest): Promise<string | null> {
  const customerId = req.auth_context?.actor_id
  if (!customerId) return null

  const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const [row] = await knex
    .select("medmkp_dental_practice_id")
    .from(PRACTICE_LINK_TABLE)
    .where({ customer_id: customerId })
    .whereNull("deleted_at")
    .limit(1)
  return row?.medmkp_dental_practice_id ?? null
}
