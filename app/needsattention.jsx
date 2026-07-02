"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { MobileHeader } from "./ui";
import { daysUntil, formatTraceDate, traceApi, traceErrorMessage } from "./lib";
import s from "./needsattention.module.css";
import { sortNeedsAttentionIssues } from "./needsAttentionSort";

// Needs Attention — the operational worklist. Every lot that needs a human to
// look at it, rolled across the whole practice from the same evidence the
// Locations board counts: expired lots, lots expiring soon, unidentified scans
// (no catalog match yet), and lots missing the lot/expiry an audit requires.
// This is the "what do I do next" home an office manager lands on.
//
// Wired to real data via GET /api/needs-attention. The reorder / recall / SDS-proof
// queues in the wireframe aren't backed yet (no live on-hand census, recall feed,
// or per-item SDS link), so they're intentionally absent rather than faked. Each
// row action deep-links to the lot's location, where the pull / identify / edit
// controls already live; the kebab menu and advanced filters are honest stubs.

// Issue type (backend `reason`): the badge + the small thumbnail glyph/tint that
// anchors each row.
const ISSUE_TYPES = {
  expired: { label: "Expired", tint: "red", icon: "icon-alert-triangle", action: "Review lot" },
  expiring: { label: "Expiring soon", tint: "amber", icon: "icon-clock", action: "Review lot" },
  unidentified: { label: "Unidentified", tint: "violet", icon: "icon-x-circle", action: "Identify" },
  missing_trace: { label: "Missing lot/expiry", tint: "blue", icon: "icon-file-text", action: "Add details" },
};

// Severity drives the pill color and the default sort weight.
const SEVERITY = {
  urgent: { label: "Urgent", tone: "red", rank: 0 },
  high: { label: "High", tone: "amber", rank: 1 },
  medium: { label: "Medium", tone: "gold", rank: 2 },
  low: { label: "Low", tone: "green", rank: 3 },
};

const PER_PAGE = 10;

// "2h ago" / "3d ago" stamp for the recent-activity feed (last_counted_at is the
// only real event stream we have — the scanner touching a lot).
function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// Severity is derived, not stored: an expired lot is urgent, an unidentified scan
// blocks trust (high), an expiring lot escalates as its date nears, and a missing
// lot/expiry is a low-priority paperwork gap.
function severityFor(reason, days) {
  if (reason === "expired") return "urgent";
  if (reason === "unidentified") return "high";
  if (reason === "expiring") return days != null && days <= 7 ? "high" : "medium";
  return "low"; // missing_trace
}

