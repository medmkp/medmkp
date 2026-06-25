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
  lineMatchesLine,
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

  const fields = {
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
  }

  // A shelf audit verifies what's present on one shelf, so re-scanning the same
  // (item, lot) is the same evidence — refresh the existing line instead of
  // stacking a duplicate review row (the same way inventory refreshes the lot,
  // not a second record). Receiving logs an arriving delivery, where repeating an
  // item is real, so it keeps one line per scan. On merge we coalesce — a later
  // scan can fill in an identity or expiry the first read missed, but never wipes
  // one the line already had.
  let created
  if (session.capture_type === "shelf_audit") {
    const existing = (await medmkp.listScanSessionLines({ session_id: session.id })) as any[]
    const dup = existing.find((l) => lineMatchesLine(l, fields))
    if (dup) {
      const merged = {
        barcode: fields.barcode ?? dup.barcode,
        canonical_product_id: fields.canonical_product_id ?? dup.canonical_product_id,
        supplier_product_id: fields.supplier_product_id ?? dup.supplier_product_id,
        name: fields.name ?? dup.name,
        image_url: fields.image_url ?? dup.image_url,
        quantity: fields.quantity,
        shelf_area: fields.shelf_area ?? dup.shelf_area,
        lot_number: fields.lot_number ?? dup.lot_number,
        expiration_date: fields.expiration_date ?? dup.expiration_date,
        production_date: fields.production_date ?? dup.production_date,
        package_condition: fields.package_condition ?? dup.package_condition,
        scanned_by: actor,
      }
      created = await medmkp.updateScanSessionLines({
        id: dup.id,
        ...merged,
        status: deriveLineStatus(merged),
      })
    }
  }
  if (!created) {
    created = await medmkp.createScanSessionLines({ session_id: session.id, ...fields })
  }

  const inventoryItemId = await syncInventoryFromLine(
    medmkp,
    created,
    session.location_id,
    actor,
    session.capture_type ?? null
  )
  const line = inventoryItemId
    ? await medmkp.updateScanSessionLines({ id: created.id, inventory_item_id: inventoryItemId })
    : created

  const lines = await medmkp.listScanSessionLines({ session_id: session.id })
  res.status(201).json({ line, counts: sessionCounts(lines as any[]) })
}
