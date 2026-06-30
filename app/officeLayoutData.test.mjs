import assert from "node:assert/strict";
import test from "node:test";
import {
  positionOf,
  samePosition,
  isPlaced,
  changedPositions,
  coordOrNull,
  normalizeLocations,
  splitLocations,
  summarizeLayout,
} from "./officeLayoutData.js";

const loc = (id, layout_x, layout_y, extra = {}) => ({
  id,
  name: id,
  type: "operatory",
  qr_code: id,
  layout_x,
  layout_y,
  notes: null,
  ...extra,
});

test("positionOf serializes only id + coords, normalizing missing coords to null", () => {
  assert.deepEqual(positionOf(loc("a", 2, 4)), { id: "a", layout_x: 2, layout_y: 4 });
  assert.deepEqual(positionOf({ id: "b" }), { id: "b", layout_x: null, layout_y: null });
});

test("samePosition treats undefined and null coords as equal", () => {
  assert.ok(samePosition({ layout_x: 1, layout_y: 2 }, { layout_x: 1, layout_y: 2 }));
  assert.ok(samePosition({ layout_x: null }, {}));
  assert.ok(!samePosition({ layout_x: 1, layout_y: 2 }, { layout_x: 1, layout_y: 3 }));
});

test("isPlaced requires both coordinates", () => {
  assert.ok(isPlaced(loc("a", 0, 0)));
  assert.ok(!isPlaced(loc("b", 0, null)));
  assert.ok(!isPlaced(loc("c", null, 0)));
  assert.ok(!isPlaced(loc("d", null, null)));
});

test("changedPositions returns only the locations whose coords moved since save", () => {
  const saved = [loc("a", 0, 0), loc("b", 1, 0), loc("c", null, null)];
  // a unchanged, b moved, c placed from the tray.
  const draft = [loc("a", 0, 0), loc("b", 2, 0), loc("c", 3, 1)];
  assert.deepEqual(changedPositions(draft, saved), [
    { id: "b", layout_x: 2, layout_y: 0 },
    { id: "c", layout_x: 3, layout_y: 1 },
  ]);
});

test("changedPositions detects a move back into the tray (coords cleared)", () => {
  const saved = [loc("a", 2, 2)];
  const draft = [loc("a", null, null)];
  assert.deepEqual(changedPositions(draft, saved), [{ id: "a", layout_x: null, layout_y: null }]);
});

test("changedPositions is empty when nothing moved (reset/no-op save)", () => {
  const items = [loc("a", 0, 0), loc("b", null, null)];
  assert.deepEqual(changedPositions(items, items), []);
});

test("splitLocations separates placed grid tiles from the unplaced tray", () => {
  const items = [loc("a", 0, 0), loc("b", null, null), loc("c", 1, 2), loc("d", null, 0)];
  const { placed, unplaced } = splitLocations(items);
  assert.deepEqual(placed.map((l) => l.id), ["a", "c"]);
  assert.deepEqual(unplaced.map((l) => l.id), ["b", "d"]);
});

test("summarizeLayout reports honest counts derived from real fields", () => {
  const items = [
    loc("a", 0, 0, { item_count: 18, needs_attention_count: 1 }),
    loc("b", 1, 0, { item_count: 21, needs_attention_count: 0 }),
    loc("c", null, null, { item_count: 14, needs_attention_count: 0 }),
    loc("d", 2, 0, { item_count: 12, needs_attention_count: 2 }),
  ];
  assert.deepEqual(summarizeLayout(items), {
    total: 4,
    placed: 3,
    unplaced: 1,
    itemCount: 65,
    needsAttention: 2,
  });
});

test("coordOrNull coerces string numeric coords and rejects junk", () => {
  assert.strictEqual(coordOrNull("0"), 0);
  assert.strictEqual(coordOrNull("2"), 2);
  assert.strictEqual(coordOrNull(2), 2);
  assert.strictEqual(coordOrNull(null), null);
  assert.strictEqual(coordOrNull(undefined), null);
  assert.strictEqual(coordOrNull(""), null);
  assert.strictEqual(coordOrNull("nope"), null);
});

// Regression: layout_x/layout_y arrive from the `numeric` columns as strings.
// Before normalizing, the grid's strict `layout_x === x` never matched, so every
// tile vanished even though the "On the map" count (a `!= null` check) showed
// them as placed. After normalizing, a placed tile's coords are real numbers that
// match the integer cell indices.
test("normalizeLocations coerces string coords so tiles match grid cells", () => {
  const normalized = normalizeLocations([
    loc("a", "2", "0"),
    loc("b", null, null),
    loc("c", "", "1"), // one coord missing -> stays unplaced
  ]);
  assert.strictEqual(normalized[0].layout_x, 2);
  assert.strictEqual(normalized[0].layout_y, 0);
  assert.strictEqual(normalized[2].layout_x, null);

  const { placed, unplaced } = splitLocations(normalized);
  assert.deepEqual(placed.map((l) => l.id), ["a"]);
  assert.deepEqual(unplaced.map((l) => l.id), ["b", "c"]);
  // The exact lookup the grid does for each cell now resolves the tile.
  assert.ok(placed.find((l) => l.layout_x === 2 && l.layout_y === 0));
});

test("summarizeLayout tolerates missing count fields", () => {
  const items = [loc("a", 0, 0), loc("b", null, null)];
  assert.deepEqual(summarizeLayout(items), {
    total: 2,
    placed: 1,
    unplaced: 1,
    itemCount: 0,
    needsAttention: 0,
  });
});
