"use client";

import { useMemo, useState } from "react";
import { Icon } from "./icons";
import s from "./reports.module.css";

// Reports — the "Supply Scan Report" (wireframe #17) adapted to the session-less
// model. Scan sessions were removed, so this is NOT a per-session report; it's a
// rolling report over recent supply-scan evidence: what was captured, what needs
// attention, evidence coverage, data quality, and the next actions. FE-first
// mock — every action toasts honestly (no fake writes) until the read models and
// export are wired.

const ISSUE_TONE = {
  mismatch: "info",
  variance: "info",
  details: "warn",
  expiry: "bad",
  sds: "violet",
};

const MATCH_TONE = { exact: "ok", details: "warn", review: "bad" };

const MOCK = {
  scope: "All locations · Last 30 days",
  stats: [
    { key: "scanned", icon: "icon-package", tint: "blue", value: 37, label: "Scanned" },
    { key: "confirmed", icon: "icon-check-circle", tint: "green", value: 29, label: "Confirmed" },
    { key: "details", icon: "icon-alert-triangle", tint: "amber", value: 6, label: "Need details" },
    { key: "review", icon: "icon-x-circle", tint: "red", value: 2, label: "Need review" },
    { key: "reorder", icon: "icon-cart", tint: "teal", value: 8, label: "Reorder candidates" },
  ],
  // Action Required — grouped by issue, compliance issues above reorder noise.
  actionGroups: [
    {
      key: "mismatch", label: "Mismatches", tone: "info",
      items: [
        { id: "a1", name: "Nitrile Exam Gloves, Medium", sku: "GLV-NTR-M", issue: "SKU mismatch", issueTone: "mismatch", location: "Hygiene Cabinet", shelf: "Shelf 2", source: "Henry Schein", action: "Review" },
        { id: "a2", name: "Composite Tips, Black", sku: "CMP-TIP-BLK", issue: "Quantity variance", issueTone: "variance", location: "Operatory 1", shelf: "Shelf 4", source: "Henry Schein", action: "Review" },
      ],
    },
    {
      key: "details", label: "Missing details", tone: "warn",
      items: [
        { id: "a3", name: "CaviWipes, 160 ct", sku: "CAV-160", issue: "Missing expiration", issueTone: "details", location: "Hygiene Cabinet", shelf: "Shelf 1", source: "Auto-linked", action: "Add details" },
        { id: "a4", name: "Sterilization Pouch 3.5\" x 9\"", sku: "PCH-3.5X9", issue: "Missing lot number", issueTone: "details", location: "Sterilization", shelf: "Shelf 3", source: "Auto-linked", action: "Add details" },
      ],
    },
    {
      key: "sds", label: "Missing SDS", tone: "violet",
      items: [
        { id: "a5", name: "Patient Bibs, Blue", sku: "BIB-BLU-500", issue: "Missing SDS", issueTone: "sds", location: "Hygiene Cabinet", shelf: "Shelf 4", source: "Darby", action: "Upload" },
      ],
    },
    {
      key: "expiry", label: "Expiring soon", tone: "bad",
      items: [
        { id: "a6", name: "Saliva Ejectors, Green", sku: "SAL-EJ-GRN", issue: "Expires in 45 days", issueTone: "expiry", location: "Operatory 1", shelf: "Shelf 2", source: "Patterson", action: "Review" },
      ],
    },
  ],
  // Scanned Inventory — the lot-at-location records captured, not a stock count.
  scanned: [
    { id: "s1", name: "Nitrile Exam Gloves, Medium", sku: "GLV-NTR-M", gtin: "00617441520047", location: "Hygiene Cabinet", shelf: "Shelf 2", qty: "6 boxes", par: "10 boxes", expiration: "2027-06-30", lot: "NTRM0625", match: "exact" },
    { id: "s2", name: "CaviWipes, 160 ct", sku: "CAV-160", gtin: "00766476001572", location: "Hygiene Cabinet", shelf: "Shelf 1", qty: "1 tub", par: "2 tubs", expiration: "—", lot: "—", match: "details" },
    { id: "s3", name: "Sterilization Pouch 3.5\" x 9\"", sku: "PCH-3.5X9", gtin: "00606342341009", location: "Sterilization", shelf: "Shelf 3", qty: "3 boxes", par: "3 boxes", expiration: "2026-12-31", lot: "SP3591225", match: "exact" },
    { id: "s4", name: "Procedure Face Masks", sku: "MSK-PFM-BLU", gtin: "00840234560112", location: "Hygiene Cabinet", shelf: "Shelf 1", qty: "1 box", par: "3 boxes", expiration: "2028-04-30", lot: "PFM0424", match: "review" },
    { id: "s5", name: "Composite Tips, Black", sku: "CMP-TIP-BLK", gtin: "00712334560090", location: "Operatory 1", shelf: "Shelf 4", qty: "2 packs", par: "2 packs", expiration: "—", lot: "CT0331", match: "details" },
    { id: "s6", name: "Septocaine Articaine 4%", sku: "SEP-ART-4", gtin: "00301234500127", location: "Operatory 1", shelf: "Shelf 1", qty: "50 ct", par: "50 ct", expiration: "2026-09-15", lot: "ART0915", match: "exact" },
  ],
  evidence: [
    { type: "sds", label: "SDS linked", covered: 28, total: 37 },
    { type: "ifu", label: "IFU linked", covered: 24, total: 37 },
    { type: "expiration", label: "Expiration proof", covered: 26, total: 37 },
    { type: "lot", label: "Lot captured", covered: 23, total: 37 },
    { type: "price", label: "Price evidence", covered: 21, total: 37 },
  ],
  quality: [
    { key: "exact", label: "Exact matches", value: 29, pct: 78, tone: "ok", icon: "icon-check-circle" },
    { key: "partial", label: "Partial matches", value: 4, pct: 11, tone: "info", icon: "icon-link" },
    { key: "details", label: "Needs details", value: 6, pct: 16, tone: "warn", icon: "icon-alert-triangle" },
    { key: "review", label: "Needs review", value: 2, pct: 5, tone: "bad", icon: "icon-x-circle" },
  ],
  completion: 84,
  nextSteps: [
    { id: "n1", title: "Review mismatches", sub: "2 items need review", icon: "icon-x-circle" },
    { id: "n2", title: "Add missing details", sub: "6 items missing lot or expiry", icon: "icon-alert-triangle" },
    { id: "n3", title: "Upload missing proof", sub: "1 item needs an SDS", icon: "icon-shield-check" },
    { id: "n4", title: "Create reorder draft", sub: "8 items ready for reorder", icon: "icon-cart" },
    { id: "n5", title: "Export final PDF", sub: "Generate and share report", icon: "icon-file-text" },
  ],
};

