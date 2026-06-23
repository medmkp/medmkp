"use client";

import { useMemo, useState } from "react";
import { Icon } from "./icons";
import s from "./locations.module.css";

// Locations surface: the Location Board (room/cabinet scan coverage) and the
// Add Location form. Self-contained — both render off the MOCK below so the
// parent can drop them in and swap `data` for real practice data later. The
// scan-session richness (per-location scanned/confirmed counts, progress, recent
// activity) isn't in the Phase-1 backend yet, so it's mock for now.

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

const BOARD_MOCK = {
  stats: {
    total: 12,
    rooms: 5,
    inProgress: 3,
    inProgressPct: 25,
    needAttention: 5,
    needAttentionPct: 42,
    completed: 7,
    completedLocations: 4,
  },
  locations: [
    {
      id: "loc_hyg",
      name: "Hygiene Cabinet",
      room: "Hygiene Room",
      type: "cabinet",
      status: "in_progress",
      stats: [
        { icon: "icon-scan", value: 37, label: "Scanned", tone: "blue" },
        { icon: "icon-check-circle", value: 29, label: "Confirmed", tone: "green" },
        { icon: "icon-clock", value: 6, label: "Need details", tone: "amber" },
        { icon: "icon-alert-triangle", value: 2, label: "Need review", tone: "red" },
      ],
      progress: 78,
      updated: "2 min ago",
      assignee: "Alex Kim",
      actions: [
        { label: "Resume scan", icon: "icon-scan", kind: "primary", action: "resume" },
        { label: "Open board", icon: "icon-chevron-right", iconRight: true, action: "open" },
      ],
    },
    {
      id: "loc_op1",
      name: "Operatory 1",
      room: "Operatory",
      sub: "Treatment Room",
      type: "operatory",
      status: "in_progress",
      stats: [
        { icon: "icon-scan", value: 24, label: "Scanned", tone: "blue" },
        { icon: "icon-check-circle", value: 21, label: "Confirmed", tone: "green" },
        { icon: "icon-clock", value: 3, label: "Need details", tone: "amber" },
        { icon: "icon-alert-triangle", value: 1, label: "Need review", tone: "red" },
      ],
      progress: 81,
      updated: "18 min ago",
      assignee: "Hannah Lee",
      actions: [
        { label: "Resume scan", icon: "icon-scan", kind: "primary", action: "resume" },
        { label: "Open board", icon: "icon-chevron-right", iconRight: true, action: "open" },
      ],
    },
    {
      id: "loc_steri",
      name: "Sterilization",
      room: "Sterilization Room",
      sub: "Equipment",
      type: "sterilization",
      status: "completed",
      stats: [
        { icon: "icon-scan", value: 48, label: "Scanned", tone: "blue" },
        { icon: "icon-check-circle", value: 48, label: "Confirmed", tone: "green" },
        { icon: "icon-check-circle", value: 0, label: "Unresolved", tone: "slate" },
      ],
      progress: 100,
      updated: "Verified today",
      updatedAt: "9:30 AM",
      assignee: "Jamie Lee",
      actions: [{ label: "View board", icon: "icon-chevron-right", iconRight: true, action: "open" }],
    },
    {
      id: "loc_kit",
      name: "Emergency Kit",
      room: "Hallway",
      sub: "Emergency Supplies",
      type: "emergency_kit",
      status: "needs_attention",
      stats: [
        { icon: "icon-scan", value: 12, label: "Tracked", tone: "blue" },
        { icon: "icon-clock", value: 2, label: "Expiring soon", tone: "amber" },
        { icon: "icon-shield-check", value: 1, label: "Missing proof", tone: "violet" },
      ],
      note: "3 issues require review",
      updated: "Updated 32 min ago",
      assignee: "Alex Kim",
      actions: [{ label: "Review issues", icon: "icon-chevron-right", iconRight: true, kind: "danger", action: "review" }],
    },
    {
      id: "loc_lab",
      name: "Lab",
      room: "Lab Room",
      sub: "Work Area",
      type: "lab",
      status: "not_started",
      empty: {
        title: "No scan session started yet",
        text: "Start a mobile scan to track inventory and monitor this location.",
      },
      actions: [{ label: "Start scan", icon: "icon-scan", action: "resume" }],
    },
    {
      id: "loc_storage",
      name: "Storage",
      room: "Storage Room",
      sub: "Supplies",
      type: "storage",
      status: "healthy",
      stats: [
        { icon: "icon-scan", value: 18, label: "Scanned", tone: "blue" },
        { icon: "icon-check-circle", value: 17, label: "Confirmed", tone: "green" },
        { icon: "icon-alert-triangle", value: 1, label: "Low-stock issue", tone: "amber" },
      ],
      progress: 94,
      updated: "25 min ago",
      assignee: "Hannah Lee",
      actions: [{ label: "Open board", icon: "icon-chevron-right", iconRight: true, action: "open" }],
    },
  ],
  activity: [
    { id: 1, text: "Hygiene Cabinet resumed", meta: "2 min ago · Alex Kim", icon: "icon-scan", tone: "blue" },
    { id: 2, text: "Sterilization completed", meta: "14 min ago · Jamie Lee", icon: "icon-check-circle", tone: "green" },
    { id: 3, text: "Emergency Kit flagged for review", meta: "32 min ago · System", icon: "icon-alert-triangle", tone: "amber" },
    { id: 4, text: "Operatory 1 session saved", meta: "1 hr ago · Hannah Lee", icon: "icon-scan", tone: "blue" },
  ],
};

