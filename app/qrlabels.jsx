"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "./icons";

const MOCK_LOCATIONS = [
  { id: "loc_hyg", name: "Hygiene Cabinet", type: "cabinet", qr_code: "TDDS-LOC-HYG01", layout_x: 1, layout_y: 0, notes: null, item_count: 37, needs_attention_count: 4 },
  { id: "loc_op1", name: "Operatory 1", type: "operatory", qr_code: "TDDS-LOC-OP1", layout_x: 0, layout_y: 1, notes: null, item_count: 18, needs_attention_count: 1 },
  { id: "loc_steri", name: "Sterilization", type: "sterilization", qr_code: "TDDS-LOC-STERI", layout_x: 2, layout_y: 1, notes: null, item_count: 12, needs_attention_count: 2 },
  { id: "loc_lab", name: "Lab", type: "lab", qr_code: "TDDS-LOC-LAB", layout_x: 2, layout_y: 0, notes: null, item_count: 9, needs_attention_count: 0 },
  { id: "loc_storage", name: "Storage", type: "storage", qr_code: "TDDS-LOC-STORE", layout_x: 3, layout_y: 1, notes: null, item_count: 64, needs_attention_count: 3 },
];

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
  { id: "two-up", label: "2-up", sub: "4\" × 2\" · Avery 5163", cols: 2, qr: 132 },
  { id: "three-up", label: "3-up", sub: "2.6\" × 2\" · Avery 5160", cols: 3, qr: 104 },
  { id: "four-up", label: "4-up", sub: "2\" × 2\" · square", cols: 4, qr: 88 },
];

function typeLabel(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.other;
}

export function QrLabelView({ locations = MOCK_LOCATIONS }) {
  const [selected, setSelected] = useState(() => new Set(locations.map((l) => l.id)));
  const [layoutId, setLayoutId] = useState(LAYOUTS[1].id);
  const [showType, setShowType] = useState(true);
  const [showMark, setShowMark] = useState(true);

  const layout = LAYOUTS.find((l) => l.id === layoutId) || LAYOUTS[1];
  const chosen = locations.filter((l) => selected.has(l.id));

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = selected.size === locations.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(locations.map((l) => l.id)));
  }

  return (
    <div className="qrl-page">
      <header className="qrl-head">
        <div>
          <h2>QR labels</h2>
          <p>Print cabinet labels so staff can scan straight into a location.</p>
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
              {locations.map((loc) => (
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
                    <QRCodeSVG value={loc.qr_code} size={layout.qr} level="M" />
                  </div>
                  <div className="qrl-label-meta">
                    {showMark && (
                      <img className="qrl-label-mark" src="/mark.svg" alt="" width={18} height={18} />
                    )}
                    <strong className="qrl-label-name">{loc.name}</strong>
                    {showType && <span className="qrl-label-type">{typeLabel(loc.type)}</span>}
                    <code className="qrl-label-code">{loc.qr_code}</code>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
