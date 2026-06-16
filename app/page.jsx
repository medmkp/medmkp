"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const PROCESSING_DURATION_MS = 3000;
const suppliers = [
  { name: "Dental City", signal: "Public catalog · commodity dental supplies" },
  { name: "Net32", signal: "Price benchmarks · dental marketplace data" },
  { name: "Henry Schein", signal: "Current invoice vendor · account pricing" },
  { name: "Darby Dental", signal: "Dental distributor · catalog refresh pending" },
  { name: "Safco Dental", signal: "Consumables and operatory supply alternatives" },
];

const orderSteps = [
  { label: "Invoice uploaded", detail: "Buyer sent current supplier invoice" },
  { label: "Draft order", detail: "Line items normalized for reorder" },
  { label: "Buyer review", detail: "Clinic confirms quantities and substitutions" },
  { label: "PO sent", detail: "Supplier orders placed" },
  { label: "Supplier confirmed", detail: "Awaiting confirmations" },
  { label: "Shipped", detail: "Tracking pending" },
  { label: "Reorder reminder", detail: "Scheduled for 30 days" },
];

const uploadStepRoutes = {
  upload: "/add-items",
  recommendation: "/add-items/recommendations",
  savings: "/add-items/savings",
};

const routeByView = {
  landing: "/dashboard",
  upload: "/add-items",
  catalog: "/catalog",
  admin: "/admin",
  quote: "/quotes",
  quoteBuilder: "/quotes/Q-2024-0517/build",
  approval: "/quotes/Q-2024-0517/review",
  order: "/orders",
  orderDetail: "/orders/ORD-20481",
  supplier: "/suppliers",
  settings: "/settings",
};

function viewFromPath(pathname = "/") {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return { view: "landing", isLoggedIn: false };
  if (path === "/dashboard") return { view: "landing", isLoggedIn: true };
  if (path === "/add-item") return { view: "upload", isLoggedIn: true, uploadStep: "upload", mobileAddItemRoute: true };
  if (path === "/add-items") return { view: "upload", isLoggedIn: true, uploadStep: "upload", mobileAddItemRoute: true };
  if (path === "/add-items/review") return { view: "upload", isLoggedIn: true, uploadStep: "upload" };
  if (path === "/add-items/recommendations") return { view: "upload", isLoggedIn: true, uploadStep: "recommendation" };
  if (path === "/add-items/savings") return { view: "upload", isLoggedIn: true, uploadStep: "savings" };
  if (path === "/catalog") return { view: "catalog", isLoggedIn: true };
  if (path === "/admin") return { view: "admin", isLoggedIn: true };
  if (path === "/quotes") return { view: "quote", isLoggedIn: true };
  if (path.startsWith("/quotes/") && path.endsWith("/review")) return { view: "approval", isLoggedIn: true };
  if (path.startsWith("/quotes/") && path.endsWith("/build")) return { view: "quoteBuilder", isLoggedIn: true };
  if (path === "/orders") return { view: "order", isLoggedIn: true };
  if (path.startsWith("/orders/")) return { view: "orderDetail", isLoggedIn: true };
  if (path === "/suppliers") return { view: "supplier", isLoggedIn: true };
  if (path === "/settings") return { view: "settings", isLoggedIn: true };

  return { view: "landing", isLoggedIn: true };
}

function pathForView(view) {
  return routeByView[view] || "/dashboard";
}

function statusClass(status) {
  if (status === "Parsed") return "success";
  if (status === "Alternative" || status === "Needs review" || status === "No match") return "warning";
  return "info";
}

function sumSelected(lineItems) {
  return lineItems.reduce((total, item) => total + item.selected.total, 0);
}

function sumPrevious(lineItems) {
  return lineItems.reduce((total, item) => total + item.oldUnitPrice * item.qty, 0);
}

function recommendationLabel(matchType) {
  if (matchType === "exact") return "Exact match";
  if (matchType === "equivalent") return "Equivalent match";
  if (matchType === "substitute") return "Better-value substitute";
  if (matchType === "unmatched") return "No catalog match";
  return "Needs decision";
}

function recommendationClass(matchType) {
  if (matchType === "needs_review" || matchType === "unmatched") return "warning";
  if (matchType === "substitute" || matchType === "equivalent") return "info";
  return "success";
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
      <symbol id="icon-truck" viewBox="0 0 24 24">
        <path d="M2.5 7.5h11v9H2.5Z" />
        <path d="M13.5 10.5h4l3 3v3H13.5Z" />
        <path d="M7 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM17 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
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
    let detector = null;
    let done = false;

    function finish(code) {
      if (done) return;
      done = true;
      window.clearInterval(intervalId);
      if (navigator.vibrate) navigator.vibrate(60);
      onScanRef.current?.(code || null);
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
    // decoded so the manual capture path always advances the flow.
    captureRef.current = async () => {
      if (done) return;
      finish(await detectFrame());
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

        if ("BarcodeDetector" in window) {
          try {
            detector = new window.BarcodeDetector();
            setAutoDetect(true);
            intervalId = window.setInterval(async () => {
              const code = await detectFrame();
              if (code) finish(code);
            }, 350);
          } catch (error) {
            detector = null;
          }
        }
      } catch (error) {
        setCameraStatus("denied");
      }
    }

    openCamera();

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      stream?.getTracks().forEach((track) => track.stop());
      captureRef.current = () => {};
    };
  }, [active]);

  const capture = useCallback(() => captureRef.current(), []);
  return { videoRef, cameraStatus, autoDetect, capture };
}

function MobileScanItemView({ onBack, onScan }) {
  const [isMobile, setIsMobile] = useState(false);
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    setIsMobile(window.matchMedia("(max-width: 767px)").matches);
  }, []);

  const { videoRef, cameraStatus, autoDetect, capture } = useBarcodeScanner({
    active: isMobile,
    onScan: (code) => {
      setCaptured(true);
      window.setTimeout(() => onScan?.(code), 650);
    },
  });

  return (
    <section className="mobile-scan-screen" aria-labelledby="mobileScanHeading">
      <header className="mobile-scan-header">
        <button className="mobile-scan-icon-button back" type="button" onClick={onBack} aria-label="Back to add items">
          <Icon name="icon-chevron-right" className="mobile-scan-icon" />
        </button>
        <h1 id="mobileScanHeading">Scan Item</h1>
        <button className="mobile-scan-icon-button" type="button" aria-label="Help">
          <span aria-hidden="true">?</span>
        </button>
      </header>

      <nav className="mobile-scan-tabs" aria-label="Add item method">
        <button className="active" type="button">
          <Icon name="icon-scan" className="mobile-tab-icon" />
          Scan Barcode
        </button>
        <button type="button">
          <Icon name="icon-image" className="mobile-tab-icon" />
          Photo
        </button>
        <button type="button">
          <Icon name="icon-plus-circle" className="mobile-tab-icon" />
          Manual Add
        </button>
      </nav>

      <div className={`mobile-camera-stage ${captured ? "scan-captured" : ""}`}>
        <video ref={videoRef} className="mobile-camera-video" playsInline muted autoPlay aria-label="Live camera preview"></video>
        {cameraStatus !== "ready" && (
          <div className="camera-permission-state">
            <Icon name="icon-scan" className="mobile-control-icon" />
            <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
            <p>
              {cameraStatus === "requesting"
                ? "Allow camera access to scan item barcodes."
                : "Enable camera permissions for this site, or use Photo or Manual Add."}
            </p>
          </div>
        )}
        <div className="scan-instruction">
          {captured
            ? "Barcode captured"
            : autoDetect
              ? "Point at a barcode — we capture it automatically"
              : "Align barcode in the frame, then tap to scan"}
        </div>
        <div className="scan-frame" aria-hidden="true">
          <span className="corner top-left"></span>
          <span className="corner top-right"></span>
          <span className="corner bottom-left"></span>
          <span className="corner bottom-right"></span>
          <span className="scan-line"></span>
        </div>
        <div className="camera-actions" aria-label="Camera controls">
          <button type="button" aria-label="Toggle flashlight">
            <Icon name="icon-bolt" className="mobile-control-icon" />
          </button>
          <button className="shutter" type="button" aria-label="Scan item" onClick={capture} disabled={cameraStatus !== "ready" || captured}></button>
          <button type="button" aria-label="Open photo library">
            <Icon name="icon-image" className="mobile-control-icon" />
          </button>
        </div>
      </div>

      <section className="recognized-sheet" aria-labelledby="recognizedHeading">
        <div className="recognized-heading">
          <span className="recognized-check">
            <Icon name="icon-check-circle" className="mobile-control-icon" />
          </span>
          <div>
            <h2 id="recognizedHeading">Item recognized</h2>
            <p>We found a match in your catalog.</p>
          </div>
          <button className="edit-match" type="button">
            Edit
            <Icon name="icon-edit" className="mobile-edit-icon" />
          </button>
        </div>

        <article className="recognized-card">
          <div className="recognized-product">
            <div className="microbrush-thumb" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </div>
            <h3>Microbrush Regular Superfine Blue<br /><span>100/Bag</span></h3>
          </div>
          <dl className="recognized-meta">
            <div><dt>Supplier</dt><dd>Henry Schein</dd></div>
            <div><dt>SKU</dt><dd>MBRREG-BLU-100</dd></div>
            <div><dt>UOM</dt><dd>Bag</dd></div>
            <div><dt>Unit Price</dt><dd>$12.45 <span>$0.1245 / ea</span></dd></div>
          </dl>
          <button className="mobile-primary-cta" type="button">
            <Icon name="icon-check-circle" className="mobile-cta-icon" />
            Add to Reorder List
          </button>
          <button className="mobile-secondary-cta" type="button">
            <Icon name="icon-search" className="mobile-cta-icon" />
            View item details
          </button>
          <button className="mobile-ghost-cta" type="button">
            <Icon name="icon-plus" className="mobile-cta-icon" />
            This isn't a match
          </button>
        </article>
      </section>
    </section>
  );
}

