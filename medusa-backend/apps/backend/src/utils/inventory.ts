import type { MedusaResponse } from "@medusajs/framework/http"
import type MedMKPModuleService from "../modules/medmkp/service"
import { isMarketplaceSupplierId } from "../ingestion/marketplace/suppliers"

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

// A scan that resolved to no catalog product — filed as a placeholder so the
// evidence still lands at its location, and surfaced in Needs Attention until a
// human links the right product.
export function isUnidentified(item: any): boolean {
  return !item.canonical_product_id && !item.supplier_product_id
}

// Why an item needs attention (or null when it doesn't). Ordered by what to act
// on first: a pulled lot is settled; an unidentified scan blocks everything else
// (you can't trust its expiry until you know what it is); then expiry escalation;
// then the missing lot/expiry an audit requires. Par level no longer drives this:
// there is no live on-hand count to compare against — reorder timing is handled
// separately by the reorder ladder, not by treating inventory as a census.
export function attentionReason(
  item: any,
  now: Date = new Date()
): "unidentified" | "expired" | "expiring" | "missing_trace" | null {
  if (item.pulled_at) return null
  if (isUnidentified(item)) return "unidentified"
  const lifecycle = deriveLifecycle(item, now)
  if (lifecycle === "expired") return "expired"
  if (lifecycle === "expiring") return "expiring"
  if (!item.lot_number || !item.expiration_date) return "missing_trace"
  return null
}

export function needsAttention(item: any, now: Date = new Date()): boolean {
  return attentionReason(item, now) !== null
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
  const directSupplierProductIds = [...new Set(items.map((i) => i.supplier_product_id).filter(Boolean))] as string[]

  const matches = canonicalIds.length
    ? ((await medmkp.listCanonicalProductMatches({ canonical_product_id: canonicalIds })) as any[])
    : []
  const relevant = matches.filter((m) => m.match_status === "exact" || m.match_status === "variant")
  const supplierProductIds = [
    ...new Set([
      ...relevant.map((m) => m.supplier_product_id).filter(Boolean),
      ...directSupplierProductIds,
    ]),
  ]
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
      i.photo_url ||
      (i.canonical_product_id ? imageByCanonical.get(i.canonical_product_id) : "") ||
      (i.supplier_product_id ? imageBySupplierProduct.get(i.supplier_product_id) : "") ||
      null,
  }))
}

// Attach a cross-supplier price range to each inventory item. Mirrors
// attachInventoryImages: resolve canonical_product_id → its exact/variant
// supplier offers → the latest price snapshot of each, and report the
// [lowest, highest] pack price across them. This is the same comparison the
// catalog shows, joined onto each lot so the location table can price what's on
// the shelf. Marketplace listings (Amazon/Alibaba) are excluded, matching the
// search feed. Items with no match or no priced offer get price_range_cents:
// null (the UI renders "—" — never a fabricated price).
export async function attachInventoryPrices(
  medmkp: MedMKPModuleService,
  items: any[]
): Promise<any[]> {
  const canonicalIds = [...new Set(items.map((i) => i.canonical_product_id).filter(Boolean))] as string[]
  if (!canonicalIds.length) {
    return items.map((i) => ({ ...i, price_range_cents: null }))
  }

  const matches = (await medmkp.listCanonicalProductMatches({ canonical_product_id: canonicalIds })) as any[]
  const relevant = matches.filter((m) => m.match_status === "exact" || m.match_status === "variant")
  const supplierProductIds = [...new Set(relevant.map((m) => m.supplier_product_id).filter(Boolean))]
  const [supplierProducts, snapshots] = supplierProductIds.length
    ? await Promise.all([
        medmkp.listSupplierProducts({ id: supplierProductIds }),
        medmkp.listSupplierPriceSnapshots({ supplier_product_id: supplierProductIds }),
      ])
    : [[], []]

  const supplierIdByProduct = new Map((supplierProducts as any[]).map((sp) => [sp.id, sp.supplier_id]))
  // Latest snapshot per supplier product (price feeds are append-only).
  const latest = new Map<string, any>()
  for (const snap of snapshots as any[]) {
    const existing = latest.get(snap.supplier_product_id)
    if (!existing || new Date(snap.captured_at).getTime() > new Date(existing.captured_at).getTime()) {
      latest.set(snap.supplier_product_id, snap)
    }
  }

  // Gather the latest pack price of every non-marketplace matched offer, keyed by
  // canonical product, then reduce each list to a [lowest, highest] range.
  const pricesByCanonical = new Map<string, number[]>()
  for (const m of relevant) {
    if (isMarketplaceSupplierId(supplierIdByProduct.get(m.supplier_product_id))) continue
    const snap = latest.get(m.supplier_product_id)
    if (!snap || typeof snap.price_cents !== "number") continue
    const list = pricesByCanonical.get(m.canonical_product_id) ?? []
    list.push(snap.price_cents)
    pricesByCanonical.set(m.canonical_product_id, list)
  }

  const rangeByCanonical = new Map<string, { lowest: number; highest: number }>()
  for (const [canonicalId, prices] of pricesByCanonical) {
    rangeByCanonical.set(canonicalId, { lowest: Math.min(...prices), highest: Math.max(...prices) })
  }

  return items.map((i) => ({
    ...i,
    price_range_cents: (i.canonical_product_id && rangeByCanonical.get(i.canonical_product_id)) || null,
  }))
}