function initials(name) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

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
          ) : (
            <div className={s.progress}>
              <span className={s.progressTrack}>
                <span className={`${s.progressFill} ${complete ? s.complete : ""}`} style={{ width: `${loc.progress}%` }} />
              </span>
              <span className={s.progressPct}>{loc.progress}%</span>
            </div>
          )}

          <div className={s.cardFoot}>
            <div className={s.footMeta}>
              <span className={s.footMetaLabel}><Icon name="icon-clock" />{loc.status === "completed" ? "Verified" : "Last updated"}</span>
              <span className={s.footMetaValue}>{loc.updatedAt ? `${loc.updated.replace("Verified ", "")} ${loc.updatedAt}` : loc.updated}</span>
            </div>
            <div className={s.assignee}>
              <div className={s.assigneeMeta}>
                <span className={s.footMetaLabel}>Assigned to</span>
                <span className={s.footMetaValue}>{loc.assignee}</span>
              </div>
              <span className={`${s.avatar} ${loc.status === "completed" ? s.avatarGreen : ""}`}>{initials(loc.assignee)}</span>
            </div>
          </div>
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

export function LocationsBoardView({ data = BOARD_MOCK, onStartScan, onAddLocation, onOpenLocation, onToast }) {
  const { stats, locations, activity } = data;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [roomType, setRoomType] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [sort, setSort] = useState("updated");

  const assignees = useMemo(
    () => Array.from(new Set(locations.map((l) => l.assignee).filter(Boolean))),
    [locations],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = locations.filter((l) => {
      if (q && !(`${l.name} ${l.room} ${l.sub || ""}`.toLowerCase().includes(q))) return false;
      if (status !== "all" && l.status !== status) return false;
      if (roomType !== "all" && l.type !== roomType) return false;
      if (assignee !== "all" && l.assignee !== assignee) return false;
      return true;
    });
    if (sort === "name") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "attention") rows = [...rows].sort((a, b) => (b.status === "needs_attention" ? 1 : 0) - (a.status === "needs_attention" ? 1 : 0));
    return rows;
  }, [locations, query, status, roomType, assignee, sort]);

  const tellSoon = () => onToast?.("Scan sessions land in an upcoming phase.");

  function handleCardAction(action, loc) {
    if (action === "resume") return (onStartScan ? onStartScan() : tellSoon());
    if (action === "open" || action === "review") return onOpenLocation?.(loc.id);
    tellSoon();
  }

  return (
    <div className={s.board}>
      <header className={s.head}>
        <h1 className={s.title}>Location Board</h1>
        <p className={s.subtitle}>
          Track rooms, cabinets, and scan coverage across the office. Resume mobile scan sessions, resolve issues, and monitor location health.
        </p>
      </header>

      <div className={s.stats}>
        <Stat icon="icon-map-pin" tint={s.tBlue} label="Total locations" value={stats.total} meta={`Across ${stats.rooms} rooms`} />
        <Stat icon="icon-clock" tint={s.tBlue} label="In progress" value={stats.inProgress} meta={`${stats.inProgressPct}% of locations`} />
        <Stat icon="icon-alert-triangle" tint={s.tAmber} label="Need attention" value={stats.needAttention} meta={`${stats.needAttentionPct}% of locations`} />
        <Stat icon="icon-check-circle" tint={s.tGreen} label="Completed this week" value={stats.completed} meta={`Across ${stats.completedLocations} locations`} />
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
          label="Assignee"
          value={assignee}
          onChange={setAssignee}
          options={[{ value: "all", label: "All assignees" }, ...assignees.map((a) => ({ value: a, label: a }))]}
        />
        <Select
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            { value: "updated", label: "Last updated" },
            { value: "name", label: "Name" },
            { value: "attention", label: "Needs attention" },
          ]}
        />
        <div className={s.toolbarActions}>
          <button type="button" className={s.addBtn} onClick={() => onAddLocation?.()}>
            <Icon name="icon-plus" />
            Add location
          </button>
          <button type="button" className={s.scanBtn} onClick={() => (onStartScan ? onStartScan() : tellSoon())}>
            <Icon name="icon-scan" />
            Start mobile scan
          </button>
        </div>
      </div>

      <div className={s.layout}>
        <div className={s.cards}>
          {visible.length === 0 ? (
            <div className={s.empty}>No locations match your filters.</div>
          ) : (
            visible.map((loc) => <LocationCard key={loc.id} loc={loc} onAction={handleCardAction} onOpen={onOpenLocation} />)
          )}
        </div>

        <aside className={s.rail}>
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
            <button type="button" className={s.railLink} onClick={tellSoon}>
              View all activity
              <Icon name="icon-arrow-right" />
            </button>
          </section>

          <section className={s.railCard}>
            <h2 className={s.railTitle}>Mobile scan shortcuts</h2>
            <button type="button" className={s.shortcut} onClick={() => (onStartScan ? onStartScan() : tellSoon())}>
              <span className={s.shortcutIcon}><Icon name="icon-scan" /></span>
              Resume last session
              <Icon name="icon-chevron-right" className={s.shortcutChevron} />
            </button>
            <button type="button" className={s.shortcut} onClick={tellSoon}>
              <span className={s.shortcutIcon}><Icon name="icon-map-pin" /></span>
              Choose location
              <Icon name="icon-chevron-right" className={s.shortcutChevron} />
            </button>
            <button type="button" className={s.shortcut} onClick={tellSoon}>
              <span className={s.shortcutIcon}><Icon name="icon-grid" /></span>
              Print QR labels
              <Icon name="icon-chevron-right" className={s.shortcutChevron} />
            </button>
          </section>

          <section className={s.promo}>
            <span className={s.promoIcon}><Icon name="icon-scan" /></span>
            <div>
              <div className={s.promoTitle}>Scan on the go</div>
              <p className={s.promoText}>Use the TraceDDS mobile app to scan items and sync instantly.</p>
              <button type="button" className={s.railLink} onClick={tellSoon}>
                Learn more
                <Icon name="icon-arrow-right" />
              </button>
            </div>
          </section>
        </aside>
      </div>

      <div className={s.tip}>
        <Icon name="icon-info" />
        <span><strong>Tip:</strong> Use mobile scanning to keep your locations accurate and up to date.</span>
        <button type="button" className={s.tipLink} onClick={tellSoon}>
          Learn how scanning works
          <Icon name="icon-arrow-right" />
        </button>
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