// The "Details / Reason" cell text, built from the raw lot fields.
function buildDetail(iss, days) {
  switch (iss.reason) {
    case "expired": {
      const n = days != null ? Math.abs(days) : null;
      return {
        detail: n != null ? `Expired ${n} day${n === 1 ? "" : "s"} ago` : "Past expiration",
        detailSub: iss.lot_number ? `Lot ${iss.lot_number}` : "No lot recorded",
      };
    }
    case "expiring":
      return {
        detail: days != null ? `Expires in ${days} day${days === 1 ? "" : "s"}` : "Expiring soon",
        detailSub: iss.lot_number ? `Lot ${iss.lot_number}` : "Lot not recorded",
      };
    case "unidentified":
      return {
        detail: "Scanned, not yet identified",
        detailSub: iss.barcode ? `Code ${iss.barcode}` : "No barcode captured",
      };
    case "missing_trace": {
      const missing = [!iss.lot_number && "lot", !iss.expiration_date && "expiry"].filter(Boolean).join(" & ");
      return { detail: `Missing ${missing || "trace"}`, detailSub: "Required for audit trail" };
    }
    default:
      return { detail: "", detailSub: "" };
  }
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

// Build the four KPI cards from the real counts.
function statCards(stats) {
  return [
    { key: "expired", icon: "icon-alert-triangle", tint: "red", label: "Expired", value: stats.expired, sub: "Past expiration" },
    { key: "expiring", icon: "icon-clock", tint: "amber", label: "Expiring soon", value: stats.expiring, sub: "Within 30 days" },
    { key: "unidentified", icon: "icon-x-circle", tint: "violet", label: "Unidentified", value: stats.unidentified, sub: "Scanned, not matched" },
    { key: "missing_trace", icon: "icon-file-text", tint: "blue", label: "Missing lot/expiry", value: stats.missing_trace, sub: "Trace incomplete" },
  ];
}

function snapshotRows(snapshot) {
  return [
    { icon: "icon-alert-triangle", tone: "red", value: snapshot.expired, label: "Expired — act now" },
    { icon: "icon-clock", tone: "amber", value: snapshot.expiringThisWeek, label: "Expiring this week" },
    { icon: "icon-x-circle", tone: "violet", value: snapshot.unidentified, label: "Unidentified items" },
    { icon: "icon-file-text", tone: "blue", value: snapshot.missing_trace, label: "Missing lot/expiry" },
  ];
}

export function NeedsAttentionView({ onToast, onNavigate }) {
  // On a phone the app topbar is hidden, so this view (reached from the scanner
  // hub) carries its own back affordance — matching the Locations/Reorder
  // mobile headers — otherwise it dead-ends.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { setIsMobile(window.matchMedia("(max-width: 767px)").matches); }, []);

  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let alive = true;
    traceApi.getNeedsAttention()
      .then((res) => {
        if (!alive) return;
        setSummary(res);
        setLoadError("");
      })
      .catch((err) => {
        if (!alive) return;
        setLoadError(traceErrorMessage(err, "Couldn't load your worklist."));
      });
    return () => { alive = false; };
  }, []);

  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Transform the raw issue feed into display rows (derive severity + detail text
  // once, so filtering, sorting and rendering all read the same shape).
  const rows = useMemo(() => (summary?.issues || []).map((iss) => {
    const days = daysUntil(iss.expiration_date);
    const { detail, detailSub } = buildDetail(iss, days);
    const dated = iss.reason === "expired" || iss.reason === "expiring";
    return {
      id: iss.id,
      item: iss.name,
      sku: iss.sku,
      type: iss.reason,
      location: iss.location_name,
      locationId: iss.location_id,
      severity: severityFor(iss.reason, days),
      detail,
      detailSub,
      due: dated && iss.expiration_date ? formatTraceDate(iss.expiration_date) : "—",
      dueTone: iss.reason === "expired" ? "bad" : "",
      lastSeen: iss.last_counted_at ? formatTraceDate(iss.last_counted_at) : "—",
    };
  }), [summary]);

  const locations = useMemo(
    () => Array.from(new Set(rows.map((i) => i.location))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = rows.filter((i) => {
      if (severityFilter !== "all" && i.severity !== severityFilter) return false;
      if (locationFilter !== "all" && i.location !== locationFilter) return false;
      if (typeFilter !== "all" && i.type !== typeFilter) return false;
      if (q && !(`${i.item} ${i.sku} ${i.detail} ${i.detailSub} ${i.location}`.toLowerCase().includes(q))) return false;
      return true;
    });
    return sortNeedsAttentionIssues(matches, SEVERITY);
  }, [rows, query, severityFilter, locationFilter, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;
  const pageRows = filtered.slice(start, start + PER_PAGE);

  // Any filter change drops us back to the first page.
  function resetFilter(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  // Honest stubs for the affordances with no backend yet.
  const soon = (what) => onToast?.(`${what} connects when issue workflows are wired up.`);
  // Row action: take the user to the lot's location, where pull / identify / edit
  // already live.
  const openLocation = (row) => {
    if (row.locationId) onNavigate?.(`/app/locations/${row.locationId}`);
    else soon("This item");
  };

  const header = (
    <>
      {isMobile && <MobileHeader onBack={() => onNavigate?.("/app")} />}
      <header className={s.head}>
        <h1 className={s.title}>Needs Attention</h1>
        <p className={s.subtitle}>Items and issues that require your review and action to keep operations running smoothly.</p>
      </header>
    </>
  );

  if (loadError) {
    return (
      <div className={s.page}>
        {header}
        <div className={s.tableCard}><p className={s.tableEmpty}>{loadError}</p></div>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className={s.page}>
        {header}
        <div className={s.tableCard}><p className={s.tableEmpty}>Loading your worklist…</p></div>
      </div>
    );
  }

  const cards = statCards(summary.stats);
  const snapshot = snapshotRows(summary.snapshot);
  const recent = summary.recent || [];

  return (
    <div className={s.page}>
      {header}

      <div className={s.main}>
        <div className={s.left}>
          {/* Headline KPI cards */}
          <section className={s.stats}>
            {cards.map(({ key, ...stat }) => <StatCard key={key} {...stat} />)}
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={7} className={s.tableEmpty}>
                      {rows.length === 0
                        ? "You're all caught up — nothing needs attention."
                        : "No issues match these filters."}
                    </td></tr>
                  ) : pageRows.map((issue) => {
                    const type = ISSUE_TYPES[issue.type];
                    const sev = SEVERITY[issue.severity];
                    return (
                      <tr key={issue.id} className={s.row}>
                        <td>
                          <span className={s.itemCell}>
                            <span className={`${s.thumb} ${s[`tint_${type.tint}`]}`}><Icon name={type.icon} /></span>
                            <span className={s.itemText}>
                              <span className={s.itemName}>{issue.item}</span>
                              {issue.sku
                                ? <span className={s.itemSku}>SKU: {issue.sku}</span>
                                : <span className={s.itemSku}>{issue.location}</span>}
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
                          <span className={s.actions}>
                            <button type="button" className={s.btnOutlineSm} onClick={() => openLocation(issue)}>{type.action}</button>
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
                  : `Showing ${start + 1} to ${start + pageRows.length} of ${filtered.length} issues`}
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
              {snapshot.map((row, i) => (
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
            </div>
            {recent.length === 0 ? (
              <p className={s.tableEmpty}>No recent captures yet.</p>
            ) : (
              <div className={s.actList}>
                {recent.map((a) => (
                  <div className={s.actRow} key={a.id}>
                    <span className={`${s.actDot} ${s.dot_green}`} />
                    <div className={s.actBody}>
                      <span className={s.actItem}>{a.name}</span>
                      <span className={s.actAction}>Captured</span>
                      <span className={s.actWho}>{a.location_name}</span>
                    </div>
                    <span className={s.actAgo}>{relativeTime(a.last_counted_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
