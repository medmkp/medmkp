"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";

// Mock locations for the standalone demo. The real page passes its own
// `locations` from the parent; this is only the default so the component
// renders something meaningful on its own.
const MOCK_LOCATIONS = [
  { id: "loc_hyg", name: "Hygiene Cabinet", type: "cabinet", qr_code: "TDDS-LOC-HYG01", layout_x: 1, layout_y: 0, notes: null, item_count: 37, needs_attention_count: 4 },
  { id: "loc_op1", name: "Operatory 1", type: "operatory", qr_code: "TDDS-LOC-OP1", layout_x: 0, layout_y: 1, notes: null, item_count: 18, needs_attention_count: 1 },
  { id: "loc_op2", name: "Operatory 2", type: "operatory", qr_code: "TDDS-LOC-OP2", layout_x: 1, layout_y: 1, notes: null, item_count: 21, needs_attention_count: 0 },
  { id: "loc_steri", name: "Sterilization", type: "sterilization", qr_code: "TDDS-LOC-STERI", layout_x: 2, layout_y: 1, notes: null, item_count: 12, needs_attention_count: 2 },
  { id: "loc_lab", name: "Lab", type: "lab", qr_code: "TDDS-LOC-LAB", layout_x: 2, layout_y: 0, notes: null, item_count: 9, needs_attention_count: 0 },
  { id: "loc_storage", name: "Storage", type: "storage", qr_code: "TDDS-LOC-STORE", layout_x: null, layout_y: null, notes: null, item_count: 64, needs_attention_count: 3 },
  { id: "loc_kit", name: "Emergency Kit", type: "emergency_kit", qr_code: "TDDS-LOC-KIT", layout_x: 0, layout_y: 0, notes: null, item_count: 8, needs_attention_count: 1 },
];

// Grid is 4 columns wide; rows grow as tiles are dropped lower down.
const GRID_COLUMNS = 4;
const MIN_GRID_ROWS = 3;

// Per-type icon + tint, reusing the shared icon sprite and stat-tint classes.
const TYPE_META = {
  operatory: { icon: "icon-grid", tint: "blue", label: "Operatory" },
  cabinet: { icon: "icon-archive-down", tint: "indigo", label: "Cabinet" },
  sterilization: { icon: "icon-shield-check", tint: "teal", label: "Sterilization" },
  lab: { icon: "icon-bolt", tint: "violet", label: "Lab" },
  storage: { icon: "icon-package", tint: "slate", label: "Storage" },
  emergency_kit: { icon: "icon-alert-triangle", tint: "rose", label: "Emergency kit" },
  other: { icon: "icon-map-pin", tint: "sky", label: "Location" },
};

function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.other;
}

// A single placeable location tile. Draggable everywhere (grid + tray); clicking
// it reports a selection. The status dot is amber when the location needs
// attention, green otherwise.
function LocationTile({ location, selected, onSelect, onDragStart, onDragEnd }) {
  const meta = typeMeta(location.type);
  const needsAttention = (location.needs_attention_count || 0) > 0;
  return (
    <button
      type="button"
      className={`ol-tile ${selected ? "selected" : ""}`}
      draggable
      onClick={() => onSelect?.(location.id)}
      onDragStart={(event) => onDragStart(event, location.id)}
      onDragEnd={onDragEnd}
      aria-pressed={selected}
    >
      <span className={`ol-tile-icon tint-${meta.tint}`}>
        <Icon name={meta.icon} className="nav-icon" />
      </span>
      <span className="ol-tile-body">
        <strong className="ol-tile-name">{location.name}</strong>
        <small className="ol-tile-meta">{meta.label}{location.item_count != null ? ` · ${location.item_count} items` : ""}</small>
      </span>
      <span
        className={`ol-tile-dot ${needsAttention ? "attention" : "ok"}`}
        title={needsAttention ? `${location.needs_attention_count} need attention` : "All clear"}
        aria-label={needsAttention ? `${location.needs_attention_count} items need attention` : "No items need attention"}
      />
    </button>
  );
}

