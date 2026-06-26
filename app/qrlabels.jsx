"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "./icons";
import { traceApi } from "./lib";

// Human-readable label for each location type.
const TYPE_LABELS = {
  cabinet: "Cabinet",
  operatory: "Operatory",
  sterilization: "Sterilization",
  lab: "Lab",
  storage: "Storage",
  emergency_kit: "Emergency kit",
  other: "Other",
};

// The print layouts on offer. `perPage` documents the Avery-style sheet each
// maps to; `qr` is the QR module size in px for that label footprint.
const LAYOUTS = [
  { id: "one-up", label: "1-up", sub: "9.5\" × 11\" · full page", cols: 1, qr: 420 },
  { id: "two-up", label: "2-up", sub: "4\" × 2\" · Avery 5163", cols: 2, qr: 132 },
  { id: "three-up", label: "3-up", sub: "2.6\" × 2\" · Avery 5160", cols: 3, qr: 104 },
  { id: "four-up", label: "4-up", sub: "2\" × 2\" · square", cols: 4, qr: 88 },
];

function typeLabel(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.other;
}

// The URL a printed label's QR encodes. Scanning it on a phone opens the scanner
// already scoped to this location, where staff pick Shelf Audit or Receiving.
// Uses the absolute origin so the QR works off the printed page; falls back to a
// relative URL during SSR (no window).
function scanUrlFor(loc) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/app/scan-session?location=${encodeURIComponent(loc.id)}`;
}

export function QrLabelView({ onBack, onToast }) {
  const [locations, setLocations] = useState(null); // null = loading
  const [selected, setSelected] = useState(() => new Set());
  const [layoutId, setLayoutId] = useState("three-up");
  const [showType, setShowType] = useState(true);
  const [showMark, setShowMark] = useState(true);

  // Print real saved locations — every label has to resolve to a location that
  // exists for its QR to open the right scanner. Default to all selected.
  useEffect(() => {
    let alive = true;
    traceApi
      .listLocations()
      .then((r) => {
        if (!alive) return;
        const locs = r.locations || [];
        setLocations(locs);
        setSelected(new Set(locs.map((l) => l.id)));
      })
      .catch(() => {
        if (!alive) return;
        setLocations([]);
        onToast?.("Couldn't load locations.");
      });
    return () => { alive = false; };
    // onToast is stable enough for a one-shot load; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = locations || [];
  const layout = LAYOUTS.find((l) => l.id === layoutId) || LAYOUTS[1];
  const chosen = list.filter((l) => selected.has(l.id));

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = list.length > 0 && selected.size === list.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(list.map((l) => l.id)));
  }

  return (
    <div className="qrl-page">
      <header className="qrl-head">
        <div>
          {onBack && (
            <button type="button" className="back-link qrl-back" onClick={onBack}>
              Locations
            </button>
          )}
          <h2>QR labels</h2>
          <p>Print cabinet labels so staff can scan straight into a location and start a Shelf Audit or Receiving.</p>
        </div>
        <button
          type="button"
          className="primary-action compact qrl-print-btn"
          onClick={() => window.print()}
          disabled={chosen.length === 0}
        >
          <Icon name="icon-file-text" className="button-icon" />
          Print / download
        </button>
      </header>

      {locations === null ? (
        <div className="qrl-empty">
          <p>Loading locations…</p>
        </div>
      ) : list.length === 0 ? (
        <div className="qrl-empty">
          <Icon name="icon-map-pin" className="qrl-empty-icon" />
          <p>No locations yet. Add a location first, then come back to print its QR label.</p>
        </div>
      ) : (
        <div className="qrl-body">
          <aside className="qrl-controls" aria-label="Label options">
            <section className="qrl-card">
              <div className="qrl-card-head">
                <h3>Locations</h3>
                <button type="button" className="qrl-link-btn" onClick={toggleAll}>
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              <ul className="qrl-loc-list">
                {list.map((loc) => (
                  <li key={loc.id}>
                    <label className="qrl-check">
                      <input
                        type="checkbox"
                        checked={selected.has(loc.id)}
                        onChange={() => toggle(loc.id)}
                      />
                      <span className="qrl-check-body">
                        <strong>{loc.name}</strong>
                        <small>{typeLabel(loc.type)}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className="qrl-card">
              <h3>Label size</h3>
              <div className="qrl-sizes" role="radiogroup" aria-label="Label size">
                {LAYOUTS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={opt.id === layoutId}
                    className={`qrl-size ${opt.id === layoutId ? "active" : ""}`}
                    onClick={() => setLayoutId(opt.id)}
                  >
                    <strong>{opt.label}</strong>
                    <small>{opt.sub}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="qrl-card">
              <h3>On each label</h3>
              <div className="qrl-toggles">
                <label className="qrl-toggle">
                  <input type="checkbox" checked={showType} onChange={(e) => setShowType(e.target.checked)} />
                  <span>Include location type</span>
                </label>
                <label className="qrl-toggle">
                  <input type="checkbox" checked={showMark} onChange={(e) => setShowMark(e.target.checked)} />
                  <span>Include TraceDDS mark</span>
                </label>
              </div>
            </section>
          </aside>

          <section className="qrl-preview" aria-label="Label preview">
            <div className="qrl-preview-head">
              <span>
                {chosen.length} {chosen.length === 1 ? "label" : "labels"} · {layout.label}
              </span>
            </div>
            {chosen.length === 0 ? (
              <div className="qrl-empty">
                <Icon name="icon-map-pin" className="qrl-empty-icon" />
                <p>Pick at least one location to print labels.</p>
              </div>
            ) : (
              <div
                className={`qrl-sheet qrl-sheet-${layout.id}`}
                style={{ "--qrl-cols": layout.cols }}
              >
                {chosen.map((loc) => (
                  <article className="qrl-label" key={loc.id}>
                    <div className="qrl-label-qr">
                      <QRCodeSVG value={scanUrlFor(loc)} size={layout.qr} level="M" />
                    </div>
                    <div className="qrl-label-meta">
                      {showMark && (
                        <img className="qrl-label-mark" src="/mark.svg" alt="" width={18} height={18} />
                      )}
                      <strong className="qrl-label-name">{loc.name}</strong>
                      {showType && <span className="qrl-label-type">{typeLabel(loc.type)}</span>}
                      <span className="qrl-label-hint">Scan to open · audit · receive</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
