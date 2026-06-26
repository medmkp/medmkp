import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { requirePractice } from "../../../utils/practice"
import {
  loadOwnedLocation,
  upsertScanEvidence,
  needsAttention,
  deriveLifecycle,
  attentionReason,
  PACKAGE_CONDITIONS,
  CAPTURE_TYPES,
} from "../../../utils/inventory"

// POST /medmkp/scans — record one scanned item directly as lot-at-location
// evidence at the location designated during scanning. There is no scan session:
// the evidence lands immediately. The client sends the resolved catalog identity
// (from the scan lookup) plus the lot/expiry the decoder read off the package.
// EVERY scan lands — an identified scan as matched evidence, an unidentified scan
// as a placeholder that surfaces in Needs Attention until a product is linked.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  const body = (req.body ?? {}) as Record<string, any>
  const locationId = typeof body.location_id === "string" ? body.location_id.trim() : ""
  if (!locationId) {
    res.status(422).json({ error: "location_id is required." })
    return
  }
  const location = await loadOwnedLocation(medmkp, locationId, practiceId, res)
  if (!location) return

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null
  const barcode = typeof body.barcode === "string" ? body.barcode.trim() : ""
  if (!name && !barcode && !body.canonical_product_id && !body.supplier_product_id) {
    res.status(422).json({ error: "A scan needs at least a name, a barcode, or a product." })
    return
  }
  if (body.package_condition != null && !PACKAGE_CONDITIONS.includes(body.package_condition)) {
    res.status(422).json({ error: "Invalid package condition." })
    return
  }
  const captureType = (CAPTURE_TYPES as readonly string[]).includes(body.capture_type)
    ? body.capture_type
    : "shelf_audit"

  const { item, outcome } = await upsertScanEvidence(
    medmkp,
    {
      canonical_product_id: body.canonical_product_id ?? null,
      supplier_product_id: body.supplier_product_id ?? null,
      barcode: barcode || null,
      name: name || barcode || null,
      quantity: Number.isFinite(body.quantity) && body.quantity > 0 ? body.quantity : 1,
      shelf_area: body.shelf_area ?? null,
      lot_number: body.lot_number ?? null,
      expiration_date: body.expiration_date ?? null,
      package_condition: body.package_condition ?? null,
      received_date: body.received_date ?? null,
    },
    location.id,
    req.auth_context?.actor_id ?? null,
    captureType
  )

  const now = new Date()
  res.status(201).json({
    item: {
      ...item,
      needs_attention: needsAttention(item, now),
      attention_reason: attentionReason(item, now),
      lifecycle: deriveLifecycle(item, now),
    },
    outcome,
  })
}
