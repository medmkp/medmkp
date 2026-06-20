"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG_CATEGORIES, CATALOG_TINTS, bucketCategories, categoryBySlug, departmentForCategory } from "./catalogData";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Upload aborts after this long so a slow/unreachable backend can't hang the
// modal forever. Generous because a cold catalog-match index can take a while
// to build on the first request; the user can also Cancel sooner.
const UPLOAD_TIMEOUT_MS = 180000;

const APP_STATE_KEY = "medmkp_app_state_v1";
const CATALOG_RECENT_KEY = "medmkp_catalog_recent_v1";
const SHOPIFY_STOCK_SESSION_KEY = "medmkp_shopify_stock_v1";
const SHOPIFY_STOCK_MAX_ITEMS = 60;
// Device-local UI preference: whether the left nav sidebar is collapsed. Kept
// out of the synced app-state blob since collapse is per-device, like ChatGPT.
const NAV_COLLAPSED_KEY = "medmkp_nav_collapsed_v1";

// Unauthenticated visitors get a taste of the scanner before the signup wall:
// FREE_SCAN_LIMIT distinct lookups, counted in localStorage so the budget
// survives a refresh. This is a soft marketing gate, not a security control.
const FREE_SCAN_LIMIT = 3;
const FREE_SCAN_KEY = "medmkp_free_scans_v1";

const DEFAULT_BUYING_PREFS = {
  strategy: "best-price",
  preferredSuppliers: [],
  substitutions: "allowed",
  needByDate: "",
};

const routeByView = {
  landing: "/",
  pricing: "/pricing",
  about: "/about",
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  home: "/app",
  plan: "/app/review",
  catalog: "/app/catalog",
  history: "/app/history",
  settings: "/app/settings",
};

function viewFromPath(pathname = "/") {
  const [rawPath, rawQuery = ""] = pathname.split("#")[0].split("?");
  const path = rawPath.replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(rawQuery);

  // Public site
  if (path === "/") return { view: "landing", isLoggedIn: false };
  if (path === "/pricing") return { view: "pricing", isLoggedIn: false };
  if (path === "/about") return { view: "about", isLoggedIn: false };
  if (path === "/login") return { view: "login", isLoggedIn: false };
  if (path === "/signup") return { view: "signup", isLoggedIn: false };
  if (path === "/forgot-password") return { view: "forgotPassword", isLoggedIn: false };
  if (path === "/reset-password") return { view: "resetPassword", isLoggedIn: false };
  if (path === "/sample") return { view: "sample", isLoggedIn: false };
  if (path === "/scan") return { view: "publicScan", isLoggedIn: false };

  // Authenticated app
  if (path === "/app") return { view: "home", isLoggedIn: true };
  if (path === "/app/scan") return { view: "home", isLoggedIn: true, mobileAddItemRoute: true };
  // /app/plan is the former name — kept so old links/bookmarks still resolve.
  if (path === "/app/review/handoff" || path === "/app/plan/handoff") return { view: "handoff", isLoggedIn: true, handoffId: query.get("ho") || "" };
  if (path === "/app/review" || path === "/app/plan") return { view: "plan", isLoggedIn: true };
  if (path === "/app/history") return { view: "history", isLoggedIn: true };
  if (path.startsWith("/app/history/")) return { view: "historyDetail", isLoggedIn: true, historyId: path.split("/")[3] || "" };
  if (path === "/app/catalog") return { view: "catalog", isLoggedIn: true };
  if (path === "/app/catalog/search") return { view: "catalogSearch", isLoggedIn: true, searchQuery: query.get("q") || "" };
  if (path.startsWith("/app/catalog/")) return { view: "catalogCategory", isLoggedIn: true, categorySlug: decodeURIComponent(path.split("/")[3] || "") };
  if (path.startsWith("/app/product/")) return { view: "productDetail", isLoggedIn: true, productHandle: decodeURIComponent(path.split("/")[3] || "") };
  if (path === "/app/settings") return { view: "settings", isLoggedIn: true };

  return { view: "home", isLoggedIn: true };
}

function pathForView(view) {
  return routeByView[view] || "/app";
}


function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true">
      <symbol id="icon-home" viewBox="0 0 24 24">
        <path d="M3 10.8 12 3l9 7.8v8.4a1.8 1.8 0 0 1-1.8 1.8h-4.5v-6.2H9.3V21H4.8A1.8 1.8 0 0 1 3 19.2v-8.4Z" />
      </symbol>
      <symbol id="icon-file-plus" viewBox="0 0 24 24">
        <path d="M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z" />
        <path d="M13 3.5V9h5" />
        <path d="M9 15h5.5M11.75 12.25v5.5" />
      </symbol>
      <symbol id="icon-file-text" viewBox="0 0 24 24">
        <path d="M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z" />
        <path d="M13 3.5V9h5" />
        <path d="M8.5 13h7M8.5 16h7" />
      </symbol>
      <symbol id="icon-clipboard" viewBox="0 0 24 24">
        <path d="M8 5.5h8" />
        <path d="M9 3.5h6l1 2h2A1.5 1.5 0 0 1 19.5 7v13A1.5 1.5 0 0 1 18 21.5H6A1.5 1.5 0 0 1 4.5 20V7A1.5 1.5 0 0 1 6 5.5h2l1-2Z" />
        <path d="M8.5 11.5h7M8.5 15.5h7" />
      </symbol>
      <symbol id="icon-clipboard-check" viewBox="0 0 24 24">
        <path d="M8 5.5h8" />
        <path d="M9 3.5h6l1 2h2A1.5 1.5 0 0 1 19.5 7v13A1.5 1.5 0 0 1 18 21.5H6A1.5 1.5 0 0 1 4.5 20V7A1.5 1.5 0 0 1 6 5.5h2l1-2Z" />
        <path d="m8.5 13.5 2.2 2.2 4.8-4.8" />
      </symbol>
      <symbol id="icon-package" viewBox="0 0 24 24">
        <path d="m12 3 8 4.3v9.4L12 21l-8-4.3V7.3L12 3Z" />
        <path d="m4.5 7.6 7.5 4 7.5-4M12 12v8" />
      </symbol>
      <symbol id="icon-users" viewBox="0 0 24 24">
        <path d="M9.5 11a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" />
        <path d="M3.8 19.5c.7-3.2 2.8-5 5.7-5s5 1.8 5.7 5" />
        <path d="M16 11.2a2.7 2.7 0 1 0-.8-5.2M16.8 14.4c2.4.3 4 2 4.6 4.6" />
      </symbol>
      <symbol id="icon-chart" viewBox="0 0 24 24">
        <path d="M4 20.5h17" />
        <path d="M6.5 17V10M12 17V5M17.5 17v-8" />
        <path d="M5 20.5h14.5a1.5 1.5 0 0 0 1.5-1.5V4" />
      </symbol>
      <symbol id="icon-settings" viewBox="0 0 24 24">
        <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
        <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.4 1a8.6 8.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6a8.6 8.6 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.4 2.4-1a8.6 8.6 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8.6 8.6 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5Z" />
      </symbol>
      <symbol id="icon-search" viewBox="0 0 24 24">
        <path d="M10.8 18.1a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" />
        <path d="m16 16 5 5" />
      </symbol>
      <symbol id="icon-sidebar" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d="M9 4v16" />
      </symbol>
      <symbol id="icon-cloud-upload" viewBox="0 0 24 24">
        <path d="M8 18.5H6.8a4.3 4.3 0 0 1-.8-8.5 6 6 0 0 1 11.4-1.8A4.8 4.8 0 0 1 18 18.5h-2" />
        <path d="M12 19V11" />
        <path d="m8.5 14.5 3.5-3.5 3.5 3.5" />
      </symbol>
      <symbol id="icon-shield-check" viewBox="0 0 24 24">
        <path d="M12 3.2 19 6v5.2c0 4.6-2.8 8.2-7 9.6-4.2-1.4-7-5-7-9.6V6l7-2.8Z" />
        <path d="m8.7 12.2 2.1 2.1 4.5-4.8" />
      </symbol>
      <symbol id="icon-dollar-circle" viewBox="0 0 24 24">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path d="M14.7 8.7c-.6-.5-1.5-.8-2.6-.8-1.7 0-2.8.8-2.8 2s1 1.7 2.8 2.1c1.8.4 2.8.9 2.8 2.2s-1.1 2.1-2.9 2.1c-1.2 0-2.2-.3-3-1" />
        <path d="M12 6.5v11" />
      </symbol>
      <symbol id="icon-calendar" viewBox="0 0 24 24">
        <path d="M6.5 4.5v3M17.5 4.5v3" />
        <path d="M5 6.5h14A1.5 1.5 0 0 1 20.5 8v11A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V8A1.5 1.5 0 0 1 5 6.5Z" />
        <path d="M3.5 10.5h17" />
      </symbol>
      <symbol id="icon-headset" viewBox="0 0 24 24">
        <path d="M4.5 13.5V12a7.5 7.5 0 0 1 15 0v1.5" />
        <path d="M6.5 12.8h-1A1.5 1.5 0 0 0 4 14.3V17a1.5 1.5 0 0 0 1.5 1.5h1v-5.7Z" />
        <path d="M17.5 12.8h1A1.5 1.5 0 0 1 20 14.3V17a1.5 1.5 0 0 1-1.5 1.5h-1v-5.7Z" />
        <path d="M17.5 18.5c0 1.3-1.1 2-2.4 2H13" />
      </symbol>
      <symbol id="icon-arrow-right" viewBox="0 0 24 24">
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </symbol>
      <symbol id="icon-trash" viewBox="0 0 24 24">
        <path d="M5 7h14" />
        <path d="M9.5 4.5h5l1 1.5h-7l1-1.5Z" />
        <path d="M7.5 7.5 8.2 19a1.2 1.2 0 0 0 1.2 1.1h5.2a1.2 1.2 0 0 0 1.2-1.1l.7-11.5" />
        <path d="M10 10v5M14 10v5" />
      </symbol>
      <symbol id="icon-archive-down" viewBox="0 0 24 24">
        <path d="M4.5 5.5h15a1 1 0 0 1 1 1V8a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
        <path d="M5.5 9v9.5A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5V9" />
        <path d="M12 11.5v5M9.5 14l2.5 2.5L14.5 14" />
      </symbol>
      <symbol id="icon-trash-ios" viewBox="0 0 24 24">
        <path d="M4 6.5h16" />
        <path d="M9 6.5V5.4A1.4 1.4 0 0 1 10.4 4h3.2A1.4 1.4 0 0 1 15 5.4V6.5" />
        <path d="M6.2 6.5l.9 12.1A1.5 1.5 0 0 0 8.6 20h6.8a1.5 1.5 0 0 0 1.5-1.4l.9-12.1" />
        <path d="M10 10v6M14 10v6" />
      </symbol>
      <symbol id="icon-edit" viewBox="0 0 24 24">
        <path d="M14.5 5.5 18.5 9.5 8 20H4v-4Z" />
        <path d="m13 7 4 4" />
      </symbol>
      <symbol id="icon-store" viewBox="0 0 24 24">
        <path d="M4 10.5h16l-1.5-6h-13L4 10.5Z" />
        <path d="M5.5 10.5V20h13v-9.5" />
        <path d="M9 20v-5.5h6V20" />
        <path d="M4 10.5c.4 1.4 1.4 2.1 2.8 2.1s2.4-.7 2.8-2.1c.4 1.4 1.4 2.1 2.8 2.1s2.4-.7 2.8-2.1c.4 1.4 1.4 2.1 2.8 2.1s2.4-.7 2.8-2.1" />
      </symbol>
      <symbol id="icon-scan" viewBox="0 0 24 24">
        <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
        <path d="M7 8.5v7M10 8.5v7M13 8.5v7M16.5 8.5v7" />
      </symbol>
      <symbol id="icon-play" viewBox="0 0 24 24">
        <path d="M8 5.5v13l11-6.5-11-6.5Z" />
      </symbol>
      <symbol id="icon-lock" viewBox="0 0 24 24">
        <path d="M6.5 11V8a5.5 5.5 0 0 1 11 0v3" />
        <path d="M5.5 11h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" />
      </symbol>
      <symbol id="icon-book" viewBox="0 0 24 24">
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
        <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5Z" />
      </symbol>
      <symbol id="icon-plus" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </symbol>
      <symbol id="icon-bolt" viewBox="0 0 24 24">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
      </symbol>
      <symbol id="icon-tag" viewBox="0 0 24 24">
        <path d="M11.5 3.5h5A1.5 1.5 0 0 1 18 5v5L8.7 19.3a1.5 1.5 0 0 1-2.1 0l-3.9-3.9a1.5 1.5 0 0 1 0-2.1Z" />
        <path d="M14 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
      </symbol>
      <symbol id="icon-shuffle" viewBox="0 0 24 24">
        <path d="M3 6h3.5l9 12H19M3 18h3.5l3-4M16 6h3M19 6l-2.5 2.5M19 6l-2.5-2.5M19 18l-2.5 2.5M19 18l-2.5-2.5" />
      </symbol>
      <symbol id="icon-check-circle" viewBox="0 0 24 24">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path d="m8 12.5 2.5 2.5L16 9.5" />
      </symbol>
      <symbol id="icon-list" viewBox="0 0 24 24">
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
      </symbol>
      <symbol id="icon-info" viewBox="0 0 24 24">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path d="M12 11v5.5M12 7.5h.01" />
      </symbol>
      <symbol id="icon-chat" viewBox="0 0 24 24">
        <path d="M4 5.5h16v10H10l-4 3.5v-3.5H4Z" />
      </symbol>
      <symbol id="icon-handshake" viewBox="0 0 24 24">
        <path d="m2.5 11 4-3.5 3 1.5M21.5 11l-4-3.5-3 1.5" />
        <path d="m9.5 9-4 4 2 2 1.5-1.5M14.5 9l4 4-2 2-1.5-1.5" />
        <path d="m11 11.5 2 2" />
      </symbol>
      <symbol id="icon-building" viewBox="0 0 24 24">
        <path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h7A1.5 1.5 0 0 1 15 4.5V21" />
        <path d="M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21" />
        <path d="M9 7h2M9 11h2M9 15h2" />
        <path d="M3 21h18" />
      </symbol>
      <symbol id="icon-image" viewBox="0 0 24 24">
        <path d="M4.5 4.5h15v15h-15Z" />
        <path d="m4.5 16 4-4 3 3 4-5 4.5 4.5" />
        <path d="M9 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
      </symbol>
      <symbol id="icon-link" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.5-2.5a5 5 0 0 0-7.07-7.07L11 5" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-2.5 2.5a5 5 0 0 0 7.07 7.07L13 19" />
      </symbol>
      <symbol id="icon-alert-triangle" viewBox="0 0 24 24">
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4.5M12 17h.01" />
      </symbol>
      <symbol id="icon-x-circle" viewBox="0 0 24 24">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path d="m15 9-6 6M9 9l6 6" />
      </symbol>
      <symbol id="icon-cart" viewBox="0 0 24 24">
        <path d="M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
        <path d="M2.5 3h2.2l2.3 12.2a1.6 1.6 0 0 0 1.6 1.3h9a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
      </symbol>
      <symbol id="icon-map-pin" viewBox="0 0 24 24">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      </symbol>
      <symbol id="icon-chevron-down" viewBox="0 0 24 24">
        <path d="m6 9 6 6 6-6" />
      </symbol>
      <symbol id="icon-chevron-right" viewBox="0 0 24 24">
        <path d="m9 6 6 6-6 6" />
      </symbol>
      <symbol id="icon-chevron-left" viewBox="0 0 24 24">
        <path d="m15 6-6 6 6 6" />
      </symbol>
      <symbol id="icon-check" viewBox="0 0 24 24">
        <path d="m5 12.5 4.5 4.5L19 6.5" />
      </symbol>
      <symbol id="icon-x" viewBox="0 0 24 24">
        <path d="M6 6l12 12M18 6 6 18" />
      </symbol>
      <symbol id="icon-filter" viewBox="0 0 24 24">
        <path d="M3 5.5h18l-7 8v5l-4 2v-7Z" />
      </symbol>
      <symbol id="icon-plus-circle" viewBox="0 0 24 24">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path d="M12 8.5v7M8.5 12h7" />
      </symbol>
      <symbol id="icon-table" viewBox="0 0 24 24">
        <path d="M4 5.5h16v13H4Z" />
        <path d="M4 10h16M4 14.5h16M10 5.5v13" />
      </symbol>
      <symbol id="icon-grid" viewBox="0 0 24 24">
        <rect x="4" y="4" width="7" height="7" rx="1.4" />
        <rect x="13" y="4" width="7" height="7" rx="1.4" />
        <rect x="4" y="13" width="7" height="7" rx="1.4" />
        <rect x="13" y="13" width="7" height="7" rx="1.4" />
      </symbol>
      <symbol id="icon-truck" viewBox="0 0 24 24">
        <path d="M2.5 7.5h11v9H2.5Z" />
        <path d="M13.5 10.5h4l3 3v3H13.5Z" />
        <path d="M7 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM17 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
      </symbol>
      <symbol id="icon-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3.25 2.1" />
      </symbol>
      <symbol id="icon-bell" viewBox="0 0 24 24">
        <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8-2.5 8h17s-2.5-1.5-2.5-8Z" />
        <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
      </symbol>
      <symbol id="icon-eye" viewBox="0 0 24 24">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </symbol>
      <symbol id="icon-eye-off" viewBox="0 0 24 24">
        <path d="M9.9 4.7A10.6 10.6 0 0 1 12 4.5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4.1M6.6 6.6A18 18 0 0 0 2 11.5s3.5 7 10 7a10.6 10.6 0 0 0 4.1-.8" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        <path d="m3 3 18 18" />
      </symbol>
      <symbol id="icon-credit-card" viewBox="0 0 24 24">
        <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
        <path d="M2.5 9.5h19" />
      </symbol>
      <symbol id="icon-plug" viewBox="0 0 24 24">
        <path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8Z" />
        <path d="M12 16v5" />
      </symbol>
      <symbol id="icon-logout" viewBox="0 0 24 24">
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
        <path d="M10 17l-5-5 5-5" />
        <path d="M15 12H5" />
      </symbol>
      <symbol id="icon-refresh" viewBox="0 0 24 24">
        <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5" />
        <path d="M4 4v4.5h4.5" />
        <path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5" />
        <path d="M20 20v-4.5h-4.5" />
      </symbol>
    </svg>
  );
}

function BrandMark() {
  return (
    <img className="brand-mark" src="/logo.svg" alt="MedMKP" />
  );
}

function Icon({ name, className = "nav-icon" }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}

// Opens the rear camera and, where the browser supports the BarcodeDetector API
// (Chrome/Edge on Android, ChromeOS, and macOS), continuously scans frames and
// auto-fires onScan the moment a barcode lands in view — like a grocery scanner.
// Everywhere else (notably iOS Safari) the live preview still works and the
// returned capture() lets the shutter button trigger a scan on demand.
function useBarcodeScanner({ active, onScan }) {
  const videoRef = useRef(null);
  const [cameraStatus, setCameraStatus] = useState("requesting");
  const [autoDetect, setAutoDetect] = useState(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const captureRef = useRef(() => {});

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let stream;
    let isMounted = true;
    let intervalId;
    let cooldownId;
    let detector = null;
    let cooling = false;
    let lastCode = null;  // last code fired while it stays in frame
    let emptyFrames = 0;  // consecutive frames with no barcode in view

    // Fire one scan, then cool down briefly so flicker/misreads between frames
    // don't double-register. A barcode held continuously in frame is suppressed
    // by lastCode in the loop below, so this cooldown only debounces the handoff
    // from one code to the next.
    function fire(code) {
      if (cooling) return;
      cooling = true;
      lastCode = code || lastCode;
      if (navigator.vibrate) navigator.vibrate(50);
      onScanRef.current?.(code || null);
      cooldownId = window.setTimeout(() => { cooling = false; }, 1200);
    }

    async function detectFrame() {
      const video = videoRef.current;
      if (!video || !detector || video.readyState < 2) return null;
      try {
        const codes = await detector.detect(video);
        return codes && codes.length ? codes[0].rawValue : null;
      } catch (error) {
        return null;
      }
    }

    // Shutter press: read the current frame; proceed even if no barcode is
    // decoded so the manual capture path always adds an item.
    captureRef.current = async () => {
      fire(await detectFrame());
    };

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("unsupported");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraStatus("ready");

        // Prefer the native BarcodeDetector (Chrome/Edge/Android). iOS Safari —
        // and every WebKit browser on iPhone/iPad — doesn't ship it, so fall back
        // to the ZXing-C++ WebAssembly ponyfill. The older JavaScript ZXing reader
        // could decode clean UPC test cards but failed on five of the six real
        // dental labels in test/photos, especially Data Matrix and skewed codes.
        if ("BarcodeDetector" in window) {
          try {
            detector = new window.BarcodeDetector();
          } catch (error) {
            detector = null;
          }
        }

        if (!detector) {
          try {
            const { BarcodeDetector } = await import("barcode-detector/ponyfill");
            if (!isMounted) return;
            detector = new BarcodeDetector({
              formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128", "code_39", "data_matrix"],
            });
          } catch (error) {
            detector = null; // import failed → stay on manual entry
          }
        }

        if (detector && isMounted) {
          setAutoDetect(true);
          intervalId = window.setInterval(async () => {
            const code = await detectFrame();
            if (!code) {
              // Barcode out of view for a beat → let it fire again next time it's
              // presented, so the buyer can deliberately re-scan an item.
              if (++emptyFrames >= 3) lastCode = null;
              return;
            }
            emptyFrames = 0;
            if (code === lastCode) return;  // same barcode still in frame → ignore
            fire(code);
          }, 350);
        }
      } catch (error) {
        setCameraStatus("denied");
      }
    }

    openCamera();

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.clearTimeout(cooldownId);
      stream?.getTracks().forEach((track) => track.stop());
      captureRef.current = () => {};
    };
  }, [active]);

  const capture = useCallback(() => captureRef.current(), []);
  return { videoRef, cameraStatus, autoDetect, capture };
}

// The verify moment: after each scan/lookup, surface what matched so the buyer
// can confirm it at a glance before scanning the next item. Matched/review
// cards auto-dismiss so they don't block the next scan; a no-match card sticks
// around and offers a way to key the code in by hand.
function ScanResultCard({ result, className = "", onClear, onEnterManually }) {
  useEffect(() => {
    if (!result || result.status === "Not found") return undefined;
    const timer = window.setTimeout(() => onClear?.(), 3500);
    return () => window.clearTimeout(timer);
  }, [result, onClear]);

  if (!result) return null;
  const { item, status, isDuplicate, qty } = result;
  const notFound = status === "Not found";
  const offer = item.bestOffer;
  const price = offer?.price ?? (item.oldUnitPrice || null);
  const meta = CRL_STATUS[status] || CRL_STATUS.Review;

  return (
    <div
      className={`scan-result-card ${notFound ? "nomatch" : "match"} ${isDuplicate ? "duplicate" : ""} ${className}`}
      role="status"
      aria-live="polite"
      onClick={notFound ? undefined : onClear}
    >
      <button
        className="src-dismiss"
        type="button"
        aria-label="Dismiss"
        onClick={(event) => { event.stopPropagation(); onClear?.(); }}
      >
        <Icon name="icon-x" className="button-icon" />
      </button>
      <span className="src-thumb">
        {item.imageUrl
          ? <img src={item.imageUrl} alt="" loading="lazy" />
          : <Icon name={notFound ? "icon-x-circle" : "icon-check-circle"} className="button-icon" />}
      </span>
      <div className="src-body">
        <strong>{notFound ? "No catalog match" : item.product}</strong>
        <small>
          {notFound
            ? (item.barcode ? `Code ${item.barcode} — key it in or search` : "No code read — enter it manually")
            : isDuplicate
              ? "Already on your list — adjust the quantity there"
              : `${offer?.supplier || item.oldVendor || "Supplier pending"}${item.unit ? ` · ${item.unit}` : ""}`}
        </small>
      </div>
      <div className="src-right">
        {!notFound && !isDuplicate && price != null && <strong>{mrMoney(price)}</strong>}
        {!notFound && !isDuplicate && offer?.perUnit != null && <small>${mrEa(offer.perUnit)} / ea</small>}
        {isDuplicate
          ? <em className="src-pill duplicate">Already added</em>
          : <em className={`src-pill ${meta.cls}`}>{meta.label}</em>}
      </div>
      {notFound && (
        <button className="src-action" type="button" onClick={onEnterManually}>Enter code</button>
      )}
    </div>
  );
}

