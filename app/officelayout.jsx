"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { traceApi, traceErrorMessage } from "./lib";
import { changedPositions, splitLocations, summarizeLayout } from "./officeLayoutData";

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

function formatLastScanned(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function MarkerDetail({ location, onOpenLocation, onStartScan }) {
  if (!location) {
    return (
      <section className="ol-detail empty" aria-label="Selected location">
        <span className="ol-detail-empty-icon"><Icon name="icon-map-pin" className="nav-icon" /></span>
        <h2>Select a marker</h2>
        <p>Choose a location on the grid or in the tray to open its actions.</p>
      </section>
    );
  }

  const meta = typeMeta(location.type);
  const itemCount = location.item_count || 0;
  const attentionCount = location.needs_attention_count || 0;
  const lastScanned = formatLastScanned(location.last_scanned_at);

  return (
    <section className="ol-detail" aria-label={`${location.name} details`}>
      <div className="ol-detail-head">
        <span className={`ol-detail-icon tint-${meta.tint}`}>
          <Icon name={meta.icon} className="nav-icon" />
        </span>
        <div>
          <h2>{location.name}</h2>
          <p>{meta.label}</p>
        </div>
      </div>

      <dl className="ol-detail-stats">
        <div>
          <dt>Items</dt>
          <dd>{itemCount}</dd>
        </div>
        <div>
          <dt>Needs attention</dt>
          <dd className={attentionCount ? "attention" : ""}>{attentionCount}</dd>
        </div>
        {lastScanned ? (
          <div className="wide">
            <dt>Last scanned</dt>
            <dd>{lastScanned}</dd>
          </div>
        ) : null}
      </dl>

      <div className="ol-detail-actions">
        <button type="button" className="primary-action compact" onClick={() => onOpenLocation?.(location.id)}>
          Open location
          <Icon name="icon-chevron-right" className="button-icon" />
        </button>
        <button type="button" className="secondary-action compact" onClick={() => onStartScan?.(location.id)}>
          <Icon name="icon-scan" className="button-icon" />
          Start scan
        </button>
      </div>
    </section>
  );
}

// Honest "at a glance" summary of the office. Every number is a real count from
// the loaded locations — no fabricated scan-status states (Active / In progress).
function GlanceBar({ summary }) {
  const stats = [
    { key: "total", icon: "icon-map-pin", value: summary.total, label: `Location${summary.total === 1 ? "" : "s"}` },
    { key: "placed", icon: "icon-grid", value: summary.placed, label: "On the map" },
    { key: "unplaced", icon: "icon-archive-down", value: summary.unplaced, label: "Unplaced" },
    { key: "items", icon: "icon-package", value: summary.itemCount, label: "Items" },
    { key: "attention", icon: "icon-alert-triangle", value: summary.needsAttention, label: "Need attention", attention: summary.needsAttention > 0 },
  ];
  return (
    <section className="ol-glance" aria-label="Your office at a glance">
      <h2 className="ol-glance-title">Your office at a glance</h2>
      <div className="ol-glance-stats">
        {stats.map((stat) => (
          <div key={stat.key} className={`ol-glance-stat ${stat.attention ? "attention" : ""}`}>
            <span className="ol-glance-icon">
              <Icon name={stat.icon} className="nav-icon" />
            </span>
            <span className="ol-glance-text">
              <span className="ol-glance-value">{stat.value}</span>
              <span className="ol-glance-label">{stat.label}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
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
export function OfficeLayoutView({
  locations = MOCK_LOCATIONS,
  loading = false,
  loadError = "",
  onMoveLocation,
  onSelectLocation,
  onAddLocation,
  onLayoutSaved,
  onOpenLocation,
  onStartScan,
}) {
  const [items, setItems] = useState(locations);
  const [savedItems, setSavedItems] = useState(locations);
  const [selectedId, setSelectedId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // `${x},${y}` | "tray" | null
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setItems(locations);
    setSavedItems(locations);
    setSelectedId(null);
    setDraggingId(null);
    setDropTarget(null);
    setSaveError("");
  }, [locations]);

  const changed = useMemo(() => changedPositions(items, savedItems), [items, savedItems]);

  const dirty = changed.length > 0;

  const { placed, unplaced } = useMemo(() => splitLocations(items), [items]);
  const summary = useMemo(() => summarizeLayout(items), [items]);
  const selectedLocation = useMemo(() => items.find((l) => l.id === selectedId) || null, [items, selectedId]);

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

  function updateDraftPosition(id, x, y) {
    setSaveError("");
    setItems((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      if ((l.layout_x ?? null) === x && (l.layout_y ?? null) === y) return l;
      return { ...l, layout_x: x, layout_y: y };
    }));
    onMoveLocation?.(id, x, y);
  }

  // Drop onto a grid cell: snap the dragged tile to (x, y). If the cell is taken,
  // ignore the drop so we never stack two locations on one cell.
  function dropOnCell(x, y) {
    if (!draggingId) return;
    const occupant = tileAt(x, y);
    if (occupant && occupant.id !== draggingId) return;
    updateDraftPosition(draggingId, x, y);
    handleDragEnd();
  }

  // Drop back into the tray: clear the tile's coords so it returns to unplaced.
  function dropOnTray() {
    if (!draggingId) return;
    updateDraftPosition(draggingId, null, null);
    handleDragEnd();
  }

  function resetLayout() {
    setItems(savedItems);
    setSaveError("");
    handleDragEnd();
  }

  async function saveLayout() {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await traceApi.saveLocationLayout(changed);
      setSavedItems(items);
      onLayoutSaved?.(items);
    } catch (err) {
      setSaveError(traceErrorMessage(err, "Couldn't save the layout. Your draft positions are still here."));
    } finally {
      setSaving(false);
    }
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
        <div className="ol-actions" aria-label="Office layout actions">
          <span className={`ol-save-status ${dirty ? "dirty" : ""}`} role="status">
            {saving ? "Saving layout..." : dirty ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "Layout saved"}
          </span>
          <button type="button" className="secondary-action compact" onClick={resetLayout} disabled={!dirty || saving}>
            <Icon name="icon-refresh" className="button-icon" />
            Reset
          </button>
          <button type="button" className="primary-action compact" onClick={saveLayout} disabled={!dirty || saving}>
            <Icon name="icon-check" className="button-icon" />
            {saving ? "Saving..." : "Save layout"}
          </button>
          <button type="button" className="secondary-action compact ol-add" onClick={() => onAddLocation?.()}>
            <Icon name="icon-plus" className="button-icon" />
            Add location
          </button>
        </div>
      </div>

      {saveError ? (
        <div className="ol-alert" role="alert">
          <Icon name="icon-alert-triangle" />
          <span>{saveError}</span>
        </div>
      ) : null}

      {loadError ? (
        <div className="ol-alert" role="alert">
          <Icon name="icon-alert-triangle" />
          <span>{loadError}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="ol-state" aria-live="polite">
          <Icon name="icon-map-pin" className="nav-icon" />
          <strong>Loading office layout</strong>
          <p>Fetching the saved office layout for this practice.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="ol-state">
          <Icon name="icon-map-pin" className="nav-icon" />
          <strong>No locations yet</strong>
          <p>Add a location first, then come back to place it on the office layout.</p>
        </div>
      ) : (
        <>
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

          <div className="ol-rail">
            <MarkerDetail location={selectedLocation} onOpenLocation={onOpenLocation} onStartScan={onStartScan} />

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
        <GlanceBar summary={summary} />
        </>
      )}
    </div>
  );
}

export function OfficeLayoutRoute({ onMoveLocation, onAddLocation, onOpenLocation, onStartScan, onToast }) {
  const [locations, setLocations] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    traceApi.listLocations()
      .then((data) => {
        if (!alive) return;
        setLocations(data.locations || []);
        setError("");
      })
      .catch((err) => {
        if (!alive) return;
        const message = traceErrorMessage(err, "Could not load office locations.");
        setLocations([]);
        setError(message);
        onToast?.(message);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (locations === null) {
    return (
      <div className="ol">
        <div className="ol-head">
          <div>
            <h1 className="ol-title">Office layout</h1>
            <p className="ol-lede">Loading saved practice locations…</p>
          </div>
        </div>
        <div className="ol-state" aria-live="polite">
          <Icon name="icon-map-pin" className="nav-icon" />
          <strong>Loading locations</strong>
          <p>Fetching the saved office layout for this practice.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ol">
        <div className="ol-head">
          <div>
            <h1 className="ol-title">Office layout</h1>
            <p className="ol-lede">Saved practice locations could not be loaded.</p>
          </div>
        </div>
        <div className="ol-state" role="alert">
          <Icon name="icon-alert-triangle" className="nav-icon" />
          <strong>Couldn't load locations</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="ol">
        <div className="ol-head">
          <div>
            <h1 className="ol-title">Office layout</h1>
            <p className="ol-lede">No locations exist yet. Add a location before arranging the office layout.</p>
          </div>
          <button type="button" className="primary-action compact ol-add" onClick={() => onAddLocation?.()}>
            <Icon name="icon-plus" className="button-icon" />
            Add location
          </button>
        </div>
        <div className="ol-state">
          <Icon name="icon-map-pin" className="nav-icon" />
          <strong>No locations yet</strong>
          <p>Add a location first, then come back to place it on the office layout.</p>
        </div>
      </div>
    );
  }

  return (
    <OfficeLayoutView
      locations={locations}
      onMoveLocation={onMoveLocation}
      onAddLocation={onAddLocation}
      onOpenLocation={onOpenLocation}
      onStartScan={onStartScan}
    />
  );
}
