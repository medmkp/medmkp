"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogoMark, Icon, QrScanGlyph } from "./icons";
import { isQrUrl } from "./lib";
import { ProductSearchResults, useBarcodeScanner, useProductSearch } from "./ui";
import s from "./scanmobile.module.css";

// Mobile scan flow. Two scan modes set intent before the camera opens:
//   Receiving   — new shipment arrives; captures lot/expiry/supplier/qty/date
//   Shelf Audit — verify items already on shelves; records presence/status
// Desktop keeps its two-column layout in scansessions.jsx; this module is the
// phone surface those views hand off to.

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

const SCAN_MODE_META = {
  receiving: {
    label: "Receiving",
    emoji: "📦",
    emojiLabel: "Cardboard box",
    desc: "Use when a new shipment arrives.",
    records: ["Lot", "Expiry", "Received date", "Location"],
  },
  shelf_audit: {
    label: "Shelf Audit",
    emoji: "📋",
    emojiLabel: "Clipboard",
    desc: "Use when verifying items already in the office.",
    records: ["Lot", "Expiry", "Location", "Status"],
    statuses: ["Present", "Moved", "Not found", "Removed"],
  },
  reorder: {
    label: "Reorder",
    emoji: "🛒",
    emojiLabel: "Shopping cart",
    desc: "Use to add items running low to your reorder list.",
    records: ["Reorder list", "Lot", "Expiry"],
  },
};

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

// ── Mode picker card ──────────────────────────────────────────────────