function StatCard({ icon, label, value, tint }) {
  return (
    <div className={s.stat}>
      <span className={`${s.statIcon} ${s[`stat_${tint}`]}`}><Icon name={icon} /></span>
      <div className={s.statBody}>
        <strong className={s.statValue}>{value}</strong>
        <span className={s.statLabel}>{label}</span>
      </div>
    </div>
  );
}

// Small product placeholder tile (no real product imagery in the FE mock).
function ProdGlyph() {
  return <span className={s.prodGlyph}><Icon name="icon-package" /></span>;
}

function Select({ label, value, onChange, options }) {
  return (
    <label className={s.filter}>
      <span className={s.filterLabel}>{label}</span>
      <select className={s.filterSelect} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <Icon name="icon-chevron-down" className={s.filterChevron} />
    </label>
  );
}

function includesQuery(row, query, fields) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => String(row[field] || "").toLowerCase().includes(q));
}

export function ReportsView({ data = MOCK, onToast, onNavigate }) {
  const [actionQuery, setActionQuery] = useState("");
  const [actionIssue, setActionIssue] = useState("all");
  const [scannedQuery, setScannedQuery] = useState("");
  const [scannedMatch, setScannedMatch] = useState("all");
  const soon = (what) => onToast?.(`${what} connects when the report export is wired up.`);

  const filteredActionGroups = useMemo(() => {
    return data.actionGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => (
          (actionIssue === "all" || item.issueTone === actionIssue) &&
          includesQuery(item, actionQuery, ["name", "sku", "issue", "location", "shelf", "source", "action"])
        )),
      }))
      .filter((group) => group.items.length > 0);
  }, [data.actionGroups, actionIssue, actionQuery]);

  const filteredScanned = useMemo(() => {
    return data.scanned.filter((row) => (
      (scannedMatch === "all" || row.match === scannedMatch) &&
      includesQuery(row, scannedQuery, ["name", "sku", "gtin", "location", "shelf", "qty", "par", "expiration", "lot"])
    ));
  }, [data.scanned, scannedMatch, scannedQuery]);

  const actionCount = useMemo(
    () => filteredActionGroups.reduce((total, group) => total + group.items.length, 0),
    [filteredActionGroups],
  );

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.title}>Supply Scan Report</h1>
          <p className={s.subtitle}>
            A rolling view of recent supply-scan evidence — what was captured, what needs attention, and the next actions to close gaps.
          </p>
          <div className={s.scopeRow}>
            <span className={s.scopeChip}><Icon name="icon-map-pin" />{data.scope}</span>
          </div>
        </div>
        <div className={s.headActions}>
          <button type="button" className={s.btnOutline} onClick={() => soon("PDF export")}><Icon name="icon-file-text" />Export PDF</button>
          <button type="button" className={s.btnOutline} onClick={() => soon("CSV download")}><Icon name="icon-file-plus" />Download CSV</button>
          <button type="button" className={s.btnPrimary} onClick={() => soon("Reorder draft")}><Icon name="icon-cart" />Create reorder draft</button>
        </div>
      </header>

      <section className={s.stats}>
        {data.stats.map((st) => <StatCard key={st.key} icon={st.icon} tint={st.tint} value={st.value} label={st.label} />)}
      </section>

      <div className={s.main}>
        <div className={s.col}>
          {/* Action Required */}
          <section className={s.tableCard}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Action required <span className={s.countPill}>{actionCount}</span></h2>
              <button type="button" className={s.cardLink} onClick={() => onNavigate?.("/app")}>Open dashboard <Icon name="icon-arrow-right" /></button>
            </div>
            <div className={s.toolbar}>
              <label className={s.search}>
                <Icon name="icon-search" />
                <input
                  type="search"
                  value={actionQuery}
                  onChange={(event) => setActionQuery(event.target.value)}
                  placeholder="Search action items"
                  aria-label="Search action items"
                />
              </label>
              <Select
                label="Issue"
                value={actionIssue}
                onChange={setActionIssue}
                options={[
                  { value: "all", label: "All issues" },
                  { value: "mismatch", label: "Mismatches" },
                  { value: "variance", label: "Variance" },
                  { value: "details", label: "Missing details" },
                  { value: "sds", label: "Missing SDS" },
                  { value: "expiry", label: "Expiring soon" },
                ]}
              />
              <button type="button" className={s.filtersBtn} onClick={() => soon("Advanced filters")}>
                <Icon name="icon-filter" />Filters
              </button>
            </div>
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr><th>Item</th><th>Issue</th><th>Location</th><th>Shelf</th><th>Source</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {filteredActionGroups.length === 0 ? (
                    <tr><td colSpan={6} className={s.tableEmpty}>No action items match these filters.</td></tr>
                  ) : filteredActionGroups.map((g) => (
                    <GroupRows key={g.key} group={g} onAction={() => soon("Resolve")} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Scanned Inventory */}
          <section className={s.tableCard}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Scanned inventory</h2>
              <span className={s.cardMeta}>{filteredScanned.length} of {data.stats[0].value} records</span>
            </div>
            <div className={s.toolbar}>
              <label className={s.search}>
                <Icon name="icon-search" />
                <input
                  type="search"
                  value={scannedQuery}
                  onChange={(event) => setScannedQuery(event.target.value)}
                  placeholder="Search scanned inventory"
                  aria-label="Search scanned inventory"
                />
              </label>
              <Select
                label="Match"
                value={scannedMatch}
                onChange={setScannedMatch}
                options={[
                  { value: "all", label: "All matches" },
                  { value: "exact", label: "Exact match" },
                  { value: "details", label: "Needs details" },
                  { value: "review", label: "Needs review" },
                ]}
              />
              <button type="button" className={s.filtersBtn} onClick={() => soon("Advanced filters")}>
                <Icon name="icon-filter" />Filters
              </button>
            </div>
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr><th>Item</th><th>SKU / GTIN</th><th>Location</th><th>Shelf</th><th>Quantity</th><th>Par level</th><th>Expiration</th><th>Lot</th><th>Match</th></tr>
                </thead>
                <tbody>
                  {filteredScanned.length === 0 ? (
                    <tr><td colSpan={9} className={s.tableEmpty}>No scanned inventory records match these filters.</td></tr>
                  ) : filteredScanned.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className={s.itemCell}><ProdGlyph /><span className={s.itemName}>{r.name}</span></span>
                      </td>
                      <td>
                        <span className={s.skuCell}>
                          <span className={s.skuPrimary}>{r.sku}</span>
                          <span className={s.skuSecondary}>{r.gtin}</span>
                        </span>
                      </td>
                      <td className={s.muted}>{r.location}</td>
                      <td className={s.muted}>{r.shelf}</td>
                      <td className={s.muted}>{r.qty}</td>
                      <td className={s.muted}>{r.par}</td>
                      <td className={s.muted}>{r.expiration}</td>
                      <td className={s.mono}>{r.lot}</td>
                      <td><MatchPill match={r.match} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={s.pagination}>
              <span className={s.pageInfo}>Showing 1 to {filteredScanned.length} of {data.stats[0].value} records</span>
              <div className={s.pager}>
                <button type="button" className={s.pageBtn} aria-label="Previous" onClick={() => soon("Pagination")}><Icon name="icon-chevron-left" /></button>
                {["1", "2", "3", "…", "7"].map((n, i) => (
                  <button key={`${n}-${i}`} type="button" className={`${s.pageBtn} ${n === "1" ? s.pageBtnOn : ""}`} disabled={n === "…"} onClick={() => soon("Pagination")}>{n}</button>
                ))}
                <button type="button" className={s.pageBtn} aria-label="Next" onClick={() => soon("Pagination")}><Icon name="icon-chevron-right" /></button>
              </div>
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className={s.rail}>
          <div className={s.railCard}>
            <h3 className={s.railTitle}>Evidence summary</h3>
            <div className={s.covList}>
              {data.evidence.map((row) => {
                const pct = Math.round((row.covered / row.total) * 100);
                const tone = pct >= 75 ? "ok" : "warn";
                return (
                  <div className={s.covItem} key={row.type}>
                    <div className={s.covTop}>
                      <span className={s.covLabel}><span className={`${s.dot} ${tone === "ok" ? s.dotOk : s.dotWarn}`} />{row.label}</span>
                      <span className={s.covNums}>{row.covered} / {row.total}</span>
                    </div>
                    <div className={s.bar}><div className={`${s.barFill} ${tone === "ok" ? s.barOk : s.barWarn}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
            <button type="button" className={s.railLink} onClick={() => onNavigate?.("/app/evidence")}>View all evidence <Icon name="icon-arrow-right" /></button>
          </div>

          <div className={s.railCard}>
            <h3 className={s.railTitle}>Data quality</h3>
            <ul className={s.qualList}>
              {data.quality.map((q) => (
                <li key={q.key} className={s.qualRow}>
                  <span className={`${s.qualIcon} ${s[`ink_${q.tone}`]}`}><Icon name={q.icon} /></span>
                  <span className={s.qualLabel}>{q.label}</span>
                  <span className={s.qualVal}>{q.value} <span className={s.qualPct}>({q.pct}%)</span></span>
                </li>
              ))}
            </ul>
            <div className={s.completion}>
              <div className={s.completionTop}>
                <span>Completion</span><span className={s.covNums}>{data.completion}%</span>
              </div>
              <div className={s.bar}><div className={`${s.barFill} ${s.barBlue}`} style={{ width: `${data.completion}%` }} /></div>
            </div>
            <button type="button" className={s.railLink} onClick={() => soon("Quality detail")}>View quality details <Icon name="icon-arrow-right" /></button>
          </div>

          <div className={s.railCard}>
            <h3 className={s.railTitle}>Recommended next steps</h3>
            <ol className={s.steps}>
              {data.nextSteps.map((step, i) => (
                <li key={step.id}>
                  <button type="button" className={s.step} onClick={() => soon(step.title)}>
                    <span className={s.stepNum}>{i + 1}</span>
                    <span className={s.stepBody}>
                      <span className={s.stepTitle}>{step.title}</span>
                      <span className={s.stepSub}>{step.sub}</span>
                    </span>
                    <Icon name="icon-chevron-right" className={s.stepChevron} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

function GroupRows({ group, onAction }) {
  return (
    <>
      <tr className={s.groupRow}>
        <td colSpan={6}>
          <span className={`${s.groupLabel} ${s[`grp_${group.tone}`]}`}>{group.label} <span className={s.groupCount}>({group.items.length})</span></span>
        </td>
      </tr>
      {group.items.map((it) => (
        <tr key={it.id} className={s.row}>
          <td>
            <span className={s.itemCell}><ProdGlyph /><span className={s.itemBlock}><span className={s.itemName}>{it.name}</span><span className={s.itemSku}>{it.sku}</span></span></span>
          </td>
          <td><span className={`${s.issuePill} ${s[`pill_${ISSUE_TONE[it.issueTone]}`]}`}>{it.issue}</span></td>
          <td className={s.muted}>{it.location}</td>
          <td className={s.muted}>{it.shelf}</td>
          <td className={s.muted}>{it.source}</td>
          <td><button type="button" className={s.actionLink} onClick={onAction}>{it.action} <Icon name="icon-chevron-right" /></button></td>
        </tr>
      ))}
    </>
  );
}

function MatchPill({ match }) {
  const tone = MATCH_TONE[match] || "ok";
  const label = match === "exact" ? "Exact match" : match === "details" ? "Needs details" : "Needs review";
  return <span className={`${s.matchPill} ${s[`pill_${tone}`]}`}>{label}</span>;
}
