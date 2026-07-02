"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "./icons";
import { daysUntil, formatExpiryDate, formatTraceDate, money, SWIPE_REVEAL, traceApi, traceErrorMessage } from "./lib";
import { OfficeLayoutView } from "./officelayout";
import { ConfirmModal, DetailDrawer, MobileHeader, ProductSearchResults, ProductThumb, useProductSearch } from "./ui";
import s from "./locations.module.css";
import rs from "./scanmobile.module.css";

// Locations surface: the Location Board (real per-practice locations with scan
// coverage), the Add Location form (creates a real location), and the per-
// location Detail (real inventory + scan entry). Scan coverage is rolled from
// the location's scan sessions; inventory comes from the Phase-1 backend.

// The URL this location's QR encodes — scanning it on a phone opens the scanner
// already scoped to this location. Mirrors qrlabels.jsx's scanUrlFor so the
// header QR and the printed label resolve to the same place. Absolute origin so
// a phone camera pointed at the screen works; relative during SSR (no window).
function scanUrlFor(loc) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/app/scan-session?location=${encodeURIComponent(loc.id)}`;
}

// Link a catalog product to an unidentified scan. Search the catalog, pick the
// right product, and PATCH the evidence record's identity — the same shape the
// scanner's link flow used, now reachable from the items table + Needs Attention.
function IdentifyModal({ item, onClose, onPick }) {
  const { query, setQuery, results, loading } = useProductSearch(true);
  return (
    <div className={s.identifyOverlay} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.identifyModal}>
        <div className={s.identifyHead}>
          <div>
            <div className={s.identifyTitle}>Identify this item</div>
            <div className={s.identifySub}>{item.name || item.barcode || "Unidentified item"}</div>
          </div>
          <button type="button" className={s.identifyClose} onClick={onClose} aria-label="Close"><Icon name="icon-x" /></button>
        </div>
        <div className={s.identifyBody}>
          <label className={s.search} style={{ maxWidth: "none" }}>
            <Icon name="icon-search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the catalog…" aria-label="Search products" autoFocus />
          </label>
          <ProductSearchResults query={query} results={results} loading={loading} onPick={onPick} emptyHint="Type a product name to link it." />
        </div>
      </div>
    </div>
  );
}

// Per room-type icon + tint, mirroring the office-layout editor's vocabulary.
const TYPE_META = {
  operatory: { icon: "icon-dental-chair", tint: s.tBlue, label: "Operatory" },
  cabinet: { icon: "icon-cabinet", tint: s.tIndigo, label: "Cabinet" },
  sterilization: { icon: "icon-shield-check", tint: s.tTeal, label: "Sterilization" },
  lab: { icon: "icon-flask", tint: s.tViolet, label: "Lab" },
  storage: { icon: "icon-package", tint: s.tSlate, label: "Storage" },
  emergency_kit: { icon: "icon-first-aid", tint: s.tRed, label: "Emergency kit" },
  other: { icon: "icon-map-pin", tint: s.tBlue, label: "Location" },
};

function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.other;
}

// Status → badge label + class.
const STATUS_META = {
  in_progress: { label: "In progress", badge: s.badgeBlue },
  completed: { label: "Completed", badge: s.badgeGreen },
  needs_attention: { label: "Needs attention", badge: s.badgeAmber },
  not_started: { label: "Not started", badge: s.badgeSlate },
  healthy: { label: "Healthy", badge: s.badgeGreen },
};

const TONE = { blue: s.tBlue, green: s.tGreen, amber: s.tAmber, red: s.tRed, violet: s.tViolet, slate: s.tSlate };
// Text/foreground tone (no background) for inline icons + status labels.
const TONE_TEXT = { blue: s.txBlue, green: s.txGreen, amber: s.txAmber, red: s.txRed };

// Custom dropdown: the native <select> popup is rendered by the OS and can't be
// styled, so we render our own trigger + menu in the app font. Closes on
// outside-click or Escape, matching the Needs Attention filters and the topbar
// menus elsewhere in the app.
function Select({ label, value, onChange, options }) {
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
    <div className={`${s.field} ${open ? s.fieldOpen : ""}`} ref={wrapRef}>
      <span className={s.fieldLabel}>{label}</span>
      <button
        type="button"
        className={s.fieldSelect}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {selected?.label}
      </button>
      <Icon name="icon-chevron-down" className={s.fieldChevron} />
      {open && (
        <ul className={s.fieldMenu} role="listbox">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`${s.fieldOption} ${o.value === value ? s.fieldOptionOn : ""}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className={s.fieldOptionLabel}>{o.label}</span>
                {o.value === value && <Icon name="icon-check" className={s.fieldCheck} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LocationCard({ loc, onAction, onOpen }) {
  const meta = typeMeta(loc.type);
  const status = STATUS_META[loc.status] || STATUS_META.not_started;
  const complete = loc.progress === 100 || loc.status === "healthy";

  return (
    <article className={s.card}>
      <button type="button" className={s.cardHead} onClick={() => onOpen?.(loc.id)} title={`Open ${loc.name}`}>
        <span className={`${s.cardIcon} ${meta.tint}`}><Icon name={meta.icon} /></span>
        <div className={s.cardHeadBody}>
          <div className={s.cardTitleRow}>
            <span className={s.cardName}>{loc.name}</span>
            <span className={`${s.badge} ${status.badge}`}>{status.label}</span>
          </div>
          <div className={s.cardSub}>{loc.sub && loc.sub !== loc.room ? `${loc.room} · ${loc.sub}` : loc.room}</div>
        </div>
      </button>

      {loc.empty ? (
        <div className={s.cardEmpty}>
          <span className={s.cardEmptyIcon}><Icon name="icon-clipboard" /></span>
          <span className={s.cardEmptyTitle}>{loc.empty.title}</span>
          <span className={s.cardEmptyText}>{loc.empty.text}</span>
        </div>
      ) : (
        <>
          <div className={s.cardStats}>
            {loc.stats.map((stat, i) => (
              <div className={s.miniStat} key={i}>
                <span className={`${s.miniIcon} ${TONE[stat.tone] || s.tSlate}`}><Icon name={stat.icon} /></span>
                <span className={s.miniValue}>{stat.value}</span>
                <span className={s.miniLabel}>{stat.label}</span>
              </div>
            ))}
          </div>

          {loc.note ? (
            <div className={s.attnNote}>
              <Icon name="icon-alert-triangle" />
              {loc.note}
            </div>
          ) : loc.progress != null ? (
            <div className={s.progress}>
              <span className={s.progressTrack}>
                <span className={`${s.progressFill} ${complete ? s.complete : ""}`} style={{ width: `${loc.progress}%` }} />
              </span>
              <span className={s.progressPct}>{loc.progress}%</span>
            </div>
          ) : null}

          {loc.updated && (
            <div className={s.cardFoot}>
              <div className={s.footMeta}>
                <span className={s.footMetaLabel}><Icon name="icon-clock" />{loc.status === "completed" ? "Last completed" : "Last updated"}</span>
                <span className={s.footMetaValue}>{loc.updated}</span>
              </div>
            </div>
          )}
        </>
      )}

      <div className={s.cardActions}>
        {loc.actions.map((a, i) => (
          <button
            key={i}
            type="button"
            className={`${s.btn} ${a.kind === "primary" ? s.btnPrimary : ""} ${a.kind === "danger" ? s.btnDanger : ""}`}
            onClick={() => onAction?.(a.action, loc)}
          >
            {a.icon && !a.iconRight ? <Icon name={a.icon} /> : null}
            {a.label}
            {a.icon && a.iconRight ? <Icon name={a.icon} /> : null}
          </button>
        ))}
      </div>
    </article>
  );
}

// Relative "x ago" for session timestamps; "" when absent/unparseable.
function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Map a real location into the board card's shape. Coverage is derived from the
// location's own evidence — tracked items, items needing attention, and when it
// was last scanned (max last_counted_at) — not from a scan session. No fabricated
// assignees or activity — only real numbers.
function toBoardCard(loc) {
  const meta = typeMeta(loc.type);
  const tracked = loc.item_count || 0;
  const attention = loc.needs_attention_count || 0;

  let status;
  if (attention > 0) status = "needs_attention";
  else if (tracked > 0) status = "healthy";
  else status = "not_started";

  return {
    id: loc.id,
    name: loc.name,
    type: loc.type,
    room: meta.label,
    status,
    stats: [
      { icon: "icon-package", value: tracked, label: "Tracked", tone: "blue" },
      { icon: "icon-alert-triangle", value: attention, label: "Needs attention", tone: attention ? "amber" : "slate" },
    ],
    progress: null,
    empty:
      status === "not_started"
        ? { title: "No items tracked yet", text: "Scan this location to capture its inventory." }
        : null,
    updated: relativeTime(loc.last_scanned_at),
    actions: [
      { label: tracked ? "Scan again" : "Scan", icon: "icon-scan", kind: "primary", action: "resume" },
      { label: "Open", icon: "icon-chevron-right", iconRight: true, action: "open" },
    ],
  };
}

export function LocationsBoardView({ onStartScan, onAddLocation, onOpenLocation, onNavigate, onToast }) {
  const [locations, setLocations] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [roomType, setRoomType] = useState("all");
  const [sort, setSort] = useState("attention");
  const [surface, setSurface] = useState("board");
  const [loadError, setLoadError] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // Mobile has no global nav, so the board needs an explicit way back to the
  // scan-first home (this is where Manage-locations / needs-attention / a
  // shelf-audit exit can land you).
  useEffect(() => { setIsMobile(window.matchMedia("(max-width: 767px)").matches); }, []);

  useEffect(() => {
    let alive = true;
    traceApi.listLocations()
      .then((l) => {
        if (!alive) return;
        setLocations(l.locations || []);
        setLoadError("");
      })
      .catch((err) => {
        if (!alive) return;
        setLocations([]);
        setLoadError(traceErrorMessage(err, "Couldn't load locations."));
      });
    return () => { alive = false; };
  }, []);

  const cards = useMemo(
    () => (locations || []).map((loc) => toBoardCard(loc)),
    [locations],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = cards.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q)) return false;
      if (status !== "all" && l.status !== status) return false;
      if (roomType !== "all" && l.type !== roomType) return false;
      return true;
    });
    if (sort === "name") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "attention") rows = [...rows].sort((a, b) => (b.status === "needs_attention" ? 1 : 0) - (a.status === "needs_attention" ? 1 : 0));
    return rows;
  }, [cards, query, status, roomType, sort]);

  const recentlyScanned = useMemo(
    () =>
      (locations || [])
        .filter((l) => l.last_scanned_at)
        .sort((a, b) => new Date(b.last_scanned_at) - new Date(a.last_scanned_at))
        .slice(0, 4)
        .map((l) => ({
          id: l.id,
          text: `${l.name} — ${l.item_count || 0} item${(l.item_count || 0) === 1 ? "" : "s"} tracked`,
          meta: relativeTime(l.last_scanned_at),
          icon: "icon-scan",
          tone: "blue",
        })),
    [locations],
  );

  const loading = locations === null;

  function handleCardAction(action, loc) {
    if (action === "resume") return onStartScan?.(loc.id);
    return onOpenLocation?.(loc.id);
  }

  function handleLayoutSaved(updated) {
    setLocations(updated);
    onToast?.("Office layout saved.");
  }

  return (
    <div className={s.board}>
      {isMobile && <MobileHeader onBack={() => onNavigate?.("/app")} />}
      <header className={s.head}>
        <h1 className={s.title}>Location Board</h1>
        <p className={s.subtitle}>
          Track rooms, cabinets, and scan coverage across the office. Start scanning, resolve issues, and monitor location health.
        </p>
      </header>

      <div className={s.toolbar}>
        {!isMobile && (
          <>
            <label className={s.search}>
              <Icon name="icon-search" />
              <input type="search" placeholder="Search locations…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search locations" />
            </label>
            <Select
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All statuses" },
                { value: "needs_attention", label: "Needs attention" },
                { value: "healthy", label: "Healthy" },
                { value: "not_started", label: "Not started" },
              ]}
            />
            <Select
              label="Room type"
              value={roomType}
              onChange={setRoomType}
              options={[
                { value: "all", label: "All room types" },
                { value: "operatory", label: "Operatory" },
                { value: "cabinet", label: "Cabinet" },
                { value: "sterilization", label: "Sterilization" },
                { value: "lab", label: "Lab" },
                { value: "storage", label: "Storage" },
                { value: "emergency_kit", label: "Emergency kit" },
              ]}
            />
            <Select
              label="Sort by"
              value={sort}
              onChange={setSort}
              options={[
                { value: "attention", label: "Needs attention" },
                { value: "name", label: "Name" },
              ]}
            />
          </>
        )}
        <div className={s.toolbarActions}>
          <div className={s.viewToggle} role="tablist" aria-label="Locations view">
            <button type="button" className={surface === "board" ? s.viewToggleActive : ""} onClick={() => setSurface("board")} role="tab" aria-selected={surface === "board"}>
              <Icon name="icon-grid" />
              Board
            </button>
            <button type="button" className={surface === "layout" ? s.viewToggleActive : ""} onClick={() => setSurface("layout")} role="tab" aria-selected={surface === "layout"}>
              <Icon name="icon-map-pin" />
              Layout
            </button>
          </div>
          <button type="button" className={s.addBtn} onClick={() => onAddLocation?.()}>
            <Icon name="icon-plus" />
            Add location
          </button>
          <button type="button" className={s.addBtn} onClick={() => onNavigate?.("/app/locations/qr-labels")}>
            <Icon name="icon-grid" />
            Print QR codes
          </button>
          <button type="button" className={s.addBtn} onClick={() => onNavigate?.("/app/locations/office-layout")}>
            <Icon name="icon-map-pin" />
            Office layout
          </button>
          <button type="button" className={s.scanBtn} onClick={() => onStartScan?.(null)}>
            <Icon name="icon-scan" />
            Start scan
          </button>
        </div>
      </div>

      {surface === "layout" ? (
        <OfficeLayoutView
          locations={locations || []}
          loading={loading}
          loadError={loadError}
          onAddLocation={onAddLocation}
          onLayoutSaved={handleLayoutSaved}
        />
      ) : (
        <div className={s.layout}>
          <div className={s.cards}>
            {loading ? (
              <div className={s.empty}>Loading locations…</div>
            ) : cards.length === 0 ? (
              <div className={s.empty}>No locations yet. Add your first location to start tracking inventory.</div>
            ) : visible.length === 0 ? (
              <div className={s.empty}>No locations match your filters.</div>
            ) : (
              visible.map((loc) => <LocationCard key={loc.id} loc={loc} onAction={handleCardAction} onOpen={onOpenLocation} />)
            )}
          </div>

          <aside className={s.rail}>
            {recentlyScanned.length > 0 && (
              <section className={s.railCard}>
                <h2 className={s.railTitle}>Recently scanned</h2>
                {recentlyScanned.map((ev) => (
                  <div className={s.activityRow} key={ev.id}>
                    <span className={`${s.activityIcon} ${TONE[ev.tone] || s.tSlate}`}><Icon name={ev.icon} /></span>
                    <div className={s.activityBody}>
                      <div className={s.activityText}>{ev.text}</div>
                      <div className={s.activityMeta}>{ev.meta}</div>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className={s.railCard}>
              <h2 className={s.railTitle}>Scan shortcuts</h2>
              <button type="button" className={s.shortcut} onClick={() => onStartScan?.(null)}>
                <span className={s.shortcutIcon}><Icon name="icon-map-pin" /></span>
                Choose a location to scan
                <Icon name="icon-chevron-right" className={s.shortcutChevron} />
              </button>
            </section>

            <section className={s.promo}>
              <span className={s.promoIcon}><Icon name="icon-scan" /></span>
              <div>
                <div className={s.promoTitle}>Scan on the go</div>
                <p className={s.promoText}>Scan on your phone to capture lot &amp; expiry off each package.</p>
              </div>
            </section>
          </aside>
        </div>
      )}

      <div className={s.tip}>
        <Icon name="icon-info" />
        <span><strong>Tip:</strong> Scanning captures lot &amp; expiry that isn&rsquo;t on any invoice — the data recall response and expiry alerts depend on.</span>
      </div>
    </div>
  );
}

// ── Add Location ──────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "cabinet", label: "Cabinet" },
  { value: "operatory", label: "Operatory" },
  { value: "sterilization", label: "Sterilization" },
  { value: "lab", label: "Lab" },
  { value: "storage", label: "Storage" },
  { value: "emergency_kit", label: "Emergency kit" },
  { value: "other", label: "Other" },
];

const PARENT_OPTIONS = ["Hygiene Room", "Operatory", "Sterilization Room", "Lab Room", "Storage Room", "Hallway"];

const USE_FOR = [
  { key: "qr", name: "QR labels", desc: "Generate QR labels for this location" },
  { key: "shelves", name: "Shelves", desc: "Organize items on shelves" },
  { key: "operatories", name: "Operatories", desc: "Track items used in operatories" },
  { key: "storage", name: "Storage", desc: "Store supplies and equipment" },
];

const ABOUT_ROWS = [
  { icon: "icon-grid", tint: s.tBlue, name: "QR Labels", text: "Generate and print QR labels for easy scanning." },
  { icon: "icon-archive-down", tint: s.tIndigo, name: "Shelves", text: "Organize and track items stored on shelves." },
  { icon: "icon-dental-chair", tint: s.tTeal, name: "Operatories", text: "Track items used in treatment operatories." },
  { icon: "icon-package", tint: s.tSlate, name: "Storage", text: "Store and manage supplies and equipment." },
];

export function AddLocationView({ onCancel, onSaved, onToast }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [parent, setParent] = useState("");
  const [description, setDescription] = useState("");
  const [useFor, setUseFor] = useState({});
  const [parLevel, setParLevel] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [saving, setSaving] = useState(false);

  const typeLabel = TYPE_OPTIONS.find((t) => t.value === type)?.label || "";
  const selectedUse = USE_FOR.filter((u) => useFor[u.key]);

  function toggleUse(key) {
    setUseFor((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Only name / type / notes have backend fields today; the rest of the form
  // (parent, use-for, par/low-stock, image) is captured visually for later phases.
  async function handleSave() {
    if (!name.trim()) return onToast?.("Add a location name first.");
    if (!type) return onToast?.("Pick a location type first.");
    setSaving(true);
    try {
      await traceApi.createLocation({ name: name.trim(), type, notes: description.trim() || null });
      onToast?.(`Location "${name.trim()}" saved.`);
      onSaved?.();
    } catch (err) {
      setSaving(false);
      onToast?.(traceErrorMessage(err, "Couldn't save the location — please try again."));
    }
  }

  return (
    <div className={s.add}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        <button type="button" className={s.crumbLink} onClick={() => onCancel?.()}>Locations</button>
        <span className={s.crumbSep}>/</span>
        <span className={s.crumbCurrent}>Add Location</span>
      </nav>

      <header className={s.head}>
        <h1 className={s.title}>Add Location</h1>
        <p className={s.subtitle}>Add a new location to organize and track inventory, scan sessions, and supplies.</p>
      </header>

      <div className={s.addGrid}>
        <div className={s.panel}>
          <section className={s.section}>
            <h2 className={s.panelTitle}>Location details</h2>

            <div className={s.formRow}>
              <label className={s.formField}>
                <span className={s.label}>Location name <span className={s.req}>*</span></span>
                <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Hygiene Cabinet" />
              </label>
              <label className={s.formField}>
                <span className={s.label}>Location type <span className={s.req}>*</span></span>
                <div className={s.selectWrap}>
                  <select className={s.select} value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="">Select location type</option>
                    {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <Icon name="icon-chevron-down" className={s.selectChevron} />
                </div>
              </label>
            </div>

            <label className={s.formField}>
              <span className={s.label}>Parent location <Icon name="icon-info" /></span>
              <div className={s.selectWrap}>
                <select className={s.select} value={parent} onChange={(e) => setParent(e.target.value)}>
                  <option value="">Select parent location (optional)</option>
                  {PARENT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <Icon name="icon-chevron-down" className={s.selectChevron} />
              </div>
            </label>

            <label className={s.formField}>
              <span className={s.label}>Description (optional)</span>
              <textarea
                className={s.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                placeholder="Add notes about this location…"
                maxLength={200}
              />
              <span className={s.counter}>{description.length} / 200</span>
            </label>
          </section>

          <section className={s.section}>
            <h2 className={s.panelTitle}>Setup &amp; configuration</h2>

            <div className={s.formField}>
              <span className={s.label}>Use for <Icon name="icon-info" /></span>
              <div className={s.useGrid}>
                {USE_FOR.map((u) => {
                  const checked = Boolean(useFor[u.key]);
                  return (
                    <button
                      type="button"
                      key={u.key}
                      className={`${s.useItem} ${checked ? s.useChecked : ""}`}
                      onClick={() => toggleUse(u.key)}
                      aria-pressed={checked}
                    >
                      <span className={s.useCheck}>{checked ? <Icon name="icon-check" /> : null}</span>
                      <span className={s.useBody}>
                        <span className={s.useName}>{u.name}</span>
                        <span className={s.useDesc}>{u.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={s.formRow}>
              <label className={s.formField}>
                <span className={s.label}>Default par level <Icon name="icon-info" /></span>
                <div className={s.suffixWrap}>
                  <input className={s.suffixInput} value={parLevel} onChange={(e) => setParLevel(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Enter par level" inputMode="numeric" />
                  <span className={s.suffix}>boxes</span>
                </div>
              </label>
              <label className={s.formField}>
                <span className={s.label}>Low stock threshold <Icon name="icon-info" /></span>
                <div className={s.suffixWrap}>
                  <input className={s.suffixInput} value={lowStock} onChange={(e) => setLowStock(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Enter low stock threshold" inputMode="numeric" />
                  <span className={s.suffix}>boxes</span>
                </div>
              </label>
            </div>

            <div className={s.formField}>
              <span className={s.label}>Location image (optional)</span>
              <div className={s.drop}>
                <span className={s.dropIcon}><Icon name="icon-image" /></span>
                <div className={s.dropBody}>
                  <div className={s.dropTitle}>Upload image</div>
                  <div className={s.dropHint}>PNG, JPG up to 5MB</div>
                </div>
                <label className={s.browse}>
                  Browse files
                  <input type="file" accept="image/png,image/jpeg" hidden onChange={() => onToast?.("Image upload lands in an upcoming phase.")} />
                </label>
              </div>
            </div>
          </section>

          <div className={s.panelFoot}>
            <button type="button" className={s.ghostBtn} onClick={() => onCancel?.()}>Cancel</button>
            <button type="button" className={s.saveBtn} onClick={handleSave} disabled={saving}>
              <Icon name="icon-check" />
              {saving ? "Saving…" : "Save location"}
            </button>
          </div>
        </div>

        <aside className={s.side}>
          <section className={s.panel}>
            <h2 className={s.panelTitle}>Location preview</h2>
            <div className={s.previewHead}>
              <span className={s.previewAvatar}><Icon name="icon-map-pin" /></span>
              <div>
                <div className={s.previewName}>{name.trim() || "New location"}</div>
                <span className={s.previewBadge}>New location</span>
              </div>
            </div>
            <div className={`${s.previewType} ${typeLabel ? "" : s.muted}`}>
              <Icon name="icon-map-pin" />
              {typeLabel || "Location type will appear here"}
            </div>
            <div className={s.previewUseLabel}>Use for:</div>
            <div className={s.chips}>
              {(selectedUse.length ? selectedUse : USE_FOR).map((u) => (
                <span key={u.key} className={`${s.chip} ${selectedUse.length ? s.chipActive : ""}`}>{u.name}</span>
              ))}
            </div>
          </section>

          <section className={s.panel}>
            <h2 className={s.panelTitle}>About locations</h2>
            <p className={s.aboutLede}>Locations help you organize and track inventory more efficiently across your practice.</p>
            {ABOUT_ROWS.map((r) => (
              <div className={s.aboutRow} key={r.name}>
                <span className={`${s.aboutIcon} ${r.tint}`}><Icon name={r.icon} /></span>
                <div className={s.aboutBody}>
                  <div className={s.aboutName}>{r.name}</div>
                  <div className={s.aboutText}>{r.text}</div>
                </div>
              </div>
            ))}
            <button type="button" className={s.railLink} onClick={() => onToast?.("Docs coming soon.")}>
              Learn more about locations
              <Icon name="icon-arrow-right" />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── Location Detail ───────────────────────────────────────────────────

const PILL_TONE = { red: s.badgeRed, amber: s.badgeAmber, green: s.badgeGreen, blue: s.badgeBlue, slate: s.badgeSlate };

// Client-side fallback for the lot lifecycle when the API didn't send one
// (it normally does): a human-confirmed pull wins, then the expiry date drives
// expired → expiring → active. Mirrors deriveLifecycle on the backend.
function deriveLifecycleClient(it) {
  if (it.pulled_at) return "pulled";
  const d = daysUntil(it.expiration_date);
  if (d != null && d <= 0) return "expired";
  if (d != null && d <= 30) return "expiring";
  return "active";
}

// Honest per-item status from the lot lifecycle (active/expiring/expired/pulled).
// No par-based "reorder" here — reorder timing is the reorder ladder's job, not a
// census. An expired-but-unpulled lot is the loudest state: "Pull now".
function isUnidentified(it) {
  return !it.canonical_product_id && !it.supplier_product_id;
}

function itemStatus(it) {
  const lc = it.lifecycle || deriveLifecycleClient(it);
  if (lc === "pulled") return { label: "Pulled", tone: "slate" };
  // An unidentified scan can't be trusted until it's linked to a product — the
  // loudest actionable state alongside an expired lot.
  if (isUnidentified(it)) return { label: "Unidentified", tone: "red" };
  if (lc === "expired") return { label: "Pull now", tone: "red" };
  if (lc === "expiring") return { label: "Expiring soon", tone: "amber" };
  if (!it.lot_number || !it.expiration_date) return { label: "Needs details", tone: "amber" };
  return { label: "Active", tone: "green" };
}

// Canonical status key for the Status filter — mirrors itemStatus's branches.
function statusKey(it) {
  const lc = it.lifecycle || deriveLifecycleClient(it);
  if (lc === "pulled") return "pulled";
  if (isUnidentified(it)) return "unidentified";
  if (lc === "expired") return "expired";
  if (lc === "expiring") return "expiring";
  if (!it.lot_number || !it.expiration_date) return "needs_details";
  return "active";
}

// Price range across known supplier offers for this item's matched product — the
// same cross-supplier comparison the catalog shows, joined onto each lot by
// canonical_product_id. Renders only when the backend supplies a price range (an
// unmatched or price-less item shows "—"), never fabricated. Prices are cents.
function formatPriceRange(it) {
  const range = it.price_range_cents;
  if (!range) return null;
  const { lowest, highest } = range;
  if (lowest == null && highest == null) return null;
  if (lowest != null && highest != null && lowest !== highest) {
    return `${money.format(lowest / 100)}–${money.format(highest / 100)}`;
  }
  return money.format((lowest ?? highest) / 100);
}

// Per-row kebab for the items table: a single "Remove item" action that deletes
// the lot-at-location record (a mis-scan or wrong item). Self-contained so each
// row owns its own open state + outside-click handling, the same pattern as the
// table-header kebab and the Select dropdowns.
function RowActions({ onRemove, onPull, onIdentify }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={s.rowKebabWrap} ref={ref}>
      <button
        type="button"
        className={`${s.rowKebab} ${open ? s.rowKebabOpen : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Item actions"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="icon-more-vertical" />
      </button>
      {open && (
        <ul className={s.rowMenu} role="menu">
          {onIdentify && (
            <li role="none">
              <button type="button" role="menuitem" className={s.headMenuItem} onClick={() => { setOpen(false); onIdentify(); }}>
                <Icon name="icon-link" />Identify product
              </button>
            </li>
          )}
          {onPull && (
            <li role="none">
              <button type="button" role="menuitem" className={s.headMenuItem} onClick={() => { setOpen(false); onPull(); }}>
                <Icon name="icon-check-circle" />Mark pulled
              </button>
            </li>
          )}
          <li role="none">
            <button type="button" role="menuitem" className={`${s.headMenuItem} ${s.headMenuDanger}`} onClick={() => { setOpen(false); onRemove(); }}>
              <Icon name="icon-trash" />Remove item
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

// Swipe a review row left to reveal a Remove action (matches the reorder list +
// the old scan-session review). The front layer rides on .revRow and translates
// under the thumb; the red Remove sits flush to the screen edge. Ported from the
// pre-consolidation MobileScanSession so the phone's location review keeps the
// exact look + gesture it had before.
function SwipeRow({ onRemove, children }) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  function onTouchStart(event) {
    const touch = event.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    dragging.current = true;
    moved.current = false;
  }
  function onTouchMove(event) {
    if (!dragging.current) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = touch.clientY - startY.current;
    if (!moved.current && Math.abs(deltaX) < Math.abs(deltaY)) { dragging.current = false; return; }
    if (Math.abs(deltaX) > 6) moved.current = true;
    const base = open ? -SWIPE_REVEAL : 0;
    setDx(Math.min(0, Math.max(-SWIPE_REVEAL, base + deltaX)));
  }
  function onTouchEnd() {
    if (!dragging.current && !moved.current) return;
    dragging.current = false;
    const shouldOpen = dx <= -SWIPE_REVEAL / 2;
    setOpen(shouldOpen);
    setDx(shouldOpen ? -SWIPE_REVEAL : 0);
  }
  function onClickCapture(event) {
    if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false; }
  }

  return (
    <div className={`${rs.swipeWrap} ${open ? rs.swipeOpen : ""}`}>
      <button
        type="button"
        className={rs.swipeRemove}
        tabIndex={open ? 0 : -1}
        aria-label="Remove item"
        onClick={() => { setOpen(false); setDx(0); onRemove(); }}
      >
        <Icon name="icon-trash-ios" />
        <span>Remove</span>
      </button>
      <div
        className={rs.revRow}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClickCapture}
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? "none" : "transform .2s ease" }}
      >
        {children}
      </div>
    </div>
  );
}

// One collapsible review band (Needs review / Missing details / Confirmed) with a
// colored title carrying the inline count, matching the pre-consolidation design.
function ReviewGroup({ tone, icon, title, count, red, defaultOpen = true, forceOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!count) return null;
  // A search in progress expands every group so matches aren't hidden inside a
  // collapsed band; clearing the search restores the user's own toggle state.
  const isOpen = forceOpen || open;
  return (
    <section className={`${rs.section} ${red ? rs.sectionRed : ""}`}>
      <button type="button" className={rs.secHead} onClick={() => setOpen((v) => !v)} aria-expanded={isOpen}>
        <span className={`${rs.secHeadIcon} ${tone}`}><Icon name={icon} /></span>
        <span className={`${rs.secTitle} ${tone}`}>{title} ({count})</span>
        <span className={`${rs.secToggle} ${isOpen ? rs.secToggleOpen : ""}`}><Icon name="icon-chevron-down" /></span>
      </button>
      {isOpen && <div className={rs.revList}>{children}</div>}
    </section>
  );
}

// What's missing on an identified-but-incomplete lot, for the amber result pill.
function missingHint(it) {
  if (!it.lot_number && !it.expiration_date) return "Add lot & expiry";
  if (!it.expiration_date) return "Add expiration";
  if (!it.lot_number) return "Add lot";
  return "Add details";
}

// Right-docked Product / Lot Detail drawer — the location surface's counterpart
// to the reorder match panel, rendered through the same shared DetailDrawer shell
// so the two surfaces share one drawer setup. Mirrors the "Product / Lot Detail"
// wireframe: identity + capture status chips, a lifecycle ladder, a lot-fact
// grid, an identify section for unlinked scans, and an activity timeline. Fields
// the backend can't supply yet (received date, supplier-on-lot, full history)
// show an honest placeholder rather than fabricated data.
function ProductLotDrawer({ item, location, onClose, onIdentifyPick, onSaveLot, onPull, onRemove, onNavigate, onToast }) {
  const { query, setQuery, results, loading } = useProductSearch(true);
  const st = itemStatus(item);
  const lc = item.lifecycle || deriveLifecycleClient(item);
  const unidentified = isUnidentified(item);
  const price = formatPriceRange(item);

  // Editable lot + expiry — the traceability fields a scan often misses, so they
  // can be corrected here (the loudest case is a "Needs details" / Needs Attention
  // item). PATCHes the same evidence record the scanner's post-scan drawer writes.
  const expInput = item.expiration_date ? item.expiration_date.slice(0, 10) : "";
  const [lot, setLot] = useState(item.lot_number || "");
  const [exp, setExp] = useState(expInput);
  const [savingLot, setSavingLot] = useState(false);
  const lotDirty = lot.trim() !== (item.lot_number || "") || exp !== expInput;
  async function saveLot() {
    setSavingLot(true);
    try {
      await onSaveLot?.(item, { lot_number: lot.trim() || null, expiration_date: exp || null });
      onToast?.("Lot & expiry updated");
    } catch {
      onToast?.("Couldn't update lot & expiry.");
    }
    setSavingLot(false);
  }

  const chips = [
    { label: unidentified ? "Unidentified" : "Identified", ok: !unidentified },
    { label: item.lot_number ? "Lot captured" : "Lot missing", ok: Boolean(item.lot_number) },
    { label: item.expiration_date ? "Expiry captured" : "Expiry missing", ok: Boolean(item.expiration_date) },
  ];

  const LIFECYCLE = [
    { key: "active", label: "Active" },
    { key: "expiring", label: "Expiring soon" },
    { key: "expired", label: "Expired" },
    { key: "pulled", label: "Pulled" },
  ];

  const facts = [
    { label: "Est. quantity", value: item.quantity_on_hand ?? 0 },
    { label: "Price range", value: price || "—" },
    { label: "Last scanned", value: item.last_counted_at ? formatTraceDate(item.last_counted_at) : "—" },
    { label: "Location", value: location?.name || "—" },
    { label: "Received", value: "—", stub: true },
    { label: "Supplier", value: "—", stub: true },
  ];

  const footer = (
    <>
      <button className="crl-ghost-btn" type="button" onClick={onClose}>Close</button>
      {lc === "expired" && (
        <button className={s.drawerPull} type="button" onClick={() => { onPull?.(item); onClose(); }}>Mark pulled</button>
      )}
      <button className="primary-action compact" type="button" onClick={() => onToast?.("Label printing lands in an upcoming phase.")}>Print label</button>
    </>
  );

  return (
    <DetailDrawer
      label="Product / lot detail"
      title={item.name || "Unidentified item"}
      subtitle={[item.lot_number ? `Lot ${item.lot_number}` : null, location?.name].filter(Boolean).join(" · ") || "Scanned item"}
      onClose={onClose}
      footer={footer}
    >
      <div className={s.lotMedia}>
        <ProductThumb image={item.image_url || item.photo_url} alt={item.name} />
      </div>

      <section className="crl-drawer-section">
        <div className={s.lotChips}>
          {chips.map((c) => (
            <span key={c.label} className={`${s.lotChip} ${c.ok ? s.lotChipOk : s.lotChipWarn}`}>
              <Icon name={c.ok ? "icon-check-circle" : "icon-alert-triangle"} />{c.label}
            </span>
          ))}
        </div>
      </section>

      <section className="crl-drawer-section">
        <span className="crl-drawer-label">Lifecycle</span>
        <div className={s.lifecycle}>
          {LIFECYCLE.map((stage) => (
            <span key={stage.key} className={`${s.lifeStage} ${stage.key === lc ? s.lifeStageOn : ""}`}>{stage.label}</span>
          ))}
        </div>
        <div className={s.lotStatusLine}>Current status <span className={`${s.badge} ${PILL_TONE[st.tone]}`}>{st.label}</span></div>
      </section>

      <section className="crl-drawer-section">
        <span className="crl-drawer-label">Lot &amp; expiry</span>
        <p className="crl-drawer-hint">Correct the lot number or expiration captured for this item.</p>
        <div className={s.lotEdit}>
          <label className={s.lotField}>
            <span>Lot number</span>
            <input type="text" value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. 20240118" />
          </label>
          <label className={s.lotField}>
            <span>Expiration</span>
            <input type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
          </label>
        </div>
        <button type="button" className={s.lotSave} onClick={saveLot} disabled={savingLot || !lotDirty}>
          {savingLot ? "Saving…" : "Save lot & expiry"}
        </button>
      </section>

      <section className="crl-drawer-section">
        <span className="crl-drawer-label">Lot details</span>
        <div className={s.lotGrid}>
          {facts.map((f) => (
            <div key={f.label} className={s.lotFact}>
              <span className={s.lotFactLabel}>{f.label}</span>
              <span className={`${s.lotFactValue} ${f.stub || f.value === "—" ? s.tMuted : ""}`}>{f.value}</span>
            </div>
          ))}
        </div>
      </section>

      {unidentified ? (
        <section className="crl-drawer-section">
          <span className="crl-drawer-label">Identify this item</span>
          <p className="crl-drawer-hint">Link this scan to a catalog product to price it and start its compliance record.</p>
          <label className="crl-search crl-drawer-search">
            <Icon name="icon-search" className="button-icon" />
            <input type="search" placeholder="Search the catalog…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </label>
          <ProductSearchResults query={query} results={results} loading={loading} onPick={onIdentifyPick} emptyHint="Type a product name to link it." />
        </section>
      ) : item.canonical_product_id ? (
        <section className="crl-drawer-section">
          <button type="button" className="crl-drawer-link" onClick={() => onNavigate?.(`/app/product/${item.canonical_product_id}`)}>
            <Icon name="icon-arrow-right" className="button-icon" />View this product in the catalog
          </button>
        </section>
      ) : null}

      <section className="crl-drawer-section">
        <span className="crl-drawer-label">Activity</span>
        <div className={s.timeline}>
          {item.last_counted_at && (
            <div className={s.timeEvent}>
              <span className={s.timeDot} />
              <div className={s.timeBody}>
                <span className={s.timeText}>Scanned at {location?.name || "this location"}</span>
                <span className={s.timeMeta}>{relativeTime(item.last_counted_at) || formatTraceDate(item.last_counted_at)}</span>
              </div>
            </div>
          )}
          <div className={s.timeEmpty}>Full scan &amp; evidence history lands in an upcoming phase.</div>
        </div>
      </section>

      <section className="crl-drawer-section">
        <button type="button" className={s.drawerRemove} onClick={() => { onRemove?.(item); onClose(); }}>
          <Icon name="icon-trash" />Remove this item
        </button>
      </section>
    </DetailDrawer>
  );
}

export function LocationDetailView({ locationId, onBack, onStartScan, onToast, onNavigate }) {
  const [location, setLocation] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [traceFilter, setTraceFilter] = useState("all");
  const [identify, setIdentify] = useState(null); // unidentified item linked via the mobile review modal
  const [selected, setSelected] = useState(null); // item whose desktop lot-detail drawer is open
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set());
  const selectAllRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close the table-header menu on outside-click or Escape (same pattern as the
  // Select dropdowns and the topbar menus).
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKeyDown = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!locationId) return undefined;
    let alive = true;
    setLoading(true);
    traceApi.getLocation(locationId)
      .then((data) => {
        if (!alive) return;
        setLocation(data.location || null);
        setItems(data.items || []);
        setLoading(false);
      })
      .catch(() => { if (alive) { setLoading(false); onToast?.("Couldn't load this location."); } });
    return () => { alive = false; };
    // Re-fetch only when the location changes — not when the toast callback's
    // identity changes (it's redefined every parent render, which would re-fetch
    // on every toast and clobber a client-side clear of the list).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // Live updates: while this location is open and the tab is visible, re-fetch
  // every 3s so items scanned on a phone (Receiving or Shelf Audit, both write
  // last_counted_at) surface here on their own — the same live-propagation
  // cadence the reorder list uses. Sorting by last_counted_at floats each fresh
  // scan to the top as it lands. No loading flip, so the table never flickers.
  useEffect(() => {
    if (!locationId) return undefined;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      traceApi.getLocation(locationId)
        .then((data) => { setLocation(data.location || null); setItems(data.items || []); })
        .catch(() => {});
    };
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
  }, [locationId]);

  const top = useMemo(() => {
    const active = items.filter((it) => !it.pulled_at);
    const traced = items.filter((it) => it.lot_number && it.expiration_date).length;
    const expiring = active.filter((it) => (it.lifecycle || deriveLifecycleClient(it)) === "expiring").length;
    const expired = active.filter((it) => (it.lifecycle || deriveLifecycleClient(it)) === "expired").length;
    return { traced, expiring, expired };
  }, [items]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items.filter((it) => {
      if (q && !`${it.name || ""} ${it.lot_number || ""}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && statusKey(it) !== statusFilter) return false;
      const traced = Boolean(it.lot_number && it.expiration_date);
      if (traceFilter === "captured" && !traced) return false;
      if (traceFilter === "missing" && traced) return false;
      return true;
    });
    // Most recently scanned first, so a fresh phone scan pops to the top of the
    // list the moment the poll picks it up. Items never counted sort last.
    return [...rows].sort((a, b) => {
      const ta = a.last_counted_at ? new Date(a.last_counted_at).getTime() : 0;
      const tb = b.last_counted_at ? new Date(b.last_counted_at).getTime() : 0;
      return tb - ta;
    });
  }, [items, query, statusFilter, traceFilter]);

  const pullItems = useMemo(
    () => items.filter((it) => !it.pulled_at && (it.lifecycle || deriveLifecycleClient(it)) === "expired"),
    [items],
  );

  useEffect(() => {
    setSelectedItemIds((prev) => {
      if (!prev.size) return prev;
      const live = new Set(items.map((it) => it.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const visibleItemIds = useMemo(() => visibleItems.map((it) => it.id), [visibleItems]);
  const selectedItems = useMemo(() => items.filter((it) => selectedItemIds.has(it.id)), [items, selectedItemIds]);
  const selectedVisibleCount = visibleItemIds.filter((id) => selectedItemIds.has(id)).length;
  const allVisibleSelected = visibleItemIds.length > 0 && selectedVisibleCount === visibleItemIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < visibleItemIds.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  if (loading) return <div className={s.detail}><div className={s.empty}>Loading location…</div></div>;
  if (!location) return <div className={s.detail}><div className={s.empty}>Location not found.</div></div>;

  const meta = typeMeta(location.type);
  const attention = location.needs_attention_count ?? top.expired + top.expiring;
  const status = attention > 0 ? STATUS_META.needs_attention : items.length ? STATUS_META.healthy : STATUS_META.not_started;
  const tracePct = items.length ? Math.round((top.traced / items.length) * 100) : 0;
  const reload = () => traceApi.getLocation(locationId)
    .then((d) => { setLocation(d.location || null); setItems(d.items || []); })
    .catch(() => {});
  const onPull = async (it) => {
    try { await traceApi.pull(it.id, { reason: "manual" }); onToast?.(`Marked pulled — ${it.name}`); reload(); }
    catch { onToast?.("Couldn't mark pulled."); }
  };
  // Remove a single inventory record (a mis-scan or wrong item). Optimistically
  // drop it from the list; the 3s poll reconciles. Like Clear list, this deletes
  // the evidence record on the backend.
  const onRemove = async (it) => {
    try {
      await traceApi.removeItem(it.id);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      setSelectedItemIds((prev) => {
        if (!prev.has(it.id)) return prev;
        const next = new Set(prev);
        next.delete(it.id);
        return next;
      });
      onToast?.(`Removed — ${it.name}`);
    } catch {
      onToast?.("Couldn't remove the item.");
    }
  };
  // Link a catalog product to an unidentified scan, then re-derive its status.
  // Shared by the mobile review modal (onIdentifyPick, reads `identify`) and the
  // desktop lot drawer (onDrawerIdentify, reads `selected`).
  const identifyItem = async (target, product) => {
    if (!target) return;
    const best = product.best_offer || product.offers?.[0] || null;
    const id = product.id || "";
    try {
      await traceApi.updateItem(target.id, {
        canonical_product_id: id.startsWith("mcp") ? id : null,
        supplier_product_id: best?.supplier_product_id || (id.startsWith("msp") ? id : null),
        name: product.name,
      });
      onToast?.(`Identified — ${product.name}`);
      reload();
    } catch {
      onToast?.("Couldn't identify that item.");
    }
  };
  const onIdentifyPick = async (product) => { const target = identify; setIdentify(null); await identifyItem(target, product); };
  const onDrawerIdentify = async (product) => { const target = selected; setSelected(null); await identifyItem(target, product); };
  // Save a lot/expiry correction from the drawer: PATCH, then merge into the open
  // item so its chips/lifecycle re-derive, and refresh the table. Throws on failure
  // so the drawer can surface its own toast.
  const onSaveLot = async (it, patch) => {
    await traceApi.updateItem(it.id, patch);
    setSelected((prev) => (prev && prev.id === it.id ? { ...prev, ...patch } : prev));
    reload();
  };
  // "Clear list" permanently deletes every item captured here. It's a real
  // backend wipe (not a view-only blank), so it sticks and syncs to every device
  // — otherwise the 3s poll just restores everything. Gate it behind a confirm.
  const handleClearList = () => {
    setMenuOpen(false);
    if (!items.length) return;
    setConfirmingClear(true);
  };
  const toggleItemSelection = (id) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleVisibleSelection = () => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleItemIds.forEach((id) => next.delete(id));
      else visibleItemIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const handleBulkDelete = () => {
    if (!selectedItemIds.size) return;
    setMenuOpen(false);
    setConfirmingBulkDelete(true);
  };
  const confirmClearList = async () => {
    setConfirmingClear(false);
    setItems([]); // optimistic; reload reconciles from the now-empty backend
    setSelectedItemIds(new Set());
    try {
      await traceApi.clearLocationItems(locationId);
      onToast?.("List cleared.");
      reload();
    } catch {
      onToast?.("Couldn't clear the list.");
      reload();
    }
  };
  const confirmBulkDelete = async () => {
    const deleteItems = selectedItems;
    const deleteIds = deleteItems.map((it) => it.id);
    setConfirmingBulkDelete(false);
    setItems((prev) => prev.filter((it) => !deleteIds.includes(it.id)));
    setSelectedItemIds(new Set());
    const results = await Promise.allSettled(deleteIds.map((id) => traceApi.removeItem(id)));
    const removed = results.filter((result) => result.status === "fulfilled").length;
    if (removed === deleteIds.length) {
      onToast?.(`Deleted ${removed} item${removed === 1 ? "" : "s"}.`);
    } else {
      onToast?.(removed ? `Deleted ${removed} of ${deleteIds.length} items.` : "Couldn't delete the selected items.");
      reload();
    }
  };

  // Phone surface: the scan review the scanner exits to — full-screen, grouped
  // into Needs review / Missing details / Confirmed. Restores the look + gesture
  // of the pre-consolidation MobileScanSession review, now derived live from the
  // location's own items (no scan session) and reusing its CSS module.
  if (isMobile) {
    // visibleItems is the recency-sorted full list here (no mobile filters), so
    // fresh phone scans float to the top of each group as they land.
    const review = visibleItems.filter((it) => isUnidentified(it));
    const needDetails = visibleItems.filter((it) => !isUnidentified(it) && (!it.lot_number || !it.expiration_date));
    const confirmed = visibleItems.filter((it) => !isUnidentified(it) && it.lot_number && it.expiration_date);
    const PILL = { green: rs.pillGreen, amber: rs.pillAmber, red: rs.pillRed, slate: rs.pillAmber };

    const thumb = (it, fallbackIcon) => (
      <span className={rs.revThumb}>
        {it.image_url || it.photo_url ? <img src={it.image_url || it.photo_url} alt="" /> : <Icon name={fallbackIcon} />}
      </span>
    );

    const q = query.trim();
    return (
      <div className={`${rs.screen} ${rs.reviewScroll}`}>
        <header className={`${rs.topbar} ${rs.reviewTopbar}`}>
          <button type="button" className={rs.iconBtn} onClick={() => onBack?.()} aria-label="Back to locations"><Icon name="icon-chevron-left" /></button>
          <div className={s.mTitleStack}>
            <span className={rs.barTitle}>{location.name}</span>
            <span className={s.mTitleSub}>{meta.label} · {items.length} item{items.length === 1 ? "" : "s"}</span>
          </div>
        </header>

        <div className={`${rs.body} ${rs.reviewBodyScroll}`}>
          {items.length > 0 && (
            <label className={s.mSearchBar}>
              <Icon name="icon-search" />
              <input type="search" placeholder="Search items or lots…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search items" />
            </label>
          )}

          {items.length === 0 ? (
            <div className={rs.banner}><Icon name="icon-info" /> Nothing scanned here yet. Tap “Scan this location” below to capture it.</div>
          ) : visibleItems.length === 0 ? (
            <div className={rs.banner}><Icon name="icon-info" /> No items match “{q}”.</div>
          ) : (
            <>
              <ReviewGroup tone={rs.txRed} icon="icon-alert-triangle" title="Needs review" count={review.length} red forceOpen={Boolean(q)}>
                {review.map((it) => (
                  <SwipeRow key={it.id} onRemove={() => onRemove(it)}>
                    {thumb(it, "icon-alert-triangle")}
                    <div className={rs.revBody}>
                      <span className={rs.revName}>{it.name || it.barcode || "Unidentified item"}</span>
                      <span className={rs.revMeta}>{it.barcode ? `Barcode ${it.barcode}` : "No catalog match"}</span>
                      <span className={rs.revLoc}><Icon name="icon-map-pin" /> {location.name}</span>
                    </div>
                    <button type="button" className={rs.revBtn} onClick={() => setIdentify(it)}>Review</button>
                  </SwipeRow>
                ))}
              </ReviewGroup>

              <ReviewGroup tone={rs.txAmber} icon="icon-clock" title="Missing details" count={needDetails.length} forceOpen={Boolean(q)}>
                {needDetails.map((it) => (
                  <SwipeRow key={it.id} onRemove={() => onRemove(it)}>
                    {thumb(it, "icon-clock")}
                    <div className={rs.revBody}>
                      <span className={rs.revName}>{it.name}</span>
                      <span className={rs.revMeta}>{it.lot_number ? `Lot ${it.lot_number}` : "No lot"}</span>
                    </div>
                    <div className={rs.revRight}>
                      <span className={`${rs.resultPill} ${rs.pillAmber}`}>{missingHint(it)}</span>
                    </div>
                  </SwipeRow>
                ))}
              </ReviewGroup>

              <ReviewGroup tone={rs.txGreen} icon="icon-check-circle" title="Confirmed" count={confirmed.length} defaultOpen={confirmed.length <= 8} forceOpen={Boolean(q)}>
                {confirmed.map((it) => {
                  const st = itemStatus(it);
                  return (
                    <SwipeRow key={it.id} onRemove={() => onRemove(it)}>
                      {thumb(it, "icon-check-circle")}
                      <div className={rs.revBody}>
                        <span className={rs.revName}>{it.name}</span>
                        <span className={rs.revMeta}>Lot {it.lot_number} · Exp {formatExpiryDate(it.expiration_date)}</span>
                      </div>
                      <span className={`${rs.resultPill} ${PILL[st.tone] || rs.pillGreen}`}>
                        {st.tone === "green" ? <Icon name="icon-check-circle" /> : null}{st.label}
                      </span>
                    </SwipeRow>
                  );
                })}
              </ReviewGroup>
            </>
          )}
        </div>

        <div className={`${rs.footer} ${rs.reviewFooter}`}>
          <button type="button" className={rs.btnPrimary} style={{ flex: 1 }} onClick={() => onStartScan?.()}><Icon name="icon-scan" /> Scan this location</button>
        </div>

        {identify && (
          <IdentifyModal item={identify} onClose={() => setIdentify(null)} onPick={onIdentifyPick} />
        )}
      </div>
    );
  }

  return (
    <div className={s.detail}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        <button type="button" className={s.crumbLink} onClick={() => onBack?.()}>Locations</button>
        <span className={s.crumbSep}>/</span>
        <span className={s.crumbCurrent}>{location.name}</span>
      </nav>

      <header className={s.head}>
        <h1 className={s.title}>{location.name}</h1>
        <p className={s.subtitle}>Inventory, traceability coverage, and reorder needs for this location.</p>
      </header>

      <div className={s.detailGrid}>
        <div className={s.detailMain}>
          <section className={s.locHeader}>
            <div className={s.locHeadMain}>
              <span className={`${s.cardIcon} ${meta.tint}`}><Icon name={meta.icon} /></span>
              <div className={s.locHeadBody}>
                <div className={s.cardTitleRow}>
                  <span className={s.locHeadName}>{location.name}</span>
                  <span className={`${s.badge} ${status.badge}`}>{status.label}</span>
                </div>
                <div className={s.cardSub}>{meta.label}{location.qr_code ? ` · ${location.qr_code}` : ""}</div>
              </div>
            </div>

            <div className={s.locProgress}>
              {items.length ? (
                <>
                  <span className={s.locProgressLabel}>Traceability captured</span>
                  <div className={s.progress}>
                    <span className={s.progressTrack}>
                      <span className={`${s.progressFill} ${tracePct === 100 ? s.complete : ""}`} style={{ width: `${tracePct}%` }} />
                    </span>
                    <span className={s.progressPct}>{tracePct}%</span>
                  </div>
                  <div className={s.locMeta}>
                    <span className={s.locMetaItem}><Icon name="icon-package" />Tracked<small>{items.length}</small></span>
                    <span className={s.locMetaItem}><Icon name="icon-clock" />Last scan<small>{relativeTime(location.last_scanned_at) || "—"}</small></span>
                  </div>
                </>
              ) : (
                <div className={s.locNoScan}>
                  <span className={s.locNoScanIcon}><Icon name="icon-scan" /></span>
                  <div>
                    <div className={s.locNoScanTitle}>Nothing scanned yet</div>
                    <div className={s.locNoScanSub}>Scan to capture lot &amp; expiry off each package.</div>
                  </div>
                </div>
              )}
            </div>

            <div className={s.locActions}>
              <div className={s.qrCard}>
                <div className={s.qrCode}>
                  <QRCodeSVG value={scanUrlFor(location)} size={104} level="M" fgColor="#0f172a" bgColor="#ffffff" />
                </div>
                <div className={s.qrCaption}>
                  <div className={s.qrCaptionTitle}>Scan this location</div>
                  <div className={s.qrCaptionSub}>Point your phone&rsquo;s camera here to open the scanner.</div>
                </div>
              </div>
              <button type="button" className={s.addBtn} onClick={() => onNavigate?.("/app/locations/qr-labels")}>
                <Icon name="icon-grid" />Print QR label
              </button>
            </div>
          </section>

          <section className={s.panel}>
            <h2 className={s.panelTitle}>Items in this location</h2>
            <div className={s.itemsToolbar}>
              <div className={s.itemsSearch}>
                <Icon name="icon-search" />
                <input type="search" placeholder="Search items or lots…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search items or lots" />
              </div>
              <Select
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "unidentified", label: "Unidentified" },
                  { value: "active", label: "Active" },
                  { value: "expiring", label: "Expiring soon" },
                  { value: "expired", label: "Expired" },
                  { value: "needs_details", label: "Needs details" },
                  { value: "pulled", label: "Pulled" },
                ]}
              />
              <Select
                label="Lot & expiry"
                value={traceFilter}
                onChange={setTraceFilter}
                options={[
                  { value: "all", label: "All items" },
                  { value: "captured", label: "Captured" },
                  { value: "missing", label: "Missing" },
                ]}
              />
              <button type="button" className={s.filterBtn} onClick={() => onToast?.("Advanced filters are coming soon.")}>
                <Icon name="icon-filter" />Filters
              </button>
              {selectedItemIds.size > 0 && (
                <div className={s.bulkActions} aria-live="polite">
                  <span>{selectedItemIds.size} selected</span>
                  <button type="button" className={s.bulkClearBtn} onClick={() => setSelectedItemIds(new Set())}>Clear</button>
                  <button type="button" className={s.bulkDeleteBtn} onClick={handleBulkDelete}>
                    <Icon name="icon-trash" />Delete
                  </button>
                </div>
              )}
              {items.length > 0 && (
                <div className={s.headKebabWrap} ref={menuRef}>
                  <button
                    type="button"
                    className={`${s.headKebab} ${menuOpen ? s.headKebabOpen : ""}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="List actions"
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    <Icon name="icon-more-vertical" />
                  </button>
                  {menuOpen && (
                    <ul className={s.headMenu} role="menu">
                      <li role="none">
                        <button type="button" role="menuitem" className={`${s.headMenuItem} ${s.headMenuDanger}`} onClick={handleClearList}>
                          <Icon name="icon-trash" />Clear list
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className={s.empty}>No items captured here yet. Scan this location to build its inventory.</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.selectCell}>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          disabled={visibleItemIds.length === 0}
                          onChange={toggleVisibleSelection}
                          aria-label={allVisibleSelected ? "Deselect visible items" : "Select visible items"}
                        />
                      </th>
                      <th>Item</th><th>SDS</th><th>Expiration</th><th>Lot</th><th>Price</th><th>Status</th><th>Last scanned</th><th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((it) => {
                      const st = itemStatus(it);
                      const lc = it.lifecycle || deriveLifecycleClient(it);
                      const price = formatPriceRange(it);
                      const rowSelected = selectedItemIds.has(it.id);
                      return (
                        <tr
                          key={it.id}
                          className={`${rowSelected ? s.rowSelected : ""} ${selected?.id === it.id ? s.rowActive : ""}`}
                          onClick={() => setSelected(it)}
                          title="Open lot detail"
                        >
                          <td className={s.selectCell} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={rowSelected}
                              onChange={() => toggleItemSelection(it.id)}
                              aria-label={`Select ${it.name || "item"}`}
                            />
                          </td>
                          <td>
                            <div className={s.tItemCell}>
                              <ProductThumb image={it.image_url || it.photo_url} alt={it.name} />
                              <span className={s.tItemLink}>{it.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={s.sdsCheck} title="SDS on file"><Icon name="icon-check-circle" /></span>
                          </td>
                          <td className={it.expiration_date ? "" : s.tMuted}>{it.expiration_date ? formatExpiryDate(it.expiration_date) : "—"}</td>
                          <td className={s.tMuted}>{it.lot_number || "—"}</td>
                          <td className={price ? "" : s.tMuted}>{price || "—"}</td>
                          <td>
                            <span className={`${s.badge} ${PILL_TONE[st.tone]}`}>{st.label}</span>
                          </td>
                          <td className={s.tMuted}>{it.last_counted_at ? formatTraceDate(it.last_counted_at) : "—"}</td>
                          <td className={s.actionsCell} onClick={(e) => e.stopPropagation()}>
                            <RowActions
                              onRemove={() => onRemove(it)}
                              onPull={lc === "expired" ? () => onPull(it) : undefined}
                              onIdentify={isUnidentified(it) ? () => setSelected(it) : undefined}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {selected ? (
          <ProductLotDrawer
            key={selected.id}
            item={selected}
            location={location}
            onClose={() => setSelected(null)}
            onIdentifyPick={onDrawerIdentify}
            onSaveLot={onSaveLot}
            onPull={onPull}
            onRemove={onRemove}
            onNavigate={onNavigate}
            onToast={onToast}
          />
        ) : (
        <aside className={s.detailRail}>
          <section className={s.railCard}>
            <h2 className={s.railTitle}>Issues in this location</h2>
            <div className={s.issueRow}>
              <span className={`${s.issueIcon} ${TONE_TEXT.red}`}><Icon name="icon-alert-triangle" /></span>
              <span className={s.issueLabel}>Expired (pull now)</span>
              <span className={s.issueValue}>{top.expired}</span>
            </div>
            <div className={s.issueRow}>
              <span className={`${s.issueIcon} ${TONE_TEXT.amber}`}><Icon name="icon-clock" /></span>
              <span className={s.issueLabel}>Expiring soon</span>
              <span className={s.issueValue}>{top.expiring}</span>
            </div>
            <div className={s.issueRow}>
              <span className={`${s.issueIcon} ${TONE_TEXT.amber}`}><Icon name="icon-info" /></span>
              <span className={s.issueLabel}>Missing lot / expiry</span>
              <span className={s.issueValue}>{items.length - top.traced}</span>
            </div>
          </section>

          <section className={s.railCard}>
            <div className={s.reorderHead}>
              <div>
                <div className={s.railTitle}>Needs pulling</div>
                <small className={s.tMuted}>{pullItems.length} expired lot{pullItems.length === 1 ? "" : "s"} still on the shelf</small>
              </div>
            </div>
            {pullItems.length === 0 ? (
              <small className={s.tMuted}>Nothing expired to pull here.</small>
            ) : (
              pullItems.slice(0, 6).map((it) => (
                <div className={s.reorderRow} key={it.id}>
                  <span className={s.reorderName}>{it.name}</span>
                  <button type="button" className={s.pullBtn} onClick={() => onPull(it)}>Mark pulled</button>
                </div>
              ))
            )}
          </section>

          <section className={s.railCard}>
            <h2 className={s.railTitle}>Scan shortcuts</h2>
            <button type="button" className={s.shortcut} onClick={() => onStartScan?.()}>
              <span className={s.shortcutIcon}><Icon name="icon-scan" /></span>Scan this location<Icon name="icon-chevron-right" className={s.shortcutChevron} />
            </button>
            <button type="button" className={s.shortcut} onClick={() => onBack?.()}>
              <span className={s.shortcutIcon}><Icon name="icon-map-pin" /></span>Choose another location<Icon name="icon-chevron-right" className={s.shortcutChevron} />
            </button>
          </section>
        </aside>
        )}
      </div>

      {confirmingClear && (
        <ConfirmModal
          title="Clear this location’s list?"
          body={`This permanently deletes all ${items.length} item${items.length === 1 ? "" : "s"} captured at ${location.name}, on every device. This can’t be undone.`}
          confirmLabel="Clear list"
          destructive
          onConfirm={confirmClearList}
          onClose={() => setConfirmingClear(false)}
        />
      )}

      {confirmingBulkDelete && (
        <ConfirmModal
          title="Delete selected items?"
          body={`This permanently deletes ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"} from ${location.name}, on every device. This can’t be undone.`}
          confirmLabel="Delete selected"
          destructive
          onConfirm={confirmBulkDelete}
          onClose={() => setConfirmingBulkDelete(false)}
        />
      )}

      {identify && (
        <IdentifyModal item={identify} onClose={() => setIdentify(null)} onPick={onIdentifyPick} />
      )}
    </div>
  );
}
