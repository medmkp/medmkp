"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { daysUntil, formatTraceDate, traceApi, traceErrorMessage } from "./lib";
import { ProductThumb } from "./ui";
import s from "./locations.module.css";

// Locations surface: the Location Board (real per-practice locations with scan
// coverage), the Add Location form (creates a real location), and the per-
// location Detail (real inventory + scan entry). Scan coverage is rolled from
// the location's scan sessions; inventory comes from the Phase-1 backend.

// Per room-type icon + tint, mirroring the office-layout editor's vocabulary.
const TYPE_META = {
  operatory: { icon: "icon-dental-chair", tint: s.tBlue, label: "Operatory" },
  cabinet: { icon: "icon-cabinet", tint: s.tIndigo, label: "Cabinet" },
  sterilization: { icon: "icon-shield-check", tint: s.tTeal, label: "Sterilization" },
  lab: { icon: "icon-microscope", tint: s.tViolet, label: "Lab" },
  storage: { icon: "icon-package", tint: s.tSlate, label: "Storage" },
  emergency_kit: { icon: "icon-alert-triangle", tint: s.tRed, label: "Emergency kit" },
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

function Stat({ icon, tint, label, value, meta }) {
  return (
    <div className={s.stat}>
      <span className={`${s.statIcon} ${tint}`}><Icon name={icon} /></span>
      <div className={s.statBody}>
        <span className={s.statLabel}>{label}</span>
        <strong className={s.statValue}>{value}</strong>
        {meta ? <span className={s.statMeta}>{meta}</span> : null}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      <select className={s.fieldSelect} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Icon name="icon-chevron-down" className={s.fieldChevron} />
    </label>
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
          <div className={s.cardSub}>{loc.room}{loc.sub ? ` · ${loc.sub}` : ` · ${meta.label}`}</div>
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

// Map a real location + its latest scan session into the board card's shape.
// Scan coverage (scanned/confirmed/needs-*) comes from the session; when a
// location has never been scanned we show its tracked-item + needs-attention
// rollups instead. No fabricated assignees or activity — only real numbers.
function toBoardCard(loc, session) {
  const c = session?.counts;
  const scanned = c?.scanned || 0;
  const meta = typeMeta(loc.type);

  let status;
  if (session?.status === "active") status = "in_progress";
  else if (session?.status === "completed") status = "completed";
  else if ((loc.needs_attention_count || 0) > 0) status = "needs_attention";
  else if ((loc.item_count || 0) > 0) status = "healthy";
  else status = "not_started";

  const stats = session
    ? [
        { icon: "icon-scan", value: scanned, label: "Scanned", tone: "blue" },
        { icon: "icon-check-circle", value: c.confirmed || 0, label: "Confirmed", tone: "green" },
        { icon: "icon-clock", value: c.needs_details || 0, label: "Need details", tone: "amber" },
        { icon: "icon-alert-triangle", value: c.needs_review || 0, label: "Need review", tone: "red" },
      ]
    : [
        { icon: "icon-package", value: loc.item_count || 0, label: "Tracked", tone: "blue" },
        { icon: "icon-alert-triangle", value: loc.needs_attention_count || 0, label: "Needs attention", tone: (loc.needs_attention_count || 0) ? "amber" : "slate" },
      ];

  const resumeLabel = session?.status === "active" ? "Resume scan" : "Start scan";
  return {
    id: loc.id,
    name: loc.name,
    type: loc.type,
    room: meta.label,
    status,
    stats,
    progress: session ? (scanned ? Math.round(((c.confirmed || 0) / scanned) * 100) : 0) : null,
    empty:
      status === "not_started"
        ? { title: "No items tracked yet", text: "Start a scan session to capture this location's inventory." }
        : null,
    updated: session ? relativeTime(session.updated_at) : "",
    actions: [
      { label: resumeLabel, icon: "icon-scan", kind: "primary", action: "resume" },
      { label: "Open", icon: "icon-chevron-right", iconRight: true, action: "open" },
    ],
  };
}

export function LocationsBoardView({ onStartScan, onAddLocation, onOpenLocation, onToast }) {
  const [locations, setLocations] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [roomType, setRoomType] = useState("all");
  const [sort, setSort] = useState("attention");

  useEffect(() => {
    let alive = true;
    Promise.all([
      traceApi.listLocations().catch(() => ({ locations: [] })),
      traceApi.listSessions().catch(() => ({ sessions: [] })),
    ]).then(([l, sx]) => {
      if (!alive) return;
      setLocations(l.locations || []);
      setSessions(sx.sessions || []);
    });
    return () => { alive = false; };
  }, []);

  // Latest session per location (the API returns sessions newest-first).
  const latestByLocation = useMemo(() => {
    const map = new Map();
    for (const sess of sessions) if (!map.has(sess.location_id)) map.set(sess.location_id, sess);
    return map;
  }, [sessions]);

  const cards = useMemo(
    () => (locations || []).map((loc) => toBoardCard(loc, latestByLocation.get(loc.id))),
    [locations, latestByLocation],
  );

  const stats = useMemo(() => {
    const list = locations || [];
    const total = list.length || 1;
    const inProgress = sessions.filter((x) => x.status === "active").length;
    const completed = sessions.filter((x) => x.status === "completed").length;
    const needAttention = list.filter((l) => (l.needs_attention_count || 0) > 0).length;
    return {
      total: list.length,
      inProgress,
      inProgressPct: Math.round((inProgress / total) * 100),
      needAttention,
      needAttentionPct: Math.round((needAttention / total) * 100),
      completed,
    };
  }, [locations, sessions]);

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

  const activity = useMemo(
    () =>
      sessions.slice(0, 4).map((sess) => ({
        id: sess.id,
        text: `${sess.location_name || "Location"} — ${sess.status === "active" ? "scan in progress" : "scan completed"}`,
        meta: relativeTime(sess.updated_at),
        icon: sess.status === "active" ? "icon-scan" : "icon-check-circle",
        tone: sess.status === "active" ? "blue" : "green",
      })),
    [sessions],
  );

  const lastActive = sessions.find((x) => x.status === "active");
  const loading = locations === null;

  function handleCardAction(action, loc) {
    if (action === "resume") return onStartScan?.(loc.id);
    return onOpenLocation?.(loc.id);
  }

  return (
    <div className={s.board}>
      <header className={s.head}>
        <h1 className={s.title}>Location Board</h1>
        <p className={s.subtitle}>
          Track rooms, cabinets, and scan coverage across the office. Start or resume a scan session, resolve issues, and monitor location health.
        </p>
      </header>

      <div className={s.stats}>
        <Stat icon="icon-map-pin" tint={s.tBlue} label="Total locations" value={stats.total} />
        <Stat icon="icon-clock" tint={s.tBlue} label="Scans in progress" value={stats.inProgress} meta={`${stats.inProgressPct}% of locations`} />
        <Stat icon="icon-alert-triangle" tint={s.tAmber} label="Need attention" value={stats.needAttention} meta={`${stats.needAttentionPct}% of locations`} />
        <Stat icon="icon-check-circle" tint={s.tGreen} label="Sessions completed" value={stats.completed} />
      </div>

      <div className={s.toolbar}>
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
            { value: "in_progress", label: "In progress" },
            { value: "completed", label: "Completed" },
            { value: "needs_attention", label: "Needs attention" },
            { value: "not_started", label: "Not started" },
            { value: "healthy", label: "Healthy" },
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
        <div className={s.toolbarActions}>
          <button type="button" className={s.addBtn} onClick={() => onAddLocation?.()}>
            <Icon name="icon-plus" />
            Add location
          </button>
          <button type="button" className={s.scanBtn} onClick={() => onStartScan?.(null)}>
            <Icon name="icon-scan" />
            Start scan session
          </button>
        </div>
      </div>

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
          {activity.length > 0 && (
            <section className={s.railCard}>
              <h2 className={s.railTitle}>Recent scan activity</h2>
              {activity.map((ev) => (
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
            <button
              type="button"
              className={s.shortcut}
              onClick={() => (lastActive ? onStartScan?.(lastActive.location_id) : onToast?.("No scan session to resume."))}
            >
              <span className={s.shortcutIcon}><Icon name="icon-scan" /></span>
              {lastActive ? `Resume ${lastActive.location_name || "last session"}` : "Resume last session"}
              <Icon name="icon-chevron-right" className={s.shortcutChevron} />
            </button>
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
              <p className={s.promoText}>Open a scan session on your phone to capture lot &amp; expiry off each package.</p>
            </div>
          </section>
        </aside>
      </div>

      <div className={s.tip}>
        <Icon name="icon-info" />
        <span><strong>Tip:</strong> A scan session captures lot &amp; expiry that isn&rsquo;t on any invoice — the data recall response and expiry alerts depend on.</span>
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

// Honest per-item status, derived from real inventory fields (no fabricated
// evidence/savings). Expiry first, then par, then missing traceability.
function itemStatus(it) {
  const d = daysUntil(it.expiration_date);
  if (d != null && d <= 0) return { label: "Expired", tone: "red" };
  if (d != null && d <= 30) return { label: "Expiring soon", tone: "amber" };
  if (it.par_level != null && (it.quantity_on_hand ?? 0) <= it.par_level) return { label: "Reorder", tone: "red" };
  if (!it.lot_number || !it.expiration_date) return { label: "Needs details", tone: "amber" };
  return { label: "OK", tone: "green" };
}

export function LocationDetailView({ locationId, onBack, onStartScan, onToast, onNavigate }) {
  const [location, setLocation] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!locationId) return undefined;
    let alive = true;
    setLoading(true);
    traceApi.getLocation(locationId)
      .then((data) => { if (!alive) return; setLocation(data.location || null); setItems(data.items || []); setLoading(false); })
      .catch(() => { if (alive) { setLoading(false); onToast?.("Couldn't load this location."); } });
    return () => { alive = false; };
  }, [locationId, onToast]);

  const top = useMemo(() => {
    const traced = items.filter((it) => it.lot_number && it.expiration_date).length;
    const expiring = items.filter((it) => { const d = daysUntil(it.expiration_date); return d != null && d <= 30; }).length;
    const reorder = items.filter((it) => it.par_level != null && (it.quantity_on_hand ?? 0) <= it.par_level).length;
    return { tracked: items.length, traced, expiring, reorder };
  }, [items]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((it) => (it.name || "").toLowerCase().includes(q)) : items;
  }, [items, query]);

  const reorderItems = useMemo(
    () => items.filter((it) => it.par_level != null && (it.quantity_on_hand ?? 0) <= it.par_level),
    [items],
  );

  if (loading) return <div className={s.detail}><div className={s.empty}>Loading location…</div></div>;
  if (!location) return <div className={s.detail}><div className={s.empty}>Location not found.</div></div>;

  const meta = typeMeta(location.type);
  const attention = location.needs_attention_count ?? top.reorder + top.expiring;
  const status = attention > 0 ? STATUS_META.needs_attention : items.length ? STATUS_META.healthy : STATUS_META.not_started;
  const tracePct = items.length ? Math.round((top.traced / items.length) * 100) : 0;

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

      <div className={s.stats}>
        <Stat icon="icon-package" tint={s.tBlue} label="Tracked items" value={top.tracked} />
        <Stat icon="icon-shield-check" tint={s.tGreen} label="Lot &amp; expiry captured" value={`${tracePct}%`} />
        <Stat icon="icon-clock" tint={s.tAmber} label="Expiring soon" value={top.expiring} />
        <Stat icon="icon-alert-triangle" tint={s.tRed} label="At / below par" value={top.reorder} />
      </div>

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

        <div className={s.locActions}>
          <button type="button" className={s.scanBtn} onClick={() => onStartScan?.()}><Icon name="icon-scan" />Scan this location</button>
        </div>
      </section>

      <div className={s.detailGrid}>
        <div className={s.detailMain}>
          <section className={s.panel}>
            <h2 className={s.panelTitle}>Items in this location</h2>
            <div className={s.toolbar}>
              <label className={s.search}>
                <Icon name="icon-search" />
                <input type="search" placeholder="Search items…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search items" />
              </label>
            </div>

            {items.length === 0 ? (
              <div className={s.empty}>No items captured here yet. Start a scan session to build this location&rsquo;s inventory.</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Item</th><th>On hand</th><th>Par</th><th>Lot</th><th>Expiration</th><th>Status</th><th>Last counted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((it) => {
                      const st = itemStatus(it);
                      const below = it.par_level != null && (it.quantity_on_hand ?? 0) <= it.par_level;
                      return (
                        <tr key={it.id}>
                          <td>
                            <div className={s.tItemCell}>
                              <ProductThumb image={it.photo_url} alt={it.name} />
                              {it.canonical_product_id ? (
                                <button type="button" className={s.tItemLink} onClick={() => onNavigate?.(`/app/product/${it.canonical_product_id}`)} title="View this product in the catalog">{it.name}</button>
                              ) : <span className={s.tItem}>{it.name}</span>}
                            </div>
                          </td>
                          <td><span className={below ? s.tdRed : ""}>{it.quantity_on_hand ?? 0}</span></td>
                          <td className={s.tMuted}>{it.par_level ?? "—"}</td>
                          <td className={s.tMuted}>{it.lot_number || "—"}</td>
                          <td className={it.expiration_date ? "" : s.tMuted}>{it.expiration_date ? formatTraceDate(it.expiration_date) : "—"}</td>
                          <td><span className={`${s.badge} ${PILL_TONE[st.tone]}`}>{st.label}</span></td>
                          <td className={s.tMuted}>{it.last_counted_at ? formatTraceDate(it.last_counted_at) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className={s.detailRail}>
          <section className={s.railCard}>
            <h2 className={s.railTitle}>Issues in this location</h2>
            <div className={s.issueRow}>
              <span className={`${s.issueIcon} ${TONE_TEXT.red}`}><Icon name="icon-alert-triangle" /></span>
              <span className={s.issueLabel}>Expiring / expired</span>
              <span className={s.issueValue}>{top.expiring}</span>
            </div>
            <div className={s.issueRow}>
              <span className={`${s.issueIcon} ${TONE_TEXT.amber}`}><Icon name="icon-info" /></span>
              <span className={s.issueLabel}>Missing lot / expiry</span>
              <span className={s.issueValue}>{items.length - top.traced}</span>
            </div>
            <div className={s.issueRow}>
              <span className={`${s.issueIcon} ${TONE_TEXT.red}`}><Icon name="icon-package" /></span>
              <span className={s.issueLabel}>At / below par</span>
              <span className={s.issueValue}>{top.reorder}</span>
            </div>
          </section>

          <section className={s.railCard}>
            <div className={s.reorderHead}>
              <div>
                <div className={s.railTitle}>Reorder needs</div>
                <small className={s.tMuted}>{reorderItems.length} item{reorderItems.length === 1 ? "" : "s"} at or below par</small>
              </div>
            </div>
            {reorderItems.length === 0 ? (
              <small className={s.tMuted}>Nothing needs reordering here.</small>
            ) : (
              reorderItems.slice(0, 6).map((it) => (
                <div className={s.reorderRow} key={it.id}>
                  <span className={s.reorderName}>{it.name}</span>
                  <span className={s.tMuted}>{it.quantity_on_hand ?? 0} / {it.par_level}</span>
                </div>
              ))
            )}
            <button type="button" className={s.railPrimary} onClick={() => onToast?.("Reorder drafts arrive with Forecasting.")}><Icon name="icon-cart" />Create reorder draft</button>
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
      </div>
    </div>
  );
}
