// Non-destructive merge for the per-practice reorder-list blob.
//
// The list is edited from multiple devices (desk + phone). Storing it as a
// whole-document, last-write-wins blob means a stale tab can clobber items
// another device just added (scans vanish), and a client-side "union" that
// re-adds anything the server lacks resurrects items that were intentionally
// cleared. Both are the same root flaw: the sync had no way to express a
// deletion, so "absent here" was indistinguishable from "deleted there".
//
// This merge fixes that. It is commutative: an item is removed ONLY by an
// explicit tombstone (included:false) with a fresher updatedAt — never by being
// absent from one device's blob. Devices therefore converge regardless of write
// order, and no single blind PUT can wipe another device's work.

export type Item = Record<string, any>

// Stable identity for a row — mirrors the web client's keyOf so the same product
// lands in the same merge bucket on both client and server.
export const itemKey = (item: Item): string =>
  (item && (item.product || item.extractedFrom || item.sku || item.id)) || ""

const itemTs = (item: Item): number => Number(item?.updatedAt) || 0

// Tombstones (removed items kept as included:false) are retained so a deletion
// survives the merge, then GC'd after this window so the blob can't grow without
// bound.
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function mergeDraftItems(
  existing: Item[] = [],
  incoming: Item[] = [],
  now: number = Date.now(),
): Item[] {
  const byKey = new Map<string, Item>()
  for (const item of existing) byKey.set(itemKey(item), item)
  for (const item of incoming) {
    const key = itemKey(item)
    const current = byKey.get(key)
    // Newest write wins per item; a tombstone with a fresher updatedAt beats a
    // stale included:true copy, so removals/clears propagate across devices.
    if (!current || itemTs(item) >= itemTs(current)) byKey.set(key, item)
  }
  const cutoff = now - TOMBSTONE_TTL_MS
  // Drop expired tombstones; keep active items and any legacy row (updatedAt 0).
  return [...byKey.values()].filter(
    (item) => item.included !== false || itemTs(item) === 0 || itemTs(item) >= cutoff,
  )
}

// Additive union by id — never lose docs/saved-lists/handoffs because one device
// was stale. Incoming wins on id collision so edits still flow through.
export function unionById<T extends { id?: unknown }>(existing: T[] = [], incoming: T[] = []): T[] {
  const byId = new Map<unknown, T>()
  for (const x of existing) byId.set(x.id, x)
  for (const x of incoming) byId.set(x.id, x)
  return [...byId.values()]
}

const asArray = (value: unknown): Item[] => (Array.isArray(value) ? (value as Item[]) : [])

export function mergeReorderState(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  now: number = Date.now(),
): Record<string, unknown> {
  // Scalars/prefs (listName, buyingPrefs, listStage, …) keep last-write-wins;
  // only the collections that carry user data get the non-destructive merge.
  return {
    ...existing,
    ...incoming,
    draftItems: mergeDraftItems(asArray(existing.draftItems), asArray(incoming.draftItems), now),
    uploadedDocs: unionById(asArray(existing.uploadedDocs), asArray(incoming.uploadedDocs)),
    archivedLists: unionById(asArray(existing.archivedLists), asArray(incoming.archivedLists)),
    handoffs: unionById(asArray(existing.handoffs), asArray(incoming.handoffs)),
  }
}
