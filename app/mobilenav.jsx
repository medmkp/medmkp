"use client";

import { useState } from "react";
import { Icon } from "./icons";
import s from "./mobilenav.module.css";

// New mobile IA: a 5-tab bottom bar (Scan · Locations · Inventory · Reports ·
// More). Scan fires onScan(); the next three navigate to their views; More
// opens an in-component bottom sheet with the overflow destinations. The active
// tab is derived from the current `view` so the bar reflects where you are —
// any overflow view (home/savings/catalog/history/settings) lights up "More".
const MAIN_TABS = [
  { key: "scan", label: "Scan", icon: "icon-scan" },
  { key: "locations", label: "Locations", icon: "icon-map-pin" },
  { key: "inventory", label: "Inventory", icon: "icon-package" },
  { key: "reports", label: "Reports", icon: "icon-chart" },
  { key: "more", label: "More", icon: "icon-grid" },
];

const MORE_ITEMS = [
  { key: "home", label: "Reorder list", icon: "icon-list" },
  { key: "savings", label: "Savings", icon: "icon-dollar-circle" },
  { key: "catalog", label: "Catalog", icon: "icon-store" },
  { key: "history", label: "History", icon: "icon-clock" },
  { key: "settings", label: "Settings", icon: "icon-settings" },
];

const MORE_VIEWS = new Set(MORE_ITEMS.map((item) => item.key));

function activeTab(view) {
  if (view === "locations" || view === "inventory" || view === "reports") return view;
  if (MORE_VIEWS.has(view)) return "more";
  return "";
}

export function MobileNav({ view, onNavigate, onScan }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeTab(view);

  function handleTab(key) {
    if (key === "scan") {
      onScan?.();
      return;
    }
    if (key === "more") {
      setMoreOpen(true);
      return;
    }
    onNavigate?.(key);
  }

  function handleMore(key) {
    setMoreOpen(false);
    onNavigate?.(key);
  }

  return (
    <>
      <nav className={s.bar} aria-label="Mobile primary navigation">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${s.tab} ${active === tab.key ? s.active : ""}`}
            aria-pressed={active === tab.key}
            onClick={() => handleTab(tab.key)}
          >
            <span className={s.iconWrap}>
              <Icon name={tab.icon} className={s.icon} />
            </span>
            {tab.label}
          </button>
        ))}
      </nav>

      {moreOpen && (
        <div className={s.sheetRoot} role="dialog" aria-modal="true" aria-label="More destinations">
          <div className={s.backdrop} onClick={() => setMoreOpen(false)} />
          <div className={s.sheet}>
            <header className={s.sheetHead}>
              <strong>More</strong>
              <button type="button" className={s.sheetClose} aria-label="Close" onClick={() => setMoreOpen(false)}>
                <Icon name="icon-x" className={s.closeIcon} />
              </button>
            </header>
            <ul className={s.sheetList}>
              {MORE_ITEMS.map((item) => (
                <li key={item.key}>
                  <button type="button" className={s.sheetItem} onClick={() => handleMore(item.key)}>
                    <span className={s.sheetItemIcon}>
                      <Icon name={item.icon} className={s.icon} />
                    </span>
                    <span className={s.sheetItemLabel}>{item.label}</span>
                    <Icon name="icon-chevron-right" className={s.sheetItemChevron} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
