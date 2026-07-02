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

// Stable identity for a row — mirrors the web client's keyOf so the same item
// lands in the same merge bucket on both client and server. Keys ONLY on fields
// that never change over an item's lifecycle: `barcode` (the natural identity of
// a scanned item) and `extractedFrom` (the original source text) are immutable;
// `product` is deliberately excluded because matching an unmatched item fills it
// in, which would change the key mid-life and split one item into two on merge.
export const itemKey = (item: Item): string =>
  (item && (item.barcode || item.extractedFrom || item.sku || item.id)) || ""

const itemTs = (item: Item): number => Number(item?.updatedAt) || 0

// Tombstones (removed items kept as included:false) are retained so a deletion
// survives the merge, then GC'd after this window so the blob can't grow without
// bound.
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

// Hard cap on retained tombstones, independent of age. The whole list blob is
// PUT at once, so unbounded tombstones (every clear adds a batch) bloat it until
// the server rejects the save as "request entity too large". Keeping the most
// recent N is far more than enough for a deletion to reach every device.
export const MAX_TOMBSTONES = 100

// Choose the surviving copy of one item seen on both sides. Higher updatedAt
// wins (newest write). On a TIE, a tombstone (`included:false`) beats an active
// copy, so a deletion is "sticky": a stale device re-sending the pre-delete copy
// with an equal — or absent/legacy-zero — timestamp can never resurrect it. A
// genuine re-add still wins because it carries a strictly newer updatedAt.
// Symmetric in its inputs, so the merge is order-independent (commutative).
const pickSurvivor = (a: Item, b: Item): Item => {
  const ta = itemTs(a)
  const tb = itemTs(b)
  if (ta !== tb) return ta > tb ? a : b
  const aRemoved = a.included === false
  const bRemoved = b.included === false
  if (aRemoved !== bRemoved) return aRemoved ? a : b
  return b
}

export function mergeDraftItems(
  existing: Item[] = [],
  incoming: Item[] = [],
  now: number = Date.now(),
): Item[] {
  const byKey = new Map<string, Item>()
  for (const item of [...existing, ...incoming]) {
    const key = itemKey(item)
    const current = byKey.get(key)
    byKey.set(key, current ? pickSurvivor(current, item) : item)
  }
  const cutoff = now - TOMBSTONE_TTL_MS
  const merged = [...byKey.values()]
  const active = merged.filter((item) => item.included !== false)
  // Keep tombstones that are still within the TTL (or legacy, ts 0), but never
  // more than MAX_TOMBSTONES — newest first — so the blob can't grow unbounded.
  const tombstones = merged
    .filter((item) => item.included === false && (itemTs(item) === 0 || itemTs(item) >= cutoff))
    .sort((a, b) => itemTs(b) - itemTs(a))
    .slice(0, MAX_TOMBSTONES)
  return [...active, ...tombstones]
}

// Additive union by id — never lose docs/handoffs because one device was
// stale. Incoming wins on id collision so edits still flow through.
export function unionById<T extends { id?: unknown }>(existing: T[] = [], incoming: T[] = []): T[] {
  const byId = new Map<unknown, T>()
  for (const x of existing) byId.set(x.id, x)
  for (const x of incoming) byId.set(x.id, x)
  return [...byId.values()]
}

// Saved lists get the same tombstone treatment as items, keyed by id: a plain
// union can never delete (a removed entry resurrects from the other side) and
// blindly lets a stale copy clobber a rename. Deleting/reopening writes
// `deleted:true` + updatedAt; the fresher copy of an id wins, a tie prefers the
// tombstone. MUST stay equivalent to mergeArchivedLists in the web client's
// app/reorderMerge.js.
export const MAX_LIST_TOMBSTONES = 50

const archivedListTs = (list: Item): number => Number(list?.updatedAt) || 0

const pickArchivedSurvivor = (a: Item, b: Item): Item => {
  const ta = archivedListTs(a)
  const tb = archivedListTs(b)
  if (ta !== tb) return ta > tb ? a : b
  const aDeleted = a.deleted === true
  const bDeleted = b.deleted === true
  if (aDeleted !== bDeleted) return aDeleted ? a : b
  return b
}

export function mergeArchivedLists(
  existing: Item[] = [],
  incoming: Item[] = [],
  now: number = Date.now(),
): Item[] {
  const byId = new Map<unknown, Item>()
  for (const list of [...existing, ...incoming]) {
    if (!list || list.id == null) continue
    const current = byId.get(list.id)
    byId.set(list.id, current ? pickArchivedSurvivor(current, list) : list)
  }
  const cutoff = now - TOMBSTONE_TTL_MS
  const merged = [...byId.values()]
  const kept = merged.filter((list) => list.deleted !== true)
  const tombstones = merged
    .filter((list) => list.deleted === true && (archivedListTs(list) === 0 || archivedListTs(list) >= cutoff))
    .sort((a, b) => archivedListTs(b) - archivedListTs(a))
    .slice(0, MAX_LIST_TOMBSTONES)
    // A tombstone only needs identity + recency; drop the snapshot payload
    // (rows/sourceItems/sourceDocs) so deleted lists stop weighing the blob.
    .map((list) => ({ id: list.id, deleted: true, updatedAt: archivedListTs(list) }))
  return [...kept, ...tombstones]
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
    archivedLists: mergeArchivedLists(asArray(existing.archivedLists), asArray(incoming.archivedLists), now),
    handoffs: unionById(asArray(existing.handoffs), asArray(incoming.handoffs)),
  }
}
