import type { MedusaResponse } from "@medusajs/framework/http"
import type MedMKPModuleService from "../modules/medmkp/service"
import { PACKAGE_CONDITIONS } from "./inventory"

export const SESSION_STATUSES = ["active", "completed", "abandoned"] as const
export const LINE_STATUSES = ["confirmed", "needs_details", "needs_review"] as const

// The review bucket a scanned line falls into. A line we couldn't identify needs
// review (the buyer links a product); an identified line missing the lot/expiry
// an audit wants needs details; an identified line with both is confirmed. This
// is the single source of truth for "exact matches auto-add" — an exact match
// with traceability lands straight in `confirmed`.
export function deriveLineStatus(line: {
  canonical_product_id?: string | null
  supplier_product_id?: string | null
  lot_number?: string | null
  expiration_date?: Date | string | null
}): (typeof LINE_STATUSES)[number] {
  const identified = Boolean(line.canonical_product_id || line.supplier_product_id)
  if (!identified) return "needs_review"
  if (!line.lot_number || !line.expiration_date) return "needs_details"
  return "confirmed"
}

// Roll the per-bucket counts a session header shows from its lines.
export function sessionCounts(lines: any[]) {
  const counts = { scanned: lines.length, confirmed: 0, needs_details: 0, needs_review: 0 }
  for (const line of lines) {
    if (line.status === "confirmed") counts.confirmed++
    else if (line.status === "needs_details") counts.needs_details++
    else counts.needs_review++
  }
  return counts
}

export function isPackageCondition(value: unknown): boolean {
  return value == null || (PACKAGE_CONDITIONS as readonly string[]).includes(value as string)
}

// Session header shape the UI consumes: the row plus its derived counts and the
// location's identity (name/type) so the Scan Sessions list and resume entry
// points don't each have to re-fetch the location.
export function serializeSession(session: any, lines: any[], location?: any | null) {
  return {
    ...session,
    counts: sessionCounts(lines),
    location_name: location?.name ?? null,
    location_type: location?.type ?? null,
  }
}

// Load a session, enforcing it belongs to the caller's practice. Writes a 404
// and returns null when missing or not owned, so the route can early-return.
export async function loadOwnedSession(
  medmkp: MedMKPModuleService,
  id: string,
  practiceId: string,
  res: MedusaResponse
): Promise<any | null> {
  const session = await medmkp.retrieveScanSession(id).catch(() => null)
  if (!session || session.practice_id !== practiceId) {
    res.status(404).json({ error: "Scan session not found." })
    return null
  }
  return session
}

// Same, for a scan line (ownership is via its session's practice).
export async function loadOwnedLine(
  medmkp: MedMKPModuleService,
  id: string,
  practiceId: string,
  res: MedusaResponse
): Promise<{ line: any; session: any } | null> {
  const line = await medmkp.retrieveScanSessionLine(id).catch(() => null)
  if (line) {
    const session = await medmkp.retrieveScanSession(line.session_id).catch(() => null)
    if (session && session.practice_id === practiceId) return { line, session }
  }
  res.status(404).json({ error: "Scan line not found." })
  return null
}

// Same (item, lot) identity: lot must match, then canonical product if the line
// carries one, else supplier product. Canonical is the primary "item" identity.
function lineMatchesItem(line: any, item: any): boolean {
  if ((item.lot_number ?? null) !== (line.lot_number ?? null)) return false
  if (line.canonical_product_id) return item.canonical_product_id === line.canonical_product_id
  if (line.supplier_product_id) return item.supplier_product_id === line.supplier_product_id
  return false
}

// Upsert the lot-at-location evidence record for an identified line. The grain is
// one record per (item, lot, location): re-scanning the same lot refreshes the
// existing record (no duplicate), while a different lot of the same product
// creates a coexisting record (FEFO). Many scan lines can therefore point at one
// shared record. A pulled lot stays as history — a fresh scan starts a new
// active record rather than reviving it. Unidentified lines (needs review) never
// touch inventory; orphan cleanup is reference-counted by the caller (see
// cleanupOrphanInventory), so removing one line never deletes a lot another line
// still vouches for — absence is not deletion.
export async function syncInventoryFromLine(
  medmkp: MedMKPModuleService,
  line: any,
  locationId: string | null,
  actor: string | null,
  captureType: string | null = null
): Promise<string | null> {
  const identified = Boolean(line.canonical_product_id || line.supplier_product_id)
  if (!identified) return null
  // No place to file the evidence yet — a receiving line whose destination
  // hasn't been picked. Promotion happens once a location is set (the sheet save).
  if (!locationId) return null

  const fields = {
    canonical_product_id: line.canonical_product_id ?? null,
    supplier_product_id: line.supplier_product_id ?? null,
    name: line.name,
    // Quantity is an estimate, not a maintained count (is_estimated).
    quantity_on_hand: line.quantity ?? 1,
    is_estimated: true,
    shelf_area: line.shelf_area ?? null,
    lot_number: line.lot_number ?? null,
    expiration_date: line.expiration_date ?? null,
    package_condition: line.package_condition ?? null,
    capture_type: captureType,
    last_counted_at: new Date(),
    counted_by: actor,
  }

  const atLocation = (await medmkp.listInventoryItems({ location_id: locationId })) as any[]
  const match = atLocation.find((it) => !it.pulled_at && lineMatchesItem(line, it))
  if (match) {
    await medmkp.updateInventoryItems({ id: match.id, ...fields })
    return match.id
  }

  const created = await medmkp.createInventoryItems({ location_id: locationId, ...fields })
  return created.id
}

// Delete an inventory record only if no scan line still references it — reference
// counting so a shared lot-at-location record survives the removal of one of the
// scans that created it. Soft-deleted lines are already excluded by the list
// query. No-op when the id is null or still referenced.
export async function cleanupOrphanInventory(
  medmkp: MedMKPModuleService,
  inventoryItemId: string | null | undefined
): Promise<void> {
  if (!inventoryItemId) return
  const refs = (await medmkp.listScanSessionLines({ inventory_item_id: inventoryItemId })) as any[]
  if (refs.length === 0) {
    await medmkp.deleteInventoryItems(inventoryItemId).catch(() => {})
  }
}
