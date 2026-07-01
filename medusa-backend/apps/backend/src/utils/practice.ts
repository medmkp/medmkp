import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"

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

// Auth + practice-scope guard shared by the locations/inventory routes. Writes
// the 401/404 response itself and returns null so the caller can early-return.
export async function requirePractice(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<string | null> {
  if (!req.auth_context?.actor_id) {
    res.status(401).json({ error: "Not authenticated." })
    return null
  }
  const practiceId = await resolvePracticeId(req)
  if (!practiceId) {
    res.status(404).json({ error: "No practice linked to this account." })
    return null
  }
  return practiceId
}

// Whether a practice is entitled to the paid ("Practice" tier) features. Reads
// the practice's subscription via the medmkp module service (no new pg.Pool) and
// treats only an "active" status as entitled — no row / trialing / past_due /
// canceled all mean not entitled. Errors propagate so the caller can fail closed.
export async function entitlement(
  req: AuthenticatedMedusaRequest,
  practiceId: string
): Promise<boolean> {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [sub] = await medmkp.listPracticeSubscriptions(
    { practice_id: practiceId },
    { order: { created_at: "DESC" }, take: 1 }
  )
  return sub?.status === "active"
}

// Gate for the paid invoice-match / savings routes. Returns true to let the
// request proceed; writes a 402 and returns false when the caller's practice is
// not entitled. Only enforces when BILLING_ENFORCE is set (dark launch) — with the
// flag off it always allows, so authed-but-unentitled practices are unaffected. A
// transient subscription-read error fails closed (deny) and is logged.
export async function assertEntitled(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<boolean> {
  if (process.env.BILLING_ENFORCE !== "true") return true

  let entitled = false
  try {
    const practiceId = await resolvePracticeId(req)
    entitled = practiceId ? await entitlement(req, practiceId) : false
  } catch (err) {
    console.error("[billing] entitlement check failed; denying", err)
    res.status(402).json({ error: "Subscription required." })
    return false
  }

  if (!entitled) {
    res.status(402).json({ error: "Subscription required." })
    return false
  }
  return true
}