function MobileBottomNav({ view, onNavigate, onScan }) {
  const items = [
    ["Dashboard", "icon-home", "landing", view === "landing", ""],
    ["Scan", "icon-scan", "scan", view === "upload", ""],
    ["Reorder List", "icon-file-text", "catalog", view === "catalog", ""],
    ["Notifications", "icon-settings", "settings", false, "3"],
    ["More", "icon-list", "settings", view === "settings", ""],
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile primary navigation">
      {items.map(([label, icon, target, active, badge]) => (
        <button
          key={label}
          className={active ? "active" : ""}
          type="button"
          onClick={() => target === "scan" ? onScan() : onNavigate(target)}
        >
          <span>
            <Icon name={icon} className="mobile-bottom-icon" />
            {badge && <b>{badge}</b>}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

function LoggedOutLanding({ onEnter }) {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#" aria-label="MedMKP home">
          <BrandMark />
        </a>
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#what-you-get">What you get</a>
          <button type="button" onClick={() => onEnter("supplier")}>For dental offices</button>
        </nav>
        <div className="landing-nav-actions">
          <button className="secondary-action compact" type="button" onClick={() => onEnter("upload")}>Enter SKU</button>
          <button className="primary-action compact" type="button" onClick={() => onEnter("upload")}>
            <Icon name="icon-scan" className="button-icon" />
            Scan an item
          </button>
        </div>
      </header>

      <section className="landing-main">
        <div className="landing-col-left">
          <div className="landing-copy">
            <h1>Scan your dental supplies and spot <span>possible savings</span> in seconds</h1>
            <p>Point your phone at a barcode or enter a SKU to identify the item, compare typical price ranges, and save it to a free starter reorder list. No login required to try it.</p>
            <div className="landing-actions">
              <button className="primary-action" type="button" onClick={() => onEnter("upload")}>
                <Icon name="icon-scan" className="button-icon" />
                Scan 1 item free
              </button>
              <button className="secondary-action" type="button" onClick={() => onEnter("upload")}>
                <Icon name="icon-play" className="button-icon" />
                See sample result
              </button>
            </div>
            <div className="landing-assurances">
              <span><Icon name="icon-lock" className="button-icon" />No login</span>
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
                <button className="primary-action" type="button" onClick={() => onEnter("upload")}>
                  <Icon name="icon-cloud-upload" className="button-icon" />
                  Start free
                </button>
                <button className="secondary-action" type="button" onClick={() => onEnter("supplier")}>
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

export default function Home() {
  const uploadFormRef = useRef(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [view, setViewState] = useState("landing");
  const [menuOpen, setMenuOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [orderStep, setOrderStep] = useState(1);
  const [toast, setToast] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDraggingInvoice, setIsDraggingInvoice] = useState(false);
  const [selectedInvoiceName, setSelectedInvoiceName] = useState("");
  const [hasUploadedInvoice, setHasUploadedInvoice] = useState(false);
  const [uploadRailCollapsed, setUploadRailCollapsed] = useState(false);
  const [uploadItemsEditMode, setUploadItemsEditMode] = useState(false);
  const [neededByDate, setNeededByDate] = useState("");
  const [uploadStep, setUploadStep] = useState("upload");
  const [mobileAddItemRoute, setMobileAddItemRoute] = useState(false);
  const [addItemsTab, setAddItemsTab] = useState("upload");
  const [addItemsStep, setAddItemsStep] = useState("add");
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [catalogSource, setCatalogSource] = useState("loading");
  const [searchTerm, setSearchTerm] = useState("");
  const [canonicalResults, setCanonicalResults] = useState([]);
  const [canonicalSource, setCanonicalSource] = useState("idle");

  useEffect(() => {
    function syncViewFromLocation() {
      const nextRoute = viewFromPath(window.location.pathname);
      setIsLoggedIn(nextRoute.isLoggedIn);
      setViewState(nextRoute.view);
      setMobileAddItemRoute(Boolean(nextRoute.mobileAddItemRoute));
      if (nextRoute.view === "upload") {
        const step = nextRoute.uploadStep || "upload";
        setUploadStep(step);
      }
      setMenuOpen(false);
    }

    syncViewFromLocation();
    window.addEventListener("popstate", syncViewFromLocation);

    return () => window.removeEventListener("popstate", syncViewFromLocation);
  }, []);

  useEffect(() => {
    fetch("/api/requests")
      .then((response) => response.json())
      .then(({ requests: nextRequests }) => {
        setRequests(nextRequests);
        setSelectedRequestId(nextRequests[0]?.id || null);
      });
  }, []);

  useEffect(() => {
    fetch("/api/catalog")
      .then((response) => response.json())
      .then(({ categories, source }) => {
        setCatalog(categories || []);
        setCatalogSource(source || "unknown");
      })
      .catch(() => {
        setCatalog([]);
        setCatalogSource("unavailable");
      });
  }, []);

  useEffect(() => {
    const query = searchTerm.trim();
    if (!query) {
      setCanonicalResults([]);
      setCanonicalSource("idle");
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/canonical-products?q=${encodeURIComponent(query)}&limit=5`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then(({ canonical_products: products, source }) => {
          setCanonicalResults(products || []);
          setCanonicalSource(source || "fallback");
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          setCanonicalResults([]);
          setCanonicalSource("fallback");
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm]);

  useEffect(() => {
    if (!uploading) {
      setUploadProgress(0);
      return undefined;
    }

    setUploadProgress(12);
    const steps = [
      [600, 34],
      [1300, 62],
      [2200, 88],
      [2950, 100],
    ];
    const timers = steps.map(([delay, progress]) => {
      return window.setTimeout(() => setUploadProgress(progress), delay);
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [uploading]);

  useEffect(() => {
    if (view !== "upload" || uploadStep === "upload" || uploadedDocs.length) return;
    setUploadStep("upload");
    window.history.replaceState({}, "", uploadStepRoutes.upload);
  }, [view, uploadStep, uploadedDocs]);

  const selectedRequest = useMemo(() => {
    return requests.find((request) => request.id === selectedRequestId) || requests[0];
  }, [requests, selectedRequestId]);

  const lineItems = selectedRequest?.lineItems || [];
  const quoteTotal = sumSelected(lineItems);
  const previousTotal = sumPrevious(lineItems);
  const savings = Math.max(previousTotal - quoteTotal, 0);
  const visibleDraftItems = draftItems.filter((item) => item.documentIds.some((documentId) => uploadedDocs.some((doc) => doc.id === documentId)));
  const activeDraftItems = visibleDraftItems.filter((item) => item.included);
  const draftTotal = activeDraftItems.reduce((total, item) => total + item.draftQty * item.selected.unitPrice, 0);
  const draftPreviousTotal = activeDraftItems.reduce((total, item) => total + item.draftQty * item.oldUnitPrice, 0);
  const draftSavings = Math.max(draftPreviousTotal - draftTotal, 0);
  const recommendationStats = {
    matchedItems: visibleDraftItems.filter((item) => item.recommendation?.matchType !== "unmatched").length,
    exactMatches: visibleDraftItems.filter((item) => item.recommendation?.matchType === "exact").length,
    substitutions: visibleDraftItems.filter((item) => ["equivalent", "substitute"].includes(item.recommendation?.matchType)).length,
    needsReview: visibleDraftItems.filter((item) => ["needs_review", "unmatched"].includes(item.recommendation?.matchType)).length,
    averageConfidence: visibleDraftItems.length
      ? Math.round(visibleDraftItems.reduce((total, item) => total + (item.recommendation?.confidence || 0), 0) / visibleDraftItems.length * 100)
      : 0,
    offersCompared: visibleDraftItems.reduce((total, item) => total + (item.recommendation?.offers?.length || 0), 0),
  };
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
  const catalogViewItems = normalizedSearch ? catalogMatches : catalog;
  const searchResults = useMemo(() => {
    if (canonicalSource === "medusa") {
      return canonicalResults.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        supplier_name: product.best_offer?.supplier_name,
        unit_price_cents: product.best_offer?.price_cents,
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
        unit_price_cents: item.unit_price_cents,
        handle: "",
      };
    });
  }, [canonicalResults, canonicalSource, catalogMatches]);

  function setView(nextView, options = {}) {
    setViewState(nextView);
    setMobileAddItemRoute(false);
    setMenuOpen(false);
    const nextPath = nextView === "upload"
      ? uploadStepRoutes[uploadStep] || uploadStepRoutes.upload
      : pathForView(nextView);
    if (window.location.pathname !== nextPath) {
      const historyMethod = options.replace ? "replaceState" : "pushState";
      window.history[historyMethod]({}, "", nextPath);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openMobileScan() {
    setViewState("upload");
    setUploadStep("upload");
    setMobileAddItemRoute(true);
    setMenuOpen(false);
    if (window.location.pathname !== "/add-items") {
      window.history.pushState({}, "", "/add-items");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToMatchReview() {
    setMobileAddItemRoute(false);
    setViewState("upload");
    setAddItemsStep("match");
    setMenuOpen(false);
    if (window.location.pathname !== "/add-items") {
      window.history.pushState({}, "", "/add-items");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleScanComplete(code) {
    showToast(code ? `Scanned barcode ${code}` : "Item scanned");
    goToMatchReview();
  }

  function goToUploadStep(step) {
    setUploadStep(step);
    const nextPath = uploadStepRoutes[step] || uploadStepRoutes.upload;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function enterBuyerPortal(nextView = "landing") {
    setIsLoggedIn(true);
    setView(nextView);
  }

  function goToLanding() {
    setIsLoggedIn(false);
    setViewState("landing");
    setMenuOpen(false);
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2200);
  }

  function uploadInvoiceFile(fileInput, file) {
    if (!file || !fileInput || !uploadFormRef.current || uploading) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Upload a PDF invoice for this demo");
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

    setUploading(true);
    const startedAt = Date.now();
    const response = await fetch("/api/requests", {
      method: "POST",
      body: formData,
    });
    await wait(Math.max(PROCESSING_DURATION_MS - (Date.now() - startedAt), 0));

    if (!response.ok) {
      setUploading(false);
      const body = await response.json().catch(() => ({}));
      showToast(body.error || "Upload failed");
      return;
    }

    const { request } = await response.json();
    const documentId = request.id;
    setRequests((current) => [request, ...current]);
    setSelectedRequestId(request.id);
    setHasUploadedInvoice(true);
    setUploadItemsEditMode(false);
    setAddItemsStep("match");
    goToUploadStep("upload");
    setUploadedDocs((docs) => [
      ...docs,
      {
        id: documentId,
        name: request.sourceFileName,
        itemCount: request.lineItems.length,
      },
    ]);
    setDraftItems((items) => {
      const byProduct = new Map(items.map((item) => [item.product, item]));

      request.lineItems.forEach((item) => {
        const existing = byProduct.get(item.product);

        if (existing) {
          const documentQuantities = {
            ...(existing.documentQuantities || {}),
            [documentId]: ((existing.documentQuantities || {})[documentId] || 0) + item.qty,
          };

          byProduct.set(item.product, {
            ...existing,
            draftQty: existing.draftQty + item.qty,
            included: true,
            documentQuantities,
            documentIds: Array.from(new Set([...existing.documentIds, documentId])),
          });
          return;
        }

        byProduct.set(item.product, {
          ...item,
          draftQty: item.qty,
          included: true,
          documentQuantities: { [documentId]: item.qty },
          documentIds: [documentId],
        });
      });

      return Array.from(byProduct.values());
    });
    setOrderStep(1);
    setUploading(false);
    setSelectedInvoiceName("");
    form.reset();
    showToast("Invoice matched. Edit extracted line items.");
  }

  function submitForQuote() {
    if (!hasUploadedInvoice) {
      uploadFormRef.current?.requestSubmit();
      return;
    }

    goToUploadStep("recommendation");
  }

  function updateDraftQty(product, nextQty) {
    setDraftItems((items) => items.map((item) => {
      if (item.product !== product) return item;
      return { ...item, draftQty: Math.max(1, Number(nextQty) || 1) };
    }));
  }

  function updateDraftItem(product, patch) {
    setDraftItems((items) => items.map((item) => {
      if (item.product !== product) return item;
      return { ...item, ...patch };
    }));
  }

  function removeDraftItem(product) {
    setDraftItems((items) => items.map((item) => {
      if (item.product !== product) return item;
      return { ...item, included: false };
    }));
  }

  const navItems = [
    ["landing", "icon-home", "Dashboard"],
    ["upload", "icon-plus-circle", "Add Items"],
    ["matchReview", "icon-search", "Match Review"],
    ["catalog", "icon-list", "Reorder List"],
    ["quote", "icon-cart", "Reorder Run"],
    ["supplier", "icon-truck", "Supplier Handoff"],
    ["order", "icon-chart", "Reports"],
    ["settings", "icon-settings", "Settings"],
  ];

  const reachableSteps = hasUploadedInvoice ? ["add", "match", "complete"] : ["add", "match"];

  if (!isLoggedIn) {
    return (
      <>
        <LoggedOutLanding onEnter={enterBuyerPortal} />
        <IconSprite />
      </>
    );
  }

  return (
    <>
      <div className={`app-shell ${menuOpen ? "menu-open" : ""} ${mobileAddItemRoute ? "mobile-add-item-shell" : ""}`}>
        <header className="app-header app-accountbar">
          <div className="brand-block">
            <button className="brand-home" type="button" onClick={goToLanding} aria-label="MedMKP home">
              <BrandMark />
            </button>
            <button
              className="mobile-menu-button"
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((isOpen) => !isOpen)}
            >
              <span></span><span></span><span></span>
            </button>
          </div>

          <label className="global-search">
            <Icon name="icon-search" className="search-icon" />
            <input
              type="search"
              placeholder="Search canonical products..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </label>
          {normalizedSearch && (
            <SearchResults
              results={searchResults}
              searchHref={`/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`}
            />
          )}
          <button className="icon-button account-bell" type="button" aria-label="Notifications">
            <Icon name="icon-settings" className="button-icon" />
          </button>
          <button className="account-menu" type="button" aria-label="Account menu">
            <span className="avatar">AK</span>
            <span><strong>Alex Kim</strong><small>Buyer</small></span>
            <span aria-hidden="true">⌄</span>
          </button>
        </header>

        <div className="app-body">
        <aside className="sidebar">
          <nav className="nav-tabs" aria-label="Primary navigation">
            {navItems.map(([target, icon, label], index) => {
              const isActive =
                target === "matchReview" ? (view === "upload" && addItemsStep === "match")
                : target === "upload" ? (view === "upload" && addItemsStep !== "match")
                : (view === target || ((view === "quoteBuilder" || view === "approval") && target === "quote") || (view === "orderDetail" && target === "order"));
              const handleClick = () => {
                if (target === "matchReview") { goToMatchReview(); }
                else if (target === "upload") { setView("upload"); setAddItemsStep("add"); }
                else { setView(target); }
              };
              return (
                <button key={`${label}-${index}`} className={`nav-tab ${isActive ? "active" : ""}`} onClick={handleClick}>
                  <Icon name={icon} />
                  <strong>{label}</strong>
                </button>
              );
            })}
          </nav>
        </aside>

        <main>
          {view === "landing" && (
            <section className="view active" aria-labelledby="landingHeading">
              <DashboardPage onNewRequest={() => setView("upload")} />
            </section>
          )}

          {view === "catalog" && (
            <section className="view active" aria-labelledby="catalogPageHeading">
              <CatalogExplorer
                catalog={catalogViewItems}
                source={catalogSource}
                hasSearch={Boolean(normalizedSearch)}
                titleId="catalogPageHeading"
              />
            </section>
          )}

          {view === "upload" && (
            <section className={`view active upload-view ${mobileAddItemRoute ? "mobile-add-item-route" : ""}`} data-testid="upload-view" aria-labelledby="uploadHeading">
              {mobileAddItemRoute && (
                <MobileScanItemView
                  onBack={() => setView("upload")}
                  onScan={handleScanComplete}
                />
              )}
              <div className="desktop-upload-content">
              {addItemsStep === "add" && (
              <>
              <div className="upload-page-heading">
                <div>
                  <h2 id="uploadHeading">Add / Import Items</h2>
                  <p>Bring items into your master reorder list from files, search, or mobile capture.</p>
                </div>
                <button
                  className="secondary-action compact"
                  type="button"
                  onClick={() => setUploadRailCollapsed((isCollapsed) => !isCollapsed)}
                >
                  {uploadRailCollapsed ? "Show details" : "Hide details"}
                </button>
              </div>

                <div className={`upload-workspace ${hasUploadedInvoice ? "has-uploaded-invoice" : "empty-workspace"} ${uploadRailCollapsed ? "rail-collapsed" : ""}`}>
                  <div className="upload-main-col">
                  <WizardStepper current="add" reachable={reachableSteps} onStep={setAddItemsStep} />
                  <nav className="add-items-tabs" aria-label="Add items methods">
                    {[
                      ["upload", "icon-cloud-upload", "Upload"],
                      ["barcode", "icon-scan", "Barcode Scan"],
                    ].map(([id, icon, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`add-items-tab ${addItemsTab === id ? "active" : ""}`}
                        onClick={() => setAddItemsTab(id)}
                      >
                        <Icon name={icon} className="button-icon" />
                        {label}
                      </button>
                    ))}
                  </nav>
                  {addItemsTab === "barcode" ? (
                    <DesktopBarcodeScan onAdd={() => showToast("Added to reorder list")} onScan={handleScanComplete} />
                  ) : (
                  <form ref={uploadFormRef} onSubmit={handleUpload} className={`upload-layout ${hasUploadedInvoice ? "compact-upload" : ""}`}>
                    <div
                      className={`upload-dropzone ${isDraggingInvoice ? "dragging" : ""}`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsDraggingInvoice(true);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setIsDraggingInvoice(false);
                        }
                      }}
                      onDrop={handleInvoiceDrop}
                    >
                      <div className="upload-icon"><Icon name="icon-cloud-upload" /></div>
                      <h3>{uploading ? "Processing invoice..." : isDraggingInvoice ? "Drop your file here" : hasUploadedInvoice ? "Add another invoice" : "Drag and drop files here"}</h3>
                      <p>{uploading ? selectedInvoiceName : selectedInvoiceName || "or"}</p>
                      <span className="select-file-button"><Icon name="icon-cloud-upload" className="button-icon" />Choose files</span>
                      <small>Accepted formats: PDF, CSV, XLSX</small>
                      <small>Max file size: 20MB</small>
                      {uploading && (
                        <div className="processing-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}>
                          <div className="processing-track">
                            <div style={{ width: `${uploadProgress}%` }}></div>
                          </div>
                          <span>{uploadProgress < 45 ? "Reading PDF" : uploadProgress < 80 ? "Matching products" : "Building savings report"}</span>
                        </div>
                      )}
                      <input
                        className="file-input"
                        data-testid="invoice-file-input"
                        name="file"
                        type="file"
                        accept=".pdf,application/pdf"
                        required
                        onChange={(event) => uploadInvoiceFile(event.currentTarget, event.currentTarget.files?.[0])}
                      />
                      <button className="primary-action compact hidden-submit" data-testid="save-parse-request" type="submit" disabled={uploading}>Create Savings Analysis</button>
                      <input type="hidden" name="clinic" value="Northline Dental" />
                      <input type="hidden" name="buyer" value="Alex Kim" />
                      <input type="hidden" name="shippingAddress" value="500 Healthcare Blvd, Nashville, TN" />
                      <input type="hidden" name="preference" value="Exact brand if possible, alternatives allowed" />
                    </div>

                    {!hasUploadedInvoice && (
                      <div className="supported-sources">
                        <h4>Supported sources</h4>
                        <div className="supported-sources-grid">
                          <div className="source-card">
                            <span className="source-logo">
                              <img src="/schein-logo.png" alt="Schein" />
                            </span>
                            <div><strong>Schein</strong><small>Order exports</small></div>
                          </div>
                          <div className="source-card">
                            <span className="source-logo">
                              <svg viewBox="0 0 40 40" aria-hidden="true">
                                <rect x="6" y="6" width="28" height="28" rx="8" fill="#0a5cb8" />
                                <text x="20" y="28" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="22" fontWeight="800" fill="#ffffff">P</text>
                              </svg>
                            </span>
                            <div><strong>Patterson</strong><small>Invoices</small></div>
                          </div>
                          <div className="source-card">
                            <span className="source-logo">
                              <svg viewBox="0 0 72 32" aria-hidden="true">
                                <text x="2" y="24" fontFamily="Arial, Helvetica, sans-serif" fontSize="24" fontWeight="800" letterSpacing="-1.5" fill="#3aaa35">darby</text>
                              </svg>
                            </span>
                            <div><strong>Darby</strong><small>Order history</small></div>
                          </div>
                          <div className="source-card">
                            <span className="source-logo">
                              <svg viewBox="0 0 40 40" aria-hidden="true">
                                <rect x="8" y="6" width="24" height="28" rx="3" fill="#e6f4ea" stroke="#1e9e5a" strokeWidth="2" />
                                <path d="M8 16h24M8 24h24M20 6v28" stroke="#1e9e5a" strokeWidth="2" fill="none" />
                              </svg>
                            </span>
                            <div><strong>Generic CSV</strong><small>Any supplier</small></div>
                          </div>
                        </div>
                      </div>
                    )}

                  </form>
                  )}
                  </div>

                  <aside className="upload-help-rail">
                    <div className="next-card">
                      <h3>What happens next</h3>
                      <div className="next-step"><span><Icon name="icon-cloud-upload" className="button-icon" /></span><div><strong>1. We extract line items</strong><p>Our system reads your file and identifies the items and quantities.</p></div></div>
                      <div className="next-step"><span><Icon name="icon-users" className="button-icon" /></span><div><strong>2. We benchmark prices</strong><p>We compare cached supplier catalogs, snapshots, and reviewed alternatives.</p></div></div>
                      <div className="next-step"><span><Icon name="icon-dollar-circle" className="button-icon" /></span><div><strong>3. You get a savings report</strong><p>Review opportunities and decide what to act on outside MedMKP.</p></div></div>
                    </div>
                    <div className="support-card">
                      <div className="support-card-title"><Icon name="icon-shield-check" className="button-icon" /><strong>Secure & private</strong></div>
                      <p>Your data is encrypted and never shared with suppliers without approval.</p>
                      <span>HIPAA-aware · SOC 2 aligned</span>
                    </div>
                    <div className="support-card">
                      <div><strong>Need help?</strong><p>Our team can help you upload invoices and review savings opportunities.</p><button type="button"><Icon name="icon-headset" className="button-icon" />Contact support</button></div>
                    </div>
                  </aside>
                </div>
              </>
              )}

              {addItemsStep === "match" && (
                <MatchReviewPage
                  items={visibleDraftItems}
                  sourceName={uploadedDocs[0]?.name}
                  stepper={<WizardStepper current="match" reachable={reachableSteps} onStep={setAddItemsStep} />}
                  onContinue={() => setAddItemsStep("complete")}
                />
              )}

              {addItemsStep === "complete" && (
                <CompleteStep
                  items={activeDraftItems}
                  stepper={<WizardStepper current="complete" reachable={reachableSteps} onStep={setAddItemsStep} />}
                  onDone={() => setView("catalog")}
                  onAddMore={() => { setAddItemsStep("add"); setAddItemsTab("upload"); }}
                />
              )}
              </div>
            </section>
          )}

          {view === "admin" && (
            <section className="view active" data-testid="admin-view" aria-labelledby="adminHeading">
              <div className="section-heading first">
                <div>
                  <h2 id="adminHeading">Admin dashboard</h2>
                  <p>Parse buyer uploads, normalize line items, and send RFQs to vetted suppliers.</p>
                </div>
                <button className="primary-action compact" onClick={() => { showToast("RFQs sent to 5 vetted suppliers"); setView("quote"); }}>Send RFQs</button>
              </div>

              <div className="metric-band">
                <div><strong>{lineItems.length || 0}</strong><span>items parsed</span></div>
                <div><strong>5</strong><span>suppliers matched</span></div>
                <div><strong>3</strong><span>exact brand matches</span></div>
                <div><strong>18%</strong><span>target savings</span></div>
              </div>

              <div className="admin-layout">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Canonical Product</th>
                        <th>Extracted From</th>
                        <th>Supplier Outreach</th>
                        <th>Needed By</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item) => (
                        <tr key={item.product}>
                          <td><strong>{item.product}</strong><br /><span>{item.qty} {item.unit}</span></td>
                          <td>{item.extractedFrom}</td>
                          <td>{item.outreach}</td>
                          <td>{item.neededBy}</td>
                          <td><span className={`status-chip ${statusClass(item.status)}`}>{item.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ops-panel">
                  <p className="eyebrow">Supplier Vetting</p>
                  <h3>RFQ shortlist</h3>
                  <div className="supplier-list">
                    {suppliers.map((supplier) => (
                      <div className="supplier-card" key={supplier.name}>
                        <strong>{supplier.name}</strong>
                        <span>{supplier.signal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {view === "quote" && (
            <section className="view active" aria-labelledby="quoteListHeading">
              <QuoteListPage
                quoteTotal={quoteTotal}
                savings={savings}
                hasUploadedQuote={lineItems.length > 0}
                onNewUpload={() => setView("upload")}
                onOpenBuilder={() => setView("quoteBuilder")}
                onReview={() => setView("approval")}
                onViewOrder={() => setView("orderDetail")}
              />
            </section>
          )}

          {view === "quoteBuilder" && (
            <section className="view active quote-builder-view" aria-labelledby="quoteHeading">
              <QuoteBuilderPage
                lineItems={lineItems}
                quoteTotal={quoteTotal}
                previousTotal={previousTotal}
                savings={savings}
                onUploadAnother={() => setView("upload")}
                onPublish={() => {
                  setView("approval");
                  showToast("Quote published to buyer");
                }}
                onSave={() => showToast("Quote saved as draft")}
              />
            </section>
          )}

          {view === "approval" && (
            <section className="view active review-quote-view" aria-labelledby="approvalHeading">
              <ReviewQuotePage
                lineItems={lineItems}
                quoteTotal={quoteTotal}
                previousTotal={previousTotal}
                savings={savings}
                onBack={() => setView("quote")}
                onApprove={() => {
                  setOrderStep(1);
                  showToast("Quote approved. Order placed.");
                  setView("orderDetail");
                }}
                onRevision={() => {
                  showToast("Revision request noted.");
                  setView("quote");
                }}
              />
            </section>
          )}

          {view === "order" && (
            <section className="view active" aria-labelledby="ordersInboxHeading">
              <OrdersInboxPage
                onOpenOrder={() => setView("orderDetail")}
                onNewUpload={() => setView("upload")}
              />
            </section>
          )}

          {view === "orderDetail" && (
            <section className="view active order-detail-view" aria-labelledby="orderHeading">
              <OrderDetailPage
                lineItems={lineItems}
                onDownload={() => showToast("PO download prepared")}
                onReorder={() => setView("upload")}
              />
            </section>
          )}

          {view === "supplier" && (
            <section className="view active" aria-labelledby="supplierHeading">
              <div className="supplier-landing">
                <p className="pill">For Suppliers</p>
                <h2 id="supplierHeading">Help dental practices discover better supply pricing through MedMKP.</h2>
                <p>
                  Supplier onboarding is coming next. For now, this portal will support catalog uploads,
                  pricing evidence, category coverage, and reviewed product matches.
                </p>
                <div className="supplier-actions">
                  <button className="primary-action compact" onClick={() => showToast("Supplier login coming soon")}>
                    Supplier Login
                  </button>
                  <button className="secondary-action compact" onClick={() => setView("landing")}>
                    Back to Buyer Portal
                  </button>
                </div>
                <div className="supplier-feature-grid">
                  <div><Icon name="icon-cloud-upload" className="button-icon" /><strong>Catalog upload</strong><span>CSV, PDF, or portal-assisted SKU intake.</span></div>
                  <div><Icon name="icon-package" className="button-icon" /><strong>Supplier profile</strong><span>Category coverage, certifications, and service lanes.</span></div>
                  <div><Icon name="icon-clipboard" className="button-icon" /><strong>Price snapshots</strong><span>Help practices benchmark savings without MedMKP handling transactions.</span></div>
                </div>
              </div>
            </section>
          )}

          {view === "settings" && (
            <section className="view active" aria-labelledby="settingsHeading">
              <div className="section-heading first">
                <div>
                  <h2 id="settingsHeading">Settings</h2>
                  <p>Manage buyer profile, ordering preferences, and procurement defaults.</p>
                </div>
              </div>
              <div className="settings-grid">
                <div className="ops-panel">
                  <p className="eyebrow">Buyer Profile</p>
                  <h3>Alex Kim</h3>
                  <p>Northline Dental · Operations Director</p>
                </div>
                <div className="ops-panel">
                  <p className="eyebrow">Ordering Defaults</p>
                  <h3>Exact brand if possible</h3>
                  <p>Allow vetted equivalents when they reduce cost and preserve product quality.</p>
                </div>
              </div>
            </section>
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

function RequestPicker({ requests, selectedRequestId, onSelect }) {
  if (!requests.length) return null;

  return (
    <div className="request-picker">
              <label>
        Active request
        <select data-testid="active-request-picker" value={selectedRequestId || ""} onChange={(event) => onSelect(event.target.value)}>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.clinic} · {request.sourceFileName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CatalogExplorer({ catalog, source, hasSearch, titleId = "catalogHeading" }) {
  return (
    <section className="catalog-panel" aria-labelledby={titleId}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Canonical Catalog</p>
          <h2 id={titleId}>{hasSearch ? "Search results" : "Dental reorder categories"}</h2>
          <p>Buyer-facing products are canonical. Supplier-specific SKUs sit underneath as best-value offers.</p>
        </div>
        <span className={`status-chip ${source === "medusa" ? "success" : "warning"}`}>
          {source === "medusa" ? "Medusa live" : "Fallback catalog"}
        </span>
      </div>

      <div className="catalog-grid">
        {catalog.map((category) => {
          const item = category.best_value_item || {};
          const price = typeof item.unit_price_cents === "number"
            ? money.format(item.unit_price_cents / 100)
            : "Price pending";

          return (
            <article className="catalog-card" key={category.id}>
              <div>
                <span className="catalog-category">{category.name}</span>
                <h3>{item.name || category.name}</h3>
              </div>
              <div className="catalog-meta">
                <span>{category.supplier_count || 0} supplier{category.supplier_count === 1 ? "" : "s"}</span>
                <span>{item.inventory_status?.replace("_", " ") || "stock unknown"}</span>
                <span>{item.lead_time_days ? `${item.lead_time_days} days` : "lead time pending"}</span>
              </div>
              <div className="catalog-offer">
                <span>Best value</span>
                <strong>{price}</strong>
              </div>
              <p>{item.supplier_name || "Supplier pending"}</p>
              <Link className="category-link" href={`/catalog/search?category=${encodeURIComponent(category.name)}`}>
                Open category
              </Link>
            </article>
          );
        })}
      </div>

      {!catalog.length && (
        <div className="empty-state">
          <strong>No matching products</strong>
          <span>Try gloves, burs, bibs, impression material, or anesthetics.</span>
        </div>
      )}
    </section>
  );
}

function SearchResults({ results, searchHref }) {
  return (
    <div className="search-results" role="region" aria-label="Catalog search results">
      <div className="search-results-header">
        <strong>{results.length ? "Matching canonical products" : "No catalog matches"}</strong>
        <Link className="search-results-link" href={searchHref}>View catalog</Link>
      </div>
      {results.slice(0, 5).map((result) => {
        const price = typeof result.unit_price_cents === "number"
          ? money.format(result.unit_price_cents / 100)
          : "Price pending";
        const href = result.handle ? `/catalog/${result.handle}` : searchHref;

        return (
          <Link className="search-result" key={result.id} href={href}>
            <span>
              <strong>{result.name}</strong>
              <small>{result.category || "Uncategorized"} · {result.supplier_name || "Supplier pending"}</small>
            </span>
            <em>{price}</em>
          </Link>
        );
      })}
      {!results.length && (
        <p>Try gloves, burs, bibs, impression material, or anesthetics.</p>
      )}
    </div>
  );
}

const dashboardActivity = [
  ["icon-cloud-upload", "Imported order history", "Hygiene", "hygiene", "May Orders.csv · 142 items", "Alex Kim", "1 hour ago"],
  ["icon-scan", "Scanned new product", "Restorative", "restorative", "3M Filtek Easy Match Shade A2", "Sarah J.", "3 hours ago"],
  ["icon-edit", "Updated reorder quantity", "Sterilization", "sterilization", "CaviWipes XL · 2 → 3 each", "Alex Kim", "Yesterday"],
  ["icon-check-circle", "Resolved product match", "Restorative", "restorative", "Bond+ Self Etch → Henry Schein", "Sarah J.", "Yesterday"],
];

const dashboardPriorities = [
  ["icon-list", "blue", "Review 12 unmatched items", "Find supplier matches", "Due May 9"],
  ["icon-cart", "green", "Approve May hygiene reorder", "126 items · Est. $2,485", "Due May 12"],
  ["icon-link", "amber", "Update supplier links for 4 items", "Links expired or missing", "Due May 14"],
  ["icon-tag", "red", "Check price increase on gloves", "2 items with upcoming increases", "Due May 15"],
];

const matchReviewSample = [
  {
    id: 1, importedName: "BIBS, 2PLY, BLUE, 500/BX", importedSub: "SKU: 112-4521",
    supplier: "Henry Schein", matchName: "Patient Bibs 2-Ply Blue", matchSub: "112-4521 · 500/Box",
    confidence: 95, price: 35.20, perEa: 0.070, status: "Matched", qty: 500, uom: "Box", lineTotal: 35.20,
    others: [
      { name: "Patient Bibs 2-Ply Blue", sub: "112-4520 · 250/Box", supplier: "Henry Schein", price: 18.90, perEa: 0.076, confidence: 85 },
      { name: "Patient Bibs 3-Ply Blue", sub: "113-1070 · 500/Box", supplier: "Henry Schein", price: 41.50, perEa: 0.083, confidence: 62 },
    ],
  },
  {
    id: 2, importedName: "Microbrush Superfine", importedSub: "REGULAR, BLUE, 100/BAG",
    supplier: "Henry Schein", matchName: "Microbrush Regular Superfine Blue (100/bag)", matchSub: "100-2604",
    confidence: 88, price: 12.45, perEa: 0.125, status: "Matched", qty: 100, uom: "Bag", lineTotal: 12.45,
    others: [{ name: "Microbrush Superfine Blue", sub: "100-2601 · 100/Bag", supplier: "Henry Schein", price: 11.90, perEa: 0.119, confidence: 71 }],
  },
  {
    id: 3, importedName: "3M Clinpro White", importedSub: "VARNISH 5% SOD FLUORIDE",
    supplier: "3M", matchName: "Clinpro White Varnish", matchSub: "5% Sodium Fluoride, 50/Pack · 12125",
    confidence: 92, price: 64.99, perEa: 1.30, status: "Matched", qty: 50, uom: "Pack", lineTotal: 64.99,
    others: [{ name: "Clinpro 5% Sodium Fluoride Varnish", sub: "12126 · 100/Pack", supplier: "3M", price: 119.00, perEa: 1.19, confidence: 64 }],
  },
  {
    id: 4, importedName: "Kerr OptiBond", importedSub: "ALL-IN-ONE ADHESIVE 5ML",
    supplier: "Henry Schein", matchName: "OptiBond All-In-One Adhesive 5ml", matchSub: "36581",
    confidence: 74, price: 123.10, perEa: 123.10, status: "Review", qty: 1, uom: "Each", lineTotal: 123.10,
    others: [{ name: "OptiBond Universal Adhesive 5ml", sub: "37210", supplier: "Henry Schein", price: 118.50, perEa: 118.50, confidence: 58 }],
  },
  {
    id: 5, importedName: "CaviWipes", importedSub: "DISINFECTING WIPES 160CT",
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

function MatchSupplier({ name }) {
  if (!name || name === "—") return <span className="mr-supplier-none">—</span>;
  const key = name.toLowerCase();
  if (key.includes("schein")) return (<span className="mr-supplier"><img className="mr-supplier-img" src="/schein-logo.png" alt="" /><span>Henry Schein</span></span>);
  if (key.includes("3m")) return <span className="mr-supplier mr-logo-3m">3M</span>;
  if (key.includes("metrex")) return <span className="mr-supplier mr-logo-metrex">Metrex</span>;
  return <span className="mr-supplier">{name}</span>;
}

function deriveMatchRows(items) {
  return (items || []).map((item, index) => {
    const conf = Math.round((item.recommendation?.confidence || 0) * 100);
    const status = item.status === "Parsed" ? "Matched" : item.status === "No match" ? "Not found" : "Review";
    const notFound = status === "Not found";
    const supplier = notFound ? "—" : (item.selected?.supplier || item.oldVendor || "—");
    const price = item.selected?.unitPrice ?? item.oldUnitPrice ?? 0;
    const qty = item.draftQty ?? item.qty ?? 1;
    const others = (item.recommendation?.offers || []).slice(0, 2).map((offer) => ({
      name: offer.name || item.product,
      sub: offer.sku || "",
      supplier: offer.supplier_name || supplier,
      price: (offer.comparable_price_cents ?? 0) / 100,
      perEa: (offer.comparable_price_cents ?? 0) / 100,
      confidence: Math.max(conf - 12, 40),
    }));
    return {
      id: index + 1,
      importedName: item.extractedFrom,
      importedSub: item.sku ? `SKU: ${item.sku}` : (item.unit || ""),
      supplier,
      matchName: notFound ? null : item.product,
      matchSub: notFound ? null : (item.selected?.sku || ""),
      confidence: notFound ? null : conf,
      price: notFound ? null : price,
      perEa: notFound ? null : price,
      status,
      qty,
      uom: item.unit || "ea",
      lineTotal: notFound ? null : (item.selected?.total ?? price * qty),
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

function MatchReviewDetail({ row }) {
  if (row.status === "Not found") {
    return (
      <div className="mr-detail-inner">
        <div className="mr-detail-head">
          <strong>Item #{row.id}</strong>
          <span className={`mr-status ${MR_STATUS[row.status].cls}`}>{MR_STATUS[row.status].label}</span>
          <button className="mr-detail-close" type="button" aria-label="Close"><Icon name="icon-x" className="button-icon" /></button>
        </div>
        <div className="mr-detail-section">
          <span className="mr-detail-label">Imported item</span>
          <strong>{row.importedName}</strong>
          <small>{row.importedSub}</small>
        </div>
        <div className="mr-detail-empty">
          <p>No catalog match found for this item yet. Search the catalog to link it manually.</p>
          <button className="primary-action" type="button">Find a match</button>
        </div>
      </div>
    );
  }
  return (
    <div className="mr-detail-inner">
      <div className="mr-detail-head">
        <strong>Item #{row.id}</strong>
        <span className={`mr-status ${MR_STATUS[row.status].cls}`}>{MR_STATUS[row.status].label}</span>
        <button className="mr-detail-close" type="button" aria-label="Close"><Icon name="icon-x" className="button-icon" /></button>
      </div>
      <div className="mr-detail-section">
        <span className="mr-detail-label">Imported item</span>
        <strong>{row.importedName}</strong>
        <small>{row.importedSub}</small>
      </div>
      <div className="mr-detail-section">
        <span className="mr-detail-label">Supplier</span>
        <strong>{row.supplier === "—" ? "Unknown" : row.supplier}</strong>
      </div>
      <div className="mr-detail-section">
        <div className="mr-detail-label-row"><span className="mr-detail-label">Best match</span><em className={`mr-conf-pill ${mrConfTone(row.confidence)}`}>{row.confidence}%</em></div>
        <div className="mr-best">
          <Icon name="icon-check-circle" className="mr-best-check" />
          <div className="mr-best-body">
            <strong>{row.matchName}</strong>
            <small>{row.matchSub}</small>
            <small>{row.supplier}</small>
          </div>
          <div className="mr-best-price"><strong>{mrMoney(row.price)}</strong><small>${mrEa(row.perEa)} / ea</small></div>
        </div>
      </div>
      {row.others?.length > 0 && (
        <div className="mr-detail-section">
          <span className="mr-detail-label">Other possible matches</span>
          {row.others.map((offer, index) => (
            <label className="mr-other" key={index}>
              <input type="radio" name={`match-${row.id}`} />
              <div className="mr-other-body"><strong>{offer.name}</strong><small>{offer.sub}</small><small>{offer.supplier}</small></div>
              <div className="mr-other-right"><em className={`mr-conf-pill ${mrConfTone(offer.confidence)}`}>{offer.confidence}%</em><strong>{mrMoney(offer.price)}</strong><small>${mrEa(offer.perEa)} / ea</small></div>
            </label>
          ))}
        </div>
      )}
      <div className="mr-detail-section">
        <span className="mr-detail-label">Item details</span>
        <div className="mr-item-details">
          <div><small>Quantity</small><strong>{row.qty}</strong></div>
          <div><small>UOM</small><strong>{row.uom}</strong></div>
          <div><small>Line total</small><strong>{row.lineTotal != null ? mrMoney(row.lineTotal) : "—"}</strong></div>
        </div>
      </div>
      <div className="mr-detail-section">
        <span className="mr-detail-label">Notes (optional)</span>
        <textarea className="mr-notes" placeholder="Add a note..." maxLength={200} />
        <small className="mr-notes-count">0 / 200</small>
      </div>
      <button className="primary-action mr-confirm" type="button">Confirm match</button>
      <button className="secondary-action mr-change" type="button">Change match <Icon name="icon-chevron-down" className="button-icon" /></button>
    </div>
  );
}

const WIZARD_STEPS = [
  ["add", "Add Items"],
  ["match", "Match Review"],
  ["complete", "Complete"],
];

function WizardStepper({ current, reachable, onStep }) {
  const currentIndex = WIZARD_STEPS.findIndex(([id]) => id === current);
  return (
    <div className="mr-stepper wizard-stepper">
      {WIZARD_STEPS.map(([id, label], index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "todo";
        const isCurrent = id === current;
        // Previous steps are always navigable backwards; forward steps only when reachable.
        const canClick = !isCurrent && (index < currentIndex || reachable.includes(id));
        return (
          <button
            key={id}
            type="button"
            className={`mr-step ${state}`}
            disabled={!canClick && !isCurrent}
            aria-current={isCurrent ? "step" : undefined}
            onClick={() => canClick && onStep(id)}
          >
            <span className="mr-step-dot">{state === "done" ? <Icon name="icon-check" className="button-icon" /> : index + 1}</span>
            <span className="mr-step-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DesktopBarcodeScan({ onAdd, onScan }) {
  const [captured, setCaptured] = useState(false);
  const { videoRef, cameraStatus, autoDetect, capture } = useBarcodeScanner({
    active: true,
    onScan: (code) => {
      setCaptured(true);
      window.setTimeout(() => onScan?.(code), 650);
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
        <button className="primary-action" type="button" onClick={onAdd}><Icon name="icon-plus" className="button-icon" />Add to reorder list</button>
        <button className="secondary-action" type="button"><Icon name="icon-search" className="button-icon" />View item details</button>
        <button className="text-action desktop-scan-nomatch" type="button">This isn&rsquo;t a match</button>
      </aside>
    </div>
  );
}

function CompleteStep({ items, stepper, onDone, onAddMore }) {
  const derived = deriveMatchRows(items).filter((r) => r.status !== "Not found");
  const count = derived.length || matchReviewSample.filter((r) => r.status !== "Not found").length;
  return (
    <div className="match-review wizard-step">
      <div className="mr-heading">
        <div>
          <h2>Complete</h2>
          <p>Your items have been added to your master reorder list.</p>
        </div>
      </div>
      {stepper}
      <div className="complete-card">
        <span className="complete-check"><Icon name="icon-check-circle" className="complete-check-icon" /></span>
        <h3>All set!</h3>
        <p>{count} items were added to your master reorder list and are ready for your next reorder run.</p>
        <div className="complete-actions">
          <button className="primary-action" type="button" onClick={onDone}>Go to Reorder List</button>
          <button className="secondary-action" type="button" onClick={onAddMore}>Add more items</button>
        </div>
      </div>
    </div>
  );
}

function MatchReviewPage({ items, sourceName, stepper, onContinue }) {
  const realRows = deriveMatchRows(items);
  const usingReal = realRows.length > 0;
  const rows = usingReal ? realRows : matchReviewSample;
  const source = usingReal ? (sourceName || "your uploaded file") : "INV-2024-0521.pdf";
  const stats = usingReal ? mrComputeStats(rows) : matchReviewSampleStats;

  const [activeTab, setActiveTab] = useState("all");
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? null);
  const [checkedIds, setCheckedIds] = useState(() => new Set(usingReal ? [] : [1]));

  const tabFilter = {
    all: () => true,
    matched: (r) => r.status === "Matched",
    review: (r) => r.status === "Review",
    notfound: (r) => r.status === "Not found",
  };
  const filtered = rows.filter(tabFilter[activeTab]);
  const selected = rows.find((r) => r.id === selectedId) || filtered[0] || rows[0];

  function toggleChecked(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const allChecked = filtered.length > 0 && filtered.every((r) => checkedIds.has(r.id));
  function toggleAll() {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  }

  const confMax = Math.max(stats.high, stats.med, stats.low, 1);

  return (
    <div className="match-review">
      <div className="mr-heading">
        <div>
          <h2 id="matchReviewHeading">Match Review</h2>
          <p>Review and match imported items to your supplier catalog.</p>
        </div>
        <div className="mr-heading-actions">
          <button className="secondary-action compact" type="button">Import summary</button>
          <button className="primary-action compact" type="button" onClick={onContinue}>Continue <Icon name="icon-arrow-right" className="button-icon" /></button>
        </div>
      </div>

      {stepper}

      <div className="mr-stats">
        <div className="mr-stat-card">
          <span className="mr-stat-label">Total items</span>
          <strong className="mr-stat-value">{stats.total}</strong>
          <span className="mr-stat-sub">From {source}</span>
        </div>
        <div className="mr-stat-card">
          <span className="mr-stat-label">Matched</span>
          <strong className="mr-stat-value green">{stats.matched}</strong>
          <span className="mr-stat-sub">{stats.matchedPct}%</span>
        </div>
        <div className="mr-stat-card">
          <span className="mr-stat-label">Needs review</span>
          <strong className="mr-stat-value amber">{stats.review}</strong>
          <span className="mr-stat-sub">{stats.reviewPct}%</span>
        </div>
        <div className="mr-stat-card">
          <span className="mr-stat-label">Not found</span>
          <strong className="mr-stat-value red">{stats.notFound}</strong>
          <span className="mr-stat-sub">{stats.notFoundPct}%</span>
        </div>
        <div className="mr-confidence-card">
          <div className="mr-confidence-head"><span>Match confidence</span><Icon name="icon-info" className="button-icon" /></div>
          {[["High (80-100%)", "high", stats.high], ["Medium (50-79%)", "med", stats.med], ["Low (0-49%)", "low", stats.low]].map(([label, tone, value]) => (
            <div className="mr-conf-row" key={tone}>
              <span>{label}</span>
              <i className="mr-conf-bar"><b className={tone} style={{ width: `${(value / confMax) * 100}%` }} /></i>
              <em>{value}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="mr-layout">
        <div className="mr-table-card">
          <div className="mr-tabs-row">
            <nav className="mr-tabs">
              {[["all", `All items (${rows.length})`], ["matched", `Matched (${stats.matched})`], ["review", `Needs review (${stats.review})`], ["notfound", `Not found (${stats.notFound})`]].map(([id, label]) => (
                <button key={id} type="button" className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>{label}</button>
              ))}
            </nav>
            <div className="mr-tabs-actions">
              <button className="secondary-action compact" type="button"><Icon name="icon-filter" className="button-icon" />Filters</button>
              <button className="secondary-action compact" type="button">Bulk actions <Icon name="icon-chevron-down" className="button-icon" /></button>
            </div>
          </div>

          <div className="mr-table">
            <div className="mr-table-head">
              <span><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" /></span>
              <span>#</span><span>Imported item</span><span>Supplier</span><span>Possible match</span><span>Confidence</span><span>Price</span><span>Status</span><span>Action</span>
            </div>
            {filtered.map((row) => (
              <div className={`mr-row ${selected?.id === row.id ? "selected" : ""}`} key={row.id} onClick={() => setSelectedId(row.id)}>
                <span><input type="checkbox" checked={checkedIds.has(row.id)} onChange={() => toggleChecked(row.id)} onClick={(event) => event.stopPropagation()} aria-label={`Select item ${row.id}`} /></span>
                <span className="mr-num">{row.id}</span>
                <span className="mr-imported"><strong>{row.importedName}</strong><small>{row.importedSub}</small></span>
                <span><MatchSupplier name={row.supplier} /></span>
                <span className="mr-match">{row.matchName ? (<><strong>{row.matchName}</strong><small>{row.matchSub}</small></>) : <span className="mr-dash">—</span>}</span>
                <span>{row.confidence != null ? <em className={`mr-conf-pill ${mrConfTone(row.confidence)}`}>{row.confidence}%</em> : <span className="mr-dash">—</span>}</span>
                <span className="mr-price">{row.price != null ? (<><strong>{mrMoney(row.price)}</strong><small>${mrEa(row.perEa)} / ea</small></>) : <span className="mr-dash">—</span>}</span>
                <span className={`mr-status ${MR_STATUS[row.status].cls}`}>{MR_STATUS[row.status].label}</span>
                <span className="mr-action">
                  {row.status === "Not found"
                    ? <button className="mr-find" type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}>Find match</button>
                    : <button className="mr-caret" type="button" onClick={(event) => event.stopPropagation()} aria-label="Row actions"><Icon name="icon-chevron-down" className="button-icon" /></button>}
                </span>
              </div>
            ))}
          </div>

          <div className="mr-pagination">
            <span className="mr-pag-count">Showing 1 to {Math.min(25, filtered.length)} of {usingReal ? filtered.length : stats.total} items</span>
            <div className="mr-pages">
              <button className="mr-page-arrow" type="button" aria-label="Previous page"><Icon name="icon-chevron-left" className="button-icon" /></button>
              <button className="active" type="button">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button">4</button>
              <button type="button">5</button>
              <span className="mr-page-ellipsis">…</span>
              <button className="mr-page-arrow" type="button" aria-label="Next page"><Icon name="icon-chevron-right" className="button-icon" /></button>
            </div>
            <div className="mr-rows-per"><span>Rows per page</span><span className="mr-rows-select">25 <Icon name="icon-chevron-down" className="button-icon" /></span></div>
          </div>
        </div>

        <aside className="mr-detail">
          {selected && <MatchReviewDetail row={selected} />}
        </aside>
      </div>
    </div>
  );
}

function DashboardPage({ onNewRequest }) {
  return (
    <div className="dash">
      <div className="dash-heading">
        <div>
          <h2 id="landingHeading">Dashboard</h2>
          <p>Overview of your dental supply reordering priorities.</p>
        </div>
        <button className="dash-location" type="button">
          <Icon name="icon-map-pin" className="button-icon" />
          <span>Bright Smiles Dental - Main Office</span>
          <Icon name="icon-chevron-down" className="button-icon" />
        </button>
      </div>

      <div className="dash-stats">
        <article className="dash-stat">
          <span className="dash-stat-icon blue"><Icon name="icon-calendar" className="button-icon" /></span>
          <span className="dash-stat-label">Next Reorder Due</span>
          <strong className="dash-stat-value">May 16, 2024</strong>
          <span className="dash-stat-sub">Full office reorder</span>
          <a className="dash-stat-link" href="#">View calendar</a>
        </article>
        <article className="dash-stat">
          <span className="dash-stat-icon amber"><Icon name="icon-clipboard" className="button-icon" /></span>
          <span className="dash-stat-label">Items to Review</span>
          <strong className="dash-stat-value">18</strong>
          <span className="dash-stat-sub">Across 4 categories</span>
          <a className="dash-stat-link" href="#">View items</a>
        </article>
        <article className="dash-stat">
          <span className="dash-stat-icon red"><Icon name="icon-tag" className="button-icon" /></span>
          <span className="dash-stat-label">Price Alerts</span>
          <strong className="dash-stat-value">7</strong>
          <span className="dash-stat-sub">May impact 3 categories</span>
          <a className="dash-stat-link" href="#">View alerts</a>
        </article>
        <article className="dash-stat">
          <span className="dash-stat-icon green"><Icon name="icon-package" className="button-icon" /></span>
          <span className="dash-stat-label">Items Due This Month</span>
          <strong className="dash-stat-value">132</strong>
          <span className="dash-stat-sub">Est. $5,842</span>
          <a className="dash-stat-link" href="#">View details</a>
        </article>
      </div>

      <div className="dash-layout">
        <div className="dash-col-main">
          <section className="dash-card">
            <div className="dash-card-head">
              <div className="dash-card-title">
                <h3>Reorder List Health</h3>
                <Icon name="icon-info" className="button-icon" />
              </div>
              <a className="dash-link" href="#">View full list</a>
            </div>
            <p className="dash-muted">312 total saved items</p>
            <div className="dash-health-bar">
              <span className="seg-green" style={{ width: "76%" }}></span>
              <span className="seg-amber" style={{ width: "15%" }}></span>
              <span className="seg-red" style={{ width: "9%" }}></span>
            </div>
            <div className="dash-health-grid">
              <div className="dash-health-cell">
                <div className="dash-health-top">
                  <Icon name="icon-check-circle" className="dash-health-icon green" />
                  <div><strong>236</strong><span>Matched Items</span></div>
                </div>
                <div className="dash-health-foot"><b className="green">76%</b><small>Actively linked</small></div>
              </div>
              <div className="dash-health-cell">
                <div className="dash-health-top">
                  <Icon name="icon-link" className="dash-health-icon amber" />
                  <div><strong>48</strong><span>Missing Supplier Links</span></div>
                </div>
                <div className="dash-health-foot"><b className="amber">15%</b><small>Need attention</small></div>
              </div>
              <div className="dash-health-cell">
                <div className="dash-health-top">
                  <Icon name="icon-alert-triangle" className="dash-health-icon amber" />
                  <div><strong>20</strong><span>Needs Review</span></div>
                </div>
                <div className="dash-health-foot"><b className="amber">6%</b><small>Review details</small></div>
              </div>
              <div className="dash-health-cell">
                <div className="dash-health-top">
                  <Icon name="icon-x-circle" className="dash-health-icon red" />
                  <div><strong>8</strong><span>Duplicate Items</span></div>
                </div>
                <div className="dash-health-foot"><b className="red">3%</b><small>Clean up list</small></div>
              </div>
            </div>
          </section>

          <section className="dash-card">
            <h3 className="dash-card-h3">Recent Activity</h3>
            <div className="dash-activity">
              <div className="dash-activity-head">
                <span>Activity</span><span>Category</span><span>Details</span><span>By</span><span>When</span>
              </div>
              {dashboardActivity.map(([icon, activity, category, categoryTone, details, by, when]) => (
                <div className="dash-activity-row" key={activity}>
                  <span className="dash-activity-name"><Icon name={icon} className="button-icon" />{activity}</span>
                  <span><span className={`dash-badge ${categoryTone}`}>{category}</span></span>
                  <span className="dash-activity-details">{details}</span>
                  <span>{by}</span>
                  <span className="dash-muted">{when}</span>
                </div>
              ))}
            </div>
            <a className="dash-link" href="#">View all activity</a>
          </section>
        </div>

        <aside className="dash-col-rail">
          <section className="dash-card">
            <div className="dash-card-head">
              <h3 className="dash-card-h3">This Month's Priorities</h3>
              <span className="dash-count">4</span>
            </div>
            <div className="dash-priorities">
              {dashboardPriorities.map(([icon, tone, title, detail, due]) => (
                <button className="dash-priority" type="button" key={title}>
                  <span className={`dash-priority-icon ${tone}`}><Icon name={icon} className="button-icon" /></span>
                  <span className="dash-priority-body"><strong>{title}</strong><small>{detail}</small></span>
                  <span className="dash-priority-due">{due}</span>
                  <Icon name="icon-chevron-right" className="button-icon dash-priority-chevron" />
                </button>
              ))}
            </div>
            <a className="dash-link" href="#">View all priorities</a>
          </section>

          <button className="dash-cta primary" type="button" onClick={onNewRequest}>
            <Icon name="icon-cart" className="button-icon" />
            <span><strong>Start Reorder Run</strong><small>Review, optimize, and build your order</small></span>
          </button>
          <button className="dash-cta" type="button" onClick={onNewRequest}>
            <Icon name="icon-plus" className="button-icon" />
            <span><strong>Add Items</strong><small>Scan, search, or add from catalog</small></span>
          </button>
        </aside>
      </div>
    </div>
  );
}

function DashboardMetric({ icon, label, value, delta, tone, featured = false }) {
  return (
    <article className={`dashboard-metric ${featured ? "featured" : ""}`}>
      <span className="metric-icon"><Icon name={icon} className="button-icon" /></span>
      <div>
        <strong>{label}</strong>
        <b>{value}</b>
        <small className={tone}>{tone === "down" ? "↓" : "↑"} {delta} vs last 7 days</small>
      </div>
    </article>
  );
}

const quoteListItems = [
  {
    id: "Q-2024-0517",
    clinic: "Northline Dental",
    source: "INV-2024-0517.pdf",
    status: "Draft",
    statusTone: "draft",
    total: 21049.04,
    savings: 6128.8,
    suppliers: 3,
    items: 32,
    updated: "Ready for builder review",
    next: "Continue build",
  },
  {
    id: "Q-2024-0430",
    clinic: "Downtown Medical Clinic",
    source: "april_reorder.pdf",
    status: "Ready for review",
    statusTone: "ready",
    total: 19845.2,
    savings: 4804.8,
    suppliers: 3,
    items: 28,
    updated: "Buyer can approve",
    next: "Review quote",
  },
  {
    id: "Q-2024-0408",
    clinic: "PrimeCare Partners",
    source: "supply_list_may.pdf",
    status: "Revision requested",
    statusTone: "revision",
    total: 14850.75,
    savings: 2190.4,
    suppliers: 2,
    items: 18,
    updated: "Substitution preference changed",
    next: "Resolve notes",
  },
  {
    id: "Q-2024-0322",
    clinic: "GoodHealth Systems",
    source: "hygiene_reorder.xlsx",
    status: "Approved",
    statusTone: "approved",
    total: 329.68,
    savings: 26.4,
    suppliers: 1,
    items: 3,
    updated: "Converted to order",
    next: "View order",
  },
];

function QuoteListPage({ quoteTotal, savings, hasUploadedQuote, onNewUpload, onOpenBuilder, onReview, onViewOrder }) {
  const activeQuote = {
    ...quoteListItems[0],
    total: quoteTotal || quoteListItems[0].total,
    savings: savings || quoteListItems[0].savings,
  };
  const quotes = hasUploadedQuote ? [activeQuote, ...quoteListItems.slice(1)] : quoteListItems;

  function handleQuoteAction(quote) {
    if (quote.statusTone === "ready") onReview();
    else if (quote.statusTone === "approved") onViewOrder();
    else onOpenBuilder();
  }

  return (
    <div className="quote-list-page">
      <div className="dashboard-heading quote-list-heading">
        <div>
          <h2 id="quoteListHeading">Quotes</h2>
          <p>Track draft quotes, review-ready recommendations, and approved quote history.</p>
        </div>
        <button className="primary-action compact" type="button" onClick={onNewUpload}>
          <Icon name="icon-cloud-upload" className="button-icon" />
          Upload Invoice
        </button>
      </div>

      <div className="quote-list-metrics">
        <DashboardMetric label="Draft quotes" value="4" delta="2 need attention" tone="up" icon="icon-file-text" />
        <DashboardMetric label="Avg. savings" value="19%" delta="vs current spend" tone="up" icon="icon-chart" />
        <DashboardMetric label="Ready to approve" value="2" delta="buyer review queue" tone="up" icon="icon-clipboard" />
      </div>

      <div className="quote-list-layout">
        <section className="dashboard-card quote-inbox-card">
          <div className="dashboard-card-header">
            <div>
              <h3>Quote inbox</h3>
              <p>Most recent quote activity from uploaded invoices and reorder lists.</p>
            </div>
            <div className="dashboard-card-actions">
              <button className="secondary-action compact" type="button">Filters</button>
              <button className="secondary-action compact" type="button">Export</button>
            </div>
          </div>

          <div className="quote-inbox-table">
            <div className="quote-inbox-head">
              <span>Quote</span><span>Status</span><span>Suppliers</span><span>Total</span><span>Savings</span><span>Next step</span>
            </div>
            {quotes.map((quote, index) => (
              <article className="quote-inbox-row" key={quote.id}>
                <div>
                  <strong>{quote.id}</strong>
                  <small>{quote.clinic}</small>
                  <small>{quote.items} line items</small>
                </div>
                <span className={`quote-status ${quote.statusTone}`}>{quote.status}</span>
                <span className="quote-supplier-count">{quote.suppliers} vetted</span>
                <span>{money.format(quote.total)}</span>
                <span className="positive">{money.format(quote.savings)}</span>
                <button
                  className={index === 0 ? "primary-action compact" : "secondary-action compact"}
                  type="button"
                  onClick={() => handleQuoteAction(quote)}
                >
                  {quote.next}
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="quote-list-rail">
          <section className="dashboard-card quote-highlight-card">
            <p className="eyebrow">Active quote</p>
            <h3>{activeQuote.id}</h3>
            <strong>{money.format(activeQuote.total)}</strong>
            <span>{money.format(activeQuote.savings)} estimated savings</span>
            <button className="primary-action" type="button" onClick={onOpenBuilder}>Open quote builder</button>
          </section>
          <section className="dashboard-card quote-flow-card">
            <h3>Quote workflow</h3>
            {["Invoice uploaded", "Supplier comparison", "Quote review", "Order placed"].map((step, index) => (
              <div className={index < 2 ? "done" : ""} key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

const quoteLineItems = [
  ["Nitrile Exam Gloves, M", "MKP-1001", "Box of 100", 200, "boxes", 6.8, 5.95, "MediCore Medical"],
  ["Patient Bibs, 2-Ply, Blue", "MKP-2002", "Case of 500", 150, "cases", 24.5, 21.4, "HealthPro Supplies"],
  ["Prophy Paste, Medium Grit", "MKP-3003", "Box of 200", 300, "boxes", 12.3, 11.2, "PrimeMed Distributors"],
  ["Saliva Ejectors, Clear", "MKP-4004", "Bag of 100", 250, "bags", 4.15, 3.6, "MediCore Medical"],
  ["Diamond Burs, Coarse, FG", "MKP-5005", "Pack of 10", 100, "packs", 18.2, 15.85, "HealthPro Supplies"],
];

const supplierQuoteCards = [
  ["MediCore Medical", "$18,392.00", "-25% vs current", "2-3 days", "$450.00", "$1,000", "98% (★ 4.8)", true],
  ["HealthPro Supplies", "$19,845.20", "-19% vs current", "3-5 days", "$550.00", "$1,000", "95% (★ 4.6)", false],
  ["PrimeMed Distributors", "$20,617.50", "-16% vs current", "4-6 days", "$620.00", "$1,500", "96% (★ 4.5)", false],
];

const quoteSupplierOptions = [
  "MediCore Medical",
  "HealthPro Supplies",
  "PrimeMed Distributors",
  "SurgiMax Solutions",
  "MedLine Industries",
];

function supplierToneClass(name) {
  const knownIndex = quoteSupplierOptions.indexOf(name);
  if (knownIndex >= 0) return `supplier-tone-${knownIndex + 1}`;

  const hash = name.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return `supplier-tone-${(hash % 5) + 1}`;
}

function QuoteBuilderPage({ lineItems, quoteTotal, previousTotal, savings, onUploadAnother, onPublish, onSave }) {
  const displayItems = lineItems.length
    ? lineItems.slice(0, 5).map((item, index) => [
      item.product,
      `MKP-${String(index + 1).padStart(4, "0")}`,
      item.unit,
      item.qty,
      item.unit,
      item.oldUnitPrice,
      item.selected.unitPrice,
      item.selected.supplier,
    ])
    : quoteLineItems;
  const subtotal = quoteTotal || 18392;
  const markup = subtotal * 0.12;
  const shipping = 450;
  const total = subtotal + markup + shipping;
  const estimatedSavings = savings || Math.max((previousTotal || 24520.8) - subtotal, 0);
  const [supplierSelections, setSupplierSelections] = useState({});

  return (
    <div className="quote-builder-page">
      <header className="quote-builder-header">
        <div>
          <p>Quotes</p>
          <h2 id="quoteHeading">Quote Builder, INV-2024-0517 <span>Draft</span></h2>
          <small>Requested on May 17, 2024 · {displayItems.length} line items · MedSupply Co.</small>
        </div>
        <div>
          <button className="secondary-action compact" type="button" onClick={onUploadAnother}>
            <Icon name="icon-cloud-upload" className="button-icon" />
            Upload Another Invoice
          </button>
          <button className="icon-button" type="button" aria-label="More quote actions">•••</button>
        </div>
      </header>

      <div className="quote-builder-grid">
        <div className="quote-builder-main">
          <section className="quote-card quote-line-card">
            <div className="quote-card-header">
              <h3>Line items ({displayItems.length})</h3>
              <div className="quote-search-actions">
                <label className="quote-search">
                  <Icon name="icon-search" className="button-icon" />
                  <input type="search" placeholder="Search by product or SKU" />
                </label>
                <button className="secondary-action compact" type="button">Filters</button>
                <button className="icon-button" type="button" aria-label="Line item settings">
                  <Icon name="icon-settings" className="button-icon" />
                </button>
              </div>
            </div>
            <div className="quote-line-table">
              <div className="quote-line-head">
                <span>Product</span><span>Qty</span><span>Current price</span><span>Best quote</span><span>Selected supplier</span>
              </div>
              {displayItems.map(([product, sku, pack, qty, unit, current, best, supplier]) => {
                const selectedSupplier = supplierSelections[sku] || supplier;
                const rowSupplierOptions = quoteSupplierOptions.includes(supplier)
                  ? quoteSupplierOptions
                  : [supplier, ...quoteSupplierOptions];

                return (
                  <article className="quote-line-row" key={sku}>
                    <div><strong>{product}</strong><small>SKU: {sku}</small><small>{pack}</small></div>
                    <span>{qty}<small>{unit}</small></span>
                    <span>{money.format(current)}<small>/ box</small></span>
                    <span className="best-quote">{money.format(best)}<small>/ box</small></span>
                    <label className="supplier-select">
                      <span className={supplierToneClass(selectedSupplier)}>{selectedSupplier[0]}</span>
                      <select
                        value={selectedSupplier}
                        aria-label={`Selected supplier for ${product}`}
                        onChange={(event) => {
                          setSupplierSelections((currentSelections) => ({
                            ...currentSelections,
                            [sku]: event.target.value,
                          }));
                        }}
                      >
                        {rowSupplierOptions.map((option) => (
                          <option value={option} key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </article>
                );
              })}
            </div>
            <div className="quote-line-footer">
              <button className="secondary-action compact" type="button">Add line item</button>
              <button className="text-action" type="button">Export comparison</button>
            </div>
          </section>

          <section className="quote-health-card">
            <div><Icon name="icon-chart" className="landing-step-icon" /><strong>Price competitiveness</strong><span>Excellent</span><p>This quote is 25% lower than current pricing.</p></div>
            <div><Icon name="icon-settings" className="landing-step-icon" /><strong>Supplier coverage</strong><span>High</span><p>3 suppliers · 98% of items competitively quoted.</p></div>
            <div><Icon name="icon-clipboard" className="landing-step-icon" /><strong>Risk assessment</strong><span>Low</span><p>All suppliers meet reliability standards.</p></div>
          </section>
        </div>

        <aside className="quote-builder-side">
          <section className="quote-card supplier-compare-card">
            <div className="quote-card-header">
              <h3>Compare supplier quotes</h3>
              <button className="text-action" type="button">View full comparison</button>
            </div>
            <div className="supplier-quote-grid">
              {supplierQuoteCards.map(([name, price, savingsText, lead, ship, moq, reliability, best]) => (
                <article className={`supplier-quote ${best ? "best" : ""}`} key={name}>
                  {best && <span className="best-match">Best match</span>}
                  <div className={`supplier-avatar ${supplierToneClass(name)}`}>{name[0]}</div>
                  <h4>{name}</h4>
                  <strong>{price}</strong>
                  <small>{savingsText}</small>
                  <dl>
                    <div><dt>Lead time</dt><dd>{lead}</dd></div>
                    <div><dt>Shipping</dt><dd>{ship}</dd></div>
                    <div><dt>MOQ</dt><dd>{moq}</dd></div>
                    <div><dt>Reliability</dt><dd>{reliability}</dd></div>
                  </dl>
                  <button className="text-action" type="button">View details</button>
                </article>
              ))}
            </div>
          </section>

          <div className="quote-side-lower">
            <section className="quote-card quote-controls-card">
              <label>Markup % <input defaultValue="12" /></label>
              <label>Substitution approval <select defaultValue="approval"><option value="approval">Allow with approval</option><option>No substitutions</option></select></label>
              <label>Shipping method <select defaultValue="standard"><option value="standard">Standard (3-5 days)</option><option>Fastest available</option></select></label>
              <label>Notes to buyer <textarea defaultValue={"Sourced from 3 vetted suppliers.\nAll items meet requested specs.\n\nSubstitutions allowed with approval to ensure best availability and pricing."} /></label>
              <small>180 characters remaining</small>
            </section>

            <section className="quote-card quote-summary-card">
              <h3>Quote summary</h3>
              <div><span>Subtotal ({displayItems.length} items)</span><strong>{money.format(subtotal)}</strong></div>
              <div><span>Markup (12%)</span><strong>{money.format(markup)}</strong></div>
              <div><span>Estimated savings</span><strong className="positive">-{money.format(estimatedSavings)}</strong></div>
              <div><span>Shipping (est.)</span><strong>{money.format(shipping)}</strong></div>
              <div className="quote-total"><span>Total</span><strong>{money.format(total)}</strong></div>
              <p>You are saving 25% vs current pricing<br />{money.format(estimatedSavings)} in total savings</p>
              <button className="primary-action" type="button" onClick={onPublish}>Publish quote to buyer</button>
              <button className="secondary-action" type="button" onClick={onSave}>Save as draft</button>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

const reviewQuoteFallbackItems = [
  ["Nitrile Exam Gloves", "Powder-Free, Medium", 10, "box", "MediCore Medical", 7.8, null],
  ["Surgical Mask, Level 3", "Blue, Ear Loop", 50, "box", "HealthPro Supplies", 4.25, null],
  ["Prophy Angles, Soft Cup", "Disposable, Latex-Free", 50, "box", "PrimeMed Distributors", 12.4, 15.6],
  ["Cotton Rolls, #2 Medium", "Non-Sterile", 100, "box", "MediCore Medical", 1.65, 1.95],
  ["Fluoride Varnish, 5%", "Unit-Dose, Mint", 200, "box", "HealthPro Supplies", 6.9, null],
  ["Gauze Pads 2 x 2", "8 Ply, Non-Woven", 100, "box", "PrimeMed Distributors", 2.95, null],
];

function ReviewQuotePage({ lineItems, quoteTotal, previousTotal, savings, onBack, onApprove, onRevision }) {
  const quotedItems = lineItems.length
    ? lineItems.slice(0, 6).map((item, index) => [
      item.product,
      item.matchType || "Matched catalog item",
      item.qty,
      item.unit,
      item.selected.supplier,
      item.selected.unitPrice,
      index % 3 === 2 ? item.oldUnitPrice : null,
    ])
    : reviewQuoteFallbackItems;
  const subtotal = quoteTotal || 19170.2;
  const originalAmount = previousTotal || 24650;
  const shipping = 75;
  const taxes = 600;
  const total = subtotal + shipping + taxes;
  const estimatedSavings = savings || Math.max(originalAmount - subtotal, 0);
  const savingsPercent = Math.round((estimatedSavings / originalAmount) * 100);

  return (
    <div className="review-quote-page">
      <div className="review-quote-main">
        <button className="back-link" type="button" onClick={onBack}>Back to quotes</button>

        <header className="review-quote-header">
          <h2 id="approvalHeading">Review your quote <span>Quote #Q-2024-0517</span> <em>Complete</em></h2>
          <p>Please review the details below. When you are ready, approve and place your order.</p>
        </header>

        <section className="review-savings-card">
          <div><span>Original invoice amount</span><strong>{money.format(originalAmount)}</strong></div>
          <div><span>New quoted amount</span><strong className="positive">{money.format(total)}</strong></div>
          <div className="review-savings-highlight"><span>Estimated savings</span><strong>{savingsPercent}%</strong><b>{money.format(estimatedSavings)}</b></div>
          <div><span>Estimated lead time</span><strong>3-5 business days</strong><small>After order confirmation</small></div>
        </section>

        <section className="review-items-card">
          <div className="review-items-header">
            <h3>Quoted items (32)</h3>
            <div>
              <button className="secondary-action compact" type="button">View by: All items</button>
              <button className="secondary-action compact" type="button">Export</button>
            </div>
          </div>
          <div className="review-items-table">
            <div className="review-items-head">
              <span>Product</span><span>Quantity</span><span>Selected supplier</span><span>Unit price</span><span>Total</span><span>Substitution</span>
            </div>
            {quotedItems.map(([product, detail, qty, unit, supplier, unitPrice, originalPrice], index) => {
              const substituted = Boolean(originalPrice);
              const rowTotal = qty * unitPrice;

              return (
                <article className="review-item-row" key={`${product}-${index}`}>
                  <div className="review-product-cell">
                    <span className="review-product-thumb"><Icon name={index % 2 ? "icon-cloud-upload" : "icon-package"} className="button-icon" /></span>
                    <strong>{product}</strong>
                    <small>{detail}</small>
                  </div>
                  <span>{qty}<small>{unit}</small>{substituted && <b>Substituted</b>}</span>
                  <span>{supplier}<i className={supplierToneClass(supplier)}>{supplier[0]}</i></span>
                  <span>{money.format(unitPrice)}{substituted && <del>{money.format(originalPrice)}</del>}</span>
                  <span>{money.format(rowTotal)}{substituted && <del>{money.format(qty * originalPrice)}</del>}</span>
                  <span>{substituted ? <><strong className="approved-sub">Approved substitution</strong><small>Equal or better quality</small></> : "-"}</span>
                </article>
              );
            })}
          </div>
          <button className="secondary-action compact review-more-button" type="button">View all 32 items</button>
        </section>

        <section className="substitution-banner">
          <Icon name="icon-clipboard" className="button-icon" />
          <div><strong>All substitutions reviewed and approved</strong><p>You have 2 approved substitutions in this quote.</p></div>
          <button className="text-action" type="button">View substitutions</button>
        </section>
      </div>

      <aside className="review-quote-side">
        <section className="review-side-card">
          <div><h3>Quote notes</h3><button className="text-action" type="button">Edit</button></div>
          <p>We secured better pricing on high-volume items and included equivalent or upgraded substitutions where appropriate.</p>
          <p>All items are in stock and ready to ship.</p>
        </section>
        <section className="review-side-card">
          <div><h3>Shipping address</h3><button className="text-action" type="button">Edit</button></div>
          <p><strong>Downtown Medical Clinic</strong><br />123 Health Way<br />Suite 200<br />Chicago, IL 60601<br />United States</p>
        </section>
        <section className="review-side-card">
          <div><h3>Payment method</h3><button className="text-action" type="button">Edit</button></div>
          <label><input type="radio" defaultChecked name="payment" /> Send invoice / Net 30 <small>Pay by invoice within 30 days</small></label>
          <label><input type="radio" name="payment" /> Pay by credit card <small>Secure online payment</small></label>
        </section>
        <section className="review-side-card order-summary-card">
          <h3>Order summary</h3>
          <div><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div>
          <div><span>Shipping</span><strong>{money.format(shipping)}</strong></div>
          <div><span>Taxes</span><strong>{money.format(taxes)}</strong></div>
          <div className="quote-total"><span>Total</span><strong>{money.format(total)}</strong></div>
          <p>You save {money.format(estimatedSavings)} ({savingsPercent}%)</p>
          <button className="primary-action" type="button" onClick={onApprove}>Approve and place order</button>
          <button className="secondary-action" type="button" onClick={onRevision}>Request revision</button>
          <small>Secure · HIPAA-aware<br />Your data is never shared with suppliers.</small>
        </section>
      </aside>
    </div>
  );
}

const orderFallbackItems = [
  ["Nitrile Exam Gloves", "Size: Large · Blue · 100/Box", "NG-L-B100", "MediCore Medical", 20, "boxes", 8.75, "PO sent"],
  ["Patient Bibs, 2-Ply", "13 x 18 · Blue · 500/Case", "PB-2P-500", "HealthPro Supplies", 10, "cases", 26.4, "Approved"],
  ["Surface Disinfectant Wipes", "6 x 7 · 160/Canister", "DW-160", "PrimeMed Distributors", 6, "canisters", 7.95, "Approved"],
];

const ordersInboxItems = [
  ["ORD-20481", "Cityview Medical Center", "MediCore Medical", "Approved", "approved", "$329.68", "May 24, 2024", "PO sent"],
  ["ORD-20472", "Downtown Medical Clinic", "HealthPro Supplies", "Supplier confirmed", "confirmed", "$19,845.20", "May 22, 2024", "Tracking soon"],
  ["ORD-20461", "PrimeCare Partners", "PrimeMed Distributors", "Shipped", "shipped", "$14,850.75", "May 19, 2024", "In transit"],
  ["ORD-20438", "Northline Dental", "MediCore Medical", "Delivered", "delivered", "$1,284.30", "May 10, 2024", "Completed"],
];

function OrdersInboxPage({ onOpenOrder, onNewUpload }) {
  return (
    <div className="orders-inbox-page">
      <div className="dashboard-heading quote-list-heading">
        <div>
          <h2 id="ordersInboxHeading">Orders</h2>
          <p>Track approved supply orders, fulfillment status, and reorder opportunities.</p>
        </div>
        <button className="primary-action compact" type="button" onClick={onNewUpload}>
          <Icon name="icon-cloud-upload" className="button-icon" />
          Upload Invoice
        </button>
      </div>

      <div className="quote-list-metrics">
        <DashboardMetric label="Open orders" value="12" delta="4 updated" tone="up" icon="icon-clipboard" />
        <DashboardMetric label="Pending shipment" value="5" delta="needs tracking" tone="up" icon="icon-package" />
        <DashboardMetric label="Delivered" value="28" delta="this month" tone="up" icon="icon-store" />
      </div>

      <div className="orders-inbox-layout">
        <section className="dashboard-card orders-table-card">
          <div className="dashboard-card-header">
            <div>
              <h3>Order inbox</h3>
              <p>Recently placed and active clinic orders.</p>
            </div>
            <div className="dashboard-card-actions">
              <button className="secondary-action compact" type="button">Filters</button>
              <button className="secondary-action compact" type="button">Export</button>
            </div>
          </div>

          <div className="orders-inbox-table">
            <div className="orders-inbox-head">
              <span>Order</span><span>Status</span><span>Supplier</span><span>Total</span><span>Delivery</span><span>Next update</span><span></span>
            </div>
            {ordersInboxItems.map(([id, clinic, supplier, status, tone, total, delivery, update], index) => (
              <article className="orders-inbox-row" key={id}>
                <div><strong>#{id}</strong><small>{clinic}</small></div>
                <span className={`order-status ${tone}`}>{status}</span>
                <span>{supplier}</span>
                <span>{total}</span>
                <span>{delivery}</span>
                <span>{update}</span>
                <button className={index === 0 ? "primary-action compact" : "secondary-action compact"} type="button" onClick={onOpenOrder}>View order</button>
              </article>
            ))}
          </div>
        </section>

        <aside className="orders-inbox-rail">
          <section className="dashboard-card order-highlight-card">
            <p className="eyebrow">Latest order</p>
            <h3>#ORD-20481</h3>
            <strong>PO sent</strong>
            <span>Estimated delivery May 24, 2024</span>
            <button className="primary-action" type="button" onClick={onOpenOrder}>Open order</button>
          </section>
          <section className="dashboard-card quote-flow-card">
            <h3>Fulfillment flow</h3>
            {["Approved", "PO sent", "Supplier confirmed", "Shipped", "Delivered"].map((step, index) => (
              <div className={index < 2 ? "done" : ""} key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function OrderDetailPage({ lineItems, onDownload, onReorder }) {
  const orderedItems = lineItems.length
    ? lineItems.slice(0, 3).map((item, index) => [
      item.product,
      item.matchType || item.unit,
      `MKP-${String(index + 1).padStart(4, "0")}`,
      item.selected.supplier,
      item.qty,
      item.unit,
      item.selected.unitPrice,
      index === 0 ? "PO sent" : "Approved",
    ])
    : orderFallbackItems;
  const subtotal = orderedItems.reduce((sum, [, , , , qty, , unitPrice]) => sum + qty * unitPrice, 0);
  const shipping = 18.5;
  const tax = 24.48;
  const total = subtotal + shipping + tax;

  return (
    <div className="order-detail-page">
      <div className="order-detail-main">
        <header className="order-detail-header">
          <div>
            <h2 id="orderHeading">Order #ORD-20481 <span>Approved</span></h2>
            <p>Placed May 17, 2024 · 3:42 PM</p>
          </div>
          <div>
            <button className="secondary-action compact" type="button" onClick={onDownload}>
              <Icon name="icon-cloud-upload" className="button-icon" />
              Download PO
            </button>
            <button className="primary-action compact" type="button" onClick={onReorder}>
              <Icon name="icon-clipboard" className="button-icon" />
              Reorder All
            </button>
          </div>
        </header>

        <section className="order-progress-card">
          {[
            ["Approved", "May 17, 3:42 PM", "icon-clipboard", true],
            ["PO sent", "May 17, 4:15 PM", "icon-file-text", true],
            ["Supplier confirmed", "Pending", "icon-store", false],
            ["Shipped", "Pending", "icon-package", false],
            ["Delivered", "Pending", "icon-package", false],
          ].map(([label, detail, icon, done], index, steps) => (
            <article className={done ? "done" : ""} key={label}>
              <span><Icon name={icon} className="button-icon" /></span>
              {index < steps.length - 1 && <i></i>}
              <strong>{label}</strong>
              <small>{detail}</small>
            </article>
          ))}
        </section>

        <div className="order-info-grid">
          <section className="order-info-card">
            <h3>Supplier</h3>
            <div className="order-supplier">
              <span className="supplier-tone-1">M</span>
              <div><strong>MediCore Medical</strong><small>98% on-time · 4.8 ★</small></div>
            </div>
            <button className="secondary-action" type="button">View Supplier</button>
          </section>
          <section className="order-info-card centered">
            <h3>Shipment Tracking</h3>
            <Icon name="icon-package" className="order-info-icon" />
            <p>Tracking available once your order ships.</p>
          </section>
          <section className="order-info-card">
            <h3>Estimated Delivery</h3>
            <div className="delivery-date"><Icon name="icon-clipboard" className="order-info-icon" /><strong>May 24, 2024</strong><span>7 days remaining</span></div>
            <button className="secondary-action" type="button">View Details</button>
          </section>
        </div>

        <section className="reorder-reminder-card">
          <Icon name="icon-settings" className="button-icon" />
          <div><strong>Reorder Reminder</strong><p>Never run out of important supplies. We will remind you before it is time to reorder.</p></div>
          <span>Reminder every 30 days</span>
          <button className="secondary-action compact" type="button">Edit Reminder</button>
        </section>

        <section className="ordered-items-card">
          <h3>Ordered Items ({orderedItems.length})</h3>
          <div className="ordered-items-table">
            <div className="ordered-items-head">
              <span>Item</span><span>Supplier</span><span>Qty</span><span>Unit Price</span><span>Total</span><span>Status</span>
            </div>
            {orderedItems.map(([product, detail, sku, supplier, qty, unit, unitPrice, status], index) => (
              <article className="ordered-item-row" key={`${product}-${sku}`}>
                <div className="ordered-product-cell">
                  <span><Icon name={index === 2 ? "icon-package" : "icon-cloud-upload"} className="button-icon" /></span>
                  <strong>{product}</strong>
                  <small>{detail}<br />SKU: {sku}</small>
                </div>
                <span>{supplier}</span>
                <span>{qty} {unit}</span>
                <span>{money.format(unitPrice)}</span>
                <span>{money.format(qty * unitPrice)}</span>
                <b className={status === "PO sent" ? "po-sent" : ""}>{status}</b>
              </article>
            ))}
          </div>
          <button className="text-action ordered-more" type="button">View item details</button>
        </section>
      </div>

      <aside className="order-detail-side">
        <section className="order-side-card">
          <h3>Order Summary</h3>
          <div><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div>
          <div><span>Shipping</span><strong>{money.format(shipping)}</strong></div>
          <div><span>Tax</span><strong>{money.format(tax)}</strong></div>
          <div className="order-side-total"><span>Total</span><strong>{money.format(total)}</strong></div>
          <p>You saved $26.40 with contract pricing.</p>
        </section>
        <section className="order-side-card">
          <h3>Shipping Address</h3>
          <p><strong>Cityview Medical Center</strong><br />Attn: Receiving Dock<br />500 Healthcare Blvd.<br />Nashville, TN 37203<br />United States</p>
          <button className="secondary-action" type="button">View / Edit Address</button>
        </section>
        <section className="order-side-card">
          <h3>Need Help?</h3>
          <p>Our support team is here to help with your order.</p>
          <p><strong>(800) 555-0198</strong><br /><strong>support@medmkp.com</strong></p>
          <button className="secondary-action" type="button">Contact Support</button>
        </section>
      </aside>
    </div>
  );
}

function offerUnitPrice(offer) {
  return (offer?.comparable_price_cents ?? offer?.unit_price_cents ?? 0) / 100;
}

function RecommendationSummary({
  stats,
  items,
  total,
  previousTotal,
  savings,
  neededByDate,
  onNeededByDateChange,
  onBack,
  onContinue,
}) {
  const hasSavings = savings > 0;
  const sortedItems = [...items].sort((a, b) => {
    const aNeedsReview = ["needs_review", "unmatched"].includes(a.recommendation?.matchType);
    const bNeedsReview = ["needs_review", "unmatched"].includes(b.recommendation?.matchType);
    if (aNeedsReview !== bNeedsReview) return aNeedsReview ? -1 : 1;
    return ((b.oldUnitPrice - b.selected.unitPrice) * b.draftQty) - ((a.oldUnitPrice - a.selected.unitPrice) * a.draftQty);
  });
  const summaryCards = [
    { label: "selected total", value: money.format(total) },
    { label: "estimated savings", value: hasSavings ? money.format(savings) : "None yet" },
    { label: "matched lines", value: `${stats.matchedItems}/${items.length}` },
  ];

  return (
    <section className="recommendation-workspace" aria-labelledby="recommendationHeading">
      <div className="recommendation-main">
        <div className="recommendation-header">
          <div>
            <p className="eyebrow">Recommendations</p>
            <h3 id="recommendationHeading">Review recommended products</h3>
          </div>
          <div className="recommendation-score">
            <strong>{hasSavings ? Math.round((savings / Math.max(previousTotal, 1)) * 100) : 0}%</strong>
            <span>savings vs invoice</span>
          </div>
        </div>

        <div className="recommendation-stats compact">
          {summaryCards.map((card) => (
            <div key={card.label}>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </div>
          ))}
        </div>

        <div className="recommendation-list">
          {sortedItems.map((item) => {
            const matchType = item.recommendation?.matchType;
            const confidence = Math.round((item.recommendation?.confidence || 0) * 100);
            const itemSavings = Math.max((item.oldUnitPrice - item.selected.unitPrice) * item.draftQty, 0);
            const offers = item.recommendation?.offers || [];
            const imageUrl = item.imageUrl || item.recommendation?.imageUrl || item.selected?.image_url || offers.find((offer) => offer.image_url)?.image_url || "";
            const selectedOffer = offers.find((offer) => (
              offer.supplier_name === item.selected.supplier &&
              (offer.sku || "") === (item.selected.sku || "")
            )) || {
              name: item.product,
              supplier_name: item.selected.supplier,
              sku: item.selected.sku,
              comparable_price_cents: Math.round((item.selected.unitPrice || 0) * 100),
              unit_price_cents: Math.round((item.selected.unitPrice || 0) * 100),
              product_url: item.selected.product_url,
              image_url: imageUrl,
            };
            const remainingOffers = offers.filter((offer) => !(
              offer.supplier_name === item.selected.supplier &&
              (offer.sku || "") === (item.selected.sku || "")
            ));
            const unit = item.unit || "unit";

            return (
              <details className="recommendation-row" key={item.product}>
                <summary>
                  <span className="recommendation-thumb" aria-hidden="true">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span />
                    )}
                  </span>
                  <span className="recommendation-title">
                    <strong>{item.product}</strong>
                    <span className={`status-chip ${recommendationClass(matchType)}`}>
                      {recommendationLabel(matchType)}
                    </span>
                  </span>
                  <span className="recommendation-meta">
                    {matchType === "unmatched"
                      ? `No catalog match · keeping invoice price ${money.format(item.oldUnitPrice)}/${unit} · ${item.draftQty} ${unit}`
                      : `Selected: ${item.selected.supplier} · ${money.format(item.selected.unitPrice)}/${unit} · invoice ${money.format(item.oldUnitPrice)} · ${confidence}% confidence`}
                  </span>
                  <em className={`recommendation-delta ${itemSavings > 0 ? "" : "no-savings"}`}>
                    {itemSavings > 0 ? `Save ${money.format(itemSavings)}` : "—"}
                  </em>
                </summary>
                <div className="comparison-list">
                  <div className="comparison-offer winner">
                    <strong>Recommended product</strong>
                    <em>{selectedOffer.supplier_name || "Supplier"} · {selectedOffer.sku || "SKU pending"}</em>
                    <b>{money.format(offerUnitPrice(selectedOffer))}</b>
                  </div>
                  <div className="comparison-offer baseline">
                    <strong>Current invoice</strong>
                    <em>{item.extractedFrom} · {item.oldVendor}</em>
                    <b>{money.format(item.oldUnitPrice)}</b>
                  </div>
                  {remainingOffers.slice(0, 4).map((offer, index) => (
                    <div className="comparison-offer alternative" key={`${offer.supplier_name}-${offer.sku || index}`}>
                      <strong>{offer.name || item.product}</strong>
                      <em>{offer.supplier_name || "Supplier"} · {offer.sku || "SKU pending"}</em>
                      <b>{money.format(offerUnitPrice(offer))}</b>
                    </div>
                  ))}
                  {!offers.length && <p>No priced alternatives yet.</p>}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <aside className="recommendation-intent">
        <p className="eyebrow">Buyer Preferences</p>
        <label>Needed by date
          <span className={`date-field ${neededByDate ? "has-value" : ""}`}>
            <input
              name="neededBy"
              type="date"
              aria-label="Needed by date"
              value={neededByDate}
              onChange={(event) => onNeededByDateChange(event.target.value)}
            />
          </span>
        </label>
        <label>Review cadence
          <select name="frequency" defaultValue="">
            <option value="" disabled>Select cadence</option>
            <option>One-time order</option>
            <option>Monthly</option>
            <option>Every 60 days</option>
            <option>Quarterly</option>
          </select>
        </label>
        <label className="toggle-field">Track as recurring spend
          <span><i></i></span>
          <small>Include accepted items in reorder monitoring</small>
        </label>
        <label className="intent-notes">Notes <em>(optional)</em>
          <textarea name="notes" maxLength="500" placeholder="Brand preferences, delivery constraints, or substitutions to avoid..." />
        </label>
        <div className="recommendation-breakdown">
          <span>{stats.exactMatches} exact</span>
          <span>{stats.substitutions} equivalent/substitute</span>
          <span>{stats.needsReview} needs review</span>
        </div>
        <div className="wizard-actions">
          <button className="secondary-action compact" type="button" onClick={onBack}>Back</button>
          <button className="primary-action compact" type="button" onClick={onContinue}>View savings</button>
        </div>
      </aside>
    </section>
  );
}

function UploadExtractionPanel({ items, editMode, onToggleEditMode, onRemove, onQtyChange, onItemChange }) {
  return (
    <section className={`extracted-line-preview ${editMode ? "editing" : ""}`} aria-labelledby="extractedPreviewHeading">
      <div className="extracted-preview-header">
        <div className="extracted-preview-copy">
          <h3 id="extractedPreviewHeading">Extracted line items preview</h3>
          <span className="items-detected-pill">{items.length} item{items.length === 1 ? "" : "s"} detected</span>
        </div>
      </div>

      <div className="extracted-preview-table">
        <div className="extracted-preview-head">
          <span>#</span>
          <span>Item description</span>
          <span>SKU / Part #</span>
          <span>Qty</span>
          <span>Unit</span>
          <span>Est. Price</span>
          {editMode && <span> </span>}
        </div>
        {items.map((item, index) => (
          <div className="extracted-preview-row" key={item.product}>
            <span>{index + 1}</span>
            {editMode ? (
              <input
                aria-label={`${item.product} description`}
                value={item.extractedFrom}
                onChange={(event) => onItemChange(item.product, { extractedFrom: event.target.value })}
              />
            ) : (
              <span>{item.extractedFrom}</span>
            )}
            {editMode ? (
              <input
                aria-label={`${item.product} SKU`}
                value={item.sku}
                onChange={(event) => onItemChange(item.product, { sku: event.target.value })}
              />
            ) : (
              <span>{item.sku || "—"}</span>
            )}
            {editMode ? (
              <input
                aria-label={`${item.product} quantity`}
                min="1"
                type="number"
                value={item.draftQty}
                onChange={(event) => onQtyChange(item.product, event.target.value)}
              />
            ) : (
              <span>{item.draftQty}</span>
            )}
            {editMode ? (
              <input
                aria-label={`${item.product} unit`}
                value={item.unit}
                onChange={(event) => onItemChange(item.product, { unit: event.target.value })}
              />
            ) : (
              <span>{item.unit}</span>
            )}
            {editMode ? (
              <input
                aria-label={`${item.product} unit price`}
                inputMode="decimal"
                type="text"
                value={(Number(item.oldUnitPrice) || 0).toFixed(2)}
                onChange={(event) => onItemChange(item.product, { oldUnitPrice: Number(event.target.value) || 0 })}
              />
            ) : (
              <span>{item.oldUnitPrice ? money.format(item.oldUnitPrice) : "—"}</span>
            )}
            {editMode ? (
              <button className="icon-button destructive" type="button" aria-label={`Remove ${item.extractedFrom}`} onClick={() => onRemove(item.product)}>
                <Icon name="icon-trash" className="button-icon" />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>

      <div className="extracted-preview-footer">
        <span className="items-wrong-note">Items look wrong?</span>
        <button className="secondary-action compact" type="button" onClick={() => onToggleEditMode(!editMode)}>
          <Icon name="icon-edit" className="button-icon" />
          {editMode ? "Save items" : "Edit items"}
        </button>
      </div>
    </section>
  );
}

function SavingsSummary({ activeItems, total, sourceCount, onBack, savings }) {
  const savingsByItem = activeItems
    .map((item) => ({
      ...item,
      itemSavings: Math.max((item.oldUnitPrice - item.selected.unitPrice) * item.draftQty, 0),
      productLink: item.selected?.product_url || item.selected?.url || item.selected?.link || item.recommendation?.offers?.[0]?.url || item.recommendation?.offers?.[0]?.product_url || "",
    }))
    .sort((a, b) => b.itemSavings - a.itemSavings);

  return (
    <div className="draft-confirm">
      <div>
        <p className="eyebrow">Savings</p>
        <h3>Open the cheaper product links</h3>
        <p>These are the supplier pages and product links tied to the lower-priced winners for this upload.</p>
      </div>
      <div className="draft-confirm-total">
        <span>{activeItems.length} active line item{activeItems.length === 1 ? "" : "s"} from {sourceCount} invoice{sourceCount === 1 ? "" : "s"}</span>
        <strong>{money.format(total)}</strong>
      </div>
      <div className="savings-links">
        {savingsByItem.map((item) => (
          <article className="savings-link-row" key={item.product}>
            <div>
              {item.extractedFrom}
              <p>{item.selected?.supplier || "Supplier"} · {money.format(item.selected?.unitPrice || 0)}/{item.unit || "unit"} · save {money.format(item.itemSavings)}</p>
            </div>
            {item.productLink ? (
              <a className="secondary-action compact" href={item.productLink} target="_blank" rel="noreferrer">Open product</a>
            ) : (
              <span className="savings-link-missing">No product link</span>
            )}
          </article>
        ))}
      </div>
      <div className="wizard-actions">
        <button className="secondary-action compact" type="button" onClick={onBack}>Back to recommendations</button>
        <span className="savings-total">Estimated savings: <strong>{money.format(savings)}</strong></span>
      </div>
    </div>
  );
}

function ExtractedTable({ lineItems }) {
  return (
    <div className="table-wrap extracted-preview">
      <table>
        <thead>
          <tr>
            <th>Extracted Item</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Old Vendor</th>
            <th>Old Unit Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <tr key={item.product}>
              <td><strong>{item.product}</strong><br /><span>{item.extractedFrom}</span></td>
              <td>{item.qty}</td>
              <td>{item.unit}</td>
              <td>{item.oldVendor}</td>
              <td>{money.format(item.oldUnitPrice)}</td>
              <td><span className={`status-chip ${statusClass(item.status)}`}>{item.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
