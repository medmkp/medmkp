// Pure data helpers for the Office Layout editor. Kept out of the component so the
// position math (what the grid renders, what the bulk-save route receives, what
// "unsaved changes / reset" compares) is testable in isolation.
//
// Every count here derives from real location fields (layout_x/y, item_count,
// needs_attention_count) — no fabricated scan-status states.

// layout_x/layout_y are Postgres `numeric` columns, which the pg driver returns
// as strings ("0", "1", …). The grid matches tiles to cells with strict ===
// against integer indices, so a string coord never matches and the tile vanishes
// even though isPlaced (a `!= null` check) still counts it. Coerce to a real
// number once on the way in so the whole editor works in numbers.
export function coordOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeLocations(items) {
  return items.map((location) => ({
    ...location,
    layout_x: coordOrNull(location.layout_x),
    layout_y: coordOrNull(location.layout_y),
  }));
}

export function positionOf(location) {
  return {
    id: location.id,
    layout_x: location.layout_x ?? null,
    layout_y: location.layout_y ?? null,
  };
}

export function samePosition(a, b) {
  return (a?.layout_x ?? null) === (b?.layout_x ?? null)
    && (a?.layout_y ?? null) === (b?.layout_y ?? null);
}

// A location is on the grid only when it has both coordinates.
export function isPlaced(location) {
  return location.layout_x != null && location.layout_y != null;
}

// Positions that differ from the last saved snapshot — the payload for the
// PATCH /locations/layout bulk save, and what drives the dirty/reset state.
export function changedPositions(items, savedItems) {
  const savedById = new Map(savedItems.map((location) => [location.id, positionOf(location)]));
  return items
    .map(positionOf)
    .filter((position) => !samePosition(position, savedById.get(position.id)));
}

// Split locations into the ones sitting on the grid and the ones still waiting
// in the unplaced tray (missing either coordinate).
export function splitLocations(items) {
  const placed = [];
  const unplaced = [];
  for (const location of items) {
    (isPlaced(location) ? placed : unplaced).push(location);
  }
  return { placed, unplaced };
}

// Honest office summary for the "at a glance" bar: counts only, all derived from
// real location data.
export function summarizeLayout(items) {
  let placed = 0;
  let itemCount = 0;
  let needsAttention = 0;
  for (const location of items) {
    if (isPlaced(location)) placed += 1;
    itemCount += location.item_count || 0;
    if ((location.needs_attention_count || 0) > 0) needsAttention += 1;
  }
  return {
    total: items.length,
    placed,
    unplaced: items.length - placed,
    itemCount,
    needsAttention,
  };
}
