"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { initials } from "./lib";
import s from "./needsattention.module.css";
import { sortNeedsAttentionIssues } from "./needsAttentionSort";

// Dashboard — the operational worklist. Every open item or issue that
// needs a human to look at it: low/out-of-stock, expiring lots, and missing
// compliance proof, pulled together from the same signals that drive the
// Locations, Reorder, and Evidence surfaces. This is the "what do I do next"
// home an office manager lands on.
//
// FE-first slice: everything renders off the MOCK below, so it maps 1:1 onto
// the future per-practice issues feed (each row is one open issue). Filters,
// search, and pagination are real client-side behavior; the row actions
// (Review / Add proof / Reorder) are honest stubs that toast rather than fake a
// write, because the issue-resolution workflow isn't wired up yet.

// Issue type: the badge + the small thumbnail glyph/tint that anchors each row.
const ISSUE_TYPES = {
  low_stock: { label: "Low stock", tint: "amber", icon: "icon-package", action: "Review" },
  expiring: { label: "Expiring soon", tint: "blue", icon: "icon-clock", action: "Review" },
  missing_proof: { label: "Missing proof", tint: "violet", icon: "icon-file-text", action: "Add proof" },
  needs_reorder: { label: "Needs reorder", tint: "green", icon: "icon-cart", action: "Reorder" },
};

// Severity drives the pill color and the default sort weight.
const SEVERITY = {
  urgent: { label: "Urgent", tone: "red", rank: 0 },
  high: { label: "High", tone: "amber", rank: 1 },
  medium: { label: "Medium", tone: "gold", rank: 2 },
  low: { label: "Low", tone: "green", rank: 3 },
};

const PER_PAGE = 10;

