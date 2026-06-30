"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogoMark, Icon, QrScanGlyph } from "./icons";
import { formatExpiryDate, isQrUrl, parseLocationQr } from "./lib";
import { ProductSearchResults, useBarcodeScanner, useProductSearch } from "./ui";
import s from "./scanmobile.module.css";

// Mobile scan flow. One scanner, no modes: pick a location, then scan. Each scan
// files to that location — a lot not yet on the shelf is received, a lot already
// on file is confirmed present (the backend infers which; the post-scan drawer
// labels it). Running low? That's the reorder scanner at /app/scan, reached from
// the reorder list — a separate surface, not a mode here. Desktop keeps its
// two-column layout in scansessions.jsx; this module is the phone surface those
// views hand off to.

const TYPE_META = {
  operatory: { icon: "icon-dental-chair", tint: s.tBlue },
  cabinet: { icon: "icon-cabinet", tint: s.tIndigo },
  sterilization: { icon: "icon-shield-check", tint: s.tTeal },
  lab: { icon: "icon-microscope", tint: s.tViolet },
  storage: { icon: "icon-package", tint: s.tSlate },
  emergency_kit: { icon: "icon-alert-triangle", tint: s.tRed },
  other: { icon: "icon-map-pin", tint: s.tBlue },
};
const typeMeta = (type) => TYPE_META[type] || TYPE_META.other;

