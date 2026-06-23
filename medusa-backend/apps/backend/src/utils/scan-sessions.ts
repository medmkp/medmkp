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

// Promote an identified line to a durable inventory item at the session's
// location (or update the one it already created). Unidentified lines (needs
// review) never touch inventory. Returns the inventory_item_id to link back onto
// the line. One line ↔ one inventory item: each scan is a discrete capture event
// (the receiving-log model), so we don't merge scans into shared on-hand rows.
export async function syncInventoryFromLine(
  medmkp: MedMKPModuleService,
  line: any,
  locationId: string,
  actor: string | null
): Promise<string | null> {
  const identified = Boolean(line.canonical_product_id || line.supplier_product_id)

  if (!identified) {
    // No longer (or never) identified: drop any inventory item this line made.
    if (line.inventory_item_id) {
      await medmkp.deleteInventoryItems(line.inventory_item_id).catch(() => {})
    }
    return null
  }

  const fields = {
    canonical_product_id: line.canonical_product_id ?? null,
    supplier_product_id: line.supplier_product_id ?? null,
    name: line.name,
    quantity_on_hand: line.quantity ?? 1,
    shelf_area: line.shelf_area ?? null,
    lot_number: line.lot_number ?? null,
    expiration_date: line.expiration_date ?? null,
    package_condition: line.package_condition ?? null,
    last_counted_at: new Date(),
    counted_by: actor,
  }

  if (line.inventory_item_id) {
    const existing = await medmkp.retrieveInventoryItem(line.inventory_item_id).catch(() => null)
    if (existing) {
      await medmkp.updateInventoryItems({ id: existing.id, ...fields })
      return existing.id
    }
  }

  const created = await medmkp.createInventoryItems({ location_id: locationId, ...fields })
  return created.id
}
