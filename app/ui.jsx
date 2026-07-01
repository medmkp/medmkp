"use client";

import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import { BrandLogoMark, Icon } from "./icons";
import { CRL_STATUS, LIST_STATUS, STRATEGY_LABELS, SUBSTITUTION_LABELS, availabilityBadge, brandLogoSrc, candidateSub, formatNeedBy, isQrUrl, listingNameDiffers, mrEa, mrMoney, mrPriceLabel, stripPackFromName, supplierInitials, supplierLogoSrc } from "./lib";

// App-shell subscription-lifecycle banner. `past_due` is a soft warning (card
// retrying) that keeps full access; `canceled`/lapsed tells the buyer their saved
// history is now read-only and points them at resubscribing. Any other status —
// including a fully active account or a backend that doesn't report status yet —
// renders nothing.
export function BillingBanner({ status, onManageBilling }) {
  if (status !== "past_due" && status !== "canceled") return null;
  const pastDue = status === "past_due";
  return (
    <div className={`billing-banner ${pastDue ? "is-past-due" : "is-lapsed"}`} role="status">
      <span className="billing-banner-icon" aria-hidden="true">
        <Icon name={pastDue ? "icon-credit-card" : "icon-lock"} />
      </span>
      <div className="billing-banner-body">
        <strong>
          {pastDue
            ? "Your card needs updating to keep Practice"
            : "Your Practice subscription has ended"}
        </strong>
        <p>
          {pastDue
            ? "We couldn’t charge your card. Update it now to keep your Practice features — nothing is locked yet."
            : "Your saved lists, invoices and reports stay here, read-only. Resubscribe to unlock live savings and new orders."}
        </p>
      </div>
      <button type="button" className="billing-banner-cta" onClick={onManageBilling}>
        {pastDue ? "Manage billing" : "Resubscribe"}
      </button>
    </div>
  );
}