function offerSku(line) {
  return line?._offer?.sku || line?.barcode || "";
}
function offerPack(line) {
  const o = line?._offer;
  if (!o) return "";
  if (o.pack_size) return o.pack_size;
  if (o.pack_quantity && o.base_unit) return `${o.pack_quantity} ${o.base_unit} / pack`;
  return "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ── Account menu ──────────────────────────────────────────────────────
// The mobile sign-out path. Phones have no nav rail / topbar user menu, so
// the scan-first home carries identity in a trailing avatar that opens a
// menu (Settings + Sign out). Sign out is destructive and confirms in-place
// before clearing the session — it's a shared practice device.
function AccountMenu({ account, onSignOut, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef(null);

  const close = () => { setOpen(false); setConfirming(false); };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = account?.initials || "··";
  const name = account?.name || "Your account";
  const detail = account?.email || account?.practice || "";

  return (
    <div className={s.acct} ref={wrapRef}>
      <button
        type="button"
        className={s.acctBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {initials}
      </button>
      {open && (
        <div className={s.acctMenu} role="menu">
          <div className={s.acctHead}>
            <span className={s.acctAvatarLg}>{initials}</span>
            <span className={s.acctId}>
              <strong>{name}</strong>
              {detail && <small>{detail}</small>}
            </span>
          </div>
          {confirming ? (
            <div className={s.acctConfirm}>
              <p>Sign out of TraceDDS?</p>
              <div className={s.acctConfirmRow}>
                <button type="button" className={s.acctCancel} onClick={() => setConfirming(false)}>Cancel</button>
                <button type="button" className={s.acctSignout} onClick={() => { close(); onSignOut?.(); }}>Sign out</button>
              </div>
            </div>
          ) : (
            <>
              <button role="menuitem" type="button" className={s.acctItem} onClick={() => { close(); onNavigate?.("/app/settings"); }}>
                <Icon name="icon-settings" />
                Settings
              </button>
              <button role="menuitem" type="button" className={`${s.acctItem} ${s.acctItemDanger}`} onClick={() => setConfirming(true)}>
                <Icon name="icon-logout" />
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Screens 1 + 2: Start scan / Choose location ──────────────────────

export function MobileScanStart({
  loading, locations, starting, startLocationId, needsAttention,
  onStart, onNavigate, account, onSignOut,
}) {
  // "home" | "choose-location"
  const [step, setStep] = useState("home");

  // Deep-link from a printed location QR: the URL carries the location id, so
  // the flow starts scoped to that one location (no home, no location picker).
  const scopedLocation = useMemo(
    () => (startLocationId ? (locations || []).find((l) => l.id === startLocationId) : null),
    [startLocationId, locations],
  );
  // Scanning a label drops straight into the camera: auto-start scanning for that
  // location. Fire once.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (startLocationId && scopedLocation) {
      autoStarted.current = true;
      onStart(scopedLocation);
    }
  }, [startLocationId, scopedLocation, onStart]);

  const attnItems = needsAttention?.items || 0;
  const attnLocs  = needsAttention?.locations || 0;

  // ── Screen: deep-link from a printed QR — auto-starting into the camera ──
  // Hold on a quiet loading screen while the shelf-audit session is created and
  // we navigate into the scanner. A stale/deleted location id falls through to
  // the normal start screen rather than dead-ending.
  if (startLocationId && (scopedLocation || loading)) {
    return (
      <div className={s.screen}>
        <div className={`${s.body} ${s.bodyTop}`}>
          <div className={s.emptyNote}>{scopedLocation ? "Starting scan…" : "Loading…"}</div>
        </div>
      </div>
    );
  }

  // ── Screen: choose location, then straight into the scanner ─────────
  // No scan "mode" to pick first — scanning is scoped to one location, so the
  // location is the first (and only) thing to choose before the camera opens.
  if (step === "choose-location") {
    return (
      <MobileScanLocationGate
        locations={locations}
        starting={starting}
        onPick={(loc) => onStart(loc)}
        onReorder={() => onNavigate?.("/app/scan")}
        onBack={() => setStep("home")}
        onManage={() => onNavigate?.("/app/locations")}
      />
    );
  }

  // ── Screen: home ────────────────────────────────────────────────────
  // A slim app bar carries the brand and the account menu — phones have no nav
  // rail, so this is where identity and sign-out live. The H1 below is still the
  // screen title.
  return (
    <div className={s.screen}>
      <header className={s.appbar}>
        <span className={s.appbarSpacer} aria-hidden="true" />
        <span className={s.appbarBrand}>
          <BrandLogoMark className={s.appbarMark} />
          <span className={s.appbarWordmark}>
            <span className={s.appbarTrace}>Trace</span><span className={s.appbarDds}>DDS</span>
          </span>
        </span>
        <AccountMenu account={account} onSignOut={onSignOut} onNavigate={onNavigate} />
      </header>
      <div className={s.body}>
        <div className={s.intro}>
          <h1 className={s.h1}>Start scanning</h1>
          <p className={s.sub}>Pick a location and scan its shelves — every scan is saved as you go.</p>
        </div>

        {attnItems > 0 && (
          <button type="button" className={s.attnCard} onClick={() => onNavigate?.("/app/needs-attention")}>
            <span className={s.attnIcon}><Icon name="icon-alert-triangle" /></span>
            <span className={s.attnBody}>
              <span className={s.attnTitle}>{attnItems} item{attnItems === 1 ? "" : "s"} need{attnItems === 1 ? "s" : ""} attention</span>
              <span className={s.attnSub}>Across {attnLocs} location{attnLocs === 1 ? "" : "s"} · expiring, low, or missing lot/expiry</span>
            </span>
            <span className={s.attnChevron}><Icon name="icon-chevron-right" /></span>
          </button>
        )}

        {loading ? (
          <div className={s.emptyNote}>Loading…</div>
        ) : (
          <>
            <div className={s.actionList}>
              <button type="button" className={s.actionRow} onClick={() => setStep("choose-location")}>
                <span className={s.actionIcon}><Icon name="icon-plus" /></span>
                <span className={s.actionText}>
                  <span className={s.actionTitle}>Scan a location</span>
                  <span className={s.actionSub}>Pick a location and scan its shelves</span>
                </span>
                <span className={s.actionChevron}><Icon name="icon-chevron-right" /></span>
              </button>
            </div>

            <div className={s.assurance}>
              <Icon name="icon-shield-check" />
              Exact matches land straight on the location; anything else waits in Needs Attention.
            </div>

            {/* On-site hub: the surfaces that matter while scanning. Full
                management (catalog, reports, savings, evidence editing) lives
                on desktop, so it's deliberately not listed here. */}
            <div className={s.sectionLabel}>On-site</div>
            <div className={s.actionList}>
              <button type="button" className={s.actionRow} onClick={() => onNavigate?.("/app/locations")}>
                <span className={s.actionIcon}><Icon name="icon-map-pin" /></span>
                <span className={s.actionText}>
                  <span className={s.actionTitle}>Locations</span>
                  <span className={s.actionSub}>Browse and scan any location</span>
                </span>
                <span className={s.actionChevron}><Icon name="icon-chevron-right" /></span>
              </button>
              <button type="button" className={s.actionRow} onClick={() => onNavigate?.("/app/needs-attention")}>
                <span className={s.actionIcon}><Icon name="icon-alert-triangle" /></span>
                <span className={s.actionText}>
                  <span className={s.actionTitle}>Needs attention</span>
                  <span className={s.actionSub}>Expiring, low, or missing lot/expiry</span>
                </span>
                <span className={s.actionChevron}><Icon name="icon-chevron-right" /></span>
              </button>
              <button type="button" className={s.actionRow} onClick={() => onNavigate?.("/app/reorder-list")}>
                <span className={s.actionIcon}><Icon name="icon-cart" /></span>
                <span className={s.actionText}>
                  <span className={s.actionTitle}>Reorder list</span>
                  <span className={s.actionSub}>What you&rsquo;re restocking</span>
                </span>
                <span className={s.actionChevron}><Icon name="icon-chevron-right" /></span>
              </button>
              <button type="button" className={s.actionRow} onClick={() => onNavigate?.("/app/evidence/viewer")}>
                <span className={s.actionIcon}><Icon name="icon-shield-check" /></span>
                <span className={s.actionText}>
                  <span className={s.actionTitle}>On-site evidence</span>
                  <span className={s.actionSub}>Show filed evidence to an auditor</span>
                </span>
                <span className={s.actionChevron}><Icon name="icon-chevron-right" /></span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Scan location gate ────────────────────────────────────────────────
// Scanning is scoped to one location and its items file there, so picking the
// location is the first action — it opens that location's scanner, then scanning
// begins. No scan "mode" to choose first.
function MobileScanLocationGate({ locations, starting, onPick, onBack, onManage, onReorder }) {
  const [sheetOpen, setSheetOpen] = useState(true);

  return (
    <div className={s.camera} aria-label="Choose a location to scan">
      <div className={s.cameraScrim} aria-hidden="true" />

      <div className={s.camTop}>
        <button type="button" className={s.camCircle} onClick={onBack} aria-label="Back">
          <Icon name="icon-chevron-left" />
        </button>
        <span className={s.camBrand}>
          <BrandLogoMark className={s.camBrandMark} />
          <span className={s.camWordmark}>
            <span className={s.camWordTrace}>Trace</span><span className={s.camWordDds}>DDS</span>
          </span>
        </span>
        <span className={s.camRight} />
      </div>

      <div className={s.contextStrip}>
        <button type="button" className={s.locPill} onClick={() => setSheetOpen(true)}>
          <Icon name="icon-map-pin" />
          <span className={s.locPillName}>Set location</span>
          <span className={s.locPillCaret}><Icon name="icon-chevron-down" /></span>
        </button>
      </div>

      <div className={s.camFrame} aria-hidden="true"><span /><span /><span /><span /></div>
      <div className={s.camHint}>{starting ? "Starting…" : "Choose a location to start scanning"}</div>

      {sheetOpen && (
        <LocationSheet
          locations={locations}
          currentId={null}
          onClose={() => setSheetOpen(false)}
          onPick={(loc) => { if (!starting) onPick(loc); }}
          onReorder={onReorder}
          onManage={onManage}
        />
      )}
    </div>
  );
}

// ── Camera + post-scan capture drawer ─────────────────────────────────

export function MobileScanSession({
  location, items, active,
  pendingItem, ocrBusy, ocrSuggestion,
  onScan, onAddProduct, onLinkProduct, onPatchItem, onBack, onClearPending,
  locations, onSwitchLocation, onNavigate,
}) {
  const [sheet, setSheet] = useState(null); // manual | search | location
  const pulseTimer = useRef();
  const [captured, setCaptured] = useState(false);

  // The drawer floats over a LIVE camera (like the reorder scanner) so the next
  // item can be aimed and scanned without dismissing the drawer first; only a
  // full input sheet (Enter SKU / Search) pauses scanning.
  const cameraActive = active && !sheet;

  const { videoRef, cameraStatus, autoDetect, retry } = useBarcodeScanner({
    active: cameraActive,
    onScan: (code, getShot) => {
      // A printed location placard QR (our cabinet labels) carries a location id —
      // scanning one switches which location scans file into, rather than being
      // filed as a non-product. It's not an item, so don't run the scan handler or
      // flash the green capture pulse. Pointing at the current location's own
      // placard is a no-op.
      const locId = parseLocationQr(code);
      if (locId) {
        const loc = locId !== location?.id && locations.find((l) => l.id === locId);
        if (loc) onSwitchLocation(loc);
        return;
      }
      onScan(code, getShot);
      // A website QR isn't a product — the parent shows a "not a product" toast.
      // Skip the green "captured" pulse so pointing at one mid-scan doesn't strobe.
      if (isQrUrl(code)) return;
      setCaptured(true);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  // Pre-warm the on-device OCR reader once the camera is live, so the first
  // uncarried-barcode scan that needs a lot/expiry read isn't blocked on the
  // one-time model download.
  const [ocrLoad, setOcrLoad] = useState({ phase: "idle", progress: 0 });
  const cameraReady = cameraStatus === "ready";
  useEffect(() => {
    if (!cameraReady) return undefined;
    let unsub;
    let cancelled = false;
    import("./ocrLabel").then((m) => {
      if (cancelled) return;
      unsub = m.onOcrLoad(setOcrLoad);
      m.warmOcr();
    });
    return () => { cancelled = true; unsub?.(); };
  }, [cameraReady]);
  // Only surface the "preparing" pill if the load is actually slow (a fresh
  // device); a cached load finishes before this fires and never flashes the bar.
  const [showOcrLoad, setShowOcrLoad] = useState(false);
  useEffect(() => {
    if (ocrLoad.phase !== "loading") { setShowOcrLoad(false); return undefined; }
    const t = setTimeout(() => setShowOcrLoad(true), 500);
    return () => clearTimeout(t);
  }, [ocrLoad.phase]);

  // The current scanning location — every scan lands here; change the location
  // pill to file the next items somewhere else.
  const locName = location?.name || "Set location";
  const scanCount = items.length;

  // ----- Camera -----
  return (
    <div className={`${s.camera} ${captured ? s.scanCaptured : ""}`} aria-label="Scan items">
      <video ref={videoRef} className={s.cameraVideo} playsInline muted autoPlay aria-label="Live camera preview" />
      <div className={s.cameraScrim} aria-hidden="true" />

      {cameraStatus !== "ready" && (
        <div className={s.camPermission}>
          <Icon name="icon-scan" />
          <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
          <p>
            {cameraStatus === "requesting"
              ? "Allow camera access to scan item barcodes."
              : "Tap Try again, or use Enter SKU to key it in."}
          </p>
          {cameraStatus !== "requesting" && (
            <button type="button" className={s.camRetry} onClick={retry}><Icon name="icon-refresh" /> Try again</button>
          )}
        </div>
      )}

      <div className={s.camTop}>
        <button
          type="button"
          className={s.camCircle}
          onClick={() => (location?.id ? onNavigate?.(`/app/locations/${location.id}`) : onBack?.())}
          aria-label="Exit scanner"
        >
          <Icon name="icon-chevron-left" />
        </button>
        <span className={s.camBrand}>
          <BrandLogoMark className={s.camBrandMark} />
          <span className={s.camWordmark}>
            <span className={s.camWordTrace}>Trace</span><span className={s.camWordDds}>DDS</span>
          </span>
        </span>
        <span className={s.camRight}>
          {/* Scan glyph with a running count of items captured this run; taps
              through to the location's items (where they've already landed). */}
          {scanCount > 0 && (
            <button
              type="button"
              className={s.camReviewBtn}
              onClick={() => onNavigate?.(location?.id ? `/app/locations/${location.id}` : "/app/locations")}
              aria-label={`View ${scanCount} scanned items`}
            >
              <QrScanGlyph />
              <span className={s.camCountBadge}>{scanCount > 99 ? "99+" : scanCount}</span>
            </button>
          )}
        </span>
      </div>

      {/* Context strip — the location pill, anchored under the header so it holds
          its position across the scan → post-scan transition (the sheet rises
          underneath it, nothing hops). The pill switches which location upcoming
          scans file into. The OCR pill below shows the one-time reader download
          or, once ready, what a label read filled in. */}
      <div className={s.contextStrip}>
        <button type="button" className={s.locPill} onClick={() => setSheet("location")}>
          <Icon name="icon-map-pin" />
          <span className={s.locPillName}>{locName}</span>
          <span className={s.locPillCaret}><Icon name="icon-chevron-down" /></span>
        </button>
        {showOcrLoad ? (
          <OcrLoadPill progress={ocrLoad.progress} />
        ) : (
          <OcrHintPill ocrBusy={ocrBusy} suggestion={ocrSuggestion} />
        )}
      </div>

      <div className={s.camFrame} aria-hidden="true"><span /><span /><span /><span /></div>
      {cameraStatus === "ready" && (
        <div className={s.camHint}>
          {pendingItem ? "Point at the next item to keep scanning" : "Point at a barcode"}
        </div>
      )}

      {/* Post-scan drawer over a LIVE camera (lot / expiry, plus a received date
          for a fresh receive) — keyed by item so the next scan remounts it and the
          previous item's edits persist on unmount. The item has already landed on
          the current location; the drawer just enriches its traceability. */}
      {pendingItem && (
        <CaptureScanSheet
          key={pendingItem.id}
          line={pendingItem}
          locationName={locName}
          suggestion={ocrSuggestion}
          onLinkProduct={onLinkProduct}
          onPersist={(id, body) => onPatchItem(id, body)}
          onDismiss={(id, body) => { onPatchItem(id, body); onClearPending?.(); }}
        />
      )}

      {sheet === "manual"   && <ManualSheet onClose={() => setSheet(null)} onSubmit={(code) => { onScan(code); setSheet(null); }} />}
      {sheet === "search"   && <SearchSheet title="Search product" onClose={() => setSheet(null)} onPick={(p) => { onAddProduct(p); setSheet(null); }} />}
      {sheet === "location" && (
        <LocationSheet
          locations={locations}
          currentId={location?.id || null}
          onClose={() => setSheet(null)}
          onPick={(loc) => {
            setSheet(null);
            // Set where upcoming scans land. Already-scanned items stay where they
            // landed.
            if (loc.id !== location?.id) onSwitchLocation(loc);
          }}
          onManage={() => { setSheet(null); onNavigate?.("/app/locations"); }}
        />
      )}
    </div>
  );
}

// ── /app/scan — quick scan into the reorder list (rich camera overlay) ─────
// Reuses the Receiving/Shelf-Audit camera shell + bottom drawer, but its only
// output is the reorder list: no scan session, no evidence log. Each scan opens
// a drawer to capture lot / expiry / location / qty on the item (kept on the
// reorder line), minus the shelf-audit status step. The top-right button is the
// scan glyph with a running count that taps through to the reorder list.

export function MobileReorderScan({
  active = true, scanResult, scanCount = 0,
  onScan, onClearScanResult, onApplyDetails, onSearchAdd, onCaptureLabel, onReview, onBack,
}) {
  const [sheet, setSheet] = useState(null); // manual (Enter code)
  const [captured, setCaptured] = useState(false);
  const pulseTimer = useRef();

  // Outcome of the latest scan, set by the parent: "added" (new match),
  // "duplicate" (already on the list), "unmatched" (real code, no catalog
  // match), or "qr" (a website QR — skipped). Drives the acknowledgement shown.
  const kind = scanResult?.kind;
  // Keep the camera live behind every acknowledgement — the compact matched
  // drawer, the unmatched decision sheet, and the transient pills all float over
  // a running viewfinder so the next item scans without dismissing anything
  // first (no more black screen on a no-match). Only a full input sheet (Enter
  // code / Search the catalog) pauses scanning.
  const cameraActive = active && !sheet;

  const { videoRef, cameraStatus, autoDetect, retry } = useBarcodeScanner({
    active: cameraActive,
    onScan: (code) => {
      onScan?.(code);
      // A website QR isn't a product — the parent shows a transient "skipped"
      // pill. Skip the green "captured" pulse so it doesn't strobe.
      if (isQrUrl(code)) return;
      setCaptured(true);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  return (
    <div className={`${s.camera} ${captured ? s.scanCaptured : ""}`} aria-label="Scan items">
      <video ref={videoRef} className={s.cameraVideo} playsInline muted autoPlay aria-label="Live camera preview" />
      <div className={s.cameraScrim} aria-hidden="true" />

      {cameraStatus !== "ready" && (
        <div className={s.camPermission}>
          <Icon name="icon-scan" />
          <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
          <p>{cameraStatus === "requesting" ? "Allow camera access to scan item barcodes." : "Tap Try again, or use Enter code to key it in."}</p>
          {cameraStatus !== "requesting" && (
            <button type="button" className={s.camRetry} onClick={retry}><Icon name="icon-refresh" /> Try again</button>
          )}
        </div>
      )}

      <div className={s.camTop}>
        <button type="button" className={s.camCircle} onClick={onBack} aria-label="Exit scanner">
          <Icon name="icon-chevron-left" />
        </button>
        <span className={s.camBrand}>
          <BrandLogoMark className={s.camBrandMark} />
          <span className={s.camWordmark}><span className={s.camWordTrace}>Trace</span><span className={s.camWordDds}>DDS</span></span>
        </span>
        <span className={s.camRight}>
          <button
            type="button"
            className={s.camReviewBtn}
            onClick={onReview}
            aria-label={scanCount ? `View reorder list, ${scanCount} item${scanCount === 1 ? "" : "s"}` : "Go to reorder list"}
          >
            <QrScanGlyph />
            {scanCount > 0 && <span className={s.camCountBadge}>{scanCount > 99 ? "99+" : scanCount}</span>}
          </button>
        </span>
      </div>

      {/* No location pill here: scanning into the reorder list doesn't pick a
          location up front — it's captured per item in the post-scan drawer. */}

      {/* Floating acknowledgement pills. A new match adds the item (green); a
          re-scan of something already on the list shows an amber "already
          scanned" pill (no chime, nothing added); a website QR shows an amber
          "skipped" pill. The unmatched case has no pill — its own sheet asks
          what to do. */}
      {kind === "added" && (
        <div className={s.scanAddedBadge}>
          <Icon name="icon-check-circle" />
          Item added
        </div>
      )}
      {kind === "duplicate" && (
        <div className={`${s.scanAddedBadge} ${s.scanWarnBadge}`}>
          <Icon name="icon-refresh" />
          <span className={s.scanBadgeText}>
            {scanResult.item?.product || scanResult.item?.canonicalName
              ? `Already scanned · ${scanResult.item.product || scanResult.item.canonicalName}`
              : "Already scanned"}
          </span>
        </div>
      )}
      {kind === "qr" && (
        <div className={`${s.scanAddedBadge} ${s.scanWarnBadge}`}>
          <Icon name="icon-info" />
          Skipped website QR code
        </div>
      )}

      <div className={s.camFrame} aria-hidden="true"><span /><span /><span /><span /></div>
      {cameraStatus === "ready" && kind !== "unmatched" && (
        <div className={s.camHint}>
          {kind === "added" ? "Point at the next item to keep scanning" : autoDetect ? "Point at a barcode" : "Tap Enter code to type it in"}
        </div>
      )}

      {/* Enter code stays available except where the bottom of the screen is
          taken by the matched drawer or the unmatched sheet. */}
      {kind !== "added" && kind !== "unmatched" && (
        <button type="button" className={s.camManualBtn} onClick={() => setSheet("manual")}>
          <Icon name="icon-plus-circle" /> Enter code
        </button>
      )}

      {/* A new match opens the compact lot/expiry drawer over the live camera. An
          unmatched scan opens the decision sheet (search / capture / skip) —
          nothing is added unless the buyer picks a product there. Duplicate and
          QR outcomes show only a transient pill (handled above). */}
      {kind === "unmatched" && (
        <UnmatchedScanSheet
          onCaptureLabel={() => { onCaptureLabel?.(); onClearScanResult?.(); }}
          onSearch={() => setSheet("search")}
          onSkip={() => onClearScanResult?.()}
        />
      )}
      {kind === "added" && (
        <ReorderScanSheet
          key={scanResult.item?.id}
          result={scanResult}
          onPersist={onApplyDetails}
          onDismiss={(body) => {
            onApplyDetails?.(scanResult.item?.id, body);
            onClearScanResult?.();
          }}
        />
      )}

      {sheet === "manual" && <ManualSheet onClose={() => setSheet(null)} onSubmit={(code) => { onScan?.(code); setSheet(null); }} />}
      {sheet === "search" && (
        <SearchSheet
          title="Search the catalog"
          hint="Find the right product to add for this scan."
          onClose={() => setSheet(null)}
          onPick={(product) => {
            onSearchAdd?.(product);
            setSheet(null);
            onClearScanResult?.();
          }}
        />
      )}
    </div>
  );
}

// ── /scan (logged out) — unlimited single-item price spot-check ────────────
// The public, no-login scanner. Same immersive camera shell as the in-app
// scanner the user lands on after signup, so the free experience looks like the
// real thing — but its only output is a single-item price benchmark per scan:
// no list, no location, no cap. A running "items checked" tally and a Sign up
// bar pull the visitor toward an account, where the items they scanned (held in
// localStorage, migrated on signup) become a saved, synced reorder list. We
// don't know what they pay today, so there's no fabricated savings figure here —
// the card shows the real best price across suppliers; the aggregate value lands
// once they sign up and add what they're paying.
export function MobilePublicScan({
  active = true, scanResult, itemsChecked = 0,
  onScan, onClearScanResult, onApplyDetails, onSearchAdd, onCaptureLabel, onViewProduct,
  onSignup, onLogin, onHome,
}) {
  const [sheet, setSheet] = useState(null); // manual (Enter code) | search
  const [captured, setCaptured] = useState(false);
  const pulseTimer = useRef();
  const kind = scanResult?.kind;
  const cameraActive = active && !sheet;

  const { videoRef, cameraStatus, autoDetect, retry } = useBarcodeScanner({
    active: cameraActive,
    onScan: (code) => {
      onScan?.(code);
      if (isQrUrl(code)) return;
      setCaptured(true);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  return (
    <div className={`${s.camera} ${captured ? s.scanCaptured : ""}`} aria-label="Scan a product to see its price">
      <video ref={videoRef} className={s.cameraVideo} playsInline muted autoPlay aria-label="Live camera preview" />
      <div className={s.cameraScrim} aria-hidden="true" />

      {cameraStatus !== "ready" && (
        <div className={s.camPermission}>
          <Icon name="icon-scan" />
          <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
          <p>{cameraStatus === "requesting" ? "Allow camera access to scan item barcodes." : "Tap Try again, or use Enter code to key it in."}</p>
          {cameraStatus !== "requesting" && (
            <button type="button" className={s.camRetry} onClick={retry}><Icon name="icon-refresh" /> Try again</button>
          )}
        </div>
      )}

      <div className={s.camTop}>
        <button type="button" className={s.camCircle} onClick={onHome} aria-label="Back to home">
          <Icon name="icon-chevron-left" />
        </button>
        <span className={s.camBrand}>
          <BrandLogoMark className={s.camBrandMark} />
          <span className={s.camWordmark}><span className={s.camWordTrace}>Trace</span><span className={s.camWordDds}>DDS</span></span>
        </span>
        <span className={s.camRight}>
          <button type="button" className={s.camTextBtn} onClick={onLogin}>Log in</button>
        </span>
      </div>

      {/* A match — fresh or a re-scan — shows the same "identified" pill and the
          price drawer below. The public scanner is a single-item spot-check, so
          there's no list and no "already scanned" duplicate state. */}
      {kind === "added" && (
        <div className={s.scanAddedBadge}><Icon name="icon-check-circle" /> Item identified</div>
      )}
      {kind === "qr" && (
        <div className={`${s.scanAddedBadge} ${s.scanWarnBadge}`}><Icon name="icon-info" /> Skipped website QR code</div>
      )}

      <div className={s.camFrame} aria-hidden="true"><span /><span /><span /><span /></div>
      {cameraStatus === "ready" && kind !== "added" && kind !== "unmatched" && (
        <div className={s.camHint}>{autoDetect ? "Point at a barcode to see its price" : "Tap Enter code to type it in"}</div>
      )}

      {/* Post-scan drawer — the exact lot/expiry drawer logged-in users get.
          Tapping the product opens the full supplier-price comparison. Lot/expiry
          persist to the local item, so they carry into the list on signup. */}
      {kind === "added" && (
        <ReorderScanSheet
          key={scanResult.item?.id}
          result={scanResult}
          onPersist={onApplyDetails}
          onDismiss={(body) => { onApplyDetails?.(scanResult.item?.id, body); onClearScanResult?.(); }}
          onViewProduct={onViewProduct}
        />
      )}
      {kind === "unmatched" && (
        <UnmatchedScanSheet
          onCaptureLabel={() => { onCaptureLabel?.(); onClearScanResult?.(); }}
          onSearch={() => setSheet("search")}
          onSkip={() => onClearScanResult?.()}
        />
      )}

      {/* Enter-code + Sign up teaser. Hidden while a drawer owns the bottom. */}
      {kind !== "added" && kind !== "unmatched" && (
        <div className={s.publicBottom}>
          <button type="button" className={s.publicManual} onClick={() => setSheet("manual")}>
            <Icon name="icon-plus-circle" /> Enter a barcode or SKU
          </button>
          <div className={s.publicTeaser}>
            <span className={s.publicTeaserText}>
              {itemsChecked > 0
                ? <><strong>{itemsChecked} item{itemsChecked === 1 ? "" : "s"} checked.</strong> Sign up to keep them as a list and see where you&rsquo;re overpaying.</>
                : <>Scanning is free, no login. Sign up to save your list and reorder across suppliers.</>}
            </span>
            <button type="button" className={s.publicTeaserSignup} onClick={onSignup}>Sign up free</button>
          </div>
        </div>
      )}

      {sheet === "manual" && <ManualSheet onClose={() => setSheet(null)} onSubmit={(code) => { onScan?.(code); setSheet(null); }} />}
      {sheet === "search" && (
        <SearchSheet
          title="Search the catalog"
          hint="Find the right product for this scan."
          onClose={() => setSheet(null)}
          onPick={(product) => { onSearchAdd?.(product); setSheet(null); onClearScanResult?.(); }}
        />
      )}
    </div>
  );
}

// Post-scan drawer for an UNMATCHED scan (/app/scan): the code didn't resolve to
// a catalog product. The item is already saved as a pending row; this offers the
// next step — capture the label for later, search the catalog to match it now, or
// skip and keep scanning. Tapping outside is the same as skip.
function UnmatchedScanSheet({ onCaptureLabel, onSearch, onSkip }) {
  return (
    <div className={s.modeSheet}>
      <div className={s.modeSheetBackdrop} onClick={onSkip} />
      <div className={`${s.modeSheetPanel} ${s.unmatchedPanel}`}>
        <div className={s.modeSheetGrip} aria-hidden="true" />
        <div className={s.unmatchedHead}>
          <span className={s.unmatchedIcon}><Icon name="icon-alert-triangle" /></span>
          <div className={s.unmatchedHeadText}>
            <span className={s.unmatchedTitle}>No exact match found</span>
            <span className={s.unmatchedSub}>We couldn&rsquo;t find this item in your catalog.</span>
          </div>
        </div>

        <div className={s.unmatchedActions}>
          <button type="button" className={`${s.unmatchedAction} ${s.unmatchedActionPrimary}`} onClick={onCaptureLabel}>
            <Icon name="icon-camera" />
            <span className={s.unmatchedActionTitle}>Capture label</span>
            <span className={s.unmatchedActionSub}>Take a photo of the label</span>
          </button>
          <button type="button" className={s.unmatchedAction} onClick={onSearch}>
            <Icon name="icon-search" />
            <span className={s.unmatchedActionTitle}>Search manually</span>
            <span className={s.unmatchedActionSub}>Search our catalog</span>
          </button>
          <button type="button" className={s.unmatchedAction} onClick={onSkip}>
            <Icon name="icon-fast-forward" />
            <span className={s.unmatchedActionTitle}>Skip for now</span>
            <span className={s.unmatchedActionSub}>Keep scanning</span>
          </button>
        </div>

        <div className={s.unmatchedFootnote}>
          <Icon name="icon-info" /> Nothing is added unless you search and pick a product.
        </div>
      </div>
    </div>
  );
}

// Post-scan drawer for /app/scan: a compact, shallow sheet (≤ 1/3 of the screen)
// showing only what was scanned — lot, expiry, location, scanned time. The
// captured fields sit in a horizontal swipe strip so the sheet stays short even
// when they don't all fit across; swipe right to reach the later fields. Lot and
// expiry pre-fill from the GS1/HIBC data decoded off the barcode. Qty is set back
// on the reorder list, not here.
//
// There are no confirm / undo buttons: the item is already on the reorder list
// (added the moment it was scanned), so this drawer only captures lot / expiry /
// location. It floats over a LIVE camera and doesn't block it: the next item can
// be scanned right over the drawer (the new scan replaces it). Flicking the grip
// down — or tapping it — dismisses, but that's optional; scanning the next item
// is enough. Whatever's captured is persisted when the drawer is replaced or
// dismissed, so a manually typed lot/expiry is never lost.
function ReorderScanSheet({ result, onPersist, onDismiss, onViewProduct }) {
  const item = result.item || {};
  const matched = result.status !== "Not found";
  // When a match has a canonical handle and the host wants it (logged-out
  // scanner), the product block becomes a tap target into the full supplier-
  // price comparison. Logged-in passes no onViewProduct, so it stays static.
  const handle = item.canonicalHandle || "";
  const supplierCount = new Set((item.offers || []).map((o) => o?.supplier).filter(Boolean)).size;
  const canView = matched && typeof onViewProduct === "function" && Boolean(handle);
  const initialLot = item.lot || "";
  const initialExp = item.expirationDate ? String(item.expirationDate).slice(0, 10) : "";
  const [lot, setLot] = useState(initialLot);
  const [exp, setExp] = useState(initialExp);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);

  // Persist edits when this drawer is torn down by the next scan (the keyed
  // remount unmounts this one) so typed-in lot/expiry survive uninterrupted
  // scanning. A ref carries the latest values into the cleanup; only fire when
  // something actually changed so rapid scanning doesn't churn the list.
  const latest = useRef();
  latest.current = { lot, exp };
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;
  const itemId = item.id;
  useEffect(() => () => {
    const { lot: l, exp: e } = latest.current;
    if (l === initialLot && e === initialExp) return;
    persistRef.current?.(itemId, { lot: l.trim() || null, expirationDate: e || null });
  }, [itemId, initialLot, initialExp]);

  function dismiss() {
    onDismiss({
      lot: lot.trim() || null,
      expirationDate: exp || null,
    });
  }

  // Flick the grip down to dismiss; a short drag snaps back. Handlers live on the
  // grip only so the horizontal field strip and inputs keep their own gestures.
  function onTouchStart(e) {
    startY.current = e.touches[0].clientY;
    dragging.current = true;
  }
  function onTouchMove(e) {
    if (!dragging.current) return;
    setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  }
  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY > 70) dismiss();
    else setDragY(0);
  }

  const name = item.product || item.canonicalName || item.extractedFrom || item.sku || "Unidentified item";
  const scannedAt = formatScanTime(item.updatedAt);

  return (
    <div className={`${s.modeSheet} ${s.modeSheetLive}`}>
      <div
        className={`${s.modeSheetPanel} ${s.reorderPanel}`}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging.current ? "none" : "transform .2s ease" }}
      >
        <button
          type="button"
          className={s.modeSheetGripBtn}
          onClick={dismiss}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-label="Dismiss"
        >
          <span className={s.modeSheetGrip} aria-hidden="true" />
        </button>
        {(() => {
          const inner = (
            <>
              <span className={s.modeSheetThumb}>
                {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Icon name="icon-package" />}
              </span>
              <div className={s.modeSheetProductInfo}>
                <span className={s.modeSheetProductName}>
                  <span className={s.modeSheetProductNameText}>{name}</span>
                </span>
                {item.sku && <span className={s.modeSheetSku}>SKU: {item.sku}</span>}
                <span className={`${s.badge} ${matched ? s.badgeGreen : s.badgeAmber}`}>
                  <Icon name={matched ? "icon-check-circle" : "icon-clock"} />
                  {matched ? "Exact match" : "Needs review"}
                </span>
                {canView && (
                  <span className={s.modeSheetCompare}>
                    {supplierCount >= 2 ? `Tap to compare ${supplierCount} supplier prices` : "Tap to see supplier prices"}
                  </span>
                )}
              </div>
              {canView && <span className={s.modeSheetViewChevron}><Icon name="icon-chevron-right" /></span>}
            </>
          );
          return canView
            ? (
              <button
                type="button"
                className={`${s.modeSheetProduct} ${s.modeSheetProductTap}`}
                onClick={() => onViewProduct(handle)}
                aria-label="See all supplier prices for this product"
              >
                {inner}
              </button>
            )
            : <div className={s.modeSheetProduct}>{inner}</div>;
        })()}

        <div className={s.reorderStrip}>
          <div className={s.reorderField}>
            <span className={s.reorderFieldLabel}><Icon name="icon-file-text" /> Lot number</span>
            <div className={s.reorderFieldControl}>
              <input className={s.reorderFieldInput} value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. A219" />
            </div>
          </div>
          <div className={s.reorderField}>
            <span className={s.reorderFieldLabel}><Icon name="icon-calendar" /> Expiration date</span>
            <div className={s.reorderFieldControl}>
              <span className={s.reorderFieldText}>{exp ? formatExpiryDate(exp) : "Select date"}</span>
              <input
                type="date"
                className={s.dateOverlay}
                value={exp || ""}
                onChange={(e) => setExp(e.target.value)}
                aria-label="Expiration date"
              />
            </div>
          </div>
          <div className={s.reorderField}>
            <span className={s.reorderFieldLabel}><Icon name="icon-clock" /> Last verified</span>
            <div className={s.reorderFieldControl}>
              <span className={s.reorderFieldText}>{scannedAt}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── OCR pills (context strip) ─────────────────────────────────────────
// Shown under the location pill over the live camera. While the one-time reader
// download runs on a fresh device, a progress pill; once ready, the read-off-the-
// label hint — "reading…" while it works, then exactly what it filled vs. what
// still has to be typed in (assistive: values land in the editable drawer fields,
// never silently).
function OcrLoadPill({ progress }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div className={`${s.ocrPill} ${s.ocrLoadPill}`} aria-live="polite">
      <Icon name="icon-scan" />
      <div className={s.ocrLoadBody}>
        <span className={s.ocrPillText}>Preparing label reader…</span>
        <div className={s.ocrBar}><div className={s.ocrBarFill} style={{ width: `${pct}%` }} /></div>
      </div>
    </div>
  );
}

function OcrHintPill({ ocrBusy, suggestion }) {
  if (ocrBusy) {
    return (
      <div className={s.ocrPill} aria-live="polite">
        <Icon name="icon-scan" />
        <span className={s.ocrPillText}>Reading the label — hold steady over the lot &amp; expiry…</span>
      </div>
    );
  }
  if (!suggestion) return null;
  // Name what was filled vs. what's still missing, scoped to the fields the
  // barcode didn't already carry, so a blank field reads as "type this in" rather
  // than a silent miss.
  const got = [suggestion.needLot && suggestion.lot && "lot", suggestion.needExp && suggestion.expiry && "expiry"].filter(Boolean);
  const miss = [suggestion.needLot && !suggestion.lot && "lot", suggestion.needExp && !suggestion.expiry && "expiry"].filter(Boolean);
  if (!got.length && !miss.length) return null;
  let msg;
  let icon = "icon-check-circle";
  if (got.length && !miss.length) {
    msg = `Filled ${got.join(" & ")} from the label — check ${got.length > 1 ? "they’re" : "it’s"} right.`;
  } else if (got.length) {
    msg = `Filled the ${got.join(" & ")} — couldn’t read the ${miss.join(" & ")}, enter ${miss.length > 1 ? "them" : "it"} below.`;
  } else {
    icon = "icon-scan";
    msg = `Couldn’t read the ${miss.join(" & ")} off the label — enter ${miss.length > 1 ? "them" : "it"} below.`;
  }
  return (
    <div className={s.ocrPill} aria-live="polite">
      <Icon name={icon} />
      <span className={s.ocrPillText}>{msg}</span>
    </div>
  );
}

// ── Post-scan capture drawer ──────────────────────────────────────────
// One compact, live-camera drawer (≤ 1/3 of the screen) over a running viewfinder,
// capturing lot / expiry — plus a received date for a fresh receive — in a
// horizontal swipe strip. No mode, no qty stepper, no Undo / Save buttons: the
// item is already on the location (filed the moment it was scanned), so this
// drawer only captures details and persists them when the next scan replaces it
// (keyed remount) or it's flicked down. The badge reflects what the scan did — a
// lot not yet on file is a receive, an already-filed lot is a confirmation, an
// unidentified scan needs review (link it later).
function captureResult(line) {
  const matched = Boolean(line.canonical_product_id || line.supplier_product_id);
  if (!matched) return { cls: s.badgeAmber, icon: "icon-clock", label: "Needs review" };
  if (line.inventory_action === "confirmed") return { cls: s.badgeGreen, icon: "icon-check-circle", label: "Confirmed present" };
  return { cls: s.badgeGreen, icon: "icon-check-circle", label: "Added · received" };
}

function CaptureScanSheet({ line, locationName, suggestion, onLinkProduct, onDismiss, onPersist }) {
  const result = captureResult(line);
  // Identified + not a confirm of an existing lot ⇒ a receive (captures a
  // received date). Unidentified lines record neither until they're linked.
  const matched = Boolean(line.canonical_product_id || line.supplier_product_id);
  const isConfirmed = line.inventory_action === "confirmed";
  const isReceived = matched && !isConfirmed;
  const initialLot = line.lot_number || "";
  const initialExp = line.expiration_date ? String(line.expiration_date).slice(0, 10) : "";
  const initialReceived = line.received_date ? String(line.received_date).slice(0, 10) : todayIso();
  const [lot, setLot]           = useState(initialLot);
  const [exp, setExp]           = useState(initialExp);
  const [received, setReceived] = useState(initialReceived);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);

  // OCR arrives a beat after the drawer opens (it runs after the catalog lookup);
  // fill only fields the user hasn't already typed into.
  useEffect(() => {
    if (suggestion?.lot) setLot((v) => v || suggestion.lot);
    if (suggestion?.expiry) setExp((v) => v || suggestion.expiry);
  }, [suggestion?.lot, suggestion?.expiry]);

  // The captured body, read from the latest values at persist time. A received
  // scan stamps a received date; the item has already landed on the current
  // location, so this only enriches its traceability.
  const latest = useRef();
  latest.current = { lot, exp, received };
  function body() {
    const { lot: l, exp: e, received: r } = latest.current;
    const out = {
      lot_number:      l.trim() || null,
      expiration_date: e || null,
    };
    if (isReceived) out.received_date = r || null;
    return out;
  }

  // Persist on teardown (the next scan remounts this drawer) so typed lot/expiry
  // survive uninterrupted scanning — unless a manual dismiss already saved.
  const done = useRef(false);
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;
  const itemId = line.id;
  useEffect(() => () => {
    if (done.current) return;
    persistRef.current?.(itemId, body());
  }, [itemId]);

  function dismiss() {
    done.current = true;
    onDismiss(itemId, body());
  }

  // Flick the grip down to dismiss; a short drag snaps back. Handlers live on the
  // grip only so the horizontal field strip and inputs keep their own gestures.
  function onTouchStart(e) {
    startY.current = e.touches[0].clientY;
    dragging.current = true;
  }
  function onTouchMove(e) {
    if (!dragging.current) return;
    setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  }
  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY > 70) dismiss();
    else setDragY(0);
  }

  const name = line.name || offerSku(line) || "Unidentified item";

  // Possible matches read off the label by OCR, shown only while the line is still
  // unidentified. An exact catalog/REF hit (`match`) leads, tagged so it reads as
  // higher-confidence than the fuzzy `suggestions` behind it; tapping Link is the
  // confirm step that attaches the product to this evidence row.
  const ocrMatches = matched
    ? []
    : [
        ...(suggestion?.match ? [{ product: suggestion.match, exact: true }] : []),
        ...(suggestion?.suggestions || [])
          .slice(0, suggestion?.match ? 2 : 3)
          .map((product) => ({ product, exact: false })),
      ];

  return (
    <div className={`${s.modeSheet} ${s.modeSheetLive}`}>
      <div
        className={`${s.modeSheetPanel} ${s.reorderPanel}`}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging.current ? "none" : "transform .2s ease" }}
      >
        <button
          type="button"
          className={s.modeSheetGripBtn}
          onClick={dismiss}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-label="Dismiss"
        >
          <span className={s.modeSheetGrip} aria-hidden="true" />
        </button>
        <div className={s.modeSheetProduct}>
          <span className={s.modeSheetThumb}>
            {line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="icon-package" />}
          </span>
          <div className={s.modeSheetProductInfo}>
            <span className={s.modeSheetProductName}>
              <span className={s.modeSheetProductNameText}>{name}</span>
            </span>
            {offerSku(line) && <span className={s.modeSheetSku}>SKU: {offerSku(line)}</span>}
            <span className={`${s.badge} ${result.cls}`}>
              <Icon name={result.icon} />
              {result.label}
            </span>
          </div>
        </div>

        {ocrMatches.length > 0 && (
          <div className={s.ocrSuggest}>
            <span className={s.ocrSuggestHead}>
              <Icon name="icon-search" />
              {ocrMatches.length === 1 && ocrMatches[0].exact
                ? "Possible match read from the label"
                : "Possible matches read from the label"}
            </span>
            <ul className={s.ocrSuggestList}>
              {ocrMatches.map(({ product, exact }) => (
                <li key={product.id} className={s.ocrSuggestRow}>
                  <span className={s.ocrSuggestThumb}>
                    {product.image_url ? <img src={product.image_url} alt="" /> : <Icon name="icon-package" />}
                  </span>
                  <span className={s.ocrSuggestInfo}>
                    <span className={s.ocrSuggestName}>{product.name}</span>
                    <span className={s.ocrSuggestMeta}>
                      {exact
                        ? "Catalog # match"
                        : product.best_offer?.brand || product.best_offer?.supplier_name || "Possible substitute"}
                    </span>
                  </span>
                  <button type="button" className={s.ocrSuggestLink} onClick={() => onLinkProduct?.(line.id, product)}>
                    Link
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={s.reorderStrip}>
          <div className={s.reorderField}>
            <span className={s.reorderFieldLabel}><Icon name="icon-file-text" /> Lot number</span>
            <div className={s.reorderFieldControl}>
              <input className={s.reorderFieldInput} value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. A219" />
            </div>
          </div>
          <div className={s.reorderField}>
            <span className={s.reorderFieldLabel}><Icon name="icon-calendar" /> Expiration date</span>
            <div className={s.reorderFieldControl}>
              <span className={s.reorderFieldText}>{exp ? formatExpiryDate(exp) : "Select date"}</span>
              <input
                type="date"
                className={s.dateOverlay}
                value={exp || ""}
                onChange={(e) => setExp(e.target.value)}
                aria-label="Expiration date"
              />
            </div>
          </div>
          {isReceived && (
            <div className={s.reorderField}>
              <span className={s.reorderFieldLabel}><Icon name="icon-package" /> Received date</span>
              <div className={s.reorderFieldControl}>
                <span className={s.reorderFieldText}>{received ? formatLongDate(received) : "Select date"}</span>
                <input
                  type="date"
                  className={s.dateOverlay}
                  value={received || ""}
                  onChange={(e) => setReceived(e.target.value)}
                  aria-label="Received date"
                />
              </div>
            </div>
          )}
          <div className={s.reorderField}>
            <span className={s.reorderFieldLabel}><Icon name="icon-map-pin" /> Location</span>
            <div className={s.reorderFieldControl}>
              <span className={s.reorderFieldText}>{locationName || "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// "2026-06-03" -> "June 3, 2026". Built from parts so a YYYY-MM-DD string is
// read as a local date (new Date("YYYY-MM-DD") parses as UTC and can shift a day).
function formatLongDate(iso) {
  if (!iso) return "Select date";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// When the item was scanned, for the post-scan drawer's read-only "Last verified"
// field. Same-day scans drop the date ("Today, 9:41 AM"); older ones keep it.
function formatScanTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

// ── Generic bottom sheet shell ────────────────────────────────────────

function SheetShell({ title, onClose, children }) {
  return (
    <div className={s.sheetRoot} role="dialog" aria-modal="true">
      <div className={s.sheetBackdrop} onClick={onClose} />
      <div className={s.sheet}>
        <span className={s.sheetGrip} aria-hidden="true" />
        <div className={s.sheetHead}>
          <strong>{title}</strong>
          <button type="button" className={s.sheetClose} onClick={onClose} aria-label="Close"><Icon name="icon-x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ManualSheet({ onClose, onSubmit }) {
  const [code, setCode] = useState("");
  function submit(e) {
    e.preventDefault();
    const v = code.trim();
    if (v) onSubmit(v);
  }
  return (
    <SheetShell title="Enter SKU" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className={s.sheetField}>
          <Icon name="icon-scan" />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter barcode or SKU" autoComplete="off" autoCapitalize="characters" aria-label="Barcode or SKU" autoFocus />
        </label>
        <button type="submit" className={s.sheetBtn} disabled={!code.trim()}><Icon name="icon-search" /> Look up</button>
      </form>
      <p className={s.sheetHint}>Type the number printed under the barcode if the camera can&rsquo;t read it.</p>
    </SheetShell>
  );
}

function SearchSheet({ title, hint, onClose, onPick }) {
  const { query, setQuery, results, loading } = useProductSearch(true);
  return (
    <SheetShell title={title} onClose={onClose}>
      <label className={s.sheetField}>
        <Icon name="icon-search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the catalog…" aria-label="Search products" autoFocus />
      </label>
      {hint && <p className={s.sheetHint}>{hint}</p>}
      <div className={s.sheetScroll}>
        <ProductSearchResults query={query} results={results} loading={loading} onPick={onPick} emptyHint="Type a product name to find it." />
      </div>
    </SheetShell>
  );
}

function LocationSheet({ locations, currentId, onClose, onPick, onManage, onReorder }) {
  const reorderRow = onReorder ? (
    <button type="button" className={`${s.locRow} ${s.reorderRow}`} onClick={onReorder}>
      <span className={`${s.locRowIcon} ${s.reorderIcon}`}><Icon name="icon-nav-reorder" /></span>
      <span className={s.reorderBody}>
        <span className={s.reorderTitle}>Quick reorder list</span>
        <span className={s.reorderSub}>Scan items onto your buy list, not filed to a shelf</span>
      </span>
      <span className={s.locRowChevron}><Icon name="icon-chevron-right" /></span>
    </button>
  ) : null;

  return (
    <SheetShell title="Scanning location" onClose={onClose}>
      {locations.length === 0 ? (
        <>
          {reorderRow && <div className={s.locList}>{reorderRow}</div>}
          <div className={s.sheetEmpty}>
            <span className={s.sheetEmptyIcon}><Icon name="icon-map-pin" /></span>
            <strong>No locations yet</strong>
            <p>Add a room, cabinet, or shelf to scan items into it.</p>
            <button type="button" className={s.sheetBtn} onClick={onManage}>
              <Icon name="icon-plus" /> Add a location
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={s.sheetScroll}>
            <div className={s.locList}>
              {reorderRow}
              {locations.map((loc) => (
                <button key={loc.id} type="button" className={s.locRow} onClick={() => onPick(loc)}>
                  <span className={s.locRowIcon}><Icon name={typeMeta(loc.type).icon} /></span>
                  <span className={s.locRowName}>{loc.name}</span>
                  {loc.id === currentId
                    ? <span className={s.lastUsedCheck}><Icon name="icon-check" /></span>
                    : <span className={s.locRowChevron}><Icon name="icon-chevron-right" /></span>}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className={s.manageLink} onClick={onManage} style={{ alignSelf: "center" }}>Manage locations</button>
        </>
      )}
    </SheetShell>
  );
}
