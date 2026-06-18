"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG_CATEGORIES, bucketCategories, categoryBySlug } from "./catalogData";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Upload aborts after this long so a slow/unreachable backend can't hang the
// modal forever. Generous because a cold catalog-match index can take a while
// to build on the first request; the user can also Cancel sooner.
const UPLOAD_TIMEOUT_MS = 180000;

const APP_STATE_KEY = "medmkp_app_state_v1";
const CATALOG_RECENT_KEY = "medmkp_catalog_recent_v1";

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
  catalog: "/app/catalog",
  history: "/app/history",
  settings: "/app/settings",
};

function viewFromPath(pathname = "/") {
  const path = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";

  // Public site
  if (path === "/") return { view: "landing", isLoggedIn: false };
  if (path === "/pricing") return { view: "pricing", isLoggedIn: false };
  if (path === "/about") return { view: "about", isLoggedIn: false };
  if (path === "/login") return { view: "login", isLoggedIn: false };
  if (path === "/signup") return { view: "signup", isLoggedIn: false };
  if (path === "/forgot-password") return { view: "forgotPassword", isLoggedIn: false };
  if (path === "/reset-password") return { view: "resetPassword", isLoggedIn: false };
  if (path === "/sample") return { view: "sample", isLoggedIn: false };

  // Authenticated app
  if (path === "/app") return { view: "home", isLoggedIn: true };
  if (path === "/app/scan") return { view: "home", isLoggedIn: true, mobileAddItemRoute: true };
  if (path === "/app/history") return { view: "history", isLoggedIn: true };
  if (path.startsWith("/app/history/")) return { view: "historyDetail", isLoggedIn: true, historyId: path.split("/")[3] || "" };
  if (path === "/app/catalog") return { view: "catalog", isLoggedIn: true };
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
        // to ZXing decoding the same video frames. Without this, iOS has no decoder
        // at all and the shutter can only hand off to manual entry.
        if ("BarcodeDetector" in window) {
          try {
            detector = new window.BarcodeDetector();
          } catch (error) {
            detector = null;
          }
        }

        if (!detector) {
          try {
            const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import("@zxing/library");
            if (!isMounted) return;
            const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
              BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13,
              BarcodeFormat.EAN_8, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
            ]]]);
            const reader = new BrowserMultiFormatReader(hints);
            detector = {
              detect(video) {
                try {
                  const result = reader.decodeBitmap(reader.createBinaryBitmap(video));
                  return result ? [{ rawValue: result.getText() }] : [];
                } catch (error) {
                  return []; // NotFoundException == no barcode in this frame
                }
              },
            };
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
      className={`scan-result-card ${notFound ? "nomatch" : "match"} ${className}`}
      role="status"
      aria-live="polite"
      onClick={notFound ? undefined : onClear}
    >
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
            : `${offer?.supplier || item.oldVendor || "Supplier pending"}${item.unit ? ` · ${item.unit}` : ""}`}
        </small>
      </div>
      <div className="src-right">
        {!notFound && price != null && <strong>{mrMoney(price)}</strong>}
        {!notFound && offer?.perUnit != null && <small>${mrEa(offer.perUnit)} / ea</small>}
        {isDuplicate
          ? <em className="src-qty">×{qty}</em>
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
          <button className="secondary-action compact" type="button" onClick={() => onNavigate(authed ? "/app" : "/login")}>Log in</button>
          <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up</button>
        </div>
      </header>

      <section className="landing-main">
        <div className="landing-col-left">
          <div className="landing-copy">
            <h1>Scan your dental supplies and spot <span>possible savings</span> in seconds</h1>
            <p>Point your phone at a barcode or enter a SKU to identify the item, compare typical price ranges, and save it to a free starter reorder list. No login required to try it.</p>
            <div className="landing-actions">
              <button className="primary-action" type="button" onClick={() => onNavigate(authed ? "/app" : "/signup")}>
                <Icon name="icon-scan" className="button-icon" />
                Scan 1 item free
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
                <div><Icon name="icon-shuffle" className="landing-instant-icon"/></div>
                <div>
                  <strong>Possible lower-cost alternatives</strong>
                  <span>See 3-6 matches</span>
                </div>
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
        </div>

        <div className="landing-col-right">
          <img className="landing-scan-mock" src="/scan-mockup.png" alt="MedMKP scanning a Microbrush product and showing a price benchmark result" />

          <div className="landing-cta">
            <div>
              <h2>Want office-specific savings?</h2>
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
      </section>

      <footer className="trusted-strip">
        <div>
          <span><Icon name="icon-handshake" className="button-icon" />Works with Henry Schein, Patterson, Darby, and generic barcodes</span>
          <span><Icon name="icon-building" className="button-icon" />Built for dental offices<br /><small>Designed around how your office buys.</small></span>
          <span><Icon name="icon-shield-check" className="button-icon" />HIPAA-aware / secure<br /><small>We protect your data with enterprise-grade security.</small></span>
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
function SampleReorderList({ onNavigate }) {
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
          <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
          <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up free</button>
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
            onToast={showToast}
            listTouched={false}
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

function PublicNav({ onNavigate, active }) {
  return (
    <header className="public-nav">
      <a className="public-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
        <BrandMark />
      </a>
      <nav className="public-links" aria-label="Marketing navigation">
        <a href="/pricing" className={active === "pricing" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("/pricing"); }}>Pricing</a>
        <a href="/about" className={active === "about" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("/about"); }}>About</a>
      </nav>
      <div className="public-nav-actions">
        <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
        <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up</button>
      </div>
    </header>
  );
}

function PricingPage({ onNavigate }) {
  const tiers = [
    { name: "Starter", price: "Free", per: "", blurb: "For trying it out", cta: "Start free", to: "/signup", featured: false, features: ["Scan & search products", "1 reorder list", "Benchmark price ranges"] },
    { name: "Practice", price: "$199", per: "/mo", blurb: "For a single office", cta: "Start free trial", to: "/signup", featured: true, features: ["Unlimited reorder lists", "Invoice upload & matching", "Supplier handoffs", "Price alerts"] },
    { name: "Group", price: "Custom", per: "", blurb: "For multi-location groups", cta: "Contact sales", to: "/about", featured: false, features: ["Everything in Practice", "Multiple locations", "Team roles & approvals", "Priority support"] },
  ];
  return (
    <main className="public-page">
      <PublicNav onNavigate={onNavigate} active="pricing" />
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
    </main>
  );
}

function AboutPage({ onNavigate }) {
  return (
    <main className="public-page">
      <PublicNav onNavigate={onNavigate} active="about" />
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
    </main>
  );
}