export const NEEDS_ATTENTION_MOCK = {
  // Headline KPI cards. Independent counts across the whole practice — the table
  // below is the prioritized worklist, not the same population.
  stats: [
    { key: "urgent", icon: "icon-alert-triangle", tint: "red", label: "Urgent issues", value: 14, sub: "Require immediate action" },
    { key: "expiring", icon: "icon-clock", tint: "amber", label: "Expiring soon", value: 23, sub: "Within 30 days" },
    { key: "missing", icon: "icon-file-text", tint: "violet", label: "Missing proof", value: 17, sub: "Proof not uploaded" },
    { key: "reorder", icon: "icon-cart", tint: "green", label: "Needs reorder", value: 24, sub: "Low or out of stock" },
  ],
  // Right-rail "Today's snapshot" — the time-boxed cut of the same data.
  snapshot: [
    { icon: "icon-alert-triangle", tone: "red", value: 3, label: "Items due today" },
    { icon: "icon-clock", tone: "amber", value: 7, label: "Overdue items" },
    { icon: "icon-clock", tone: "amber", value: 15, label: "Expiring this week" },
    { icon: "icon-file-text", tone: "violet", value: 9, label: "Missing proof" },
  ],
  recent: [
    { id: "a1", item: "Prophy Angles, Soft", action: "Marked expiring soon", who: "Lisa Patel", ago: "2h ago", tone: "amber" },
    { id: "a2", item: "Sterilization Pouch, 3.5\" x 9\"", action: "Proof requested", who: "James Lee", ago: "3h ago", tone: "violet" },
    { id: "a3", item: "Composite Tips, Black", action: "Reorder initiated", who: "Henry Schein", ago: "5h ago", tone: "green" },
    { id: "a4", item: "Nitrile Exam Gloves, Medium", action: "Low stock alert", who: "System", ago: "6h ago", tone: "red" },
    { id: "a5", item: "Surface Disinfectant Wipes", action: "Stock updated", who: "Emily Carter", ago: "1d ago", tone: "blue" },
  ],
  // The worklist. One row = one open issue. `dueTone: "bad"` flags a due-today /
  // overdue date so it reads red.
  issues: [
    { id: "i1", item: "Nitrile Exam Gloves, Medium", sku: "GLV-NTR-M", type: "low_stock", location: "Main Office", severity: "urgent", detail: "Only 2 boxes on hand", detailSub: "Min level: 5 boxes", due: "Due today", dueTone: "bad", lastSeen: "May 16, 2024", assignee: "Henry Schein" },
    { id: "i2", item: "Prophy Angles, Soft", sku: "PRO-ANG-SFT", type: "expiring", location: "Hygiene Room", severity: "high", detail: "Expires in 18 days", detailSub: "Lot: LOT-2404-12", due: "May 28, 2024", lastSeen: "May 10, 2024", assignee: "Lisa Patel" },
    { id: "i3", item: "Sterilization Pouch, 3.5\" x 9\"", sku: "PCH-3.5X9", type: "missing_proof", location: "Sterilization Room", severity: "high", detail: "Proof required", detailSub: "Last proof: Apr 30", due: "Due today", dueTone: "bad", lastSeen: "May 12, 2024", assignee: "James Lee" },
    { id: "i4", item: "Face Masks, Earloop", sku: "MSK-EL-BLU", type: "low_stock", location: "Main Office", severity: "medium", detail: "4 boxes on hand", detailSub: "Min level: 8 boxes", due: "May 20, 2024", lastSeen: "May 16, 2024", assignee: "Lisa Patel" },
    { id: "i5", item: "Composite Tips, Black", sku: "CMP-TIP-BLK", type: "needs_reorder", location: "Operatory 1", severity: "medium", detail: "Out of stock", detailSub: "Min level: 1 bag", due: "May 21, 2024", lastSeen: "May 13, 2024", assignee: "Henry Schein" },
    { id: "i6", item: "Surface Disinfectant Wipes", sku: "WIP-SRF-160", type: "low_stock", location: "Operatory 2", severity: "medium", detail: "1 canister on hand", detailSub: "Min level: 3 canisters", due: "May 23, 2024", lastSeen: "May 14, 2024", assignee: "Emily Carter" },
    { id: "i7", item: "Septocaine 4% w/ Epinephrine", sku: "SEP-4-1100K", type: "expiring", location: "Main Office", severity: "low", detail: "Expires in 29 days", detailSub: "Lot: LOT-2403-08", due: "Jun 6, 2024", lastSeen: "May 15, 2024", assignee: "James Lee" },
    { id: "i8", item: "Patient Bibs, Blue", sku: "BIB-BLU-500", type: "low_stock", location: "Hygiene Room", severity: "low", detail: "12 on hand", detailSub: "Min level: 20", due: "May 27, 2024", lastSeen: "May 16, 2024", assignee: "Emily Carter" },
    { id: "i9", item: "Tray Covers, Plastic", sku: "TRC-PL-500", type: "needs_reorder", location: "Operatory 1", severity: "low", detail: "Only 1 pack on hand", detailSub: "Min level: 3 packs", due: "Jun 1, 2024", lastSeen: "May 13, 2024", assignee: "Henry Schein" },
    { id: "i10", item: "Round Burs #2", sku: "BUR-ROUND-2", type: "low_stock", location: "Operatory 2", severity: "low", detail: "6 on hand", detailSub: "Min level: 10", due: "May 30, 2024", lastSeen: "May 14, 2024", assignee: "Lisa Patel" },
    { id: "i11", item: "Fluoride Varnish, Bubblegum", sku: "FLV-BG-200", type: "expiring", location: "Hygiene Room", severity: "medium", detail: "Expires in 24 days", detailSub: "Lot: LOT-2404-19", due: "Jun 3, 2024", lastSeen: "May 15, 2024", assignee: "Lisa Patel" },
    { id: "i12", item: "Saliva Ejectors, Clear", sku: "SAL-EJ-CLR", type: "needs_reorder", location: "Operatory 2", severity: "medium", detail: "Out of stock", detailSub: "Min level: 2 bags", due: "May 24, 2024", lastSeen: "May 13, 2024", assignee: "Henry Schein" },
    { id: "i13", item: "Autoclave Spore Test", sku: "SPR-TST-WK", type: "missing_proof", location: "Sterilization Room", severity: "high", detail: "Weekly log not uploaded", detailSub: "Last proof: May 6", due: "Due today", dueTone: "bad", lastSeen: "May 14, 2024", assignee: "James Lee" },
    { id: "i14", item: "Cotton Rolls, #2 Medium", sku: "COT-RL-2M", type: "low_stock", location: "Storage", severity: "low", detail: "3 bags on hand", detailSub: "Min level: 6 bags", due: "Jun 2, 2024", lastSeen: "May 12, 2024", assignee: "Emily Carter" },
  ],
};

// Nav badge = number of open issues on the worklist.
export const NEEDS_ATTENTION_BADGE = NEEDS_ATTENTION_MOCK.issues.length;