export function AddLocationView({ onCancel, onSave, onToast }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [parent, setParent] = useState("");
  const [description, setDescription] = useState("");
  const [useFor, setUseFor] = useState({});
  const [parLevel, setParLevel] = useState("");
  const [lowStock, setLowStock] = useState("");

  const typeLabel = TYPE_OPTIONS.find((t) => t.value === type)?.label || "";
  const selectedUse = USE_FOR.filter((u) => useFor[u.key]);

  function toggleUse(key) {
    setUseFor((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    if (!name.trim()) return onToast?.("Add a location name first.");
    if (!type) return onToast?.("Pick a location type first.");
    onSave?.({ name: name.trim(), type, parent, notes: description });
    onToast?.(`Location "${name.trim()}" saved.`);
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
            <button type="button" className={s.saveBtn} onClick={handleSave}>
              <Icon name="icon-check" />
              Save location
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

// Representative per-location detail. The clicked location's identity (name,
// room, type, status, progress, assignee) is read from the board mock for the
// header + breadcrumb; the item table / evidence / reorder data below is shared
// mock until the Phase-1 backend exposes per-item inventory.
const DETAIL = {
  items: [
    { name: "Nitrile Exam Gloves, Medium", sku: "GLV-NTR-M", onHand: "2 boxes", onHandTone: "red", par: "10 boxes", status: { label: "Reorder now", tone: "red" }, evidence: { label: "Verified", icon: "icon-check-circle", tone: "green" }, reorder: { type: "savings", value: "$11.25" }, scanned: "May 16, 2024 · 9:10 AM", action: "Reorder" },
    { name: "CaviWipes Disinfectant Wipes", sku: "CW-160", onHand: "1 canister", onHandTone: "red", par: "4 canisters", status: { label: "Needs review", tone: "amber" }, evidence: { label: "Expiration captured", icon: "icon-clock", tone: "amber" }, reorder: { type: "link", value: "Review" }, scanned: "May 15, 2024 · 3:22 PM", action: "Review" },
    { name: "Procedure Face Masks, Blue", sku: "MASK-BLUE", onHand: "4 boxes", par: "8 boxes", status: { label: "Needs details", tone: "amber" }, evidence: { label: "Missing lot", icon: "icon-alert-triangle", tone: "red" }, reorder: { type: "link", value: "Add details" }, scanned: "May 14, 2024 · 11:05 AM", action: "Add details" },
    { name: "Sterilization Pouch 3.5\" x 9\"", sku: "DEF-359", onHand: "3 boxes", par: "6 boxes", status: { label: "Healthy", tone: "green" }, evidence: { label: "Verified", icon: "icon-check-circle", tone: "green" }, reorder: { type: "savings", value: "$6.35" }, scanned: "May 16, 2024 · 8:55 AM", action: "Reorder" },
    { name: "Patient Bibs, Blue", sku: "BIB-BLUE", onHand: "12 packs", par: "10 packs", status: { label: "Healthy", tone: "green" }, evidence: { label: "Verified", icon: "icon-check-circle", tone: "green" }, reorder: { type: "savings", value: "$4.80" }, scanned: "May 16, 2024 · 8:48 AM", action: "Reorder" },
    { name: "Saliva Ejectors, Green", sku: "SE-GRN", onHand: "2 bags", onHandTone: "amber", par: "5 bags", status: { label: "Low stock", tone: "amber" }, evidence: { label: "Verified", icon: "icon-check-circle", tone: "green" }, reorder: { type: "savings", value: "$3.20" }, scanned: "May 15, 2024 · 4:12 PM", action: "Reorder" },
    { name: "Prophy Angles, Soft", sku: "PA-SOFT", onHand: "6 packs", par: "6 packs", status: { label: "Expiring soon", tone: "amber" }, evidence: { label: "Expiration in 25 days", icon: "icon-clock", tone: "amber" }, reorder: { type: "savings", value: "$5.60" }, scanned: "May 14, 2024 · 10:20 AM", action: "Reorder" },
  ],
  scans: [
    { id: 1, text: "Nitrile Exam Gloves, Medium scanned", sku: "GLV-NTR-M", qty: "2 boxes", who: "Alex Kim", time: "2 min ago", icon: "icon-check-circle", tone: "green" },
    { id: 2, text: "CaviWipes Disinfectant Wipes flagged for review", sku: "CW-160", qty: "1 canister", who: "Jamie Lee", time: "15 min ago", icon: "icon-alert-triangle", tone: "amber" },
    { id: 3, text: "Procedure Face Masks, Blue updated", sku: "MASK-BLUE", qty: "4 boxes", who: "Alex Kim", time: "32 min ago", icon: "icon-file-text", tone: "blue" },
    { id: 4, text: "Sterilization Pouch 3.5\" x 9\" scanned", sku: "DEF-359", qty: "3 boxes", who: "Hannah Lee", time: "45 min ago", icon: "icon-check-circle", tone: "green" },
    { id: 5, text: "Patient Bibs, Blue scanned", sku: "BIB-BLUE", qty: "12 packs", who: "Hannah Lee", time: "1 hr ago", icon: "icon-check-circle", tone: "green" },
  ],
  issues: [
    { label: "Needs review", value: 2, icon: "icon-alert-triangle", tone: "red" },
    { label: "Missing details", value: 6, icon: "icon-info", tone: "amber" },
    { label: "Reorder now", value: 3, icon: "icon-cart", tone: "red" },
  ],
  evidence: [
    { label: "Expiration proof", status: "Verified", tone: "green" },
    { label: "Lot capture", status: "Partial", tone: "amber" },
    { label: "SDS linked", status: "Verified", tone: "green" },
    { label: "IFU linked", status: "Verified", tone: "green" },
    { label: "Price evidence", status: "Captured", tone: "green" },
  ],
  reorder: {
    estValue: "$84.20",
    items: [
      { name: "Nitrile Exam Gloves, Medium", qty: "2 boxes", price: "$22.50" },
      { name: "Saliva Ejectors, Green", qty: "2 bags", price: "$16.00" },
      { name: "Prophy Angles, Soft", qty: "6 packs", price: "$13.75" },
    ],
  },
};

const PILL_TONE = { red: s.badgeRed, amber: s.badgeAmber, green: s.badgeGreen, blue: s.badgeBlue, slate: s.badgeSlate };

// Pull the four header stats from the clicked location's mini-stats, falling
// back to the wireframe defaults for locations with a different stat shape.
function detailStats(loc) {
  const find = (re, fallback) => {
    const hit = (loc.stats || []).find((x) => re.test(x.label));
    return hit ? hit.value : fallback;
  };
  return {
    tracked: find(/scanned|tracked/i, 37),
    confirmed: find(/confirmed/i, 29),
    needDetails: find(/details|missing/i, 6),
    needReview: find(/review/i, 2),
  };
}

export function LocationDetailView({ locationId, onBack, onStartScan, onToast }) {
  const loc = BOARD_MOCK.locations.find((l) => l.id === locationId) || BOARD_MOCK.locations[0];
  const meta = typeMeta(loc.type);
  const status = STATUS_META[loc.status] || STATUS_META.not_started;
  const top = detailStats(loc);
  const progress = loc.progress ?? 78;
  const tellSoon = () => onToast?.("Scan sessions land in an upcoming phase.");
  const scan = () => (onStartScan ? onStartScan() : tellSoon());

  return (
    <div className={s.detail}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        <button type="button" className={s.crumbLink} onClick={() => onBack?.()}>Locations</button>
        <span className={s.crumbSep}>/</span>
        <span className={s.crumbCurrent}>{loc.name}</span>
      </nav>

      <header className={s.head}>
        <h1 className={s.title}>Location Detail</h1>
        <p className={s.subtitle}>Track inventory, scan progress, evidence, and reorder needs for this location.</p>
      </header>

      <div className={s.stats}>
        <Stat icon="icon-package" tint={s.tBlue} label="Tracked items" value={top.tracked} />
        <Stat icon="icon-check-circle" tint={s.tGreen} label="Confirmed" value={top.confirmed} />
        <Stat icon="icon-info" tint={s.tAmber} label="Needs details" value={top.needDetails} />
        <Stat icon="icon-alert-triangle" tint={s.tRed} label="Needs review" value={top.needReview} />
      </div>

      <section className={s.locHeader}>
        <div className={s.locHeadMain}>
          <span className={`${s.cardIcon} ${meta.tint}`}><Icon name={meta.icon} /></span>
          <div className={s.locHeadBody}>
            <div className={s.cardTitleRow}>
              <span className={s.locHeadName}>{loc.name}</span>
              <span className={`${s.badge} ${status.badge}`}>{status.label}</span>
            </div>
            <div className={s.cardSub}>{loc.room}{loc.sub ? ` · ${loc.sub}` : ` · ${meta.label}`}</div>
          </div>
        </div>

        <div className={s.locProgress}>
          <span className={s.locProgressLabel}>Scan progress</span>
          <div className={s.progress}>
            <span className={s.progressTrack}>
              <span className={`${s.progressFill} ${progress >= 100 ? s.complete : ""}`} style={{ width: `${progress}%` }} />
            </span>
            <span className={s.progressPct}>{progress}%</span>
          </div>
          <div className={s.locMeta}>
            <span className={s.locMetaItem}><Icon name="icon-clock" /><span><small>Last updated</small>{loc.updated || "2 min ago"}</span></span>
            <span className={s.locMetaItem}><Icon name="icon-users" /><span><small>Assigned to</small>{loc.assignee || "Alex Kim"}</span></span>
            <span className={s.locMetaItem}><Icon name="icon-calendar" /><span><small>Last scan today</small>9:15 AM</span></span>
          </div>
        </div>

        <div className={s.locActions}>
          <button type="button" className={s.scanBtn} onClick={scan}><Icon name="icon-scan" />Resume mobile scan</button>
          <button type="button" className={s.btnWide} onClick={tellSoon}>Open scan session<Icon name="icon-chevron-right" /></button>
          <button type="button" className={s.printLink} onClick={tellSoon}><Icon name="icon-file-text" />Print QR label</button>
        </div>
      </section>

      <div className={s.detailGrid}>
        <div className={s.detailMain}>
          <section className={s.panel}>
            <h2 className={s.panelTitle}>Items in this location</h2>
            <div className={s.toolbar}>
              <label className={s.search}>
                <Icon name="icon-search" />
                <input type="search" placeholder="Search items, SKUs, or categories…" aria-label="Search items" />
              </label>
              <Select label="Status" value="all" onChange={() => {}} options={[{ value: "all", label: "All status" }]} />
              <Select label="Category" value="all" onChange={() => {}} options={[{ value: "all", label: "All categories" }]} />
              <Select label="Reorder state" value="all" onChange={() => {}} options={[{ value: "all", label: "All states" }]} />
              <button type="button" className={s.filterBtn} onClick={tellSoon}><Icon name="icon-filter" />Filters</button>
            </div>

            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Item</th><th>SKU</th><th>On hand</th><th>Par level</th><th>Status</th><th>Evidence</th><th>Reorder</th><th>Last scanned</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {DETAIL.items.map((it) => (
                    <tr key={it.sku}>
                      <td className={s.tItem}>{it.name}</td>
                      <td className={s.tMuted}>{it.sku}</td>
                      <td><span className={it.onHandTone === "red" ? s.tdRed : it.onHandTone === "amber" ? s.tdAmber : ""}>{it.onHand}</span></td>
                      <td className={s.tMuted}>{it.par}</td>
                      <td><span className={`${s.badge} ${PILL_TONE[it.status.tone]}`}>{it.status.label}</span></td>
                      <td><span className={`${s.evi} ${TONE_TEXT[it.evidence.tone]}`}><Icon name={it.evidence.icon} />{it.evidence.label}</span></td>
                      <td>{it.reorder.type === "savings" ? <span className={s.savings}>Savings {it.reorder.value}</span> : <button type="button" className={s.tLink} onClick={tellSoon}>{it.reorder.value}</button>}</td>
                      <td className={s.tMuted}>{it.scanned}</td>
                      <td className={s.tActions}>
                        <button type="button" className={s.tBtn} onClick={tellSoon}>{it.action}</button>
                        <button type="button" className={s.kebab} onClick={tellSoon} aria-label="More actions">⋮</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={s.tableFoot}>
              <span className={s.tMuted}>Showing 1 to 7 of 37 items</span>
              <div className={s.pager}>
                <button type="button" className={s.pageNav} onClick={tellSoon} aria-label="Previous"><Icon name="icon-chevron-left" /></button>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={`${s.pageNum} ${n === 1 ? s.pageActive : ""}`} onClick={tellSoon}>{n}</button>
                ))}
                <button type="button" className={s.pageNav} onClick={tellSoon} aria-label="Next"><Icon name="icon-chevron-right" /></button>
              </div>
            </div>
          </section>

          <section className={s.panel}>
            <div className={s.cardHeadRow}>
              <h2 className={s.panelTitle}>Recent scans</h2>
              <button type="button" className={s.railLink} onClick={tellSoon}>View all activity<Icon name="icon-arrow-right" /></button>
            </div>
            {DETAIL.scans.map((ev) => (
              <div className={s.scanRow} key={ev.id}>
                <span className={`${s.activityIcon} ${TONE[ev.tone] || s.tSlate}`}><Icon name={ev.icon} /></span>
                <div className={s.scanBody}>
                  <div className={s.scanText}>{ev.text}</div>
                  <div className={s.scanMeta}>SKU: {ev.sku} · {ev.qty}</div>
                </div>
                <div className={s.scanWho}>
                  <span className={s.avatar}>{initials(ev.who)}</span>
                  <span className={s.footMetaValue}>{ev.who}</span>
                </div>
                <span className={s.scanTime}>{ev.time}</span>
              </div>
            ))}
          </section>
        </div>

        <aside className={s.detailRail}>
          <section className={s.railCard}>
            <h2 className={s.railTitle}>Issues in this location</h2>
            {DETAIL.issues.map((iss) => (
              <div className={s.issueRow} key={iss.label}>
                <span className={`${s.issueIcon} ${TONE_TEXT[iss.tone]}`}><Icon name={iss.icon} /></span>
                <span className={s.issueLabel}>{iss.label}</span>
                <span className={s.issueValue}>{iss.value}</span>
              </div>
            ))}
            <button type="button" className={s.railBtn} onClick={tellSoon}>Review issues<Icon name="icon-chevron-right" /></button>
          </section>

          <section className={s.railCard}>
            <h2 className={s.railTitle}>Evidence</h2>
            {DETAIL.evidence.map((ev) => (
              <div className={s.evidenceRow} key={ev.label}>
                <span className={`${s.eviDot} ${TONE_TEXT[ev.tone]}`}><Icon name={ev.tone === "green" ? "icon-check-circle" : "icon-clock"} /></span>
                <span className={s.eviLabel}>{ev.label}</span>
                <span className={`${s.eviStatus} ${TONE_TEXT[ev.tone]}`}>{ev.status}</span>
              </div>
            ))}
            <button type="button" className={s.railLink} onClick={tellSoon}>View all evidence<Icon name="icon-arrow-right" /></button>
          </section>

          <section className={s.railCard}>
            <div className={s.reorderHead}>
              <div>
                <div className={s.railTitle}>Reorder needs</div>
                <small className={s.tMuted}>{DETAIL.reorder.items.length} items below par</small>
              </div>
              <div className={s.reorderEst}>
                <small className={s.tMuted}>Est. reorder value</small>
                <strong className={s.savings}>{DETAIL.reorder.estValue}</strong>
              </div>
            </div>
            {DETAIL.reorder.items.map((it) => (
              <div className={s.reorderRow} key={it.name}>
                <span className={s.reorderName}>{it.name}</span>
                <span className={s.tMuted}>{it.qty}</span>
                <span className={s.footMetaValue}>{it.price}</span>
              </div>
            ))}
            <button type="button" className={s.railPrimary} onClick={tellSoon}><Icon name="icon-cart" />Create reorder draft</button>
          </section>

          <section className={s.railCard}>
            <h2 className={s.railTitle}>Mobile scan shortcuts</h2>
            <button type="button" className={s.shortcut} onClick={scan}>
              <span className={s.shortcutIcon}><Icon name="icon-scan" /></span>Resume scan<Icon name="icon-chevron-right" className={s.shortcutChevron} />
            </button>
            <button type="button" className={s.shortcut} onClick={tellSoon}>
              <span className={s.shortcutIcon}><Icon name="icon-scan" /></span>Open on mobile<Icon name="icon-chevron-right" className={s.shortcutChevron} />
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