export function useBarcodeScanner({ active, onScan }) {
  const videoRef = useRef(null);
  const [cameraStatus, setCameraStatus] = useState("requesting");
  const [autoDetect, setAutoDetect] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const captureRef = useRef(() => {});
  const grabRef = useRef(() => null);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    // Re-arm on every (re)attempt. iOS standalone PWAs frequently reject the
    // first getUserMedia after a cold launch and offer no refresh to re-prompt,
    // so retry() bumps retryNonce to re-run this effect from a user tap.
    setAutoDetect(false);
    setCameraStatus("requesting");

    let stream;
    let isMounted = true;
    let intervalId;
    let cooldownId;
    let detector = null;
    let cooling = false;
    let lastCode = null;  // last code fired while it stays in frame
    let emptyFrames = 0;  // consecutive frames with no barcode in view
    let rotCanvas = null; // reused offscreen canvas for the rotated re-read
    let lastShot = null;  // frozen frame around the last fired code, for OCR

    // Snapshot the current frame, cropped to a generous neighborhood of the
    // barcode — the lot/expiry text sits on the same label, usually within a
    // barcode's width — so the optional OCR pass runs faster and on fewer
    // distractor strings. Falls back to the full frame when we have no box (the
    // rotated re-read, or a manual shutter press).
    function snapshotAround(box) {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return null;
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      let sx = 0, sy = 0, sw = w, sh = h;
      if (box && box.width && box.height) {
        // Generous: the lot/expiry can sit well above or below the barcode on the
        // same label, so favour including it over a tight crop. Still trims the
        // frame edges, which drops a distractor code from a neighbouring package.
        const padX = box.width * 2, padY = box.height * 5;
        sx = Math.max(0, box.x - padX);
        sy = Math.max(0, box.y - padY);
        sw = Math.min(w - sx, box.width + padX * 2);
        sh = Math.min(h - sy, box.height + padY * 2);
      }
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      return canvas;
    }

    // Fire one scan, then cool down briefly so flicker/misreads between frames
    // don't double-register. A barcode held continuously in frame is suppressed
    // by lastCode in the loop below, so this cooldown only debounces the handoff
    // from one code to the next — kept short so scanning several items in a row
    // keeps up with the buyer instead of dropping the ones in between.
    function fire(code, box) {
      if (cooling) return;
      cooling = true;
      lastCode = code || lastCode;
      // Freeze the frame now, while the package is still in view — OCR runs later
      // (after the async lookup) and the phone will have moved by then. Exposed to
      // the consumer as a lazy getter so the pixels are only read if a lookup
      // comes back without lot/expiry and OCR is actually warranted.
      lastShot = code ? snapshotAround(box) : null;
      // A successful capture buzzes; a website / location QR doesn't — it's not a
      // product, so skip the success haptic and let the consumer show its own
      // "not a product" hint instead.
      if (navigator.vibrate && !isQrUrl(code)) navigator.vibrate(50);
      onScanRef.current?.(code || null, () => lastShot);
      cooldownId = window.setTimeout(() => { cooling = false; }, 800);
    }

    async function detectOn(source) {
      try {
        const codes = await detector.detect(source);
        if (!codes || !codes.length) return null;
        return { value: codes[0].rawValue, box: codes[0].boundingBox || null };
      } catch (error) {
        return null;
      }
    }

    async function detectFrame() {
      const video = videoRef.current;
      if (!video || !detector || video.readyState < 2) return null;

      // Try the frame as-is first — the common case, and the cheapest. Its box is
      // in video-pixel space, so OCR can crop the upright frame to it.
      const upright = await detectOn(video);
      if (upright) return upright;

      // Ladder-oriented codes — a 1D barcode printed rotated 90°, common on
      // bottles, tubes, and unit-dose labels (e.g. the chlorhexidine bottle whose
      // UPC runs top-to-bottom) — don't decode upright because the reader samples
      // a horizontal line across what are now horizontal bars. Re-read a
      // quarter-turned snapshot so those scan without the user rotating the phone.
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;
      if (!rotCanvas) rotCanvas = document.createElement("canvas");
      rotCanvas.width = h;
      rotCanvas.height = w;
      const ctx = rotCanvas.getContext("2d");
      if (!ctx) return null;
      ctx.save();
      ctx.translate(h / 2, w / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(video, -w / 2, -h / 2);
      ctx.restore();
      const rotated = await detectOn(rotCanvas);
      // The box here is in rotated-canvas space — not usable against the upright
      // frame — so drop it and let OCR fall back to the full frame.
      return rotated ? { value: rotated.value, box: null } : null;
    }

    // Shutter press: read the current frame; proceed even if no barcode is
    // decoded so the manual capture path always adds an item.
    captureRef.current = async () => {
      const hit = await detectFrame();
      fire(hit?.value || null, hit?.box || null);
    };

    // Grab a fresh snapshot of the LIVE frame on demand. The post-scan OCR loop
    // calls this repeatedly while the buyer holds the label in view, so a later,
    // glare-free frame can read the lot/expiry the first frame missed.
    grabRef.current = () => snapshotAround(null);

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("unsupported");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // Capture as high as the device offers (ideal degrades gracefully):
            // small / dense codes — unit-dose labels, GS1 Data Matrix — need the
            // extra pixels to resolve. Continuous autofocus keeps a close-held
            // package sharp as the buyer moves it under the camera.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" }],
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
              formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128", "code_39", "data_matrix", "qr_code"],
            });
          } catch (error) {
            detector = null; // import failed → stay on manual entry
          }
        }

        if (detector && isMounted) {
          setAutoDetect(true);
          intervalId = window.setInterval(async () => {
            const hit = await detectFrame();
            if (!hit) {
              // Barcode out of view for a beat → let it fire again next time it's
              // presented, so the buyer can deliberately re-scan an item. A
              // website / location QR is the exception: keep it muted once
              // announced so a placard flickering in and out of frame doesn't
              // re-trigger the "not a product" warning over and over.
              if (++emptyFrames >= 3 && !isQrUrl(lastCode)) lastCode = null;
              return;
            }
            emptyFrames = 0;
            if (hit.value === lastCode) return;  // same barcode still in frame → ignore
            fire(hit.value, hit.box);
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
      grabRef.current = () => null;
    };
  }, [active, retryNonce]);

  const capture = useCallback(() => captureRef.current(), []);
  const grabFrame = useCallback(() => grabRef.current(), []);
  const retry = useCallback(() => setRetryNonce((nonce) => nonce + 1), []);
  return { videoRef, cameraStatus, autoDetect, capture, grabFrame, retry };
}

