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
export const CAPTURE_TYPES = ["receiving", "shelf_audit"] as const
export const PULL_REASONS = ["expiry", "recall", "manual"] as const
export const LIFECYCLE_STATUSES = ["active", "expiring", "expired", "pulled"] as const

// Days before expiration at which an item is flagged "expiring soon".
const EXPIRING_SOON_DAYS = 30

// The lot's current state, DERIVED from its expiry + pulled flag (never stored,
// so it can't go stale): a human-confirmed pull wins; otherwise the date drives
// expired → expiring → active. Expiry only escalates a lot toward "pull now"; it
// never removes it. A record leaves the active set only via pulled_at.
export function deriveLifecycle(
  item: any,
  now: Date = new Date()
): (typeof LIFECYCLE_STATUSES)[number] {
  if (item.pulled_at) return "pulled"
  if (item.expiration_date) {
    const exp = new Date(item.expiration_date)
    if (exp <= now) return "expired"
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000)
    if (exp <= soon) return "expiring"
  }
  return "active"
}

// An item needs attention when it's expiring or already expired (and not yet
// pulled), or when it's missing the traceability an audit requires (lot +
// expiration). Par level no longer drives this: there is no live on-hand count
// to compare against — reorder timing is handled separately by the reorder
// ladder, not by treating inventory as a census.
export function needsAttention(item: any, now: Date = new Date()): boolean {
  if (item.pulled_at) return false
  const lifecycle = deriveLifecycle(item, now)
  if (lifecycle === "expired" || lifecycle === "expiring") return true
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

// Attach a product image_url to each inventory item. The item itself carries no
// image (photo_url is a Phase-3 upload, normally null), so the picture comes from
// the matched catalog product: resolve canonical_product_id → its exact/variant
// supplier offers → the first one with an image. A captured photo_url, when
// present, still wins. Returns the items with an `image_url` field added.
export async function attachInventoryImages(
  medmkp: MedMKPModuleService,
  items: any[]
): Promise<any[]> {
  const canonicalIds = [...new Set(items.map((i) => i.canonical_product_id).filter(Boolean))] as string[]
  if (!canonicalIds.length) {
    return items.map((i) => ({ ...i, image_url: i.photo_url ?? null }))
  }

  const matches = (await medmkp.listCanonicalProductMatches({ canonical_product_id: canonicalIds })) as any[]
  const relevant = matches.filter((m) => m.match_status === "exact" || m.match_status === "variant")
  const supplierProductIds = [...new Set(relevant.map((m) => m.supplier_product_id).filter(Boolean))]
  const supplierProducts = supplierProductIds.length
    ? ((await medmkp.listSupplierProducts({ id: supplierProductIds })) as any[])
    : []
  const imageBySupplierProduct = new Map(supplierProducts.map((sp) => [sp.id, sp.image_url || ""]))

  // First non-empty image per canonical product wins (mirrors the search feed).
  const imageByCanonical = new Map<string, string>()
  for (const m of relevant) {
    if (imageByCanonical.has(m.canonical_product_id)) continue
    const img = imageBySupplierProduct.get(m.supplier_product_id)
    if (img) imageByCanonical.set(m.canonical_product_id, img)
  }

  return items.map((i) => ({
    ...i,
    image_url:
      i.photo_url || (i.canonical_product_id ? imageByCanonical.get(i.canonical_product_id) : "") || null,
  }))
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
