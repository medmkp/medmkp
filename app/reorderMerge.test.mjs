import assert from "node:assert/strict";
import test from "node:test";
import { mergeArchivedLists, mergeDraftItems, mergeDraftState, reorderItemKey } from "./reorderMerge.js";

// updatedAt is a real epoch (Date.now()) in production, so anchor fixtures near
// "now" — tiny timestamps would look decades old and get GC'd as expired.
const T = Date.now();

const savedList = (over = {}) => ({
  id: over.id ?? "list_1",
  name: over.name ?? "June Restock",
  items: 3,
  suppliers: 2,
  total: "$100.00",
  rows: [{ id: "r1" }],
  sourceItems: [{ id: "li_1", barcode: "b1" }],
  sourceDocs: [{ id: "doc_1" }],
  updatedAt: T,
  ...over,
});

const tombstone = (id, updatedAt) => ({ id, deleted: true, updatedAt });

const visibleIds = (lists) => lists.filter((l) => l.deleted !== true).map((l) => l.id).sort();

// ---------------------------------------------------------------------------
// Saved-list (archivedLists) merge — deletions must stick, renames must win.
// ---------------------------------------------------------------------------

test("deleting a saved list survives the merge against a stale active copy", () => {
  // Device A deleted the list (fresh tombstone); device B still holds the old copy.
  const deleted = [tombstone("list_1", T + 1000)];
  const stale = [savedList({ updatedAt: T })];
  assert.deepEqual(visibleIds(mergeArchivedLists(deleted, stale, T + 2000)), []);
  // Commutative: same outcome regardless of which side is "existing".
  assert.deepEqual(visibleIds(mergeArchivedLists(stale, deleted, T + 2000)), []);
});

test("absence is not deletion — a device that never saw a list cannot wipe it", () => {
  const server = [savedList()];
  const staleDevice = [];
  assert.deepEqual(visibleIds(mergeArchivedLists(server, staleDevice, T)), ["list_1"]);
});

test("a delete tombstone beats a legacy copy that has no updatedAt", () => {
  const legacy = [savedList({ updatedAt: undefined })];
  const deleted = [tombstone("list_1", T)];
  assert.deepEqual(visibleIds(mergeArchivedLists(legacy, deleted, T)), []);
});

test("the fresher rename wins in both merge directions", () => {
  const renamed = [savedList({ name: "June Restock — final", updatedAt: T + 500 })];
  const stale = [savedList({ name: "June Restock", updatedAt: T })];
  assert.equal(mergeArchivedLists(stale, renamed, T + 1000)[0].name, "June Restock — final");
  assert.equal(mergeArchivedLists(renamed, stale, T + 1000)[0].name, "June Restock — final");
});

test("a genuine re-save with a newer timestamp beats an older tombstone", () => {
  const deleted = [tombstone("list_1", T)];
  const resaved = [savedList({ updatedAt: T + 1000 })];
  assert.deepEqual(visibleIds(mergeArchivedLists(deleted, resaved, T + 2000)), ["list_1"]);
});

test("tombstones are slimmed to id + deleted + updatedAt", () => {
  // Even if a client sends a fat tombstone, the merge strips the snapshot.
  const fat = [{ ...savedList(), deleted: true, updatedAt: T }];
  const [slim] = mergeArchivedLists(fat, [], T);
  assert.deepEqual(slim, { id: "list_1", deleted: true, updatedAt: T });
});

test("expired tombstones are GC'd; live entries and fresh tombstones are kept", () => {
  const ttl = 30 * 24 * 60 * 60 * 1000;
  const lists = [
    savedList({ id: "keep" }),
    tombstone("fresh", T - 1000),
    tombstone("expired", T - ttl - 1000),
  ];
  const merged = mergeArchivedLists(lists, [], T);
  assert.deepEqual(merged.map((l) => l.id).sort(), ["fresh", "keep"]);
});

test("tombstone count is capped at 50, newest first", () => {
  const many = Array.from({ length: 80 }, (_, i) => tombstone(`list_${i}`, T - i));
  const merged = mergeArchivedLists(many, [], T);
  assert.equal(merged.length, 50);
  // Newest tombstone survives; the oldest are the ones dropped.
  assert.ok(merged.some((l) => l.id === "list_0"));
  assert.ok(!merged.some((l) => l.id === "list_79"));
});

test("full delete cycle: PUT-merge then poll-merge never resurrects the list", () => {
  // Server holds the list; the client deletes it and PUTs its blob.
  const server = { archivedLists: [savedList()] };
  const clientAfterDelete = { archivedLists: [tombstone("list_1", T + 1000)] };
  const serverAfterPut = mergeDraftState(server, clientAfterDelete, T + 1100);
  assert.deepEqual(visibleIds(serverAfterPut.archivedLists), []);
  // The 3s poll then merges the server state back into the client.
  const clientAfterPoll = mergeDraftState(clientAfterDelete, serverAfterPut, T + 1200);
  assert.deepEqual(visibleIds(clientAfterPoll.archivedLists), []);
  // And a second, stale device converges to deleted too.
  const staleDevice = { archivedLists: [savedList()] };
  const stalePoll = mergeDraftState(staleDevice, serverAfterPut, T + 1300);
  assert.deepEqual(visibleIds(stalePoll.archivedLists), []);
});

// ---------------------------------------------------------------------------
// Reopen/duplicate item handling — outgoing items must be tombstoned, not
// dropped, or the server's active copies leak back into the restored list.
// ---------------------------------------------------------------------------

test("tombstoned outgoing items don't resurrect into a restored list", () => {
  // Server still has the discarded current list (active copies).
  const server = [
    { id: "li_a", barcode: "old-1", included: true, updatedAt: T },
    { id: "li_b", barcode: "old-2", included: true, updatedAt: T },
  ];
  // The client restored a saved list: outgoing items tombstoned, restored fresh.
  const client = [
    { id: "li_a", barcode: "old-1", included: false, updatedAt: T + 1000 },
    { id: "li_b", barcode: "old-2", included: false, updatedAt: T + 1000 },
    { id: "li_new", barcode: "restored-1", included: true, updatedAt: T + 1000 },
  ];
  const merged = mergeDraftItems(client, server, T + 2000);
  const active = merged.filter((i) => i.included !== false).map((i) => i.barcode);
  assert.deepEqual(active, ["restored-1"]);
});

test("a restored item with a fresh timestamp beats the tombstone from an earlier clear", () => {
  const server = [{ id: "li_a", barcode: "b1", included: false, updatedAt: T }];
  const client = [{ id: "li_fresh", barcode: "b1", included: true, updatedAt: T + 1000 }];
  const merged = mergeDraftItems(client, server, T + 2000);
  const active = merged.filter((i) => i.included !== false);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "li_fresh");
});

test("reorderItemKey prefers lifecycle-stable fields over the row id", () => {
  assert.equal(reorderItemKey({ id: "x", barcode: "b" }), "b");
  assert.equal(reorderItemKey({ id: "x", extractedFrom: "line" }), "line");
  assert.equal(reorderItemKey({ id: "x", sku: "s" }), "s");
  assert.equal(reorderItemKey({ id: "x" }), "x");
});
