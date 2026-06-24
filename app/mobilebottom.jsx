"use client";

import { Icon } from "./icons";
import s from "./mobilebottom.module.css";

// Mobile bottom navigation bar — persistent across all app views (≤767px).
// Five tabs: Today · Locations · Scan (center FAB) · Reorder · More
// activeTab: "today" | "locations" | "scan" | "reorder" | "more" | null
//
// Icons compose `nav-icon` (the stroke treatment: fill:none; stroke:currentColor)
// with the local sizing class — passing only the local class would drop the
// stroke styling and the outline glyphs would paint as solid black.

const TABS = [
  { key: "today",     icon: "icon-nav-today",     label: "Today" },
  { key: "locations", icon: "icon-nav-locations", label: "Locations" },
  { key: "reorder",   icon: "icon-nav-reorder",   label: "Reorder" },
  { key: "more",      icon: "icon-nav-more",      label: "More" },
];

export function MobileBottomNav({ activeTab, onTab, needsAttentionCount = 0 }) {
  // Scan sits in the middle as a FAB, so split the four flat tabs around it.
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  const Tab = ({ key, icon, label }) => (
    <button
      key={key}
      type="button"
      className={`${s.tab} ${activeTab === key ? s.tabActive : ""}`}
      onClick={() => onTab(key)}
      aria-current={activeTab === key ? "page" : undefined}
      aria-label={label}
    >
      <Icon name={icon} className={`nav-icon ${s.tabIcon}`} />
      <span className={s.tabLabel}>{label}</span>
      {key === "today" && needsAttentionCount > 0 && (
        <span className={s.badge}>{needsAttentionCount > 9 ? "9+" : needsAttentionCount}</span>
      )}
    </button>
  );

  return (
    <nav className={s.nav} aria-label="Main navigation">
      {left.map(Tab)}

      {/* Center FAB — Scan (always the blue hero) */}
      <button
        type="button"
        className={s.fab}
        onClick={() => onTab("scan")}
        aria-current={activeTab === "scan" ? "page" : undefined}
        aria-label="Scan"
      >
        <Icon name="icon-nav-scan" className={`nav-icon ${s.fabIcon}`} />
      </button>

      {right.map(Tab)}
    </nav>
  );
}

// "More" bottom sheet — secondary destinations off the main nav
export function MobileMoreSheet({ onNavigate, onClose, onLogout }) {
  const items = [
    { icon: "icon-shield-check", label: "Evidence & compliance", view: "evidence" },
    { icon: "icon-dollar-circle", label: "Savings",              view: "savings" },
    { icon: "icon-clock",        label: "History",               view: "history" },
    { icon: "icon-store",        label: "Catalog",               view: "catalog" },
    { icon: "icon-settings",     label: "Settings",              view: "settings" },
  ];
  return (
    <div className={s.moreBackdrop} onClick={onClose}>
      <div className={s.moreSheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.moreDrag} />
        <div className={s.moreTitle}>More</div>
        <div className={s.moreList}>
          {items.map(({ icon, label, view }) => (
            <button
              key={view}
              type="button"
              className={s.moreRow}
              onClick={() => { onNavigate(view); onClose(); }}
            >
              <span className={s.moreIcon}><Icon name={icon} /></span>
              <span className={s.moreLabel}>{label}</span>
              <Icon name="icon-chevron-right" className={`nav-icon ${s.moreChevron}`} />
            </button>
          ))}
          {onLogout && (
            <button
              type="button"
              className={`${s.moreRow} ${s.moreRowDanger}`}
              onClick={() => { onClose(); onLogout(); }}
            >
              <span className={s.moreIcon}><Icon name="icon-logout" /></span>
              <span className={s.moreLabel}>Sign out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