// Full-screen camera scanner: tap the bottom-nav scan FAB to drop into an
// immersive viewfinder. Barcodes auto-register one item each (dedup lives in
// addScannedItem + the scanner hook), a count badge on the bottom-right review
// button tallies what's been added this session, and the top-left ✕ (or the
// review button) drops back to the reorder list to adjust quantities.
function MobileScanItemView({ onBack, onScan, scanResult, onClearScanResult, scanCount }) {
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState("scan");
  const [captured, setCaptured] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const flashTimer = useRef();

  useEffect(() => {
    setIsMobile(window.matchMedia("(max-width: 767px)").matches);
  }, []);

  const { videoRef, cameraStatus, autoDetect } = useBarcodeScanner({
    active: isMobile && mode === "scan",
    onScan: (code) => {
      onScan?.(code);
      setCaptured(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  function submitManual(event) {
    event.preventDefault();
    const value = manualCode.trim();
    if (!value) return;
    onScan?.(value);
    setManualCode("");
  }

  return (
    <section className={`mobile-scan-screen ${captured ? "scan-captured" : ""}`} aria-label="Scan barcodes">
      <div className="mobile-camera-stage">
        <video ref={videoRef} className="mobile-camera-video" playsInline muted autoPlay aria-label="Live camera preview"></video>
        {cameraStatus !== "ready" && (
          <div className="camera-permission-state">
            <Icon name="icon-scan" className="mobile-control-icon" />
            <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
            <p>
              {cameraStatus === "requesting"
                ? "Allow camera access to scan item barcodes."
                : "Enable camera permissions for this site, or tap Enter code to key it in."}
            </p>
          </div>
        )}
        <div className="scan-instruction">
          {captured
            ? "Item added"
            : autoDetect
              ? "Point at a barcode"
              : "Live scanning isn’t supported here — tap Enter code"}
        </div>
        <div className="scan-frame" aria-hidden="true">
          <span className="corner top-left"></span>
          <span className="corner top-right"></span>
          <span className="corner bottom-left"></span>
          <span className="corner bottom-right"></span>
          <span className="scan-line"></span>
        </div>
        <ScanResultCard result={scanResult} className="floating" onClear={onClearScanResult} onEnterManually={() => setMode("manual")} />
      </div>

      <div className="scan-fs-top">
        <button className="scan-fs-close" type="button" onClick={onBack} aria-label="Close scanner">
          <Icon name="icon-x" className="scan-fs-close-icon" />
        </button>
        <button className="scan-fs-enter" type="button" onClick={() => setMode("manual")}>
          <Icon name="icon-plus-circle" className="button-icon" />
          Enter code
        </button>
      </div>

      <button
        className="scan-fs-review"
        type="button"
        onClick={onBack}
        aria-label={scanCount ? `Review ${scanCount} scanned item${scanCount === 1 ? "" : "s"}` : "Review reorder list"}
      >
        <Icon name="icon-scan" className="scan-fs-review-icon" />
        {scanCount > 0 && <span className="scan-fs-badge" aria-hidden="true">{scanCount > 99 ? "99+" : scanCount}</span>}
      </button>

      {mode === "manual" && (
        <div className="scan-fs-manual" role="dialog" aria-label="Enter barcode" aria-modal="true">
          <div className="scan-fs-manual-card">
            <header>
              <strong>Enter code</strong>
              <button type="button" onClick={() => setMode("scan")} aria-label="Back to camera">
                <Icon name="icon-x" className="button-icon" />
              </button>
            </header>
            <form onSubmit={submitManual}>
              <label className="mobile-manual-field">
                <Icon name="icon-scan" className="button-icon" />
                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="Enter barcode or SKU"
                  aria-label="Barcode or SKU"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                />
              </label>
              <button className="primary-action" type="submit" disabled={!manualCode.trim()}>
                <Icon name="icon-search" className="button-icon" />
                Look up
              </button>
            </form>
            <p className="mobile-manual-hint">Type the number printed under the barcode if the camera can’t read it.</p>
            <ScanResultCard result={scanResult} onClear={onClearScanResult} onEnterManually={() => setMode("manual")} />
          </div>
        </div>
      )}
    </section>
  );
}

function MobileBottomNav({ view, onNavigate, onScan }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile primary navigation">
      <div className="m-nav-group">
        <button className={view === "home" ? "active" : ""} type="button" onClick={() => onNavigate("home")}>
          <span><Icon name="icon-home" className="mobile-bottom-icon" /></span>Home
        </button>
        <button className={view === "catalog" || view === "catalogCategory" ? "active" : ""} type="button" onClick={() => onNavigate("catalog")}>
          <span><Icon name="icon-grid" className="mobile-bottom-icon" /></span>Catalog
        </button>
      </div>
      <button className="m-nav-fab" type="button" aria-label="Scan barcode" onClick={onScan}>
        <Icon name="icon-scan" className="m-nav-fab-icon" />
      </button>
      <div className="m-nav-group">
        <button className={view === "history" ? "active" : ""} type="button" onClick={() => onNavigate("history")}>
          <span><Icon name="icon-clock" className="mobile-bottom-icon" /></span>History
        </button>
        <button className={view === "settings" ? "active" : ""} type="button" onClick={() => onNavigate("settings")}>
          <span><Icon name="icon-settings" className="mobile-bottom-icon" /></span>Settings
        </button>
      </div>
    </nav>
  );
}

function LoggedOutLanding({ onNavigate, authed = false }) {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
          <BrandMark />
        </a>
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="/pricing" onClick={(event) => { event.preventDefault(); onNavigate("/pricing"); }}>Pricing</a>
          <a href="/about" onClick={(event) => { event.preventDefault(); onNavigate("/about"); }}>About</a>
        </nav>
        <div className="landing-nav-actions">
          {authed ? (
            <button className="primary-action compact" type="button" onClick={() => onNavigate("/app")}>Go to my list</button>
          ) : (
            <>
              <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
              <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up</button>
            </>
          )}
        </div>
      </header>

      <section className="landing-main">
        <div className="landing-copy">
          <h1>Scan your dental supplies and spot <span>possible savings</span> in seconds</h1>
          <p>Point your phone at a barcode or enter a SKU to identify the item, compare typical price ranges, and save it to a free starter reorder list. No login required to try it.</p>
          <div className="landing-actions">
            <button className="primary-action" type="button" onClick={() => onNavigate(authed ? "/app" : "/scan")}>
              <Icon name="icon-scan" className="button-icon" />
              Scan 3 items <em>FREE</em>
            </button>
            <button className="secondary-action" type="button" onClick={() => onNavigate("/sample")}>
              <Icon name="icon-play" className="button-icon" />
              See sample result
            </button>
          </div>
          <div className="landing-assurances">
            <span ><Icon name="icon-lock" className="button-icon" style={{ background: '#5fc08a' }} />No login</span>
            <span><Icon name="icon-book" className="button-icon" />Dental supply catalog</span>
            <span><Icon name="icon-bolt" className="button-icon" />Fast barcode match</span>
          </div>
        </div>

        <div className="landing-col-left">
          <div className="landing-instant" id="what-you-get">
            <h3>What you&rsquo;ll see instantly</h3>
            <div className="instant-grid">
              <div>
                <Icon name="icon-check-circle" className="landing-instant-icon green" />
                <strong>Product match</strong>
                <span>High confidence<br />92%</span>
              </div>
              <div>
                <Icon name="icon-tag" className="landing-instant-icon" />
                <strong>Typical price range</strong>
                <span>$11.80 &ndash; $13.50<br />per bag</span>
              </div>
              <div>
                <Icon name="icon-shuffle" className="landing-instant-icon" />
                <strong>Possible lower-cost alternatives</strong>
                <span>See 3-6 matches</span>
              </div>
              <div>
                <Icon name="icon-list" className="landing-instant-icon" />
                <strong>Starter reorder list</strong>
                <span>Save items and build your list</span>
              </div>
            </div>
            <p className="landing-instant-note">
              <Icon name="icon-info" className="button-icon" />
              Exact savings require your invoice, last paid price, or office order history. Public scan results show benchmark estimates.
            </p>
          </div>
        </div>

        <div className="landing-col-right">
          <div className="landing-cta">
            <h2>Want office-specific savings?</h2>
            <div className="landing-cta-body">
              <div>
                <p>Upload one invoice or tell us your last paid price to unlock exact savings comparisons, reorder memory, and supplier-aware recommendations.</p>
                <div className="landing-actions">
                  <button className="primary-action" type="button" onClick={() => onNavigate("/signup")}>
                    <Icon name="icon-cloud-upload" className="button-icon" />
                    Start free
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onNavigate("/about")}>
                    <Icon name="icon-chat" className="button-icon" />
                    Talk to us
                  </button>
                </div>
              </div>
              <Icon name="icon-clipboard" className="landing-cta-icon" />
            </div>
          </div>
        </div>

        <div className="landing-steps" id="how-it-works">
          <h2>How it works &mdash; 3 simple steps</h2>
          <div>
            <article>
              <span className="landing-step-number">1</span>
              <Icon name="icon-scan" className="landing-step-icon" />
              <strong>Scan a barcode</strong>
              <p>Use your phone camera to scan any product barcode.</p>
            </article>
            <Icon name="icon-arrow-right" className="landing-step-arrow" />
            <article>
              <span className="landing-step-number">2</span>
              <Icon name="icon-chart" className="landing-step-icon" />
              <strong>See the item and benchmark</strong>
              <p>We identify the item and show typical price ranges and matches.</p>
            </article>
            <Icon name="icon-arrow-right" className="landing-step-arrow" />
            <article>
              <span className="landing-step-number">3</span>
              <Icon name="icon-list" className="landing-step-icon" />
              <strong>Save it or continue free</strong>
              <p>Add it to your starter reorder list or keep scanning.</p>
            </article>
          </div>
        </div>
      </section>

      <footer className="trusted-strip">
        <div>
          <span><Icon name="icon-handshake" className="button-icon" />Works with Henry Schein, Patterson, Darby, and generic barcodes</span>
          <span><Icon name="icon-building" className="button-icon" />Built for dental offices<br /><small>Designed around how your office buys.</small></span>
        </div>
      </footer>
    </main>
  );
}

// Public, unauthenticated preview reached from "See sample result". Renders the
// real CurrentReorderList in its sample state (no items, untouched) inside a
// light public shell, so the demo matches the live app exactly. Actions that
// would mutate a real workspace (upload, scan, archive, clear) nudge the visitor
// to sign up; browsing the list and opening a row work so it feels live. /app
// itself stays auth-guarded — this is the only public window onto the list.
function SampleReorderList({ onNavigate, authed = false }) {
  const sampleFormRef = useRef(null);
  const [prefs, setPrefs] = useState(DEFAULT_BUYING_PREFS);
  const [toast, setToast] = useState("");
  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2200);
  };
  const nudge = () => onNavigate("/signup");
  return (
    <div className="app-shell sample-shell">
      <header className="sample-topbar">
        <button className="topbar-brand" type="button" onClick={() => onNavigate("/")} aria-label="MedMKP home">
          <BrandMark />
        </button>
        <span className="sample-tag">Sample reorder list — explore freely</span>
        <div className="topbar-right">
          {authed ? (
            <button className="primary-action compact" type="button" onClick={() => onNavigate("/app")}>Go to my list</button>
          ) : (
            <>
              <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
              <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up free</button>
            </>
          )}
        </div>
      </header>
      <div className="app-body">
        <main className="app-main">
          <CurrentReorderList
            items={[]}
            addMode=""
            onAddMode={nudge}
            lastUpload={null}
            onCloseUpload={() => {}}
            onUploadAnother={() => {}}
            uploadFormRef={sampleFormRef}
            onUpload={nudge}
            uploading={false}
            uploadProgress={0}
            uploadElapsed={0}
            uploadError=""
            onCancelUpload={() => {}}
            onClearUploadError={() => {}}
            isDraggingInvoice={false}
            onDragStateChange={() => {}}
            onInvoiceDrop={nudge}
            onInvoiceFile={nudge}
            selectedInvoiceName=""
            hasUploadedInvoice={false}
            onScan={nudge}
            searchTerm=""
            onSearchTerm={() => {}}
            searchResults={[]}
            searchLoading={false}
            onNavigate={onNavigate}
            onToast={showToast}
            listTouched={false}
            allowSample
            buyingPrefs={prefs}
            onBuyingPrefs={setPrefs}
            onArchiveList={nudge}
            onClearList={nudge}
          />
        </main>
      </div>
      <div className="sample-mobile-cta">
        <span>You&rsquo;re viewing a sample list</span>
        <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up free</button>
      </div>
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

// The free, no-login scan funnel reached from the landing "Scan 3 items free"
// CTA. Reuses the real camera/decoder hook and ScanResultCard so a public scan
// looks exactly like the in-app one; the parent meters the free-scan budget and
// passes it in. When the budget is gone the signup wall slides over the card —
// the final result stays visible for a beat first so the visitor sees the payoff.
function PublicScanView({ onScan, scanResult, onClearScanResult, freeScansUsed, limit, onSignup, onLogin, onHome, onApp, authed = false }) {
  const [manualCode, setManualCode] = useState("");
  const [captured, setCaptured] = useState(false);
  const flashTimer = useRef();
  const exhausted = freeScansUsed >= limit;
  const remaining = Math.max(0, limit - freeScansUsed);

  // Hold the wall back briefly after the last scan so its result card is seen.
  const [gateVisible, setGateVisible] = useState(false);
  useEffect(() => {
    if (!exhausted) {
      setGateVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setGateVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [exhausted]);

  const { videoRef, cameraStatus, autoDetect, capture } = useBarcodeScanner({
    active: !exhausted,
    onScan: (code) => {
      onScan?.(code);
      setCaptured(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  function submitManual(event) {
    event.preventDefault();
    const value = manualCode.trim();
    if (!value || exhausted) return;
    onScan?.(value);
    setManualCode("");
  }

  return (
    <main className="pscan-page">
      <header className="pscan-header">
        <button className="landing-brand" type="button" onClick={onHome} aria-label="MedMKP home">
          <BrandMark />
        </button>
        <div className="pscan-header-actions">
          {authed ? (
            <button className="primary-action compact" type="button" onClick={onApp}>Go to my list</button>
          ) : (
            <>
              <button className="secondary-action compact" type="button" onClick={onLogin}>Log in</button>
              <button className="primary-action compact" type="button" onClick={onSignup}>Sign up</button>
            </>
          )}
        </div>
      </header>

      <section className="pscan-body">
        <div className="pscan-intro">
          <h1>Scan a product to see its price benchmark</h1>
          <p>Point your camera at any dental supply barcode &mdash; or key in the code &mdash; to identify the item and compare typical prices. {limit} scans free, no login required.</p>
        </div>

        <div className={`pscan-card ${captured ? "scan-captured" : ""}`}>
          <div className="pscan-stage">
            <video ref={videoRef} className="pscan-video" playsInline muted autoPlay aria-label="Live camera preview"></video>
            {cameraStatus !== "ready" && (
              <div className="pscan-permission">
                <Icon name="icon-scan" className="pscan-permission-icon" />
                <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
                <p>
                  {cameraStatus === "requesting"
                    ? "Allow camera access to scan a barcode, or type the code below."
                    : "Enable camera permissions for this site, or type the code below."}
                </p>
              </div>
            )}
            <div className="pscan-frame" aria-hidden="true">
              <span className="corner top-left"></span>
              <span className="corner top-right"></span>
              <span className="corner bottom-left"></span>
              <span className="corner bottom-right"></span>
              <span className="scan-line"></span>
            </div>
            <div className="pscan-instruction">
              {captured
                ? "Got it"
                : autoDetect
                  ? "Point at a barcode"
                  : "Align the barcode, then tap Scan"}
            </div>
            <span className="pscan-counter">{remaining} of {limit} free scans left</span>
          </div>

          <div className="pscan-controls">
            <button
              className="pscan-shutter"
              type="button"
              onClick={capture}
              disabled={cameraStatus !== "ready" || exhausted}
            >
              <Icon name="icon-scan" className="button-icon" />
              Scan barcode
            </button>
            <form className="pscan-manual" onSubmit={submitManual}>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="…or enter a barcode / SKU"
                aria-label="Barcode or SKU"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                disabled={exhausted}
              />
              <button className="secondary-action" type="submit" disabled={!manualCode.trim() || exhausted}>
                Look up
              </button>
            </form>
          </div>

          <ScanResultCard result={scanResult} onClear={onClearScanResult} onEnterManually={() => {}} />
        </div>
      </section>

      {gateVisible && (
        <div className="pscan-gate" role="dialog" aria-modal="true" aria-label="Sign up to keep scanning">
          <div className="pscan-gate-card">
            <Icon name="icon-lock" className="pscan-gate-icon" />
            <h2>That&rsquo;s your {limit} free scans</h2>
            <p>Sign up free to keep scanning, save your reorder list, and compare prices across suppliers. Your scanned items are waiting in your list.</p>
            <button className="primary-action" type="button" onClick={onSignup}>
              <Icon name="icon-cloud-upload" className="button-icon" />
              Sign up free
            </button>
            <button className="secondary-action" type="button" onClick={onLogin}>Log in</button>
            <button className="pscan-gate-back" type="button" onClick={onHome}>Back to home</button>
          </div>
        </div>
      )}
    </main>
  );
}

function PublicNav({ onNavigate, active, authed = false }) {
  return (
    <header className="landing-nav">
      <a className="landing-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
        <BrandMark />
      </a>
      <nav aria-label="Marketing navigation">
        <a href="/#how-it-works" onClick={(event) => { event.preventDefault(); onNavigate("/"); }}>How it works</a>
        <a href="/pricing" className={active === "pricing" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("/pricing"); }}>Pricing</a>
        <a href="/about" className={active === "about" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("/about"); }}>About</a>
      </nav>
      <div className="landing-nav-actions">
        {authed ? (
          <button className="primary-action compact" type="button" onClick={() => onNavigate("/app")}>Go to my list</button>
        ) : (
          <>
            <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
            <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up</button>
          </>
        )}
      </div>
    </header>
  );
}

function PricingPage({ onNavigate, authed = false }) {
  const tiers = [
    { name: "Starter", price: "Free", per: "", blurb: "For trying it out", cta: "Start free", to: "/signup", featured: false, features: ["Scan & search products", "1 reorder list", "Benchmark price ranges"] },
    { name: "Practice", price: "$199", per: "/mo", blurb: "For a single office", cta: "Start free trial", to: "/signup", featured: true, features: ["Unlimited reorder lists", "Invoice upload & matching", "Supplier handoffs", "Price alerts"] },
    { name: "Group", price: "Custom", per: "", blurb: "For multi-location groups", cta: "Contact sales", to: "/about", featured: false, features: ["Everything in Practice", "Multiple locations", "Team roles & approvals", "Priority support"] },
  ];
  return (
    <main className="public-page">
      <PublicNav onNavigate={onNavigate} active="pricing" authed={authed} />
      <div className="public-body">
        <section className="public-hero">
          <h1>Simple pricing for dental offices</h1>
          <p>Start free. Upgrade when you&rsquo;re ready to optimize every reorder.</p>
        </section>
        <section className="pricing-tiers">
          {tiers.map((tier) => (
            <article className={`pricing-card ${tier.featured ? "featured" : ""}`} key={tier.name}>
              {tier.featured && <span className="pricing-badge">Most popular</span>}
              <h3>{tier.name}</h3>
              <div className="pricing-price"><strong>{tier.price}</strong>{tier.per && <small>{tier.per}</small>}</div>
              <p className="pricing-blurb">{tier.blurb}</p>
              <ul className="pricing-features">
                {tier.features.map((feature) => <li key={feature}><Icon name="icon-check" className="button-icon" />{feature}</li>)}
              </ul>
              <button className={tier.featured ? "primary-action" : "secondary-action"} type="button" onClick={() => onNavigate(tier.to)}>{tier.cta}</button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function AboutPage({ onNavigate, authed = false }) {
  return (
    <main className="public-page">
      <PublicNav onNavigate={onNavigate} active="about" authed={authed} />
      <div className="public-body">
        <section className="public-hero">
          <h1>We help dental offices buy supplies smarter</h1>
          <p>MedMKP turns your invoices and barcodes into a clean, matched reorder list, so you can compare prices across suppliers and reorder in minutes instead of hours.</p>
        </section>
        <section className="about-grid">
          <div><Icon name="icon-scan" className="about-icon" /><strong>Scan or upload</strong><p>Capture items by barcode, photo, or invoice upload.</p></div>
          <div><Icon name="icon-shuffle" className="about-icon" /><strong>Match &amp; compare</strong><p>We match to a canonical catalog and surface the best-value supplier.</p></div>
          <div><Icon name="icon-handshake" className="about-icon" /><strong>Hand off &amp; reorder</strong><p>Group by supplier and hand off a ready-to-order plan.</p></div>
        </section>
        <section className="about-cta">
          <h2>Ready to try it?</h2>
          <button className="primary-action" type="button" onClick={() => onNavigate("/signup")}>Create your free account</button>
        </section>
      </div>
    </main>
  );
}

function AuthShell({ subtitle, children, onNavigate }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <a className="auth-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
          <BrandMark />
        </a>
        {children}
      </div>
    </main>
  );
}

function LoginPage({ onNavigate, onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not sign in.");
        return;
      }
      onAuthed();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your MedMKP workspace." onNavigate={onNavigate}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label><span>Email</span><input type="email" placeholder="you@practice.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Password</span><input type="password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="auth-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
        <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="auth-alt"><a href="/forgot-password" onClick={(event) => { event.preventDefault(); onNavigate("/forgot-password"); }}>Forgot your password?</a></p>
      <p className="auth-alt">New to MedMKP? <a href="/signup" onClick={(event) => { event.preventDefault(); onNavigate("/signup"); }}>Create an account</a></p>
    </AuthShell>
  );
}

function SignupPage({ onNavigate, onAuthed }) {
  const [practiceName, setPracticeName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceName, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not create account.");
        return;
      }
      onAuthed();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start optimizing your dental supply reorders." onNavigate={onNavigate}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label><span>Practice name</span><input type="text" placeholder="Bright Smiles Dental" value={practiceName} onChange={(event) => setPracticeName(event.target.value)} required /></label>
        <label><span>Email</span><input type="email" placeholder="you@practice.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Password</span><input type="password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="auth-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
        <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create account"}</button>
      </form>
      <p className="auth-alt">Already have an account? <a href="/login" onClick={(event) => { event.preventDefault(); onNavigate("/login"); }}>Log in</a></p>
    </AuthShell>
  );
}

function ForgotPasswordPage({ onNavigate }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* show the same neutral confirmation regardless of outcome */
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <AuthShell onNavigate={onNavigate}>
      {sent ? (
        <>
          <h1>Check your email</h1>
          <p className="auth-sub">
            If an account exists for {email}, we&apos;ve sent a link to reset your password.
            For your security, the link expires soon.
          </p>
          <button className="primary-action" type="button" style={{ marginTop: 20, width: "100%" }} onClick={() => onNavigate("/login")}>Back to sign in</button>
        </>
      ) : (
        <>
          <h1>Reset your password</h1>
          <p className="auth-sub">Enter your email and we&apos;ll send you a secure reset link.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>Email</span><input type="email" placeholder="you@practice.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send reset link"}</button>
          </form>
          <p className="auth-alt"><a href="/login" onClick={(event) => { event.preventDefault(); onNavigate("/login"); }}>Back to sign in</a></p>
        </>
      )}
    </AuthShell>
  );
}

function ResetPasswordPage({ onNavigate }) {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
    setEmail((params.get("email") || "").toLowerCase());
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not reset your password.");
        return;
      }
      onNavigate("/login");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell onNavigate={onNavigate}>
      <h1>Set a new password</h1>
      {!token || !email ? (
        <>
          <p className="auth-sub">This reset link is invalid or incomplete. Please request a new one.</p>
          <button className="primary-action" type="button" style={{ marginTop: 20, width: "100%" }} onClick={() => onNavigate("/forgot-password")}>Request a new link</button>
        </>
      ) : (
        <>
          <p className="auth-sub">Choose a strong password for your account.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>New password</span><input type="password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label><span>Confirm password</span><input type="password" placeholder="Re-enter password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
            {error && <p className="auth-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
            <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Updating…" : "Update password"}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export default function Home() {
  const uploadFormRef = useRef(null);
  const searchRef = useRef(null);
  const searchWrapRef = useRef(null);
  const userWrapRef = useRef(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState(null);
  const [view, setViewState] = useState("landing");
  const [historyId, setHistoryId] = useState(null);
  const [selectedHandoffId, setSelectedHandoffId] = useState(null);
  const [productHandle, setProductHandle] = useState(null);
  const [categorySlug, setCategorySlug] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadElapsed, setUploadElapsed] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const uploadAbortRef = useRef(null);
  const uploadCancelledRef = useRef(false);
  const [isDraggingInvoice, setIsDraggingInvoice] = useState(false);
  const [selectedInvoiceName, setSelectedInvoiceName] = useState("");
  const [hasUploadedInvoice, setHasUploadedInvoice] = useState(false);
  const [mobileAddItemRoute, setMobileAddItemRoute] = useState(false);
  const [addMode, setAddMode] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [freeScansUsed, setFreeScansUsed] = useState(0);
  const [lastUpload, setLastUpload] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [canonicalResults, setCanonicalResults] = useState([]);
  const [canonicalSource, setCanonicalSource] = useState("idle");
  const [searchLoading, setSearchLoading] = useState(false);
  const [archivedLists, setArchivedLists] = useState([]);
  // Pending confirmation for a destructive whole-list action (archive / clear).
  // Null when no dialog is open; otherwise holds the modal copy + onConfirm.
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [handoffs, setHandoffs] = useState([]);
  // Id of the handoff prepared for the live list, or null. Drives the live
  // list's "Handed off" status and links the archive entry to its handoff.
  const [currentHandoffId, setCurrentHandoffId] = useState(null);
  // Whether the buyer has deliberately advanced the list from "draft" to
  // "review" (the Review & optimize gate). The pill state is still *derived* —
  // this only "sticks" while every item is reviewed (see deriveListStatus + the
  // auto-revert effect below), so the pill can never overstate the list.
  const [listStage, setListStage] = useState("draft");
  const [cartGroup, setCartGroup] = useState(null);
  const [liveStockByUrl, setLiveStockByUrl] = useState({});
  const liveStockCacheRef = useRef(new Map());
  const liveStockHydratedRef = useRef(false);
  const liveStockRequestsRef = useRef(new Set());
  const [listTouched, setListTouched] = useState(false);
  const [listName, setListName] = useState("June Restock");
  const [buyingPrefs, setBuyingPrefs] = useState(DEFAULT_BUYING_PREFS);
  const [defaultBuyingPrefs, setDefaultBuyingPrefs] = useState(DEFAULT_BUYING_PREFS);
  const [supplierOptions, setSupplierOptions] = useState([]);
  // Per-supplier shipping policy keyed by normalized supplier name, used to
  // estimate landed cost on the reorder list. Empty until /api/suppliers loads.
  const [supplierShipping, setSupplierShipping] = useState({});
  const [stateLoaded, setStateLoaded] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const serverLoadStartedRef = useRef(false);
  const saveTimerRef = useRef(null);
  // Holds the most recent state blob (mirrors the debounced save). Lets
  // refreshFromServer merge against the freshest local items, so a manual
  // refresh can't drop items the debounced save hasn't persisted yet.
  const latestBlobRef = useRef(null);

  // Apply a saved app-state blob (from localStorage or the per-practice server
  // store) to component state.
  const hydrateFromState = (saved) => {
    if (!saved) return;
    const savedDefaults = { ...DEFAULT_BUYING_PREFS, ...(saved.defaultBuyingPrefs || {}) };
    // Backfill ids on lists saved before stable ids existed, so verification
    // decisions have a row to write back to.
    const items = (saved.draftItems || []).map((item) => (item.id ? item : { ...item, id: newItemId() }));
    setDraftItems(items);
    setUploadedDocs(saved.uploadedDocs || []);
    setArchivedLists(saved.archivedLists || []);
    setHandoffs(saved.handoffs || []);
    setCurrentHandoffId(saved.currentHandoffId || null);
    setListStage(saved.listStage === "review" ? "review" : "draft");
    setListTouched(Boolean(saved.listTouched));
    if (saved.listName) setListName(saved.listName);
    setDefaultBuyingPrefs(savedDefaults);
    // A list with no items is "new", so it starts from the saved defaults;
    // an in-progress list keeps its own working preferences.
    setBuyingPrefs(items.length ? { ...DEFAULT_BUYING_PREFS, ...(saved.buyingPrefs || {}) } : savedDefaults);
    if (items.length) setHasUploadedInvoice(true);
  };

  // Hydrate from localStorage first for an instant paint; the per-practice
  // server store (loaded below once auth is known) takes over for cross-device
  // sync. localStorage stays as an offline cache + migration source.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(APP_STATE_KEY) || "null");
      if (saved) hydrateFromState(saved);
    } catch {
      // ignore corrupt state
    }
    try {
      const used = parseInt(window.localStorage.getItem(FREE_SCAN_KEY) || "0", 10);
      if (Number.isFinite(used) && used > 0) setFreeScansUsed(used);
    } catch {
      // ignore corrupt state
    }
    try {
      if (window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1") setNavCollapsed(true);
    } catch {
      // ignore corrupt state
    }
    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the sidebar collapse preference per-device.
  useEffect(() => {
    if (!stateLoaded) return;
    try {
      window.localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
    } catch {
      // storage unavailable — non-fatal
    }
  }, [stateLoaded, navCollapsed]);

  // Once we know the visitor is signed in, pull the practice's saved list. A
  // server list wins (it's the cross-device source of truth); if there's none
  // yet, migrate any in-progress local list up once so it isn't lost.
  useEffect(() => {
    if (authed !== true || serverLoadStartedRef.current) return;
    serverLoadStartedRef.current = true;
    (async () => {
      try {
        const response = await fetch("/api/reorder-list", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const local = JSON.parse(window.localStorage.getItem(APP_STATE_KEY) || "null");
        const localItems = local && (local.draftItems || []).length ? local.draftItems.length : 0;
        const serverItems = data && data.state ? (data.state.draftItems || []).length : 0;
        // The server list is normally the cross-device source of truth. But a
        // refresh within the 800ms save debounce can lose an in-flight save, so
        // the server may be stale/empty while localStorage still holds the just-
        // edited list. In that case keep local and push it back up, rather than
        // clobbering the working list with empty server state.
        if (data && data.state && serverItems >= localItems) {
          hydrateFromState(data.state);
        } else if (localItems) {
          await fetch("/api/reorder-list", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(local),
          });
        } else if (data && data.state) {
          hydrateFromState(data.state);
        }
      } catch {
        // offline / server down — keep whatever localStorage hydrated.
      }
      setServerReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (!stateLoaded) return;
    const blob = { draftItems, uploadedDocs, archivedLists, handoffs, currentHandoffId, listStage, listTouched, listName, buyingPrefs, defaultBuyingPrefs };
    latestBlobRef.current = blob;
    try {
      window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(blob));
    } catch {
      // storage full / unavailable — non-fatal
    }
    // Mirror to the server (debounced, last-write-wins). Gated on serverReady so
    // a save can't race ahead of the initial load and clobber the stored list.
    if (authed === true && serverReady) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        fetch("/api/reorder-list", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(blob),
        }).catch(() => {
          // offline — localStorage still holds it; next change retries.
        });
      }, 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateLoaded, draftItems, uploadedDocs, archivedLists, handoffs, currentHandoffId, listStage, listTouched, listName, buyingPrefs, defaultBuyingPrefs, authed, serverReady]);

  // Flush a pending (debounced) save when the tab is hidden or unloaded, so a
  // refresh/close within the 800ms save window can't drop the latest edits.
  // `keepalive` lets the PUT outlive the page; pagehide covers the bfcache and
  // mobile-Safari cases beforeunload misses.
  useEffect(() => {
    if (authed !== true) return;
    const flush = () => {
      if (!pendingSaveRef.current || !latestBlobRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      try {
        fetch("/api/reorder-list", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(latestBlobRef.current),
          keepalive: true,
        });
        pendingSaveRef.current = false;
      } catch {
        // best-effort; localStorage still holds the blob for next load
      }
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [authed]);

  // Supplier names for the preferred-supplier picker, plus each supplier's
  // shipping policy for landed-cost estimates on the reorder list.
  useEffect(() => {
    fetch("/api/suppliers")
      .then((response) => response.json())
      .then(({ suppliers }) => {
        const list = suppliers || [];
        setSupplierOptions(list.map((supplier) => supplier.name));
        setSupplierShipping(buildShippingByName(list));
      })
      .catch(() => {
        setSupplierOptions([]);
        setSupplierShipping({});
      });
  }, []);

  useEffect(() => {
    function syncViewFromLocation() {
      const nextRoute = viewFromPath(window.location.pathname + window.location.search);
      setIsLoggedIn(nextRoute.isLoggedIn);
      setViewState(nextRoute.view);
      setHistoryId(nextRoute.historyId || null);
      setSelectedHandoffId(nextRoute.handoffId || null);
      setProductHandle(nextRoute.productHandle || null);
      setCategorySlug(nextRoute.categorySlug || null);
      setSearchQuery(nextRoute.searchQuery || "");
      setMobileAddItemRoute(Boolean(nextRoute.mobileAddItemRoute));
      setMenuOpen(false);
    }

    syncViewFromLocation();
    window.addEventListener("popstate", syncViewFromLocation);

    return () => window.removeEventListener("popstate", syncViewFromLocation);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => {
        setAuthed(Boolean(data.authenticated));
        setMe(data.authenticated ? { customer: data.customer || null, practice: data.practice || null } : null);
      })
      .catch(() => setAuthed(false));
  }, []);

  // Keep unauthenticated visitors out of the authenticated app routes, and send
  // already-signed-in visitors from the public free-scan page into the real app.
  useEffect(() => {
    if (authed === false && isLoggedIn) {
      navigate("/login");
    } else if (authed === true && view === "publicScan") {
      navigate("/app");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, isLoggedIn, view]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    fetch("/api/catalog")
      .then((response) => response.json())
      .then(({ categories }) => {
        setCatalog(categories || []);
      })
      .catch(() => {
        setCatalog([]);
      });
  }, []);

  useEffect(() => {
    const query = searchTerm.trim();
    if (!query) {
      setCanonicalResults([]);
      setCanonicalSource("idle");
      setSearchLoading(false);
      return undefined;
    }

    setSearchLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(query)}&limit=8`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then(({ canonical_products: products, source }) => {
          setCanonicalResults(products || []);
          setCanonicalSource(source || "fallback");
          setSearchLoading(false);
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          setCanonicalResults([]);
          setCanonicalSource("fallback");
          setSearchLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm]);

  // Close the account menu and search-results dropdown on outside click or Esc,
  // like a normal UI. (A fixed backdrop alone is unreliable here because the
  // sticky/blurred topbar forms its own stacking context.)
  useEffect(() => {
    if (!userMenuOpen && !searchTerm.trim()) return undefined;
    const onPointerDown = (event) => {
      if (userMenuOpen && userWrapRef.current && !userWrapRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
      if (searchTerm.trim() && searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        setSearchTerm("");
      }
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (userMenuOpen) setUserMenuOpen(false);
      if (searchTerm.trim()) setSearchTerm("");
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen, searchTerm]);

  // Honest progress: creep toward — but never reach — 100% while the request is
  // in flight, so the bar only completes when the server actually responds
  // (no more "100% then frozen"). Also track elapsed time so the modal can
  // surface a "catalog is warming up" hint on a slow first match.
  useEffect(() => {
    if (!uploading) {
      setUploadProgress(0);
      setUploadElapsed(0);
      return undefined;
    }

    setUploadProgress(8);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setUploadElapsed(Date.now() - startedAt);
      setUploadProgress((value) => (value >= 95 ? 95 : value + Math.max(0.4, (95 - value) * 0.06)));
    }, 300);

    return () => window.clearInterval(id);
  }, [uploading]);

  const visibleDraftItems = draftItems.filter((item) => item.documentIds.some((documentId) => uploadedDocs.some((doc) => doc.id === documentId)));
  const activeDraftItems = visibleDraftItems.filter((item) => item.included);
  const activePlanItems = applyLiveStock(activeDraftItems, liveStockByUrl);

  const recordLiveStock = useCallback((entries) => {
    if (!Array.isArray(entries) || !entries.length) return;
    const nextLive = {};
    for (const entry of entries) {
      const key = shopifyStockKey(entry?.productUrl);
      if (!key) continue;
      const available = typeof entry.available === "boolean" ? entry.available : null;
      liveStockCacheRef.current.set(key, available);
      if (available !== null) nextLive[key] = available;
    }
    if (Object.keys(nextLive).length) {
      setLiveStockByUrl((current) => ({ ...current, ...nextLive }));
    }
    try {
      window.sessionStorage.setItem(
        SHOPIFY_STOCK_SESSION_KEY,
        JSON.stringify(Object.fromEntries(liveStockCacheRef.current))
      );
    } catch {
      // Session storage is an optimization; live state still works in memory.
    }
  }, []);

  // On the reorder list or plan, confirm only selected Shopify-looking offers.
  // Successful and failed attempts are cached for the tab session so revisiting
  // either view does not repeatedly hit supplier storefronts.
  useEffect(() => {
    if (view !== "plan" && view !== "home") return undefined;

    if (!liveStockHydratedRef.current) {
      liveStockHydratedRef.current = true;
      try {
        const cached = JSON.parse(window.sessionStorage.getItem(SHOPIFY_STOCK_SESSION_KEY) || "{}");
        const cachedLive = {};
        for (const [key, value] of Object.entries(cached || {})) {
          const available = typeof value === "boolean" ? value : null;
          liveStockCacheRef.current.set(key, available);
          if (available !== null) cachedLive[key] = available;
        }
        if (Object.keys(cachedLive).length) setLiveStockByUrl((current) => ({ ...cachedLive, ...current }));
      } catch {
        // Corrupt/unavailable session storage simply starts a fresh cache.
      }
    }

    const rows = deriveMatchRows(activeDraftItems, buyingPrefs);
    const pendingByKey = new Map();
    for (const row of rows) {
      const key = shopifyStockKey(row.productUrl);
      if (!key || liveStockCacheRef.current.has(key) || liveStockRequestsRef.current.has(key)) continue;
      pendingByKey.set(key, row.productUrl);
      if (pendingByKey.size >= SHOPIFY_STOCK_MAX_ITEMS) break;
    }
    if (!pendingByKey.size) return undefined;

    for (const key of pendingByKey.keys()) liveStockRequestsRef.current.add(key);
    const controller = new AbortController();
    fetch("/api/shopify-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productUrls: [...pendingByKey.values()] }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(({ stock }) => {
        const byKey = new Map((stock || []).map((entry) => [shopifyStockKey(entry.productUrl), entry]));
        recordLiveStock([...pendingByKey].map(([key, productUrl]) => byKey.get(key) || { productUrl, available: null }));
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          recordLiveStock([...pendingByKey.values()].map((productUrl) => ({ productUrl, available: null })));
        }
      })
      .finally(() => {
        for (const key of pendingByKey.keys()) liveStockRequestsRef.current.delete(key);
      });

    return () => controller.abort();
  }, [view, draftItems, uploadedDocs, buyingPrefs, recordLiveStock]);

  // Real summary of the current reorder list for the product-page rail (matches
  // how archiveCurrentList tallies items/suppliers/spend).
  const listSummary = useMemo(() => {
    const rows = deriveMatchRows(activeDraftItems, buyingPrefs);
    const suppliers = new Set(rows.map((row) => row.supplier).filter((name) => name && name !== "—"));
    const spend = rows.reduce((sum, row) => sum + (row.lineTotal || 0), 0);
    return { items: rows.length, suppliers: suppliers.size, spend };
  }, [activeDraftItems, buyingPrefs]);

  // Lifecycle status of the live list (Draft → Review & optimize → Handed off)
  // for the Home header pill, derived the same way archives compute their final
  // status. listStage only promotes the pill to "review" while every item is
  // reviewed — the derivation, not the stored flag, is the source of truth.
  const liveListStatus = useMemo(
    () => deriveListStatus(deriveMatchRows(activeDraftItems, buyingPrefs), Boolean(currentHandoffId), listStage),
    [activeDraftItems, buyingPrefs, currentHandoffId, listStage]
  );

  // Auto-revert to "draft" if the list empties out while in "review" (e.g. every
  // item removed), so a freshly-repopulated list starts as a Draft again.
  useEffect(() => {
    if (listStage === "review" && activeDraftItems.length === 0) setListStage("draft");
  }, [activeDraftItems, listStage]);

  // Who's signed in, for the topbar / profile / upload metadata. Falls back to
  // neutral labels until /api/auth/me resolves (or if a field is missing).
  const buyerName = me?.customer
    ? ([me.customer.first_name, me.customer.last_name].filter(Boolean).join(" ") || (me.customer.email || "").split("@")[0] || "")
    : "";
  const practiceName = me?.practice?.name || "";
  const buyerInitials = buyerName
    ? buyerName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()
    : "";
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const catalogMatches = useMemo(() => {
    if (!catalog.length) return [];
    if (!normalizedSearch) return catalog.slice(0, 5);

    return catalog.filter((category) => {
      const item = category.best_value_item || {};
      return [category.name, item.name, item.supplier_name, item.sku]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [catalog, normalizedSearch]);
  const searchResults = useMemo(() => {
    if (canonicalSource === "medusa") {
      return canonicalResults.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        supplier_name: product.best_offer?.supplier_name,
        price_cents: product.best_offer?.price_cents,
        per_unit_cents: product.best_offer?.unit_price_cents,
        pack_size: product.best_offer?.pack_size,
        pack_quantity: product.best_offer?.pack_quantity,
        pack_basis: product.best_offer?.pack_basis,
        base_unit: product.base_unit,
        handle: product.handle,
        price_range_cents: product.price_range_cents,
        offer_count: product.offer_count,
      }));
    }

    return catalogMatches.map((category) => {
      const item = category.best_value_item || {};
      return {
        id: category.id,
        name: item.name || category.name,
        category: category.name,
        supplier_name: item.supplier_name,
        price_cents: item.unit_price_cents,
        handle: "",
      };
    });
  }, [canonicalResults, canonicalSource, catalogMatches]);

  function navigate(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    const next = viewFromPath(path);
    setIsLoggedIn(next.isLoggedIn);
    setViewState(next.view);
    setHistoryId(next.historyId || null);
    setSelectedHandoffId(next.handoffId || null);
    setProductHandle(next.productHandle || null);
    setCategorySlug(next.categorySlug || null);
    setSearchQuery(next.searchQuery || "");
    setMobileAddItemRoute(Boolean(next.mobileAddItemRoute));
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleAuthed() {
    setAuthed(true);
    navigate("/app");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAuthed(false);
    navigate("/");
  }

  function setView(nextView) {
    navigate(pathForView(nextView));
  }

  function openMobileScan() {
    setScanResult(null);
    setScanCount(0);
    navigate("/app/scan");
  }

  function handleScanComplete(code) {
    addScannedItem(code);
  }

  // Logged-out scanning: each real lookup spends one of the free scans, tracked
  // in localStorage. Once the budget is gone, scans are ignored and the view's
  // signup wall takes over. Items still land in the local list, so they carry
  // into the account the moment the visitor signs up.
  async function handlePublicScan(code) {
    if (freeScansUsed >= FREE_SCAN_LIMIT) return;
    const added = await addScannedItem(code);
    if (!added) return;
    setFreeScansUsed((n) => {
      const next = n + 1;
      try { window.localStorage.setItem(FREE_SCAN_KEY, String(next)); } catch {}
      return next;
    });
  }

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2200);
  }

  function uploadInvoiceFile(fileInput, file) {
    if (!file || !fileInput || !uploadFormRef.current || uploading) return;

    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isCsv = file.type === "text/csv" || file.type === "application/vnd.ms-excel" || name.endsWith(".csv");
    if (!isPdf && !isCsv) {
      showToast("Upload a PDF or CSV invoice");
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    setSelectedInvoiceName(file.name);
    window.setTimeout(() => {
      uploadFormRef.current?.requestSubmit();
    }, 0);
  }

  function handleInvoiceDrop(event) {
    event.preventDefault();
    setIsDraggingInvoice(false);
    uploadInvoiceFile(event.currentTarget.querySelector('input[type="file"]'), event.dataTransfer.files?.[0]);
  }

  async function handleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    uploadCancelledRef.current = false;
    const timeout = window.setTimeout(() => controller.abort("timeout"), UPLOAD_TIMEOUT_MS);
    setUploadError("");
    setUploading(true);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setUploadError(body.error || `Upload failed (${response.status}). Please try again.`);
        return;
      }

      const { request } = await response.json();
      const documentId = request.id;
      setHasUploadedInvoice(true);
      setListTouched(true);
      setUploadedDocs((docs) => [
        ...docs,
        { id: documentId, name: request.sourceFileName, itemCount: request.lineItems.length },
      ]);
      setDraftItems((items) => {
        // Merge matched lines by canonical product; keep unmatched lines distinct
        // by their raw description (canonical name is null for those).
        const keyOf = (item) => item.product || item.extractedFrom || item.sku || "";
        const byProduct = new Map(items.map((item) => [keyOf(item), item]));

        request.lineItems.forEach((item) => {
          const key = keyOf(item);
          const existing = byProduct.get(key);

          if (existing) {
            const documentQuantities = {
              ...(existing.documentQuantities || {}),
              [documentId]: ((existing.documentQuantities || {})[documentId] || 0) + item.qty,
            };

            byProduct.set(key, {
              ...existing,
              draftQty: existing.draftQty + item.qty,
              included: true,
              documentQuantities,
              documentIds: Array.from(new Set([...existing.documentIds, documentId])),
            });
            return;
          }

          byProduct.set(key, {
            ...item,
            id: newItemId(),
            draftQty: item.qty,
            included: true,
            documentQuantities: { [documentId]: item.qty },
            documentIds: [documentId],
          });
        });

        return Array.from(byProduct.values());
      });
      setSelectedInvoiceName("");
      setLastUpload({ name: request.sourceFileName, items: request.lineItems, matchSource: request.matchSource });
      form.reset();
      showToast(`${request.lineItems.length} items added to your list`);
    } catch (error) {
      if (uploadCancelledRef.current) {
        // User cancelled — leave the modal on the dropzone, no error.
      } else if (controller.signal.aborted) {
        setUploadError("This is taking longer than expected — the product catalog may be warming up. Please try again in a moment.");
      } else {
        setUploadError("Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      window.clearTimeout(timeout);
      // Only clear shared state if this is still the active upload — a
      // cancel-then-reupload could have superseded it.
      if (uploadAbortRef.current === controller) {
        uploadAbortRef.current = null;
        uploadCancelledRef.current = false;
        setUploading(false);
      }
    }
  }

  function handleCancelUpload() {
    uploadCancelledRef.current = true;
    uploadAbortRef.current?.abort("cancelled");
  }

  async function addScannedItem(code) {
    setListTouched(true);
    setUploadedDocs((docs) => docs.some((doc) => doc.id === "scan")
      ? docs
      : [...docs, { id: "scan", name: "Barcode scans", itemCount: 0 }]);

    // One instance per product: a code already on the list re-surfaces so the
    // buyer sees it registered, but never bumps the quantity — they set quantity
    // back on the reorder list. This keeps a barcode lingering in frame (or a
    // deliberate re-scan) from piling up duplicate counts.
    const existing = code ? draftItems.find((item) => item.barcode === code) : null;
    if (existing) {
      setScanResult({ status: statusFromItem(existing), item: existing, isDuplicate: true, qty: existing.draftQty || 1 });
      showToast("Already on your list");
      return false;
    }

    // Resolve against the real catalog: GTIN/UPC barcode first, then exact SKU.
    const product = await lookupScannedProduct(code);
    const item = makeScanDraftItem(code, product);

    setDraftItems((items) => {
      if (code && items.some((it) => it.barcode === code)) return items; // race guard
      return [...items, item];
    });
    setScanCount((n) => n + 1);
    setScanResult({ status: statusFromItem(item), item, isDuplicate: false, qty: item.draftQty || 1 });
    showToast(product ? `Added ${product.name}` : code ? `Scanned ${code} — needs review` : "Item added");
    return true;
  }

  // Add a catalog product (from the product page) to the current reorder list.
  // Reuses the scan draft shape (offers, best supplier, canonical handle) but
  // tags the source as a catalog add and respects the buyer's chosen quantity.
  function addCatalogItem(product, quantity = 1, unitOfMeasure) {
    if (!product) return;
    setListTouched(true);
    setUploadedDocs((docs) => docs.some((doc) => doc.id === "catalog")
      ? docs
      : [...docs, { id: "catalog", name: "Catalog adds", itemCount: 0 }]);

    const base = makeScanDraftItem(null, product);
    const item = {
      ...base,
      source: "catalog",
      barcode: "",
      draftQty: quantity,
      qty: quantity,
      unit: (unitOfMeasure || base.unit || "ea"),
      documentIds: ["catalog"],
      documentQuantities: { catalog: quantity },
      extractedFrom: product.name || base.product || "Catalog item",
    };
    setDraftItems((items) => [...items, item]);
  }

  function removeDraftItem(target) {
    const id = typeof target === "string" ? target : target?.id;
    if (!id) return;
    setDraftItems((items) => items.map((item) => (item.id === id ? { ...item, included: false } : item)));
  }

  // Pull the practice's latest list from the server on demand — lets a buyer at
  // their desk see items just scanned on a phone (the list is last-write-wins
  // synced, so a manual refresh is the safe way to merge in cross-device work).
  async function refreshFromServer() {
    if (authed !== true) return;
    try {
      const response = await fetch("/api/reorder-list", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!data || !data.state) return;

      // Merge — never overwrite. The server list may be stale relative to the
      // local working copy (the save is debounced 800ms and can silently fail),
      // so blindly hydrating it would drop items just added here — e.g. a fresh
      // invoice upload. Union the two by item key: keep every server item (this
      // is how phone-scanned items get pulled in) and re-add any local item the
      // server doesn't have yet. Other fields take the server's value.
      const localItems = (latestBlobRef.current?.draftItems) || draftItems || [];
      const serverItems = data.state.draftItems || [];
      const keyOf = (item) => item.product || item.extractedFrom || item.sku || item.id || "";
      const serverKeys = new Set(serverItems.map(keyOf));
      const localOnly = localItems.filter((item) => !serverKeys.has(keyOf(item)));
      hydrateFromState({ ...data.state, draftItems: [...serverItems, ...localOnly] });
    } catch {
      // offline / server down — keep current state
    }
  }

  // Persist a buyer's per-item verification decision: chosen offer, quantity,
  // note, and whether it's confirmed. Patch keys are optional.
  function applyMatchDecision(itemId, patch = {}) {
    if (!itemId) return;
    setListTouched(true);
    setDraftItems((items) => items.map((item) => {
      if (item.id !== itemId) return item;
      const next = { ...item };
      if (patch.selectedOfferKey !== undefined) next.selectedOfferKey = patch.selectedOfferKey;
      if (patch.qty !== undefined) next.draftQty = patch.qty;
      if (patch.note !== undefined) next.note = patch.note;
      if (patch.paidUnitPrice !== undefined) {
        const n = patch.paidUnitPrice === null || patch.paidUnitPrice === "" ? null : Number(patch.paidUnitPrice);
        next.paidUnitPrice = Number.isFinite(n) && n > 0 ? n : null;
      }
      return next;
    }));
  }

  // Apply the landed-cost-optimized plan: set each line's selected offer to the
  // optimizer's choice. Reuses the per-line override mechanism, so the buyer can
  // still re-pick any line afterward.
  function applyOptimizedPlan(assignmentByItemId) {
    if (!assignmentByItemId || !Object.keys(assignmentByItemId).length) return;
    setListTouched(true);
    setDraftItems((items) => items.map((item) => {
      const key = assignmentByItemId[item.id];
      return key ? { ...item, selectedOfferKey: key } : item;
    }));
    showToast("Plan optimized for lowest landed cost");
  }

  // Resolve a No-Match (or re-link any item) by attaching a catalog product and
  // its supplier offers, marking it linked (a confident match).
  function linkProductToItem(itemId, product, options = {}) {
    if (!itemId || !product) return;
    setListTouched(true);
    const offers = (product.offers || []).map(mapSearchOffer);
    const best = offers[0] || (product.best_offer ? mapSearchOffer(product.best_offer) : null);
    setDraftItems((items) => items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        product: product.name,
        canonicalName: product.name,
        canonicalHandle: product.handle || product.id || item.canonicalHandle || "",
        imageUrl: product.image_url || best?.imageUrl || item.imageUrl || "",
        unit: product.base_unit || item.unit || "ea",
        offers,
        bestOffer: best,
        selectedOfferKey: null,
        matchStatus: "exact",
        confidence: product.match?.score ?? 0.95,
        linked: true,
        draftQty: options.qty ?? item.draftQty ?? item.qty ?? 1,
        note: options.note ?? item.note ?? "",
      };
    }));
  }

  // Snapshot the current list into History, then clear it. Rows are stored so
  // the archived list stays readable even though it's no longer editable.
  function archiveCurrentList() {
    if (!activeDraftItems.length) {
      showToast("Nothing to archive yet");
      return;
    }
    const rows = deriveMatchRows(activeDraftItems, buyingPrefs);
    // Snapshot the landed total (items + estimated shipping) so History matches
    // the Plan Preview the buyer saw when archiving.
    const totals = computePlanTotals(rows, supplierShipping);
    const now = new Date();
    const entry = {
      id: `list_${now.getTime()}`,
      name: listName || `${now.toLocaleString("en-US", { month: "long" })} Reorder List`,
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      items: rows.length,
      suppliers: totals.suppliers,
      total: money.format(totals.landedTotal),
      // Final lifecycle status + the handoff it was tied to, for the History pill.
      status: deriveListStatus(rows, Boolean(currentHandoffId), listStage),
      handoffId: currentHandoffId,
      rows,
      // Raw inputs so Duplicate can rebuild a working, visible list (items are
      // only shown when their documentIds match a doc in uploadedDocs).
      sourceItems: activeDraftItems,
      sourceDocs: uploadedDocs,
    };
    setArchivedLists((lists) => [entry, ...lists]);
    setDraftItems([]);
    setUploadedDocs([]);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    setCurrentHandoffId(null);
    setListStage("draft");
    setBuyingPrefs(defaultBuyingPrefs);
    showToast("List archived to History");
  }

  // Both whole-list actions are guarded by a confirmation modal so a buyer can't
  // wipe or archive their list with a single stray menu tap.
  function requestArchiveList() {
    if (!activeDraftItems.length) {
      showToast("Nothing to archive yet");
      return;
    }
    setConfirmDialog({
      title: "Archive this list?",
      body: "The current reorder list will be moved to History and a fresh, empty list will start. Archived lists stay viewable but can't be edited.",
      confirmLabel: "Archive list",
      onConfirm: archiveCurrentList,
    });
  }

  function requestClearList() {
    if (!activeDraftItems.length) {
      showToast("List is already empty");
      return;
    }
    setConfirmDialog({
      title: "Clear this list?",
      body: "Every item will be removed from your current reorder list. This can't be undone — to keep a copy, archive the list instead.",
      confirmLabel: "Clear list",
      destructive: true,
      onConfirm: clearCurrentList,
    });
  }

  function clearCurrentList() {
    if (!activeDraftItems.length) {
      showToast("List is already empty");
      return;
    }
    setDraftItems([]);
    setUploadedDocs([]);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    setCurrentHandoffId(null);
    setListStage("draft");
    setBuyingPrefs(defaultBuyingPrefs);
    showToast("List cleared");
  }

  // Explicit reverse transition: Review & optimize → Draft (the "Keep editing"
  // affordance). Handoff is intentionally not reversible — see prepareHandoff.
  function backToDraft() {
    setListStage("draft");
  }

  // Advance the gate: Draft → Review & optimize. Only meaningful when the list
  // is fully reviewed; the derivation enforces that the pill agrees.
  function advanceToReview() {
    setListStage("review");
  }

  // Freeze the current plan into a read-only supplier handoff. Captures the
  // best-offer-per-line snapshot (grouped by supplier) so the order details
  // don't drift if prices/preferences change after the buyer commits.
  function prepareHandoff() {
    const rows = deriveMatchRows(activePlanItems, buyingPrefs);
    const included = rows.filter(isPlanIncluded);
    if (!included.length) {
      showToast("Add matched items before preparing a handoff");
      return;
    }
    const groups = groupRowsBySupplier(included.map(slimHandoffRow));
    const total = included.reduce((sum, row) => sum + (row.lineTotal || 0), 0);
    const now = new Date();
    const snapshot = {
      id: `ho_${now.getTime()}`,
      listName,
      createdAt: now.toISOString(),
      createdLabel: now.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
      buyer: buyerName,
      practice: practiceName,
      prefs: buyingPrefs,
      groups,
      total,
      itemCount: included.length,
      supplierCount: groups.length,
    };
    setHandoffs((list) => [snapshot, ...list]);
    setCurrentHandoffId(snapshot.id);
    showToast("Supplier handoff prepared");
    navigate(`/app/review/handoff?ho=${snapshot.id}`);
  }

  // Archive the live list and return to a fresh Home — the frozen handoff lives
  // on in History, so archiving here doesn't lose the order details.
  function archiveFromHandoff() {
    archiveCurrentList();
    navigate("/app");
  }

  // Rename an archived list in History (live list renames via setListName).
  function renameArchivedList(id, name) {
    setArchivedLists((lists) => lists.map((entry) => (entry.id === id ? { ...entry, name } : entry)));
  }

  // Copy an archived list into a fresh Current Reorder List. Restores the raw
  // items (with new ids) and their docs so visibility holds; the original stays
  // in History. Guards against silently overwriting an in-progress live list.
  function duplicateList(entry) {
    if (!entry?.sourceItems?.length) {
      showToast("This sample list has no items to duplicate");
      return;
    }
    if (activeDraftItems.length && !window.confirm(`Replace your current reorder list with a copy of "${entry.name}"?`)) {
      return;
    }
    setDraftItems(entry.sourceItems.map((item) => ({ ...item, id: newItemId() })));
    setUploadedDocs(entry.sourceDocs || []);
    setListName(`${entry.name} (copy)`);
    setCurrentHandoffId(null);
    setListStage("draft");
    setListTouched(true);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    showToast(`Duplicated "${entry.name}" to a new list`);
    navigate("/app");
  }

  const navItems = [
    ["home", "icon-home", "Home"],
    ["catalog", "icon-grid", "Catalog"],
    ["history", "icon-clock", "History / Past Lists"],
    ["settings", "icon-settings", "Settings"],
  ];

  if (!isLoggedIn) {
    return (
      <>
        {view === "pricing" ? <PricingPage onNavigate={navigate} authed={authed === true} />
          : view === "about" ? <AboutPage onNavigate={navigate} authed={authed === true} />
          : view === "login" ? <LoginPage onNavigate={navigate} onAuthed={handleAuthed} />
          : view === "signup" ? <SignupPage onNavigate={navigate} onAuthed={handleAuthed} />
          : view === "forgotPassword" ? <ForgotPasswordPage onNavigate={navigate} />
          : view === "resetPassword" ? <ResetPasswordPage onNavigate={navigate} />
          : view === "sample" ? <SampleReorderList onNavigate={navigate} authed={authed === true} />
          : view === "publicScan" ? (
            <PublicScanView
              onScan={handlePublicScan}
              scanResult={scanResult}
              onClearScanResult={() => setScanResult(null)}
              freeScansUsed={freeScansUsed}
              limit={FREE_SCAN_LIMIT}
              onSignup={() => navigate("/signup")}
              onLogin={() => navigate("/login")}
              onHome={() => navigate("/")}
              onApp={() => navigate("/app")}
              authed={authed === true}
            />
          )
          : <LoggedOutLanding onNavigate={navigate} authed={authed === true} />}
        <IconSprite />
      </>
    );
  }

  return (
    <>
      <div className={`app-shell ${menuOpen ? "menu-open" : ""} ${navCollapsed ? "nav-collapsed" : ""} ${mobileAddItemRoute ? "mobile-add-item-shell" : ""}`}>
        <header className="topbar">
          <button className="topbar-brand" type="button" onClick={() => setView("home")} aria-label="MedMKP home">
            <BrandMark />
          </button>
          <div className="topbar-search-wrap" ref={searchWrapRef}>
            <label className="topbar-search">
              <Icon name="icon-search" className="button-icon" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search products, suppliers…"
                aria-label="Search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") { setSearchTerm(""); event.currentTarget.blur(); }
                  else if (event.key === "Enter" && searchTerm.trim()) {
                    event.preventDefault();
                    event.currentTarget.blur();
                    navigate(`/app/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`);
                  }
                }}
              />
              <kbd className="topbar-kbd">⌘K</kbd>
            </label>
            {searchTerm.trim() && (
              <SearchResults
                results={searchResults}
                loading={searchLoading}
                query={searchTerm.trim()}
                onNavigate={navigate}
              />
            )}
          </div>
          <div className="topbar-right">
            <button className="topbar-alerts" type="button" aria-label="Alerts">
              <Icon name="icon-bell" className="button-icon" />
              <span className="topbar-badge">3</span>
            </button>
            <div className="topbar-user-wrap" ref={userWrapRef}>
              <button
                className="topbar-user"
                type="button"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((open) => !open)}
              >
                <span className="topbar-avatar">{buyerInitials || "··"}</span>
                <span className="topbar-user-id"><strong>{buyerName || "Your account"}</strong><small>{practiceName || "Buyer"}</small></span>
                <Icon name="icon-chevron-down" className={`button-icon ${userMenuOpen ? "rot" : ""}`} />
              </button>
              {userMenuOpen && (
                <div className="topbar-menu" role="menu">
                  <div className="topbar-menu-head">
                    <strong>{buyerName || "Your account"}</strong>
                    <small>{me?.customer?.email || practiceName || "Buyer"}</small>
                  </div>
                  <button role="menuitem" type="button" onClick={() => { setUserMenuOpen(false); setView("settings"); }}>
                    <Icon name="icon-settings" className="button-icon" />
                    Settings
                  </button>
                  <button role="menuitem" type="button" onClick={() => { setUserMenuOpen(false); handleLogout(); }}>
                    <Icon name="icon-logout" className="button-icon" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-head">
            <button
              className="nav-collapse-btn"
              type="button"
              onClick={() => setNavCollapsed((collapsed) => !collapsed)}
              aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Icon name="icon-sidebar" className="button-icon" />
            </button>
          </div>
          <nav className="nav-tabs" aria-label="Primary navigation">
            {navItems.map(([target, icon, label]) => (
              <button
                key={target}
                className={`nav-tab ${target === "settings" ? "nav-tab-bottom" : ""} ${view === target ? "active" : ""}`}
                type="button"
                onClick={() => setView(target)}
                title={navCollapsed ? label : undefined}
              >
                <Icon name={icon} />
                <strong>{label}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <main className="app-main">
          {view === "home" && (
            mobileAddItemRoute ? (
              <MobileScanItemView
                onBack={() => { setScanResult(null); setMobileAddItemRoute(false); }}
                onScan={handleScanComplete}
                scanResult={scanResult}
                onClearScanResult={() => setScanResult(null)}
                scanCount={scanCount}
              />
            ) : (
              <CurrentReorderList
                items={activePlanItems}
                listName={listName}
                listStatus={liveListStatus}
                listStage={listStage}
                onAdvanceStage={advanceToReview}
                onRenameList={setListName}
                buyerName={buyerName}
                practiceName={practiceName}
                buyerInitials={buyerInitials}
                email={me?.customer?.email}
                onLogout={handleLogout}
                addMode={addMode}
                onAddMode={setAddMode}
                lastUpload={lastUpload}
                onCloseUpload={() => { setAddMode(""); setLastUpload(null); setUploadError(""); }}
                onUploadAnother={() => { setLastUpload(null); setUploadError(""); }}
                uploadFormRef={uploadFormRef}
                onUpload={handleUpload}
                uploading={uploading}
                uploadProgress={uploadProgress}
                uploadElapsed={uploadElapsed}
                uploadError={uploadError}
                onCancelUpload={handleCancelUpload}
                onClearUploadError={() => setUploadError("")}
                isDraggingInvoice={isDraggingInvoice}
                onDragStateChange={setIsDraggingInvoice}
                onInvoiceDrop={handleInvoiceDrop}
                onInvoiceFile={uploadInvoiceFile}
                selectedInvoiceName={selectedInvoiceName}
                hasUploadedInvoice={hasUploadedInvoice}
                onScan={handleScanComplete}
                searchTerm={searchTerm}
                onSearchTerm={setSearchTerm}
                searchResults={searchResults}
                searchLoading={searchLoading}
                onNavigate={navigate}
                onToast={showToast}
                listTouched={listTouched}
                buyingPrefs={buyingPrefs}
                supplierShipping={supplierShipping}
                onBuyingPrefs={setBuyingPrefs}
                onApplyOptimized={applyOptimizedPlan}
                onArchiveList={requestArchiveList}
                onClearList={requestClearList}
                onConfirmMatch={applyMatchDecision}
                onLinkProduct={linkProductToItem}
                onRemoveItem={removeDraftItem}
                onRefresh={refreshFromServer}
                onNavigate={navigate}
              />
            )
          )}

          {view === "plan" && (
            <ProcurementPlanView
              items={activePlanItems}
              listName={listName}
              listStatus={liveListStatus}
              onBackToDraft={() => { backToDraft(); navigate("/app"); }}
              buyingPrefs={buyingPrefs}
              onBuyingPrefs={setBuyingPrefs}
              onPrepareHandoff={prepareHandoff}
              onBuildCart={setCartGroup}
              onSwitchOffer={applyMatchDecision}
              onNavigate={navigate}
              onToast={showToast}
            />
          )}

          {view === "handoff" && (
            <SupplierHandoffView
              handoff={(selectedHandoffId && handoffs.find((h) => h.id === selectedHandoffId)) || handoffs[0] || null}
              onArchive={archiveFromHandoff}
              onBuildCart={setCartGroup}
              onNavigate={navigate}
              onToast={showToast}
            />
          )}

          {view === "history" && <HistoryView archivedLists={archivedLists} onOpen={(id) => navigate(`/app/history/${id}`)} />}

          {view === "historyDetail" && (
            <HistoryDetail
              id={historyId}
              archivedLists={archivedLists}
              handoffs={handoffs}
              onBack={() => navigate("/app/history")}
              onRename={renameArchivedList}
              onDuplicate={duplicateList}
              onViewHandoff={(hid) => navigate(`/app/review/handoff?ho=${hid}`)}
            />
          )}

          {view === "catalog" && <CatalogView onNavigate={navigate} />}

          {view === "catalogSearch" && (
            <CatalogSearchView query={searchQuery} onNavigate={navigate} />
          )}

          {view === "catalogCategory" && (
            <CatalogCategoryView slug={categorySlug} onNavigate={navigate} />
          )}

          {view === "productDetail" && (
            <ProductDetail
              handle={productHandle}
              onNavigate={navigate}
              onToast={showToast}
              onAddToList={addCatalogItem}
              listName={listName}
              listSummary={listSummary}
            />
          )}

          {view === "settings" && (
            <SettingsView
              me={me}
              onMeUpdate={setMe}
              defaultBuyingPrefs={defaultBuyingPrefs}
              onSaveDefaults={setDefaultBuyingPrefs}
              supplierOptions={supplierOptions}
              onToast={showToast}
            />
          )}
        </main>
        <MobileBottomNav
          view={view}
          onNavigate={setView}
          onScan={openMobileScan}
        />
        </div>
      </div>

      {cartGroup && (
        <CartBuilderModal
          group={cartGroup}
          buyingPrefs={buyingPrefs}
          onClose={() => setCartGroup(null)}
          onStockResults={recordLiveStock}
          onSwitchOffer={applyMatchDecision}
          onToast={showToast}
        />
      )}

      {confirmDialog && (
        <ConfirmModal
          {...confirmDialog}
          onConfirm={() => { confirmDialog.onConfirm?.(); setConfirmDialog(null); }}
          onClose={() => setConfirmDialog(null)}
        />
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
      <IconSprite />
    </>
  );
}

function SearchResults({ results, query = "", loading, onNavigate }) {
  const headerLabel = loading && !results.length
    ? "Searching…"
    : results.length ? "Matching canonical products" : "No catalog matches";
  const trimmed = query.trim();
  const catalogHref = trimmed ? `/app/catalog/search?q=${encodeURIComponent(trimmed)}` : "/app/catalog";
  const go = (href) => (event) => { event.preventDefault(); onNavigate?.(href); };
  return (
    <div className="search-results" role="region" aria-label="Catalog search results">
      <div className="search-results-header">
        <strong>{headerLabel}</strong>
        <a className="search-results-link" href={catalogHref} onClick={go(catalogHref)}>View catalog</a>
      </div>
      {results.slice(0, 5).map((result) => {
        const price = typeof result.price_cents === "number"
          ? money.format(result.price_cents / 100)
          : "Price pending";
        const perUnit = typeof result.per_unit_cents === "number"
          ? `${money.format(result.per_unit_cents / 100)}/${result.base_unit || "unit"}`
          : null;
        const href = result.handle ? `/app/product/${result.handle}` : catalogHref;
        const packLabel = formatPackLabel(result.pack_quantity, result.pack_basis, result.base_unit, result.pack_size);

        return (
          <a className="search-result" key={result.id} href={href} onClick={go(href)}>
            <span>
              <strong>{result.name}</strong>
              <small>{result.category || "Uncategorized"} · {result.supplier_name || "Supplier pending"}</small>
            </span>
            <em style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
              <span>{price}</span>
              {perUnit && (
                <small style={{ color: "var(--muted)", fontWeight: 600, fontStyle: "normal" }}>
                  {perUnit}{packLabel ? ` · ${packLabel}` : ""}
                </small>
              )}
            </em>
          </a>
        );
      })}
      {!results.length && !loading && (
        <p>Try gloves, burs, bibs, impression material, or anesthetics.</p>
      )}
    </div>
  );
}

function parseAttributes(text) {
  if (!text) return {};
  try {
    return JSON.parse(text) || {};
  } catch (error) {
    return {};
  }
}

// Name the variant selector from the shape of its labels (e.g. "Small"/"Large"
// → Size, "25 mm" → Length, "A2" → Shade), defaulting to a generic "Option".
function variantAxisLabel(variants) {
  const labels = variants.map((v) => v.variant_label || "");
  if (labels.some((l) => /small|medium|large/i.test(l))) return "Size";
  if (labels.some((l) => /\bmm\b|\bcm\b|\bin\b/i.test(l))) return "Length";
  if (labels.some((l) => /\bga\b/i.test(l))) return "Gauge";
  if (labels.some((l) => /^[A-D][1-4]/.test(l))) return "Shade";
  if (labels.some((l) => /taper/i.test(l))) return "Taper";
  return "Option";
}

function cap(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function titleCase(value) {
  return value ? String(value).replace(/\b\w/g, (char) => char.toUpperCase()) : value;
}

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

// Real availability from the latest price snapshot. We don't have ship-time
// estimates, so we report only the status the supplier actually published and
// leave anything unknown explicitly unconfirmed rather than inventing an ETA.
function availabilityInfo(value) {
  if (value === "in_stock") return { label: "In stock", tone: "ok" };
  if (value === "limited") return { label: "Limited stock", tone: "warn" };
  if (value === "backordered") return { label: "Backordered", tone: "bad" };
  return { label: "Check with supplier", tone: "muted" };
}

// Suppliers write the same pack a dozen ways ("100/Bx", "100/Box", "Box of 300",
// "200/Box"). The ingestion parser (ingestion/pack.ts) already resolved each to a
// structured (quantity, basis, base_unit), so render one canonical label from
// those fields and only fall back to the raw supplier string when unparsed.
// One canonical spelling per container word, so "Bx"/"box"/"BOXES" all render
// the same. Keyed by the lowercased, de-punctuated supplier token.
const PACK_UNIT_CANON = {
  box: "Box", bx: "Box", bxs: "Box", boxes: "Box",
  pack: "Pack", pk: "Pack", pkg: "Pack", pkt: "Pack", packs: "Pack", pks: "Pack",
  case: "Case", cs: "Case", cases: "Case",
  bag: "Bag", bg: "Bag", bags: "Bag",
  each: "Each", ea: "Each",
  count: "Count", ct: "Count", cnt: "Count",
  carton: "Carton", ctn: "Carton",
  bottle: "Bottle", btl: "Bottle",
  tube: "Tube", tb: "Tube",
  roll: "Roll", rl: "Roll",
  vial: "Vial", jar: "Jar", kit: "Kit", can: "Can", set: "Set", tray: "Tray",
  sleeve: "Sleeve", pair: "Pair", pr: "Pair", dozen: "Dozen", dz: "Dozen",
  unit: "Unit", piece: "Piece", pc: "Piece", pcs: "Piece",
};
function canonPackUnit(word) {
  const key = String(word).toLowerCase().replace(/\.+$/, "");
  return PACK_UNIT_CANON[key] || word;
}
// Normalize the pack token inside a free-form supplier string ("100/Bx" →
// "100/Box") without touching the rest of the text.
function normalizePackText(raw) {
  if (!raw) return raw;
  return String(raw).replace(/(\d+)\s*\/\s*([A-Za-z.]+)/g, (_, n, unit) => `${n}/${canonPackUnit(unit)}`);
}
// Unit-of-measure display: collapse the many ways a single unit gets written
// ("each"/"Each"/"ea."/"EA" → "ea") so the Qty column reads consistently.
const UOM_CANON = {
  each: "ea", ea: "ea", unit: "ea", piece: "ea", pc: "ea", pcs: "ea",
  box: "box", bx: "box", pack: "pack", pk: "pack", pkg: "pack",
  bag: "bag", bg: "bag", case: "case", cs: "case", count: "count", ct: "count",
  bottle: "bottle", btl: "bottle", tube: "tube", roll: "roll", vial: "vial",
};
function displayUom(uom) {
  if (!uom) return "ea";
  const key = String(uom).toLowerCase().replace(/\.+$/, "");
  return UOM_CANON[key] || uom;
}
// A trustworthy per-unit price is never higher than the pack price it came from
// (a pack holds ≥1 unit). When a bad pack parse inverts that — e.g. a measured
// "0.2g" basis turning $143.99 into "$719.95/ea" — suppress the per-unit rather
// than show a nonsense figure.
function showPerEa(perEa, packPrice) {
  if (perEa == null) return false;
  if (packPrice != null && perEa > packPrice + 1e-6) return false;
  return true;
}
const PACK_BASIS_WORD = { box: "Box", case: "Case", pack: "Pack" };
function formatPackLabel(quantity, basis, baseUnit, raw) {
  // A measured base unit (ml, g, oz…) reads as an amount, not a container count.
  if (quantity != null && baseUnit && baseUnit !== "each") {
    return `${quantity} ${baseUnit}`;
  }
  const word = PACK_BASIS_WORD[basis];
  if (quantity != null && word) {
    return `${quantity}/${word}`;
  }
  return normalizePackText(raw) || (quantity != null ? `${quantity}/Pack` : "");
}

// "Can the buyer order this offer right now?" — conservative: only an explicit
// negative blocks. Unknown stays orderable so we don't flag the whole catalog
// (most ingested products have no published stock signal). A live Shopify check
// (Phase B) overrides the ingestion snapshot when present.
function isOrderable(offer) {
  if (!offer) return true;
  if (offer.liveAvailable === false) return false;
  if (offer.availability === "backordered") return false;
  return true;
}

function shopifyStockKey(productUrl) {
  try {
    const url = new URL(productUrl);
    const match = url.pathname.match(/\/products\/([^/]+)/);
    return match ? `${url.origin}/products/${encodeURIComponent(decodeURIComponent(match[1]))}` : null;
  } catch {
    return null;
  }
}

// Apply live results as an ephemeral overlay. The underlying draft remains the
// durable ingestion snapshot; live stock is intentionally session-scoped.
function applyLiveStock(items, stockByUrl) {
  const applyOffer = (offer) => {
    const key = shopifyStockKey(offer?.productUrl);
    return key && typeof stockByUrl[key] === "boolean"
      ? { ...offer, liveAvailable: stockByUrl[key] }
      : offer;
  };
  return (items || []).map((item) => ({
    ...item,
    bestOffer: item.bestOffer ? applyOffer(item.bestOffer) : item.bestOffer,
    offers: (item.offers || []).map(applyOffer),
  }));
}

// Plan-row stock badge: in_stock / unknown stay quiet, limited warns (amber),
// backordered or a live out-of-stock flags red. Returns null when no badge.
function availabilityBadge(availability, liveAvailable) {
  if (liveAvailable === false || availability === "backordered") return { label: "Out of stock", tone: "bad" };
  if (availability === "limited") return { label: "Limited stock", tone: "warn" };
  return null;
}

// A line out of stock at its selected supplier with no in-stock alternative
// can't be ordered anywhere — keep it out of supplier groups and handoffs (it
// surfaces in the unresolved bucket instead so it never silently ships).
function isStrandedOutOfStock(row) {
  return Boolean(row.outOfStock) && !row.switchTarget;
}

// A matched line that belongs in a supplier order: has a real supplier and is
// orderable somewhere. Shared by the plan view and the handoff snapshot so the
// two never disagree on what's included.
function isPlanIncluded(row) {
  return row.status !== "Not found" && row.supplier && row.supplier !== "—" && !isStrandedOutOfStock(row);
}

function QtyStepper({ qty, setQty }) {
  return (
    <div className="pdp-stepper">
      <button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} aria-label="Decrease quantity">&minus;</button>
      <input
        type="number"
        min="1"
        value={qty}
        onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))}
        aria-label="Quantity"
      />
      <button type="button" onClick={() => setQty((value) => value + 1)} aria-label="Increase quantity">+</button>
    </div>
  );
}

function UomSelect({ uom, setUom }) {
  const options = [...new Set([uom, "Box", "Bag", "Case", "Pack", "Each"].filter(Boolean))];
  return (
    <div className="pdp-select">
      <select value={uom} onChange={(event) => setUom(event.target.value)} aria-label="Unit of measure">
        {options.map((option) => (
          <option key={option} value={option}>{cap(option)}</option>
        ))}
      </select>
      <Icon name="icon-chevron-down" className="nav-icon" />
    </div>
  );
}

function catMoney(cents) {
  return typeof cents === "number" && !Number.isNaN(cents) ? money.format(cents / 100) : "Price pending";
}

// Category card/row price: lead with the comparable per-unit price (the real
// best deal across pack sizes) and show the pack price + size beneath; fall back
// to the pack price when the best offer has no per-unit price.
function CatBestPrice({ best, showBadge }) {
  const perUnit = best && best.unit_comparable && best.unit_price_cents != null ? best.unit_price_cents : null;
  const packLabel = best ? formatPackLabel(best.pack_quantity, best.pack_basis, best.base_unit, best.pack_size) : "";
  return (
    <div className="cat-pt-price">
      {perUnit != null ? (
        <strong>{catMoney(perUnit)}<span className="cat-pt-per"> / {best.base_unit || "ea"}</span></strong>
      ) : (
        <strong>{best ? catMoney(best.price_cents) : "—"}</strong>
      )}
      {perUnit != null && (
        <span className="cat-pt-pack">{catMoney(best.price_cents)}{packLabel ? ` · ${packLabel}` : ""}</span>
      )}
      {showBadge && <span className="cat-pt-badge">Best price</span>}
    </div>
  );
}

function supplierInitials(name) {
  return (name || "?")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function CatalogStat({ icon, tint, label, value, sub }) {
  return (
    <div className="cat-stat">
      <span className={`cat-stat-icon tint-${tint}`}><Icon name={icon} className="nav-icon" /></span>
      <div>
        <small>{label}</small>
        <strong>{value}{sub && <em>{sub}</em>}</strong>
      </div>
    </div>
  );
}

function CatalogCard({ category, onNavigate }) {
  const open = () => onNavigate(`/app/catalog/${category.slug}`);
  return (
    <article className="cat-card">
      <button type="button" className="cat-card-open" onClick={open}>
        <span className={`cat-tile tint-${category.tint}`}><Icon name={category.icon} className="nav-icon" /></span>
        <span className="cat-card-headtext">
          <strong>{category.name}</strong>
          <small>{category.description}</small>
        </span>
      </button>
      <p className="cat-card-count">{category.product_count.toLocaleString()} products</p>
      <div className="cat-card-chips">
        {category.subcategories.map((sub) => (
          <button
            key={sub.name}
            type="button"
            className="cat-chip"
            onClick={() => onNavigate(`/app/catalog/${category.slug}?sub=${encodeURIComponent(sub.name)}`)}
          >
            {sub.name}
          </button>
        ))}
      </div>
      <button type="button" className="cat-browse" onClick={open}>
        Browse category
        <Icon name="icon-chevron-right" className="button-icon" />
      </button>
    </article>
  );
}

// In-app catalog landing (/app/catalog). Lives in the app shell so it shares the
// sidebar + topbar. Live category rows roll up into curated departments
// (catalogData.js); the grid, stat row, and right rail are populated from the
// cached /api/catalog + /api/suppliers responses.
function CatalogView({ onNavigate }) {
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [layout, setLayout] = useState("grid");
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/catalog?all=1").then((r) => r.json()).catch(() => ({ categories: [] })),
      fetch("/api/suppliers").then((r) => r.json()).catch(() => ({ suppliers: [] })),
    ]).then(([catRes, supRes]) => {
      if (!active) return;
      setCategories(bucketCategories(catRes.categories || []));
      setSuppliers(
        (supRes.suppliers || [])
          .slice()
          .sort((a, b) => (b.product_count || 0) - (a.product_count || 0))
      );
      setStatus("ready");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      const slugs = JSON.parse(window.localStorage.getItem(CATALOG_RECENT_KEY) || "[]");
      setRecent(slugs.map((slug) => categoryBySlug(slug)).filter(Boolean));
    } catch {
      setRecent([]);
    }
  }, []);

  const totalProducts = categories.reduce((sum, c) => sum + c.product_count, 0);
  const totalSubcategories = CATALOG_CATEGORIES.reduce((sum, c) => sum + c.subcategories.length, 0);
  const popular = categories.slice(0, 6);

  return (
    <div className="cat">
      <nav className="cat-crumb" aria-label="Breadcrumb">
        <span>Products</span>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        <strong>Catalog</strong>
      </nav>
      <h1 className="cat-title">Product Catalog</h1>
      <p className="cat-lede">
        Browse our canonical dental products organized by category. Drill down into subcategories
        to find exactly what you need.
      </p>

      <div className="cat-layout">
        <div className="cat-main">
          <div className="cat-stats">
            <CatalogStat icon="icon-grid" tint="blue" label="Top-level categories" value={categories.length || "—"} />
            <CatalogStat icon="icon-package" tint="green" label="Catalog products" value={totalProducts ? totalProducts.toLocaleString() : "—"} />
            <CatalogStat icon="icon-users" tint="indigo" label="Suppliers covered" value={suppliers.length || "—"} />
            <CatalogStat icon="icon-list" tint="amber" label="Subcategories" value={totalSubcategories} />
          </div>

          <div className="cat-section-head">
            <h2>Top-level categories</h2>
            <div className="cat-viewtoggle" role="group" aria-label="View as">
              <span>View as:</span>
              <button type="button" className={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")} aria-label="Grid view">
                <Icon name="icon-grid" className="button-icon" />
              </button>
              <button type="button" className={layout === "list" ? "active" : ""} onClick={() => setLayout("list")} aria-label="List view">
                <Icon name="icon-list" className="button-icon" />
              </button>
            </div>
          </div>

          {status === "loading" ? (
            <div className="cat-grid grid">
              {Array.from({ length: 8 }).map((_, i) => <div className="cat-card cat-card-skeleton" key={i} />)}
            </div>
          ) : categories.length ? (
            <div className={`cat-grid ${layout}`}>
              {categories.map((category) => (
                <CatalogCard key={category.slug} category={category} onNavigate={onNavigate} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>Catalog unavailable</strong>
              <span>We couldn&rsquo;t load categories right now. Please try again shortly.</span>
            </div>
          )}
        </div>

        <aside className="cat-rail">
          <div className="cat-callout">
            <Icon name="icon-info" className="button-icon" />
            <div>
              <strong>Drill down to find products</strong>
              <p>Pick a category to explore its subcategories and products. Product detail pages open from any listing.</p>
            </div>
          </div>

          <section className="cat-panel">
            <header><h3>Browse by supplier</h3></header>
            <ul className="cat-supplier-list">
              {suppliers.slice(0, 5).map((supplier) => (
                <li key={supplier.id}>
                  <CatalogSupplierAvatar name={supplier.name} />
                  <span className="cat-supplier-name">{supplier.name}</span>
                  <em>{(supplier.product_count || 0).toLocaleString()}</em>
                </li>
              ))}
            </ul>
            <button type="button" className="cat-panel-action" onClick={() => onNavigate("/app/settings")}>
              View all suppliers ({suppliers.length})
            </button>
          </section>

          {recent.length > 0 && (
            <section className="cat-panel">
              <header><h3>Recently viewed</h3></header>
              <ul className="cat-recent-list">
                {recent.map((category) => (
                  <li key={category.slug}>
                    <button type="button" onClick={() => onNavigate(`/app/catalog/${category.slug}`)}>
                      <span className={`cat-tile sm tint-${category.tint}`}><Icon name={category.icon} className="nav-icon" /></span>
                      {category.name}
                      <Icon name="icon-chevron-right" className="button-icon" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {popular.length > 0 && (
            <section className="cat-panel">
              <header><h3>Popular categories</h3></header>
              <div className="cat-card-chips">
                {popular.map((category) => (
                  <button key={category.slug} type="button" className="cat-chip" onClick={() => onNavigate(`/app/catalog/${category.slug}`)}>
                    {category.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// In-app search results (/app/catalog/search?q=). Reached from the topbar search
// dropdown ("View catalog" / Enter); self-fetches the same canonical search the
// dropdown uses (higher limit) and lists matches in the category view's table.
function CatalogSearchView({ query, onNavigate }) {
  const [input, setInput] = useState(query || "");
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState(query ? "loading" : "idle");

  // Keep the refine box in sync when the query changes via the topbar / history.
  useEffect(() => { setInput(query || ""); }, [query]);

  useEffect(() => {
    const q = (query || "").trim();
    if (!q) { setProducts([]); setStatus("idle"); return undefined; }
    const controller = new AbortController();
    setStatus("loading");
    fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=48`, { signal: controller.signal })
      .then((r) => r.json())
      .then(({ canonical_products }) => {
        if (controller.signal.aborted) return;
        setProducts(canonical_products || []);
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setProducts([]);
        setStatus("ready");
      });
    return () => controller.abort();
  }, [query]);

  function submit(event) {
    event.preventDefault();
    const q = input.trim();
    onNavigate(q ? `/app/catalog/search?q=${encodeURIComponent(q)}` : "/app/catalog");
  }

  return (
    <div className="cat">
      <nav className="cat-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => onNavigate("/app/catalog")}>Catalog</button>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        <strong>Search</strong>
      </nav>
      <h1 className="cat-title">{query ? `Results for “${query}”` : "Search the catalog"}</h1>
      <p className="cat-lede">
        {status === "ready"
          ? `${products.length} matching product${products.length === 1 ? "" : "s"}.`
          : "Search canonical dental products across every supplier."}
      </p>

      <form className="cat-search-form" onSubmit={submit}>
        <label className="topbar-search">
          <Icon name="icon-search" className="button-icon" />
          <input
            type="search"
            value={input}
            placeholder="Search products"
            aria-label="Search products"
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button type="submit" className="primary-action compact">Search</button>
      </form>

      {status === "loading" ? (
        <div className="cat-ptable-wrap">
          {Array.from({ length: 6 }).map((_, i) => <div className="cat-pt-skeleton" key={i} />)}
        </div>
      ) : products.length ? (
        <div className="cat-ptable-wrap">
          <table className="cat-ptable">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category / SKU</th>
                <th>Best price</th>
                <th className="cat-pt-num">Suppliers matched</th>
                <th className="cat-pt-act">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const best = product.best_offer;
                const open = product.handle ? () => onNavigate(`/app/product/${product.handle}`) : undefined;
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="cat-pt-product">
                        <span className="cat-pt-thumb">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" loading="lazy" />
                          ) : (
                            <Icon name="icon-image" className="nav-icon" />
                          )}
                        </span>
                        {open ? (
                          <button type="button" className="cat-pt-name" onClick={open}>{product.name}</button>
                        ) : (
                          <span className="cat-pt-name">{product.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="cat-pt-path">
                      <span>{product.category || "Uncategorized"}</span>
                      <em>{best?.sku || "—"}</em>
                    </td>
                    <td>
                      <CatBestPrice best={best} showBadge={false} />
                    </td>
                    <td className="cat-pt-num">{product.offer_count}</td>
                    <td className="cat-pt-act">
                      {open && (
                        <button type="button" className="cat-pt-view" onClick={open}>
                          View product
                          <Icon name="icon-link" className="button-icon" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <strong>{query ? `No products for “${query}”` : "Start typing to search"}</strong>
          <span>Try gloves, burs, bibs, impression material, or anesthetics.</span>
        </div>
      )}
    </div>
  );
}

// Category drill-down (/app/catalog/[slug]). Mirrors the catalog landing layout
// scoped to one department: a stat row, a grid of subcategory cards, a popular-
// products table, and a right rail (jump-to box, top suppliers, subcategory
// quick links, recently viewed). Products and stats come from the same
// canonical-products API the search uses; products open the existing PDP.
function CatalogCategoryView({ slug, onNavigate }) {
  const category = categoryBySlug(slug);
  const [products, setProducts] = useState([]);
  const [productCount, setProductCount] = useState(null);
  const [supplierCount, setSupplierCount] = useState(null);
  const [topSuppliers, setTopSuppliers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [sub, setSub] = useState("");
  const [productLayout, setProductLayout] = useState("list");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [recent, setRecent] = useState([]);
  const productsRef = useRef(null);

  const tintFor = (index) => {
    const base = category ? CATALOG_TINTS.indexOf(category.tint) : 0;
    return CATALOG_TINTS[(Math.max(base, 0) + index) % CATALOG_TINTS.length];
  };

  // Remember this category for the landing page's "Recently viewed" rail, and
  // load the rail's own recent list (excluding the current category).
  useEffect(() => {
    if (!slug) return;
    try {
      const prev = JSON.parse(window.localStorage.getItem(CATALOG_RECENT_KEY) || "[]").filter((s) => s !== slug);
      setRecent(prev.map((s) => categoryBySlug(s)).filter(Boolean).slice(0, 5));
      window.localStorage.setItem(CATALOG_RECENT_KEY, JSON.stringify([slug, ...prev].slice(0, 6)));
    } catch {
      // storage unavailable — non-fatal
    }
  }, [slug]);

  // Seed the active subcategory filter from a ?sub= chip click on the landing.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("sub") || "";
    setSub(initial);
  }, [slug]);

  // Supplier coverage (from the bucketed category summary) + top suppliers for
  // the rail. These don't depend on the active subcategory filter.
  useEffect(() => {
    if (!category) return undefined;
    let active = true;
    Promise.all([
      fetch("/api/catalog?all=1").then((r) => r.json()).catch(() => ({ categories: [] })),
      fetch("/api/suppliers").then((r) => r.json()).catch(() => ({ suppliers: [] })),
    ]).then(([catRes, supRes]) => {
      if (!active) return;
      const bucket = bucketCategories(catRes.categories || []).find((c) => c.slug === slug);
      setSupplierCount(bucket ? bucket.supplier_count : null);
      setTopSuppliers(
        (supRes.suppliers || [])
          .slice()
          .sort((a, b) => (b.product_count || 0) - (a.product_count || 0))
      );
    });
    return () => { active = false; };
  }, [slug, category]);

  useEffect(() => {
    if (!category) { setStatus("missing"); return undefined; }
    // Abort superseded/duplicate fetches (StrictMode double-invoke, filter
    // changes) so we don't pile concurrent heavy queries onto the backend.
    const controller = new AbortController();
    setStatus("loading");
    setShowAllProducts(false);
    // A curated category can own several supplier-named source categories
    // (e.g. Burs & Rotary = "Burs & Diamonds" + "Burs"); fetch each, merge,
    // dedupe, and rank by best offer so the grid spans the whole department.
    Promise.all(
      category.sources.map((source) => {
        const params = new URLSearchParams({ category: source, limit: "24" });
        if (sub) params.set("q", sub);
        return fetch(`/api/canonical-products?${params}`, { signal: controller.signal })
          .then((r) => r.json())
          .catch(() => ({ canonical_products: [], count: 0 }));
      })
    ).then((responses) => {
      if (controller.signal.aborted) return;
      const seen = new Set();
      const merged = [];
      let total = 0;
      responses.forEach(({ canonical_products, count }) => {
        total += count || 0;
        (canonical_products || []).forEach((product) => {
          if (seen.has(product.id)) return;
          seen.add(product.id);
          merged.push(product);
        });
      });
      merged.sort((a, b) => (a.best_offer?.price_cents ?? Infinity) - (b.best_offer?.price_cents ?? Infinity));
      setProducts(merged.slice(0, 24));
      setProductCount(total);
      setStatus("ready");
    });
    return () => controller.abort();
  }, [slug, sub, category]);

  if (!category) {
    return (
      <div className="cat">
        <div className="empty-state">
          <strong>Category not found</strong>
          <span>That catalog category doesn&rsquo;t exist.</span>
          <button type="button" className="secondary-action compact" onClick={() => onNavigate("/app/catalog")}>Back to catalog</button>
        </div>
      </div>
    );
  }

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const browseSub = (name) => {
    setSub((prev) => (prev === name ? "" : name));
    requestAnimationFrame(scrollToProducts);
  };
  const visibleProducts = showAllProducts ? products : products.slice(0, 8);
  const bestPrice = products[0]?.best_offer?.price_cents;
  const productsTitle = sub ? `Products in ${sub}` : `Popular products in ${category.name}`;
  const fmt = (value) => (typeof value === "number" ? value.toLocaleString() : "—");
  const viewAllBtn = !showAllProducts && products.length > 8 ? (
    <button type="button" className="cat-pt-all" onClick={() => setShowAllProducts(true)}>
      View all {fmt(productCount)} products in {category.name}
      <Icon name="icon-chevron-right" className="button-icon" />
    </button>
  ) : null;

  return (
    <div className="cat">
      <nav className="cat-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => onNavigate("/app/catalog")}>Products</button>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        {sub ? (
          <button type="button" onClick={() => setSub("")}>{category.name}</button>
        ) : (
          <strong>{category.name}</strong>
        )}
        {sub && (
          <>
            <Icon name="icon-chevron-right" className="cat-crumb-sep" />
            <strong>{sub}</strong>
          </>
        )}
      </nav>
      <div className="cat-cat-head">
        <span className={`cat-tile lg tint-${category.tint}`}><Icon name={category.icon} className="nav-icon" /></span>
        <div>
          <h1 className="cat-title">{category.name}</h1>
          <p className="cat-lede">{category.description}</p>
        </div>
      </div>

      <div className="cat-layout">
        <div className="cat-main">
          <div className="cat-stats">
            <CatalogStat icon="icon-list" tint="blue" label="Subcategories" value={category.subcategories.length} />
            <CatalogStat icon="icon-package" tint="green" label="Products" value={status === "loading" ? "—" : fmt(productCount)} />
            <CatalogStat icon="icon-users" tint="indigo" label="Suppliers covered" value={fmt(supplierCount)} />
            <CatalogStat icon="icon-dollar-circle" tint="amber" label="Best price" value={typeof bestPrice === "number" ? catMoney(bestPrice) : "—"} sub={typeof bestPrice === "number" ? "lowest offer" : null} />
          </div>

          <div className="cat-section-head">
            <h2>Subcategories</h2>
          </div>

          <div className="cat-grid grid">
            {category.subcategories.map((option, index) => (
              <article className={`cat-card ${sub === option.name ? "active" : ""}`} key={option.name}>
                <button type="button" className="cat-card-open" onClick={() => browseSub(option.name)}>
                  <span className={`cat-tile tint-${tintFor(index)}`}><Icon name={category.icon} className="nav-icon" /></span>
                  <span className="cat-card-headtext">
                    <strong>{option.name}</strong>
                    <small>{option.blurb}</small>
                  </span>
                </button>
                <button type="button" className="cat-browse" onClick={() => browseSub(option.name)}>
                  {sub === option.name ? "Clear filter" : "Browse subcategory"}
                  <Icon name="icon-chevron-right" className="button-icon" />
                </button>
              </article>
            ))}
          </div>

          <div className="cat-section-head cat-products-head" ref={productsRef}>
            <h2>{productsTitle}</h2>
            <div className="cat-products-controls">
              {sub && (
                <button type="button" className="cat-clear-filter" onClick={() => setSub("")}>
                  <Icon name="icon-x" className="button-icon" />
                  Clear filter
                </button>
              )}
              <div className="cat-viewtoggle" role="group" aria-label="View as">
                <span>View as:</span>
                <button type="button" className={productLayout === "grid" ? "active" : ""} onClick={() => setProductLayout("grid")} aria-label="Grid view">
                  <Icon name="icon-grid" className="button-icon" />
                </button>
                <button type="button" className={productLayout === "list" ? "active" : ""} onClick={() => setProductLayout("list")} aria-label="List view">
                  <Icon name="icon-list" className="button-icon" />
                </button>
              </div>
            </div>
          </div>

          {status === "loading" ? (
            <div className="cat-ptable-wrap">
              {Array.from({ length: 5 }).map((_, i) => <div className="cat-pt-skeleton" key={i} />)}
            </div>
          ) : products.length ? (
            productLayout === "grid" ? (
            <div className="cat-pgrid-wrap">
              <div className="cat-pgrid">
                {visibleProducts.map((product, index) => {
                  const best = product.best_offer;
                  const open = () => onNavigate(`/app/product/${product.handle}`);
                  return (
                    <article className="cat-pcard" key={product.id}>
                      <button type="button" className="cat-pcard-media" onClick={open} aria-label={`View ${product.name}`}>
                        {product.image_url ? (
                          <img src={product.image_url} alt="" loading="lazy" />
                        ) : (
                          <Icon name="icon-image" className="nav-icon" />
                        )}
                      </button>
                      <div className="cat-pcard-body">
                        <button type="button" className="cat-pcard-name" onClick={open}>{product.name}</button>
                        <span className="cat-pcard-path">
                          {category.name} <Icon name="icon-chevron-right" className="cat-pt-pathsep" /> {product.category}
                        </span>
                        <div className="cat-pcard-foot">
                          <CatBestPrice best={best} showBadge={index === 0 && !sub} />
                          <span className="cat-pcard-suppliers">{product.offer_count} suppliers</span>
                        </div>
                        <button type="button" className="cat-pt-view" onClick={open}>
                          View product
                          <Icon name="icon-link" className="button-icon" />
                        </button>
                      </div>
                      {product.variant_count > 1 && (
                        <span className="cat-pcard-options">{product.variant_count} options</span>
                      )}
                    </article>
                  );
                })}
              </div>
              {viewAllBtn}
            </div>
            ) : (
            <div className="cat-ptable-wrap">
              <table className="cat-ptable">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category path / SKU</th>
                    <th>Best price</th>
                    <th className="cat-pt-num">Suppliers matched</th>
                    <th className="cat-pt-act">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product, index) => {
                    const best = product.best_offer;
                    const open = () => onNavigate(`/app/product/${product.handle}`);
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="cat-pt-product">
                            <span className="cat-pt-thumb">
                              {product.image_url ? (
                                <img src={product.image_url} alt="" loading="lazy" />
                              ) : (
                                <Icon name="icon-image" className="nav-icon" />
                              )}
                            </span>
                            <button type="button" className="cat-pt-name" onClick={open}>{product.name}</button>
                            {product.variant_count > 1 && (
                              <span className="cat-pt-options">{product.variant_count} options</span>
                            )}
                          </div>
                        </td>
                        <td className="cat-pt-path">
                          <span>{category.name} <Icon name="icon-chevron-right" className="cat-pt-pathsep" /> {product.category}</span>
                          <em>{best?.sku || "—"}</em>
                        </td>
                        <td>
                          <CatBestPrice best={best} showBadge={index === 0 && !sub} />
                        </td>
                        <td className="cat-pt-num">{product.offer_count}</td>
                        <td className="cat-pt-act">
                          <button type="button" className="cat-pt-view" onClick={open}>
                            View product
                            <Icon name="icon-link" className="button-icon" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {viewAllBtn}
            </div>
            )
          ) : (
            <div className="empty-state">
              <strong>No products{sub ? ` for ${sub}` : ""}</strong>
              <span>Try a different subcategory or clear the filter.</span>
              {sub && <button type="button" className="secondary-action compact" onClick={() => setSub("")}>Clear filter</button>}
            </div>
          )}
        </div>

        <aside className="cat-rail">
          <div className="cat-callout">
            <Icon name="icon-info" className="button-icon" />
            <div>
              <strong>Drill down or jump to products</strong>
              <p>Explore subcategories to narrow your search, or view all products in {category.name}.</p>
              <div className="cat-callout-actions">
                <button type="button" className="cat-callout-primary" onClick={() => { setSub(""); setShowAllProducts(true); requestAnimationFrame(scrollToProducts); }}>
                  View all {fmt(productCount)} products
                  <Icon name="icon-arrow-right" className="button-icon" />
                </button>
                <button type="button" className="cat-callout-secondary" onClick={() => onNavigate("/app/catalog")}>
                  Back to all categories
                </button>
              </div>
            </div>
          </div>

          {topSuppliers.length > 0 && (
            <section className="cat-panel">
              <header><h3>Top suppliers</h3></header>
              <ul className="cat-supplier-list">
                {topSuppliers.slice(0, 5).map((supplier) => (
                  <li key={supplier.id}>
                    <span className="cat-supplier-avatar">{supplierInitials(supplier.name)}</span>
                    <span className="cat-supplier-name">{supplier.name}</span>
                    <em>{(supplier.product_count || 0).toLocaleString()}</em>
                  </li>
                ))}
              </ul>
              <button type="button" className="cat-panel-action" onClick={() => onNavigate("/app/settings")}>
                View all {topSuppliers.length} suppliers
              </button>
            </section>
          )}

          <section className="cat-panel">
            <header><h3>Subcategories</h3></header>
            <ul className="cat-sublink-list">
              {category.subcategories.map((option) => (
                <li key={option.name}>
                  <button type="button" className={sub === option.name ? "active" : ""} onClick={() => browseSub(option.name)}>
                    {option.name}
                    <Icon name="icon-chevron-right" className="button-icon" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {recent.length > 0 && (
            <section className="cat-panel">
              <header><h3>Recently viewed</h3></header>
              <ul className="cat-recent-list">
                {recent.map((item) => (
                  <li key={item.slug}>
                    <button type="button" onClick={() => onNavigate(`/app/catalog/${item.slug}`)}>
                      <span className={`cat-tile sm tint-${item.tint}`}><Icon name={item.icon} className="nav-icon" /></span>
                      {item.name}
                      <Icon name="icon-chevron-right" className="button-icon" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// Product detail surface reached from search (/app/product/[handle]). Pulls the
// canonical product + supplier offers from the same API the search uses, then
// lays out the comparison, specs, substitutes, and reorder rail.
function ProductDetail({ handle, onNavigate, onToast, onAddToList, listName, listSummary }) {
  // A product may be a family of size/spec variants. `variants` holds them in
  // selector order; `activeIdx` is the chosen one and drives the whole page.
  const [variants, setVariants] = useState([]);
  const [family, setFamily] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [status, setStatus] = useState("loading");
  const [subs, setSubs] = useState([]);
  const [qty, setQty] = useState(1);
  const [uom, setUom] = useState("Box");
  // Full-screen image viewer (the "View larger image" affordance).
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!handle) {
      setStatus("missing");
      return undefined;
    }

    let live = true;
    setStatus("loading");
    setLightbox(false);
    setActiveIdx(0);

    fetch(`/api/canonical-products?handle=${encodeURIComponent(handle)}`)
      .then((response) => response.json())
      .then(({ canonical_products: products, family: familyInfo }) => {
        if (!live) return;
        const list = products || [];
        if (!list.length) {
          setStatus("missing");
          return;
        }
        // Land on the requested variant; a family handle has no exact match, so
        // default to the first (lowest-ranked) variant.
        const idx = Math.max(
          0,
          list.findIndex((v) => (v.handle || "").toLowerCase() === handle.toLowerCase())
        );
        setVariants(list);
        setFamily(familyInfo || null);
        setActiveIdx(idx);
        setUom(cap(list[idx].unit_of_measure) || "Box");
        setStatus("ready");

        // Comparable products: search by the product's family/type keyword so we
        // surface same-type variants (the curated category is often too narrow).
        const base = list[idx];
        const foundAttrs = parseAttributes(base.attributes_text);
        const term = (familyInfo?.family_name || foundAttrs.family || base.name || "").split(/\s+/)[0];
        if (term) {
          fetch(`/api/canonical-products?q=${encodeURIComponent(term)}&limit=8`)
            .then((response) => response.json())
            .then(({ canonical_products: related }) => {
              if (!live) return;
              setSubs(
                (related || [])
                  .filter(
                    (entry) =>
                      entry.handle !== base.handle &&
                      (!familyInfo || entry.family_id !== familyInfo.family_id)
                  )
                  .slice(0, 3)
              );
            })
            .catch(() => live && setSubs([]));
        }
      })
      .catch(() => live && setStatus("missing"));

    return () => {
      live = false;
    };
  }, [handle]);

  // Switch the selected variant in place (no refetch); keep the URL shareable.
  function selectVariant(index) {
    setActiveIdx(index);
    const nextHandle = variants[index]?.handle;
    if (nextHandle) {
      window.history.replaceState({}, "", `/app/product/${nextHandle}`);
    }
  }

  const product = variants[activeIdx];

  if (status === "loading") {
    return <div className="pdp-state">Loading product&hellip;</div>;
  }

  if (status === "missing" || !product) {
    return (
      <div className="pdp-state">
        <strong>Product not found</strong>
        <p>We couldn&rsquo;t find that product in the catalog.</p>
        <a className="secondary-action compact" href="/app/catalog/search" onClick={(event) => { event.preventDefault(); onNavigate("/app/catalog/search"); }}>Back to search</a>
      </div>
    );
  }

  const attrs = parseAttributes(product.attributes_text);
  // Breadcrumb middle crumb: the curated department this product's live category
  // rolls up into (null when the category doesn't map to one).
  const department = departmentForCategory(product.category);
  const variantGroupLabel = family ? variantAxisLabel(variants) : null;
  // The API returns one offer per supplier variant; collapse to the lowest-priced
  // offer per supplier so the comparison reads as a supplier comparison (one row
  // each) and the "N suppliers" counts stay consistent with the hero badge.
  // Rank suppliers by comparable per-unit price (F1). Offers whose pack is
  // unknown — or whose unit isn't comparable to the rest of the group (F2) —
  // have no trustworthy per-unit price and fall last, ordered by sticker price.
  const offerUnitCost = (offer) =>
    offer.unit_comparable && offer.unit_price_cents != null
      ? offer.unit_price_cents
      : Number.MAX_SAFE_INTEGER;
  const sortedOffers = [...(product.offers || [])].sort((a, b) => {
    const ua = offerUnitCost(a);
    const ub = offerUnitCost(b);
    if (ua !== ub) return ua - ub;
    return (a.price_cents ?? 0) - (b.price_cents ?? 0);
  });
  const seenSuppliers = new Set();
  const offers = sortedOffers.filter((offer) => {
    const key = offer.supplier_id || offer.supplier_name;
    if (seenSuppliers.has(key)) return false;
    seenSuppliers.add(key);
    return true;
  });
  const best = offers[0];
  const supplierCount = offers.length;
  const image = product.image_url || offers.find((offer) => offer.image_url)?.image_url || "";
  const brand = best?.brand || attrs.brands?.[0] || "";
  const packSize = normalizePackText(attrs.pack_sizes?.[0] || best?.name?.match(/(\d+\s*\/\s*[A-Za-z.]+)/)?.[1]) || "—";
  const uomLabel = (uom || "unit").toLowerCase();
  // Whether the group's per-unit prices are comparable (same base unit), and the
  // unit they compare in — drives the "/ ea" labels and the mixed-units note.
  const unitComparable = !!product.unit_comparable;
  const unitBasis = product.unit_comparison_basis || best?.base_unit || "ea";
  const bestPerUnit = best && best.unit_comparable && best.unit_price_cents != null
    ? best.unit_price_cents / 100
    : null;
  const bestUnit = best ? best.price_cents / 100 : null;
  const prices = offers.map((offer) => offer.price_cents);
  const range = prices.length ? { lowest: Math.min(...prices), highest: Math.max(...prices) } : null;

  const chips = [
    attrs.size && ["Size", titleCase(attrs.size)],
    attrs.family && ["Type", titleCase(attrs.family)],
    brand && ["Brand", brand],
    packSize !== "—" && ["Pack", packSize],
    product.category && ["Category", product.category],
  ].filter(Boolean).slice(0, 5);

  const specs = [
    ["Category", product.category],
    ["Unit of measure", cap(product.unit_of_measure)],
    ["Pack size", packSize !== "—" ? packSize : null],
    ["Size", titleCase(attrs.size)],
    ["Type", titleCase(attrs.family)],
    ["Brand", brand],
    ["Suppliers", String(supplierCount)],
    ["Match basis", best?.match_status ? titleCase(best.match_status) : null],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="pdp">
      <div className="pdp-breadcrumb-row">
        <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
          <a href="/app/catalog" onClick={(event) => { event.preventDefault(); onNavigate("/app/catalog"); }}>Products</a>
          {department && (
            <>
              <Icon name="icon-chevron-right" className="nav-icon" />
              <a
                href={`/app/catalog/${department.slug}`}
                onClick={(event) => { event.preventDefault(); onNavigate(`/app/catalog/${department.slug}`); }}
              >
                {department.name}
              </a>
            </>
          )}
          <Icon name="icon-chevron-right" className="nav-icon" />
          <span>{family ? family.family_name : product.name}</span>
        </nav>
        <div className="pdp-top-actions">
          <button className="secondary-action compact" type="button" onClick={() => window.history.back()}>
            <Icon name="icon-chevron-left" className="button-icon" />
            Back
          </button>
          <button className="secondary-action compact" type="button" onClick={() => window.print()}>
            <Icon name="icon-file-text" className="button-icon" />
            Print
          </button>
        </div>
      </div>

      <div className="pdp-layout">
        <div className="pdp-main">
          <section className="crl-card pdp-hero">
            <div className="pdp-hero-media">
              {image ? (
                <img src={image} alt={product.name} onClick={() => setLightbox(true)} style={{ cursor: "zoom-in" }} />
              ) : (
                <div className="pdp-hero-placeholder">No image available</div>
              )}
              {image && (
                <button type="button" className="pdp-view-larger" onClick={() => setLightbox(true)}>
                  <Icon name="icon-search" className="button-icon" />
                  View larger image
                </button>
              )}
            </div>
            <div className="pdp-hero-body">
              <div className="pdp-hero-headline">
                <h1>{family ? family.family_name : product.name}</h1>
                <span className="pdp-badge ok">
                  <Icon name="icon-check-circle" className="button-icon" />
                  Matched across {supplierCount} supplier{supplierCount === 1 ? "" : "s"}
                </span>
              </div>
              {brand && <span className="pdp-brand-link">{brand}<Icon name="icon-link" className="button-icon" /></span>}
              {variants.length > 1 && (
                <div className="pdp-variants" role="group" aria-label={`Choose ${variantGroupLabel}`}>
                  <span className="pdp-variants-label">{variantGroupLabel}: <strong>{product.variant_label}</strong></span>
                  <div className="pdp-variant-options">
                    {variants.map((variant, index) => (
                      <button
                        key={variant.id}
                        type="button"
                        className={`pdp-variant ${index === activeIdx ? "active" : ""}`}
                        aria-pressed={index === activeIdx}
                        onClick={() => selectVariant(index)}
                      >
                        {variant.variant_label || `Option ${index + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pdp-spec-row">
                <div><span>SKU</span><strong>{best?.sku || "—"}</strong></div>
                <div><span>Pack Size</span><strong>{packSize}</strong></div>
                <div><span>UOM</span><strong>{cap(product.unit_of_measure) || "Unit"}</strong></div>
                <div><span>Category</span><strong>{product.category}</strong></div>
              </div>
              <div className="pdp-desc">
                <h4>Product description</h4>
                <p>{product.description || `${titleCase(attrs.family) || product.name}. Matched across ${supplierCount} supplier${supplierCount === 1 ? "" : "s"} in our catalog.`}</p>
              </div>
              {chips.length > 0 && (
                <div className="pdp-chips">
                  {chips.map(([label, value]) => (
                    <div className="pdp-chip" key={label}>
                      <span className="pdp-chip-dot" aria-hidden="true" />
                      <div><span>{label}</span><strong>{value}</strong></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="crl-card pdp-compare">
            <div className="pdp-compare-head">
              <div className="pdp-compare-title">
                <h2>Supplier pricing comparison</h2>
                <span className="pdp-count-badge">{offers.length} supplier{offers.length === 1 ? "" : "s"}</span>
                {offers.length > 1 && !unitComparable && (
                  <span className="pdp-compare-note" title="These offers use different pack units, so per-unit prices can't be compared directly. Ranked by pack price instead.">
                    <Icon name="icon-alert-triangle" className="button-icon" />
                    Mixed pack units — ranked by pack price
                  </span>
                )}
              </div>
              <span className="pdp-compare-note">Extended price shown for {qty} &times; {cap(uom)}</span>
            </div>

            <div className="pdp-table-wrap">
              <div className="pdp-table">
                <div className="pdp-thead">
                  <span>Supplier</span>
                  <span>Supplier SKU</span>
                  <span>Unit price</span>
                  <span>Est. extended price</span>
                  <span>Availability</span>
                  <span>Actions</span>
                </div>
                {offers.map((offer, index) => {
                  const packPrice = offer.price_cents / 100;
                  // The comparable figure is the per-unit price; show it as the
                  // headline and the pack price/size as context. When the offer
                  // has no comparable unit price, fall back to the pack price.
                  const perUnit = offer.unit_comparable && offer.unit_price_cents != null
                    ? offer.unit_price_cents / 100
                    : null;
                  const packLabel = formatPackLabel(offer.pack_quantity, offer.pack_basis, offer.base_unit, offer.pack_size);
                  const logo = supplierLogoSrc(offer.supplier_name);
                  const avail = availabilityInfo(offer.availability);
                  return (
                    <div className={`pdp-row ${index === 0 ? "best" : ""}`} key={offer.supplier_product_id || index}>
                      <div className="pdp-row-supplier">
                        <span className={`pdp-supplier-logo ${logo ? "has-img" : ""}`}>
                          {logo ? <img src={logo} alt="" /> : initials(offer.supplier_name)}
                        </span>
                        <div>
                          <strong>{offer.supplier_name}</strong>
                          {offer.brand && <small>{offer.brand}</small>}
                        </div>
                      </div>
                      <div className="pdp-row-sku">{offer.sku || "—"}</div>
                      <div className="pdp-row-unit">
                        {perUnit != null ? (
                          <>
                            <strong>{money.format(perUnit)}</strong> <span>/ {unitBasis}</span>
                            <small className="pdp-unit-sub">{money.format(packPrice)}{packLabel ? ` · ${packLabel}` : ""}</small>
                          </>
                        ) : (
                          <>
                            <strong>{money.format(packPrice)}</strong> <span>/ {packLabel ? "pack" : uomLabel}</span>
                            <small className="pdp-unit-sub muted">{packLabel || "pack size unknown"}</small>
                          </>
                        )}
                        {index === 0 && <span className="pdp-tag-best">{unitComparable ? "Best per-unit" : "Lowest price"}</span>}
                      </div>
                      <div className="pdp-row-ext">{money.format(packPrice * qty)}</div>
                      <div className={`pdp-row-avail ${avail.tone}`}>
                        <span><span className="pdp-dot" aria-hidden="true" />{avail.label}</span>
                      </div>
                      <div className="pdp-row-actions">
                        {offer.product_url ? (
                          <a className="pdp-open" href={offer.product_url} target="_blank" rel="noreferrer">
                            <Icon name="icon-link" className="button-icon" />
                            Open supplier
                          </a>
                        ) : (
                          <button className="pdp-open" type="button" onClick={() => onToast(`Supplier link unavailable for ${offer.supplier_name}`)}>
                            <Icon name="icon-link" className="button-icon" />
                            Open supplier
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {range && range.lowest !== range.highest && (
              <div className="pdp-history">
                <div className="pdp-history-head">Price range across suppliers</div>
                <div className="pdp-history-row">
                  <span>Lowest offer</span>
                  <strong>{money.format(range.lowest / 100)}</strong>
                </div>
                <div className="pdp-history-bar" aria-hidden="true"><span /></div>
                <div className="pdp-history-row">
                  <span>Highest offer</span>
                  <strong>{money.format(range.highest / 100)}</strong>
                </div>
                <small>Across {offers.length} current supplier offer{offers.length === 1 ? "" : "s"}.</small>
              </div>
            )}
          </section>

          <div className="pdp-bottom-grid">
            <section className="crl-card pdp-subs">
              <div className="pdp-card-head">
                <h2>Comparable products / substitutes</h2>
                <a className="pdp-link" href="/app/catalog" onClick={(event) => { event.preventDefault(); onNavigate("/app/catalog"); }}>View all</a>
              </div>
              {subs.length === 0 && <p className="pdp-empty">No substitutes found in this category.</p>}
              {subs.map((sub) => {
                const subImage = sub.image_url || sub.best_offer?.image_url || "";
                const subPrice = sub.best_offer ? money.format(sub.best_offer.price_cents / 100) : "Price pending";
                return (
                  <div className="pdp-sub" key={sub.id}>
                    <span className="pdp-sub-thumb">
                      {subImage ? <img src={subImage} alt={sub.name} loading="lazy" /> : <Icon name="icon-package" className="nav-icon" />}
                    </span>
                    <div className="pdp-sub-body">
                      <strong>{sub.name}</strong>
                      <small>{sub.best_offer?.supplier_name || sub.best_offer?.brand || "Supplier pending"}</small>
                    </div>
                    <span className="pdp-sub-price">{subPrice}</span>
                    <button className="pdp-sub-link" type="button" onClick={() => onNavigate(`/app/product/${sub.handle}`)}>View alternative</button>
                  </div>
                );
              })}
            </section>

            <section className="crl-card pdp-specs">
              <div className="pdp-card-head">
                <h2>Product details &amp; specifications</h2>
              </div>
              <div className="pdp-specs-grid">
                {specs.map(([label, value]) => (
                  <div className="pdp-spec" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="pdp-rail">
          <section className="crl-card pdp-add">
            <h3>Add to Current Reorder List</h3>
            <div className="pdp-field">
              <span>Current list</span>
              <div className="pdp-current-list"><Icon name="icon-list" className="nav-icon" />{listName || "Current reorder list"}</div>
            </div>
            <div className="pdp-qty-grid">
              <label className="pdp-field">
                <span>Quantity</span>
                <QtyStepper qty={qty} setQty={setQty} />
              </label>
              <label className="pdp-field">
                <span>UOM</span>
                <UomSelect uom={uom} setUom={setUom} />
              </label>
            </div>
            {best && (
              <div className="pdp-best-box">
                <div className="pdp-best-main">
                  <span>Best price ({best.supplier_name})</span>
                  <strong>{money.format(bestPerUnit ?? bestUnit)} <em>/ {bestPerUnit != null ? unitBasis : uomLabel}</em></strong>
                </div>
                <div className="pdp-best-side">
                  <span>Est. total</span>
                  <strong>{money.format(bestUnit * qty)}</strong>
                </div>
                <small className="pdp-best-foot">{availabilityInfo(best.availability).label}</small>
              </div>
            )}
            <button
              className="primary-action"
              type="button"
              onClick={() => {
                onAddToList?.(product, qty, cap(uom));
                onToast(`Added ${qty} × ${cap(uom)} of ${product.name} to ${listName || "your reorder list"}`);
              }}
            >
              Add to Reorder List
            </button>
            <button className="secondary-action" type="button" onClick={() => onNavigate("/app")}>
              <Icon name="icon-file-text" className="button-icon" />
              View Current Reorder List
            </button>
          </section>

          {listSummary && listSummary.items > 0 && (
            <section className="crl-card pdp-summary">
              <div className="pdp-card-head">
                <h3>Current list summary</h3>
                <button className="pdp-link" type="button" onClick={() => onNavigate("/app")}>Open list</button>
              </div>
              <div className="pdp-summary-list">
                <div><span>Total items</span><strong>{listSummary.items}</strong></div>
                <div><span>Total suppliers</span><strong>{listSummary.suppliers}</strong></div>
                <div><span>Estimated spend</span><strong>{money.format(listSummary.spend)}</strong></div>
              </div>
            </section>
          )}

          <section className="crl-card pdp-help">
            <h3>Need help?</h3>
            <p>Not seeing what you need? We can help you find the right product or supplier.</p>
            <button className="secondary-action" type="button" onClick={() => onToast("Support request started")}>
              <Icon name="icon-headset" className="button-icon" />
              Contact support
            </button>
          </section>
        </aside>
      </div>

      {lightbox && image && (
        <div className="pdp-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(false)}>
          <button type="button" className="pdp-lightbox-close" aria-label="Close" onClick={() => setLightbox(false)}>&times;</button>
          <img src={image} alt={product.name} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

const matchReviewSample = [
  {
    id: 1, image: "/products/bibs.png", importedName: "BIBS, 2PLY, BLUE, 500/BX", importedSub: "SKU: 112-4521",
    supplier: "Henry Schein", matchName: "Patient Bibs 2-Ply Blue", matchSub: "112-4521 · 500/Box",
    confidence: 95, price: 35.20, perEa: 0.070, status: "Matched", qty: 500, uom: "Box", lineTotal: 35.20,
    others: [
      { name: "Patient Bibs 2-Ply Blue", sub: "112-4520 · 250/Box", supplier: "Henry Schein", price: 18.90, perEa: 0.076, confidence: 85 },
      { name: "Patient Bibs 3-Ply Blue", sub: "113-1070 · 500/Box", supplier: "Henry Schein", price: 41.50, perEa: 0.083, confidence: 62 },
    ],
  },
  {
    id: 2, image: "/products/microbrush.png", importedName: "Microbrush Superfine", importedSub: "REGULAR, BLUE, 100/BAG",
    supplier: "Henry Schein", matchName: "Microbrush Regular Superfine Blue (100/bag)", matchSub: "100-2604",
    confidence: 88, price: 12.45, perEa: 0.125, status: "Matched", qty: 100, uom: "Bag", lineTotal: 12.45,
    others: [{ name: "Microbrush Superfine Blue", sub: "100-2601 · 100/Bag", supplier: "Henry Schein", price: 11.90, perEa: 0.119, confidence: 71 }],
  },
  {
    id: 3, image: "/products/varnish.png", importedName: "3M Clinpro White", importedSub: "VARNISH 5% SOD FLUORIDE",
    supplier: "3M", matchName: "Clinpro White Varnish", matchSub: "5% Sodium Fluoride, 50/Pack · 12125",
    confidence: 92, price: 64.99, perEa: 1.30, status: "Matched", qty: 50, uom: "Pack", lineTotal: 64.99,
    others: [{ name: "Clinpro 5% Sodium Fluoride Varnish", sub: "12126 · 100/Pack", supplier: "3M", price: 119.00, perEa: 1.19, confidence: 64 }],
  },
  {
    id: 4, image: "/products/adhesive.png", importedName: "Kerr OptiBond", importedSub: "ALL-IN-ONE ADHESIVE 5ML",
    supplier: "Henry Schein", matchName: "OptiBond All-In-One Adhesive 5ml", matchSub: "36581",
    confidence: 74, price: 123.10, perEa: 123.10, status: "Review", qty: 1, uom: "Each", lineTotal: 123.10,
    others: [{ name: "OptiBond Universal Adhesive 5ml", sub: "37210", supplier: "Henry Schein", price: 118.50, perEa: 118.50, confidence: 58 }],
  },
  {
    id: 5, image: "/products/wipes.png", importedName: "CaviWipes", importedSub: "DISINFECTING WIPES 160CT",
    supplier: "Metrex", matchName: "CaviWipes Disinfecting Wipes 160 Count", matchSub: "13-1100",
    confidence: 45, price: 11.75, perEa: 0.073, status: "Review", qty: 160, uom: "Count", lineTotal: 11.75,
    others: [{ name: "CaviWipes XL Disinfecting Wipes", sub: "13-1090 · 65 Count", supplier: "Metrex", price: 9.40, perEa: 0.145, confidence: 39 }],
  },
  {
    id: 6, importedName: "XYZ Disposable", importedSub: "NEEDLE 27G SHORT 100/BX",
    supplier: "—", matchName: null, matchSub: null, confidence: null, price: null, perEa: null, status: "Not found", qty: 100, uom: "Box", lineTotal: null, others: [],
  },
  {
    id: 7, importedName: "Gauze Sponges 2x2", importedSub: "NON STERILE 4 PLY 200/BAG",
    supplier: "—", matchName: null, matchSub: null, confidence: null, price: null, perEa: null, status: "Not found", qty: 200, uom: "Bag", lineTotal: null, others: [],
  },
];

const matchReviewSampleStats = { total: 124, matched: 82, review: 28, notFound: 14, high: 64, med: 40, low: 20, matchedPct: 66, reviewPct: 23, notFoundPct: 11 };

const MR_STATUS = {
  Matched: { cls: "matched", label: "Matched" },
  Review: { cls: "review", label: "Review" },
  "Not found": { cls: "notfound", label: "Not found" },
};

function mrMoney(n) { return `$${Number(n).toFixed(2)}`; }
function mrEa(n) { return Number(n) >= 1 ? Number(n).toFixed(2) : Number(n).toFixed(3); }
function mrConfTone(n) { return n >= 80 ? "high" : n >= 50 ? "med" : "low"; }

// Stable id for a draft item so a buyer's verification decision can be written
// back to the right row even as the list is filtered, re-sorted, or re-derived.
let itemIdSeq = 0;
function newItemId() { return `li_${Date.now().toString(36)}_${(itemIdSeq++).toString(36)}`; }

// Identity for a supplier offer within an item's offer list. Mirrors the
// supplier|sku|price dedupe key used when offers are built in
// app/api/requests/route.js, so a chosen offer survives re-derivation.
function offerKey(offer) { return `${offer?.supplier || ""}|${offer?.sku || ""}|${offer?.price ?? ""}`; }
// Favicon/small logo per catalog supplier, saved under public/suppliers. Keyed
// by a distinctive substring of the supplier name so it matches regardless of
// how the name is formatted upstream.
const SUPPLIER_LOGOS = [
  { match: "amazon", src: "/suppliers/amazon.png" },
  { match: "american dental", src: "/suppliers/amerdental.png" },
  { match: "carolina", src: "/suppliers/carolinadental.png" },
  { match: "dc dental", src: "/suppliers/dcdental.png" },
  { match: "dental city", src: "/suppliers/dentalcity.png" },
  { match: "pearson", src: "/suppliers/pearsondental.png" },
  { match: "unimed", src: "/suppliers/unimedusa.png" },
  { match: "young", src: "/suppliers/youngspecialties.png" },
  { match: "zirc", src: "/suppliers/zirc.png" },
];

function supplierLogoSrc(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (key.includes("schein")) return "/schein-logo.png";
  return SUPPLIER_LOGOS.find((supplier) => key.includes(supplier.match))?.src || null;
}

function CatalogSupplierAvatar({ name }) {
  const logo = supplierLogoSrc(name);
  return (
    <span className={`cat-supplier-avatar ${logo ? "has-img" : ""}`}>
      {logo ? <img src={logo} alt="" /> : supplierInitials(name)}
    </span>
  );
}

function MatchSupplier({ name }) {
  if (!name || name === "—") return <span className="mr-supplier-none">—</span>;
  const key = name.toLowerCase();
  if (key.includes("3m")) return <span className="mr-supplier mr-logo-3m">3M</span>;
  if (key.includes("metrex")) return <span className="mr-supplier mr-logo-metrex">Metrex</span>;
  const logo = supplierLogoSrc(name);
  if (logo) return (<span className="mr-supplier"><img className="mr-supplier-img" src={logo} alt="" /><span>{key.includes("schein") ? "Henry Schein" : name}</span></span>);
  return <span className="mr-supplier">{name}</span>;
}

// Maps the barcodes on /test-barcodes.html to catalog products so a scan
// produces a real matched item. Unknown codes still get added as "needs review".
const SCAN_CATALOG = {
  "MBRREG-BLU-100": { product: "Microbrush Regular Superfine Blue", supplier: "Henry Schein", sku: "MBRREG-BLU-100", unit: "Bag", price: 12.45, confidence: 0.96 },
  "HS-GAUZE-2X2-200": { product: "Gauze Sponges 2x2 8-ply", supplier: "Henry Schein", sku: "HS-GAUZE-2X2-200", unit: "Pack", price: 6.8, confidence: 0.93 },
  "051131884021": { product: "Filtek Universal Composite A2", supplier: "3M ESPE", sku: "51131884021", unit: "Syringe", price: 28.9, confidence: 0.9 },
  "SEP-LIDO2-EPI-50": { product: "Lidocaine HCl 2% Epi 1:100k", supplier: "Septodont", sku: "SEP-LIDO2-EPI-50", unit: "Box", price: 41.2, confidence: 0.88 },
  "PRM-PROPHY-SOFT-100": { product: "Disposable Prophy Angles Soft", supplier: "Premier", sku: "PRM-PROPHY-SOFT-100", unit: "Box", price: 18.4, confidence: 0.92 },
  "012345678905": { product: "Earloop Procedure Masks Level 3", supplier: "Crosstex", sku: "012345678905", unit: "Box", price: 9.75, confidence: 0.85 },
  "DEN-CAV-FSI1000-30K": { product: "Cavitron Insert FSI-1000 30K", supplier: "Dentsply Sirona", sku: "DEN-CAV-FSI1000-30K", unit: "Each", price: 64, confidence: 0.81 },
  "PAT-GLOVE-NIT-M-200": { product: "Nitrile Exam Gloves PF Medium", supplier: "Patterson", sku: "PAT-GLOVE-NIT-M-200", unit: "Box", price: 11.3, confidence: 0.89 },
};

function mapSearchOffer(offer) {
  return {
    name: offer.name,
    supplier: offer.supplier_name,
    supplierId: offer.supplier_id,
    sku: offer.sku,
    brand: offer.brand || "",
    price: (offer.price_cents ?? 0) / 100,
    comparablePrice: (offer.price_cents ?? 0) / 100,
    perUnit: offer.unit_price_cents != null ? offer.unit_price_cents / 100 : null,
    packQty: offer.pack_quantity ?? null,
    packBasis: offer.pack_basis ?? null,
    baseUnit: offer.base_unit ?? null,
    packSize: offer.pack_size || "",
    imageUrl: offer.image_url || "",
    productUrl: offer.product_url || "",
  };
}

// Resolve a scanned value to a catalog product: try the GTIN/UPC barcode path
// first (the scanner's main case), then fall back to an exact SKU lookup so
// SKU-encoded labels and manually keyed codes still resolve.
async function lookupScannedProduct(code) {
  if (!code) return null;
  const tryLookup = async (param) => {
    try {
      const response = await fetch(`/api/products/search?${param}=${encodeURIComponent(code)}&limit=1`);
      const data = await response.json();
      return data.canonical_products?.[0] || null;
    } catch {
      return null;
    }
  };
  return (await tryLookup("barcode")) || (await tryLookup("code"));
}

function makeScanDraftItem(code, product) {
  const base = {
    id: newItemId(),
    source: "scan",
    draftQty: 1,
    qty: 1,
    included: true,
    documentIds: ["scan"],
    documentQuantities: { scan: 1 },
    barcode: code || "",
    extractedFrom: `Scanned · ${code || "no code"}`,
    // A barcode carries no price, so there's no savings anchor until the buyer
    // tells us what they currently pay (captured in the item detail panel).
    paidUnitPrice: null,
  };
  // Real catalog match from the lookup endpoint.
  if (product) {
    const offers = (product.offers || []).map(mapSearchOffer);
    const best = offers[0] || (product.best_offer ? mapSearchOffer(product.best_offer) : null);
    return {
      ...base,
      product: product.name,
      canonicalName: product.name,
      canonicalHandle: product.handle || product.id || "",
      sku: product.best_offer?.sku || code || "",
      unit: product.base_unit || product.unit_of_measure || "ea",
      matchStatus: "exact",
      confidence: product.match?.score ?? 0.9,
      imageUrl: product.image_url || product.best_offer?.image_url || "",
      oldVendor: best?.supplier || "",
      oldUnitPrice: best?.price ?? 0,
      bestOffer: best,
      offers,
    };
  }
  // Demo barcodes (test-barcodes.html) still resolve via the local map.
  const hit = code ? SCAN_CATALOG[code] : null;
  if (hit) {
    const offer = {
      name: hit.product, supplier: hit.supplier, sku: hit.sku, brand: "",
      price: hit.price, comparablePrice: hit.price, perUnit: null,
      packQty: null, packSize: "", imageUrl: "",
    };
    return {
      ...base,
      product: hit.product,
      canonicalName: hit.product,
      sku: hit.sku,
      unit: hit.unit,
      matchStatus: "exact",
      confidence: hit.confidence,
      oldVendor: hit.supplier,
      oldUnitPrice: hit.price,
      bestOffer: offer,
      offers: [offer],
    };
  }
  return {
    ...base,
    product: null,
    canonicalName: null,
    sku: code || "",
    unit: "ea",
    matchStatus: "unmatched",
    confidence: 0,
    oldVendor: "",
    oldUnitPrice: 0,
    bestOffer: null,
    offers: [],
  };
}

function statusFromItem(item) {
  if (item.matchStatus) {
    // An unmatched line stays "Not found" until the buyer links a product to it.
    if (item.matchStatus === "unmatched" && !item.linked) return "Not found";
    // A linked item is a confident match; otherwise needs_review is the soft
    // low-confidence signal (informational — no user "verify" step).
    if (item.linked) return "Matched";
    return item.matchStatus === "needs_review" ? "Review" : "Matched";
  }
  // Legacy/scan fallback by status string.
  return item.status === "Parsed" ? "Matched" : item.status === "No match" ? "Not found" : "Review";
}

// Choose which supplier offer to surface as "best" given the buyer's
// preferences. Best price ranks by per-unit cost; preferred suppliers filter
// the pool when any match; brand match favors the invoice's own vendor/brand.
function pickBestOffer(offers, prefs, item) {
  if (!offers || !offers.length) return null;
  let pool = offers;
  const preferred = prefs?.preferredSuppliers || [];
  if (preferred.length) {
    const inPref = offers.filter((offer) =>
      preferred.some((name) => (offer.supplier || "").toLowerCase().includes(name.toLowerCase())));
    if (inPref.length) pool = inPref;
  }
  // Never recommend an out-of-stock offer when an orderable one exists. Prefer
  // in-stock within the chosen pool; if the whole pool is out of stock, fall
  // back to any in-stock offer before settling for an unorderable one. When
  // nothing is orderable, the cheapest still wins (and surfaces the OOS badge).
  const orderable = pool.filter(isOrderable);
  if (orderable.length) pool = orderable;
  else {
    const anyOrderable = offers.filter(isOrderable);
    if (anyOrderable.length) pool = anyOrderable;
  }
  const cost = (offer) => offer.perUnit ?? offer.comparablePrice ?? offer.price ?? Infinity;
  if (prefs?.strategy === "brand-match") {
    const want = (item?.oldVendor || "").toLowerCase();
    const branded = want
      ? pool.filter((offer) => (offer.supplier || "").toLowerCase().includes(want) || (offer.brand || "").toLowerCase().includes(want))
      : [];
    if (branded.length) return [...branded].sort((a, b) => cost(a) - cost(b))[0];
  }
  return [...pool].sort((a, b) => cost(a) - cost(b))[0];
}

// Normalize a supplier name so reorder-list rows (which carry the display name)
// can be matched to the shipping policy loaded from /api/suppliers.
function normSupplierName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Build a { normalizedName -> policy } map from the /api/suppliers payload.
// Cents are converted to dollars to match the reorder list's row math.
function buildShippingByName(suppliers) {
  const map = {};
  for (const supplier of suppliers || []) {
    const key = normSupplierName(supplier.name);
    if (!key) continue;
    map[key] = {
      name: supplier.name,
      freeThreshold: supplier.free_shipping_threshold_cents != null ? supplier.free_shipping_threshold_cents / 100 : null,
      flat: supplier.flat_shipping_cents != null ? supplier.flat_shipping_cents / 100 : null,
    };
  }
  return map;
}

// Shipping for one supplier's basket given its item subtotal. Returns null when
// the policy can't price this basket, so the UI says "not estimated" rather than
// implying free shipping.
function computeSupplierShipping(policy, subtotal) {
  if (!policy) return null;
  const { freeThreshold, flat } = policy;
  if (freeThreshold != null && subtotal >= freeThreshold) return 0;
  if (flat != null) return flat;
  return null;
}

// Landed-cost totals for the plan: item subtotal, shipping estimated per
// supplier basket (free-over-threshold kicks in at the basket level), and the
// combined landed total. Also returns the single most actionable free-shipping
// nudge — the supplier closest to clearing its free threshold.
function computePlanTotals(rows, shippingByName) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row || row.supplier === "—" || row.lineTotal == null) continue;
    const key = normSupplierName(row.supplier);
    const group = groups.get(key) || { name: row.supplier, subtotal: 0 };
    group.subtotal += row.lineTotal;
    groups.set(key, group);
  }

  let itemsSubtotal = 0;
  let shippingTotal = 0;
  let knownCount = 0;
  let nudge = null;
  for (const [key, group] of groups) {
    itemsSubtotal += group.subtotal;
    const policy = shippingByName?.[key] || null;
    const shipping = computeSupplierShipping(policy, group.subtotal);
    if (shipping == null) continue;
    shippingTotal += shipping;
    knownCount += 1;
    // Keep the closest reachable free-shipping threshold as the nudge.
    if (shipping > 0 && policy?.freeThreshold != null) {
      const remaining = policy.freeThreshold - group.subtotal;
      if (remaining > 0 && (!nudge || remaining < nudge.remaining)) {
        nudge = { supplier: group.name, remaining, saves: shipping };
      }
    }
  }

  const suppliers = groups.size;
  return {
    itemsSubtotal,
    shippingTotal,
    landedTotal: itemsSubtotal + shippingTotal,
    suppliers,
    hasShippingData: knownCount > 0,
    // Every supplier with items has a known policy → the estimate is complete.
    shippingComplete: suppliers > 0 && knownCount === suppliers,
    nudge,
  };
}

// Candidate offers for a line under the buyer's preferences — mirrors
// pickBestOffer's preferred-supplier filter so optimization never proposes a
// supplier the buyer excluded.
function candidatePool(offers, prefs) {
  const preferred = prefs?.preferredSuppliers || [];
  if (!preferred.length) return offers;
  const inPref = offers.filter((offer) =>
    preferred.some((name) => (offer.supplier || "").toLowerCase().includes(name.toLowerCase())));
  return inPref.length ? inPref : offers;
}

// Landed cost of an assignment (chosen offer + qty per line): item cost plus
// per-supplier shipping evaluated on each supplier's assigned basket.
function assignmentLanded(assignment, shippingByName) {
  const groups = new Map();
  for (const { offer, qty } of assignment) {
    const key = normSupplierName(offer.supplier);
    const group = groups.get(key) || { subtotal: 0 };
    group.subtotal += (offer.price || 0) * qty;
    groups.set(key, group);
  }
  let total = 0;
  for (const [key, group] of groups) {
    total += group.subtotal + (computeSupplierShipping(shippingByName?.[key] || null, group.subtotal) || 0);
  }
  return total;
}

// Re-assign lines across suppliers to minimize total LANDED cost (item price +
// per-supplier shipping) — this naturally favors consolidating onto a supplier
// whose free-shipping threshold the combined basket can clear. Callers gate this
// on complete shipping data so an unknown policy can't masquerade as free.
//
// Multi-start local search: from each seed (the buyer's current plan, plus one
// "everything to supplier S" per supplier), repeatedly move each line to the
// offer that lowers the landed total until stable, then keep the cheapest result
// across all seeds. The per-supplier seeds keep single-line search from getting
// stuck consolidating onto the wrong supplier. Returns null when nothing beats
// the current plan.
function optimizeLandedAssignment(rows, shippingByName, prefs) {
  const lines = (rows || [])
    .filter((row) => row.status !== "Not found" && (row.offers || []).length && row.itemId)
    .map((row) => {
      // Only consider offers we can actually order — never consolidate a line
      // onto an out-of-stock supplier just to save shipping. Lines with no
      // orderable offer are stranded and drop out of the optimization below.
      const pool = candidatePool(row.offers, prefs).filter(isOrderable);
      const current = pool.find((offer) => offer.key === row.selectedOfferKey) || pool[0];
      return { itemId: row.itemId, qty: row.qty || 1, pool, current };
    })
    .filter((line) => line.pool.length);
  if (lines.length < 2) return null;

  const landedOf = (assign) =>
    assignmentLanded(assign.map((offer, i) => ({ offer, qty: lines[i].qty })), shippingByName);

  const localSearch = (seed) => {
    const assign = seed.slice();
    let improved = true;
    let passes = 0;
    while (improved && passes < 20) {
      improved = false;
      passes += 1;
      for (let i = 0; i < lines.length; i++) {
        let bestOffer = assign[i];
        let bestCost = landedOf(assign);
        for (const cand of lines[i].pool) {
          if (cand.key === assign[i].key) continue;
          assign[i] = cand;
          const cost = landedOf(assign);
          if (cost < bestCost - 1e-6) { bestCost = cost; bestOffer = cand; improved = true; }
        }
        assign[i] = bestOffer;
      }
    }
    return assign;
  };

  const baseline = lines.map((line) => line.current);
  const baseLanded = landedOf(baseline);
  const cheapest = (pool) => [...pool].sort((a, b) => (a.price || 0) - (b.price || 0))[0];
  const suppliers = new Set();
  for (const line of lines) for (const offer of line.pool) suppliers.add(normSupplierName(offer.supplier));

  const seeds = [baseline];
  for (const sup of suppliers) {
    seeds.push(lines.map((line) => line.pool.find((offer) => normSupplierName(offer.supplier) === sup) || cheapest(line.pool)));
  }

  let best = baseline;
  let bestLanded = baseLanded;
  for (const seed of seeds) {
    const result = localSearch(seed);
    const landed = landedOf(result);
    if (landed < bestLanded - 1e-6) { bestLanded = landed; best = result; }
  }

  const savings = baseLanded - bestLanded;
  if (savings <= 0.5) return null;

  const assignmentByItemId = {};
  for (let i = 0; i < lines.length; i++) assignmentByItemId[lines[i].itemId] = best[i].key;
  return { assignmentByItemId, savings, optimizedLanded: bestLanded, suppliers: new Set(best.map((offer) => normSupplierName(offer.supplier))).size };
}

function deriveMatchRows(items, prefs) {
  return (items || []).map((item, index) => {
    const conf = Math.round((item.confidence ?? item.recommendation?.confidence ?? 0) * 100);
    const status = statusFromItem(item);
    const notFound = status === "Not found";
    // Tag every offer with a stable key + display sub so the verify drawer can
    // list them as selectable candidates and remember the buyer's choice.
    const offers = (item.offers || []).map((offer) => ({
      ...offer,
      key: offerKey(offer),
      sub: [offer.sku, normalizePackText(offer.packSize)].filter(Boolean).join(" · "),
    }));
    // "Recommended" is what our preferences pick — it never moves when the buyer
    // overrides their selection. "Selected" is the offer actually in the plan
    // (the buyer's choice, defaulting to our recommendation).
    const fallback = item.bestOffer ? { ...item.bestOffer, key: offerKey(item.bestOffer), sub: [item.bestOffer.sku, normalizePackText(item.bestOffer.packSize)].filter(Boolean).join(" · ") } : null;
    const recommended = notFound ? null : (pickBestOffer(offers, prefs, item) || fallback);
    const chosen = item.selectedOfferKey ? offers.find((offer) => offer.key === item.selectedOfferKey) : null;
    const best = notFound ? null : (chosen || recommended);
    const supplier = notFound ? "—" : (best?.supplier || item.oldVendor || "—");
    const price = best ? best.price : (item.oldUnitPrice ?? 0);
    const perEa = best ? (best.perUnit ?? null) : null;
    const qty = item.draftQty ?? item.qty ?? 1;
    // When the selected offer can't be ordered now, surface the best orderable
    // alternative (same strategy) as a one-click switch — buyer-driven, never
    // applied silently.
    const selectedOrderable = isOrderable(best);
    const orderableAlts = notFound ? [] : offers.filter((offer) => offer.key !== best?.key && isOrderable(offer));
    const switchTarget = !notFound && best && !selectedOrderable && orderableAlts.length
      ? (pickBestOffer(orderableAlts, prefs, item) || null)
      : null;
    const others = offers
      .filter((offer) => offer.key !== best?.key)
      .slice(0, 3)
      .map((offer) => ({
        name: offer.name,
        sub: offer.sub,
        supplier: offer.supplier,
        price: offer.price,
        perEa: offer.perUnit ?? null,
        confidence: Math.max(conf - 10, 40),
      }));
    // Savings against what the practice currently pays. We compare on the
    // pack-normalized "comparable" price (same basis the backend matcher uses:
    // max(0, (paid - comparable) * qty)) so per-pack-size differences are fair.
    const paidUnitPrice = item.paidUnitPrice != null ? Number(item.paidUnitPrice) : null;
    const hasPaidPrice = paidUnitPrice != null && Number.isFinite(paidUnitPrice) && paidUnitPrice > 0;
    const compareUnitPrice = best ? (best.comparablePrice ?? best.price) : null;
    const lineSavings = !notFound && hasPaidPrice && compareUnitPrice != null && paidUnitPrice > compareUnitPrice
      ? (paidUnitPrice - compareUnitPrice) * qty
      : 0;
    return {
      id: index + 1,
      itemId: item.id || null,
      image: best?.imageUrl || item.imageUrl || "",
      source: item.source || ((item.documentIds || []).includes("scan") ? "scan" : "pdf"),
      canonicalName: notFound ? null : (item.canonicalName || item.product || null),
      canonicalHandle: notFound ? null : (item.canonicalHandle || null),
      importedName: item.extractedFrom,
      importedSub: item.sku ? `SKU: ${item.sku}` : (item.unit || ""),
      supplier,
      matchName: notFound ? null : (best?.name || item.canonicalName || item.product || null),
      matchSub: notFound ? null : (best ? [best.sku, normalizePackText(best.packSize)].filter(Boolean).join(" · ") : ""),
      productUrl: notFound ? "" : (best?.productUrl || ""),
      // Stock signal for the selected offer — drives the OOS badge + switch flow.
      availability: notFound ? "unknown" : (best?.availability ?? "unknown"),
      liveAvailable: notFound ? undefined : best?.liveAvailable,
      outOfStock: !notFound && Boolean(best) && !selectedOrderable,
      switchTarget: switchTarget
        ? { key: switchTarget.key, supplier: switchTarget.supplier, price: switchTarget.price, perEa: switchTarget.perUnit ?? null }
        : null,
      confidence: notFound ? null : conf,
      price: notFound ? null : price,
      perEa: notFound ? null : perEa,
      status,
      linked: Boolean(item.linked),
      note: item.note || "",
      offers,
      selectedOfferKey: best?.key || null,
      recommendedOfferKey: recommended?.key || null,
      qty,
      uom: displayUom(item.unit),
      packLabel: notFound ? "" : (best ? formatPackLabel(best.packQty, best.packBasis, best.baseUnit, best.packSize) : ""),
      lineTotal: notFound ? null : (best ? best.price * qty : price * qty),
      paidUnitPrice: hasPaidPrice ? paidUnitPrice : null,
      hasPaidPrice,
      currentLineTotal: hasPaidPrice ? paidUnitPrice * qty : null,
      lineSavings,
      others,
    };
  });
}

// Derive a reorder list's lifecycle status from its rows + whether a supplier
// handoff has been prepared for it. Draft → Review & optimize (buyer advanced
// the list — allowed at any point; unresolved items are simply excluded) →
// Handed off (a handoff snapshot exists). An empty list is always "draft". Used
// for the live list and archives.
function deriveListStatus(rows, hasHandoff, stage = "draft") {
  if (hasHandoff) return "handoff";
  if (!rows.length) return "draft";
  return stage === "review" ? "review" : "draft";
}

function mrComputeStats(rows) {
  const total = rows.length;
  const matched = rows.filter((r) => r.status === "Matched").length;
  const review = rows.filter((r) => r.status === "Review").length;
  const notFound = rows.filter((r) => r.status === "Not found").length;
  const conf = rows.filter((r) => r.confidence != null);
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return {
    total, matched, review, notFound,
    high: conf.filter((r) => r.confidence >= 80).length,
    med: conf.filter((r) => r.confidence >= 50 && r.confidence < 80).length,
    low: conf.filter((r) => r.confidence < 50).length,
    matchedPct: pct(matched), reviewPct: pct(review), notFoundPct: pct(notFound),
  };
}

function DesktopBarcodeScan({ onScan }) {
  const [captured, setCaptured] = useState(false);
  const flashTimer = useRef();
  const { videoRef, cameraStatus, autoDetect, capture } = useBarcodeScanner({
    active: true,
    onScan: (code) => {
      onScan?.(code);
      setCaptured(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  return (
    <div className="desktop-scan">
      <div className={`desktop-scan-stage ${captured ? "scan-captured" : ""}`}>
        <video ref={videoRef} className="desktop-scan-video" playsInline muted autoPlay aria-label="Live camera preview"></video>
        {cameraStatus !== "ready" && (
          <div className="desktop-scan-permission">
            <Icon name="icon-scan" className="desktop-scan-permission-icon" />
            <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
            <p>
              {cameraStatus === "requesting"
                ? "Allow camera access to scan item barcodes, or use another import method."
                : "Enable camera permissions for this site, or use Upload or CSV import instead."}
            </p>
          </div>
        )}
        <div className="desktop-scan-frame" aria-hidden="true">
          <span className="corner top-left"></span>
          <span className="corner top-right"></span>
          <span className="corner bottom-left"></span>
          <span className="corner bottom-right"></span>
          <span className="scan-line"></span>
        </div>
        <div className="desktop-scan-hint">
          <Icon name="icon-scan" className="button-icon" />
          {captured
            ? "Barcode captured"
            : autoDetect
              ? "Point at a barcode — we capture it automatically"
              : "Align barcode in the frame, then click Scan"}
        </div>
        <button
          className="desktop-scan-shutter"
          type="button"
          onClick={capture}
          disabled={cameraStatus !== "ready" || captured}
        >
          <Icon name="icon-scan" className="button-icon" />
          Scan barcode
        </button>
      </div>
      <aside className="desktop-scan-result">
        <div className="desktop-scan-result-head">
          <span className="desktop-scan-check"><Icon name="icon-check-circle" className="button-icon" /></span>
          <div><strong>Item recognized</strong><small>We found a match in your catalog.</small></div>
        </div>
        <div className="desktop-scan-product">
          <div className="desktop-scan-thumb"><Icon name="icon-image" className="button-icon" /></div>
          <div>
            <strong>Microbrush Regular Superfine Blue</strong>
            <span>100/Bag · MBRREG-BLU-100</span>
            <span className="desktop-scan-supplier"><img src="/schein-logo.png" alt="" />Henry Schein</span>
          </div>
        </div>
        <dl className="desktop-scan-meta">
          <div><dt>UOM</dt><dd>Bag</dd></div>
          <div><dt>Unit price</dt><dd>$12.45</dd></div>
          <div><dt>Per each</dt><dd>$0.1245 / ea</dd></div>
        </dl>
        <button className="primary-action" type="button"><Icon name="icon-plus" className="button-icon" />Add to reorder list</button>
        <button className="secondary-action" type="button"><Icon name="icon-search" className="button-icon" />View item details</button>
        <button className="text-action desktop-scan-nomatch" type="button">This isn&rsquo;t a match</button>
      </aside>
    </div>
  );
}


// Status pills. "Matched" is our auto match; "Needs review" flags a
// low-confidence match (informational — there's no user "verify" step).
const CRL_STATUS = {
  Matched: { cls: "confirmed", label: "Matched", icon: "icon-check-circle" },
  Review: { cls: "possible", label: "Needs review", icon: "icon-alert-triangle" },
  "Not found": { cls: "nomatch", label: "No match", icon: "icon-x-circle" },
};

// List-level lifecycle pill, keyed by deriveListStatus() output.
const LIST_STATUS = {
  draft: { label: "Draft", cls: "draft" },
  review: { label: "Review & optimize", cls: "review" },
  handoff: { label: "Handed off", cls: "handoff" },
};

function ListStatusPill({ status }) {
  const meta = LIST_STATUS[status] || LIST_STATUS.draft;
  return (
    <span className={`list-pill list-pill--${meta.cls}`}>
      <span className="list-pill-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// Sample rows (used before any real items are added) get a plausible source icon
// so the empty-state demo matches the populated design.
const CRL_SAMPLE_SOURCES = { 1: "pdf", 2: "csv", 3: "scan", 4: "pdf", 5: "csv", 6: "scan", 7: "pdf" };
const CRL_SOURCE_ICON = { pdf: "icon-file-text", csv: "icon-table", scan: "icon-scan" };

// The Home surface: the active reorder list. Add Items (upload / scan / search)
// feeds the Item List below; the right rail summarizes status and next steps.
// Reuses the match-review data layer; before any real items are added it falls
// back to the sample list so the page reads as designed.
// Product thumbnail: shows the catalog image when available, falls back to the
// neutral image icon if there's no URL or the image fails to load.
function ProductThumb({ image, alt }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <span className="crl-thumb">
        <img src={image} alt={alt || ""} loading="lazy" onError={() => setFailed(true)} />
      </span>
    );
  }
  return <span className="crl-thumb crl-thumb-empty"><Icon name="icon-image" className="button-icon" /></span>;
}

function candidateSub(supplier, sub) {
  return [supplier, sub].filter(Boolean).join(" · ");
}

// Supplier + SKU sub-line for offer candidates in the match drawer, prefixed
// with the supplier's small logo when we have one.
function CandidateSub({ supplier, sub }) {
  const logo = supplierLogoSrc(supplier);
  return (
    <small className="crl-cand-sub">
      {logo && <img className="crl-cand-supplier-logo" src={logo} alt="" />}
      {candidateSub(supplier, sub)}
    </small>
  );
}

// Candidate product name. When the offer carries a supplier product URL, the
// name links out to the supplier's store (new tab) so the buyer can inspect the
// real listing. stopPropagation keeps the click from toggling the radio.
function CandidateName({ name, productUrl }) {
  if (!productUrl) return <strong>{name}</strong>;
  return (
    <a
      className="crl-cand-name-link"
      href={productUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      title="View on supplier store"
    >
      {name}
      <Icon name="icon-link" className="button-icon" />
    </a>
  );
}

// Per-offer stock chip for the candidate list, so the buyer can see which
// suppliers are out of (or low on) stock when choosing the match.
function CandidateStock({ availability, liveAvailable }) {
  const badge = availabilityBadge(availability, liveAvailable);
  if (!badge) return null;
  return (
    <span
      className={`crl-cand-stock stock-${badge.tone}`}
      title={typeof liveAvailable === "boolean" ? "Live stock checked this session" : "Stock as of last catalog sync — verify before ordering"}
    >
      {badge.label}
    </span>
  );
}

// Build the selectable candidate list for an item's verify drawer from its real
// supplier offers. "recommended" flags our preference-based pick (a fixed badge
// that never moves); the radio/active state tracks what the buyer has selected.
// Falls back to a single candidate when an item carries no offer list.
// A canonical cluster can hold many near-identical offers from one supplier
// (e.g. every shade of a composite as its own SKU). The PDP already collapses
// these to one row per supplier; do the same for the match drawer so the buyer
// compares suppliers, not SKUs. Per supplier we keep the offer they've already
// selected, else our recommended pick, else the cheapest — and order the result
// so that representative lands first (the mobile drawer headlines index 0).
function collapseOffersBySupplier(candidates, selectedKey) {
  const cost = (c) => c.perEa ?? c.price ?? Infinity;
  const rank = (c) => (c.key && c.key === selectedKey ? 0 : c.recommended ? 1 : 2);
  const better = (c, cur) => rank(c) < rank(cur) || (rank(c) === rank(cur) && cost(c) < cost(cur));
  const bySupplier = new Map();
  for (const c of candidates) {
    const key = (c.supplier || "").toLowerCase().trim();
    const cur = bySupplier.get(key);
    if (!cur || better(c, cur)) bySupplier.set(key, c);
  }
  return [...bySupplier.values()].sort((a, b) =>
    rank(a) !== rank(b) ? rank(a) - rank(b) : cost(a) - cost(b));
}

function offerCandidates(row) {
  const fromOffers = (row.offers || []).map((offer) => ({
    key: offer.key,
    name: offer.name,
    supplier: offer.supplier,
    sub: offer.sub,
    price: offer.price,
    perEa: offer.perUnit ?? null,
    packQty: offer.packQty ?? null,
    packLabel: formatPackLabel(offer.packQty, offer.packBasis, offer.baseUnit, offer.packSize),
    image: offer.imageUrl || "",
    recommended: offer.key === row.recommendedOfferKey,
    availability: offer.availability,
    liveAvailable: offer.liveAvailable,
    productUrl: offer.productUrl || "",
  }));
  if (fromOffers.length) return fromOffers;
  if (row.matchName) {
    return [{ key: row.selectedOfferKey || null, name: row.matchName, supplier: row.supplier, sub: row.matchSub, price: row.price, perEa: row.perEa, image: row.image, recommended: true, availability: row.availability, liveAvailable: row.liveAvailable, productUrl: row.productUrl || "" }];
  }
  return [];
}

// Debounced catalog search for the verify drawer's resolve / re-link flow.
// Reuses the same /api/products/search endpoint the global search uses.
function useProductSearch(active) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const q = query.trim();
    if (!q) { setResults([]); setLoading(false); return undefined; }
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=8`, { signal: controller.signal })
        .then((response) => response.json())
        .then(({ canonical_products }) => { setResults(canonical_products || []); setLoading(false); })
        .catch((error) => { if (error.name !== "AbortError") { setResults([]); setLoading(false); } });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, active]);
  return { query, setQuery, results, loading };
}

// Catalog search results rendered as link buttons inside the verify drawer.
function ProductSearchResults({ query, results, loading, onPick, emptyHint }) {
  const q = query.trim();
  if (!q) return <p className="crl-drawer-empty">{emptyHint}</p>;
  if (loading && !results.length) return <p className="crl-drawer-empty">Searching…</p>;
  if (!results.length) return <p className="crl-drawer-empty">No products found for “{q}”.</p>;
  return (
    <div className="crl-cand-list">
      {results.map((product) => {
        const offer = product.best_offer;
        const price = offer?.price_cents != null ? offer.price_cents / 100 : null;
        return (
          <button type="button" key={product.id || product.handle || product.name} className="crl-cand crl-cand-result" onClick={() => onPick(product)}>
            <ProductThumb image={product.image_url} alt={product.name} />
            <span className="crl-cand-info">
              <strong>{product.name}</strong>
              <CandidateSub supplier={offer?.supplier_name} sub={offer?.sku} />
            </span>
            <span className="crl-cand-right">
              <strong>{price != null ? mrMoney(price) : "—"}</strong>
              {product.offer_count > 1 && <span className="crl-cand-rec">{product.offer_count} offers</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Right-docked detail panel for a reorder-list row. Adapts by mode:
//  - view: an already-matched item — review or change the match
//  - review: a low-confidence match — pick the best match
//  - resolve: no catalog match — search to link a product
// Picking a different offer, editing qty, adding a note, linking a
// product, or removing the item all persist back to the draft list via the
// callbacks (keyed by row.itemId). Sample rows (no itemId) stay demo-only.
function MatchPanel({ row, mode, wide, onToggleWide, onClose, onToast, onConfirmMatch, onLinkProduct, onRemoveItem, onNavigate }) {
  const isResolve = mode === "resolve";
  const isView = mode === "view";
  const candidates = isResolve ? [] : collapseOffersBySupplier(offerCandidates(row), row.selectedOfferKey);
  // Start on the buyer's current selection (falls back to our recommendation).
  const selectedIndex = candidates.findIndex((candidate) => candidate.key === row.selectedOfferKey);
  const recommendedIndex = candidates.findIndex((candidate) => candidate.recommended);
  const [selected, setSelected] = useState(selectedIndex >= 0 ? selectedIndex : Math.max(0, recommendedIndex));
  const [qty, setQty] = useState(row.qty || 1);
  const [notes, setNotes] = useState(row.note || "");
  // What the practice currently pays per pack — the savings anchor. Editable
  // here so scanned items (which carry no price) and price-less invoice lines
  // can still show savings. Persists immediately on blur.
  const [paid, setPaid] = useState(row.paidUnitPrice != null ? String(row.paidUnitPrice) : "");
  // Resolve opens straight into search; review/view can toggle in to re-link.
  const [searching, setSearching] = useState(isResolve);
  const search = useProductSearch(searching);
  const status = CRL_STATUS[row.status];
  const sourceLabel = row.source === "scan" ? "From Barcode Scan" : row.source === "csv" ? "From Reorder Sheet" : "From Invoice";
  const title = isResolve ? "Resolve item" : isView ? "Product match" : "Verify product match";
  const subtitle = isResolve
    ? "We couldn’t match this item. Find the right product to link."
    : isView
      ? "Confirm or change the product matched to this item."
      : "Please confirm the best match for this imported item.";

  // "Buy bigger, pay less per unit": among this product's own offers (same
  // canonical, different pack sizes), find a larger pack that beats the selected
  // offer on price-per-each by a meaningful margin. Surfaced as an opt-in nudge —
  // bigger packs tie up cash/shelf and can expire, so it's never auto-applied.
  const sel = candidates[selected];
  const biggerPackDeal = (() => {
    if (!sel || sel.perEa == null || sel.packQty == null) return null;
    let best = null;
    candidates.forEach((candidate, index) => {
      if (index === selected || !isOrderable(candidate)) return;
      if (candidate.perEa == null || candidate.packQty == null) return;
      if (candidate.packQty <= sel.packQty || candidate.perEa >= sel.perEa) return;
      if (!best || candidate.perEa < best.perEa) best = { ...candidate, index };
    });
    if (!best) return null;
    const pct = (sel.perEa - best.perEa) / sel.perEa;
    return pct >= 0.1 ? { ...best, pct } : null;
  })();

  // Live savings preview from the entered price vs. the selected offer.
  const selPrice = candidates[selected]?.price ?? row.price ?? null;
  const paidNum = paid === "" ? null : Number(paid);
  const drawerSavings = paidNum != null && Number.isFinite(paidNum) && paidNum > 0 && selPrice != null && paidNum > selPrice
    ? (paidNum - selPrice) * qty
    : 0;

  // Persist the entered price on blur, but only when it actually changed, so we
  // don't churn the draft list (or fire a toast) on every focus out.
  function savePaid() {
    if (!row.itemId) return;
    const current = row.paidUnitPrice != null ? String(row.paidUnitPrice) : "";
    if (paid === current) return;
    onConfirmMatch?.(row.itemId, { paidUnitPrice: paid });
  }

  function confirm() {
    if (row.itemId) {
      onConfirmMatch?.(row.itemId, { selectedOfferKey: candidates[selected]?.key ?? null, qty, note: notes, paidUnitPrice: paid });
      onToast("Match updated");
    } else {
      onToast("Match updated");
    }
    onClose();
  }

  function linkResult(product) {
    if (row.itemId) {
      onLinkProduct?.(row.itemId, product, { qty, note: notes });
      onToast("Product linked to item");
      onClose();
    } else {
      onToast("Product linked to item");
      onClose();
    }
  }

  function removeItem() {
    if (row.itemId) onRemoveItem?.(row.itemId);
    onToast("Item removed from list");
    onClose();
  }

  // Step the quantity and persist it live so the table row stays in sync without
  // waiting for the "Update Match" confirm.
  function setStepQty(next) {
    setQty(next);
    if (row.itemId) onConfirmMatch?.(row.itemId, { qty: next });
  }

  return (
    <aside className="crl-detail" role="region" aria-label={title}>
      <header className="crl-drawer-head">
        <div className="crl-drawer-title">
          <span className="crl-drawer-shield"><Icon name="icon-shield-check" className="button-icon" /></span>
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="crl-drawer-head-actions">
          <button type="button" aria-label={wide ? "Collapse panel" : "Expand panel"} onClick={onToggleWide}><span aria-hidden="true">⤢</span></button>
          <button type="button" aria-label="Close" onClick={onClose}><Icon name="icon-x" className="button-icon" /></button>
        </div>
      </header>

      <div className="crl-drawer-body">
        <section className="crl-drawer-section">
          <div className="crl-drawer-section-head">
            <span className="crl-drawer-label">Imported item</span>
            <span className="crl-drawer-badge">{sourceLabel}</span>
          </div>
          <div className="crl-imported">
            <ProductThumb image={row.image} alt={row.matchName || row.importedName} />
            <div className="crl-imported-info">
              {row.canonicalHandle ? (
                <button type="button" className="crl-imported-link" onClick={() => onNavigate?.(`/app/product/${row.canonicalHandle}`)} title="View this product in the catalog">
                  {row.matchName || row.importedName}
                  <Icon name="icon-arrow-right" className="button-icon" />
                </button>
              ) : (
                <strong>{row.matchName || row.importedName}</strong>
              )}
              <small>{row.importedName}</small>
              <div className="crl-qty-step">
                <span>Qty:</span>
                <button type="button" aria-label="Decrease quantity" onClick={() => setStepQty(Math.max(1, qty - 1))}>−</button>
                <em>{qty} {row.uom}</em>
                <button type="button" aria-label="Increase quantity" onClick={() => setStepQty(qty + 1)}>+</button>
              </div>
              <div className="crl-imported-status">Status: <span className={`crl-status ${status.cls}`}><Icon name={status.icon} className="button-icon" />{status.label}</span></div>
            </div>
          </div>
        </section>

        {searching ? (
          <section className="crl-drawer-section">
            <span className="crl-drawer-label">{isResolve ? "Find a match" : "Search for another product"}</span>
            <label className="crl-search crl-drawer-search">
              <Icon name="icon-search" className="button-icon" />
              <input type="search" placeholder="Search products, suppliers…" value={search.query} onChange={(event) => search.setQuery(event.target.value)} autoFocus />
            </label>
            <ProductSearchResults
              query={search.query}
              results={search.results}
              loading={search.loading}
              onPick={linkResult}
              emptyHint={isResolve ? "No catalog match found yet. Search above to link this item to a product." : "Search the catalog to link a different product to this item."}
            />
            {!isResolve && (
              <button className="crl-drawer-link" type="button" onClick={() => setSearching(false)}><Icon name="icon-chevron-left" className="button-icon" />Back to suggested matches</button>
            )}
          </section>
        ) : (
          <section className="crl-drawer-section">
            <strong className="crl-drawer-subhead">Choose the match</strong>
            <p className="crl-drawer-hint">We recommend one offer from your buying preferences — pick a different one any time.</p>
            {biggerPackDeal && (
              <button type="button" className="crl-packdeal" onClick={() => setSelected(biggerPackDeal.index)}>
                <Icon name="icon-tag" className="button-icon" />
                <span className="crl-packdeal-text">
                  <strong>Buy bigger, save {Math.round(biggerPackDeal.pct * 100)}% per unit</strong>
                  <small>{biggerPackDeal.packLabel || "Larger pack"} at ${mrEa(biggerPackDeal.perEa)}/ea vs ${mrEa(sel.perEa)}/ea — if you use the volume.</small>
                </span>
                <span className="crl-packdeal-switch">Switch</span>
              </button>
            )}
            <div className="crl-cand-list">
              {candidates.map((candidate, index) => {
                const oos = !isOrderable(candidate);
                return (
                <label key={candidate.key ?? index} className={`crl-cand ${selected === index ? "active" : ""} ${oos ? "oos" : ""}`} aria-disabled={oos}>
                  <input type="radio" name="crl-cand" checked={selected === index} disabled={oos} onChange={() => setSelected(index)} />
                  <ProductThumb image={candidate.image} alt={candidate.name} />
                  <span className="crl-cand-info">
                    <CandidateName name={candidate.name} productUrl={candidate.productUrl} />
                    <CandidateSub supplier={candidate.supplier} sub={candidate.sub} />
                    <CandidateStock availability={candidate.availability} liveAvailable={candidate.liveAvailable} />
                  </span>
                  <span className="crl-cand-right">
                    <strong>{candidate.price != null ? mrMoney(candidate.price) : "—"}</strong>
                    {showPerEa(candidate.perEa, candidate.price) && <span className="crl-cand-per">${mrEa(candidate.perEa)} / ea</span>}
                    <span className="crl-cand-tags">
                      {candidate.recommended && <span className="crl-cand-rec">Recommended</span>}
                      {selected === index && !candidate.recommended && <span className="crl-cand-sel">Selected</span>}
                    </span>
                  </span>
                </label>
                );
              })}
            </div>
            <button className="crl-drawer-link" type="button" onClick={() => { setSearching(true); search.setQuery(""); }}><Icon name="icon-search" className="button-icon" />Search for another product</button>
          </section>
        )}

        {!isResolve && selPrice != null && (
          <section className="crl-drawer-section">
            <span className="crl-drawer-label">What you pay now</span>
            <p className="crl-drawer-hint">Enter your current price per {row.uom} to see your savings — scanned items don&rsquo;t carry a price.</p>
            <div className="crl-paid-row">
              <label className="crl-paid-field">
                <span>$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={paid}
                  onChange={(event) => setPaid(event.target.value)}
                  onBlur={savePaid}
                />
                <em>/ {row.uom}</em>
              </label>
              {drawerSavings > 0 && (
                <span className="crl-paid-savings">You save <strong>{mrMoney(drawerSavings)}</strong></span>
              )}
            </div>
          </section>
        )}

        <section className="crl-drawer-section">
          <span className="crl-drawer-label">Notes (optional)</span>
          <textarea className="crl-drawer-notes" maxLength={500} placeholder="Add a note about this item…" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <div className="crl-drawer-notes-count">{notes.length} / 500</div>
        </section>

        {row.itemId && (
          <section className="crl-drawer-section">
            <button className="crl-drawer-remove" type="button" onClick={removeItem}><Icon name="icon-trash" className="button-icon" />Remove item from list</button>
          </section>
        )}
      </div>

      <footer className="crl-drawer-foot">
        <button className="crl-ghost-btn" type="button" onClick={onClose}>{isView ? "Close" : "Cancel"}</button>
        {!searching && (
          <button className="primary-action compact" type="button" onClick={confirm}>{isView ? "Update Match" : "Confirm Selected Match"}</button>
        )}
      </footer>
    </aside>
  );
}

function rowMode(row) {
  return row.status === "Not found" ? "resolve" : row.status === "Review" ? "review" : "view";
}

// One reorder-list card with swipe-left-to-reveal Remove. Drag tracks the
// finger; past the threshold it snaps open, otherwise it springs back closed.
const SWIPE_REVEAL = 88;
function MobileReorderCard({ row, onOpen, onRemove }) {
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
    // Ignore mostly-vertical gestures so the list can still scroll.
    if (!moved.current && Math.abs(deltaX) < Math.abs(deltaY)) { dragging.current = false; return; }
    if (Math.abs(deltaX) > 6) moved.current = true;
    const base = open ? -SWIPE_REVEAL : 0;
    const next = Math.min(0, Math.max(-SWIPE_REVEAL, base + deltaX));
    setDx(next);
  }
  function onTouchEnd() {
    if (!dragging.current && !moved.current) return;
    dragging.current = false;
    const shouldOpen = dx <= -SWIPE_REVEAL / 2;
    setOpen(shouldOpen);
    setDx(shouldOpen ? -SWIPE_REVEAL : 0);
  }
  function handleClick() {
    if (moved.current) return; // swipe, not a tap
    if (open) { setOpen(false); setDx(0); return; }
    onOpen();
  }

  const notFound = row.status === "Not found";
  return (
    <div className={`m-swipe ${open ? "open" : ""}`}>
      <button
        type="button"
        className="m-swipe-remove"
        aria-label={`Remove ${row.matchName || row.importedName} from list`}
        tabIndex={open ? 0 : -1}
        onClick={() => { setOpen(false); setDx(0); onRemove(); }}
      >
        <Icon name="icon-trash-ios" className="m-swipe-remove-icon" />
        <span>Remove</span>
      </button>
      <button
        className="m-card"
        type="button"
        onClick={handleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? "none" : "transform .2s ease" }}
      >
        <ProductThumb image={row.image} alt={row.matchName || row.importedName} />
        <span className="m-card-body">
          <strong>{row.matchName || row.importedName}</strong>
          <small>{row.importedSub}</small>
          {row.supplier && row.supplier !== "—" && (
            <small className="m-card-supplier">
              {supplierLogoSrc(row.supplier) && <img className="m-card-supplier-logo" src={supplierLogoSrc(row.supplier)} alt="" />}
              {row.supplier}
            </small>
          )}
        </span>
        <span className="m-card-right">
          {notFound
            ? <em className="m-conf nomatch">Not found</em>
            : <em className={`m-conf ${mrConfTone(row.confidence)}`}>{row.confidence}%</em>}
          {row.price != null && <strong>{mrMoney(row.price)}</strong>}
          {showPerEa(row.perEa, row.price) && <small>${mrEa(row.perEa)} / ea</small>}
          {row.lineSavings > 0 && <small className="m-card-save">Save {mrMoney(row.lineSavings)}</small>}
        </span>
        <Icon name="icon-chevron-right" className="button-icon m-card-chev" />
      </button>
    </div>
  );
}

// Mobile card list for the current reorder list (replaces the desktop table on
// phones). Stats band + status tabs + tappable product cards.
function MobileReorderList({ title, rows, stats, totalItems, tab, onTab, onOpenRow, onToast, onArchiveList, onClearList, onRemoveItem, searchTerm = "", onSearchTerm, searchResults = [], searchLoading, onNavigate, buyerName = "", practiceName = "", buyerInitials = "", email = "", onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <div className="m-list">
      <div className="m-brandbar">
        <BrandMark />
        <div className="m-brand-actions">
          <button className="m-iconbtn" type="button" aria-label="Alerts">
            <Icon name="icon-bell" className="button-icon" />
            <span className="m-brand-badge">3</span>
          </button>
          {onLogout && (
            <div className="m-brand-account">
              <button
                className={`m-brand-avatar-btn ${accountOpen ? "active" : ""}`}
                type="button"
                aria-label="Account"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((open) => !open)}
              >
                {buyerInitials || "··"}
              </button>
              {accountOpen && (
                <>
                  <div className="m-brand-menu-backdrop" onClick={() => setAccountOpen(false)} />
                  <div className="m-brand-menu" role="menu">
                    <div className="m-brand-menu-head">
                      <strong>{buyerName || "Your account"}</strong>
                      <small>{email || practiceName || "Buyer"}</small>
                    </div>
                    <button role="menuitem" type="button" onClick={() => { setAccountOpen(false); onNavigate?.(pathForView("settings")); }}>
                      <Icon name="icon-settings" className="button-icon" />
                      Settings
                    </button>
                    <button role="menuitem" type="button" onClick={() => { setAccountOpen(false); onLogout?.(); }}>
                      <Icon name="icon-logout" className="button-icon" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="m-search-wrap">
        <label className="m-search">
          <Icon name="icon-search" className="button-icon" />
          <input
            type="search"
            placeholder="Search products, suppliers…"
            aria-label="Search"
            value={searchTerm}
            onChange={(event) => onSearchTerm?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") { onSearchTerm?.(""); event.currentTarget.blur(); }
              else if (event.key === "Enter" && searchTerm.trim()) {
                event.preventDefault();
                event.currentTarget.blur();
                onNavigate?.(`/app/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`);
              }
            }}
          />
        </label>
        {searchTerm.trim() && (
          <>
            <div className="topbar-search-backdrop" onClick={() => onSearchTerm?.("")} />
            <SearchResults
              results={searchResults}
              loading={searchLoading}
              query={searchTerm.trim()}
              onNavigate={onNavigate}
            />
          </>
        )}
      </div>

      <header className="m-topbar">
        <h1>{title}</h1>
        <div className="m-topbar-actions">
          <div className="m-menu-wrap">
            <button className="m-iconbtn" type="button" aria-label="List actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              <svg className="crl-kebab-dots" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
            </button>
            {menuOpen && (
              <>
                <div className="crl-add-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="crl-add-menu m-actions-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onArchiveList?.(); }}>
                    <Icon name="icon-clipboard" className="button-icon" />
                    <span><strong>Archive list</strong><small>Move to list history</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onClearList?.(); }}>
                    <Icon name="icon-trash" className="button-icon crl-menu-danger" />
                    <span><strong>Clear list</strong><small>Remove all items</small></span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <nav className="m-tabs" aria-label="Item list filters">
        {[["all", `All ${totalItems}`], ["confirmed", `Matched ${stats.matched}`], ["possible", `Needs Review ${stats.review}`], ["nomatch", `No match ${stats.notFound}`]].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => onTab(id)}>{label}</button>
        ))}
      </nav>

      <div className="m-cards">
        {rows.length === 0 ? (
          <div className="m-empty">
            <Icon name="icon-clipboard" className="m-empty-icon" />
            {totalItems === 0 ? (
              <>
                <strong>Your reorder list is empty</strong>
                <p>Tap the scan button below to scan a barcode, or upload an invoice to start building your list.</p>
              </>
            ) : (
              <>
                <strong>Nothing in this view</strong>
                <p>No items match this filter. Switch to “All {totalItems}” to see your whole list.</p>
              </>
            )}
          </div>
        ) : rows.map((row) => (
          <MobileReorderCard
            key={row.id}
            row={row}
            onOpen={() => onOpenRow(row)}
            onRemove={() => {
              if (row.itemId) onRemoveItem?.(row.itemId);
              onToast("Item removed from list");
            }}
          />
        ))}
      </div>

      {stats.matched + stats.review > 0 && (
        <div className="m-plan-cta">
          <button type="button" className="primary-action" onClick={() => onNavigate?.("/app/review")}>
            <Icon name="icon-clipboard-check" className="button-icon" />Review &amp; optimize
          </button>
        </div>
      )}
    </div>
  );
}

// Full-screen mobile detail page. Layout follows the mobile mockup; the footer
// actions mirror the desktop MatchPanel (Cancel / Confirm by mode).
function MobileItemDetail({ rows, row, mode, onClose, onOpenRow, onToast, onConfirmMatch, onLinkProduct, onRemoveItem, onNavigate }) {
  const idx = rows.findIndex((r) => r.id === row.id);
  const total = rows.length;
  const isResolve = mode === "resolve";
  const isView = mode === "view";
  // Candidates come from the item's real offers; our recommended (preference-
  // based) pick is floated to the front so it shows in the "Recommended" slot.
  // The radio tracks the buyer's actual selection, which may differ.
  const candidates = isResolve ? [] : collapseOffersBySupplier((row.offers || []).map((offer) => ({
    key: offer.key,
    name: offer.name,
    supplier: offer.supplier,
    sub: offer.sub,
    price: offer.price,
    perEa: offer.perUnit ?? null,
    image: offer.imageUrl || "",
    recommended: offer.key === row.recommendedOfferKey,
    confidence: offer.key === row.recommendedOfferKey ? row.confidence : Math.max((row.confidence ?? 50) - 10, 40),
    availability: offer.availability,
    liveAvailable: offer.liveAvailable,
    productUrl: offer.productUrl || "",
  })), row.selectedOfferKey);
  if (!isResolve && !candidates.length && row.matchName) {
    candidates.push({ key: row.selectedOfferKey || null, name: row.matchName, supplier: row.supplier, sub: row.matchSub, price: row.price, perEa: row.perEa, image: row.image, recommended: true, confidence: row.confidence, availability: row.availability, liveAvailable: row.liveAvailable, productUrl: row.productUrl || "" });
  }
  const recIdx = candidates.findIndex((candidate) => candidate.recommended);
  if (recIdx > 0) candidates.unshift(...candidates.splice(recIdx, 1));
  const initialSel = candidates.findIndex((candidate) => candidate.key === row.selectedOfferKey);
  const [selected, setSelected] = useState(initialSel < 0 ? 0 : initialSel);
  const [notes, setNotes] = useState(row.note || "");
  const [paid, setPaid] = useState(row.paidUnitPrice != null ? String(row.paidUnitPrice) : "");
  const [searching, setSearching] = useState(isResolve);
  const search = useProductSearch(searching);
  const confLabel = row.confidence == null ? "No catalog match"
    : row.confidence >= 80 ? "High match confidence"
    : row.confidence >= 50 ? "Medium match confidence"
    : "Low match confidence";

  // Live savings from the entered price vs. the selected offer.
  const selPrice = candidates[selected]?.price ?? row.price ?? null;
  const paidNum = paid === "" ? null : Number(paid);
  const drawerSavings = paidNum != null && Number.isFinite(paidNum) && paidNum > 0 && selPrice != null && paidNum > selPrice
    ? (paidNum - selPrice) * (row.qty || 1)
    : 0;

  function savePaid() {
    if (!row.itemId) return;
    const current = row.paidUnitPrice != null ? String(row.paidUnitPrice) : "";
    if (paid === current) return;
    onConfirmMatch?.(row.itemId, { paidUnitPrice: paid });
  }

  function confirm() {
    if (row.itemId) {
      onConfirmMatch?.(row.itemId, { selectedOfferKey: candidates[selected]?.key ?? null, qty: row.qty, note: notes, paidUnitPrice: paid });
    }
    onToast("Match updated");
    onClose();
  }

  function linkResult(product) {
    if (row.itemId) onLinkProduct?.(row.itemId, product, { note: notes });
    onToast("Product linked to item");
    onClose();
  }

  function removeItem() {
    if (row.itemId) onRemoveItem?.(row.itemId);
    onToast("Item removed from list");
    onClose();
  }

  return (
    <div className="m-detail">
      <header className="m-detail-top">
        <button className="m-iconbtn" type="button" aria-label="Back to list" onClick={onClose}><Icon name="icon-chevron-left" className="button-icon" /></button>
        <div className="m-pager">
          <button type="button" aria-label="Previous item" disabled={idx <= 0} onClick={() => idx > 0 && onOpenRow(rows[idx - 1])}><Icon name="icon-chevron-left" className="button-icon" /></button>
          <span>{idx + 1} of {total}</span>
          <button type="button" aria-label="Next item" disabled={idx >= total - 1} onClick={() => idx < total - 1 && onOpenRow(rows[idx + 1])}><Icon name="icon-chevron-right" className="button-icon" /></button>
        </div>
        <button className="m-iconbtn" type="button" aria-label="More"><span aria-hidden="true">⋯</span></button>
      </header>

      <div className="m-detail-body">
        <div className={`m-conf-banner ${row.confidence == null ? "nomatch" : mrConfTone(row.confidence)}`}>
          <span>{confLabel}</span>
          {row.confidence != null && <strong>{row.confidence}%</strong>}
        </div>

        <section className="m-detail-sec">
          <span className="m-detail-label">Imported item</span>
          <strong className="m-detail-name">{row.importedName}</strong>
          <small>{row.importedSub}</small>
          {row.supplier && row.supplier !== "—" && <small>Imported by {row.supplier}</small>}
          {row.canonicalHandle && (
            <button type="button" className="crl-drawer-link m-detail-catalog" onClick={() => onNavigate?.(`/app/product/${row.canonicalHandle}`)}>
              View in product catalog <Icon name="icon-arrow-right" className="button-icon" />
            </button>
          )}
        </section>

        {searching ? (
          <section className="m-detail-sec">
            <span className="m-detail-label">{isResolve ? "Find a match" : "Search for another product"}</span>
            <label className="crl-search"><Icon name="icon-search" className="button-icon" /><input type="search" placeholder="Search products, suppliers…" value={search.query} onChange={(event) => search.setQuery(event.target.value)} autoFocus /></label>
            <ProductSearchResults
              query={search.query}
              results={search.results}
              loading={search.loading}
              onPick={linkResult}
              emptyHint={isResolve ? "No catalog match found yet. Search above to link this item to a product." : "Search the catalog to link a different product to this item."}
            />
            {!isResolve && (
              <button className="crl-drawer-link" type="button" onClick={() => setSearching(false)}><Icon name="icon-chevron-left" className="button-icon" />Back to suggested matches</button>
            )}
          </section>
        ) : candidates.length ? (
          <>
            <section className="m-detail-sec">
              <span className="m-detail-label">Recommended</span>
              <label className={`m-match best ${selected === 0 ? "active" : ""} ${!isOrderable(candidates[0]) ? "oos" : ""}`} aria-disabled={!isOrderable(candidates[0])}>
                <input type="radio" name="m-cand" checked={selected === 0} disabled={!isOrderable(candidates[0])} onChange={() => setSelected(0)} />
                <ProductThumb image={candidates[0].image} alt={candidates[0].name} />
                <span className="m-match-info"><CandidateName name={candidates[0].name} productUrl={candidates[0].productUrl} /><CandidateSub supplier={candidates[0].supplier} sub={candidates[0].sub} /><CandidateStock availability={candidates[0].availability} liveAvailable={candidates[0].liveAvailable} /></span>
                <span className="m-match-right"><em className={`m-conf ${mrConfTone(candidates[0].confidence)}`}>{candidates[0].confidence}%</em><strong>{mrMoney(candidates[0].price)}</strong>{showPerEa(candidates[0].perEa, candidates[0].price) && <small>${mrEa(candidates[0].perEa)} / ea</small>}</span>
              </label>
            </section>
            {candidates.length > 1 && (
              <section className="m-detail-sec">
                <span className="m-detail-label">Other possible matches</span>
                {candidates.slice(1).map((candidate, index) => {
                  const oos = !isOrderable(candidate);
                  return (
                  <label className={`m-match ${selected === index + 1 ? "active" : ""} ${oos ? "oos" : ""}`} aria-disabled={oos} key={candidate.key ?? index + 1}>
                    <input type="radio" name="m-cand" checked={selected === index + 1} disabled={oos} onChange={() => setSelected(index + 1)} />
                    <span className="m-match-info"><CandidateName name={candidate.name} productUrl={candidate.productUrl} /><CandidateSub supplier={candidate.supplier} sub={candidate.sub} /><CandidateStock availability={candidate.availability} liveAvailable={candidate.liveAvailable} /></span>
                    <span className="m-match-right"><em className={`m-conf ${mrConfTone(candidate.confidence)}`}>{candidate.confidence}%</em><strong>{mrMoney(candidate.price)}</strong>{showPerEa(candidate.perEa, candidate.price) && <small>${mrEa(candidate.perEa)} / ea</small>}</span>
                  </label>
                  );
                })}
              </section>
            )}
            <button className="crl-drawer-link m-detail-relink" type="button" onClick={() => { setSearching(true); search.setQuery(""); }}><Icon name="icon-search" className="button-icon" />Search for another product</button>
          </>
        ) : null}

        <section className="m-detail-sec">
          <span className="m-detail-label">Item details</span>
          <div className="m-itemdetails">
            <div><small>Quantity</small><strong>{row.qty}</strong></div>
            <div><small>UOM</small><strong>{row.uom}</strong></div>
            <div><small>Line total</small><strong>{row.lineTotal != null ? mrMoney(row.lineTotal) : "—"}</strong></div>
          </div>
          {!isResolve && selPrice != null && (
            <>
              <span className="m-detail-label">What you pay now</span>
              <div className="crl-paid-row">
                <label className="crl-paid-field">
                  <span>$</span>
                  <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={paid} onChange={(event) => setPaid(event.target.value)} onBlur={savePaid} />
                  <em>/ {row.uom}</em>
                </label>
                {drawerSavings > 0 && <span className="crl-paid-savings">You save <strong>{mrMoney(drawerSavings)}</strong></span>}
              </div>
            </>
          )}
          <textarea className="m-notes" placeholder="Add a note…" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
          {row.itemId && (
            <button className="crl-drawer-remove m-detail-remove" type="button" onClick={removeItem}><Icon name="icon-trash" className="button-icon" />Remove item from list</button>
          )}
        </section>
      </div>

      <footer className="m-detail-foot">
        <button className="crl-ghost-btn" type="button" onClick={onClose}>{isView ? "Close" : "Cancel"}</button>
        {!searching && (
          <button className="primary-action compact" type="button" onClick={confirm}>{isView ? "Update Match" : "Confirm Selected Match"}</button>
        )}
      </footer>
    </div>
  );
}

const STRATEGY_LABELS = {
  "best-price": "Best price",
  "brand-match": "Exact brand match",
  balanced: "Balanced",
};
const SUBSTITUTION_LABELS = {
  allowed: "Allowed",
  approval: "Allowed with approval",
  none: "Not allowed",
};

function formatNeedBy(value) {
  if (!value) return "Any";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Any"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Buying preferences drive which supplier offer wins per item (see
// pickBestOffer). Preferred-supplier options are the suppliers actually present
// in the current list, so toggling them visibly re-ranks the table.
function BuyingPreferencesCard({ prefs, supplierOptions, onSave, onToast, title = "Buying Preferences", savedMessage = "Buying preferences saved" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prefs);

  function startEditing() {
    setDraft(prefs);
    setEditing(true);
  }
  function save(event) {
    event.preventDefault();
    onSave(draft);
    setEditing(false);
    onToast(savedMessage);
  }
  function toggleSupplier(name) {
    setDraft((current) => {
      const has = current.preferredSuppliers.includes(name);
      return {
        ...current,
        preferredSuppliers: has
          ? current.preferredSuppliers.filter((value) => value !== name)
          : [...current.preferredSuppliers, name],
      };
    });
  }

  return (
    <section className="crl-card">
      <div className="crl-card-head">
        <h3>{title}</h3>
        {!editing && <button className="crl-edit-link" type="button" onClick={startEditing}>Edit</button>}
      </div>
      {editing ? (
        <form className="crl-pref-form" onSubmit={save}>
          <label>
            <span>Need by date</span>
            <input type="date" value={draft.needByDate} onChange={(event) => setDraft((d) => ({ ...d, needByDate: event.target.value }))} />
          </label>
          <label>
            <span>Buying strategy</span>
            <select value={draft.strategy} onChange={(event) => setDraft((d) => ({ ...d, strategy: event.target.value }))}>
              <option value="best-price">Best price</option>
              <option value="brand-match">Exact brand match</option>
              <option value="balanced">Balanced</option>
            </select>
          </label>
          <label>
            <span>Preferred suppliers</span>
            {supplierOptions.length ? (
              <div className="crl-pref-checks">
                {supplierOptions.map((name) => (
                  <label key={name}>
                    <input type="checkbox" checked={draft.preferredSuppliers.includes(name)} onChange={() => toggleSupplier(name)} /> {name}
                  </label>
                ))}
              </div>
            ) : (
              <small className="crl-pref-hint">Add items to choose preferred suppliers.</small>
            )}
          </label>
          <label>
            <span>Substitutions</span>
            <select value={draft.substitutions} onChange={(event) => setDraft((d) => ({ ...d, substitutions: event.target.value }))}>
              <option value="allowed">Allowed</option>
              <option value="approval">Allowed with approval</option>
              <option value="none">Not allowed</option>
            </select>
          </label>
          <div className="crl-pref-actions">
            <button className="crl-ghost-btn" type="button" onClick={() => setEditing(false)}>Cancel</button>
            <button className="primary-action compact" type="submit">Save</button>
          </div>
        </form>
      ) : (
        <div className="crl-pref">
          <div><Icon name="icon-calendar" className="button-icon" /><span>Need by date</span><strong>{formatNeedBy(prefs.needByDate)}</strong></div>
          <div><Icon name="icon-check-circle" className="button-icon" /><span>Buying strategy</span><strong>{STRATEGY_LABELS[prefs.strategy] || "Best price"}</strong></div>
          <div><Icon name="icon-users" className="button-icon" /><span>Preferred suppliers</span><strong>{prefs.preferredSuppliers.length ? `${prefs.preferredSuppliers.length} selected` : "All suppliers"}</strong></div>
          <div><Icon name="icon-shuffle" className="button-icon" /><span>Substitutions</span><strong>{SUBSTITUTION_LABELS[prefs.substitutions] || "Allowed"}</strong></div>
        </div>
      )}
    </section>
  );
}

function CurrentReorderList({
  items,
  listName = "June Restock",
  listStatus = "draft",
  listStage = "draft",
  onAdvanceStage,
  onRenameList,
  buyerName = "",
  practiceName = "",
  buyerInitials = "",
  email = "",
  onLogout,
  addMode,
  onAddMode,
  lastUpload,
  onCloseUpload,
  onUploadAnother,
  uploadFormRef,
  onUpload,
  uploading,
  uploadProgress,
  uploadElapsed,
  uploadError,
  onCancelUpload,
  onClearUploadError,
  isDraggingInvoice,
  onDragStateChange,
  onInvoiceDrop,
  onInvoiceFile,
  selectedInvoiceName,
  hasUploadedInvoice,
  onScan,
  searchTerm,
  onSearchTerm,
  searchResults,
  searchLoading,
  onNavigate,
  onToast,
  listTouched,
  allowSample = false,
  buyingPrefs,
  supplierShipping = {},
  onBuyingPrefs,
  onApplyOptimized,
  onArchiveList,
  onClearList,
  onConfirmMatch,
  onLinkProduct,
  onRemoveItem,
  onRefresh,
}) {
  const realRows = deriveMatchRows(items, buyingPrefs);
  const usingReal = realRows.length > 0;
  // The demo sample list is only for the public, unauthenticated preview
  // (allowSample). A signed-in buyer — new or returning — with no real items
  // sees a truly empty list, never the sample.
  const showSample = allowSample && !usingReal && !listTouched;
  const isEmpty = !usingReal && !showSample;
  const rows = (usingReal ? realRows : showSample ? matchReviewSample : []).map((row) => ({
    ...row,
    source: row.source || CRL_SAMPLE_SOURCES[row.id] || "pdf",
  }));
  const stats = usingReal ? mrComputeStats(rows) : showSample ? matchReviewSampleStats : mrComputeStats(rows);
  const totalItems = usingReal ? rows.length : showSample ? stats.total : 0;
  // Items that won't make it into the supplier plan (no match, or out of stock
  // everywhere) — surfaced in the warning modal before advancing to Review.
  const unresolvedRows = usingReal ? rows.filter((row) => !isPlanIncluded(row)) : [];
  const allReviewed = usingReal && totalItems > 0 && unresolvedRows.length === 0 && !rows.some(
    (r) => r.status === "Review"
  );
  const [tab, setTab] = useState("all");
  const [detail, setDetail] = useState(null);
  const [detailWide, setDetailWide] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewConfirm, setReviewConfirm] = useState(false);
  const listNameRef = useRef(null);

  // Advance to Review & optimize. If anything is unresolved, confirm first so the
  // buyer knows those items won't be included; otherwise go straight in.
  function goToReview() {
    // Already advanced — just continue into the plan (no need to re-warn).
    if (listStage !== "review" && unresolvedRows.length > 0) { setReviewConfirm(true); return; }
    onAdvanceStage?.("review");
    onNavigate?.("/app/review");
  }

  function confirmReview() {
    setReviewConfirm(false);
    onAdvanceStage?.("review");
    onNavigate?.("/app/review");
  }

  async function handleRefresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Suppliers that actually appear in this list's offers — the real choices for
  // the preferred-supplier filter (toggling them re-ranks the best offer).
  const supplierOptions = useMemo(() => {
    const names = new Set();
    for (const item of items || []) {
      for (const offer of item.offers || []) {
        if (offer.supplier) names.add(offer.supplier);
      }
    }
    return [...names].sort();
  }, [items]);

  const planSummary = useMemo(() => {
    const totals = computePlanTotals(rows, supplierShipping);
    const coverage = rows.length ? Math.round((stats.matched / rows.length) * 100) : 0;
    const savings = rows.reduce((sum, row) => sum + (row.lineSavings || 0), 0);
    const currentSpend = rows.reduce((sum, row) => sum + (row.currentLineTotal || 0), 0);
    // Matched lines we could price-compare but don't have the buyer's price for
    // yet — drives the "add your prices" nudge so scanned items count too.
    const missingPrice = rows.filter((row) => row.status !== "Not found" && !row.hasPaidPrice).length;
    return { ...totals, coverage, savings, currentSpend, missingPrice };
  }, [rows, stats, supplierShipping]);

  // Lowest-landed-cost re-assignment, surfaced as an opt-in suggestion. Only run
  // it when shipping is fully known for the plan (so an unknown policy can't look
  // free) and the buyer isn't in brand-match mode (which prioritizes brand over
  // cost). Non-destructive: it sets per-line selections only when Applied.
  const optimizedPlan = useMemo(() => {
    if (!planSummary.shippingComplete || buyingPrefs?.strategy === "brand-match") return null;
    return optimizeLandedAssignment(rows, supplierShipping, buyingPrefs);
  }, [rows, supplierShipping, buyingPrefs, planSummary.shippingComplete]);

  // The per-line supplier moves the optimization would make, for the preview
  // diff. Only lines whose offer actually changes are shown.
  const consolidationMoves = useMemo(() => {
    if (!optimizedPlan) return [];
    const byId = optimizedPlan.assignmentByItemId;
    const moves = [];
    for (const row of rows) {
      const newKey = byId[row.itemId];
      if (!newKey || newKey === row.selectedOfferKey) continue;
      const from = (row.offers || []).find((offer) => offer.key === row.selectedOfferKey);
      const to = (row.offers || []).find((offer) => offer.key === newKey);
      if (!from || !to) continue;
      moves.push({
        itemId: row.itemId,
        name: row.matchName || row.canonicalName || row.importedName,
        qty: row.qty,
        uom: row.uom,
        fromSupplier: from.supplier,
        fromLine: (from.price || 0) * (row.qty || 1),
        toSupplier: to.supplier,
        toLine: (to.price || 0) * (row.qty || 1),
      });
    }
    return moves;
  }, [optimizedPlan, rows]);

  // Consolidation / shipping-savings analysis is offered once the buyer has
  // advanced the list into "Review & optimize" — a deliberate, fully-reviewed
  // checkpoint, so we don't optimize a moving target. Apply happens from the
  // preview.
  const listSettled = listStatus === "review";
  const [showConsolidate, setShowConsolidate] = useState(false);

  const tabFilter = {
    all: () => true,
    possible: (row) => row.status === "Review",
    confirmed: (row) => row.status === "Matched",
    nomatch: (row) => row.status === "Not found",
  };
  const filtered = rows.filter(tabFilter[tab] || tabFilter.all);
  const openRow = (row) => setDetail({ row, mode: rowMode(row) });


  if (isMobile) {
    return (
      <>
        <MobileReorderList
          title="Current Reorder List"
          rows={filtered}
          stats={stats}
          totalItems={totalItems}
          tab={tab}
          onTab={setTab}
          onOpenRow={openRow}
          onToast={onToast}
          onArchiveList={onArchiveList}
          onClearList={onClearList}
          onRemoveItem={onRemoveItem}
          searchTerm={searchTerm}
          onSearchTerm={onSearchTerm}
          searchResults={searchResults}
          searchLoading={searchLoading}
          onNavigate={onNavigate}
          buyerName={buyerName}
          practiceName={practiceName}
          buyerInitials={buyerInitials}
          email={email}
          onLogout={onLogout}
        />
        {detail && (
          <MobileItemDetail
            key={detail.row.id}
            rows={rows}
            row={detail.row}
            mode={detail.mode}
            onClose={() => setDetail(null)}
            onOpenRow={openRow}
            onToast={onToast}
            onConfirmMatch={onConfirmMatch}
            onLinkProduct={onLinkProduct}
            onRemoveItem={onRemoveItem}
            onNavigate={onNavigate}
          />
        )}
        {addMode === "upload" && (
          <UploadModal
            uploadFormRef={uploadFormRef}
            onUpload={onUpload}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadElapsed={uploadElapsed}
            uploadError={uploadError}
            onCancelUpload={onCancelUpload}
            onClearUploadError={onClearUploadError}
            isDraggingInvoice={isDraggingInvoice}
            onDragStateChange={onDragStateChange}
            onInvoiceDrop={onInvoiceDrop}
            onInvoiceFile={onInvoiceFile}
            selectedInvoiceName={selectedInvoiceName}
            hasUploadedInvoice={hasUploadedInvoice}
            lastUpload={lastUpload}
            buyerName={buyerName}
            practiceName={practiceName}
            onClose={onCloseUpload}
            onUploadAnother={onUploadAnother}
          />
        )}
      </>
    );
  }

  return (
    <div className={`crl ${detail ? "detail-open" : ""}`}>
      <header className="crl-header">
        <div className="crl-title crl-title-main">
          <h2 id="homeHeading">Current Reorder List</h2>
          <p className="crl-subtitle">
            <span className="crl-listname-edit">
              <input
                ref={listNameRef}
                className="crl-listname crl-listname-input"
                value={listName}
                onChange={(event) => onRenameList?.(event.target.value)}
                aria-label="Reorder list name"
                style={{ width: `${Math.max(listName.length, 8)}ch` }}
              />
              <button
                type="button"
                className="crl-listname-pencil"
                aria-label="Rename list"
                title="Rename list"
                onClick={() => { const el = listNameRef.current; if (el) { el.focus(); el.select(); } }}
              >
                <Icon name="icon-edit" className="button-icon" />
              </button>
            </span>
            <span className="crl-dot" aria-hidden="true">·</span>
            <ListStatusPill status={listStatus} />
          </p>
        </div>
        <div className="crl-header-actions">
          <button
            type="button"
            className={`crl-add-scan ${addMode === "scan" ? "active" : ""}`}
            onClick={() => onAddMode(addMode === "scan" ? "" : "scan")}
          >
            <Icon name="icon-scan" className="button-icon" />Scan Barcode
          </button>
          <button
            type="button"
            className="crl-add-scan"
            onClick={() => onAddMode("upload")}
          >
            <Icon name="icon-cloud-upload" className="button-icon" />
            Upload Invoice
          </button>
          {totalItems > 0 && (
            <button
              type="button"
              className="crl-plan-header-btn crl-plan-header-btn--primary"
              onClick={goToReview}
              title="Optimize supplier consolidation, shipping, and delivery for this list"
            >
              <Icon name="icon-clipboard-check" className="button-icon" />
              {listStage === "review" ? "Continue in plan" : "Review & optimize"}
            </button>
          )}
          <button className="crl-more crl-more-icon" type="button" aria-label="Archive this list" title="Archive this list" onClick={() => onArchiveList()}>
            <Icon name="icon-archive-down" className="button-icon" />
          </button>
          <button className="crl-more crl-more-icon" type="button" aria-label="Clear this list" title="Clear this list" onClick={() => onClearList()}>
            <Icon name="icon-trash-ios" className="button-icon" />
          </button>
        </div>
      </header>

      {(addMode === "scan" || addMode === "search") && (
        <section className="crl-add">
            {addMode === "scan" && (
              <div className="crl-add-panel"><DesktopBarcodeScan onScan={onScan} /></div>
            )}
            {addMode === "search" && (
              <div className="crl-add-panel crl-search-panel">
                <label className="crl-search">
                  <Icon name="icon-search" className="button-icon" />
                  <input
                    type="search"
                    placeholder="Search the catalog…"
                    value={searchTerm}
                    onChange={(event) => onSearchTerm(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && searchTerm.trim()) {
                        event.preventDefault();
                        event.currentTarget.blur();
                        onNavigate?.(`/app/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`);
                      }
                    }}
                    autoFocus
                  />
                </label>
                {searchTerm.trim() && (
                  <SearchResults results={searchResults} loading={searchLoading} query={searchTerm.trim()} onNavigate={onNavigate} />
                )}
              </div>
            )}
          </section>
      )}

      <div className={`crl-layout ${detail ? "has-detail" : ""} ${detail && detailWide ? "detail-wide" : ""}`}>
        <div className="crl-main">
          <section className="crl-list">
            <div className="crl-tabs-row">
              <nav className="crl-tabs" aria-label="Item list filters">
                {[
                  ["all", `All Items (${totalItems})`],
                  ["confirmed", `Matched (${stats.matched})`],
                  ["possible", `Needs Review (${stats.review})`],
                  ["nomatch", `No Match (${stats.notFound})`],
                ].map(([id, label]) => (
                  <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
                ))}
              </nav>
              {onRefresh && (
                <button
                  type="button"
                  className={`crl-refresh ${refreshing ? "spinning" : ""}`}
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh"
                  aria-label="Refresh"
                >
                  <Icon name="icon-refresh" className="button-icon" />
                </button>
              )}
            </div>

            <div className="crl-table">
              <div className="crl-row crl-row-head">
                <span className="crl-h-center">Source</span>
                <span>Item</span>
                <span className="crl-h-center">Qty</span>
                <span className="crl-h-center">Status</span>
                <span>Matched product</span>
                <span className="crl-price-h">Price <Icon name="icon-info" className="button-icon" /></span>
                <span aria-hidden="true" />
              </div>
              {isEmpty && (
                <div className="crl-empty">
                  <Icon name="icon-cloud-upload" className="button-icon" />
                  <strong>Your reorder list is empty</strong>
                  <p>Upload an invoice (PDF or CSV) or scan a barcode to start matching items to the best supplier.</p>
                </div>
              )}
              {filtered.map((row) => {
                const status = CRL_STATUS[row.status];
                const notFound = row.status === "Not found";
                const mode = notFound ? "resolve" : row.status === "Review" ? "review" : "view";
                return (
                  <div className={`crl-row crl-row-click ${detail?.row.id === row.id ? "active" : ""}`} key={row.id} onClick={() => setDetail({ row, mode })}>
                    <span className="crl-source" title={`Imported from ${row.source.toUpperCase()}`}><Icon name={CRL_SOURCE_ICON[row.source] || "icon-file-text"} className="button-icon" /></span>
                    <span className="crl-item">
                      <ProductThumb image={row.image} alt={row.canonicalName || row.importedName} />
                      <span className="crl-item-id">
                        <strong>{row.canonicalName || row.importedName}</strong>
                        <small>{row.canonicalName ? `From source: ${row.importedName}` : `SKU on source: ${(row.importedSub || "").replace(/^SKU:\s*/, "") || "—"}`}</small>
                      </span>
                    </span>
                    <span className="crl-qty">
                      {row.itemId ? (
                        <span className="crl-qty-inline" onClick={(event) => event.stopPropagation()}>
                          <button type="button" className="crl-qty-step-btn" aria-label="Decrease quantity" disabled={(row.qty || 1) <= 1} onClick={() => onConfirmMatch?.(row.itemId, { qty: Math.max(1, (row.qty || 1) - 1) })}>&minus;</button>
                          <strong>{row.qty}</strong>
                          <button type="button" className="crl-qty-step-btn" aria-label="Increase quantity" onClick={() => onConfirmMatch?.(row.itemId, { qty: (row.qty || 1) + 1 })}>+</button>
                        </span>
                      ) : (
                        <strong>{row.qty}</strong>
                      )}
                      {(() => {
                        const label = row.packLabel || row.uom;
                        return label && label !== "ea" ? <small>{label}</small> : null;
                      })()}
                    </span>
                    <span className="crl-status-cell">
                      <span className={`crl-status ${status.cls}`} title={status.label}><Icon name={status.icon} className="button-icon" /><span className="crl-status-label">{status.label}</span></span>
                      {row.confidence != null && <small className={`crl-conf ${mrConfTone(row.confidence)}`}>{row.confidence}% confidence</small>}
                    </span>
                    <span className="crl-match">
                      {notFound ? (
                        <>
                          <strong>No match found</strong>
                          <small>We couldn&rsquo;t find a match in our catalog.</small>
                        </>
                      ) : (
                        <>
                          <strong>{row.matchName}</strong>
                          {row.matchSub && <small>{row.matchSub}</small>}
                          <MatchSupplier name={row.supplier} />
                        </>
                      )}
                    </span>
                    <span className="crl-price">
                      {notFound ? <span className="crl-dash">—</span> : (
                        <>
                          <strong>{mrMoney(row.price)}</strong>
                          {showPerEa(row.perEa, row.price) && <small>${mrEa(row.perEa)} / ea</small>}
                          {row.lineSavings > 0 && <small className="crl-save">Save {mrMoney(row.lineSavings)}</small>}
                        </>
                      )}
                    </span>
                    <span className="crl-actions">
                      {row.itemId && (
                        <button className="crl-row-delete" type="button" aria-label="Remove from list" title="Remove from list" onClick={(event) => { event.stopPropagation(); onRemoveItem?.(row.itemId); onToast("Item removed from list"); }}>
                          <Icon name="icon-trash-ios" className="button-icon" />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              {!isEmpty && rows.some((r) => r.lineTotal != null) && (
                <div className="crl-foot">
                  <span className="crl-foot-label">List subtotal</span>
                  <strong className="crl-foot-total">{mrMoney(rows.reduce((sum, r) => sum + (r.lineTotal || 0), 0))}</strong>
                </div>
              )}
            </div>

          </section>
        </div>

        {detail ? (
          <MatchPanel
            key={detail.row.itemId || detail.row.id}
            row={detail.row}
            mode={detail.mode}
            wide={detailWide}
            onToggleWide={() => setDetailWide((value) => !value)}
            onClose={() => { setDetail(null); setDetailWide(false); }}
            onToast={onToast}
            onConfirmMatch={onConfirmMatch}
            onLinkProduct={onLinkProduct}
            onRemoveItem={onRemoveItem}
            onNavigate={onNavigate}
          />
        ) : (
        <aside className="crl-rail">
          <BuyingPreferencesCard
            prefs={buyingPrefs}
            supplierOptions={supplierOptions}
            onSave={onBuyingPrefs}
            onToast={onToast}
          />

          <section className="crl-card">
            <h3>Plan Preview</h3>
            {usingReal ? (
              <>
                {planSummary.savings > 0 && (
                  <div className="crl-savings-hero">
                    <span className="crl-savings-hero-label">You save</span>
                    <strong className="crl-savings-hero-amt">{money.format(planSummary.savings)}</strong>
                    <span className="crl-savings-hero-sub">vs. {money.format(planSummary.currentSpend)} you pay now</span>
                  </div>
                )}
                <div className="crl-plan">
                  <div><span>Items subtotal</span><strong>{money.format(planSummary.itemsSubtotal)}</strong></div>
                  <div>
                    <span>Est. shipping</span>
                    <strong>
                      {planSummary.hasShippingData
                        ? `${planSummary.shippingComplete ? "" : "~"}${money.format(planSummary.shippingTotal)}`
                        : "Not estimated"}
                    </strong>
                  </div>
                  <div><span>Landed total</span><strong>{money.format(planSummary.landedTotal)}</strong></div>
                  <div><span>Suppliers</span><strong>{planSummary.suppliers}</strong></div>
                  <div><span>Coverage</span><strong>{planSummary.coverage}%</strong></div>
                </div>
                {planSummary.nudge && (
                  <p className="crl-ship-nudge">
                    Add {money.format(planSummary.nudge.remaining)} from {planSummary.nudge.supplier} to unlock free shipping
                    {planSummary.nudge.saves ? ` (saves ${money.format(planSummary.nudge.saves)})` : ""}.
                  </p>
                )}
                {optimizedPlan && listSettled && (
                  <div className="crl-optimize">
                    <div className="crl-optimize-text">
                      Save <strong>{money.format(optimizedPlan.savings)}</strong>{" "}
                      {optimizedPlan.suppliers < planSummary.suppliers
                        ? `by consolidating to ${optimizedPlan.suppliers} supplier${optimizedPlan.suppliers === 1 ? "" : "s"}`
                        : "by optimizing suppliers for shipping"}.
                    </div>
                    <button className="crl-optimize-btn" type="button" onClick={() => setShowConsolidate(true)}>
                      Review changes
                    </button>
                  </div>
                )}
                {optimizedPlan && !listSettled && (
                  <p className="crl-ship-nudge">
                    {allReviewed
                      ? `Move to Review & optimize to consolidate suppliers and save ${money.format(optimizedPlan.savings)} on shipping.`
                      : `Resolve the remaining items to review consolidating suppliers and save ${money.format(optimizedPlan.savings)} on shipping.`}
                  </p>
                )}
                {planSummary.missingPrice > 0 && (
                  <p className="crl-plan-note">
                    Add what you pay to {planSummary.missingPrice} item{planSummary.missingPrice === 1 ? "" : "s"} to see your full savings.
                  </p>
                )}
              </>
            ) : (
              <div className="crl-plan">
                <div><span>Estimated total</span><strong>$5,842.16</strong></div>
                <div><span>Suppliers</span><strong>5</strong></div>
                <div><span>Coverage</span><strong>92%</strong></div>
                <div><span>Potential savings</span><strong className="green">$842.15</strong></div>
              </div>
            )}
            <button className="crl-plan-btn" type="button" onClick={() => onNavigate?.("/app/review")}>Open Review &amp; optimize <Icon name="icon-arrow-right" className="button-icon" /></button>
          </section>
        </aside>
        )}
      </div>

      {addMode === "upload" && (
        <UploadModal
          uploadFormRef={uploadFormRef}
          onUpload={onUpload}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadElapsed={uploadElapsed}
          uploadError={uploadError}
          onCancelUpload={onCancelUpload}
          onClearUploadError={onClearUploadError}
          isDraggingInvoice={isDraggingInvoice}
          onDragStateChange={onDragStateChange}
          onInvoiceDrop={onInvoiceDrop}
          onInvoiceFile={onInvoiceFile}
          selectedInvoiceName={selectedInvoiceName}
          hasUploadedInvoice={hasUploadedInvoice}
          lastUpload={lastUpload}
          buyerName={buyerName}
          practiceName={practiceName}
          onClose={onCloseUpload}
          onUploadAnother={onUploadAnother}
        />
      )}

      {reviewConfirm && (
        <ReviewUnresolvedModal
          unresolved={unresolvedRows}
          includedCount={totalItems - unresolvedRows.length}
          onContinue={confirmReview}
          onClose={() => setReviewConfirm(false)}
        />
      )}

      {showConsolidate && optimizedPlan && (
        <ConsolidatePreviewModal
          moves={consolidationMoves}
          savings={optimizedPlan.savings}
          fromSuppliers={planSummary.suppliers}
          toSuppliers={optimizedPlan.suppliers}
          landedBefore={planSummary.landedTotal}
          landedAfter={planSummary.landedTotal - optimizedPlan.savings}
          onApply={() => { onApplyOptimized?.(optimizedPlan.assignmentByItemId); setShowConsolidate(false); onToast("Suppliers consolidated to save on shipping"); }}
          onClose={() => setShowConsolidate(false)}
        />
      )}

    </div>
  );
}

// Shown when a buyer advances to Review & optimize with items that won't make
// it into any supplier order (no match, or out of stock everywhere). Warns
// which items get excluded; Continue advances anyway, Cancel keeps them on the
// Draft list to resolve.
// Generic confirmation dialog for destructive whole-list actions (archive /
// clear). Reuses the crl-modal shell so it matches the other modals.
function ConfirmModal({ title, body, confirmLabel = "Confirm", destructive = false, onConfirm, onClose }) {
  return (
    <div className="crl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="crl-modal crl-modal-confirm">
        <header className="crl-modal-head">
          <div>
            <h3 id="confirmModalTitle">{title}</h3>
            <p>{body}</p>
          </div>
          <button className="crl-modal-close" type="button" aria-label="Close" onClick={onClose}><Icon name="icon-x" className="button-icon" /></button>
        </header>
        <footer className="crl-modal-foot">
          <button className="crl-ghost-btn" type="button" onClick={onClose}>Cancel</button>
          <button className={`primary-action compact${destructive ? " danger" : ""}`} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </div>
    </div>
  );
}

function ReviewUnresolvedModal({ unresolved, includedCount, onContinue, onClose }) {
  const n = unresolved.length;
  return (
    <div className="crl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reviewUnresolvedTitle" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="crl-modal">
        <header className="crl-modal-head">
          <div>
            <h3 id="reviewUnresolvedTitle">{n} unresolved item{n === 1 ? "" : "s"} won&rsquo;t be included</h3>
            <p>These items aren&rsquo;t matched to an in-stock supplier, so they won&rsquo;t be part of Review &amp; optimize. {includedCount} item{includedCount === 1 ? "" : "s"} will be included.</p>
          </div>
          <button className="crl-modal-close" type="button" aria-label="Close" onClick={onClose}><Icon name="icon-x" className="button-icon" /></button>
        </header>
        <div className="crl-modal-body">
          <ul className="crl-unresolved-list">
            {unresolved.map((row) => (
              <li className="crl-unresolved-item" key={row.id}>
                <ProductThumb image={row.image} alt={row.canonicalName || row.importedName} />
                <span className="crl-unresolved-info">
                  <strong>{row.canonicalName || row.importedName}</strong>
                  <small>{row.status === "Not found" ? "No match found" : "Out of stock at every supplier"}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <footer className="crl-modal-foot">
          <button className="crl-ghost-btn" type="button" onClick={onClose}>Back to draft list</button>
          <button className="primary-action compact" type="button" onClick={onContinue}>Continue to review</button>
        </footer>
      </div>
    </div>
  );
}

// Consolidation preview: shows exactly which lines the landed-cost optimizer
// would move to a different supplier (and the before/after landed cost) so the
// buyer confirms the supplier reassignment rather than having it applied
// silently. Apply sets the per-line selections via onApplyOptimized.
function ConsolidatePreviewModal({ moves, savings, fromSuppliers, toSuppliers, landedBefore, landedAfter, onApply, onClose }) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  return (
    <div className="crl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="consolidateTitle" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="crl-modal">
        <header className="crl-modal-head">
          <div>
            <h3 id="consolidateTitle">Consolidate suppliers</h3>
            <p>Save {money.format(savings)} on shipping by moving {moves.length} line{moves.length === 1 ? "" : "s"} to a different supplier.</p>
          </div>
          <button className="crl-modal-close" type="button" aria-label="Close" onClick={onClose}><Icon name="icon-x" className="button-icon" /></button>
        </header>
        <div className="crl-modal-body">
          <div className="crl-modal-summary">
            <span><strong>{fromSuppliers} → {toSuppliers}</strong>Suppliers</span>
            <span><strong>{money.format(landedBefore)}</strong>Landed now</span>
            <span className="confirmed"><strong>{money.format(landedAfter)}</strong>Landed after</span>
          </div>
          <div className="crl-modal-results">
            {moves.map((move) => (
              <div className="crl-modal-result" key={move.itemId}>
                <div className="crl-modal-result-from">
                  <strong>{move.fromSupplier}</strong>
                  <small>{move.name} · Qty {move.qty} {move.uom}</small>
                </div>
                <Icon name="icon-arrow-right" className="button-icon crl-modal-arrow" />
                <div className="crl-modal-result-to">
                  <strong>{move.toSupplier}</strong>
                  <small>{money.format(move.toLine)}{move.toLine > move.fromLine ? ` (+${money.format(move.toLine - move.fromLine)} item cost)` : ""}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <footer className="crl-modal-foot">
          <button className="crl-ghost-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-action compact" type="button" onClick={onApply}>Apply consolidation</button>
        </footer>
      </div>
    </div>
  );
}

// Upload workspace as a modal: drop a PDF invoice, it's parsed and fuzzy-matched
// against the canonical catalog (Medusa), the matched products are added to the
// reorder list, and the modal then shows the per-line match result.
function UploadModal({
  uploadFormRef,
  onUpload,
  uploading,
  uploadProgress,
  uploadElapsed = 0,
  uploadError = "",
  onCancelUpload,
  onClearUploadError,
  isDraggingInvoice,
  onDragStateChange,
  onInvoiceDrop,
  onInvoiceFile,
  selectedInvoiceName,
  hasUploadedInvoice,
  lastUpload,
  buyerName = "",
  practiceName = "",
  onClose,
  onUploadAnother,
}) {
  const phase = uploadProgress < 35 ? "Reading the invoice…" : "Matching products to the catalog…";
  const warming = uploading && uploadElapsed > 10000;
  const resultRows = lastUpload ? deriveMatchRows(lastUpload.items) : [];
  const matched = resultRows.filter((row) => row.status === "Matched").length;
  const review = resultRows.filter((row) => row.status === "Review").length;
  const noMatch = resultRows.filter((row) => row.status === "Not found").length;

  return (
    <div className="crl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="uploadModalTitle" onClick={(event) => { if (event.target === event.currentTarget && !uploading) onClose(); }}>
      <div className="crl-modal">
        <header className="crl-modal-head">
          <div>
            <h3 id="uploadModalTitle">{lastUpload ? "Invoice matched" : "Upload invoice"}</h3>
            <p>{lastUpload ? `${lastUpload.items.length} line items from ${lastUpload.name}` : "We read the PDF or CSV, match each line to the canonical catalog, and add the matched products to your list."}</p>
          </div>
          <button className="crl-modal-close" type="button" aria-label="Close" onClick={onClose} disabled={uploading}><Icon name="icon-x" className="button-icon" /></button>
        </header>

        {!lastUpload ? (
          <div className="crl-modal-body">
            <form ref={uploadFormRef} onSubmit={onUpload} className="upload-layout">
              <div
                className={`upload-dropzone ${isDraggingInvoice ? "dragging" : ""} ${uploadError ? "has-error" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); if (!uploading) onDragStateChange(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onDragStateChange(false); }}
                onDrop={onInvoiceDrop}
              >
                {uploadError && !uploading ? (
                  <>
                    <div className="upload-icon error"><Icon name="icon-alert-triangle" /></div>
                    <h3>Upload didn&rsquo;t finish</h3>
                    <p className="upload-error-msg">{uploadError}</p>
                    <button className="primary-action compact" type="button" onClick={onClearUploadError}>
                      <Icon name="icon-cloud-upload" className="button-icon" />Try again
                    </button>
                  </>
                ) : (
                  <>
                    <div className="upload-icon"><Icon name="icon-cloud-upload" /></div>
                    <h3>{uploading ? "Processing invoice…" : isDraggingInvoice ? "Drop your file here" : "Drag and drop your invoice"}</h3>
                    <p>{uploading ? (selectedInvoiceName || "Your invoice") : selectedInvoiceName || "or"}</p>
                    {!uploading && <span className="select-file-button"><Icon name="icon-cloud-upload" className="button-icon" />Choose file</span>}
                    {!uploading && <small>Text-based PDF or CSV invoice · Max 20MB</small>}
                    {uploading && (
                      <div className="processing-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(uploadProgress)}>
                        <div className="processing-track"><div style={{ width: `${uploadProgress}%` }}></div></div>
                        <span>{phase}{uploadElapsed > 4000 ? ` · ${Math.round(uploadElapsed / 1000)}s` : ""}</span>
                        {warming && <small className="processing-hint">First match in a while can take up to a minute while the catalog warms up — hang tight.</small>}
                      </div>
                    )}
                  </>
                )}
                <input
                  className="file-input"
                  data-testid="invoice-file-input"
                  name="file"
                  type="file"
                  accept=".pdf,.csv,application/pdf,text/csv"
                  required
                  disabled={uploading}
                  onChange={(event) => onInvoiceFile(event.currentTarget, event.currentTarget.files?.[0])}
                />
                <button className="primary-action compact hidden-submit" data-testid="save-parse-request" type="submit" disabled={uploading}>Add to list</button>
                <input type="hidden" name="clinic" value={practiceName || "Unknown clinic"} />
                <input type="hidden" name="buyer" value={buyerName || "Unknown buyer"} />
                <input type="hidden" name="shippingAddress" value="500 Healthcare Blvd, Nashville, TN" />
                <input type="hidden" name="preference" value="Exact brand if possible, alternatives allowed" />
              </div>
            </form>
          </div>
        ) : (
          <div className="crl-modal-body">
            <div className="crl-modal-summary">
              <span className="confirmed"><strong>{matched}</strong>Matched</span>
              <span className="possible"><strong>{review}</strong>Needs Review</span>
              <span className="nomatch"><strong>{noMatch}</strong>No match</span>
            </div>
            <div className="crl-modal-results">
              {resultRows.map((row) => {
                const status = CRL_STATUS[row.status];
                const notFound = row.status === "Not found";
                return (
                  <div className="crl-modal-result" key={row.id}>
                    <div className="crl-modal-result-from">
                      <strong>{row.importedName}</strong>
                      <small>Qty {row.qty} · {row.uom}</small>
                    </div>
                    <Icon name="icon-arrow-right" className="button-icon crl-modal-arrow" />
                    <div className="crl-modal-result-to">
                      {notFound ? <span className="crl-dash">No catalog match</span> : (<><strong>{row.matchName}</strong><small>{row.supplier}</small></>)}
                    </div>
                    <span className={`crl-status ${status.cls}`}><Icon name={status.icon} className="button-icon" />{status.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <footer className="crl-modal-foot">
          {lastUpload ? (
            <>
              <button className="crl-ghost-btn" type="button" onClick={onUploadAnother}>Upload another</button>
              <button className="primary-action compact" type="button" onClick={onClose}>View list</button>
            </>
          ) : uploading ? (
            <button className="crl-ghost-btn" type="button" onClick={onCancelUpload}>Cancel upload</button>
          ) : (
            <button className="crl-ghost-btn" type="button" onClick={onClose}>Cancel</button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ── Review & optimize (/app/review) + Supplier Handoff ───────────────────────

// Group derived match rows into per-supplier buckets (heaviest spend first) so
// the plan and the frozen handoff both present orders supplier-by-supplier.
function groupRowsBySupplier(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const supplier = row.supplier || "—";
    if (!map.has(supplier)) map.set(supplier, { supplier, supplierId: null, rows: [], subtotal: 0, count: 0 });
    const group = map.get(supplier);
    group.rows.push(row);
    group.subtotal += row.lineTotal || 0;
    group.count += 1;
    // Pin the supplier id from the offer the buyer selected so the buying agent
    // can target the right supplier; the first non-null wins.
    if (!group.supplierId) {
      const selected = (row.offers || []).find((offer) => offer.key === row.selectedOfferKey);
      group.supplierId = selected?.supplierId || row.supplierId || null;
    }
  }
  return [...map.values()].sort((a, b) => b.subtotal - a.subtotal);
}

// Trim a live match row down to the fields a frozen handoff needs, pinning the
// supplier SKU from the offer the buyer actually selected.
function slimHandoffRow(row) {
  const selected = (row.offers || []).find((offer) => offer.key === row.selectedOfferKey);
  return {
    id: row.id,
    image: row.image || "",
    canonicalName: row.canonicalName || null,
    canonicalHandle: row.canonicalHandle || null,
    matchName: row.matchName || row.canonicalName || "",
    matchSub: row.matchSub || "",
    supplier: row.supplier,
    supplierId: selected?.supplierId || row.supplierId || null,
    sku: selected?.sku || "",
    productUrl: selected?.productUrl || row.productUrl || "",
    availability: selected?.availability ?? row.availability ?? "unknown",
    qty: row.qty,
    uom: row.uom,
    price: row.price,
    perEa: row.perEa ?? null,
    lineTotal: row.lineTotal || 0,
  };
}

// Best-known order page per supplier; unknown suppliers fall back to a search so
// "Open website" always lands the buyer somewhere useful.
const SUPPLIER_SITES = [
  { match: "dc dental", url: "https://www.dcdental.com" },
  { match: "carolina", url: "https://carolinadentalsupply.com" },
  { match: "dental city", url: "https://www.dentalcity.com" },
  { match: "schein", url: "https://www.henryschein.com" },
  { match: "pearson", url: "https://www.pearsondental.com" },
  { match: "patterson", url: "https://www.pattersondental.com" },
  { match: "amazon", url: "https://www.amazon.com" },
  { match: "unimed", url: "https://unimedusa.com" },
  { match: "young", url: "https://www.youngspecialties.com" },
  { match: "practicon", url: "https://www.practicon.com" },
  { match: "net32", url: "https://www.net32.com" },
];

function supplierSiteUrl(name) {
  const key = (name || "").toLowerCase();
  const known = SUPPLIER_SITES.find((site) => key.includes(site.match));
  return known ? known.url : `https://www.google.com/search?q=${encodeURIComponent(`${name} dental supply`)}`;
}

// Suppliers the headless buying agent can drive (a NUC runner adapter exists).
// Matched by name substring; grow this as adapters are added.
const AGENT_SUPPLIERS = ["dc dental"];
function isAgentSupplier(name) {
  const key = (name || "").toLowerCase();
  return AGENT_SUPPLIERS.some((match) => key.includes(match));
}

function planSlug(value) {
  return String(value || "list").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "list";
}

function downloadTextFile(name, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Plain-text order summary for one supplier — what the buyer pastes into the
// supplier's site, an email, or a phone order.
function buildSupplierOrderText(group, handoff) {
  const lines = [`${handoff.listName} — ${group.supplier}`];
  if (handoff.practice) lines.push(`Practice: ${handoff.practice}`);
  if (handoff.buyer) lines.push(`Buyer: ${handoff.buyer}`);
  lines.push("");
  for (const row of group.rows) {
    const sku = row.sku ? ` [${row.sku}]` : "";
    const unit = row.price != null ? ` @ ${mrMoney(row.price)}` : "";
    lines.push(`${row.qty} ${row.uom} — ${row.matchName || row.canonicalName}${sku}${unit} = ${mrMoney(row.lineTotal || 0)}`);
  }
  lines.push("");
  lines.push(`Subtotal: ${mrMoney(group.subtotal)}`);
  return lines.join("\n");
}

function buildHandoffCsv(handoff) {
  const esc = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = [["Supplier", "Item", "SKU", "Qty", "UOM", "Unit price", "Line total"]];
  for (const group of handoff.groups) {
    for (const row of group.rows) {
      rows.push([
        group.supplier,
        row.matchName || row.canonicalName || "",
        row.sku || "",
        row.qty,
        row.uom,
        row.price != null ? Number(row.price).toFixed(2) : "",
        Number(row.lineTotal || 0).toFixed(2),
      ]);
    }
  }
  return rows.map((cells) => cells.map(esc).join(",")).join("\n");
}

// Per-supplier "build cart" helper. Resolves the supplier's lines to the best
// available target via /api/cart-link: a one-click Shopify cart permalink that
// prefills quantities, or — for platforms with no GET-based cart — the product
// pages to open and add by hand. Shared by the live plan and the frozen handoff.
function CartBuilderModal({ group, buyingPrefs, onClose, onStockResults, onSwitchOffer, onToast }) {
  const [state, setState] = useState({ status: "loading", result: null });
  const rows = group.rows || [];
  const linkable = rows.filter((row) => row.productUrl);
  const missing = rows.length - linkable.length;

  useEffect(() => {
    if (!linkable.length) {
      setState({ status: "empty", result: null });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", result: null });
    fetch("/api/cart-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier: group.supplier,
        items: linkable.map((row) => ({
          name: row.matchName || row.canonicalName || "",
          qty: row.qty,
          productUrl: row.productUrl,
        })),
      }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((result) => {
        if (cancelled) return;
        setState({ status: "ready", result });
        onStockResults?.(result.stock || []);
      })
      .catch(() => { if (!cancelled) setState({ status: "error", result: null }); });
    return () => { cancelled = true; };
    // group identity is stable per open; re-resolve only when the supplier changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  // Headless buying-agent path. For suppliers we can drive (AGENT_SUPPLIERS), we
  // either build with a saved login or prompt for one on the fly. `agent.phase`:
  // checking → available (saved login) | prompt (ask on the fly) | off, then
  // queued → running → done/failed/needs_auth once a build is enqueued.
  const [agent, setAgent] = useState({ phase: "checking", job: null });
  const [login, setLogin] = useState({ username: "", password: "", save: false });
  const supplierId = group.supplierId || null;
  const agentEnabled = isAgentSupplier(group.supplier);

  useEffect(() => {
    if (!supplierId || !agentEnabled) { setAgent({ phase: "off", job: null }); return; }
    let cancelled = false;
    setAgent({ phase: "checking", job: null });
    fetch("/api/supplier-credentials")
      .then((r) => (r.ok ? r.json() : { credentials: [] }))
      .then(({ credentials }) => {
        if (cancelled) return;
        const has = (credentials || []).some((c) => c.supplier_id === supplierId);
        // Saved login → one-click; otherwise prompt for it on the fly.
        setAgent({ phase: has ? "available" : "prompt", job: null });
      })
      .catch(() => { if (!cancelled) setAgent({ phase: "prompt", job: null }); });
    return () => { cancelled = true; };
  }, [supplierId, agentEnabled]);

  // Poll a queued/running job until it settles.
  useEffect(() => {
    if (agent.phase !== "queued" && agent.phase !== "running") return;
    const jobId = agent.job?.id;
    if (!jobId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      fetch(`/api/cart-builds?id=${encodeURIComponent(jobId)}`)
        .then((r) => (r.ok ? r.json() : { jobs: [] }))
        .then(({ jobs }) => {
          if (cancelled) return;
          const job = (jobs || [])[0];
          if (!job) return;
          if (job.status === "done") setAgent({ phase: "done", job });
          else if (job.status === "failed") setAgent({ phase: "failed", job });
          else if (job.status === "needs_auth") setAgent({ phase: "needs_auth", job });
          else if (job.status === "running") setAgent((a) => ({ ...a, phase: "running", job }));
        })
        .catch(() => {});
    }, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [agent.phase, agent.job?.id]);

  // `creds` carries an on-the-fly login (prompt path); omitted when a saved
  // login already exists.
  function startAgentBuild(creds) {
    const prevPhase = agent.phase;
    setAgent((a) => ({ ...a, phase: "queued" }));
    fetch("/api/cart-builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier_id: supplierId,
        lines: linkable.map((row) => ({
          name: row.matchName || row.canonicalName || "",
          qty: row.qty,
          productUrl: row.productUrl,
          sku: row.sku || "",
        })),
        ...(creds ? { username: creds.username, password: creds.password, save: creds.save } : {}),
      }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.job) {
          onToast(data?.error === "needs_credentials" ? "Enter your supplier login to build the cart" : "Couldn’t start the cart build");
          setAgent((a) => ({ ...a, phase: prevPhase }));
          return;
        }
        setAgent({ phase: "running", job: data.job });
      })
      .catch(() => { onToast("Couldn’t start the cart build"); setAgent((a) => ({ ...a, phase: prevPhase })); });
  }

  function submitLoginAndBuild(e) {
    e.preventDefault();
    if (!login.username.trim() || !login.password) { onToast("Enter your username and password"); return; }
    startAgentBuild({ username: login.username.trim(), password: login.password, save: login.save });
  }

  const result = state.result;
  const isShopify = state.status === "ready" && result?.kind === "shopify-cart";

  // Best-effort multi-tab open for the page-by-page path. Browsers block all but
  // the first pop-up, so we nudge the buyer to allow them (per-item links below
  // always work as the reliable fallback).
  function openAll() {
    let opened = 0;
    for (const row of linkable) {
      if (window.open(row.productUrl, "_blank", "noopener")) opened += 1;
    }
    if (opened < linkable.length) onToast("Allow pop-ups to open every product page at once");
  }

  return (
    <div className="crl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cartModalTitle" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="crl-modal cart-modal">
        <header className="crl-modal-head">
          <div>
            <h3 id="cartModalTitle">Build cart · {group.supplier}</h3>
            <p>{isShopify
              ? "We can prefill this supplier’s cart in one click — quantities included."
              : "Open each product on the supplier’s site and add it to your cart."}</p>
          </div>
          <button className="crl-modal-close" type="button" aria-label="Close" onClick={onClose}><Icon name="icon-x" className="button-icon" /></button>
        </header>

        <div className="crl-modal-body cart-modal-body">
          {/* Headless buying-agent path — one-click when a login is saved. */}
          {agent.phase === "available" && (
            <div className="cart-agent cart-agent-offer">
              <div className="cart-prefill-icon"><Icon name="icon-bolt" /></div>
              <strong>Build this cart for you</strong>
              <small>We’ll sign in to {group.supplier} with your saved login and add all {linkable.length} item{linkable.length === 1 ? "" : "s"} to your cart.</small>
              <button className="primary-action compact" type="button" onClick={() => startAgentBuild()}>
                <Icon name="icon-cart" className="button-icon" />Build my {group.supplier} cart
              </button>
            </div>
          )}

          {/* On-the-fly login: build without saving the password. */}
          {agent.phase === "prompt" && (
            <form className="cart-agent cart-agent-prompt" onSubmit={submitLoginAndBuild}>
              <div className="cart-prefill-icon"><Icon name="icon-bolt" /></div>
              <strong>Build this cart for you</strong>
              <small>Enter your {group.supplier} login and we’ll add all {linkable.length} item{linkable.length === 1 ? "" : "s"} to your cart. We use it for this order only — it isn’t saved unless you ask.</small>
              <input type="text" autoComplete="off" placeholder={`${group.supplier} username or email`} value={login.username} onChange={(e) => setLogin((l) => ({ ...l, username: e.target.value }))} />
              <input type="password" autoComplete="off" placeholder="Password" value={login.password} onChange={(e) => setLogin((l) => ({ ...l, password: e.target.value }))} />
              <label className="cart-agent-save">
                <input type="checkbox" checked={login.save} onChange={(e) => setLogin((l) => ({ ...l, save: e.target.checked }))} />
                Save this login so I don’t have to re-enter it
              </label>
              <button className="primary-action compact" type="submit">
                <Icon name="icon-cart" className="button-icon" />Build my {group.supplier} cart
              </button>
            </form>
          )}

          {(agent.phase === "queued" || agent.phase === "running") && (
            <div className="cart-status"><span className="cart-spinner" aria-hidden="true" />Signing in to {group.supplier} and adding your items… this can take a minute.</div>
          )}

          {agent.phase === "needs_auth" && (
            <div className="cart-status">That {group.supplier} login didn’t work. Double-check it (or that you have a {group.supplier} account) and try again.</div>
          )}

          {agent.phase === "failed" && (
            <div className="cart-status">Couldn’t finish building your {group.supplier} cart{agent.job?.error ? ` (${agent.job.error})` : ""}. You can open the products below instead.</div>
          )}

          {agent.phase === "done" && (
            <div className="cart-agent cart-agent-done">
              <div className="cart-prefill-icon"><Icon name="icon-cart" /></div>
              <strong>Your {group.supplier} cart is ready</strong>
              {(() => {
                const added = (agent.job?.results || []).filter((r) => r.status === "added").length;
                const issues = (agent.job?.results || []).filter((r) => r.status !== "added");
                return (
                  <>
                    <small>{added} of {agent.job?.results?.length || 0} item{(agent.job?.results?.length || 0) === 1 ? "" : "s"} added to your cart on {group.supplier}.</small>
                    {agent.job?.cart_url && (
                      <a className="primary-action compact" href={agent.job.cart_url} target="_blank" rel="noreferrer" onClick={() => onToast(`Opening your ${group.supplier} cart`)}>
                        <Icon name="icon-cart" className="button-icon" />Open your cart
                      </a>
                    )}
                    {issues.length > 0 && (
                      <ul className="cart-agent-issues">
                        {issues.map((r, i) => (
                          <li key={i}>{r.status === "out_of_stock" ? "Out of stock" : r.status === "not_found" ? "Couldn’t find" : "Couldn’t add"}: {linkable.find((row) => row.productUrl === r.productUrl)?.matchName || r.productUrl}</li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {state.status === "loading" && (
            <div className="cart-status"><span className="cart-spinner" aria-hidden="true" />Finding the best way to fill your {group.supplier} cart…</div>
          )}

          {state.status === "empty" && (
            <div className="cart-status">No supplier product links are available for these items yet.</div>
          )}

          {state.status === "error" && (
            <div className="cart-status">Couldn’t reach {group.supplier} to prefill the cart — open each product below instead.</div>
          )}

          {isShopify && (
            <div className="cart-prefill">
              <div className="cart-prefill-icon"><Icon name="icon-cart" /></div>
              <strong>Your {group.supplier} cart is ready</strong>
              <small>{result.count} item{result.count === 1 ? "" : "s"} with quantities, added to the cart on {group.supplier}.</small>
              <a className="primary-action compact" href={result.url} target="_blank" rel="noreferrer" onClick={() => onToast(`Opening your ${group.supplier} cart`)}>
                <Icon name="icon-cart" className="button-icon" />Open prefilled cart
              </a>
              {result.leftovers?.length > 0 && (
                <small className="cart-leftover-note">{result.leftovers.length} item{result.leftovers.length === 1 ? "" : "s"} couldn’t be added automatically — review {result.leftovers.length === 1 ? "it" : "them"} below.</small>
              )}
            </div>
          )}

          {(state.status === "error" || (state.status === "ready" && !isShopify && !result?.stock?.length)) && linkable.length > 0 && (
            <button className="primary-action compact cart-openall" type="button" onClick={openAll}>
              <Icon name="icon-link" className="button-icon" />Open all {linkable.length} product page{linkable.length === 1 ? "" : "s"}
            </button>
          )}

          {state.status !== "loading" && rows.length > 0 && (
            <ul className="cart-item-list">
              {rows.map((row, index) => {
                const liveResult = result?.stock?.find(
                  (entry) => shopifyStockKey(entry.productUrl) === shopifyStockKey(row.productUrl)
                );
                const liveOutOfStock = liveResult?.available === false;
                const switchTarget = row.switchTarget || (liveOutOfStock
                  ? pickBestOffer((row.offers || []).filter((offer) => offer.key !== row.selectedOfferKey && isOrderable(offer)), buyingPrefs, row)
                  : null);
                return (
                  <li className="cart-item" key={row.id ?? index}>
                    <ProductThumb image={row.image} alt={row.matchName || row.canonicalName} />
                    <span className="cart-item-name">
                      <strong>{row.matchName || row.canonicalName}</strong>
                      <small>{liveOutOfStock ? "Out of stock at this supplier" : `Qty ${row.qty} ${row.uom}${row.matchSub ? ` · ${row.matchSub}` : ""}`}</small>
                    </span>
                    {liveOutOfStock && switchTarget && row.itemId && onSwitchOffer ? (
                      <button
                        className="crl-ghost-btn cart-item-open"
                        type="button"
                        onClick={() => {
                          onSwitchOffer(row.itemId, { selectedOfferKey: switchTarget.key });
                          onToast(`Switched to ${switchTarget.supplier}`);
                          onClose();
                        }}
                      >
                        <Icon name="icon-shuffle" className="button-icon" />Switch
                      </button>
                    ) : liveOutOfStock ? (
                      <span className="cart-item-nolink">Unavailable</span>
                    ) : row.productUrl ? (
                      <a className="crl-ghost-btn cart-item-open" href={row.productUrl} target="_blank" rel="noreferrer"><Icon name="icon-link" className="button-icon" />Open</a>
                    ) : (
                      <span className="cart-item-nolink">No link</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {missing > 0 && state.status !== "loading" && (
            <small className="cart-missing-note">{missing} item{missing === 1 ? "" : "s"} on this order ha{missing === 1 ? "s" : "ve"} no supplier link — add {missing === 1 ? "it" : "them"} from the supplier’s site directly.</small>
          )}
        </div>

        <footer className="crl-modal-foot">
          <button className="crl-ghost-btn" type="button" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}

// One supplier's order block — shared by the live plan (full rows) and the
// frozen handoff (slim rows). `actions` injects the handoff's copy/open buttons.
function SupplierGroupCard({ group, onNavigate, onBuildCart, onSwitchOffer, onToast, actions = null }) {
  const buildable = group.rows.some((row) => row.productUrl);
  return (
    <section className="crl-card pp-group">
      <div className="pp-group-head">
        <MatchSupplier name={group.supplier} />
        <span className="pp-group-meta">{group.count} item{group.count === 1 ? "" : "s"} · <strong>{money.format(group.subtotal)}</strong></span>
      </div>
      {(onBuildCart || actions) && (
        <div className="ho-group-actions">
          {onBuildCart && (
            <button className="crl-ghost-btn pp-buildcart-btn" type="button" disabled={!buildable} onClick={() => onBuildCart(group)} title={buildable ? "" : "No supplier product links for these items"}>
              <Icon name="icon-cart" className="button-icon" />Build cart
            </button>
          )}
          {actions}
        </div>
      )}
      <div className="pp-group-lines">
        {group.rows.map((row) => {
          const clickable = Boolean(row.canonicalHandle);
          return (
            <div className="pp-line-wrap" key={row.id}>
              <div
                className={`pp-line ${clickable ? "clickable" : ""}`}
                onClick={clickable ? () => onNavigate?.(`/app/product/${row.canonicalHandle}`) : undefined}
              >
                <ProductThumb image={row.image} alt={row.matchName || row.canonicalName} />
                <span className="pp-line-name">
                  <strong>{row.matchName || row.canonicalName}</strong>
                  <span className="pp-line-sub">
                    {row.matchSub && <small>{row.matchSub}</small>}
                    {(() => {
                      const badge = availabilityBadge(row.availability, row.liveAvailable);
                      return badge ? (
                        <span
                          className={`pp-stock-badge stock-${badge.tone}`}
                          title={typeof row.liveAvailable === "boolean" ? "Live stock checked this session" : "Stock as of last catalog sync — verify before ordering"}
                        >
                          {badge.label}
                        </span>
                      ) : null;
                    })()}
                  </span>
                </span>
                <span className="pp-line-qty"><strong>{row.qty}</strong><small>{row.uom}</small></span>
                <span className="pp-line-ea">{showPerEa(row.perEa, row.price) ? `$${mrEa(row.perEa)} / ea` : ""}</span>
                <span className="pp-line-total">{mrMoney(row.lineTotal || 0)}</span>
              </div>
              {row.outOfStock && row.switchTarget && onSwitchOffer && (
                <div className="pp-line-switch">
                  <span className="pp-switch-msg"><Icon name="icon-alert-triangle" className="button-icon" />Out of stock at {row.supplier}</span>
                  <button
                    className="pp-switch-btn"
                    type="button"
                    onClick={() => { onSwitchOffer(row.itemId, { selectedOfferKey: row.switchTarget.key }); onToast?.(`Switched to ${row.switchTarget.supplier}`); }}
                  >
                    <Icon name="icon-shuffle" className="button-icon" />Switch to {row.switchTarget.supplier} · {mrMoney(row.switchTarget.price)}
                  </button>
                </div>
              )}
              {row.outOfStock && !row.switchTarget && (
                <div className="pp-line-switch">
                  <span className="pp-switch-msg pp-switch-none"><Icon name="icon-alert-triangle" className="button-icon" />Out of stock — no in-stock supplier carries this item</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProcurementPlanView({ items, listName, listStatus = "draft", onBackToDraft, buyingPrefs, onBuyingPrefs, onPrepareHandoff, onBuildCart, onSwitchOffer, onNavigate, onToast }) {
  const rows = deriveMatchRows(items || [], buyingPrefs);
  const included = rows.filter(isPlanIncluded);
  // No-match lines plus "out of stock everywhere" lines both land here so the
  // buyer sees why they're not in any supplier order.
  const unresolved = rows.filter((row) => !isPlanIncluded(row) && (row.status === "Not found" || !row.supplier || row.supplier === "—" || isStrandedOutOfStock(row)));
  const groups = groupRowsBySupplier(included);
  const total = included.reduce((sum, row) => sum + (row.lineTotal || 0), 0);
  const coverage = rows.length ? Math.round((included.length / rows.length) * 100) : 0;
  // Lines out of stock at their selected supplier that DO have an in-stock
  // alternative — the bulk "reassign all" banner targets these.
  const oosReassignable = included.filter((row) => row.outOfStock && row.switchTarget);

  const supplierOptions = useMemo(() => {
    const names = new Set();
    for (const item of items || []) {
      for (const offer of item.offers || []) {
        if (offer.supplier) names.add(offer.supplier);
      }
    }
    return [...names].sort();
  }, [items]);

  return (
    <div className="crl pp">
      <header className="crl-header pp-header">
        <div className="crl-title crl-title-main">
          <button className="history-back" type="button" onClick={() => onNavigate("/app")}><Icon name="icon-chevron-left" className="button-icon" />Current Reorder List</button>
          <h2>Review &amp; optimize</h2>
          <p className="crl-subtitle">
            <span className="crl-listname">{listName}</span>
            <span className="crl-dot" aria-hidden="true">·</span>
            <ListStatusPill status={listStatus} />
            <span className="crl-dot" aria-hidden="true">·</span>
            <span>{included.length} item{included.length === 1 ? "" : "s"} · {groups.length} supplier{groups.length === 1 ? "" : "s"}</span>
          </p>
        </div>
        <div className="crl-header-actions">
          {listStatus === "review" && onBackToDraft && (
            <button className="text-action compact" type="button" onClick={onBackToDraft} title="Return to Draft to keep editing this list">
              <Icon name="icon-chevron-left" className="button-icon" />Back to draft
            </button>
          )}
          <button className="secondary-action compact pp-hide-mobile" type="button" onClick={() => onNavigate("/app")}>Back to list</button>
          <button className="primary-action compact pp-header-handoff" type="button" disabled={!included.length} onClick={onPrepareHandoff}>
            <Icon name="icon-handshake" className="button-icon" />Prepare Supplier Handoff
          </button>
        </div>
      </header>

      <div className="pp-layout">
        <div className="pp-main">
          {groups.length === 0 ? (
            <div className="crl-card pp-empty">
              <Icon name="icon-package" className="button-icon" />
              <strong>No matched items yet</strong>
              <p>Match items on your reorder list to review and optimize suppliers, grouped by supplier.</p>
              <button className="secondary-action compact" type="button" onClick={() => onNavigate("/app")}>Go to reorder list</button>
            </div>
          ) : (
            <>
              <div className="pp-section-head">
                <h3>Included items</h3>
                <small>Grouped by supplier · best offer per line</small>
              </div>
              {oosReassignable.length > 0 && (
                <div className="pp-oos-banner">
                  <span className="pp-oos-banner-msg">
                    <Icon name="icon-alert-triangle" className="button-icon" />
                    <strong>{oosReassignable.length} item{oosReassignable.length === 1 ? " is" : "s are"} out of stock</strong>
                    <span>— reassign to the next in-stock supplier.</span>
                  </span>
                  <button
                    className="pp-oos-banner-btn"
                    type="button"
                    onClick={() => {
                      oosReassignable.forEach((row) => onSwitchOffer?.(row.itemId, { selectedOfferKey: row.switchTarget.key }));
                      onToast?.(`Reassigned ${oosReassignable.length} item${oosReassignable.length === 1 ? "" : "s"} to in-stock suppliers`);
                    }}
                  >
                    <Icon name="icon-shuffle" className="button-icon" />Reassign all
                  </button>
                </div>
              )}
              {groups.map((group) => (
                <SupplierGroupCard key={group.supplier} group={group} onNavigate={onNavigate} onBuildCart={onBuildCart} onSwitchOffer={onSwitchOffer} onToast={onToast} />
              ))}
            </>
          )}

          {unresolved.length > 0 && (
            <section className="crl-card pp-unresolved">
              <div className="crl-card-head">
                <h3>Unresolved items ({unresolved.length})</h3>
                <button className="crl-edit-link" type="button" onClick={() => onNavigate("/app")}>Resolve on list</button>
              </div>
              <p className="pp-unresolved-note">These items aren&rsquo;t in any supplier order and won&rsquo;t be included in the supplier handoff.</p>
              <ul className="pp-unresolved-list">
                {unresolved.map((row) => {
                  const stranded = isStrandedOutOfStock(row);
                  return (
                    <li key={row.id}>
                      <ProductThumb image={row.image} alt={row.importedName} />
                      <span className="pp-unresolved-name">
                        <strong>{row.canonicalName || row.importedName}</strong>
                        <small>{stranded ? "Out of stock at every supplier" : `Qty ${row.qty} ${row.uom}`}</small>
                      </span>
                      <span className={`pp-unresolved-tag ${stranded ? "tag-oos" : ""}`}>{stranded ? "Out of stock" : "No match"}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="pp-rail">
          <BuyingPreferencesCard
            prefs={buyingPrefs}
            supplierOptions={supplierOptions}
            onSave={onBuyingPrefs}
            onToast={onToast}
          />
          <section className="crl-card">
            <h3>Plan Summary</h3>
            <div className="crl-plan">
              <div><span>Estimated total</span><strong>{money.format(total)}</strong></div>
              <div><span>Suppliers</span><strong>{groups.length}</strong></div>
              <div><span>Coverage</span><strong>{coverage}%</strong></div>
              <div><span>Included items</span><strong>{included.length}</strong></div>
            </div>
            <button className="primary-action compact pp-handoff-btn" type="button" disabled={!included.length} onClick={onPrepareHandoff}>
              <Icon name="icon-handshake" className="button-icon" />Prepare Supplier Handoff
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SupplierHandoffView({ handoff, onArchive, onBuildCart, onNavigate, onToast }) {
  if (!handoff) {
    return (
      <div className="crl ho">
        <header className="crl-header"><div className="crl-title crl-title-main"><h2>Supplier Handoff</h2></div></header>
        <div className="crl-card pp-empty">
          <Icon name="icon-handshake" className="button-icon" />
          <strong>No handoff prepared yet</strong>
          <p>Open Review &amp; optimize and prepare a supplier handoff to see frozen order details here.</p>
          <button className="secondary-action compact" type="button" onClick={() => onNavigate("/app/review")}>Open Review &amp; optimize</button>
        </div>
      </div>
    );
  }

  function copyGroup(group) {
    const text = buildSupplierOrderText(group, handoff);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => onToast(`${group.supplier} order details copied`))
        .catch(() => onToast("Couldn’t copy — try again"));
    } else {
      onToast("Clipboard unavailable in this browser");
    }
  }

  function exportCsv() {
    downloadTextFile(`${planSlug(handoff.listName)}-handoff.csv`, buildHandoffCsv(handoff), "text/csv");
    onToast("CSV exported");
  }

  function exportPdf() {
    onToast("Opening print dialog — choose “Save as PDF”");
    setTimeout(() => window.print(), 350);
  }

  return (
    <div className="crl ho">
      <header className="crl-header ho-header">
        <div className="crl-title crl-title-main">
          <button className="history-back" type="button" onClick={() => onNavigate("/app/review")}><Icon name="icon-chevron-left" className="button-icon" />Review &amp; optimize</button>
          <h2>Supplier Handoff</h2>
          <p className="crl-subtitle">
            <span className="ho-frozen-pill"><Icon name="icon-lock" className="button-icon" />Frozen snapshot</span>
            <span className="crl-dot" aria-hidden="true">·</span>
            <span>{handoff.createdLabel}</span>
          </p>
        </div>
        <div className="crl-header-actions ho-export">
          <button className="secondary-action compact" type="button" onClick={exportCsv}><Icon name="icon-table" className="button-icon" />Export CSV</button>
          <button className="secondary-action compact" type="button" onClick={exportPdf}><Icon name="icon-file-text" className="button-icon" />Export PDF</button>
        </div>
      </header>

      <div className="ho-banner">
        <Icon name="icon-lock" className="button-icon" />
        <span>Frozen snapshot of <strong>{handoff.listName}</strong>, captured {handoff.createdLabel}. Prices and selections are locked so your order details won&rsquo;t drift.</span>
      </div>

      <div className="ho-summary">
        <div><small>Suppliers</small><strong>{handoff.supplierCount}</strong></div>
        <div><small>Items</small><strong>{handoff.itemCount}</strong></div>
        <div><small>Estimated total</small><strong>{money.format(handoff.total)}</strong></div>
        <div><small>Strategy</small><strong>{STRATEGY_LABELS[handoff.prefs?.strategy] || "Best price"}</strong></div>
      </div>

      <div className="ho-groups">
        {handoff.groups.map((group) => (
          <SupplierGroupCard
            key={group.supplier}
            group={group}
            onNavigate={onNavigate}
            onBuildCart={onBuildCart}
            actions={(
              <>
                <button className="crl-ghost-btn" type="button" onClick={() => copyGroup(group)}><Icon name="icon-clipboard" className="button-icon" />Copy order details</button>
                <a className="crl-ghost-btn" href={supplierSiteUrl(group.supplier)} target="_blank" rel="noreferrer"><Icon name="icon-store" className="button-icon" />Open website</a>
              </>
            )}
          />
        ))}
      </div>

      <footer className="ho-footer">
        <div className="ho-footer-copy">
          <strong>Order placed?</strong>
          <small>Archive this list to move it to History and start a fresh reorder list. This frozen handoff stays available.</small>
        </div>
        <button className="primary-action compact" type="button" onClick={onArchive}><Icon name="icon-clipboard" className="button-icon" />Archive list &amp; start new</button>
      </footer>
    </div>
  );
}

const ARCHIVED_LISTS = [
  { id: "june-restock", name: "June Restock", date: "Jun 2, 2025", items: 124, suppliers: 5, total: "$5,842.16", status: "handoff" },
  { id: "may-hygiene", name: "May Hygiene Reorder", date: "May 9, 2025", items: 86, suppliers: 4, total: "$3,217.40", status: "handoff" },
  { id: "april-ortho", name: "April Ortho Supplies", date: "Apr 14, 2025", items: 52, suppliers: 3, total: "$1,905.00", status: "draft" },
];

function HistoryView({ onOpen, archivedLists = [] }) {
  const lists = [...archivedLists, ...ARCHIVED_LISTS];
  return (
    <div className="crl">
      <header className="crl-header">
        <div className="crl-title"><h2>History / Past Lists</h2></div>
      </header>
      <div className="history-list">
        {lists.map((list) => (
          <button className="history-row" type="button" key={list.id} onClick={() => onOpen(list.id)}>
            <span className="history-icon"><Icon name="icon-clock" className="button-icon" /></span>
            <span className="history-info">
              <strong>{list.name}</strong>
              <small>Archived {list.date} · {list.items} items · {list.suppliers} suppliers</small>
            </span>
            <ListStatusPill status={list.status} />
            <span className="history-total">{list.total}</span>
            <Icon name="icon-chevron-right" className="button-icon history-chev" />
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryDetail({ id, onBack, archivedLists = [], handoffs = [], onRename, onDuplicate, onViewHandoff }) {
  const lists = [...archivedLists, ...ARCHIVED_LISTS];
  const list = lists.find((entry) => entry.id === id) || lists[0];
  const rows = list?.rows || [];
  // Renaming only persists for real archived entries (not the demo samples).
  const isReal = archivedLists.some((entry) => entry.id === list.id);
  const linkedHandoff = list.handoffId ? handoffs.find((h) => h.id === list.handoffId) : null;
  return (
    <div className="crl">
      <header className="crl-header">
        <div className="crl-title">
          <button className="history-back" type="button" onClick={onBack}><Icon name="icon-chevron-left" className="button-icon" />History</button>
          {isReal ? (
            <input
              className="history-rename-input"
              value={list.name}
              onChange={(event) => onRename?.(list.id, event.target.value)}
              aria-label="List name"
              style={{ width: `${Math.max(list.name.length, 8)}ch` }}
            />
          ) : (
            <h2>{list.name}</h2>
          )}
          <ListStatusPill status={list.status} />
        </div>
      </header>
      <div className="history-detail-stats">
        <div><small>Archived</small><strong>{list.date}</strong></div>
        <div><small>Items</small><strong>{list.items}</strong></div>
        <div><small>Suppliers</small><strong>{list.suppliers}</strong></div>
        <div><small>Total</small><strong>{list.total}</strong></div>
      </div>
      {rows.length > 0 && (
        <div className="crl-table history-detail-table">
          <div className="crl-row crl-row-head">
            <span>Item</span>
            <span>Status</span>
            <span>Qty</span>
            <span>Matched product</span>
            <span className="crl-price-h">Price</span>
          </div>
          {rows.map((row) => {
            const status = CRL_STATUS[row.status];
            const notFound = row.status === "Not found";
            return (
              <div className="crl-row" key={row.id}>
                <span className="crl-item">
                  <ProductThumb image={row.image} alt={row.canonicalName || row.importedName} />
                  <span className="crl-item-id">
                    <strong>{row.canonicalName || row.importedName}</strong>
                    {row.canonicalName && <small>From source: {row.importedName}</small>}
                  </span>
                </span>
                <span className={`crl-status ${status.cls}`}><Icon name={status.icon} className="button-icon" />{status.label}</span>
                <span className="crl-qty"><strong>{row.qty}</strong><small>{row.uom}</small></span>
                <span className="crl-match">
                  {notFound ? <strong>No match found</strong> : (<><strong>{row.matchName}</strong><MatchSupplier name={row.supplier} /></>)}
                </span>
                <span className="crl-price">
                  {notFound ? <span className="crl-dash">—</span> : (<><strong>{mrMoney(row.price)}</strong>{showPerEa(row.perEa, row.price) && <small>${mrEa(row.perEa)} / ea</small>}</>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="history-detail-note">This reorder list is archived and read-only. Duplicate it to start a new reorder{linkedHandoff ? ", or revisit the supplier handoff" : ""}.</p>
      <div className="history-detail-actions">
        <button className="primary-action compact" type="button" onClick={() => onDuplicate?.(list)}><Icon name="icon-file-plus" className="button-icon" />Duplicate to new list</button>
        {linkedHandoff && (
          <button className="secondary-action compact" type="button" onClick={() => onViewHandoff?.(list.handoffId)}><Icon name="icon-handshake" className="button-icon" />View handoff</button>
        )}
      </div>
    </div>
  );
}

const SETTINGS_TABS = [
  ["profile", "Profile"],
  ["suppliers", "Supplier logins"],
  ["users", "Users"],
  ["billing", "Billing"],
  ["notifications", "Notifications"],
  ["integrations", "Integrations"],
  ["security", "Security"],
];

const SETTINGS_TAB_STUBS = {
  users: { icon: "icon-users", title: "Team & users", body: "Invite teammates, assign buyer or approver roles, and manage who can place orders for your practice." },
  billing: { icon: "icon-credit-card", title: "Billing & payment", body: "Manage payment methods, billing contacts, and download invoices for your MedMKP subscription." },
  notifications: { icon: "icon-bell", title: "Notifications", body: "Choose which emails and alerts you receive. Order-related email toggles live under Profile → Preferences for now." },
  integrations: { icon: "icon-plug", title: "Integrations", body: "Connect your practice-management system and accounting tools to sync orders and invoices automatically." },
  security: { icon: "icon-shield-check", title: "Security", body: "Two-factor authentication, active sessions, and audit history. Password changes live under Profile → Change password." },
};

const DEFAULT_PREFERENCES = {
  currency: "USD",
  itemsPerPage: "25",
  defaultUom: "Each",
  timezone: "America/New_York",
  emailOrderConfirmations: false,
  emailBackInStock: false,
  showPricingWithTax: true,
};

const CURRENCY_OPTIONS = [
  ["USD", "USD – US Dollar"],
  ["CAD", "CAD – Canadian Dollar"],
  ["EUR", "EUR – Euro"],
  ["GBP", "GBP – British Pound"],
];
const ITEMS_PER_PAGE_OPTIONS = ["10", "25", "50", "100"];
const UOM_OPTIONS = ["Each", "Box", "Case", "Pack", "Bag", "Bottle", "Tube", "Kit"];
const TIMEZONE_OPTIONS = [
  ["America/New_York", "(GMT-05:00) Eastern Time (US & Canada)"],
  ["America/Chicago", "(GMT-06:00) Central Time (US & Canada)"],
  ["America/Denver", "(GMT-07:00) Mountain Time (US & Canada)"],
  ["America/Los_Angeles", "(GMT-08:00) Pacific Time (US & Canada)"],
  ["America/Anchorage", "(GMT-09:00) Alaska"],
  ["Pacific/Honolulu", "(GMT-10:00) Hawaii"],
];
const COUNTRY_OPTIONS = ["United States", "Canada", "Mexico", "United Kingdom"];
const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

function formFromMe(me) {
  const customer = me?.customer || {};
  const practice = me?.practice || {};
  return {
    first_name: customer.first_name || "",
    last_name: customer.last_name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    name: practice.name || "",
    ship_address_line1: practice.ship_address_line1 || "",
    ship_address_line2: practice.ship_address_line2 || "",
    ship_city: practice.ship_city || "",
    ship_state: practice.ship_state || "",
    ship_zip: practice.ship_zip || "",
    ship_country: practice.ship_country || "United States",
    shipping_notes: practice.shipping_notes || "",
    use_as_billing: Boolean(practice.use_as_billing),
    prefs: { ...DEFAULT_PREFERENCES, ...(practice.preferences || {}) },
  };
}

function meFromForm(form, prevMe) {
  return {
    customer: {
      ...(prevMe?.customer || {}),
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
    },
    practice: {
      ...(prevMe?.practice || {}),
      name: form.name,
      ship_address_line1: form.ship_address_line1,
      ship_address_line2: form.ship_address_line2,
      ship_city: form.ship_city,
      ship_state: form.ship_state,
      ship_zip: form.ship_zip,
      ship_country: form.ship_country,
      shipping_notes: form.shipping_notes,
      use_as_billing: form.use_as_billing,
      preferences: form.prefs,
    },
  };
}

function SettingsView({ me, onMeUpdate, defaultBuyingPrefs, onSaveDefaults, supplierOptions = [], onToast }) {
  const [tab, setTab] = useState("profile");
  return (
    <div className="settings-page">
      <header className="settings-head">
        <h2>Settings</h2>
      </header>
      <nav className="settings-tabs" aria-label="Settings sections">
        {SETTINGS_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`settings-tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "profile" ? (
        <ProfileSettings
          me={me}
          onMeUpdate={onMeUpdate}
          defaultBuyingPrefs={defaultBuyingPrefs}
          onSaveDefaults={onSaveDefaults}
          supplierOptions={supplierOptions}
          onToast={onToast}
        />
      ) : tab === "suppliers" ? (
        <SupplierLoginsSettings onToast={onToast} />
      ) : (
        <SettingsComingSoon tab={tab} />
      )}
    </div>
  );
}

function SettingsComingSoon({ tab }) {
  const stub = SETTINGS_TAB_STUBS[tab] || { icon: "icon-settings", title: "Coming soon", body: "This section isn't available yet." };
  return (
    <div className="settings-stub">
      <Icon name={stub.icon} className="settings-stub-icon" />
      <h3>{stub.title}</h3>
      <p>{stub.body}</p>
      <span className="settings-stub-badge">Coming soon</span>
    </div>
  );
}

// Manage the per-supplier logins the headless buying agent uses to build carts.
// Passwords are write-only — the API only ever returns a masked username hint.
function SupplierLoginsSettings({ onToast }) {
  const [suppliers, setSuppliers] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ supplier_id: "", username: "", password: "" });
  const [saving, setSaving] = useState(false);

  function refresh() {
    return fetch("/api/supplier-credentials")
      .then((r) => (r.ok ? r.json() : { credentials: [] }))
      .then(({ credentials }) => setCredentials(credentials || []))
      .catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/suppliers").then((r) => (r.ok ? r.json() : { suppliers: [] })),
      fetch("/api/supplier-credentials").then((r) => (r.ok ? r.json() : { credentials: [] })),
    ])
      .then(([s, c]) => {
        if (cancelled) return;
        setSuppliers(s.suppliers || []);
        setCredentials(c.credentials || []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || id;

  function save(e) {
    e.preventDefault();
    if (!form.supplier_id || !form.username || !form.password) {
      onToast("Pick a supplier and enter a username and password");
      return;
    }
    setSaving(true);
    fetch("/api/supplier-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { onToast(data?.error || "Couldn’t save login"); return; }
        onToast(`Saved your ${supplierName(form.supplier_id)} login`);
        setForm({ supplier_id: "", username: "", password: "" });
        return refresh();
      })
      .catch(() => onToast("Couldn’t save login"))
      .finally(() => setSaving(false));
  }

  function remove(supplierId) {
    fetch("/api/supplier-credentials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: supplierId }),
    })
      .then(() => { onToast(`Removed your ${supplierName(supplierId)} login`); return refresh(); })
      .catch(() => onToast("Couldn’t remove login"));
  }

  return (
    <div className="settings-section supplier-logins">
      <div className="settings-card">
        <h3>Supplier logins</h3>
        <p className="settings-hint">
          Save your supplier account logins and we’ll build your carts for you — we sign in and add
          every item, so you just review and check out. Passwords are encrypted and never shown back.
        </p>

        {loading ? (
          <div className="cart-status"><span className="cart-spinner" aria-hidden="true" />Loading…</div>
        ) : (
          <>
            {credentials.length > 0 && (
              <ul className="cred-list">
                {credentials.map((c) => (
                  <li className="cred-row" key={c.supplier_id}>
                    <div className="cred-supplier"><MatchSupplier name={supplierName(c.supplier_id)} /></div>
                    <span className="cred-hint">{c.username_hint}</span>
                    <span className={`cred-status cred-status-${c.last_status}`}>
                      {c.last_status === "ok" ? "Verified" : c.last_status === "auth_failed" ? "Login failed" : c.last_status === "error" ? "Last build errored" : "Not yet used"}
                    </span>
                    <button className="crl-ghost-btn cred-remove" type="button" onClick={() => remove(c.supplier_id)}>
                      <Icon name="icon-trash" className="button-icon" />Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form className="cred-form" onSubmit={save}>
              <h4>{credentials.length ? "Add another login" : "Add a supplier login"}</h4>
              <label>
                <span>Supplier</span>
                <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">Choose a supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Username or email</span>
                <input type="text" autoComplete="off" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="you@practice.com" />
              </label>
              <label>
                <span>Password</span>
                <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
              </label>
              <button className="primary-action compact" type="submit" disabled={saving}>
                <Icon name="icon-lock" className="button-icon" />{saving ? "Saving…" : "Save login"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ProfileSettings({ me, onMeUpdate, defaultBuyingPrefs, onSaveDefaults, supplierOptions, onToast }) {
  const [form, setForm] = useState(() => formFromMe(me));
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);

  // Keep the form in sync with the server identity until the buyer starts
  // editing; after that, their in-progress edits win (no clobber on refetch).
  useEffect(() => {
    if (!dirtyRef.current) setForm(formFromMe(me));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
    setSaveStatus("idle");
  }
  function setField(key, value) {
    markDirty();
    setForm((current) => ({ ...current, [key]: value }));
  }
  function setPref(key, value) {
    markDirty();
    setForm((current) => ({ ...current, prefs: { ...current.prefs, [key]: value } }));
  }

  // Explicit save of profile + address + preferences.
  async function save() {
    if (!me || !dirty) return;
    setSaveStatus("saving");
    const payload = {
      customer: { first_name: form.first_name, last_name: form.last_name, phone: form.phone },
      practice: {
        name: form.name,
        ship_address_line1: form.ship_address_line1,
        ship_address_line2: form.ship_address_line2,
        ship_city: form.ship_city,
        ship_state: form.ship_state,
        ship_zip: form.ship_zip,
        ship_country: form.ship_country,
        shipping_notes: form.shipping_notes,
        use_as_billing: form.use_as_billing,
        preferences: form.prefs,
      },
    };
    try {
      const response = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("save failed");
      dirtyRef.current = false;
      setDirty(false);
      setSaveStatus("saved");
      onMeUpdate?.(meFromForm(form, me));
      onToast?.("Settings saved");
    } catch {
      setSaveStatus("error");
    }
  }

  return (
    <>
      <section className="set-section">
        <div className="set-section-info">
          <h3>Profile information</h3>
          <p>Update your personal information and how we contact you.</p>
        </div>
        <div className="set-section-body">
          <div className="set-grid cols-2">
            <label className="set-field">
              <span>First name</span>
              <input type="text" value={form.first_name} onChange={(e) => setField("first_name", e.target.value)} />
            </label>
            <label className="set-field">
              <span>Last name</span>
              <input type="text" value={form.last_name} onChange={(e) => setField("last_name", e.target.value)} />
            </label>
            <label className="set-field">
              <span>Work email</span>
              <input type="email" value={form.email} readOnly title="Your login email — contact support to change it." />
            </label>
            <label className="set-field">
              <span>Phone number</span>
              <input type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="(212) 555-0187" />
            </label>
          </div>
        </div>
      </section>

      <section className="set-section">
        <div className="set-section-info">
          <h3>Default shipping address</h3>
          <p>This address will be used to calculate shipping costs and delivery estimates.</p>
        </div>
        <div className="set-section-body">
          <div className="set-ship">
            <div className="set-ship-main">
              <label className="set-field">
                <span>Company / Practice name</span>
                <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} />
              </label>
              <label className="set-field">
                <span>Address line 1</span>
                <input type="text" value={form.ship_address_line1} onChange={(e) => setField("ship_address_line1", e.target.value)} />
              </label>
              <label className="set-field">
                <span>Address line 2 <em>(optional)</em></span>
                <input type="text" value={form.ship_address_line2} onChange={(e) => setField("ship_address_line2", e.target.value)} />
              </label>
              <div className="set-grid cols-3">
                <label className="set-field">
                  <span>City</span>
                  <input type="text" value={form.ship_city} onChange={(e) => setField("ship_city", e.target.value)} />
                </label>
                <label className="set-field">
                  <span>State / Province</span>
                  <select value={form.ship_state} onChange={(e) => setField("ship_state", e.target.value)}>
                    <option value="">—</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="set-field">
                  <span>ZIP / Postal code</span>
                  <input type="text" value={form.ship_zip} onChange={(e) => setField("ship_zip", e.target.value)} />
                </label>
              </div>
              <label className="set-field">
                <span>Country</span>
                <select value={form.ship_country} onChange={(e) => setField("ship_country", e.target.value)}>
                  {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="set-check">
                <input type="checkbox" checked={form.use_as_billing} onChange={(e) => setField("use_as_billing", e.target.checked)} />
                <span>
                  Use as billing address
                  <small>Billing address is used for invoices and tax calculations.</small>
                </span>
              </label>
            </div>
            <div className="set-ship-aside">
              <label className="set-field">
                <span>Shipping notes <em>(optional)</em></span>
                <textarea
                  rows={4}
                  maxLength={200}
                  value={form.shipping_notes}
                  onChange={(e) => setField("shipping_notes", e.target.value)}
                  placeholder="e.g., Gate code, suite number, receiving hours, etc."
                />
                <small className="set-counter">{form.shipping_notes.length} / 200</small>
              </label>
            </div>
          </div>
        </div>
      </section>

      <ChangePasswordSection onToast={onToast} />

      <section className="set-section">
        <div className="set-section-info">
          <h3>Preferences</h3>
          <p>Set your default preferences for a better shopping experience.</p>
        </div>
        <div className="set-section-body">
          <div className="set-grid cols-3">
            <label className="set-field">
              <span>Default currency</span>
              <select value={form.prefs.currency} onChange={(e) => setPref("currency", e.target.value)}>
                {CURRENCY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="set-field">
              <span>Items per page</span>
              <select value={form.prefs.itemsPerPage} onChange={(e) => setPref("itemsPerPage", e.target.value)}>
                {ITEMS_PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="set-field">
              <span>Default UOM</span>
              <select value={form.prefs.defaultUom} onChange={(e) => setPref("defaultUom", e.target.value)}>
                {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>
          <div className="set-grid cols-3">
            <label className="set-field">
              <span>Timezone</span>
              <select value={form.prefs.timezone} onChange={(e) => setPref("timezone", e.target.value)}>
                {TIMEZONE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="set-toggles">
            <label className="set-check">
              <input type="checkbox" checked={form.prefs.emailOrderConfirmations} onChange={(e) => setPref("emailOrderConfirmations", e.target.checked)} />
              <span>Email me order confirmations</span>
            </label>
            <label className="set-check">
              <input type="checkbox" checked={form.prefs.emailBackInStock} onChange={(e) => setPref("emailBackInStock", e.target.checked)} />
              <span>Email me when items are back in stock</span>
            </label>
            <label className="set-check">
              <input type="checkbox" checked={form.prefs.showPricingWithTax} onChange={(e) => setPref("showPricingWithTax", e.target.checked)} />
              <span>Show pricing with tax (if applicable)</span>
            </label>
          </div>
        </div>
      </section>

      <section className="set-section">
        <div className="set-section-info">
          <h3>Default buying preferences</h3>
          <p>New reorder lists start from these defaults. You can still tweak them per list on Home.</p>
        </div>
        <div className="set-section-body">
          <BuyingPreferencesCard
            title="Default Buying Preferences"
            savedMessage="Default preferences saved"
            prefs={defaultBuyingPrefs}
            supplierOptions={supplierOptions}
            onSave={onSaveDefaults}
            onToast={onToast}
          />
        </div>
      </section>

      <footer className="settings-foot">
        <span className={`settings-savestate ${saveStatus}`}>
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && !dirty && "All changes saved"}
          {saveStatus === "error" && "Couldn't save — please try again"}
          {dirty && saveStatus !== "saving" && "You have unsaved changes"}
        </span>
        <div className="settings-foot-actions">
          <button className="primary-action compact" type="button" onClick={save} disabled={!dirty || saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </footer>
    </>
  );
}

function ChangePasswordSection({ onToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not update your password.");
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      onToast?.("Password updated");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="set-section">
      <div className="set-section-info">
        <h3>Change password</h3>
        <p>Choose a strong password to keep your account secure.</p>
      </div>
      <div className="set-section-body">
        <form className="set-pw-form" onSubmit={submit}>
          <div className="set-grid cols-3">
            <label className="set-field">
              <span>Current password</span>
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label className="set-field">
              <span>New password</span>
              <div className="set-input-wrap">
                <input type={showNext ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                <button type="button" className="set-eye" aria-label={showNext ? "Hide password" : "Show password"} onClick={() => setShowNext((v) => !v)}>
                  <Icon name={showNext ? "icon-eye-off" : "icon-eye"} className="button-icon" />
                </button>
              </div>
            </label>
            <label className="set-field">
              <span>Confirm new password</span>
              <div className="set-input-wrap">
                <input type={showConfirm ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                <button type="button" className="set-eye" aria-label={showConfirm ? "Hide password" : "Show password"} onClick={() => setShowConfirm((v) => !v)}>
                  <Icon name={showConfirm ? "icon-eye-off" : "icon-eye"} className="button-icon" />
                </button>
              </div>
            </label>
          </div>
          {error && <p className="set-pw-error">{error}</p>}
          <div className="set-pw-actions">
            <button className="primary-action compact" type="submit" disabled={submitting || !current || !next || !confirm}>
              {submitting ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
