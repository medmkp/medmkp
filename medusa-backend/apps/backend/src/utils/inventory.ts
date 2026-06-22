import type { MedusaResponse } from "@medusajs/framework/http"
import type MedMKPModuleService from "../modules/medmkp/service"

// Allowed location types (stored as text; validated here at the API layer).
export const LOCATION_TYPES = [
  "cabinet",
  "operatory",
  "sterilization",
  "lab",
  "storage",
  "emergency_kit",
  "other",
] as const

export const PACKAGE_CONDITIONS = ["good", "damaged", "missing"] as const

// Days before expiration at which an item is flagged "expiring soon".
const EXPIRING_SOON_DAYS = 30

// An inventory item needs attention when it's expired or expiring soon, at/below
// par, or missing the traceability fields an audit requires (lot + expiration).
export function needsAttention(item: any, now: Date = new Date()): boolean {
  if (item.expiration_date) {
    const exp = new Date(item.expiration_date)
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000)
    if (exp <= soon) return true
  }
  if (item.par_level != null && (item.quantity_on_hand ?? 0) <= item.par_level) return true
  if (!item.lot_number || !item.expiration_date) return true
  return false
}

// Opaque token printed on a location's QR / cabinet label.
export function mintQrCode(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  return `TDDS-${rand}${time}`
}

// Load a location by id, enforcing it belongs to the caller's practice. Writes a
// 404 and returns null when missing or not owned, so the route can early-return.
export async function loadOwnedLocation(
  medmkp: MedMKPModuleService,
  id: string,
  practiceId: string,
  res: MedusaResponse
): Promise<any | null> {
  const loc = await medmkp.retrieveLocation(id).catch(() => null)
  if (!loc || loc.practice_id !== practiceId) {
    res.status(404).json({ error: "Location not found." })
    return null
  }
  return loc
}

// Same, for an inventory item (ownership is via its location's practice).
export async function loadOwnedItem(
  medmkp: MedMKPModuleService,
  id: string,
  practiceId: string,
  res: MedusaResponse
): Promise<{ item: any; location: any } | null> {
  const item = await medmkp.retrieveInventoryItem(id).catch(() => null)
  if (item) {
    const location = await medmkp.retrieveLocation(item.location_id).catch(() => null)
    if (location && location.practice_id === practiceId) return { item, location }
  }
  res.status(404).json({ error: "Inventory item not found." })
  return null
}
