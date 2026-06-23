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
  cabinet: { icon: "icon-archive-down", tint: s.tIndigo, label: "Cabinet" },
  sterilization: { icon: "icon-shield-check", tint: s.tTeal, label: "Sterilization" },
  lab: { icon: "icon-bolt", tint: s.tViolet, label: "Lab" },
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

function LocationCard({ loc, onAction }) {
  const meta = typeMeta(loc.type);
  const status = STATUS_META[loc.status] || STATUS_META.not_started;
  const complete = loc.progress === 100 || loc.status === "healthy";

  return (
    <article className={s.card}>
      <div className={s.cardHead}>
        <span className={`${s.cardIcon} ${meta.tint}`}><Icon name={meta.icon} /></span>
        <div className={s.cardHeadBody}>
          <div className={s.cardTitleRow}>
            <span className={s.cardName}>{loc.name}</span>
            <span className={`${s.badge} ${status.badge}`}>{status.label}</span>
          </div>
          <div className={s.cardSub}>{loc.room}{loc.sub ? ` · ${loc.sub}` : ` · ${meta.label}`}</div>
        </div>
      </div>

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

export function LocationsBoardView({ data = BOARD_MOCK, onStartScan, onAddLocation, onToast }) {
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

  function handleCardAction(action) {
    if (action === "resume") return (onStartScan ? onStartScan() : tellSoon());
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
        <span className={s.toolbarSpacer} />
        <button type="button" className={s.addBtn} onClick={() => onAddLocation?.()}>
          <Icon name="icon-plus" />
          Add location
        </button>
        <button type="button" className={s.scanBtn} onClick={() => (onStartScan ? onStartScan() : tellSoon())}>
          <Icon name="icon-scan" />
          Start mobile scan
        </button>
      </div>

      <div className={s.layout}>
        <div className={s.cards}>
          {visible.length === 0 ? (
            <div className={s.empty}>No locations match your filters.</div>
          ) : (
            visible.map((loc) => <LocationCard key={loc.id} loc={loc} onAction={handleCardAction} />)
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