// Same (item, lot) identity at the lot-at-location grain: lot must match, then
// the product identity the scan carries (canonical preferred, else supplier). An
// UNIDENTIFIED scan (no product) instead matches another unidentified record
// sharing its raw barcode, so re-scanning an unknown code refreshes the
// placeholder rather than stacking duplicates. A different lot of the same
// product never matches — distinct lots coexist (FEFO / traceability).
export function scanMatchesItem(scan: any, item: any): boolean {
  if ((item.lot_number ?? null) !== (scan.lot_number ?? null)) return false
  if (scan.canonical_product_id) return item.canonical_product_id === scan.canonical_product_id
  if (scan.supplier_product_id) return item.supplier_product_id === scan.supplier_product_id
  if (scan.barcode) {
    return isUnidentified(item) && (item.barcode ?? null) === scan.barcode
  }
  return false
}

export type ScanOutcome = "added" | "merged" | "unmatched"

// Upsert the lot-at-location evidence record for one scan — the single write path
// the scanner uses. The grain is one record per (item, lot, location):
// re-scanning the same lot refreshes the existing active record (no duplicate); a
// different lot of the same product coexists (FEFO). A pulled lot stays as
// history — a fresh scan starts a new active record rather than reviving it.
//
// EVERY scan lands at its location: an identified scan as matched evidence, an
// unidentified scan (no catalog match) as a placeholder row deduped by barcode
// that surfaces in Needs Attention until a product is linked. On merge, fields
// coalesce (incoming ?? existing) so a later scan can fill in a lot or expiry the
// first read missed but never wipes one the record already had.
export async function upsertScanEvidence(
  medmkp: MedMKPModuleService,
  scan: {
    canonical_product_id?: string | null
    supplier_product_id?: string | null
    barcode?: string | null
    name?: string | null
    quantity?: number | null
    shelf_area?: string | null
    lot_number?: string | null
    expiration_date?: Date | string | null
    package_condition?: string | null
    received_date?: Date | string | null
  },
  locationId: string,
  actor: string | null,
  captureType: string | null = null
): Promise<{ item: any; outcome: ScanOutcome }> {
  const identified = Boolean(scan.canonical_product_id || scan.supplier_product_id)
  const atLocation = (await medmkp.listInventoryItems({ location_id: locationId })) as any[]
  const match = atLocation.find((it) => !it.pulled_at && scanMatchesItem(scan, it))

  const fields: Record<string, any> = {
    canonical_product_id: scan.canonical_product_id ?? null,
    supplier_product_id: scan.supplier_product_id ?? null,
    barcode: scan.barcode ?? null,
    name: scan.name || scan.barcode || "Unidentified item",
    // Quantity is an estimate, not a maintained count (is_estimated).
    quantity_on_hand: scan.quantity ?? 1,
    is_estimated: true,
    shelf_area: scan.shelf_area ?? null,
    lot_number: scan.lot_number ?? null,
    expiration_date: scan.expiration_date ?? null,
    package_condition: scan.package_condition ?? null,
    capture_type: captureType,
    received_date: scan.received_date ?? null,
    last_counted_at: new Date(),
    counted_by: actor,
  }

  if (match) {
    // Coalesce: a later scan fills in a lot/expiry/identity the first read missed
    // but never wipes one the record already had with a bare re-scan.
    const merged: Record<string, any> = {
      id: match.id,
      canonical_product_id: fields.canonical_product_id ?? match.canonical_product_id,
      supplier_product_id: fields.supplier_product_id ?? match.supplier_product_id,
      barcode: fields.barcode ?? match.barcode,
      name: scan.name || match.name,
      quantity_on_hand: scan.quantity ?? match.quantity_on_hand,
      is_estimated: true,
      shelf_area: fields.shelf_area ?? match.shelf_area,
      lot_number: fields.lot_number ?? match.lot_number,
      expiration_date: fields.expiration_date ?? match.expiration_date,
      package_condition: fields.package_condition ?? match.package_condition,
      capture_type: captureType ?? match.capture_type,
      received_date: fields.received_date ?? match.received_date,
      last_counted_at: fields.last_counted_at,
      counted_by: actor,
    }
    const saved = await medmkp.updateInventoryItems(merged)
    return { item: saved, outcome: identified ? "merged" : "unmatched" }
  }

  const created = await medmkp.createInventoryItems({ location_id: locationId, ...fields })
  return { item: created, outcome: identified ? "added" : "unmatched" }
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
