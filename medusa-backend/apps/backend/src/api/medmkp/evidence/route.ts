import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { assertEntitled, requirePractice } from "../../../utils/practice"
import { buildEvidenceListFilter, buildEvidenceWrite } from "../../../utils/evidence"

// GET /medmkp/evidence — the practice's evidence documents, newest first.
// Optional exact-match filters: document_type, status, inventory_item_id,
// canonical_product_id, supplier_id, supplier_product_id, location_id.
//
// Evidence is a paid Practice feature (the "Unlock Practice" paywall promises an
// audit-ready record of every lot scanned), so it's gated by the same
// entitlement check as Savings — a 402 under BILLING_ENFORCE for an unentitled
// practice, which the UI turns into the paywall. Dark by default (flag off ⇒
// always allowed), so prod is unaffected until billing goes live.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!(await assertEntitled(req, res))) return
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  const built = buildEvidenceListFilter(practiceId, req.query as Record<string, any>)
  if ("error" in built) {
    res.status(422).json({ error: built.error })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const evidence = await medmkp.listEvidenceDocuments(built.filter, {
    order: { created_at: "DESC" },
  })
  res.json({ evidence })
}

// POST /medmkp/evidence — create a metadata-only evidence record (file bytes
// land separately via object storage). document_type is required; status
// defaults to "captured".
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  const body = (req.body ?? {}) as Record<string, any>
  const built = buildEvidenceWrite(body, { isCreate: true })
  if ("error" in built) {
    res.status(422).json({ error: built.error })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const actor = req.auth_context?.actor_id ?? null
  const created = await medmkp.createEvidenceDocuments({
    ...built.fields,
    practice_id: practiceId,
    created_by: actor,
    updated_by: actor,
  })

  res.status(201).json({ evidence: created })
}