// Drag-and-drop floor-plan editor. Tiles with grid coords sit on the snap grid;
// tiles with null coords wait in the "unplaced" tray and can be dragged onto the
// grid. Positions are managed in local state for the demo and reported up via
// the optional callbacks (onMoveLocation / onSelectLocation / onAddLocation).
export function OfficeLayoutView({ locations = MOCK_LOCATIONS, onMoveLocation, onSelectLocation, onAddLocation }) {
  const [items, setItems] = useState(locations);
  const [selectedId, setSelectedId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // `${x},${y}` | "tray" | null

  useEffect(() => {
    setItems(locations);
  }, [locations]);

  const placed = useMemo(() => items.filter((l) => l.layout_x != null && l.layout_y != null), [items]);
  const unplaced = useMemo(() => items.filter((l) => l.layout_x == null || l.layout_y == null), [items]);

  // How many rows to render: enough for the lowest placed tile, plus a spare row
  // so there's always somewhere to drop below the last tile.
  const rows = useMemo(() => {
    const maxY = placed.reduce((max, l) => Math.max(max, l.layout_y), -1);
    return Math.max(MIN_GRID_ROWS, maxY + 2);
  }, [placed]);

  const tileAt = (x, y) => placed.find((l) => l.layout_x === x && l.layout_y === y);

  function selectLocation(id) {
    setSelectedId(id);
    onSelectLocation?.(id);
  }

  function handleDragStart(event, id) {
    setDraggingId(id);
    event.dataTransfer.effectAllowed = "move";
    // Some browsers require data to be set for a drag to start.
    try { event.dataTransfer.setData("text/plain", id); } catch { /* noop */ }
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  // Drop onto a grid cell: snap the dragged tile to (x, y). If the cell is taken,
  // ignore the drop so we never stack two locations on one cell.
  function dropOnCell(x, y) {
    if (!draggingId) return;
    const occupant = tileAt(x, y);
    if (occupant && occupant.id !== draggingId) return;
    setItems((prev) => prev.map((l) => (l.id === draggingId ? { ...l, layout_x: x, layout_y: y } : l)));
    onMoveLocation?.(draggingId, x, y);
    handleDragEnd();
  }

  // Drop back into the tray: clear the tile's coords so it returns to unplaced.
  function dropOnTray() {
    if (!draggingId) return;
    setItems((prev) => prev.map((l) => (l.id === draggingId ? { ...l, layout_x: null, layout_y: null } : l)));
    onMoveLocation?.(draggingId, null, null);
    handleDragEnd();
  }

  const cells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < GRID_COLUMNS; x += 1) {
      cells.push({ x, y });
    }
  }

  return (
    <div className="ol">
      <div className="ol-head">
        <div>
          <h1 className="ol-title">Office layout</h1>
          <p className="ol-lede">Arrange your locations to match the floor plan. Drag a tile to snap it to a spot; click one to see its details.</p>
        </div>
        <button type="button" className="primary-action compact ol-add" onClick={() => onAddLocation?.()}>
          <Icon name="icon-plus" className="button-icon" />
          Add location
        </button>
      </div>

      <div className="ol-board">
        <div
          className="ol-grid"
          style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` }}
          role="group"
          aria-label="Floor-plan grid"
        >
          {cells.map(({ x, y }) => {
            const tile = tileAt(x, y);
            const key = `${x},${y}`;
            const isTarget = dropTarget === key;
            const occupiedByOther = tile && tile.id !== draggingId;
            return (
              <div
                key={key}
                className={`ol-cell ${isTarget && !occupiedByOther ? "drop-target" : ""} ${draggingId && occupiedByOther ? "occupied" : ""}`}
                onDragOver={(event) => {
                  if (!draggingId || occupiedByOther) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(key);
                }}
                onDragLeave={() => setDropTarget((current) => (current === key ? null : current))}
                onDrop={(event) => { event.preventDefault(); dropOnCell(x, y); }}
              >
                {tile ? (
                  <LocationTile
                    location={tile}
                    selected={selectedId === tile.id}
                    onSelect={selectLocation}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ) : (
                  <span className="ol-cell-empty" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>

        <aside
          className={`ol-tray ${dropTarget === "tray" ? "drop-target" : ""}`}
          onDragOver={(event) => {
            if (!draggingId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTarget("tray");
          }}
          onDragLeave={() => setDropTarget((current) => (current === "tray" ? null : current))}
          onDrop={(event) => { event.preventDefault(); dropOnTray(); }}
        >
          <header className="ol-tray-head">
            <strong>Unplaced</strong>
            <small>{unplaced.length} location{unplaced.length === 1 ? "" : "s"}</small>
          </header>
          {unplaced.length ? (
            <div className="ol-tray-list">
              {unplaced.map((location) => (
                <LocationTile
                  key={location.id}
                  location={location}
                  selected={selectedId === location.id}
                  onSelect={selectLocation}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          ) : (
            <p className="ol-tray-empty">Every location is on the grid. Drag a tile here to take it off the floor plan.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