// Phone-handoff QR: encodes an absolute scan URL so the buyer can point their
// phone's camera at it and run the scanner there (where the camera is far
// better than a desktop webcam). Rendered with @zxing/library — already a
// dependency for reading barcodes — and lazy-loaded so it stays out of the
// initial bundle. Black modules on a forced-white card so it scans in any theme.
export function ScanHandoffQr({ url }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    (async () => {
      try {
        const { BrowserQRCodeSvgWriter, EncodeHintType } = await import("@zxing/library");
        if (!alive || !ref.current) return;
        const hints = new Map();
        hints.set(EncodeHintType.ERROR_CORRECTION, "M");
        hints.set(EncodeHintType.MARGIN, 1);
        const svg = new BrowserQRCodeSvgWriter().write(url, 240, 240, hints);
        const size = svg.getAttribute("width") || 240;
        svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("class", "scan-qr-svg");
        ref.current.replaceChildren(svg);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  if (failed) {
    return <p className="scan-qr-fallback">Couldn&rsquo;t render the code. Open <strong>{url}</strong> on your phone.</p>;
  }
  return <div className="scan-qr-canvas" ref={ref} role="img" aria-label="QR code — scan it with your phone to open the barcode scanner" />;
}

// The verify moment: after each scan/lookup, surface what matched so the buyer
// can confirm it at a glance before scanning the next item. Matched/review
// cards auto-dismiss so they don't block the next scan; a no-match card sticks
// around and offers a way to key the code in by hand.

export function ScanResultCard({ result, className = "", onClear, onEnterManually, showCompare = false }) {
  useEffect(() => {
    if (!result || result.status === "Not found") return undefined;
    const timer = window.setTimeout(() => onClear?.(), 3500);
    return () => window.clearTimeout(timer);
  }, [result, onClear]);

  if (!result) return null;
  const { item, status, isDuplicate, qty } = result;
  const notFound = status === "Not found";
  // How many suppliers we have a price from for this item — the honest breadth
  // behind the "best price" shown. Only surfaced on the public price-benchmark
  // card (showCompare), and only when there's a real comparison to claim (≥2).
  const supplierCount = new Set((item.offers || []).map((o) => o?.supplier).filter(Boolean)).size;
  const compareLabel = showCompare && supplierCount >= 2 ? `Compared across ${supplierCount} suppliers` : "";
  const offer = item.bestOffer;
  const rawPrice = offer?.price ?? (item.oldUnitPrice || null);
  const priceMissing = !notFound && (rawPrice == null || rawPrice <= 0);
  const price = priceMissing ? null : rawPrice;
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
              : `${offer?.supplier || item.oldVendor || item.matchBrand || "Supplier pending"}${item.unit ? ` · ${item.unit}` : ""}`}
        </small>
        {!notFound && !isDuplicate && compareLabel && <small className="src-compare">{compareLabel}</small>}
      </div>
      <div className="src-right">
        {!notFound && !isDuplicate && priceMissing && <small className="src-noprice">Price not listed</small>}
        {!notFound && !isDuplicate && price != null && <strong>{mrMoney(price)}</strong>}
        {!notFound && !isDuplicate && !priceMissing && offer?.perUnit != null && <small>${mrEa(offer.perUnit)} / ea</small>}
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

export function QtyStepper({ qty, setQty }) {
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


export function CatalogSupplierAvatar({ name }) {
  const logo = supplierLogoSrc(name);
  return (
    <span className={`cat-supplier-avatar ${logo ? "has-img" : ""}`}>
      {logo ? <img src={logo} alt="" /> : supplierInitials(name)}
    </span>
  );
}


export function MatchSupplier({ name }) {
  if (!name || name === "—") return <span className="mr-supplier-none">—</span>;
  const key = name.toLowerCase();
  if (key.includes("3m")) return <span className="mr-supplier mr-logo-3m">3M</span>;
  if (key.includes("metrex")) return <span className="mr-supplier mr-logo-metrex">Metrex</span>;
  const logo = supplierLogoSrc(name);
  if (logo) return (<span className="mr-supplier"><img className="mr-supplier-img" src={logo} alt="" /><span>{key.includes("schein") ? "Henry Schein" : name}</span></span>);
  return <span className="mr-supplier">{name}</span>;
}

// Manufacturer brand mark for the Matched product column. Shows the brand's logo
// alone (no name) when we have one; falls back to a muted brand name so the
// column still identifies the product, and renders nothing when no brand at all.
export function MatchManufacturer({ name }) {
  const logo = brandLogoSrc(name);
  if (logo) return <span className="mr-mfr"><img className="mr-mfr-img" src={logo} alt={name || ""} title={name || ""} /></span>;
  if (name) return <span className="mr-mfr-name">{name}</span>;
  return null;
}

// Maps the barcodes on /test-barcodes.html to catalog products so a scan
// produces a real matched item. Unknown codes still get added as "needs review".

export function ListStatusPill({ status }) {
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

export function ProductThumb({ image, alt }) {
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


// Shared mobile product card. Both the reorder list and the location items list
// render their phone rows through this so the two surfaces read as one system:
// a 44px thumbnail, a title with up to a few muted meta lines, a right-aligned
// slot (price block on reorder, status badge on location), and a chevron. The
// card is a tappable <button>; the caller owns what tapping does. `swipeProps` +
// `style` let the reorder card layer its swipe-to-delete gesture on top without
// the location list having to know about it. Uses the existing global `.m-card*`
// classes, so no new styling.
export function ProductCard({ thumb, thumbAlt, title, meta, right, onClick, swipeProps, style, className }) {
  return (
    <button
      type="button"
      className={`m-card ${className || ""}`}
      onClick={onClick}
      style={style}
      {...(swipeProps || {})}
    >
      <ProductThumb image={thumb} alt={thumbAlt || title} />
      <span className="m-card-body">
        <strong>{title}</strong>
        {(meta || []).filter(Boolean).map((line, i) =>
          typeof line === "string"
            ? <small key={i}>{line}</small>
            : <Fragment key={i}>{line}</Fragment>,
        )}
      </span>
      <span className="m-card-right">{right}</span>
      <Icon name="icon-chevron-right" className="button-icon m-card-chev" />
    </button>
  );
}

// Shared right-docked detail drawer shell. The reorder match panel and the
// location product/lot drawer both render through this so they share one
// "drawer setup": a sticky header (lead node + title/subtitle + optional
// wide-toggle + close), a scrollable body the caller fills with
// `.crl-drawer-section`s, and an optional sticky footer for actions. Class names
// are the existing global `.crl-drawer-*` (also driving the ≤767px full-screen
// behaviour via `.crl-detail`), so adopting it changes no styling. `lead` is an
// arbitrary node — reorder passes its green shield, location passes a product
// thumbnail — keeping the header flexible per surface.
export function DetailDrawer({ lead, title, subtitle, label, wide, onToggleWide, onClose, footer, children, className }) {
  return (
    <aside className={`crl-detail ${className || ""}`} role="region" aria-label={label || title}>
      <header className="crl-drawer-head">
        <div className="crl-drawer-title">
          {lead}
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        <div className="crl-drawer-head-actions">
          {onToggleWide && (
            <button type="button" aria-label={wide ? "Collapse panel" : "Expand panel"} onClick={onToggleWide}><span aria-hidden="true">⤢</span></button>
          )}
          <button type="button" aria-label="Close" onClick={onClose}><Icon name="icon-x" className="button-icon" /></button>
        </div>
      </header>

      <div className="crl-drawer-body">{children}</div>

      {footer && <footer className="crl-drawer-foot">{footer}</footer>}
    </aside>
  );
}


export function CandidateSub({ supplier, sub }) {
  const logo = supplierLogoSrc(supplier);
  return (
    <small className="crl-cand-sub">
      {logo && <img className="crl-cand-supplier-logo" src={logo} alt="" />}
      {candidateSub(supplier, sub)}
    </small>
  );
}

// Supplier-led candidate label. The canonical product name is the single
// headline shown above the offer list, so each row leads with the supplier
// (logo + name) rather than repeating a near-identical listing title. We surface
// the supplier's own title only as a muted "Listed as:" when it meaningfully
// differs from the canonical name — that divergence is the buyer's signal to
// double-check the match. When the offer carries a product URL, the supplier
// links out to its store (new tab); stopPropagation keeps the click from
// toggling the radio.

export function CandidateName({ supplier, name, canonicalName, productUrl }) {
  const logo = supplierLogoSrc(supplier);
  const listedAs = listingNameDiffers(canonicalName, name) ? stripPackFromName(name) : null;
  return (
    <>
      <span className="crl-cand-name">
        {logo && <img className="crl-cand-supplier-logo" src={logo} alt="" />}
        <strong>{supplier || stripPackFromName(name)}</strong>
        {productUrl && (
          <a
            className="crl-cand-name-link"
            href={productUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            aria-label="View on supplier store"
            title="View on supplier store"
          >
            <Icon name="icon-link" className="button-icon" />
          </a>
        )}
      </span>
      {listedAs && <small className="crl-cand-listed">Listed as: {listedAs}</small>}
    </>
  );
}

// Per-offer stock chip for the candidate list, so the buyer can see which
// suppliers are out of (or low on) stock when choosing the match.

export function CandidateStock({ availability, liveAvailable }) {
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

export function useProductSearch(active) {
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

export function ProductSearchResults({ query, results, loading, onPick, emptyHint }) {
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
              <strong>{mrPriceLabel(price)}</strong>
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

export function BuyingPreferencesCard({ prefs, supplierOptions, onSave, onToast, title = "Buying Preferences", savedMessage = "Buying preferences saved" }) {
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


// Mobile is a scanner appliance for on-site work; full management (catalog,
// reports, savings, evidence editing, history) is a desktop experience. When one
// of those surfaces is opened on a phone it still works, but this banner sets the
// expectation rather than pretending the phone is the place to do it.
// Shared mobile app header: a back affordance + the centered TraceDDS brand,
// with an optional right slot for per-screen actions. On a phone the app topbar
// is hidden, so every on-site screen renders this (matching the scanner and the
// evidence viewer) instead of an ad-hoc per-screen header. The screen's own
// title lives as an H1 below the bar, per the wireframe frames.
export function MobileHeader({ onBack, backLabel = "Back to scanning", actions = null }) {
  return (
    <header className={`m-appbar${actions ? " has-actions" : ""}`}>
      <button type="button" className="m-appbar-back" onClick={onBack} aria-label={backLabel}>
        <Icon name="icon-chevron-left" />
      </button>
      <span className="m-appbar-brand" aria-label="TraceDDS">
        <BrandLogoMark className="m-appbar-mark" />
        <span className="m-appbar-word"><span className="m-appbar-trace">Trace</span><span className="m-appbar-dds">DDS</span></span>
      </span>
      <span className="m-appbar-right">{actions}</span>
    </header>
  );
}

export function DesktopOnlyHint({ label = "full management", onBack }) {
  return (
    <div className="desktop-only-hint" role="note">
      <Icon name="icon-info" className="button-icon" />
      <span>Best viewed on desktop for {label}.</span>
      {onBack && (
        <button type="button" className="desktop-only-hint-back" onClick={onBack}>
          <Icon name="icon-chevron-left" className="button-icon" />
          Back to scanning
        </button>
      )}
    </div>
  );
}


export function ConfirmModal({ title, body, confirmLabel = "Confirm", secondaryLabel, destructive = false, onConfirm, onSecondary, onClose }) {
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
          {secondaryLabel && onSecondary && (
            <button className="secondary-action compact" type="button" onClick={onSecondary}>{secondaryLabel}</button>
          )}
          <button className={`primary-action compact${destructive ? " danger" : ""}`} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </div>
    </div>
  );
}

// The "Unlock Practice" paywall. Rendered when a gated feature (invoice matching,
// savings) returns a 402 for a practice without an active subscription. It sits
// over the real content — which the caller blurs + marks `inert` — so the value
// stays visible behind the lock. Desktop: a centered card; mobile (≤900px): a
// bottom sheet with 44px tap targets (see styles.css). The lock is conveyed by
// icon + text, never blur alone. "Upgrade" starts Stripe Checkout (backend #546)
// and redirects to the returned URL.
export function PracticePaywall({ onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setError(body.error || "Couldn’t start checkout. Please try again.");
    } catch {
      setError("Couldn’t reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="paywall-overlay" role="dialog" aria-modal="true" aria-labelledby="paywallTitle">
      <div className="paywall-card">
        <span className="paywall-lock" aria-hidden="true"><Icon name="icon-lock" /></span>
        <h2 id="paywallTitle" className="paywall-title">Unlock Practice</h2>
        <p className="paywall-benefit">Match every invoice and keep an audit-ready record of every lot you scan.</p>
        <p className="paywall-price"><strong>$149</strong> / location / month</p>
        {error && <p className="paywall-error" role="alert">{error}</p>}
        <button type="button" className="primary-action paywall-upgrade" onClick={startCheckout} disabled={busy}>
          {busy ? "Starting checkout…" : "Upgrade"}
        </button>
        <button type="button" className="paywall-dismiss" onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}

