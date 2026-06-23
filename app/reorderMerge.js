// The ONE reconciliation rule for the cross-device reorder list, used in exactly
// two places: here (when the client applies state polled/loaded from the server)
// and on the server PUT. This MUST stay equivalent to the server merge in
// medusa-backend/apps/backend/src/api/medmkp/reorder-list/merge.ts — same key,
// same survivor rule, same tombstone GC — so the two sides can never disagree.
// Kept in a plain-JS module (no JSX) so it can be unit-tested directly.

const REORDER_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Identity on lifecycle-stable fields only. `product` is excluded: matching an
// unmatched scan fills it in, which would change the key mid-life and split one
// item into two.
const reorderItemKey = (item) => (item && (item.barcode || item.extractedFrom || item.sku || item.id)) || "";
const reorderItemTs = (item) => Number(item && item.updatedAt) || 0;

// Higher updatedAt wins; on a TIE a tombstone (included:false) wins, so a
// deletion is sticky and an equal/legacy-zero-ts active copy can't resurrect it.
// Symmetric in its inputs -> the merge is order-independent (commutative).
function reorderPickSurvivor(a, b) {
  const ta = reorderItemTs(a);
  const tb = reorderItemTs(b);
  if (ta !== tb) return ta > tb ? a : b;
  const aRemoved = a.included === false;
  const bRemoved = b.included === false;
  if (aRemoved !== bRemoved) return aRemoved ? a : b;
  return b;
}

export function mergeDraftItems(existing = [], incoming = [], now = Date.now()) {
  const byKey = new Map();
  for (const item of [...existing, ...incoming]) {
    const key = reorderItemKey(item);
    const current = byKey.get(key);
    byKey.set(key, current ? reorderPickSurvivor(current, item) : item);
  }
  const cutoff = now - REORDER_TOMBSTONE_TTL_MS;
  return [...byKey.values()].filter(
    (item) => item.included !== false || reorderItemTs(item) === 0 || reorderItemTs(item) >= cutoff,
  );
}

function reorderUnionById(existing = [], incoming = []) {
  const byId = new Map();
  for (const x of existing || []) byId.set(x.id, x);
  for (const x of incoming || []) byId.set(x.id, x);
  return [...byId.values()];
}

// Merge two full app-state blobs into one. `base` supplies the scalars/working
// prefs (list name, buying prefs, stage); only the data collections are
// reconciled. Pass the SERVER state as `base` on the authoritative initial load;
// pass LOCAL as `base` on a live poll so a 3s tick can't reset an in-progress
// edit. The item merge is commutative, so which side is `base` only affects
// which scalars win, never which items survive.
export function mergeDraftState(base, incoming) {
  const b = base || {};
  const inc = incoming || {};
  return {
    ...b,
    draftItems: mergeDraftItems(b.draftItems || [], inc.draftItems || []),
    uploadedDocs: reorderUnionById(b.uploadedDocs, inc.uploadedDocs),
    archivedLists: reorderUnionById(b.archivedLists, inc.archivedLists),
    handoffs: reorderUnionById(b.handoffs, inc.handoffs),
    listTouched: Boolean(b.listTouched) || Boolean(inc.listTouched),
  };
}
