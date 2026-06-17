"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const PROCESSING_DURATION_MS = 2000;

const routeByView = {
  landing: "/",
  pricing: "/pricing",
  about: "/about",
  login: "/login",
  signup: "/signup",
  home: "/app",
  history: "/app/history",
  settings: "/app/settings",
};

function viewFromPath(pathname = "/") {
  const path = pathname.replace(/\/+$/, "") || "/";

  // Public site
  if (path === "/") return { view: "landing", isLoggedIn: false };
  if (path === "/pricing") return { view: "pricing", isLoggedIn: false };
  if (path === "/about") return { view: "about", isLoggedIn: false };
  if (path === "/login") return { view: "login", isLoggedIn: false };
  if (path === "/signup") return { view: "signup", isLoggedIn: false };

  // Authenticated app
  if (path === "/app") return { view: "home", isLoggedIn: true };
  if (path === "/app/scan") return { view: "home", isLoggedIn: true, mobileAddItemRoute: true };
  if (path === "/app/history") return { view: "history", isLoggedIn: true };
  if (path.startsWith("/app/history/")) return { view: "historyDetail", isLoggedIn: true, historyId: path.split("/")[3] || "" };
  if (path === "/app/settings") return { view: "settings", isLoggedIn: true };

  return { view: "home", isLoggedIn: true };
}

function pathForView(view) {
  return routeByView[view] || "/app";
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
      <symbol id="icon-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3.25 2.1" />
      </symbol>
      <symbol id="icon-bell" viewBox="0 0 24 24">
        <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8-2.5 8h17s-2.5-1.5-2.5-8Z" />
        <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
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

    // Fire one scan, then cool down briefly so a barcode lingering in frame
    // doesn't register a dozen times. The detection loop keeps running, so the
    // next item is captured as soon as the cooldown clears (grocery-style).
    function fire(code) {
      if (cooling) return;
      cooling = true;
      if (navigator.vibrate) navigator.vibrate(50);
      onScanRef.current?.(code || null);
      cooldownId = window.setTimeout(() => { cooling = false; }, 1600);
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

        if ("BarcodeDetector" in window) {
          try {
            detector = new window.BarcodeDetector();
            setAutoDetect(true);
            intervalId = window.setInterval(async () => {
              const code = await detectFrame();
              if (code) fire(code);
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
      window.clearTimeout(cooldownId);
      stream?.getTracks().forEach((track) => track.stop());
      captureRef.current = () => {};
    };
  }, [active]);

  const capture = useCallback(() => captureRef.current(), []);
  return { videoRef, cameraStatus, autoDetect, capture };
}

function MobileScanItemView({ onBack, onScan, tray }) {
  const [isMobile, setIsMobile] = useState(false);
  const [captured, setCaptured] = useState(false);
  const flashTimer = useRef();

  useEffect(() => {
    setIsMobile(window.matchMedia("(max-width: 767px)").matches);
  }, []);

  const { videoRef, cameraStatus, autoDetect, capture } = useBarcodeScanner({
    active: isMobile,
    onScan: (code) => {
      onScan?.(code);
      setCaptured(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setCaptured(false), 700);
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
          <button className="shutter" type="button" aria-label="Scan item" onClick={capture} disabled={cameraStatus !== "ready"}></button>
          <button type="button" aria-label="Open photo library">
            <Icon name="icon-image" className="mobile-control-icon" />
          </button>
        </div>
      </div>

      <section className="recognized-sheet" aria-label="Scanned items">
        {tray}
      </section>
    </section>
  );
}

function MobileBottomNav({ view, onNavigate, onAdd }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile primary navigation">
      <div className="m-nav-group">
        <button className={view === "home" ? "active" : ""} type="button" onClick={() => onNavigate("home")}>
          <span><Icon name="icon-home" className="mobile-bottom-icon" /></span>Home
        </button>
        <button className={view === "history" ? "active" : ""} type="button" onClick={() => onNavigate("history")}>
          <span><Icon name="icon-clock" className="mobile-bottom-icon" /></span>History
        </button>
      </div>
      <button className="m-nav-fab" type="button" aria-label="Add items" onClick={onAdd}>
        <Icon name="icon-plus" className="m-nav-fab-icon" />
      </button>
      <div className="m-nav-group">
        <button className={view === "settings" ? "active" : ""} type="button" onClick={() => onNavigate("settings")}>
          <span><Icon name="icon-list" className="mobile-bottom-icon" /></span>More
        </button>
      </div>
    </nav>
  );
}

function LoggedOutLanding({ onNavigate }) {
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
          <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
          <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up</button>
        </div>
      </header>

      <section className="landing-main">
        <div className="landing-col-left">
          <div className="landing-copy">
            <h1>Scan your dental supplies and spot <span>possible savings</span> in seconds</h1>
            <p>Point your phone at a barcode or enter a SKU to identify the item, compare typical price ranges, and save it to a free starter reorder list. No login required to try it.</p>
            <div className="landing-actions">
              <button className="primary-action" type="button" onClick={() => onNavigate("/signup")}>
                <Icon name="icon-scan" className="button-icon" />
                Scan 1 item free
              </button>
              <button className="secondary-action" type="button" onClick={() => onNavigate("/app")}>
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
    { name: "Practice", price: "$49", per: "/mo", blurb: "For a single office", cta: "Start free trial", to: "/signup", featured: true, features: ["Unlimited reorder lists", "Invoice upload & matching", "Supplier handoffs", "Price alerts"] },
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

function AuthShell({ title, subtitle, children, onNavigate }) {
  return (
    <main className="auth-page">
      <a className="auth-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
        <BrandMark />
      </a>
      <div className="auth-card">
        <h1>{title}</h1>
        <p className="auth-sub">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

function LoginPage({ onNavigate }) {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your MedMKP workspace." onNavigate={onNavigate}>
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); onNavigate("/app"); }}>
        <label><span>Email</span><input type="email" placeholder="you@practice.com" required /></label>
        <label><span>Password</span><input type="password" placeholder="••••••••" required /></label>
        <button className="primary-action" type="submit">Sign in</button>
      </form>
      <p className="auth-alt">New to MedMKP? <a href="/signup" onClick={(event) => { event.preventDefault(); onNavigate("/signup"); }}>Create an account</a></p>
    </AuthShell>
  );
}

function SignupPage({ onNavigate }) {
  return (
    <AuthShell title="Create your account" subtitle="Start optimizing your dental supply reorders." onNavigate={onNavigate}>
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); onNavigate("/app"); }}>
        <label><span>Practice name</span><input type="text" placeholder="Bright Smiles Dental" required /></label>
        <label><span>Email</span><input type="email" placeholder="you@practice.com" required /></label>
        <label><span>Password</span><input type="password" placeholder="Create a password" required /></label>
        <button className="primary-action" type="submit">Create account</button>
      </form>
      <p className="auth-alt">Already have an account? <a href="/login" onClick={(event) => { event.preventDefault(); onNavigate("/login"); }}>Log in</a></p>
    </AuthShell>
  );
}

