import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../../modules/medmkp/service"
import { requirePractice } from "../../../../../utils/practice"
import {
  loadOwnedSession,
  deriveLineStatus,
  sessionCounts,
  syncInventoryFromLine,
  isPackageCondition,
} from "../../../../../utils/scan-sessions"

// POST /medmkp/scan-sessions/:id/lines — record one scanned item. The client
// sends the resolved catalog identity (from the scan lookup) plus the lot/expiry
// the decoder read off the package. We derive the review bucket, persist the
// line, and — when identified — promote it to a durable inventory item at the
// location ("exact matches auto-add"). Unidentified scans land in needs_review
// and touch no inventory until the buyer links a product.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const session = await loadOwnedSession(medmkp, req.params.id, practiceId, res)
  if (!session) return
  if (session.status !== "active") {
    res.status(409).json({ error: "Scan session is not active. Reopen it to add items." })
    return
  }

  const body = (req.body ?? {}) as Record<string, any>
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null
  const barcode = typeof body.barcode === "string" ? body.barcode.trim() : ""
  if (!name && !barcode) {
    res.status(422).json({ error: "A scanned line needs at least a name or a barcode." })
    return
  }
  if (!isPackageCondition(body.package_condition)) {
    res.status(422).json({ error: "Invalid package condition." })
    return
  }

  const draft = {
    canonical_product_id: body.canonical_product_id ?? null,
    supplier_product_id: body.supplier_product_id ?? null,
    lot_number: body.lot_number ?? null,
    expiration_date: body.expiration_date ?? null,
  }
  const actor = req.auth_context?.actor_id ?? null

  const created = await medmkp.createScanSessionLines({
    session_id: session.id,
    barcode: barcode || null,
    canonical_product_id: draft.canonical_product_id,
    supplier_product_id: draft.supplier_product_id,
    name: name || barcode,
    image_url: body.image_url ?? null,
    quantity: Number.isFinite(body.quantity) && body.quantity > 0 ? body.quantity : 1,
    shelf_area: body.shelf_area ?? null,
    lot_number: draft.lot_number,
    expiration_date: draft.expiration_date,
    production_date: body.production_date ?? null,
    package_condition: body.package_condition ?? null,
    status: deriveLineStatus(draft),
    scanned_by: actor,
  })

  const inventoryItemId = await syncInventoryFromLine(medmkp, created, session.location_id, actor)
  const line = inventoryItemId
    ? await medmkp.updateScanSessionLines({ id: created.id, inventory_item_id: inventoryItemId })
    : created

  const lines = await medmkp.listScanSessionLines({ session_id: session.id })
  res.status(201).json({ line, counts: sessionCounts(lines as any[]) })
}