// Deterministic avatar color per person so names stay visually stable.
const AVATAR_TINTS = ["blue", "green", "violet", "amber", "teal"];
function avatarTint(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function Avatar({ name }) {
  return <span className={`${s.avatar} ${s[`avatar_${avatarTint(name)}`]}`}>{initials(name)}</span>;
}

function StatCard({ icon, label, value, sub, tint }) {
  return (
    <div className={s.stat}>
      <span className={`${s.statIcon} ${s[`tint_${tint}`]}`}><Icon name={icon} /></span>
      <div className={s.statBody}>
        <span className={s.statLabel}>{label}</span>
        <strong className={s.statValue}>{value}</strong>
        <span className={s.statSub}>{sub}</span>
      </div>
    </div>
  );
}

// Custom dropdown: the native <select> popup is rendered by the OS and can't be
// styled, so we render our own trigger + menu in the app font. Closes on
// outside-click or Escape, matching the topbar menus elsewhere in the app.
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
    <div className={`${s.filter} ${open ? s.filterOpen : ""}`} ref={wrapRef}>
      <span className={s.filterLabel}>{label}</span>
      <button
        type="button"
        className={s.filterSelect}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {selected?.label}
      </button>
      <Icon name="icon-chevron-down" className={s.filterChevron} />
      {open && (
        <ul className={s.filterMenu} role="listbox">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`${s.filterOption} ${o.value === value ? s.filterOptionOn : ""}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className={s.filterOptionLabel}>{o.label}</span>
                {o.value === value && <Icon name="icon-check" className={s.filterCheck} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NeedsAttentionView({ data = NEEDS_ATTENTION_MOCK, onToast }) {
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [page, setPage] = useState(1);

  const locations = useMemo(
    () => Array.from(new Set(data.issues.map((i) => i.location))).sort(),
    [data.issues],
  );
  const assignees = useMemo(
    () => Array.from(new Set(data.issues.map((i) => i.assignee))).sort(),
    [data.issues],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = data.issues.filter((i) => {
      if (severityFilter !== "all" && i.severity !== severityFilter) return false;
      if (locationFilter !== "all" && i.location !== locationFilter) return false;
      if (typeFilter !== "all" && i.type !== typeFilter) return false;
      if (assigneeFilter !== "all" && i.assignee !== assigneeFilter) return false;
      if (q && !(`${i.item} ${i.sku} ${i.detail} ${i.detailSub} ${i.location}`.toLowerCase().includes(q))) return false;
      return true;
    });
    return sortNeedsAttentionIssues(matches, SEVERITY);
  }, [data.issues, query, severityFilter, locationFilter, typeFilter, assigneeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;
  const rows = filtered.slice(start, start + PER_PAGE);

  // Any filter change drops us back to the first page.
  function resetFilter(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  // No issue-resolution backend in this FE-first slice — be honest, don't fake it.
  const soon = (what) => onToast?.(`${what} connects when issue workflows are wired up.`);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={s.title}>Dashboard</h1>
        <p className={s.subtitle}>Items and issues that require your review and action to keep operations running smoothly.</p>
      </header>

      <div className={s.main}>
        <div className={s.left}>
          {/* Headline KPI cards */}
          <section className={s.stats}>
            {data.stats.map(({ key, ...stat }) => <StatCard key={key} {...stat} />)}
          </section>

          <section className={s.tableCard}>
            <div className={s.toolbar}>
              <div className={s.search}>
                <Icon name="icon-search" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder="Search items, SKUs, or issues..."
                  aria-label="Search items, SKUs, or issues"
                />
              </div>
              <Select
                label="Severity"
                value={severityFilter}
                onChange={resetFilter(setSeverityFilter)}
                options={[{ value: "all", label: "All severities" }, ...Object.entries(SEVERITY).map(([v, m]) => ({ value: v, label: m.label }))]}
              />
              <Select
                label="Location"
                value={locationFilter}
                onChange={resetFilter(setLocationFilter)}
                options={[{ value: "all", label: "All locations" }, ...locations.map((l) => ({ value: l, label: l }))]}
              />
              <Select
                label="Issue type"
                value={typeFilter}
                onChange={resetFilter(setTypeFilter)}
                options={[{ value: "all", label: "All types" }, ...Object.entries(ISSUE_TYPES).map(([v, m]) => ({ value: v, label: m.label }))]}
              />
              <Select
                label="Assignee"
                value={assigneeFilter}
                onChange={resetFilter(setAssigneeFilter)}
                options={[{ value: "all", label: "All assignees" }, ...assignees.map((a) => ({ value: a, label: a }))]}
              />
              <button type="button" className={s.filtersBtn} onClick={() => soon("Advanced filters")}>
                <Icon name="icon-filter" />Filters
              </button>
            </div>

            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Issue type</th>
                    <th>Location</th>
                    <th>Severity</th>
                    <th>Details / Reason</th>
                    <th>Due date / Last seen</th>
                    <th>Assignee</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={8} className={s.tableEmpty}>No issues match these filters.</td></tr>
                  ) : rows.map((issue) => {
                    const type = ISSUE_TYPES[issue.type];
                    const sev = SEVERITY[issue.severity];
                    return (
                      <tr key={issue.id} className={s.row}>
                        <td>
                          <span className={s.itemCell}>
                            <span className={`${s.thumb} ${s[`tint_${type.tint}`]}`}><Icon name={type.icon} /></span>
                            <span className={s.itemText}>
                              <span className={s.itemName}>{issue.item}</span>
                              <span className={s.itemSku}>SKU: {issue.sku}</span>
                            </span>
                          </span>
                        </td>
                        <td><span className={`${s.typeBadge} ${s[`tint_${type.tint}`]}`}>{type.label}</span></td>
                        <td className={s.muted}>{issue.location}</td>
                        <td><span className={`${s.sevPill} ${s[`sev_${sev.tone}`]}`}>{sev.label}</span></td>
                        <td>
                          <span className={s.stack}>
                            <span className={s.stackTop}>{issue.detail}</span>
                            <span className={s.stackSub}>{issue.detailSub}</span>
                          </span>
                        </td>
                        <td>
                          <span className={s.stack}>
                            <span className={`${issue.dueTone === "bad" ? s.dueBad : s.stackTop} ${s.nowrap}`}>{issue.due}</span>
                            <span className={`${s.stackSub} ${s.nowrap}`}>{issue.lastSeen}</span>
                          </span>
                        </td>
                        <td>
                          <span className={s.assignee}>
                            <Avatar name={issue.assignee} />
                            <span className={s.assigneeName}>{issue.assignee}</span>
                          </span>
                        </td>
                        <td>
                          <span className={s.actions}>
                            <button type="button" className={s.btnOutlineSm} onClick={() => soon(type.action)}>{type.action}</button>
                            <button type="button" className={s.kebab} aria-label="More actions" onClick={() => soon("More actions")}>
                              <Icon name="icon-more-vertical" />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={s.pagination}>
              <span className={s.pageInfo}>
                {filtered.length === 0
                  ? "No issues"
                  : `Showing ${start + 1} to ${start + rows.length} of ${filtered.length} issues`}
              </span>
              <div className={s.pager}>
                <button type="button" className={s.pageBtn} aria-label="Previous" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                  <Icon name="icon-chevron-left" />
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`${s.pageBtn} ${n === current ? s.pageBtnOn : ""}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button type="button" className={s.pageBtn} aria-label="Next" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
                  <Icon name="icon-chevron-right" />
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className={s.rail}>
          <div className={s.railCard}>
            <h3 className={s.railTitle}><Icon name="icon-clock" />Today&rsquo;s snapshot</h3>
            <div className={s.snapList}>
              {data.snapshot.map((row, i) => (
                <div className={s.snapRow} key={i}>
                  <span className={`${s.snapIcon} ${s[`tint_${row.tone}`]}`}><Icon name={row.icon} /></span>
                  <strong className={s.snapValue}>{row.value}</strong>
                  <span className={s.snapLabel}>{row.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={s.railCard}>
            <div className={s.railHeadRow}>
              <h3 className={s.railTitle}><Icon name="icon-bolt" />Recent activity</h3>
              <button type="button" className={s.railLink} onClick={() => soon("Activity log")}>View all</button>
            </div>
            <div className={s.actList}>
              {data.recent.map((a) => (
                <div className={s.actRow} key={a.id}>
                  <span className={`${s.actDot} ${s[`dot_${a.tone}`]}`} />
                  <div className={s.actBody}>
                    <span className={s.actItem}>{a.item}</span>
                    <span className={s.actAction}>{a.action}</span>
                    <span className={s.actWho}>{a.who}</span>
                  </div>
                  <span className={s.actAgo}>{a.ago}</span>
                </div>
              ))}
            </div>
            <button type="button" className={s.railFootLink} onClick={() => soon("Activity log")}>
              View all activity <Icon name="icon-arrow-right" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