export default function Home() {
  const uploadFormRef = useRef(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [view, setViewState] = useState("landing");
  const [historyId, setHistoryId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDraggingInvoice, setIsDraggingInvoice] = useState(false);
  const [selectedInvoiceName, setSelectedInvoiceName] = useState("");
  const [hasUploadedInvoice, setHasUploadedInvoice] = useState(false);
  const [mobileAddItemRoute, setMobileAddItemRoute] = useState(false);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [addMode, setAddMode] = useState("");
  const [lastUpload, setLastUpload] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [canonicalResults, setCanonicalResults] = useState([]);
  const [canonicalSource, setCanonicalSource] = useState("idle");

  useEffect(() => {
    function syncViewFromLocation() {
      const nextRoute = viewFromPath(window.location.pathname);
      setIsLoggedIn(nextRoute.isLoggedIn);
      setViewState(nextRoute.view);
      setHistoryId(nextRoute.historyId || null);
      setMobileAddItemRoute(Boolean(nextRoute.mobileAddItemRoute));
      setMenuOpen(false);
    }

    syncViewFromLocation();
    window.addEventListener("popstate", syncViewFromLocation);

    return () => window.removeEventListener("popstate", syncViewFromLocation);
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

  const visibleDraftItems = draftItems.filter((item) => item.documentIds.some((documentId) => uploadedDocs.some((doc) => doc.id === documentId)));
  const activeDraftItems = visibleDraftItems.filter((item) => item.included);
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

  function navigate(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    const next = viewFromPath(path);
    setIsLoggedIn(next.isLoggedIn);
    setViewState(next.view);
    setHistoryId(next.historyId || null);
    setMobileAddItemRoute(Boolean(next.mobileAddItemRoute));
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setView(nextView) {
    navigate(pathForView(nextView));
  }

  function openMobileScan() {
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
    setHasUploadedInvoice(true);
    setUploadedDocs((docs) => [
      ...docs,
      { id: documentId, name: request.sourceFileName, itemCount: request.lineItems.length },
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
    setUploading(false);
    setSelectedInvoiceName("");
    setLastUpload({ name: request.sourceFileName, items: request.lineItems, matchSource: request.matchSource });
    form.reset();
    showToast(`${request.lineItems.length} items added to your list`);
  }

  function addScannedItem(code) {
    setUploadedDocs((docs) => docs.some((doc) => doc.id === "scan")
      ? docs
      : [...docs, { id: "scan", name: "Barcode scans", itemCount: 0 }]);
    setDraftItems((items) => {
      const index = code ? items.findIndex((item) => item.barcode === code) : -1;
      if (index >= 0) {
        const next = [...items];
        const existing = next[index];
        next[index] = {
          ...existing,
          draftQty: (existing.draftQty || 1) + 1,
          qty: (existing.qty || 1) + 1,
          included: true,
          documentQuantities: { ...(existing.documentQuantities || {}), scan: ((existing.documentQuantities || {}).scan || 0) + 1 },
        };
        return next;
      }
      return [...items, makeScanDraftItem(code)];
    });
    const hit = code ? SCAN_CATALOG[code] : null;
    showToast(hit ? `Added ${hit.product}` : code ? `Scanned ${code} — needs review` : "Item added");
  }

  function removeDraftItem(product) {
    setDraftItems((items) => items.map((item) => {
      if (item.product !== product) return item;
      return { ...item, included: false };
    }));
  }

  const navItems = [
    ["home", "icon-home", "Home"],
    ["history", "icon-clock", "History / Past Lists"],
    ["settings", "icon-settings", "Settings"],
  ];

  if (!isLoggedIn) {
    return (
      <>
        {view === "pricing" ? <PricingPage onNavigate={navigate} />
          : view === "about" ? <AboutPage onNavigate={navigate} />
          : view === "login" ? <LoginPage onNavigate={navigate} />
          : view === "signup" ? <SignupPage onNavigate={navigate} />
          : <LoggedOutLanding onNavigate={navigate} />}
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
          <div className="topbar-right">
            <button className="topbar-alerts" type="button" aria-label="Alerts">
              <Icon name="icon-bell" className="button-icon" />
              <span className="topbar-badge">3</span>
            </button>
            <button className="topbar-user" type="button">
              <span className="topbar-avatar">AK</span>
              <span className="topbar-user-id"><strong>Alex Kim</strong><small>Buyer</small></span>
              <Icon name="icon-chevron-down" className="button-icon" />
            </button>
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
                onBack={() => setMobileAddItemRoute(false)}
                onScan={handleScanComplete}
                tray={
                  <CaptureTray
                    items={activeDraftItems}
                    compact
                    onReview={() => setMobileAddItemRoute(false)}
                    onRemove={(item) => removeDraftItem(item.product)}
                  />
                }
              />
            ) : (
              <CurrentReorderList
                items={activeDraftItems}
                addMode={addMode}
                onAddMode={setAddMode}
                lastUpload={lastUpload}
                onCloseUpload={() => { setAddMode(""); setLastUpload(null); }}
                onUploadAnother={() => setLastUpload(null)}
                uploadFormRef={uploadFormRef}
                onUpload={handleUpload}
                uploading={uploading}
                uploadProgress={uploadProgress}
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
                onToast={showToast}
              />
            )
          )}

          {view === "history" && <HistoryView onOpen={(id) => navigate(`/app/history/${id}`)} />}

          {view === "historyDetail" && <HistoryDetail id={historyId} onBack={() => navigate("/app/history")} />}

          {view === "settings" && <SettingsView />}
        </main>
        <MobileBottomNav view={view} onNavigate={setView} onAdd={() => setMobileAddOpen(true)} />
        {mobileAddOpen && (
          <div className="m-sheet-backdrop" onClick={() => setMobileAddOpen(false)}>
            <div className="m-sheet" role="dialog" aria-label="Add items" onClick={(event) => event.stopPropagation()}>
              <span className="m-sheet-grip" aria-hidden="true" />
              <h3>Add items</h3>
              <button type="button" onClick={() => { setMobileAddOpen(false); setView("home"); setAddMode("upload"); }}>
                <Icon name="icon-cloud-upload" className="button-icon" />
                <span><strong>Upload invoice</strong><small>PDF, CSV, or photo</small></span>
              </button>
              <button type="button" onClick={() => { setMobileAddOpen(false); openMobileScan(); }}>
                <Icon name="icon-scan" className="button-icon" />
                <span><strong>Scan barcode</strong><small>Use your camera</small></span>
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
      <IconSprite />
    </>
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
function MatchSupplier({ name }) {
  if (!name || name === "—") return <span className="mr-supplier-none">—</span>;
  const key = name.toLowerCase();
  if (key.includes("schein")) return (<span className="mr-supplier"><img className="mr-supplier-img" src="/schein-logo.png" alt="" /><span>Henry Schein</span></span>);
  if (key.includes("3m")) return <span className="mr-supplier mr-logo-3m">3M</span>;
  if (key.includes("metrex")) return <span className="mr-supplier mr-logo-metrex">Metrex</span>;
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

function makeScanDraftItem(code) {
  const hit = code ? SCAN_CATALOG[code] : null;
  const base = {
    draftQty: 1,
    qty: 1,
    included: true,
    documentIds: ["scan"],
    documentQuantities: { scan: 1 },
    barcode: code || "",
    extractedFrom: `Scanned · ${code || "no code"}`,
  };
  if (hit) {
    return {
      ...base,
      product: hit.product,
      sku: hit.sku,
      unit: hit.unit,
      status: "Parsed",
      selected: { supplier: hit.supplier, sku: hit.sku, unitPrice: hit.price, total: hit.price },
      oldVendor: hit.supplier,
      oldUnitPrice: hit.price,
      recommendation: { confidence: hit.confidence, offers: [] },
    };
  }
  return {
    ...base,
    product: "Unrecognized item",
    sku: code || "",
    unit: "ea",
    status: "No match",
    selected: null,
    recommendation: { confidence: 0, offers: [] },
  };
}

// Match-Review-styled list of captured items shown on the Add step. Both
// scanning and upload extraction feed it; "Review" advances to the full table.
function CaptureTray({ items, onReview, onRemove, compact }) {
  const rows = deriveMatchRows(items);
  const count = rows.length;
  const matched = rows.filter((r) => r.status === "Matched").length;
  const review = count - matched;
  return (
    <section className={`capture-tray ${compact ? "compact" : ""}`} aria-label="Captured items">
      <div className="capture-tray-head">
        <div className="capture-tray-title">
          <strong>Items to review</strong>
          <span>{count === 0 ? "Nothing captured yet" : `${count} captured · ${matched} matched${review ? ` · ${review} need review` : ""}`}</span>
        </div>
        <button className="primary-action compact" type="button" onClick={onReview} disabled={count === 0}>
          Review {count} item{count === 1 ? "" : "s"} <Icon name="icon-arrow-right" className="button-icon" />
        </button>
      </div>
      {count === 0 ? (
        <div className="capture-tray-empty">
          <Icon name="icon-scan" className="button-icon" />
          <p>Scanned and uploaded items collect here, then you review them together.</p>
        </div>
      ) : (
        <div className="capture-tray-table">
          <div className="capture-tray-row capture-tray-header">
            <span>#</span><span>Item</span><span>Supplier</span><span>Qty</span><span>Status</span><span>Price</span><span aria-hidden="true"></span>
          </div>
          {rows.map((row) => (
            <div className="capture-tray-row" key={row.id}>
              <span className="ct-num">{row.id}</span>
              <span className="ct-item"><strong>{row.matchName || row.importedName}</strong><small>{row.importedName}</small></span>
              <span><MatchSupplier name={row.supplier} /></span>
              <span className="ct-qty">{row.qty}</span>
              <span className={`mr-status ${MR_STATUS[row.status].cls}`}>{MR_STATUS[row.status].label}</span>
              <span className="ct-price">{row.price != null ? mrMoney(row.price) : <span className="mr-dash">—</span>}</span>
              <span><button className="ct-remove" type="button" onClick={() => onRemove(items[row.id - 1])} aria-label={`Remove ${row.matchName || row.importedName}`}><Icon name="icon-x" className="button-icon" /></button></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
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
      image: item.imageUrl || item.selected?.image_url || "",
      source: (item.documentIds || []).includes("scan") ? "scan" : "pdf",
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


const CRL_STATUS = {
  Matched: { cls: "confirmed", label: "Verified Match", icon: "icon-check-circle" },
  Review: { cls: "possible", label: "Verify Match", icon: "icon-alert-triangle" },
  "Not found": { cls: "nomatch", label: "No Match", icon: "icon-x-circle" },
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

// Right-docked detail panel for a reorder-list row. Adapts by mode:
//  - view: an already-matched item (Verified) — confirm or change the match
//  - review: a low-confidence match (Verify Match) — pick the best match
//  - resolve: no catalog match — search to link a product
function MatchPanel({ row, mode, wide, onToggleWide, onClose, onToast }) {
  const isResolve = mode === "resolve";
  const isView = mode === "view";
  const candidates = isResolve ? [] : [
    { name: row.matchName, supplier: row.supplier, sub: row.matchSub, price: row.price, image: row.image, recommended: true },
    ...(row.others || []).map((offer) => ({ name: offer.name, supplier: offer.supplier, sub: offer.sub, price: offer.price, image: "", recommended: false })),
  ];
  const [selected, setSelected] = useState(0);
  const [qty, setQty] = useState(row.qty || 1);
  const [notes, setNotes] = useState("");
  const status = CRL_STATUS[row.status];
  const sourceLabel = row.source === "scan" ? "From Barcode Scan" : row.source === "csv" ? "From Reorder Sheet" : "From Invoice";
  const title = isResolve ? "Resolve item" : isView ? "Product match" : "Verify product match";
  const subtitle = isResolve
    ? "We couldn’t match this item. Find the right product to link."
    : isView
      ? "Confirm or change the product matched to this item."
      : "Please confirm the best match for this imported item.";

  function confirm() {
    onClose();
    onToast(isResolve ? "Product linked to item" : "Match confirmed");
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
              <small>Imported on Jun 2, 2025</small>
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

        {isResolve ? (
          <section className="crl-drawer-section">
            <span className="crl-drawer-label">Find a match</span>
            <label className="crl-search crl-drawer-search">
              <Icon name="icon-search" className="button-icon" />
              <input type="search" placeholder="Search products, SKUs, suppliers…" />
            </label>
            <p className="crl-drawer-empty">No catalog match found yet. Search above to link this item to a product.</p>
          </section>
        ) : (
          <section className="crl-drawer-section">
            <strong className="crl-drawer-subhead">Possible matches</strong>
            <p className="crl-drawer-hint">Select the best match for this item.</p>
            <div className="crl-cand-list">
              {candidates.map((candidate, index) => (
                <label key={index} className={`crl-cand ${selected === index ? "active" : ""}`}>
                  <input type="radio" name="crl-cand" checked={selected === index} onChange={() => setSelected(index)} />
                  <ProductThumb image={candidate.image} alt={candidate.name} />
                  <span className="crl-cand-info">
                    <strong>{candidate.name}</strong>
                    <small>{candidateSub(candidate.supplier, candidate.sub)}</small>
                  </span>
                  <span className="crl-cand-right">
                    <strong>{candidate.price != null ? mrMoney(candidate.price) : "—"}</strong>
                    {candidate.recommended && <span className="crl-cand-rec">Recommended</span>}
                  </span>
                </label>
              ))}
            </div>
            <button className="crl-drawer-link" type="button"><Icon name="icon-search" className="button-icon" />Search for another product</button>
          </section>
        )}

        <section className="crl-drawer-section">
          <span className="crl-drawer-label">Notes (optional)</span>
          <textarea className="crl-drawer-notes" maxLength={500} placeholder="Add a note about this item…" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <div className="crl-drawer-notes-count">{notes.length} / 500</div>
        </section>
      </div>

      <footer className="crl-drawer-foot">
        <button className="crl-ghost-btn" type="button" onClick={onClose}>{isView ? "Close" : "Cancel"}</button>
        <button className="primary-action compact" type="button" onClick={confirm}>{isResolve ? "Confirm Match" : isView ? "Update Match" : "Confirm Selected Match"}</button>
      </footer>
    </aside>
  );
}

function rowMode(row) {
  return row.status === "Not found" ? "resolve" : row.status === "Review" ? "review" : "view";
}

// Mobile card list for the current reorder list (replaces the desktop table on
// phones). Stats band + status tabs + tappable product cards.
function MobileReorderList({ title, rows, stats, totalItems, tab, onTab, onOpenRow }) {
  return (
    <div className="m-list">
      <div className="m-brandbar">
        <BrandMark />
        <button className="m-iconbtn" type="button" aria-label="Alerts">
          <Icon name="icon-bell" className="button-icon" />
          <span className="m-brand-badge">3</span>
        </button>
      </div>

      <header className="m-topbar">
        <h1>{title}</h1>
        <button className="m-iconbtn" type="button" aria-label="Filters"><Icon name="icon-filter" className="button-icon" /></button>
      </header>

      <nav className="m-tabs" aria-label="Item list filters">
        {[["all", `All ${totalItems}`], ["confirmed", `Verified ${stats.matched}`], ["possible", `Verify ${stats.review}`], ["nomatch", `No match ${stats.notFound}`]].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => onTab(id)}>{label}</button>
        ))}
      </nav>

      <div className="m-cards">
        {rows.map((row) => {
          const notFound = row.status === "Not found";
          return (
            <button className="m-card" type="button" key={row.id} onClick={() => onOpenRow(row)}>
              <ProductThumb image={row.image} alt={row.matchName || row.importedName} />
              <span className="m-card-body">
                <strong>{row.matchName || row.importedName}</strong>
                <small>{row.importedSub}</small>
                {row.supplier && row.supplier !== "—" && <small className="m-card-supplier">{row.supplier}</small>}
              </span>
              <span className="m-card-right">
                {notFound
                  ? <em className="m-conf nomatch">Not found</em>
                  : <em className={`m-conf ${mrConfTone(row.confidence)}`}>{row.confidence}%</em>}
                {row.price != null && <strong>{mrMoney(row.price)}</strong>}
                {row.price != null && <small>${mrEa(row.perEa)} / ea</small>}
              </span>
              <Icon name="icon-chevron-right" className="m-card-chev" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Full-screen mobile detail page. Layout follows the mobile mockup; the footer
// actions mirror the desktop MatchPanel (Cancel / Confirm by mode).
function MobileItemDetail({ rows, row, mode, onClose, onOpenRow, onToast }) {
  const idx = rows.findIndex((r) => r.id === row.id);
  const total = rows.length;
  const isResolve = mode === "resolve";
  const isView = mode === "view";
  const candidates = isResolve ? [] : [
    { name: row.matchName, supplier: row.supplier, sub: row.matchSub, price: row.price, perEa: row.perEa, image: row.image, recommended: true, confidence: row.confidence },
    ...(row.others || []).map((offer) => ({ name: offer.name, supplier: offer.supplier, sub: offer.sub, price: offer.price, perEa: offer.perEa, image: "", recommended: false, confidence: offer.confidence })),
  ];
  const [selected, setSelected] = useState(0);
  const [notes, setNotes] = useState("");
  const confLabel = row.confidence == null ? "No catalog match"
    : row.confidence >= 80 ? "High match confidence"
    : row.confidence >= 50 ? "Medium match confidence"
    : "Low match confidence";

  function confirm() {
    onClose();
    onToast(isResolve ? "Product linked to item" : "Match confirmed");
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
        </section>

        {isResolve ? (
          <section className="m-detail-sec">
            <span className="m-detail-label">Find a match</span>
            <label className="crl-search"><Icon name="icon-search" className="button-icon" /><input type="search" placeholder="Search products, SKUs, suppliers…" /></label>
            <p className="m-detail-empty">No catalog match found yet. Search above to link this item to a product.</p>
          </section>
        ) : (
          <>
            <section className="m-detail-sec">
              <span className="m-detail-label">Best match</span>
              <label className={`m-match best ${selected === 0 ? "active" : ""}`}>
                <input type="radio" name="m-cand" checked={selected === 0} onChange={() => setSelected(0)} />
                <ProductThumb image={candidates[0].image} alt={candidates[0].name} />
                <span className="m-match-info"><strong>{candidates[0].name}</strong><small>{candidateSub(candidates[0].supplier, candidates[0].sub)}</small></span>
                <span className="m-match-right"><em className={`m-conf ${mrConfTone(candidates[0].confidence)}`}>{candidates[0].confidence}%</em><strong>{mrMoney(candidates[0].price)}</strong><small>${mrEa(candidates[0].perEa)} / ea</small></span>
              </label>
            </section>
            {candidates.length > 1 && (
              <section className="m-detail-sec">
                <span className="m-detail-label">Other possible matches</span>
                {candidates.slice(1).map((candidate, index) => (
                  <label className={`m-match ${selected === index + 1 ? "active" : ""}`} key={index + 1}>
                    <input type="radio" name="m-cand" checked={selected === index + 1} onChange={() => setSelected(index + 1)} />
                    <span className="m-match-info"><strong>{candidate.name}</strong><small>{candidateSub(candidate.supplier, candidate.sub)}</small></span>
                    <span className="m-match-right"><em className={`m-conf ${mrConfTone(candidate.confidence)}`}>{candidate.confidence}%</em><strong>{mrMoney(candidate.price)}</strong><small>${mrEa(candidate.perEa)} / ea</small></span>
                  </label>
                ))}
              </section>
            )}
          </>
        )}

        <section className="m-detail-sec">
          <span className="m-detail-label">Item details</span>
          <div className="m-itemdetails">
            <div><small>Quantity</small><strong>{row.qty}</strong></div>
            <div><small>UOM</small><strong>{row.uom}</strong></div>
            <div><small>Line total</small><strong>{row.lineTotal != null ? mrMoney(row.lineTotal) : "—"}</strong></div>
          </div>
          <textarea className="m-notes" placeholder="Add a note…" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </section>
      </div>

      <footer className="m-detail-foot">
        <button className="crl-ghost-btn" type="button" onClick={onClose}>{isView ? "Close" : "Cancel"}</button>
        <button className="primary-action compact" type="button" onClick={confirm}>{isResolve ? "Confirm Match" : isView ? "Update Match" : "Confirm Selected Match"}</button>
      </footer>
    </div>
  );
}

function CurrentReorderList({
  items,
  addMode,
  onAddMode,
  lastUpload,
  onCloseUpload,
  onUploadAnother,
  uploadFormRef,
  onUpload,
  uploading,
  uploadProgress,
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
  onToast,
}) {
  const realRows = deriveMatchRows(items);
  const usingReal = realRows.length > 0;
  const rows = (usingReal ? realRows : matchReviewSample).map((row) => ({
    ...row,
    source: row.source || CRL_SAMPLE_SOURCES[row.id] || "pdf",
  }));
  const stats = usingReal ? mrComputeStats(rows) : matchReviewSampleStats;
  const totalItems = usingReal ? rows.length : stats.total;
  const [tab, setTab] = useState("all");
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailWide, setDetailWide] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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
          />
        )}
        {addMode === "upload" && (
          <UploadModal
            uploadFormRef={uploadFormRef}
            onUpload={onUpload}
            uploading={uploading}
            uploadProgress={uploadProgress}
            isDraggingInvoice={isDraggingInvoice}
            onDragStateChange={onDragStateChange}
            onInvoiceDrop={onInvoiceDrop}
            onInvoiceFile={onInvoiceFile}
            selectedInvoiceName={selectedInvoiceName}
            hasUploadedInvoice={hasUploadedInvoice}
            lastUpload={lastUpload}
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
        <div className="crl-title">
          <h2 id="homeHeading">Current Reorder List</h2>
          <span className="crl-autosave"><Icon name="icon-check-circle" className="button-icon" />Autosaved just now</span>
        </div>
        <div className="crl-header-actions">
          <button
            type="button"
            className={`crl-add-scan ${addMode === "scan" ? "active" : ""}`}
            onClick={() => onAddMode(addMode === "scan" ? "" : "scan")}
          >
            <Icon name="icon-scan" className="button-icon" />Scan Barcode
          </button>
          <div className="crl-add-menu-wrap">
            <button
              type="button"
              className="crl-add-btn"
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              onClick={() => setAddMenuOpen((open) => !open)}
            >
              <Icon name="icon-plus" className="button-icon" />
              Add Item
              <span className="crl-add-caret"><Icon name="icon-chevron-down" className="button-icon" /></span>
            </button>
            {addMenuOpen && (
              <>
                <div className="crl-add-menu-backdrop" onClick={() => setAddMenuOpen(false)} />
                <div className="crl-add-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); onAddMode("upload"); }}>
                    <Icon name="icon-cloud-upload" className="button-icon" />
                    <span><strong>Upload</strong><small>Invoice or reorder sheet</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); onAddMode("search"); }}>
                    <Icon name="icon-search" className="button-icon" />
                    <span><strong>Search items</strong><small>Find products in the catalog</small></span>
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="crl-more-wrap">
            <button className="crl-more crl-more-kebab" type="button" aria-haspopup="menu" aria-expanded={moreOpen} aria-label="More actions" onClick={() => setMoreOpen((open) => !open)}>
              <svg className="crl-kebab-dots" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
            </button>
            {moreOpen && (
              <>
                <div className="crl-add-menu-backdrop" onClick={() => setMoreOpen(false)} />
                <div className="crl-add-menu crl-more-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onToast("List archived"); }}>
                    <Icon name="icon-clipboard" className="button-icon" />
                    <span><strong>Archive this list</strong><small>Move to list history</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onToast("List cleared"); }}>
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
                  <SearchResults results={searchResults} searchHref={`/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`} />
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
                  ["confirmed", `Verified Matches (${stats.matched})`],
                  ["possible", `Verify Match (${stats.review})`],
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

            <div className="crl-table">
              <div className="crl-row crl-row-head">
                <span><input type="checkbox" aria-label="Select all" /></span>
                <span>Item</span>
                <span>Source</span>
                <span>Status</span>
                <span>Qty</span>
                <span>Best matched product</span>
                <span className="crl-price-h">Best price <Icon name="icon-info" className="button-icon" /></span>
                <span>Actions</span>
              </div>
              {filtered.map((row) => {
                const status = CRL_STATUS[row.status];
                const notFound = row.status === "Not found";
                const mode = notFound ? "resolve" : row.status === "Review" ? "review" : "view";
                const actionLabel = notFound ? "Resolve" : row.status === "Review" ? "Verify" : "View";
                return (
                  <div className={`crl-row crl-row-click ${detail?.row.id === row.id ? "active" : ""}`} key={row.id} onClick={() => setDetail({ row, mode })}>
                    <span><input type="checkbox" aria-label={`Select ${row.importedName}`} onClick={(event) => event.stopPropagation()} /></span>
                    <span className="crl-item">
                      <ProductThumb image={row.image} alt={row.matchName || row.importedName} />
                      <span className="crl-item-id">
                        <strong>{row.importedName}</strong>
                        <small>SKU on source: {(row.importedSub || "").replace(/^SKU:\s*/, "") || "—"}</small>
                      </span>
                    </span>
                    <span className="crl-source"><Icon name={CRL_SOURCE_ICON[row.source] || "icon-file-text"} className="button-icon" /></span>
                    <span className={`crl-status ${status.cls}`}><Icon name={status.icon} className="button-icon" />{status.label}</span>
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
                          <small>{row.matchSub}</small>
                          <MatchSupplier name={row.supplier} />
                        </>
                      )}
                    </span>
                    <span className="crl-price">
                      {notFound ? <span className="crl-dash">—</span> : (
                        <>
                          <strong>{mrMoney(row.price)}</strong>
                          <small>${mrEa(row.perEa)} / ea</small>
                        </>
                      )}
                    </span>
                    <span className="crl-actions">
                      <button className={`crl-action-btn ${notFound ? "danger" : row.status === "Review" ? "warn" : ""}`} type="button" onClick={() => setDetail({ row, mode })}>{actionLabel}</button>
                      <button className="crl-kebab" type="button" aria-label="Row actions" onClick={(event) => event.stopPropagation()}><Icon name="icon-list" className="button-icon" /></button>
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
            row={detail.row}
            mode={detail.mode}
            wide={detailWide}
            onToggleWide={() => setDetailWide((value) => !value)}
            onClose={() => { setDetail(null); setDetailWide(false); }}
            onToast={onToast}
          />
        ) : (
        <aside className="crl-rail">
          <section className="crl-card">
            <div className="crl-card-head">
              <h3>Buying Preferences</h3>
              {!editingPrefs && (
                <button className="crl-edit-link" type="button" onClick={() => setEditingPrefs(true)}>Edit</button>
              )}
            </div>
            {editingPrefs ? (
              <form className="crl-pref-form" onSubmit={(event) => { event.preventDefault(); setEditingPrefs(false); onToast("Buying preferences saved"); }}>
                <label>
                  <span>Need by date</span>
                  <input type="date" defaultValue="2025-06-20" />
                </label>
                <label>
                  <span>Buying strategy</span>
                  <select defaultValue="best-price">
                    <option value="best-price">Best price</option>
                    <option value="brand-match">Exact brand match</option>
                    <option value="balanced">Balanced</option>
                  </select>
                </label>
                <label>
                  <span>Preferred suppliers</span>
                  <div className="crl-pref-checks">
                    <label><input type="checkbox" defaultChecked /> Patterson Dental</label>
                    <label><input type="checkbox" defaultChecked /> Henry Schein</label>
                    <label><input type="checkbox" defaultChecked /> Darby Dental</label>
                    <label><input type="checkbox" /> Net32</label>
                  </div>
                </label>
                <label>
                  <span>Substitutions</span>
                  <select defaultValue="allowed">
                    <option value="allowed">Allowed</option>
                    <option value="approval">Allowed with approval</option>
                    <option value="none">Not allowed</option>
                  </select>
                </label>
                <div className="crl-pref-actions">
                  <button className="crl-ghost-btn" type="button" onClick={() => setEditingPrefs(false)}>Cancel</button>
                  <button className="primary-action compact" type="submit">Save</button>
                </div>
              </form>
            ) : (
              <div className="crl-pref">
                <div><Icon name="icon-calendar" className="button-icon" /><span>Need by date</span><strong>Jun 20, 2025</strong></div>
                <div><Icon name="icon-check-circle" className="button-icon" /><span>Buying strategy</span><strong>Best price</strong></div>
                <div><Icon name="icon-users" className="button-icon" /><span>Preferred suppliers</span><strong>3 selected</strong></div>
                <div><Icon name="icon-shuffle" className="button-icon" /><span>Substitutions</span><strong>Allowed</strong></div>
              </div>
            )}
          </section>

          <section className="crl-card">
            <h3>Plan Preview</h3>
            <div className="crl-plan">
              <div><span>Estimated total</span><strong>$5,842.16</strong></div>
              <div><span>Suppliers</span><strong>5</strong></div>
              <div><span>Coverage</span><strong>92%</strong></div>
              <div><span>Potential savings</span><strong className="green">$842.15</strong></div>
            </div>
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
          isDraggingInvoice={isDraggingInvoice}
          onDragStateChange={onDragStateChange}
          onInvoiceDrop={onInvoiceDrop}
          onInvoiceFile={onInvoiceFile}
          selectedInvoiceName={selectedInvoiceName}
          hasUploadedInvoice={hasUploadedInvoice}
          lastUpload={lastUpload}
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
  isDraggingInvoice,
  onDragStateChange,
  onInvoiceDrop,
  onInvoiceFile,
  selectedInvoiceName,
  hasUploadedInvoice,
  lastUpload,
  onClose,
  onUploadAnother,
}) {
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
            <p>{lastUpload ? `${lastUpload.items.length} line items from ${lastUpload.name}` : "We read the PDF, match each line to the canonical catalog, and add the matched products to your list."}</p>
          </div>
          <button className="crl-modal-close" type="button" aria-label="Close" onClick={onClose} disabled={uploading}><Icon name="icon-x" className="button-icon" /></button>
        </header>

        {!lastUpload ? (
          <div className="crl-modal-body">
            <form ref={uploadFormRef} onSubmit={onUpload} className="upload-layout">
              <div
                className={`upload-dropzone ${isDraggingInvoice ? "dragging" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); onDragStateChange(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onDragStateChange(false); }}
                onDrop={onInvoiceDrop}
              >
                <div className="upload-icon"><Icon name="icon-cloud-upload" /></div>
                <h3>{uploading ? "Processing invoice..." : isDraggingInvoice ? "Drop your file here" : "Drag and drop your invoice"}</h3>
                <p>{uploading ? selectedInvoiceName : selectedInvoiceName || "or"}</p>
                <span className="select-file-button"><Icon name="icon-cloud-upload" className="button-icon" />Choose file</span>
                <small>Text-based PDF invoice · Max 20MB</small>
                {uploading && (
                  <div className="processing-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}>
                    <div className="processing-track"><div style={{ width: `${uploadProgress}%` }}></div></div>
                    <span>{uploadProgress < 45 ? "Reading PDF" : uploadProgress < 80 ? "Matching products" : "Adding to list"}</span>
                  </div>
                )}
                <input
                  className="file-input"
                  data-testid="invoice-file-input"
                  name="file"
                  type="file"
                  accept=".pdf,application/pdf"
                  required
                  onChange={(event) => onInvoiceFile(event.currentTarget, event.currentTarget.files?.[0])}
                />
                <button className="primary-action compact hidden-submit" data-testid="save-parse-request" type="submit" disabled={uploading}>Add to list</button>
                <input type="hidden" name="clinic" value="Northline Dental" />
                <input type="hidden" name="buyer" value="Alex Kim" />
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
          ) : (
            <button className="crl-ghost-btn" type="button" onClick={onClose} disabled={uploading}>Cancel</button>
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

function HistoryView({ onOpen }) {
  return (
    <div className="crl">
      <header className="crl-header">
        <div className="crl-title"><h2>History / Past Lists</h2></div>
      </header>
      <div className="history-list">
        {ARCHIVED_LISTS.map((list) => (
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

function HistoryDetail({ id, onBack }) {
  const list = ARCHIVED_LISTS.find((entry) => entry.id === id) || ARCHIVED_LISTS[0];
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
      <p className="history-detail-note">This reorder list is archived and read-only. Reopen or duplicate it to start a new reorder, or revisit the supplier handoff.</p>
      <div className="history-detail-actions">
        <button className="primary-action compact" type="button">Reopen list</button>
        <button className="secondary-action compact" type="button">Duplicate</button>
        <button className="secondary-action compact" type="button">View handoff</button>
      </div>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="crl">
      <header className="crl-header">
        <div className="crl-title"><h2>Settings</h2></div>
      </header>
      <div className="settings-grid">
        <div className="ops-panel">
          <p className="eyebrow">Buyer Profile</p>
          <h3>Alex Kim</h3>
          <p>Northline Dental · Buyer</p>
        </div>
        <div className="ops-panel">
          <p className="eyebrow">Default Buying Preferences</p>
          <h3>Exact brand if possible</h3>
          <p>Allow vetted equivalents when they reduce cost and preserve product quality.</p>
        </div>
      </div>
    </div>
  );
}