function AuthShell({ subtitle, children, onNavigate }) {
  return (
    <main className="auth-page">
      <a className="auth-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
        <BrandMark />
      </a>
      <div className="auth-card">
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState(null);
  const [view, setViewState] = useState("landing");
  const [historyId, setHistoryId] = useState(null);
  const [productHandle, setProductHandle] = useState(null);
  const [categorySlug, setCategorySlug] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const [lastUpload, setLastUpload] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [canonicalResults, setCanonicalResults] = useState([]);
  const [canonicalSource, setCanonicalSource] = useState("idle");
  const [searchLoading, setSearchLoading] = useState(false);
  const [archivedLists, setArchivedLists] = useState([]);
  const [listTouched, setListTouched] = useState(false);
  const [listName, setListName] = useState("June Restock");
  const [buyingPrefs, setBuyingPrefs] = useState(DEFAULT_BUYING_PREFS);
  const [defaultBuyingPrefs, setDefaultBuyingPrefs] = useState(DEFAULT_BUYING_PREFS);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const serverLoadStartedRef = useRef(false);
  const saveTimerRef = useRef(null);

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
    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (data && data.state) {
          hydrateFromState(data.state);
        } else {
          const local = JSON.parse(window.localStorage.getItem(APP_STATE_KEY) || "null");
          if (local && (local.draftItems || []).length) {
            await fetch("/api/reorder-list", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(local),
            });
          }
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
    const blob = { draftItems, uploadedDocs, archivedLists, listTouched, listName, buyingPrefs, defaultBuyingPrefs };
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
  }, [stateLoaded, draftItems, uploadedDocs, archivedLists, listTouched, listName, buyingPrefs, defaultBuyingPrefs, authed, serverReady]);

  // Supplier names for the preferred-supplier picker in default preferences.
  useEffect(() => {
    fetch("/api/suppliers")
      .then((response) => response.json())
      .then(({ suppliers }) => setSupplierOptions((suppliers || []).map((supplier) => supplier.name)))
      .catch(() => setSupplierOptions([]));
  }, []);

  useEffect(() => {
    function syncViewFromLocation() {
      const nextRoute = viewFromPath(window.location.pathname);
      setIsLoggedIn(nextRoute.isLoggedIn);
      setViewState(nextRoute.view);
      setHistoryId(nextRoute.historyId || null);
      setProductHandle(nextRoute.productHandle || null);
      setCategorySlug(nextRoute.categorySlug || null);
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

  // Keep unauthenticated visitors out of the authenticated app routes.
  useEffect(() => {
    if (authed === false && isLoggedIn) {
      navigate("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, isLoggedIn]);

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
    setProductHandle(next.productHandle || null);
    setCategorySlug(next.categorySlug || null);
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
      return;
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
  }

  function removeDraftItem(target) {
    const id = typeof target === "string" ? target : target?.id;
    if (!id) return;
    setDraftItems((items) => items.map((item) => (item.id === id ? { ...item, included: false } : item)));
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
      if (patch.verified !== undefined) next.verified = patch.verified;
      return next;
    }));
  }

  // Bulk-confirm a set of items, accepting whatever offer is currently best.
  function verifyItems(itemIds) {
    const ids = new Set(itemIds);
    if (!ids.size) return;
    setListTouched(true);
    setDraftItems((items) => items.map((item) => (ids.has(item.id) ? { ...item, verified: true } : item)));
  }

  // Resolve a No-Match (or re-link any item) by attaching a catalog product and
  // its supplier offers, then marking it verified.
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
        imageUrl: product.image_url || best?.imageUrl || item.imageUrl || "",
        unit: product.base_unit || item.unit || "ea",
        offers,
        bestOffer: best,
        selectedOfferKey: null,
        matchStatus: "exact",
        confidence: product.match?.score ?? 0.95,
        verified: true,
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
    const suppliers = new Set(rows.map((row) => row.supplier).filter((name) => name && name !== "—"));
    const total = rows.reduce((sum, row) => sum + (row.lineTotal || 0), 0);
    const now = new Date();
    const entry = {
      id: `list_${now.getTime()}`,
      name: `${now.toLocaleString("en-US", { month: "long" })} Reorder List`,
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      items: rows.length,
      suppliers: suppliers.size,
      total: money.format(total),
      rows,
    };
    setArchivedLists((lists) => [entry, ...lists]);
    setDraftItems([]);
    setUploadedDocs([]);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    setBuyingPrefs(defaultBuyingPrefs);
    showToast("List archived to History");
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
    setBuyingPrefs(defaultBuyingPrefs);
    showToast("List cleared");
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
        {view === "pricing" ? <PricingPage onNavigate={navigate} />
          : view === "about" ? <AboutPage onNavigate={navigate} />
          : view === "login" ? <LoginPage onNavigate={navigate} onAuthed={handleAuthed} />
          : view === "signup" ? <SignupPage onNavigate={navigate} onAuthed={handleAuthed} />
          : view === "forgotPassword" ? <ForgotPasswordPage onNavigate={navigate} />
          : view === "resetPassword" ? <ResetPasswordPage onNavigate={navigate} />
          : view === "sample" ? <SampleReorderList onNavigate={navigate} />
          : <LoggedOutLanding onNavigate={navigate} authed={authed === true} />}
        <IconSprite />
      </>
    );
  }

  return (
    <>
      <div className={`app-shell ${menuOpen ? "menu-open" : ""} ${mobileAddItemRoute ? "mobile-add-item-shell" : ""}`}>
        <header className="topbar">
          <button className="topbar-brand" type="button" onClick={() => setView("home")} aria-label="MedMKP home">
            <BrandMark />
          </button>
          <div className="topbar-search-wrap">
            <label className="topbar-search">
              <Icon name="icon-search" className="button-icon" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search products, suppliers…"
                aria-label="Search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape") { setSearchTerm(""); event.currentTarget.blur(); } }}
              />
              <kbd className="topbar-kbd">⌘K</kbd>
            </label>
            {searchTerm.trim() && (
              <>
                <div className="topbar-search-backdrop" onClick={() => setSearchTerm("")} />
                <SearchResults
                  results={searchResults}
                  loading={searchLoading}
                  searchHref={`/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`}
                />
              </>
            )}
          </div>
          <div className="topbar-right">
            <button className="topbar-alerts" type="button" aria-label="Alerts">
              <Icon name="icon-bell" className="button-icon" />
              <span className="topbar-badge">3</span>
            </button>
            <div className="topbar-user-wrap">
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
                <>
                  <div className="topbar-menu-backdrop" onClick={() => setUserMenuOpen(false)} />
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
                </>
              )}
            </div>
          </div>
        </header>
        <div className="app-body">
        <aside className="sidebar">
          <nav className="nav-tabs" aria-label="Primary navigation">
            {navItems.map(([target, icon, label]) => (
              <button
                key={target}
                className={`nav-tab ${view === target ? "active" : ""}`}
                type="button"
                onClick={() => setView(target)}
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
                items={activeDraftItems}
                listName={listName}
                onRenameList={setListName}
                buyerName={buyerName}
                practiceName={practiceName}
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
                onToast={showToast}
                listTouched={listTouched}
                buyingPrefs={buyingPrefs}
                onBuyingPrefs={setBuyingPrefs}
                onArchiveList={archiveCurrentList}
                onClearList={clearCurrentList}
                onConfirmMatch={applyMatchDecision}
                onLinkProduct={linkProductToItem}
                onRemoveItem={removeDraftItem}
                onVerifyItems={verifyItems}
              />
            )
          )}

          {view === "history" && <HistoryView archivedLists={archivedLists} onOpen={(id) => navigate(`/app/history/${id}`)} />}

          {view === "historyDetail" && <HistoryDetail id={historyId} archivedLists={archivedLists} onBack={() => navigate("/app/history")} />}

          {view === "catalog" && <CatalogView onNavigate={navigate} />}

          {view === "catalogCategory" && (
            <CatalogCategoryView slug={categorySlug} onNavigate={navigate} />
          )}

          {view === "productDetail" && (
            <ProductDetail handle={productHandle} onNavigate={navigate} onToast={showToast} />
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
        <MobileBottomNav view={view} onNavigate={setView} onScan={openMobileScan} />
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
      <IconSprite />
    </>
  );
}