function ModeCard({ value, onSelect, meta }) {
  return (
    <button
      type="button"
      className={s.modeCard}
      onClick={() => onSelect(value)}
    >
      <div className={s.modeCardHeader}>
        <span className={s.modeCardTitle}>{meta.label}</span>
        <span className={s.modeCardChevron}><Icon name="icon-chevron-right" /></span>
      </div>
      <div className={s.modeCardBody}>
        <span className={s.modeCardIllustration} role="img" aria-label={meta.emojiLabel}>
          {meta.emoji}
        </span>
        <div className={s.modeCardContent}>
          <p className={s.modeCardDesc}>{meta.desc}</p>
          <div className={s.modeCardPills}>
            <span className={s.modeCardPillsLabel}>Records</span>
            {meta.records.map((r) => (
              <span key={r} className={s.modeCardPill}>{r}</span>
            ))}
            {meta.optional?.map((r) => (
              <span key={r} className={`${s.modeCardPill} ${s.modeCardPillOpt}`}>{r}</span>
            ))}
          </div>
          {meta.statuses && (
            <div className={s.modeCardStatuses}>
              {meta.statuses.map((st) => (
                <span key={st} className={s.modeCardStatus}>{st}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Screens 1 + 2: Start scan / Choose mode / Choose location ────────

export function MobileScanStart({
  loading, locations, starting, startLocationId, needsAttention,
  onStart, onNavigate,
}) {
  // "home" | "choose-scan-mode" | "audit-scanner"
  const [step, setStep] = useState("home");

  // Deep-link from a printed location QR: the URL carries the location id, so
  // the flow starts scoped to that one location (no home, no location picker).
  const scopedLocation = useMemo(
    () => (startLocationId ? (locations || []).find((l) => l.id === startLocationId) : null),
    [startLocationId, locations],
  );
  // Scanning a label drops straight into the camera: auto-start (or resume) a
  // shelf-audit session for that location — Shelf Audit is the default, and the
  // scanner's mode selector switches to Receiving. Fire once.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (startLocationId && scopedLocation) {
      autoStarted.current = true;
      onStart(scopedLocation, "shelf_audit");
    }
  }, [startLocationId, scopedLocation, onStart]);

  const attnItems = needsAttention?.items || 0;
  const attnLocs  = needsAttention?.locations || 0;

  // Tapping a mode card moves forward immediately (no Continue step — same
  // single-tap pattern as the location rows below).
  function chooseMode(value) {
    if (starting) return;
    // Reorder scans into the reorder list (no session, no location) — hand off
    // to the dedicated /app/scan scanner.
    if (value === "reorder") { onNavigate?.("/app/scan"); return; }
    // Receiving fans out to many shelves, so it doesn't pick one location up
    // front — location is captured per item in the sheet.
    if (value === "receiving") { onStart(null, "receiving"); return; }
    // Shelf Audit goes straight to the scanner; the location is picked there
    // (an audit is scoped to one location, so it's the first action).
    setStep("audit-scanner");
  }

  // ── Screen: deep-link from a printed QR — auto-starting into the camera ──
  // Hold on a quiet loading screen while the shelf-audit session is created and
  // we navigate into the scanner. A stale/deleted location id falls through to
  // the normal start screen rather than dead-ending.
  if (startLocationId && (scopedLocation || loading)) {
    return (
      <div className={s.screen}>
        <div className={`${s.body} ${s.bodyTop}`}>
          <div className={s.emptyNote}>{scopedLocation ? "Starting shelf audit…" : "Loading…"}</div>
        </div>
      </div>
    );
  }

  // ── Screen: choose scan mode ────────────────────────────────────────
  if (step === "choose-scan-mode") {
    return (
      <div className={s.screen}>
        <header className={s.topbar}>
          <button type="button" className={s.iconBtn} onClick={() => setStep("home")} aria-label="Back">
            <Icon name="icon-chevron-left" />
          </button>
          <span className={s.barTitle}>Scan mode</span>
        </header>
        <div className={s.body}>
          <div className={s.intro}>
            <p className={s.sub}>Choose how this scan should be recorded.</p>
          </div>

          <div className={s.modeCards}>
            {Object.entries(SCAN_MODE_META).map(([value, meta]) => (
              <ModeCard key={value} value={value} onSelect={chooseMode} meta={meta} />
            ))}
          </div>

          <div className={s.infoBanner}>
            <Icon name="icon-info" />
            Same scanner, different record type. Choose what matters most right now.
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: shelf-audit scanner (location picked here, in the scanner) ──
  if (step === "audit-scanner") {
    return (
      <MobileAuditLocationGate
        locations={locations}
        starting={starting}
        onPick={(loc) => onStart(loc, "shelf_audit")}
        onBack={() => setStep("choose-scan-mode")}
        onManage={() => onNavigate?.("/app/locations")}
      />
    );
  }

  // ── Screen: home ────────────────────────────────────────────────────
  // No top bar: this is a primary tab destination, so the H1 is the title and
  // the persistent bottom nav carries identity + navigation.
  return (
    <div className={s.screen}>
      <div className={`${s.body} ${s.bodyTop}`}>
        <div className={s.intro}>
          <h1 className={s.h1}>Start scanning</h1>
          <p className={s.sub}>Scan items straight onto a location — they&rsquo;re saved as you go.</p>
        </div>

        {attnItems > 0 && (
          <button type="button" className={s.attnCard} onClick={() => onNavigate?.("/app/locations")}>
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
              <button type="button" className={s.actionRow} onClick={() => setStep("choose-scan-mode")}>
                <span className={s.actionIcon}><Icon name="icon-plus" /></span>
                <span className={s.actionText}>
                  <span className={s.actionTitle}>Scan a location</span>
                  <span className={s.actionSub}>Choose scan mode then pick a location</span>
                </span>
                <span className={s.actionChevron}><Icon name="icon-chevron-right" /></span>
              </button>
            </div>

            <div className={s.assurance}>
              <Icon name="icon-shield-check" />
              Exact matches land straight on the location; anything else waits in Needs Attention.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shelf-audit location gate ─────────────────────────────────────────
// Shelf Audit goes straight to the scanner; the location is chosen here rather
// than on a separate screen first. An audit is scoped to one location and its
// items file to the session's location, so picking the location is the first
// action — it starts (or resumes) that location's session, then scanning begins.
function MobileAuditLocationGate({ locations, starting, onPick, onBack, onManage }) {
  const [sheetOpen, setSheetOpen] = useState(true);

  return (
    <div className={s.camera} aria-label="Choose a location to audit">
      <div className={s.cameraScrim} aria-hidden="true" />

      <div className={s.camTop}>
        <button type="button" className={s.camCircle} onClick={onBack} aria-label="Back">
          <Icon name="icon-chevron-left" />
        </button>
        <span className={s.camBrand}>
          <BrandLogoMark className={s.camBrandMark} />
          <span className={s.camWordmark}>
            <span className={s.camWordTrace}>Trace</span>{" "}<span className={s.camWordDds}>DDS</span>
          </span>
        </span>
        <span className={s.camRight} />
      </div>

      <div className={s.contextStrip}>
        <span className={`${s.modeBadge} ${s.modeBadgeAudit}`}>
          <Icon name="icon-clipboard-check" /> Shelf Audit
        </span>
        <button type="button" className={s.locPill} onClick={() => setSheetOpen(true)}>
          <Icon name="icon-map-pin" />
          <span className={s.locPillName}>Set location</span>
          <span className={s.locPillCaret}><Icon name="icon-chevron-down" /></span>
        </button>
      </div>

      <div className={s.camFrame} aria-hidden="true"><span /><span /><span /><span /></div>
      <div className={s.camHint}>{starting ? "Starting…" : "Choose a location to start the audit"}</div>

      {sheetOpen && (
        <LocationSheet
          locations={locations}
          currentId={null}
          onClose={() => setSheetOpen(false)}
          onPick={(loc) => { if (!starting) onPick(loc); }}
          onManage={onManage}
        />
      )}
    </div>
  );
}

// ── Camera + mode-specific bottom sheets ──────────────────────────────

export function MobileScanSession({
  location, items, active,
  pendingItem, captureType, ocrBusy, ocrSuggestion,
  onScan, onAddProduct, onPatchItem, onBack, onClearPending,
  locations, onSwitchLocation, onSwitchMode, onNavigate,
}) {
  const [sheet, setSheet] = useState(null); // manual | search | location | mode
  // Receiving vs Shelf Audit only changes how the scan is recorded (capture_type)
  // and which fields the drawer shows — both land evidence on the current
  // location. Switching is ephemeral; there's no session to fork.
  const localMode = captureType || "shelf_audit";
  const pulseTimer = useRef();
  const [captured, setCaptured] = useState(false);

  // The drawers float over a LIVE camera (like the reorder scanner) so the next
  // item can be aimed and scanned without dismissing the drawer first; only a
  // full input sheet (Enter SKU / Search) pauses scanning.
  const cameraActive = active && !sheet;

  const { videoRef, cameraStatus, autoDetect, retry } = useBarcodeScanner({
    active: cameraActive,
    onScan: (code, getShot) => {
      onScan(code, getShot);
      // A location / website QR isn't a product — the parent shows a "not a
      // product" toast. Skip the green "captured" pulse so pointing at a
      // location placard mid-audit doesn't strobe the viewfinder.
      if (isQrUrl(code)) return;
      setCaptured(true);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  // The current scanning location — the audited shelf (Shelf Audit) or the
  // put-away destination (Receiving). Every scan lands here; change the location
  // pill to file the next items somewhere else.
  const locName = location?.name || "Set location";
  const scanCount = items.length;

  // The mode badge is an ephemeral selector — it just flips capture_type for
  // upcoming scans (no session to start).
  function pickMode(mode) {
    setSheet(null);
    if (mode === localMode) return;
    onSwitchMode?.(mode);
  }

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
            <span className={s.camWordTrace}>Trace</span>{" "}<span className={s.camWordDds}>DDS</span>
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

      {/* Context strip — mode selector + location, anchored under the header so
          it holds its position across the scan → post-scan transition (the sheet
          rises underneath it, nothing hops). Both are selectors: the mode badge
          switches Shelf Audit ↔ Receiving; the location pill — for Receiving sets
          the sticky default, for Shelf Audit switches the audited location. */}
      <div className={s.contextStrip}>
        <button
          type="button"
          className={`${s.modeBadge} ${s.modeBadgeBtn} ${localMode === "receiving" ? s.modeBadgeReceiving : s.modeBadgeAudit}`}
          onClick={() => setSheet("mode")}
          aria-label={`Scan mode: ${SCAN_MODE_META[localMode]?.label}. Change mode.`}
        >
          <Icon name={localMode === "receiving" ? "icon-package" : "icon-clipboard-check"} />
          {SCAN_MODE_META[localMode]?.label}
          <span className={s.modeBadgeCaret}><Icon name="icon-chevron-down" /></span>
        </button>
        <button type="button" className={s.locPill} onClick={() => setSheet("location")}>
          <Icon name="icon-map-pin" />
          <span className={s.locPillName}>{locName}</span>
          <span className={s.locPillCaret}><Icon name="icon-chevron-down" /></span>
        </button>
      </div>

      <div className={s.camFrame} aria-hidden="true"><span /><span /><span /><span /></div>
      {cameraStatus === "ready" && (
        <div className={s.camHint}>
          {pendingItem ? "Point at the next item to keep scanning" : "Point at a barcode"}
        </div>
      )}

      {/* Post-scan drawer over a LIVE camera (lot / expiry, plus received date for
          Receiving) — keyed by item so the next scan remounts it and the previous
          item's edits persist on unmount. The item has already landed on the
          current location; the drawer just enriches its traceability. */}
      {pendingItem && localMode === "receiving" && (
        <ReceivingScanSheet
          key={pendingItem.id}
          line={pendingItem}
          locationName={locName}
          ocrBusy={ocrBusy}
          suggestion={ocrSuggestion}
          onPersist={(id, body) => onPatchItem(id, body)}
          onDismiss={(id, body) => { onPatchItem(id, body); onClearPending?.(); }}
        />
      )}
      {pendingItem && localMode === "shelf_audit" && (
        <ShelfAuditScanSheet
          key={pendingItem.id}
          line={pendingItem}
          locationName={locName}
          ocrBusy={ocrBusy}
          suggestion={ocrSuggestion}
          onPersist={(id, body) => onPatchItem(id, body)}
          onDismiss={(id, body) => { onPatchItem(id, body); onClearPending?.(); }}
        />
      )}

      {sheet === "manual"   && <ManualSheet onClose={() => setSheet(null)} onSubmit={(code) => { onScan(code); setSheet(null); }} />}
      {sheet === "mode"     && <ModeSheet current={localMode} onClose={() => setSheet(null)} onPick={pickMode} />}
      {sheet === "search"   && <SearchSheet title="Search product" onClose={() => setSheet(null)} onPick={(p) => { onAddProduct(p); setSheet(null); }} />}
      {sheet === "location" && (
        <LocationSheet
          locations={locations}
          currentId={location?.id || null}
          onClose={() => setSheet(null)}
          onPick={(loc) => {
            setSheet(null);
            // Set where upcoming scans land (the audited shelf, or the next
            // put-away destination). Already-scanned items stay where they landed.
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
          <span className={s.camWordmark}><span className={s.camWordTrace}>Trace</span>{" "}<span className={s.camWordDds}>DDS</span></span>
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
function ReorderScanSheet({ result, onPersist, onDismiss }) {
  const item = result.item || {};
  const matched = result.status !== "Not found";
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
        <div className={s.modeSheetProduct}>
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
          </div>
        </div>

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
              <span className={s.reorderFieldText}>{exp ? formatLongDate(exp) : "Select date"}</span>
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

// ── Receiving post-scan drawer ────────────────────────────────────────
// The same compact, live-camera drawer as the reorder scanner: a shallow sheet
// (≤ 1/3 of the screen) over a running viewfinder, capturing lot / expiry /
// received date / location in a horizontal swipe strip. No qty stepper, no
// supplier picker, no Undo / Save buttons — the line is already on the session
// (added the moment it was scanned), so this drawer only captures details and
// persists them when the next scan replaces it (keyed remount) or it's flicked
// down. The destination is the sticky location set by the top-of-screen pill;
// the Location card echoes it and taps back to that picker.
// When OCR has read lot/expiry off the package, surface it in the capture drawer:
// a "reading…" note while it runs, then a confirm-it note once the fields are
// pre-filled. Assistive — the values land in the editable fields, never silently.
function OcrHint({ ocrBusy, suggestion }) {
  if (ocrBusy) {
    return (
      <div className={s.modeSheetInfo} aria-live="polite">
        <Icon name="icon-scan" />
        Reading lot &amp; expiry off the label…
      </div>
    );
  }
  // suggestion is null until OCR has run (it doesn't run when the barcode already
  // carried lot + expiry); once it has, name exactly what was filled so a blank
  // field reads as "type this in", not a silent miss.
  if (!suggestion) return null;
  const { lot, expiry } = suggestion;
  let msg;
  if (lot && expiry) msg = "Filled lot & expiry from the label — check they’re right.";
  else if (lot) msg = "Filled the lot from the label — check it’s right.";
  else if (expiry) msg = "Filled the expiry from the label — check it’s right.";
  else msg = "Couldn’t read lot or expiry off the label — enter them below.";
  return (
    <div className={s.modeSheetInfo} aria-live="polite">
      <Icon name="icon-scan" />
      {msg}
    </div>
  );
}

function ReceivingScanSheet({ line, locationName, ocrBusy, suggestion, onPersist, onDismiss }) {
  const matched = Boolean(line.canonical_product_id || line.supplier_product_id);
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

  // The captured body, read from the latest values at persist time. The item has
  // already landed on the current location; this only enriches its traceability.
  const latest = useRef();
  latest.current = { lot, exp, received };
  function body() {
    const { lot: l, exp: e, received: r } = latest.current;
    return {
      lot_number:      l.trim() || null,
      expiration_date: e || null,
      received_date:   r || null,
    };
  }

  // Persist on teardown (the next scan remounts this drawer) so typed lot/expiry
  // and the chosen location survive uninterrupted scanning — unless a manual
  // dismiss already saved.
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
            <span className={`${s.badge} ${matched ? s.badgeGreen : s.badgeAmber}`}>
              <Icon name={matched ? "icon-check-circle" : "icon-clock"} />
              {matched ? "Exact match" : "Needs review"}
            </span>
          </div>
        </div>

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
              <span className={s.reorderFieldText}>{exp ? formatLongDate(exp) : "Select date"}</span>
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
          <div className={s.reorderField}>
            <span className={s.reorderFieldLabel}><Icon name="icon-map-pin" /> Location</span>
            <div className={s.reorderFieldControl}>
              <span className={s.reorderFieldText}>{locationName || "—"}</span>
            </div>
          </div>
        </div>
        <OcrHint ocrBusy={ocrBusy} suggestion={suggestion} />
      </div>
    </div>
  );
}

// ── Shelf audit post-scan drawer ──────────────────────────────────────
// The SAME compact live-camera drawer as Receiving (ReceivingScanSheet): a
// shallow sheet over a running viewfinder capturing lot / expiry, with the
// audited location shown read-only (an audit is scoped to the session's one
// location). No status grid — scanning an item on the shelf verifies it's
// present; not-found / removed are reconcile actions, not scans. No buttons:
// it persists when the next scan replaces it (keyed remount) or it's flicked
// down.
function ShelfAuditScanSheet({ line, locationName, ocrBusy, suggestion, onPersist, onDismiss }) {
  const matched = Boolean(line.canonical_product_id || line.supplier_product_id);
  const initialLot = line.lot_number || "";
  const initialExp = line.expiration_date ? String(line.expiration_date).slice(0, 10) : "";
  const [lot, setLot] = useState(initialLot);
  const [exp, setExp] = useState(initialExp);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);

  // OCR arrives a beat after the drawer opens; fill only the empty fields.
  useEffect(() => {
    if (suggestion?.lot) setLot((v) => v || suggestion.lot);
    if (suggestion?.expiry) setExp((v) => v || suggestion.expiry);
  }, [suggestion?.lot, suggestion?.expiry]);

  const latest = useRef();
  latest.current = { lot, exp };
  function body() {
    const { lot: l, exp: e } = latest.current;
    return {
      lot_number:      l.trim() || null,
      expiration_date: e || null,
    };
  }

  // Persist on teardown (next scan remounts) so typed lot/expiry survive
  // uninterrupted scanning — unless a manual dismiss already saved.
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

  function onTouchStart(e) { startY.current = e.touches[0].clientY; dragging.current = true; }
  function onTouchMove(e) { if (!dragging.current) return; setDragY(Math.max(0, e.touches[0].clientY - startY.current)); }
  function onTouchEnd() { if (!dragging.current) return; dragging.current = false; if (dragY > 70) dismiss(); else setDragY(0); }

  const name = line.name || offerSku(line) || "Unidentified item";

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
            <span className={`${s.badge} ${matched ? s.badgeGreen : s.badgeAmber}`}>
              <Icon name={matched ? "icon-check-circle" : "icon-clock"} />
              {matched ? "Exact match" : "Needs review"}
            </span>
          </div>
        </div>

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
              <span className={s.reorderFieldText}>{exp ? formatLongDate(exp) : "Select date"}</span>
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
            <span className={s.reorderFieldLabel}><Icon name="icon-map-pin" /> Location</span>
            <div className={s.reorderFieldControl}>
              <span className={s.reorderFieldText}>{locationName || "—"}</span>
            </div>
          </div>
        </div>
        <OcrHint ocrBusy={ocrBusy} suggestion={suggestion} />
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

// Mode selector — switch the session between Shelf Audit and Receiving. Reorder
// isn't offered here: it scans into the reorder list, not this evidence session.
function ModeSheet({ current, onClose, onPick }) {
  return (
    <SheetShell title="Scan mode" onClose={onClose}>
      <div className={s.sheetScroll}>
        <div className={s.locList}>
          {["shelf_audit", "receiving"].map((m) => {
            const meta = SCAN_MODE_META[m];
            return (
              <button key={m} type="button" className={s.locRow} onClick={() => onPick(m)}>
                <span className={s.locRowIcon}><Icon name={m === "receiving" ? "icon-package" : "icon-clipboard-check"} /></span>
                <span className={s.modeRowBody}>
                  <span className={s.locRowName}>{meta.label}</span>
                  <span className={s.modeRowDesc}>{meta.desc}</span>
                </span>
                {m === current
                  ? <span className={s.lastUsedCheck}><Icon name="icon-check" /></span>
                  : <span className={s.locRowChevron}><Icon name="icon-chevron-right" /></span>}
              </button>
            );
          })}
        </div>
      </div>
    </SheetShell>
  );
}

function LocationSheet({ locations, currentId, onClose, onPick, onManage }) {
  return (
    <SheetShell title="Scanning location" onClose={onClose}>
      {locations.length === 0 ? (
        <div className={s.sheetEmpty}>
          <span className={s.sheetEmptyIcon}><Icon name="icon-map-pin" /></span>
          <strong>No locations yet</strong>
          <p>Add a room, cabinet, or shelf to scan items into it.</p>
          <button type="button" className={s.sheetBtn} onClick={onManage}>
            <Icon name="icon-plus" /> Add a location
          </button>
        </div>
      ) : (
        <>
          <div className={s.sheetScroll}>
            <div className={s.locList}>
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
