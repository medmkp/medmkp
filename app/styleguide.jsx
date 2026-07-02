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
  { px: 8, label: "8 — inputs, pager" },
  { px: 11, label: "11 — buttons" },
  { px: 12, label: "12 — small cards" },
  { px: 14, label: "14 — cards, panels" },
  { px: 999, label: "999 — pills, badges" },
];

const SPACING = [4, 6, 8, 12, 16, 24, 30];

const ICONS = [
  "icon-home", "icon-scan", "icon-store", "icon-package", "icon-map-pin",
  "icon-clipboard-check", "icon-shield-check", "icon-dollar-circle", "icon-truck",
  "icon-clock", "icon-bell", "icon-search", "icon-settings", "icon-users",
  "icon-check-circle", "icon-alert-triangle", "icon-x-circle", "icon-plus",
  "icon-trash", "icon-edit", "icon-arrow-right", "icon-microscope", "icon-cabinet",
  "icon-dental-chair", "icon-handshake",
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
        <p className={styles.sectionNote}>
          <strong>Buttons are rounded rectangles (11px), not pills.</strong> Cards
          and panels use 12–14px; inputs 8px. 999px is reserved for status
          pills, badges, chips, and avatars. (Correction from earlier guidance —
          the product moved off stadium buttons.)
        </p>
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
          Rounded rectangles (11px), not pills. One blue, used sparingly — one
          primary per view/drawer/sheet. <code>Ghost-blue</code> is the common
          secondary inside drawers and cards. Destructive = red text on surface,
          never a solid-red fill in a table. There is no shared button class
          yet — the canonical recipe lives here and in DESIGN.md §7.
        </p>
        <div className={styles.demoRow}>
          <button className={`${styles.btn} ${styles.btnPrimary}`}>
            <Icon name="icon-plus" className="nav-icon" /> Primary action
          </button>
          <button className={`${styles.btn} ${styles.btnGhost}`}>Secondary</button>
          <button className={`${styles.btn} ${styles.btnGhostBlue}`}>
            <Icon name="icon-eye" className="nav-icon" /> Ghost-blue
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`}>
            <Icon name="icon-trash" className="nav-icon" /> Confirm removal
          </button>
        </div>
        <div className={styles.demoRow} style={{ marginTop: 14 }}>
          <button className={`${styles.btn} ${styles.btnLink}`}>
            View all evidence <Icon name="icon-chevron-right" className="nav-icon" />
          </button>
          <button className={`${styles.btn} ${styles.btnGhostBlue} ${styles.btnSm}`}>Verify removal</button>
          <button className={`${styles.btn} ${styles.btnIcon}`} aria-label="More">
            <Icon name="icon-more-vertical" className="nav-icon" />
          </button>
          <button className={`${styles.btn} ${styles.btnIcon}`} aria-label="Close">
            <Icon name="icon-x" className="nav-icon" />
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Badges &amp; status pills</h2>
        <p className={styles.sectionNote}>
          Fully rounded (999px), <strong>11.5px / 600</strong>, semantic
          foreground on a <code>color-mix</code> tint of the same hue. Optional
          leading status icon or <code>currentColor</code> dot. Map every new
          state to one of the four semantics — green good, gold attention, red
          urgent, blue label — never a fifth hue (DESIGN.md §8).
        </p>
        <div className={styles.demoRow}>
          <span className={`${styles.badge} ${styles.badgeGreen}`}><Icon name="icon-check-circle" className="nav-icon" /> In stock</span>
          <span className={`${styles.badge} ${styles.badgeGreen}`}>Verified</span>
          <span className={`${styles.badge} ${styles.badgeGold}`}>Low stock</span>
          <span className={`${styles.badge} ${styles.badgeGold}`}>Due soon</span>
          <span className={`${styles.badge} ${styles.badgeRed}`}><Icon name="icon-alert-triangle" className="nav-icon" /> Expired</span>
          <span className={`${styles.badge} ${styles.badgeRed}`}>Recall match</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>Preferred</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>SDS</span>
          <span className={`${styles.badge} ${styles.badgeSlate}`}>Not started</span>
        </div>
        <div className={styles.demoRow} style={{ marginTop: 14 }}>
          <span className={`${styles.badge} ${styles.badgeOutline}`}><Icon name="icon-check-circle" className="nav-icon" /> Present</span>
          <span className={`${styles.badge} ${styles.badgeOutline}`}><Icon name="icon-check-circle" className="nav-icon" /> Exact match</span>
          <span className={`${styles.badge} ${styles.badgeDot} ${styles.badgeGreen}`}>In progress · dot</span>
          <span className={styles.specNote} style={{ alignSelf: "center" }}>
            ← outline pills are the drawer-hero confirmation; dot pills are list lifecycle
          </span>
        </div>
        <p className={styles.sectionNote} style={{ marginTop: 22, marginBottom: 12 }}>
          The reorder-list lifecycle is the shared <code>ListStatusPill</code>
          component (leading <code>currentColor</code> dot):
        </p>
        <div className={styles.demoRow}>
          {["draft", "review", "ordering", "ordered", "handoff"].map((s) => (
            <ListStatusPill key={s} status={s} />
          ))}
        </div>
      </section>

      {/* KPI cards */}
      <section className={styles.section}>
        <h2>KPI cards &amp; metric tiles</h2>
        <p className={styles.sectionNote}>
          The header band of the Needs Attention dashboard — the only surface
          that keeps a KPI row. A row of four <strong>stat cards</strong> — a
          tinted icon chip + label + big 700 value + caption. The chip carries
          the semantic tint; the value stays ink, except money, which goes
          green. JSX reference: <code>StatCard</code> in needsattention.jsx.
        </p>
        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <span className={`${styles.kpiIcon} ${styles.kpiBlue}`}><Icon name="icon-package" className="nav-icon" /></span>
            <div className={styles.kpiBody}>
              <span className={styles.kpiLabel}>Total tracked items</span>
              <span className={styles.kpiValue}>512</span>
              <span className={styles.kpiSub}>Across 5 locations</span>
            </div>
          </div>
          <div className={styles.kpiCard}>
            <span className={`${styles.kpiIcon} ${styles.kpiGold}`}><Icon name="icon-alert-triangle" className="nav-icon" /></span>
            <div className={styles.kpiBody}>
              <span className={styles.kpiLabel}>Low stock</span>
              <span className={styles.kpiValue}>37</span>
              <span className={styles.kpiSub}>7% of items</span>
            </div>
          </div>
          <div className={styles.kpiCard}>
            <span className={`${styles.kpiIcon} ${styles.kpiRed}`}><Icon name="icon-cart" className="nav-icon" /></span>
            <div className={styles.kpiBody}>
              <span className={styles.kpiLabel}>Needs reorder</span>
              <span className={styles.kpiValue}>24</span>
              <span className={styles.kpiSub}>$6,842.20 est. value</span>
            </div>
          </div>
          <div className={styles.kpiCard}>
            <span className={`${styles.kpiIcon} ${styles.kpiGreen}`}><Icon name="icon-dollar-circle" className="nav-icon" /></span>
            <div className={styles.kpiBody}>
              <span className={styles.kpiLabel}>Est. savings this month</span>
              <span className={`${styles.kpiValue} ${styles.kpiValueMoney}`}>$1,248</span>
              <span className={styles.kpiSub}>From exact matches</span>
            </div>
          </div>
        </div>

        <p className={styles.sectionNote} style={{ marginTop: 26 }}>
          <strong>Severity / alert tiles</strong> (Needs Attention) rank work by
          urgency with a colored left accent — compliance (red) outranks reorder
          (blue/slate), so red leads and reorder stays quiet.
        </p>
        <div className={styles.sevRow}>
          <div className={`${styles.sevTile} ${styles.sevRedT}`}>
            <span className={styles.sevTileHead}><Icon name="icon-alert-triangle" className="nav-icon" /> Expired</span>
            <span className={styles.sevCount}>8</span>
            <span className={styles.sevSub}>Past expiration</span>
          </div>
          <div className={`${styles.sevTile} ${styles.sevRedT}`}>
            <span className={styles.sevTileHead}><Icon name="icon-x-circle" className="nav-icon" /> Recall match</span>
            <span className={styles.sevCount}>3</span>
            <span className={styles.sevSub}>Active recalls</span>
          </div>
          <div className={`${styles.sevTile} ${styles.sevGoldT}`}>
            <span className={styles.sevTileHead}><Icon name="icon-file-text" className="nav-icon" /> Missing SDS</span>
            <span className={styles.sevCount}>12</span>
            <span className={styles.sevSub}>No SDS linked</span>
          </div>
          <div className={`${styles.sevTile} ${styles.sevBlueT}`}>
            <span className={styles.sevTileHead}><Icon name="icon-cart" className="nav-icon" /> Reorder due</span>
            <span className={styles.sevCount}>21</span>
            <span className={styles.sevSub}>Likely within 3 weeks</span>
          </div>
        </div>

        <p className={styles.sectionNote} style={{ marginTop: 26 }}>
          <strong>Coverage / progress bars</strong> — label + count + a thin
          track; fill is green at/above target, gold when partial. Used for
          coverage snapshots, data quality, and the location scan-progress bar.
        </p>
        <div className={styles.covList}>
          {[
            { label: "SDS linked", n: 46, d: 52, ok: true },
            { label: "IFUs linked", n: 38, d: 41, ok: true },
            { label: "Expiration proof", n: 57, d: 70, ok: false },
          ].map((c) => (
            <div className={styles.covRow} key={c.label}>
              <span className={styles.covLabel}><Icon name="icon-shield-check" className="nav-icon" /> {c.label}</span>
              <span className={styles.covCount}>{c.n} / {c.d}</span>
              <div className={styles.covTrack}>
                <div
                  className={`${styles.covFill} ${c.ok ? styles.covFillGreen : styles.covFillGold}`}
                  style={{ width: `${Math.round((c.n / c.d) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Callouts */}
      <section className={styles.section}>
        <h2>Callouts</h2>
        <p className={styles.sectionNote}>
          The <strong>info callout</strong> (blue tint) is a drawer&rsquo;s
          honesty rail — it states what a record is and isn&rsquo;t. The{" "}
          <strong>highlight callout</strong> carries the single most important
          takeaway in its state color, with a pill.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className={styles.infoCallout}>
            <Icon name="icon-info" className="nav-icon" />
            <div>
              This is an evidence record for one lot at one location. It does not
              represent exact inventory counts.
              <a className={styles.infoCalloutLink} href="#" onClick={(e) => e.preventDefault()}>View calculation ⌄</a>
            </div>
          </div>
          <div className={styles.highlightCallout}>
            <span className={styles.highlightIcon}><Icon name="icon-calendar" className="nav-icon" /></span>
            <div className={styles.highlightBody}>
              <span className={styles.highlightHead}>Likely reorder in 3 weeks</span>
              <span className={styles.highlightSub}>Estimate only, not exact on-hand quantity.</span>
            </div>
            <span className={`${styles.badge} ${styles.badgeGold}`}>Due soon</span>
          </div>
        </div>
      </section>

      {/* Lifecycle stepper */}
      <section className={styles.section}>
        <h2>Lifecycle stepper</h2>
        <p className={styles.sectionNote}>
          Shows the current state of one lot at one location — Present →
          Expiring soon → Expired unresolved → Removed. The active state fills in
          its semantic color; the rest stay muted. This visualizes lifecycle, it
          is <em>not</em> a progress bar.
        </p>
        <div className={styles.stepper}>
          <div className={`${styles.step} ${styles.stepActive} ${styles.stepActiveGreen}`}>
            <span className={styles.stepDot}><Icon name="icon-check" className="nav-icon" /></span>
            <span className={`${styles.stepTitle} ${styles.dim}`}>Present</span>
            <span className={styles.stepSub}>Active · since Jun 24</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepDot}><Icon name="icon-clock" className="nav-icon" /></span>
            <span className={`${styles.stepTitle} ${styles.dim}`}>Expiring soon</span>
            <span className={styles.stepSub}>90 days before expiry</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepDot}><Icon name="icon-alert-triangle" className="nav-icon" /></span>
            <span className={`${styles.stepTitle} ${styles.dim}`}>Expired unresolved</span>
            <span className={styles.stepSub}>Past expiration</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepDot}><Icon name="icon-x-circle" className="nav-icon" /></span>
            <span className={`${styles.stepTitle} ${styles.dim}`}>Removed</span>
            <span className={styles.stepSub}>No longer here</span>
          </div>
        </div>
      </section>

      {/* Reorder-basis option cards */}
      <section className={styles.section}>
        <h2>Option cards (reorder basis)</h2>
        <p className={styles.sectionNote}>
          A selectable list — radio + icon + title + example lines + optional
          pill. The selected card gets a <code>var(--blue)</code> border +{" "}
          <code>var(--blue-2)</code> tint. Used to pick a reorder basis; it shows
          the <strong>basis and the math, never a confidence %</strong>.
        </p>
        <div className={styles.basisList}>
          <div className={`${styles.basisCard} ${styles.basisCardOn}`}>
            <span className={styles.basisRadio} />
            <span className={styles.basisIcon}><Icon name="icon-truck" className="nav-icon" /></span>
            <div className={styles.basisBody}>
              <span className={styles.basisTitle}>Receiving history</span>
              <span className={styles.basisSub}>Usually received every 30 to 45 days</span>
              <span className={styles.basisSub}>Example: last received Jun 2, 2026</span>
            </div>
            <span className={`${styles.badge} ${styles.badgeGreen} ${styles.basisPill}`}>Recommended</span>
          </div>
          <div className={styles.basisCard}>
            <span className={styles.basisRadio} />
            <span className={styles.basisIcon}><Icon name="icon-chart" className="nav-icon" /></span>
            <div className={styles.basisBody}>
              <span className={styles.basisTitle}>Order history</span>
              <span className={styles.basisSub}>Based on uploaded order history</span>
              <span className={styles.basisSub}>Example: typical order quantity 4 tubs</span>
            </div>
          </div>
          <div className={styles.basisCard}>
            <span className={styles.basisRadio} />
            <span className={styles.basisIcon}><Icon name="icon-clock" className="nav-icon" /></span>
            <div className={styles.basisBody}>
              <span className={styles.basisTitle}>Custom cadence</span>
              <span className={styles.basisSub}>Manual reminder every 30 days</span>
            </div>
          </div>
        </div>
      </section>

      {/* Drawer anatomy */}
      <section className={styles.section}>
        <h2>Drawer</h2>
        <p className={styles.sectionNote}>
          The right-side slide-in is the primary detail + edit surface. Live it
          mounts as a fixed overlay (<code>min(440px, 94vw)</code>, scrim, slide
          from the right); shown here inline so the whole anatomy is visible at
          rest — header + record pill + close, identity hero with status pills,
          key/value sections, and a sticky footer. Structural reference:{" "}
          <code>DocumentDrawer</code> in evidence.jsx (DESIGN.md §11).
        </p>
        <div className={styles.drawerSpec}>
          <div className={styles.dsHead}>
            <h3>Product / Lot Detail</h3>
            <span className={`${styles.badge} ${styles.badgeBlue}`}>Evidence record</span>
            <button className={`${styles.btn} ${styles.btnIcon}`} aria-label="Close" tabIndex={-1}>
              <Icon name="icon-x" className="nav-icon" />
            </button>
          </div>
          <div className={styles.dsBody}>
            <div className={styles.dsHero}>
              <span className={styles.dsThumb}><Icon name="icon-package" className="nav-icon" /></span>
              <div className={styles.dsHeroBody}>
                <span className={styles.dsHeroName}>CaviWipes Disinfectant Towelettes</span>
                <span className={styles.dsHeroSub}>Lot / Location record · CW-160</span>
                <div className={styles.dsHeroBadges}>
                  <span className={`${styles.badge} ${styles.badgeOutline}`}><Icon name="icon-check-circle" className="nav-icon" /> Present</span>
                  <span className={`${styles.badge} ${styles.badgeOutline}`}><Icon name="icon-check-circle" className="nav-icon" /> Exact match</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className={styles.dsSectionH}>Lot &amp; location</h4>
              <dl className={styles.dsMeta}>
                <div><dt>Lot number</dt><dd>A219</dd></div>
                <div><dt>Expiration</dt><dd>Apr 2027</dd></div>
                <div><dt>Capture source</dt><dd>Receiving scan</dd></div>
                <div><dt>Last verified</dt><dd>Today, 9:41 AM</dd></div>
                <div><dt>Days remaining</dt><dd className={styles.alert}>Below par</dd></div>
              </dl>
            </div>
          </div>
          <div className={styles.dsFoot}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} tabIndex={-1}>
              <Icon name="icon-check-circle" className="nav-icon" /> Verify status
            </button>
            <div className={styles.dsFootRow}>
              <button className={`${styles.btn} ${styles.btnGhostBlue}`} tabIndex={-1}>Edit record</button>
              <button className={`${styles.btn} ${styles.btnDanger}`} tabIndex={-1}>Confirm removal</button>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile */}
      <section className={styles.section}>
        <h2>Mobile — scanner-first</h2>
        <p className={styles.sectionNote}>
          The phone surface is its own flow, not a shrunk desktop: full-screen
          camera, bottom sheets, big tap targets, tighter radii (sheet 16, card
          10–12, thumb 8). The same scanner records two things — <strong>Receiving</strong>{" "}
          (creates an intake record + reorder signal) and <strong>Shelf Audit</strong>{" "}
          (verifies presence + status). Say &ldquo;Create intake record,&rdquo; never
          &ldquo;Add stock&rdquo;; quantity is optional &ldquo;received,&rdquo; never &ldquo;on hand&rdquo;
          (DESIGN.md §16).
        </p>
        <div className={styles.phoneRow}>
          {/* Phone 1 — scan mode + camera */}
          <div className={styles.phone}>
            <div className={styles.phoneBar}><BrandMark /></div>
            <div className={styles.segToggle}>
              <button className={`${styles.segBtn} ${styles.segBtnOn}`} tabIndex={-1}>Receiving</button>
              <button className={styles.segBtn} tabIndex={-1}><Icon name="icon-shield-check" className="nav-icon" /> Shelf Audit</button>
            </div>
            <div className={`${styles.modeCard} ${styles.modeCardOn}`}>
              <div className={styles.modeHead}>
                <span className={styles.modeIcon}><Icon name="icon-package" className="nav-icon" /></span>
                <div>
                  <div className={styles.modeName}>Receiving</div>
                  <div className={styles.modeDesc}>Use when a new shipment arrives</div>
                </div>
              </div>
              <span className={styles.modeRecords}>Records</span>
              <div className={styles.chipRow}>
                {["Lot", "Expiry", "Received date", "Location", "Qty (optional)"].map((c) => (
                  <span className={`${styles.badge} ${styles.badgeBlue}`} key={c}><Icon name="icon-check" className="nav-icon" /> {c}</span>
                ))}
              </div>
            </div>
            <div className={styles.cameraMock}>
              <span className={styles.locPill}><Icon name="icon-package" className="nav-icon" /> Hygiene Cabinet <Icon name="icon-chevron-down" className="nav-icon" /></span>
              <div className={styles.reticle}><span /><span /><span /><span /></div>
              <span className={styles.cameraCaption}>Align barcode inside frame</span>
            </div>
            <button className={styles.mobileBtn} tabIndex={-1}><Icon name="icon-scan" className="nav-icon" /> Continue</button>
          </div>

          {/* Phone 2 — captured + status + actions */}
          <div className={styles.phone}>
            <div className={styles.phoneBar}><BrandMark /></div>
            <div className={styles.phoneTitle}>Mobile Receiving Scan</div>
            <div className={styles.phoneLede}>Lot + expiry capture</div>
            <div className={styles.successBanner}>
              <Icon name="icon-check-circle" className="nav-icon" />
              <div className={styles.successBody}>
                <span className={styles.successTitle}>Barcode and label detected</span>
                <span className={styles.successSub}>Lot and expiry captured</span>
              </div>
            </div>
            <div className={styles.captCard}>
              <span className={styles.captIcon}><Icon name="icon-tag" className="nav-icon" /></span>
              <div className={styles.captBody}>
                <span className={styles.captLabel}>Lot (captured)</span>
                <span className={styles.captValue}>A219</span>
              </div>
              <span className={styles.captCheck}><Icon name="icon-check-circle" className="nav-icon" /></span>
            </div>
            <div className={styles.captCard}>
              <span className={styles.captIcon}><Icon name="icon-calendar" className="nav-icon" /></span>
              <div className={styles.captBody}>
                <span className={styles.captLabel}>Quantity received (optional)</span>
                <span className={styles.captValue}>160 wipes</span>
              </div>
              <span className={styles.captCheck}><Icon name="icon-check-circle" className="nav-icon" /></span>
            </div>
            <span className={styles.modeRecords}>Shelf-audit status</span>
            <div className={styles.statusBtnRow}>
              <button className={`${styles.statusBtn} ${styles.statusBtnGreen}`} tabIndex={-1}>
                <Icon name="icon-check-circle" className="nav-icon" />
                <span className={styles.statusBtnLabel}>Present</span>
                <span className={styles.statusBtnSub}>On the shelf</span>
              </button>
              <button className={`${styles.statusBtn} ${styles.statusBtnGold}`} tabIndex={-1}>
                <Icon name="icon-arrow-right" className="nav-icon" />
                <span className={styles.statusBtnLabel}>Moved</span>
                <span className={styles.statusBtnSub}>Location changed</span>
              </button>
            </div>
            <button className={styles.mobileBtn} tabIndex={-1}><Icon name="icon-clipboard-check" className="nav-icon" /> Save intake record</button>
          </div>
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
