"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./styleguide.module.css";
import { BrandMark, Icon } from "./icons";
import { ListStatusPill, QtyStepper } from "./ui";

// Live reference for the TraceDDS design system. Public route (/styleguide) so
// any teammate can open it without a customer account; it renders no customer
// data. The written source of truth is DESIGN.md at the repo root — this page
// is its visual mirror. Everything here is built against the canonical tokens,
// so the page itself is an example of how a new screen should be authored.

const COLOR_TOKENS = [
  { name: "--bg", hex: "#f8faff", use: "App background" },
  { name: "--surface", hex: "#ffffff", use: "Cards, panels" },
  { name: "--surface-2", hex: "#f4f7ff", use: "Insets, hovers" },
  { name: "--ink", hex: "#0b1533", use: "Primary text" },
  { name: "--muted", hex: "#67728a", use: "Secondary text" },
  { name: "--line", hex: "#e4e9f2", use: "Borders, dividers" },
  { name: "--blue", hex: "#155dfc", use: "Primary action, links" },
  { name: "--blue-2", hex: "#eef4ff", use: "Blue tint / focus ring" },
  { name: "--green", hex: "#0a9861", use: "Success, savings, in-stock" },
  { name: "--gold", hex: "#d88718", use: "Warning, in-progress" },
  { name: "--red", hex: "#ef4444", use: "Danger, destructive" },
];

const TYPE_SCALE = [
  { px: 30, weight: 700, label: "Display / page hero" },
  { px: 24, weight: 600, label: "Page title (h1)" },
  { px: 18, weight: 600, label: "Section title (h2)" },
  { px: 15, weight: 600, label: "Card title / emphasis" },
  { px: 14, weight: 400, label: "Body (base)" },
  { px: 13, weight: 400, label: "Secondary / dense rows" },
  { px: 12, weight: 500, label: "Labels, pills, captions" },
  { px: 11, weight: 500, label: "Micro / eyebrow (uppercase)" },
];

const WEIGHTS = [
  { w: 400, label: "400 Body" },
  { w: 500, label: "500 Medium" },
  { w: 600, label: "600 Semibold" },
  { w: 700, label: "700 Display" },
];

const RADII = [
  { px: 8, label: "8 — inputs, chips" },
  { px: 10, label: "10 — small cards" },
  { px: 12, label: "12 — cards" },
  { px: 14, label: "14 — panels" },
  { px: 999, label: "999 — pills, buttons" },
];

const SPACING = [4, 6, 8, 12, 16, 24, 30];

const ICONS = [
  "icon-home", "icon-scan", "icon-store", "icon-package", "icon-map-pin",
  "icon-clipboard-check", "icon-shield-check", "icon-dollar-circle", "icon-truck",
  "icon-clock", "icon-bell", "icon-search", "icon-settings", "icon-users",
  "icon-check-circle", "icon-alert-triangle", "icon-x-circle", "icon-plus",
  "icon-trash", "icon-edit", "icon-arrow-right", "icon-microscope", "icon-cabinet",
  "icon-handshake",
];

// Location / room-type icon family, with the semantic tint each one carries on
// the location cards (icon color + circle fill). Scan leads as the primary
// action icon. Tints are the app's extended palette beyond the core tokens —
// shown inline (like the color swatches) rather than added to styles.css.
const ROLE_ICONS = [
  { icon: "icon-scan", name: "Scan", color: "#155dfc", bg: "#eaf1ff" },
  { icon: "icon-dental-chair", name: "Operatory", color: "#155dfc", bg: "#eaf1ff" },
  { icon: "icon-cabinet", name: "Cabinet", color: "#4f46e5", bg: "#ebecff" },
  { icon: "icon-shield-check", name: "Sterilization", color: "#0d9488", bg: "#e1f6f1" },
  { icon: "icon-flask", name: "Lab", color: "#7c3aed", bg: "#f1ecff" },
  { icon: "icon-package", name: "Storage", color: "#475569", bg: "#eef1f6" },
  { icon: "icon-first-aid", name: "Emergency kit", color: "var(--red)", bg: "rgba(239,68,68,0.1)" },
];

// Pagination demo — a real count so "Showing X to Y of Z" updates live.
const P_TOTAL = 47;
const P_PER = 10;
const P_PAGES = Math.ceil(P_TOTAL / P_PER);

const JSX_COMPONENTS = [
  ["ListStatusPill", "list status chip (draft → handed off)"],
  ["QtyStepper", "− / value / + quantity control"],
  ["UomSelect", "unit-of-measure dropdown"],
  ["ProductThumb", "product image with fallback"],
  ["MatchSupplier / CandidateName", "supplier + match candidate rows"],
  ["BuyingPreferencesCard", "editable buying-preferences panel"],
  ["ConfirmModal", "confirm / destructive dialog"],
  ["ScanResultCard", "barcode scan result"],
  ["CatalogSupplierAvatar", "supplier logo / initials badge"],
  ["Icon / BrandMark", "sprite icon + wordmark"],
];