function SearchResults({ results, searchHref, loading }) {
  const headerLabel = loading && !results.length
    ? "Searching…"
    : results.length ? "Matching canonical products" : "No catalog matches";
  return (
    <div className="search-results" role="region" aria-label="Catalog search results">
      <div className="search-results-header">
        <strong>{headerLabel}</strong>
        <Link className="search-results-link" href={searchHref}>View catalog</Link>
      </div>
      {results.slice(0, 5).map((result) => {
        const price = typeof result.price_cents === "number"
          ? money.format(result.price_cents / 100)
          : "Price pending";
        const perUnit = typeof result.per_unit_cents === "number"
          ? `${money.format(result.per_unit_cents / 100)}/${result.base_unit || "unit"}`
          : null;
        const href = result.handle ? `/app/product/${result.handle}` : searchHref;

        return (
          <Link className="search-result" key={result.id} href={href}>
            <span>
              <strong>{result.name}</strong>
              <small>{result.category || "Uncategorized"} · {result.supplier_name || "Supplier pending"}</small>
            </span>
            <em style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
              <span>{price}</span>
              {perUnit && (
                <small style={{ color: "var(--muted)", fontWeight: 600, fontStyle: "normal" }}>
                  {perUnit}{result.pack_size ? ` · ${result.pack_size}` : ""}
                </small>
              )}
            </em>
          </Link>
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

// Deterministic per-supplier rating + lead time so the comparison reads like the
// catalog mock without inventing values that jump around on every render.
function supplierMeta(seed) {
  const key = String(seed || "");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const rating = (4.2 + (hash % 8) / 10).toFixed(1);
  const lead = 1 + (hash % 4);
  return { rating, lead: `${lead}–${lead + 1} days` };
}

function availabilityInfo(value) {
  if (value === "in_stock") return { label: "In stock", sub: "Ships today", tone: "ok" };
  if (value === "limited") return { label: "Limited", sub: "Ships in 1–2 days", tone: "warn" };
  if (value === "backordered") return { label: "Backordered", sub: "Ships in 1–2 weeks", tone: "bad" };
  return { label: "Availability on request", sub: "Confirm with supplier", tone: "muted" };
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
            key={sub}
            type="button"
            className="cat-chip"
            onClick={() => onNavigate(`/app/catalog/${category.slug}?sub=${encodeURIComponent(sub)}`)}
          >
            {sub}
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
      fetch("/api/catalog").then((r) => r.json()).catch(() => ({ categories: [] })),
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
                  <span className="cat-supplier-avatar">{supplierInitials(supplier.name)}</span>
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

// Category drill-down (/app/catalog/[slug]). Shows the curated category's
// subcategory chips as quick filters and a product grid pulled from the same
// canonical-products API the search uses; products open the existing PDP.
function CatalogCategoryView({ slug, onNavigate }) {
  const category = categoryBySlug(slug);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [sub, setSub] = useState("");

  // Remember this category for the landing page's "Recently viewed" rail.
  useEffect(() => {
    if (!slug) return;
    try {
      const prev = JSON.parse(window.localStorage.getItem(CATALOG_RECENT_KEY) || "[]").filter((s) => s !== slug);
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

  useEffect(() => {
    if (!category) { setStatus("missing"); return undefined; }
    // Abort superseded/duplicate fetches (StrictMode double-invoke, filter
    // changes) so we don't pile concurrent heavy queries onto the backend.
    const controller = new AbortController();
    setStatus("loading");
    // A curated category can own several supplier-named source categories
    // (e.g. Burs & Rotary = "Burs & Diamonds" + "Burs"); fetch each, merge,
    // dedupe, and rank by best offer so the grid spans the whole department.
    Promise.all(
      category.sources.map((source) => {
        const params = new URLSearchParams({ category: source, limit: "24" });
        if (sub) params.set("q", sub);
        return fetch(`/api/canonical-products?${params}`, { signal: controller.signal })
          .then((r) => r.json())
          .catch(() => ({ canonical_products: [] }));
      })
    ).then((responses) => {
      if (controller.signal.aborted) return;
      const seen = new Set();
      const merged = [];
      responses.forEach(({ canonical_products }) => {
        (canonical_products || []).forEach((product) => {
          if (seen.has(product.id)) return;
          seen.add(product.id);
          merged.push(product);
        });
      });
      merged.sort((a, b) => (a.best_offer?.price_cents ?? Infinity) - (b.best_offer?.price_cents ?? Infinity));
      setProducts(merged.slice(0, 24));
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

  return (
    <div className="cat">
      <nav className="cat-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => onNavigate("/app/catalog")}>Catalog</button>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        <strong>{category.name}</strong>
      </nav>
      <div className="cat-cat-head">
        <span className={`cat-tile lg tint-${category.tint}`}><Icon name={category.icon} className="nav-icon" /></span>
        <div>
          <h1 className="cat-title">{category.name}</h1>
          <p className="cat-lede">{category.description}</p>
        </div>
      </div>

      <div className="cat-filterbar">
        <button type="button" className={`cat-chip ${sub === "" ? "active" : ""}`} onClick={() => setSub("")}>All</button>
        {category.subcategories.map((option) => (
          <button key={option} type="button" className={`cat-chip ${sub === option ? "active" : ""}`} onClick={() => setSub(option)}>
            {option}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <div className="catalog-results-grid">
          {Array.from({ length: 6 }).map((_, i) => <div className="catalog-result-card cat-card-skeleton" key={i} />)}
        </div>
      ) : products.length ? (
        <div className="catalog-results-grid">
          {products.map((product) => {
            const best = product.best_offer;
            return (
              <article className="catalog-result-card" key={product.id}>
                <a
                  className="catalog-result-link"
                  href={`/app/product/${product.handle}`}
                  onClick={(event) => { event.preventDefault(); onNavigate(`/app/product/${product.handle}`); }}
                >
                  <div className="catalog-result-image">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} loading="lazy" />
                    ) : (
                      <div className="catalog-result-placeholder"><Icon name="icon-image" className="nav-icon" /></div>
                    )}
                  </div>
                  <div className="catalog-result-copy">
                    <div className="catalog-result-topline">
                      <span className="catalog-category">{product.category}</span>
                      <span className="catalog-result-count">{product.offer_count} offer{product.offer_count === 1 ? "" : "s"}</span>
                    </div>
                    <h2>{product.name}</h2>
                    <div className="catalog-result-meta">
                      <span>{best?.supplier_name || "Supplier pending"}</span>
                    </div>
                    <div className="catalog-result-price">
                      <strong>{best ? catMoney(best.price_cents) : "Price pending"}</strong>
                    </div>
                  </div>
                </a>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No products{sub ? ` for ${sub}` : ""}</strong>
          <span>Try a different subcategory or clear the filter.</span>
          {sub && <button type="button" className="secondary-action compact" onClick={() => setSub("")}>Clear filter</button>}
        </div>
      )}
    </div>
  );
}

// Product detail surface reached from search (/app/product/[handle]). Pulls the
// canonical product + supplier offers from the same API the search uses, then
// lays out the comparison, specs, substitutes, and reorder rail.
function ProductDetail({ handle, onNavigate, onToast }) {
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState("loading");
  const [subs, setSubs] = useState([]);
  const [qty, setQty] = useState(10);
  const [uom, setUom] = useState("Box");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!handle) {
      setStatus("missing");
      return undefined;
    }

    let active = true;
    setStatus("loading");
    setShowHistory(false);

    fetch(`/api/canonical-products?handle=${encodeURIComponent(handle)}`)
      .then((response) => response.json())
      .then(({ canonical_products: products }) => {
        if (!active) return;
        const found = products?.[0];
        if (!found) {
          setStatus("missing");
          return;
        }
        setProduct(found);
        setUom(cap(found.unit_of_measure) || "Box");
        setStatus("ready");

        // Comparable products: search by the product's family/type keyword so we
        // surface same-type variants (the curated category is often too narrow).
        const foundAttrs = parseAttributes(found.attributes_text);
        const term = (foundAttrs.family || found.name || "").split(/\s+/)[0];
        if (term) {
          fetch(`/api/canonical-products?q=${encodeURIComponent(term)}&limit=8`)
            .then((response) => response.json())
            .then(({ canonical_products: related }) => {
              if (!active) return;
              setSubs((related || []).filter((entry) => entry.handle !== found.handle).slice(0, 3));
            })
            .catch(() => active && setSubs([]));
        }
      })
      .catch(() => active && setStatus("missing"));

    return () => {
      active = false;
    };
  }, [handle]);

  if (status === "loading") {
    return <div className="pdp-state">Loading product&hellip;</div>;
  }

  if (status === "missing" || !product) {
    return (
      <div className="pdp-state">
        <strong>Product not found</strong>
        <p>We couldn&rsquo;t find that product in the catalog.</p>
        <Link className="secondary-action compact" href="/catalog/search">Back to search</Link>
      </div>
    );
  }

  const attrs = parseAttributes(product.attributes_text);
  // The API returns one offer per supplier variant; collapse to the lowest-priced
  // offer per supplier so the comparison reads as a supplier comparison (one row
  // each) and the "N suppliers" counts stay consistent with the hero badge.
  const sortedOffers = [...(product.offers || [])].sort((a, b) => a.price_cents - b.price_cents);
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
  const packSize = attrs.pack_sizes?.[0] || best?.name?.match(/(\d+\s*\/\s*[A-Za-z.]+)/)?.[1] || "—";
  const uomLabel = (uom || "unit").toLowerCase();
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
          <Link href="/catalog/search">Products</Link>
          <Icon name="icon-chevron-right" className="nav-icon" />
          <span>Product detail</span>
        </nav>
        <div className="pdp-top-actions">
          <button className="secondary-action compact" type="button" onClick={() => window.history.back()}>
            <Icon name="icon-chevron-left" className="button-icon" />
            Back to results
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
              {image ? <img src={image} alt={product.name} /> : <div className="pdp-hero-placeholder">No image available</div>}
              <button type="button" className="pdp-view-larger">
                <Icon name="icon-search" className="button-icon" />
                View larger image
              </button>
            </div>
            <div className="pdp-hero-body">
              <div className="pdp-hero-headline">
                <h1>{product.name}</h1>
                <span className="pdp-badge ok">
                  <Icon name="icon-check-circle" className="button-icon" />
                  Matched across {supplierCount} supplier{supplierCount === 1 ? "" : "s"}
                </span>
              </div>
              {brand && <span className="pdp-brand-link">{brand}<Icon name="icon-link" className="button-icon" /></span>}
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
              </div>
              <div className="pdp-qty-inline">
                <span>Quantity</span>
                <QtyStepper qty={qty} setQty={setQty} />
                <UomSelect uom={uom} setUom={setUom} />
              </div>
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
                  const unit = offer.price_cents / 100;
                  const meta = supplierMeta(offer.supplier_id || offer.supplier_name || index);
                  const avail = availabilityInfo(offer.availability);
                  return (
                    <div className={`pdp-row ${index === 0 ? "best" : ""}`} key={offer.supplier_product_id || index}>
                      <div className="pdp-row-supplier">
                        <span className="pdp-supplier-logo">{initials(offer.supplier_name)}</span>
                        <div>
                          <strong>{offer.supplier_name}<Icon name="icon-check-circle" className="pdp-verified" /></strong>
                          <small>&#9733; {meta.rating} &middot; {meta.lead}</small>
                        </div>
                      </div>
                      <div className="pdp-row-sku">{offer.sku || "—"}</div>
                      <div className="pdp-row-unit">
                        <strong>{money.format(unit)}</strong> <span>/ {uomLabel}</span>
                        {index === 0 && <span className="pdp-tag-best">Best price</span>}
                      </div>
                      <div className="pdp-row-ext">{money.format(unit * qty)}</div>
                      <div className={`pdp-row-avail ${avail.tone}`}>
                        <span><span className="pdp-dot" aria-hidden="true" />{avail.label}</span>
                        <small>{avail.sub}</small>
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
                        <button className="pdp-more" type="button" aria-label="More actions">&#8943;</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button className="pdp-history-toggle" type="button" onClick={() => setShowHistory((value) => !value)}>
              Show price history
              <Icon name="icon-chevron-down" className={`button-icon ${showHistory ? "flip" : ""}`} />
            </button>
            {showHistory && range && (
              <div className="pdp-history">
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
                <Link className="pdp-link" href="/catalog/search">View all</Link>
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
            <label className="pdp-field">
              <span>Current list</span>
              <div className="pdp-select">
                <Icon name="icon-list" className="nav-icon" />
                <select aria-label="Reorder list" defaultValue="June Restock">
                  <option>June Restock</option>
                  <option>Q3 Restock</option>
                  <option>New list&hellip;</option>
                </select>
                <Icon name="icon-chevron-down" className="nav-icon" />
              </div>
            </label>
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
                  <strong>{money.format(bestUnit)} <em>/ {uomLabel}</em></strong>
                </div>
                <div className="pdp-best-side">
                  <span>Est. total</span>
                  <strong>{money.format(bestUnit * qty)}</strong>
                </div>
                <small className="pdp-best-foot">{availabilityInfo(best.availability).label} &middot; {availabilityInfo(best.availability).sub}</small>
              </div>
            )}
            <button
              className="primary-action"
              type="button"
              onClick={() => onToast(`Added ${qty} ${uomLabel}${qty === 1 ? "" : "s"} of ${product.name} to June Restock`)}
            >
              Add to Reorder List
            </button>
            <button className="secondary-action" type="button" onClick={() => onNavigate("/app")}>
              <Icon name="icon-file-text" className="button-icon" />
              View Current Reorder List
            </button>
          </section>

          <section className="crl-card pdp-summary">
            <div className="pdp-card-head">
              <h3>Current list summary</h3>
              <button className="pdp-link" type="button" onClick={() => onNavigate("/app")}>Open list</button>
            </div>
            <div className="pdp-summary-list">
              <div><span>Total items</span><strong>24</strong></div>
              <div><span>Total suppliers</span><strong>6</strong></div>
              <div><span>Estimated spend</span><strong>$1,284.67</strong></div>
              <div><span>Potential savings</span><strong className="green">$212.45</strong></div>
            </div>
          </section>

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
    packSize: offer.pack_size || "",
    imageUrl: offer.image_url || "",
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
  };
  // Real catalog match from the lookup endpoint.
  if (product) {
    const offers = (product.offers || []).map(mapSearchOffer);
    const best = offers[0] || (product.best_offer ? mapSearchOffer(product.best_offer) : null);
    return {
      ...base,
      product: product.name,
      canonicalName: product.name,
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
    // A buyer-confirmed (or linked) item counts as verified regardless of the
    // original auto confidence; otherwise needs_review is the work queue.
    if (item.verified) return "Matched";
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
      sub: [offer.sku, offer.packSize].filter(Boolean).join(" · "),
    }));
    // "Recommended" is what our preferences pick — it never moves when the buyer
    // overrides their selection. "Selected" is the offer actually in the plan
    // (the buyer's choice, defaulting to our recommendation).
    const fallback = item.bestOffer ? { ...item.bestOffer, key: offerKey(item.bestOffer), sub: [item.bestOffer.sku, item.bestOffer.packSize].filter(Boolean).join(" · ") } : null;
    const recommended = notFound ? null : (pickBestOffer(offers, prefs, item) || fallback);
    const chosen = item.selectedOfferKey ? offers.find((offer) => offer.key === item.selectedOfferKey) : null;
    const best = notFound ? null : (chosen || recommended);
    const supplier = notFound ? "—" : (best?.supplier || item.oldVendor || "—");
    const price = best ? best.price : (item.oldUnitPrice ?? 0);
    const perEa = best ? (best.perUnit ?? null) : null;
    const qty = item.draftQty ?? item.qty ?? 1;
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
    return {
      id: index + 1,
      itemId: item.id || null,
      image: best?.imageUrl || item.imageUrl || "",
      source: item.source || ((item.documentIds || []).includes("scan") ? "scan" : "pdf"),
      canonicalName: notFound ? null : (item.canonicalName || item.product || null),
      importedName: item.extractedFrom,
      importedSub: item.sku ? `SKU: ${item.sku}` : (item.unit || ""),
      supplier,
      matchName: notFound ? null : (best?.name || item.canonicalName || item.product || null),
      matchSub: notFound ? null : (best ? [best.sku, best.packSize].filter(Boolean).join(" · ") : ""),
      confidence: notFound ? null : conf,
      price: notFound ? null : price,
      perEa: notFound ? null : perEa,
      status,
      verified: Boolean(item.verified),
      linked: Boolean(item.linked),
      note: item.note || "",
      offers,
      selectedOfferKey: best?.key || null,
      recommendedOfferKey: recommended?.key || null,
      qty,
      uom: item.unit || "ea",
      lineTotal: notFound ? null : (best ? best.price * qty : price * qty),
      others,
    };
  });
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


// Status pills. "Matched" is our auto match (honest: we found it, the buyer
// hasn't necessarily checked it); once the buyer confirms it reads "Verified"
// (see the table cell, which swaps the label when row.verified).
const CRL_STATUS = {
  Matched: { cls: "confirmed", label: "Matched", icon: "icon-check-circle" },
  Review: { cls: "possible", label: "Needs review", icon: "icon-alert-triangle" },
  "Not found": { cls: "nomatch", label: "No match", icon: "icon-x-circle" },
  Verified: { cls: "verified", label: "Verified", icon: "icon-shield-check" },
};

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

// Build the selectable candidate list for an item's verify drawer from its real
// supplier offers. "recommended" flags our preference-based pick (a fixed badge
// that never moves); the radio/active state tracks what the buyer has selected.
// Falls back to a single candidate when an item carries no offer list.
function offerCandidates(row) {
  const fromOffers = (row.offers || []).map((offer) => ({
    key: offer.key,
    name: offer.name,
    supplier: offer.supplier,
    sub: offer.sub,
    price: offer.price,
    perEa: offer.perUnit ?? null,
    image: offer.imageUrl || "",
    recommended: offer.key === row.recommendedOfferKey,
  }));
  if (fromOffers.length) return fromOffers;
  if (row.matchName) {
    return [{ key: row.selectedOfferKey || null, name: row.matchName, supplier: row.supplier, sub: row.matchSub, price: row.price, perEa: row.perEa, image: row.image, recommended: true }];
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
//  - view: an already-matched item (Verified) — confirm or change the match
//  - review: a low-confidence match (Verify Match) — pick the best match
//  - resolve: no catalog match — search to link a product
// Confirming, picking a different offer, editing qty, adding a note, linking a
// product, or removing the item all persist back to the draft list via the
// callbacks (keyed by row.itemId). Sample rows (no itemId) stay demo-only.
function MatchPanel({ row, mode, wide, onToggleWide, onClose, onToast, onConfirmMatch, onLinkProduct, onRemoveItem }) {
  const isResolve = mode === "resolve";
  const isView = mode === "view";
  const candidates = isResolve ? [] : offerCandidates(row);
  // Start on the buyer's current selection (falls back to our recommendation).
  const selectedIndex = candidates.findIndex((candidate) => candidate.key === row.selectedOfferKey);
  const recommendedIndex = candidates.findIndex((candidate) => candidate.recommended);
  const [selected, setSelected] = useState(selectedIndex >= 0 ? selectedIndex : Math.max(0, recommendedIndex));
  const [qty, setQty] = useState(row.qty || 1);
  const [notes, setNotes] = useState(row.note || "");
  // Resolve opens straight into search; review/view can toggle in to re-link.
  const [searching, setSearching] = useState(isResolve);
  const search = useProductSearch(searching);
  const status = row.verified ? CRL_STATUS.Verified : CRL_STATUS[row.status];
  const sourceLabel = row.source === "scan" ? "From Barcode Scan" : row.source === "csv" ? "From Reorder Sheet" : "From Invoice";
  const title = isResolve ? "Resolve item" : isView ? "Product match" : "Verify product match";
  const subtitle = isResolve
    ? "We couldn’t match this item. Find the right product to link."
    : isView
      ? "Confirm or change the product matched to this item."
      : "Please confirm the best match for this imported item.";

  function confirm() {
    if (row.itemId) {
      onConfirmMatch?.(row.itemId, { selectedOfferKey: candidates[selected]?.key ?? null, qty, note: notes, verified: true });
      onToast("Match confirmed");
    } else {
      onToast("Match confirmed");
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
              <strong>{row.matchName || row.importedName}</strong>
              <small>{row.importedName}</small>
              <div className="crl-qty-step">
                <span>Qty:</span>
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty((value) => Math.max(1, value - 1))}>−</button>
                <em>{qty} {row.uom}</em>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty((value) => value + 1)}>+</button>
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
            <div className="crl-cand-list">
              {candidates.map((candidate, index) => (
                <label key={candidate.key ?? index} className={`crl-cand ${selected === index ? "active" : ""}`}>
                  <input type="radio" name="crl-cand" checked={selected === index} onChange={() => setSelected(index)} />
                  <ProductThumb image={candidate.image} alt={candidate.name} />
                  <span className="crl-cand-info">
                    <strong>{candidate.name}</strong>
                    <CandidateSub supplier={candidate.supplier} sub={candidate.sub} />
                  </span>
                  <span className="crl-cand-right">
                    <strong>{candidate.price != null ? mrMoney(candidate.price) : "—"}</strong>
                    <span className="crl-cand-tags">
                      {candidate.recommended && <span className="crl-cand-rec">Recommended</span>}
                      {selected === index && !candidate.recommended && <span className="crl-cand-sel">Selected</span>}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <button className="crl-drawer-link" type="button" onClick={() => { setSearching(true); search.setQuery(""); }}><Icon name="icon-search" className="button-icon" />Search for another product</button>
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

// Mobile card list for the current reorder list (replaces the desktop table on
// phones). Stats band + status tabs + tappable product cards.
function MobileReorderList({ title, rows, stats, totalItems, tab, onTab, onOpenRow, onToast, onArchiveList, onClearList, searchTerm = "", onSearchTerm, searchResults = [], searchLoading }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="m-list">
      <div className="m-brandbar">
        <BrandMark />
        <button className="m-iconbtn" type="button" aria-label="Alerts">
          <Icon name="icon-bell" className="button-icon" />
          <span className="m-brand-badge">3</span>
        </button>
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
            onKeyDown={(event) => { if (event.key === "Escape") { onSearchTerm?.(""); event.currentTarget.blur(); } }}
          />
        </label>
        {searchTerm.trim() && (
          <>
            <div className="topbar-search-backdrop" onClick={() => onSearchTerm?.("")} />
            <SearchResults
              results={searchResults}
              loading={searchLoading}
              searchHref={`/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`}
            />
          </>
        )}
      </div>

      <header className="m-topbar">
        <h1>{title}</h1>
        <div className="m-topbar-actions">
          <button className="m-iconbtn" type="button" aria-label="Filters"><Icon name="icon-filter" className="button-icon" /></button>
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
        {[["all", `All ${totalItems}`], ["confirmed", `Verified ${stats.matched}`], ["possible", `Verify ${stats.review}`], ["nomatch", `No match ${stats.notFound}`]].map(([id, label]) => (
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
        ) : rows.map((row) => {
          const notFound = row.status === "Not found";
          return (
            <button className="m-card" type="button" key={row.id} onClick={() => onOpenRow(row)}>
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
                {row.perEa != null && <small>${mrEa(row.perEa)} / ea</small>}
              </span>
              <Icon name="icon-chevron-right" className="button-icon m-card-chev" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Full-screen mobile detail page. Layout follows the mobile mockup; the footer
// actions mirror the desktop MatchPanel (Cancel / Confirm by mode).
function MobileItemDetail({ rows, row, mode, onClose, onOpenRow, onToast, onConfirmMatch, onLinkProduct, onRemoveItem }) {
  const idx = rows.findIndex((r) => r.id === row.id);
  const total = rows.length;
  const isResolve = mode === "resolve";
  const isView = mode === "view";
  // Candidates come from the item's real offers; our recommended (preference-
  // based) pick is floated to the front so it shows in the "Recommended" slot.
  // The radio tracks the buyer's actual selection, which may differ.
  const candidates = isResolve ? [] : (row.offers || []).map((offer) => ({
    key: offer.key,
    name: offer.name,
    supplier: offer.supplier,
    sub: offer.sub,
    price: offer.price,
    perEa: offer.perUnit ?? null,
    image: offer.imageUrl || "",
    recommended: offer.key === row.recommendedOfferKey,
    confidence: offer.key === row.recommendedOfferKey ? row.confidence : Math.max((row.confidence ?? 50) - 10, 40),
  }));
  if (!isResolve && !candidates.length && row.matchName) {
    candidates.push({ key: row.selectedOfferKey || null, name: row.matchName, supplier: row.supplier, sub: row.matchSub, price: row.price, perEa: row.perEa, image: row.image, recommended: true, confidence: row.confidence });
  }
  const recIdx = candidates.findIndex((candidate) => candidate.recommended);
  if (recIdx > 0) candidates.unshift(...candidates.splice(recIdx, 1));
  const initialSel = candidates.findIndex((candidate) => candidate.key === row.selectedOfferKey);
  const [selected, setSelected] = useState(initialSel < 0 ? 0 : initialSel);
  const [notes, setNotes] = useState(row.note || "");
  const [searching, setSearching] = useState(isResolve);
  const search = useProductSearch(searching);
  const confLabel = row.verified ? "Confirmed by you"
    : row.confidence == null ? "No catalog match"
    : row.confidence >= 80 ? "High match confidence"
    : row.confidence >= 50 ? "Medium match confidence"
    : "Low match confidence";

  function confirm() {
    if (row.itemId) {
      onConfirmMatch?.(row.itemId, { selectedOfferKey: candidates[selected]?.key ?? null, qty: row.qty, note: notes, verified: true });
    }
    onToast("Match confirmed");
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
        <div className={`m-conf-banner ${row.verified ? "verified" : row.confidence == null ? "nomatch" : mrConfTone(row.confidence)}`}>
          <span>{confLabel}</span>
          {!row.verified && row.confidence != null && <strong>{row.confidence}%</strong>}
        </div>

        <section className="m-detail-sec">
          <span className="m-detail-label">Imported item</span>
          <strong className="m-detail-name">{row.importedName}</strong>
          <small>{row.importedSub}</small>
          {row.supplier && row.supplier !== "—" && <small>Imported by {row.supplier}</small>}
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
              <label className={`m-match best ${selected === 0 ? "active" : ""}`}>
                <input type="radio" name="m-cand" checked={selected === 0} onChange={() => setSelected(0)} />
                <ProductThumb image={candidates[0].image} alt={candidates[0].name} />
                <span className="m-match-info"><strong>{candidates[0].name}</strong><CandidateSub supplier={candidates[0].supplier} sub={candidates[0].sub} /></span>
                <span className="m-match-right"><em className={`m-conf ${mrConfTone(candidates[0].confidence)}`}>{candidates[0].confidence}%</em><strong>{mrMoney(candidates[0].price)}</strong>{candidates[0].perEa != null && <small>${mrEa(candidates[0].perEa)} / ea</small>}</span>
              </label>
            </section>
            {candidates.length > 1 && (
              <section className="m-detail-sec">
                <span className="m-detail-label">Other possible matches</span>
                {candidates.slice(1).map((candidate, index) => (
                  <label className={`m-match ${selected === index + 1 ? "active" : ""}`} key={candidate.key ?? index + 1}>
                    <input type="radio" name="m-cand" checked={selected === index + 1} onChange={() => setSelected(index + 1)} />
                    <span className="m-match-info"><strong>{candidate.name}</strong><CandidateSub supplier={candidate.supplier} sub={candidate.sub} /></span>
                    <span className="m-match-right"><em className={`m-conf ${mrConfTone(candidate.confidence)}`}>{candidate.confidence}%</em><strong>{mrMoney(candidate.price)}</strong>{candidate.perEa != null && <small>${mrEa(candidate.perEa)} / ea</small>}</span>
                  </label>
                ))}
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
  onRenameList,
  buyerName = "",
  practiceName = "",
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
  onToast,
  listTouched,
  buyingPrefs,
  onBuyingPrefs,
  onArchiveList,
  onClearList,
  onConfirmMatch,
  onLinkProduct,
  onRemoveItem,
  onVerifyItems,
}) {
  const realRows = deriveMatchRows(items, buyingPrefs);
  const usingReal = realRows.length > 0;
  // Show the sample list only for a brand-new, untouched workspace; once the
  // buyer has added (or cleared) items, an empty list reads as truly empty.
  const showSample = !usingReal && !listTouched;
  const isEmpty = !usingReal && listTouched;
  const rows = (usingReal ? realRows : showSample ? matchReviewSample : []).map((row) => ({
    ...row,
    source: row.source || CRL_SAMPLE_SOURCES[row.id] || "pdf",
  }));
  const stats = usingReal ? mrComputeStats(rows) : showSample ? matchReviewSampleStats : mrComputeStats(rows);
  const totalItems = usingReal ? rows.length : showSample ? stats.total : 0;
  const [tab, setTab] = useState("all");
  const [detail, setDetail] = useState(null);
  const [detailWide, setDetailWide] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
    const total = rows.reduce((sum, row) => sum + (row.lineTotal || 0), 0);
    const suppliers = new Set(rows.map((row) => row.supplier).filter((name) => name && name !== "—"));
    const coverage = rows.length ? Math.round((stats.matched / rows.length) * 100) : 0;
    return { total, suppliers: suppliers.size, coverage };
  }, [rows, stats]);

  const tabFilter = {
    all: () => true,
    possible: (row) => row.status === "Review",
    confirmed: (row) => row.status === "Matched",
    nomatch: (row) => row.status === "Not found",
  };
  const filtered = rows.filter(tabFilter[tab] || tabFilter.all);
  const openRow = (row) => setDetail({ row, mode: rowMode(row) });

  // Bulk selection — keyed by stable item id so it survives tab/sort changes.
  // Only real (persisted) rows are selectable; sample rows have no itemId.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectableIds = filtered.filter((row) => row.itemId).map((row) => row.itemId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const toggleSelect = (itemId) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    return next;
  });
  const toggleSelectAll = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allSelected) selectableIds.forEach((id) => next.delete(id));
    else selectableIds.forEach((id) => next.add(id));
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const [rowMenu, setRowMenu] = useState(null);
  function bulkVerify() {
    // Only matched/review rows can be verified — skip selected No-Match items.
    const ids = rows.filter((row) => row.itemId && selectedIds.has(row.itemId) && row.status !== "Not found").map((row) => row.itemId);
    onVerifyItems?.(ids);
    onToast(ids.length ? `${ids.length} match${ids.length === 1 ? "" : "es"} verified` : "Nothing to verify in your selection");
    clearSelection();
  }
  function bulkRemove() {
    const n = selectedCount;
    selectedIds.forEach((id) => onRemoveItem?.(id));
    onToast(`${n} item${n === 1 ? "" : "s"} removed`);
    clearSelection();
  }

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
          searchTerm={searchTerm}
          onSearchTerm={onSearchTerm}
          searchResults={searchResults}
          searchLoading={searchLoading}
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
            <input
              className="crl-listname crl-listname-input"
              value={listName}
              onChange={(event) => onRenameList?.(event.target.value)}
              aria-label="Reorder list name"
              style={{ font: "inherit", color: "inherit", border: "none", background: "transparent", padding: 0, width: `${Math.max(listName.length, 8)}ch` }}
            />
            <span className="crl-dot" aria-hidden="true">·</span>
            <span className="crl-autosave"><Icon name="icon-check-circle" className="button-icon" />Auto saved just now</span>
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
            className="crl-add-btn"
            onClick={() => onAddMode("upload")}
          >
            <Icon name="icon-cloud-upload" className="button-icon" />
            Upload Invoice
          </button>
          <div className="crl-more-wrap">
            <button className="crl-more crl-more-kebab" type="button" aria-haspopup="menu" aria-expanded={moreOpen} aria-label="More actions" onClick={() => setMoreOpen((open) => !open)}>
              <svg className="crl-kebab-dots" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
            </button>
            {moreOpen && (
              <>
                <div className="crl-add-menu-backdrop" onClick={() => setMoreOpen(false)} />
                <div className="crl-add-menu crl-more-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onArchiveList(); }}>
                    <Icon name="icon-clipboard" className="button-icon" />
                    <span><strong>Archive this list</strong><small>Move to list history</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onClearList(); }}>
                    <Icon name="icon-trash" className="button-icon crl-menu-danger" />
                    <span><strong>Clear this list</strong><small>Remove all items</small></span>
                  </button>
                </div>
              </>
            )}
          </div>
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
                    autoFocus
                  />
                </label>
                {searchTerm.trim() && (
                  <SearchResults results={searchResults} loading={searchLoading} searchHref={`/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`} />
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
              <div className="crl-tabs-actions">
                <button className="crl-ghost-btn" type="button"><Icon name="icon-filter" className="button-icon" />Filters</button>
                <button className="crl-ghost-btn" type="button"><Icon name="icon-shuffle" className="button-icon" />Sort <Icon name="icon-chevron-down" className="button-icon" /></button>
              </div>
            </div>

            {selectedCount > 0 && (
              <div className="crl-bulk-bar" role="region" aria-label="Bulk actions">
                <span className="crl-bulk-count">{selectedCount} selected</span>
                <span className="crl-bulk-actions">
                  <button type="button" className="crl-bulk-btn" onClick={bulkVerify}><Icon name="icon-check-circle" className="button-icon" />Verify</button>
                  <button type="button" className="crl-bulk-btn danger" onClick={bulkRemove}><Icon name="icon-trash" className="button-icon" />Remove from list</button>
                </span>
                <button type="button" className="crl-bulk-dismiss" aria-label="Clear selection" onClick={clearSelection}><Icon name="icon-x" className="button-icon" /></button>
              </div>
            )}

            <div className="crl-table">
              <div className="crl-row crl-row-head">
                <span><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleSelectAll} disabled={!selectableIds.length} /></span>
                <span>Item</span>
                <span>Source</span>
                <span>Status</span>
                <span>Qty</span>
                <span>Matched product</span>
                <span className="crl-price-h">Price <Icon name="icon-info" className="button-icon" /></span>
                <span>Actions</span>
              </div>
              {isEmpty && (
                <div className="crl-empty">
                  <Icon name="icon-cloud-upload" className="button-icon" />
                  <strong>Your reorder list is empty</strong>
                  <p>Upload an invoice (PDF or CSV) or scan a barcode to start matching items to the best supplier.</p>
                  <button className="primary-action compact" type="button" onClick={() => onAddMode("upload")}>
                    <Icon name="icon-cloud-upload" className="button-icon" />Upload invoice
                  </button>
                </div>
              )}
              {filtered.map((row) => {
                const status = row.verified ? CRL_STATUS.Verified : CRL_STATUS[row.status];
                const notFound = row.status === "Not found";
                const mode = notFound ? "resolve" : row.status === "Review" ? "review" : "view";
                const actionLabel = notFound ? "Resolve" : row.status === "Review" ? "Verify" : "View";
                return (
                  <div className={`crl-row crl-row-click ${detail?.row.id === row.id ? "active" : ""}`} key={row.id} onClick={() => setDetail({ row, mode })}>
                    <span><input type="checkbox" aria-label={`Select ${row.importedName}`} checked={row.itemId ? selectedIds.has(row.itemId) : false} disabled={!row.itemId} onChange={() => row.itemId && toggleSelect(row.itemId)} onClick={(event) => event.stopPropagation()} /></span>
                    <span className="crl-item">
                      <ProductThumb image={row.image} alt={row.canonicalName || row.importedName} />
                      <span className="crl-item-id">
                        <strong>{row.canonicalName || row.importedName}</strong>
                        <small>{row.canonicalName ? `From source: ${row.importedName}` : `SKU on source: ${(row.importedSub || "").replace(/^SKU:\s*/, "") || "—"}`}</small>
                      </span>
                    </span>
                    <span className="crl-source" title={`Imported from ${row.source.toUpperCase()}`}><Icon name={CRL_SOURCE_ICON[row.source] || "icon-file-text"} className="button-icon" /></span>
                    <span className="crl-status-cell">
                      <span className={`crl-status ${status.cls}`}><Icon name={status.icon} className="button-icon" />{status.label}</span>
                      {row.verified
                        ? <small className="crl-conf verified">Confirmed by you</small>
                        : row.confidence != null && <small className={`crl-conf ${mrConfTone(row.confidence)}`}>{row.confidence}% confidence</small>}
                    </span>
                    <span className="crl-qty"><strong>{row.qty}</strong><small>{row.uom}</small></span>
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
                          {row.perEa != null && <small>${mrEa(row.perEa)} / ea</small>}
                        </>
                      )}
                    </span>
                    <span className="crl-actions">
                      <button className={`crl-action-btn ${notFound ? "danger" : row.status === "Review" ? "warn" : ""}`} type="button" onClick={() => setDetail({ row, mode })}>{actionLabel}</button>
                      <span className="crl-rowmenu-wrap">
                        <button className="crl-kebab" type="button" aria-label="Row actions" aria-haspopup="menu" aria-expanded={rowMenu === row.id} onClick={(event) => { event.stopPropagation(); setRowMenu(rowMenu === row.id ? null : row.id); }}><Icon name="icon-list" className="button-icon" /></button>
                        {rowMenu === row.id && row.itemId && (
                          <>
                            <div className="crl-add-menu-backdrop" onClick={(event) => { event.stopPropagation(); setRowMenu(null); }} />
                            <div className="crl-add-menu crl-rowmenu" role="menu" onClick={(event) => event.stopPropagation()}>
                              {notFound ? (
                                <button type="button" role="menuitem" onClick={() => { setRowMenu(null); setDetail({ row, mode }); }}><Icon name="icon-search" className="button-icon" /><span>Resolve match</span></button>
                              ) : (
                                <>
                                  {!row.verified && (
                                    <button type="button" role="menuitem" onClick={() => { setRowMenu(null); onConfirmMatch?.(row.itemId, { verified: true }); onToast("Match verified"); }}><Icon name="icon-check-circle" className="button-icon" /><span>Verify match</span></button>
                                  )}
                                  <button type="button" role="menuitem" onClick={() => { setRowMenu(null); setDetail({ row, mode }); }}><Icon name="icon-edit" className="button-icon" /><span>Change match</span></button>
                                </>
                              )}
                              <button type="button" role="menuitem" className="crl-rowmenu-danger" onClick={() => { setRowMenu(null); onRemoveItem?.(row.itemId); onToast("Item removed from list"); }}><Icon name="icon-trash" className="button-icon" /><span>Remove from list</span></button>
                            </div>
                          </>
                        )}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="crl-foot">
              <span className="crl-foot-count">Showing 1 to {Math.min(7, filtered.length)} of {totalItems} items</span>
              <button className="crl-ghost-btn" type="button">Load more <Icon name="icon-chevron-down" className="button-icon" /></button>
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
              <div className="crl-plan">
                <div><span>Estimated total</span><strong>{money.format(planSummary.total)}</strong></div>
                <div><span>Suppliers</span><strong>{planSummary.suppliers}</strong></div>
                <div><span>Coverage</span><strong>{planSummary.coverage}%</strong></div>
                <div><span>Items</span><strong>{totalItems}</strong></div>
              </div>
            ) : (
              <div className="crl-plan">
                <div><span>Estimated total</span><strong>$5,842.16</strong></div>
                <div><span>Suppliers</span><strong>5</strong></div>
                <div><span>Coverage</span><strong>92%</strong></div>
                <div><span>Potential savings</span><strong className="green">$842.15</strong></div>
              </div>
            )}
            <button className="crl-plan-btn" type="button" onClick={() => onToast("Procurement plan coming next")}>Open procurement plan <Icon name="icon-arrow-right" className="button-icon" /></button>
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
              <span className="confirmed"><strong>{matched}</strong>Verified</span>
              <span className="possible"><strong>{review}</strong>Verify</span>
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

const ARCHIVED_LISTS = [
  { id: "june-restock", name: "June Restock", date: "Jun 2, 2025", items: 124, suppliers: 5, total: "$5,842.16" },
  { id: "may-hygiene", name: "May Hygiene Reorder", date: "May 9, 2025", items: 86, suppliers: 4, total: "$3,217.40" },
  { id: "april-ortho", name: "April Ortho Supplies", date: "Apr 14, 2025", items: 52, suppliers: 3, total: "$1,905.00" },
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
            <span className="history-total">{list.total}</span>
            <Icon name="icon-chevron-right" className="button-icon history-chev" />
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryDetail({ id, onBack, archivedLists = [] }) {
  const lists = [...archivedLists, ...ARCHIVED_LISTS];
  const list = lists.find((entry) => entry.id === id) || lists[0];
  const rows = list?.rows || [];
  return (
    <div className="crl">
      <header className="crl-header">
        <div className="crl-title">
          <button className="history-back" type="button" onClick={onBack}><Icon name="icon-chevron-left" className="button-icon" />History</button>
          <h2>{list.name}</h2>
          <span className="history-archived-pill">Archived</span>
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
                  {notFound ? <span className="crl-dash">—</span> : (<><strong>{mrMoney(row.price)}</strong>{row.perEa != null && <small>${mrEa(row.perEa)} / ea</small>}</>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="history-detail-note">This reorder list is archived and read-only. Reopen or duplicate it to start a new reorder, or revisit the supplier handoff.</p>
      <div className="history-detail-actions">
        <button className="primary-action compact" type="button">Reopen list</button>
        <button className="secondary-action compact" type="button">Duplicate</button>
        <button className="secondary-action compact" type="button">View handoff</button>
      </div>
    </div>
  );
}

const SETTINGS_TABS = [
  ["profile", "Profile"],
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