const FILTER_OPTIONS = {
  status: [
    { value: "all", label: "All statuses" },
    { value: "in_progress", label: "In progress" },
    { value: "completed", label: "Completed" },
    { value: "needs_attention", label: "Needs attention" },
    { value: "not_started", label: "Not started" },
  ],
  room: [
    { value: "all", label: "All room types" },
    { value: "operatory", label: "Operatory" },
    { value: "cabinet", label: "Cabinet" },
    { value: "sterilization", label: "Sterilization" },
    { value: "lab", label: "Lab" },
  ],
  sort: [
    { value: "attention", label: "Needs attention" },
    { value: "name", label: "Name" },
  ],
};

// Custom dropdown — the canonical filter control on dense toolbars (Locations,
// Needs Attention). The native <select> popup is OS-rendered and can't be
// styled, so this renders its own trigger + menu in the app font and closes on
// outside-click / Escape. Built against tokens here as the reference copy; the
// view modules currently hold near-identical local copies.
function FilterSelect({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <div className={`${styles.field} ${open ? styles.fieldOpen : ""}`} ref={wrapRef}>
      <span className={styles.fieldLabel}>{label}</span>
      <button
        type="button"
        className={styles.fieldSelect}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {selected?.label}
      </button>
      <Icon name="icon-chevron-down" className={styles.fieldChevron} />
      {open && (
        <ul className={styles.fieldMenu} role="listbox">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`${styles.fieldOption} ${o.value === value ? styles.fieldOptionOn : ""}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className={styles.fieldOptionLabel}>{o.label}</span>
                {o.value === value && <Icon name="icon-check" className={styles.fieldCheck} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Swatch({ token }) {
  return (
    <div className={styles.swatch}>
      <div className={styles.swatchChip} style={{ background: `var(${token.name})` }} />
      <div className={styles.swatchMeta}>
        <div className={styles.swatchName}>{token.name}</div>
        <div className={styles.swatchHex}>{token.hex} · {token.use}</div>
      </div>
    </div>
  );
}

export default function StyleGuide() {
  const [qty, setQty] = useState(2);
  const [status, setStatus] = useState("all");
  const [room, setRoom] = useState("all");
  const [sort, setSort] = useState("attention");
  const [page, setPage] = useState(2);
  const pStart = (page - 1) * P_PER + 1;
  const pEnd = Math.min(page * P_PER, P_TOTAL);

  return (
    <main className={styles.page}>
      <div className={styles.pageHead}>
        <BrandMark />
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700 }}>Design System</h1>
      <p className={styles.lede}>
        The visual language of TraceDDS, in one place. Build new screens from these
        tokens, scales, and components so every view feels like the same product.
        This page is the live mirror of <strong>DESIGN.md</strong> — if they ever
        disagree, the code wins and the doc gets fixed.
      </p>
      <a className={styles.docLink} href="https://github.com/search?q=repo-DESIGN.md" onClick={(e) => e.preventDefault()}>
        <Icon name="icon-book" className="nav-icon" /> Full reference: DESIGN.md (repo root)
      </a>

      {/* Color */}
      <section className={styles.section}>
        <h2>Color tokens</h2>
        <p className={styles.sectionNote}>
          Defined once in <code>:root</code> (styles.css). Always reference the token,
          never the raw hex — that is what keeps screens in sync. Green is the only
          color currently consistent everywhere; the rest have drifted.
        </p>
        <div className={styles.swatchGrid}>
          {COLOR_TOKENS.map((t) => <Swatch key={t.name} token={t} />)}
        </div>
      </section>

      {/* Drift */}
      <section className={styles.section}>
        <h2>Known drift — fix on touch</h2>
        <div className={styles.callout}>
          <div className={styles.calloutTitle}>
            <Icon name="icon-alert-triangle" className="nav-icon" /> Three blues are
            in the codebase. Only one is canonical.
          </div>
          <div className={styles.calloutBody}>
            The Phase 2 module CSS (locations, scan sessions, dashboard) hardcodes
            <code> #2f5bd6</code>; parts of styles.css use <code>#0f62ff</code>. Both
            should be <code>var(--blue)</code>. Same story for <code>--ink</code> and
            <code> --red</code>. When you edit one of those files, repoint it to the
            token rather than adding a fourth shade.
          </div>
          <div className={styles.driftRow}>
            <span className={styles.driftItem}><span className={styles.driftDot} style={{ background: "#2f5bd6" }} />#2f5bd6 modules</span>
            <span className={styles.driftItem}><span className={styles.driftDot} style={{ background: "#0f62ff" }} />#0f62ff styles.css</span>
            <span className={`${styles.driftItem} ${styles.good}`}><span className={styles.driftDot} style={{ background: "var(--blue)" }} />var(--blue) ✓ canonical</span>
          </div>
        </div>
      </section>

      {/* Type */}
      <section className={styles.section}>
        <h2>Typography</h2>
        <p className={styles.sectionNote}>
          Geist, with a system fallback. Base body is 14px. Sizes cluster at
          11/12/13/14 for UI and 18/24/30 for headings — stay on the scale.
        </p>
        {TYPE_SCALE.map((t) => (
          <div className={styles.typeRow} key={t.px}>
            <span className={styles.typeSpec}>{t.px}px · {t.weight}</span>
            <span style={{ fontSize: t.px, fontWeight: t.weight, lineHeight: 1.1 }}>
              {t.label}
            </span>
          </div>
        ))}
        <div className={styles.weightRow}>
          {WEIGHTS.map((x) => (
            <div className={styles.weightItem} key={x.w}>
              <div className={styles.sample} style={{ fontWeight: x.w }}>Trace</div>
              <div className={styles.label}>{x.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Radius */}
      <section className={styles.section}>
        <h2>Radius</h2>
        <p className={styles.sectionNote}>Pills and buttons are fully rounded (999px). Cards and panels use 10–14px.</p>
        <div className={styles.scaleRow}>
          {RADII.map((r) => (
            <div className={styles.radiusItem} key={r.px}>
              <div className={styles.radiusBox} style={{ borderRadius: r.px }} />
              {r.label}
            </div>
          ))}
        </div>
      </section>

      {/* Spacing */}
      <section className={styles.section}>
        <h2>Spacing</h2>
        <p className={styles.sectionNote}>Gaps and padding step through 4 · 6 · 8 · 12 · 16 · 24 · 30. The sidebar is 280px; the sticky header is 80px tall.</p>
        <div className={styles.scaleRow}>
          {SPACING.map((s) => (
            <div className={styles.spaceItem} key={s}>
              <div className={styles.spaceBar} style={{ width: s * 4 }} />
              {s}px
            </div>
          ))}
        </div>
      </section>

      {/* Components */}
      <section className={styles.section}>
        <h2>Buttons</h2>
        <p className={styles.sectionNote}>
          Pill-shaped. Primary = solid blue. Secondary = ghost (surface + line).
          Destructive = red text on surface. There is no shared button class yet —
          the canonical pattern lives here and in DESIGN.md.
        </p>
        <div className={styles.demoRow}>
          <button className={`${styles.btn} ${styles.btnPrimary}`}>
            <Icon name="icon-plus" className="nav-icon" /> Primary action
          </button>
          <button className={`${styles.btn} ${styles.btnGhost}`}>Secondary</button>
          <button className={`${styles.btn} ${styles.btnDanger}`}>
            <Icon name="icon-trash" className="nav-icon" /> Delete
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Status pills</h2>
        <p className={styles.sectionNote}>Reorder-list lifecycle. Rendered live from the shared <code>ListStatusPill</code> component.</p>
        <div className={styles.demoRow}>
          {["draft", "review", "ordering", "ordered", "handoff"].map((s) => (
            <ListStatusPill key={s} status={s} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Inputs</h2>
        <div className={styles.demoRow}>
          <input className={styles.input} placeholder="Search products, suppliers…" />
          <QtyStepper qty={qty} setQty={setQty} />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Search bar</h2>
        <p className={styles.sectionNote}>
          A leading <code>icon-search</code> in <code>var(--muted)</code> plus a
          borderless input, wrapped in a <code>var(--surface)</code> pill
          (<code>1px var(--line)</code>, <code>10px</code> radius). Focus lifts
          the whole pill: <code>var(--blue)</code> border + <code>var(--blue-2)</code>
          {" "}ring. This is the toolbar search on Locations, Needs Attention, and
          Evidence — one bar, everywhere.
        </p>
        <div className={styles.demoRow}>
          <label className={styles.searchBar}>
            <Icon name="icon-search" className="nav-icon" />
            <input type="search" placeholder="Search items, SKUs, or issues…" aria-label="Search" />
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Filter dropdown</h2>
        <p className={styles.sectionNote}>
          The canonical filter control on dense toolbars (Locations, Needs
          Attention). A custom dropdown, not a native <code>&lt;select&gt;</code>
          — the OS popup can&rsquo;t be styled — so the menu renders in the app
          font: notched dark label, light value, a chevron that rotates on open,
          and a stroked <code>var(--blue)</code> check on the selected row. Closes
          on outside-click or Escape. Live (click to open) and an open specimen:
        </p>
        <div className={styles.ddDemo}>
          <div className={styles.demoRow}>
            <FilterSelect label="Status" value={status} onChange={setStatus} options={FILTER_OPTIONS.status} />
            <FilterSelect label="Room type" value={room} onChange={setRoom} options={FILTER_OPTIONS.room} />
            <FilterSelect label="Sort by" value={sort} onChange={setSort} options={FILTER_OPTIONS.sort} />
          </div>
          {/* Always-open specimen so the menu styling is visible at rest. Static
              (no handlers) — the live row above demonstrates the behavior. */}
          <div className={styles.specimen}>
            <div className={`${styles.field} ${styles.fieldOpen}`}>
              <span className={styles.fieldLabel}>Status</span>
              <button type="button" className={styles.fieldSelect} tabIndex={-1} aria-hidden="true">All statuses</button>
              <Icon name="icon-chevron-down" className={styles.fieldChevron} />
              <ul className={styles.fieldMenu} role="presentation">
                {FILTER_OPTIONS.status.map((o) => (
                  <li key={o.value}>
                    <span className={`${styles.fieldOption} ${o.value === "all" ? styles.fieldOptionOn : ""}`}>
                      <span className={styles.fieldOptionLabel}>{o.label}</span>
                      {o.value === "all" && <Icon name="icon-check" className={styles.fieldCheck} />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Pagination</h2>
        <p className={styles.sectionNote}>
          The canonical table pager (Needs Attention, Evidence). A count summary
          on the left, controls on the right: <code>32px</code> square buttons,
          <code> 8px</code> radius, current page solid <code>var(--blue)</code>;
          hover = blue border + text; prev/next fade when disabled. Reuse this on
          any new paginated table. Live:
        </p>
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>Showing {pStart} to {pEnd} of {P_TOTAL} items</span>
          <div className={styles.pager}>
            <button type="button" className={styles.pageBtn} aria-label="Previous" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <Icon name="icon-chevron-left" className="nav-icon" />
            </button>
            {Array.from({ length: P_PAGES }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.pageBtn} ${n === page ? styles.pageBtnOn : ""}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button type="button" className={styles.pageBtn} aria-label="Next" disabled={page >= P_PAGES} onClick={() => setPage(page + 1)}>
              <Icon name="icon-chevron-right" className="nav-icon" />
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Card</h2>
        <p className={styles.sectionNote}>Surface + 1px line + soft shadow (<code>var(--shadow)</code>). The default container for almost everything.</p>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Operatory 2</div>
          <div className={styles.cardMeta}>Cabinet · 3 scan sessions</div>
          <div className={styles.cardStat} style={{ color: "var(--green)" }}>98% audit-ready</div>
        </div>
      </section>

      {/* Icons */}
      <section className={styles.section}>
        <h2>Icons</h2>
        <p className={styles.sectionNote}>
          One SVG sprite (icons.jsx). Use <code>{`<Icon name="icon-…" />`}</code> —
          they inherit <code>currentColor</code>. A representative set:
        </p>
        <div className={styles.iconGrid}>
          {ICONS.map((name) => (
            <div className={styles.iconCell} key={name}>
              <Icon name={name} className="nav-icon" />
              <span>{name.replace("icon-", "")}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Location / room-type icon family */}
      <section className={styles.section}>
        <h2>Location &amp; scan icons</h2>
        <p className={styles.sectionNote}>
          The scan action icon and the room-type family, each shown in a 52px
          tinted circle exactly as it renders on a location card. The icon color +
          circle fill are a fixed pair per type — don&rsquo;t recolor them. Scan is
          the one blue action; the room types each get their own semantic tint.
        </p>
        <div className={styles.roleIconGrid}>
          {ROLE_ICONS.map((r) => (
            <div className={styles.roleIconCell} key={r.name}>
              <span className={styles.roleIconChip} style={{ color: r.color, background: r.bg }}>
                <Icon name={r.icon} className="nav-icon" />
              </span>
              <span className={styles.roleIconName}>{r.name}</span>
              <span className={styles.roleIconGlyph}>{r.icon.replace("icon-", "")}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Component library */}
      <section className={styles.section}>
        <h2>Shared components</h2>
        <p className={styles.sectionNote}>
          Reach for these (app/ui.jsx, app/icons.jsx) before building from scratch.
          Reusing them is what keeps screens consistent.
        </p>
        <div className={styles.componentList}>
          {JSX_COMPONENTS.map(([name, desc]) => (
            <div key={name}><code>{name}</code> — {desc}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
