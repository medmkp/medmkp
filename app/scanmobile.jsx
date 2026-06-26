"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogoMark, Icon, QrScanGlyph } from "./icons";
import { formatTraceDate, isQrUrl, parseLocationQr, SWIPE_REVEAL } from "./lib";
import { ProductSearchResults, useBarcodeScanner, useProductSearch } from "./ui";
import s from "./scanmobile.module.css";

// Mobile scan flow. One scanner, no modes: pick a location, then scan. Each scan
// files to that location — a lot not yet on the shelf is received, a lot already
// on file is confirmed present (the backend infers which; the post-scan drawer
// labels it). Running low? That's the reorder scanner at /app/scan, reached from
// the reorder list — a separate surface, not a mode here.
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

function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

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

// ── Screens 1 + 2: Start scan / Choose location ──────────────────────

export function MobileScanStart({
  loading, sessions, locations, starting, startLocationId, needsAttention,
  onOpenSession, onStart, onNavigate,
}) {
  // "home" | "choose-location"
  const [step, setStep] = useState("home");

  // Deep-link from a printed location QR: the URL carries the location id, so
  // the flow starts scoped to that one location (no home, no location picker).
  const scopedLocation = useMemo(
    () => (startLocationId ? (locations || []).find((l) => l.id === startLocationId) : null),
    [startLocationId, locations],
  );
  // Scanning a label drops straight into the camera: auto-start (or resume) the
  // session for that location. Fire once.
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

  // Every in-progress (active) session is resumable — receiving and shelf-audit
  // both. Most-recently-updated first so the one you just left is on top.
  const active = useMemo(
    () => sessions
      .filter((x) => x.status === "active")
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)),
    [sessions],
  );

  // ── Screen: deep-link from a printed QR — auto-starting into the camera ──
  // Hold on a quiet loading screen while the session is created and we navigate
  // into the scanner. A stale/deleted location id falls through to the normal
  // start screen rather than dead-ending.
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
  // No scan "mode" to pick first — a session is scoped to one location, so
  // choosing the location is the first (and only) thing before scanning.
  if (step === "choose-location") {
    return (
      <MobileScanLocationGate
        locations={locations}
        starting={starting}
        onPick={(loc) => onStart(loc)}
        onBack={() => setStep("home")}
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
          <h1 className={s.h1}>Start scan session</h1>
          <p className={s.sub}>Pick up where you left off or start a new location.</p>
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
            {active.length > 0 && (
              <>
                <div className={s.sectionLabel}>In progress</div>
                <div className={s.resumeList}>
                  {active.map((sess) => {
                    const where = sess.location_name || "location";
                    return (
                      <div key={sess.id} className={s.resumeCard}>
                        <button
                          type="button"
                          className={s.resumeTop}
                          onClick={() => onOpenSession(sess.id)}
                          style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", width: "100%" }}
                        >
                          <span className={s.resumeIcon}><Icon name="icon-refresh" /></span>
                          <span className={s.resumeBody}>
                            <span className={s.resumeKicker}>Scan session</span>
                            <span className={s.resumeTitle}>Continue {where}</span>
                            <span className={s.resumeMeta}><Icon name="icon-calendar" /> {sess.counts?.scanned || 0} items scanned</span>
                            <span className={s.resumeMeta}><Icon name="icon-clock" /> Last updated {relTime(sess.updated_at) || "recently"}</span>
                          </span>
                          <span className={s.resumeChevron}><Icon name="icon-chevron-right" /></span>
                        </button>
                        <button type="button" className={s.resumeBtn} onClick={() => onOpenSession(sess.id)}>Resume</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className={s.actionList}>
              <button type="button" className={s.actionRow} onClick={() => setStep("choose-location")}>
                <span className={s.actionIcon}><Icon name="icon-plus" /></span>
                <span className={s.actionText}>
                  <span className={s.actionTitle}>Start new scan session</span>
                  <span className={s.actionSub}>Pick a location and scan its shelves</span>
                </span>
                <span className={s.actionChevron}><Icon name="icon-chevron-right" /></span>
              </button>
            </div>

            <div className={s.assurance}>
              <Icon name="icon-shield-check" />
              Exact matches auto-add while exceptions are reviewed later.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Scan location gate ────────────────────────────────────────────────
// A session is scoped to one location and its items file there, so picking the
// location is the first action — it starts (or resumes) that location's session,
// then scanning begins. No scan "mode" to choose first.
function MobileScanLocationGate({ locations, starting, onPick, onBack, onManage }) {
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
            <span className={s.camWordTrace}>Trace</span>{" "}<span className={s.camWordDds}>DDS</span>
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
          onManage={onManage}
        />
      )}
    </div>
  );
}

// ── Camera + mode-specific bottom sheets ──────────────────────────────

export function MobileScanSession({
  session, lines, counts, active,
  pendingLine,
  onScan, onAddProduct, onPatchLine, onRemoveLine, onComplete, onBack, onClearPending,
  locations, onSwitchLocation, onNavigate,
}) {
  const [viewMode, setViewMode] = useState("scan"); // scan | review
  const [detail, setDetail] = useState(null);
  const [link, setLink]   = useState(null);
  const [sheet, setSheet] = useState(null); // manual | search | help | location
  const pulseTimer = useRef();
  const [captured, setCaptured] = useState(false);
  // OCR read off the label for the pending line: { lineId, busy, needLot,
  // needExp, lot, expiry }. Driven by the loop below, which keeps reading fresh
  // camera frames while the buyer holds the label, not a single frozen shot.
  const [ocr, setOcr] = useState(null);

  // The post-scan drawer floats over a LIVE camera (like the reorder scanner),
  // so the next item can be aimed and scanned without dismissing it first.
  const cameraActive = active && viewMode === "scan" && !detail && !link;

  const { videoRef, cameraStatus, autoDetect, grabFrame, retry } = useBarcodeScanner({
    active: cameraActive,
    onScan: (code) => {
      // A printed location placard QR (our cabinet labels) carries a location id —
      // scanning one switches which location scans file into, rather than being
      // filed as a non-product. It's not an item, so don't run the scan handler or
      // flash the green capture pulse; switching navigates to that location's
      // session, which is the visible feedback. Pointing at the current location's
      // own placard is a no-op.
      const locId = parseLocationQr(code);
      if (locId) {
        const loc = locId !== session.location_id && locations.find((l) => l.id === locId);
        if (loc) onSwitchLocation(loc);
        return;
      }
      onScan(code);
      // A website QR isn't a product — the parent shows a "not a product" toast.
      // Skip the green "captured" pulse so pointing at one mid-scan doesn't strobe
      // the viewfinder.
      if (isQrUrl(code)) return;
      setCaptured(true);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  // Pre-warm the on-device OCR reader once the camera is live, so the first
  // uncarried-barcode scan that needs a lot/expiry read isn't blocked on the
  // one-time model download. Tesseract runs in a worker (off the main thread), and
  // we wait for the camera to be ready so the download never competes with the
  // jank-prone camera-startup moment.
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

  const locName = session.location_name || "Location";

  // Read lot/expiry off the label by OCR — but as a LOOP over fresh camera frames
  // while the buyer holds the package, not one frozen shot. A barcode often
  // carries no lot/expiry (an HIBC primary code, a bare UPC); those live only in
  // the printed text, and a single frame is frequently lost to glare on foil
  // labels. So each ~0.8s we grab the current frame and OCR it, keeping whichever
  // field a frame manages to read, until both are found or we hit the attempt
  // cap (then the buyer types what's missing). Lazy-imported so Tesseract stays
  // out of the bundle. Re-runs per pending line (keyed by id); cancels on change.
  const lineId = pendingLine?.id;
  useEffect(() => {
    if (!pendingLine) { setOcr(null); return undefined; }
    const needLot = !pendingLine.lot_number;
    const needExp = !pendingLine.expiration_date;
    if (!needLot && !needExp) { setOcr(null); return undefined; }
    // The scanned code is printed as the human-readable line under its barcode, so
    // OCR reads it as a digit run; pass it down so it's never mistaken for the lot.
    const barcode = pendingLine.barcode;

    let cancelled = false;
    let foundLot = null;
    let foundExp = null;
    setOcr({ lineId, busy: true, needLot, needExp, lot: null, expiry: null });

    (async () => {
      const { ocrLotExpiry } = await import("./ocrLabel");
      const MAX_ATTEMPTS = 8; // ~0.8s apart + OCR time ⇒ a ~15–20s budget
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled; attempt++) {
        const frame = grabFrame();
        if (frame) {
          let res = {};
          try { res = await ocrLotExpiry(frame, { barcode }); } catch { res = {}; }
          if (cancelled) return;
          if (needLot && !foundLot && res.lot) foundLot = res.lot;
          if (needExp && !foundExp && res.expiry) foundExp = res.expiry;
          const done = (!needLot || foundLot) && (!needExp || foundExp);
          setOcr({ lineId, busy: !done, needLot, needExp, lot: foundLot, expiry: foundExp });
          if (done) return;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!cancelled) {
        setOcr((o) => (o && o.lineId === lineId ? { ...o, busy: false } : o));
      }
    })();

    return () => { cancelled = true; };
    // grabFrame is stable (useCallback); re-run only when the pending line changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId]);

  // The OCR result, only while it belongs to the line currently in the drawer.
  const ocrForPending = ocr && ocr.lineId === lineId ? ocr : null;
  const ocrBusy = Boolean(ocrForPending?.busy);
  // Suggestion drives both the drawer field fill and the hint pill; carry the
  // need flags so the pill can say which field still has to be typed in.
  const ocrSuggestion = ocrForPending
    ? { lot: ocrForPending.lot, expiry: ocrForPending.expiry, needLot: ocrForPending.needLot, needExp: ocrForPending.needExp }
    : null;

  // ----- Shelf details (deep edit) -----
  if (detail) {
    return (
      <ShelfDetails
        line={detail}
        locName={locName}
        onCancel={() => setDetail(null)}
        onSave={(body, scanNext) => { onPatchLine(detail.id, body); setDetail(null); if (scanNext) setViewMode("scan"); }}
      />
    );
  }

  // ----- Review -----
  if (viewMode === "review") {
    return (
      <ReviewSession
        session={session}
        lines={lines}
        counts={counts}
        onBack={() => setViewMode("scan")}
        onScanMore={() => setViewMode("scan")}
        onSave={onComplete}
        onDetail={(line) => setDetail(line)}
        onLink={(line) => setLink(line)}
        onRemoveLine={onRemoveLine}
        linkSheet={link}
        onCloseLink={() => setLink(null)}
        onPatchLine={onPatchLine}
      />
    );
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
          onClick={() => (session.location_id ? onNavigate?.(`/app/locations/${session.location_id}`) : onBack?.())}
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
          {/* Scan glyph with a running count of items captured this session;
              taps through to review. */}
          {counts.scanned > 0 && (
            <button
              type="button"
              className={s.camReviewBtn}
              onClick={() => setViewMode("review")}
              aria-label={`Review ${counts.scanned} scanned items`}
            >
              <QrScanGlyph />
              <span className={s.camCountBadge}>{counts.scanned > 99 ? "99+" : counts.scanned}</span>
            </button>
          )}
        </span>
      </div>

      {/* Context strip — the location is the only context, anchored under the
          header so it holds its position across the scan → post-scan transition
          (the sheet rises underneath it, nothing hops). It's a selector: tap to
          switch which location scans file into. There's no scan "mode" — a new
          lot here is received, a known lot is confirmed, inferred per scan. */}
      <div className={s.contextStrip}>
        <button type="button" className={s.locPill} onClick={() => setSheet("location")}>
          <Icon name="icon-map-pin" />
          <span className={s.locPillName}>{locName}</span>
          <span className={s.locPillCaret}><Icon name="icon-chevron-down" /></span>
        </button>
        {/* OCR hint pill under the location pill (not overlaid on the post-scan
            drawer): a one-time "preparing reader" bar while the model downloads,
            then a "reading…" note while OCR runs, then a confirm-it note once it's
            pre-filled the lot/expiry fields. */}
        {showOcrLoad ? (
          <OcrLoadPill progress={ocrLoad.progress} />
        ) : pendingLine && (ocrBusy || ocrSuggestion) ? (
          <OcrHintPill ocrBusy={ocrBusy} suggestion={ocrSuggestion} />
        ) : null}
      </div>

      <div className={s.camFrame} aria-hidden="true"><span /><span /><span /><span /></div>
      {cameraStatus === "ready" && (
        <div className={s.camHint}>
          {pendingLine ? "Point at the next item to keep scanning" : "Point at a barcode"}
        </div>
      )}

      {/* Post-scan drawer — one sheet, over a LIVE camera (lot / expiry in a
          horizontal swipe strip), keyed by line so the next scan remounts it and
          the previous line's edits persist on unmount. The header reflects what
          the scan did (received a new lot vs confirmed one already on the shelf),
          inferred by the backend — no mode to choose. */}
      {pendingLine && (
        <CaptureScanSheet
          key={pendingLine.id}
          line={pendingLine}
          locationName={locName}
          suggestion={ocrSuggestion}
          onPersist={(id, body) => onPatchLine(id, body)}
          onDismiss={(id, body) => { onPatchLine(id, body); onClearPending?.(); }}
        />
      )}

      {sheet === "manual"   && <ManualSheet onClose={() => setSheet(null)} onSubmit={(code) => { onScan(code); setSheet(null); }} />}
      {sheet === "search"   && <SearchSheet title="Search product" onClose={() => setSheet(null)} onPick={(p) => { onAddProduct(p); setSheet(null); }} />}
      {sheet === "location" && (
        <LocationSheet
          locations={locations}
          currentId={session.location_id}
          onClose={() => setSheet(null)}
          onPick={(loc) => {
            setSheet(null);
            // Switch which location scans file into (starts/resumes that
            // location's session and navigates into it).
            if (loc.id !== session.location_id) onSwitchLocation(loc);
          }}
          onManage={() => { setSheet(null); onNavigate?.("/app/locations"); }}
        />
      )}

      {link && (
        <SearchSheet
          title="Identify this item"
          hint="Search the catalog to link the right product."
          onClose={() => setLink(null)}
          onPick={(product) => {
            const best = product.best_offer || product.offers?.[0] || null;
            const id   = product.id || "";
            onPatchLine(link.id, {
              canonical_product_id: id.startsWith("mcp") ? id : null,
              supplier_product_id:  best?.supplier_product_id || (id.startsWith("msp") ? id : null),
              name:      product.name,
              image_url: product.image_url || best?.image_url || "",
            });
            setLink(null);
          }}
        />
      )}
    </div>
  );
}

// ── /app/scan — quick scan into the reorder list (rich camera overlay) ─────
// Reuses the scanner camera shell + bottom drawer, but its only output is the
// reorder list: no scan session, no evidence log, no location. Each scan opens a
// drawer to capture lot / expiry on the item (kept on the reorder line). The
// top-right button is the scan glyph with a running count that taps through to
// the reorder list. This is the "running low" surface, separate from the
// location scanner — reached from the reorder list, not as a scan mode.

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

// ── OCR read-off-the-label hint pill ──────────────────────────────────
// Shown under the location pill while the post-scan drawer is up: a "reading…"
// note (which tells the buyer to hold steady — the OCR loop reads fresh frames
// until it gets a clean one), then, once it stops, a note naming exactly which
// field it filled and which still has to be typed. Assistive — the values land in
// the editable fields, never silently — and it lives in the top strip, not on the
// drawer, so it doesn't crowd the captured fields.

// One-time progress while the OCR core + model download. Only shows on a fresh
// device (a cached load finishes before the parent's debounce and never renders
// this), and disappears once the reader is ready — the read/confirm hints take
// over from there. Same pill chrome as those, with a thin determinate bar.
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

// The result of a scan, for the drawer header — inferred by the backend, not
// chosen as a mode. A lot not yet on the shelf was received; a lot already on
// file was confirmed present; an unidentified scan needs review (link it later).
function captureResult(line) {
  if (line.status === "needs_review") return { cls: s.badgeAmber, icon: "icon-clock", label: "Needs review" };
  if (line.inventory_action === "confirmed") return { cls: s.badgeGreen, icon: "icon-check-circle", label: "Confirmed present" };
  return { cls: s.badgeGreen, icon: "icon-check-circle", label: "Added · received" };
}

// One post-scan drawer for the location scanner: a shallow sheet (≤ 1/3 screen)
// over a running viewfinder, capturing lot / expiry in a horizontal swipe strip.
// No mode, no qty stepper, no Undo / Save buttons — the line is already on the
// session (added the moment it was scanned), so this drawer only captures details
// and persists them when the next scan replaces it (keyed remount) or it's
// flicked down. The header reflects what the scan did (received vs confirmed) and
// the location is the session's, shown read-only (switch it from the top pill).
// A received scan also captures a received date.
function CaptureScanSheet({ line, locationName, suggestion, onPersist, onDismiss }) {
  const result = captureResult(line);
  // Identified + not a confirm of an existing lot ⇒ a receive (captures a
  // received date). Unidentified lines record neither until they're linked.
  const isConfirmed = line.inventory_action === "confirmed";
  const isReceived = line.status !== "needs_review" && !isConfirmed;
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
  // scan stamps a received date; a confirmed one records that the lot was seen
  // present on the shelf.
  const latest = useRef();
  latest.current = { lot, exp, received };
  function body() {
    const { lot: l, exp: e, received: r } = latest.current;
    const out = {
      lot_number:      l.trim() || null,
      expiration_date: e || null,
    };
    if (isReceived) out.received_date = r || null;
    if (isConfirmed) out.shelf_audit_status = "present";
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

// ── Deep-edit: Shelf details (full screen) ────────────────────────────

function ShelfDetails({ line, locName, onCancel, onSave }) {
  const [qty,       setQty]       = useState(line.quantity || 1);
  const [shelf,     setShelf]     = useState(line.shelf_area || "");
  const [exp,       setExp]       = useState(line.expiration_date ? String(line.expiration_date).slice(0, 10) : "");
  const [lot,       setLot]       = useState(line.lot_number || "");
  const [condition, setCondition] = useState(line.package_condition || "good");

  function body() {
    return {
      quantity:          Number(qty) || 1,
      shelf_area:        shelf.trim() || null,
      expiration_date:   exp || null,
      lot_number:        lot.trim() || null,
      package_condition: condition,
    };
  }

  const sku   = offerSku(line);
  const pack  = offerPack(line);
  const brand = line?._offer?.brand;

  return (
    <div className={s.screen}>
      <header className={s.topbar}>
        <button type="button" className={s.iconBtn} onClick={onCancel} aria-label="Back"><Icon name="icon-chevron-left" /></button>
        <span className={s.barTitle}>Edit details</span>
      </header>
      <div className={s.body}>
        <div className={s.intro}>
          <p className={s.sub}>Review item details before saving.</p>
        </div>

        <div className={s.prodCard}>
          <div className={s.prodTop}>
            <span className={s.prodImg}>{line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="icon-package" />}</span>
            <div className={s.prodInfo}>
              <span className={s.prodName}>{line.name}</span>
              {brand && <span className={s.prodAttr}>{brand}</span>}
            </div>
          </div>
          {(sku || pack) && (
            <div className={s.prodSpecs}>
              {sku  && <div className={s.prodSpec}><span className={s.prodSpecLabel}>SKU / MPN</span><span className={s.prodSpecVal}>{sku}</span></div>}
              {pack && <div className={s.prodSpec}><span className={s.prodSpecLabel}>Package</span><span className={s.prodSpecVal}>{pack}</span></div>}
            </div>
          )}
          <div className={s.prodLocChip}><Icon name="icon-map-pin" /> {locName}</div>
        </div>

        <div className={s.formCard}>
          <div className={s.formHead}><Icon name="icon-list" /> Shelf details</div>
          <div className={s.formRow}>
            <span className={s.formLabel}>Location</span>
            <div className={s.input} style={{ color: "#6a7889" }}>{locName}</div>
          </div>
          <div className={s.formRow}>
            <span className={s.formLabel}>Shelf / Area</span>
            <input className={s.input} value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="e.g. Top shelf" />
          </div>
          <div className={s.formRow}>
            <span className={s.formLabel}>Quantity on hand</span>
            <div className={s.formRowSuffix}>
              <div className={s.stepper}>
                <button type="button" className={s.stepBtn} onClick={() => setQty((q) => Math.max(1, Number(q) - 1))} aria-label="Decrease">−</button>
                <span className={s.stepVal}>{qty}</span>
                <button type="button" className={s.stepBtn} onClick={() => setQty((q) => Number(q) + 1)} aria-label="Increase">+</button>
              </div>
              <span className={s.formSuffix}>items</span>
            </div>
          </div>
        </div>

        <div className={s.formCard}>
          <div className={s.formHead}><Icon name="icon-shield-check" /> Traceability</div>
          <div className={s.formRow}>
            <span className={s.formLabel}>Expiration date</span>
            <input className={s.input} type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
          </div>
          <div className={s.formRow}>
            <span className={s.formLabel}>Lot number</span>
            <input className={s.input} value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. 13593092" />
          </div>
          <div className={s.formRow}>
            <span className={s.formLabel}>Package</span>
            <select className={s.select} value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="missing">Missing</option>
            </select>
          </div>
        </div>
      </div>
      <div className={s.footer}>
        <button type="button" className={s.btnOutline} onClick={() => onSave(body(), false)}>Save item</button>
        <button type="button" className={s.btnPrimary} onClick={() => onSave(body(), true)}>Save &amp; scan next</button>
      </div>
    </div>
  );
}

// ── Review session ────────────────────────────────────────────────────

// Each review row swipes left to reveal a Remove action, matching the reorder
// list gesture (see MobileReorderCard). The front layer carries the row content
// and translates under the thumb; the red Remove sits flush to the screen edge.
function SwipeRow({ onRemove, children }) {
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
    setDx(Math.min(0, Math.max(-SWIPE_REVEAL, base + deltaX)));
  }
  function onTouchEnd() {
    if (!dragging.current && !moved.current) return;
    dragging.current = false;
    const shouldOpen = dx <= -SWIPE_REVEAL / 2;
    setOpen(shouldOpen);
    setDx(shouldOpen ? -SWIPE_REVEAL : 0);
  }
  // Swallow the synthetic click that follows a swipe so it can't fire the row's
  // inner Review/Edit buttons.
  function onClickCapture(event) {
    if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false; }
  }

  return (
    <div className={`${s.swipeWrap} ${open ? s.swipeOpen : ""}`}>
      <button
        type="button"
        className={s.swipeRemove}
        tabIndex={open ? 0 : -1}
        aria-label="Remove item from session"
        onClick={() => { setOpen(false); setDx(0); onRemove(); }}
      >
        <Icon name="icon-trash-ios" />
        <span>Remove</span>
      </button>
      <div
        className={s.revRow}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClickCapture}
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? "none" : "transform .2s ease" }}
      >
        {children}
      </div>
    </div>
  );
}

function ReviewSession({ session, lines, counts, onBack, onScanMore, onSave, onDetail, onLink, onRemoveLine, linkSheet, onCloseLink, onPatchLine }) {
  const review    = lines.filter((l) => l.status === "needs_review");
  const details   = lines.filter((l) => l.status === "needs_details");
  const confirmed = lines.filter((l) => l.status === "confirmed");

  const [openReview,    setOpenReview]    = useState(true);
  const [openDetails,   setOpenDetails]   = useState(true);
  const [openConfirmed, setOpenConfirmed] = useState(true);

  return (
    <div className={`${s.screen} ${s.reviewScroll}`}>
      <header className={`${s.topbar} ${s.reviewTopbar}`}>
        <button type="button" className={s.iconBtn} onClick={onBack} aria-label="Back"><Icon name="icon-chevron-left" /></button>
        <span className={s.barTitle}>Review {session.location_name || "location"}</span>
      </header>
      <div className={`${s.body} ${s.reviewBodyScroll}`}>
        <div className={s.reviewTitle}>
          <span className={s.reviewSub}>Scan session review</span>
        </div>

        <div className={s.statGrid}>
          <div className={s.statCard}><div className={`${s.statTop} ${s.txBlue}`}><Icon name="icon-scan" /><span className={s.statVal}>{counts.scanned}</span></div><span className={s.statLabel}>scanned</span></div>
          <div className={s.statCard}><div className={`${s.statTop} ${s.txGreen}`}><Icon name="icon-check-circle" /><span className={s.statVal}>{counts.confirmed}</span></div><span className={s.statLabel}>confirmed</span></div>
          <div className={s.statCard}><div className={`${s.statTop} ${s.txAmber}`}><Icon name="icon-clock" /><span className={s.statVal}>{counts.needs_details}</span></div><span className={s.statLabel}>need details</span></div>
          <div className={s.statCard}><div className={`${s.statTop} ${s.txRed}`}><Icon name="icon-alert-triangle" /><span className={s.statVal}>{counts.needs_review}</span></div><span className={s.statLabel}>need review</span></div>
        </div>

        {review.length > 0 && (
          <section className={`${s.section} ${s.sectionRed}`}>
            <button type="button" className={s.secHead} onClick={() => setOpenReview((v) => !v)}>
              <span className={`${s.secHeadIcon} ${s.txRed}`}><Icon name="icon-alert-triangle" /></span>
              <span className={`${s.secTitle} ${s.txRed}`}>Needs review ({review.length})</span>
              <span className={`${s.secToggle} ${openReview ? s.secToggleOpen : ""}`}><Icon name="icon-chevron-down" /></span>
            </button>
            {openReview && (
              <div className={s.revList}>
                {review.map((line) => (
                  <SwipeRow key={line.id} onRemove={() => onRemoveLine(line.id)}>
                    <span className={s.revThumb}>{line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="icon-alert-triangle" />}</span>
                    <div className={s.revBody}>
                      <span className={s.revName}>{line.name}</span>
                      <span className={s.revMeta}>{offerSku(line) ? `SKU: ${offerSku(line)}` : "No catalog match"}</span>
                      <span className={s.revLoc}><Icon name="icon-map-pin" /> {session.location_name}</span>
                    </div>
                    <button type="button" className={s.revBtn} onClick={() => onLink(line)}>Review</button>
                  </SwipeRow>
                ))}
              </div>
            )}
          </section>
        )}

        {details.length > 0 && (
          <section className={s.section}>
            <button type="button" className={s.secHead} onClick={() => setOpenDetails((v) => !v)}>
              <span className={`${s.secHeadIcon} ${s.txAmber}`}><Icon name="icon-clock" /></span>
              <span className={`${s.secTitle} ${s.txAmber}`}>Missing details ({details.length})</span>
              <span className={`${s.secToggle} ${openDetails ? s.secToggleOpen : ""}`}><Icon name="icon-chevron-down" /></span>
            </button>
            {openDetails && (
              <div className={s.revList}>
                {details.map((line) => (
                  <SwipeRow key={line.id} onRemove={() => onRemoveLine(line.id)}>
                    <span className={s.revThumb}>{line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="icon-clock" />}</span>
                    <div className={s.revBody}>
                      <span className={s.revName}>{line.name}</span>
                      <span className={s.revMeta}>{offerSku(line) ? `SKU: ${offerSku(line)}` : ""}</span>
                    </div>
                    <div className={s.revRight}>
                      <span className={`${s.resultPill} ${s.pillAmber}`}>
                        {!line.expiration_date ? "Add expiration" : !line.lot_number ? "Add lot" : "Add details"}
                      </span>
                      <button type="button" className={s.revBtn} onClick={() => onDetail(line)}>Edit</button>
                    </div>
                  </SwipeRow>
                ))}
              </div>
            )}
          </section>
        )}

        {confirmed.length > 0 && (
          <section className={s.section}>
            <button type="button" className={s.secHead} onClick={() => setOpenConfirmed((v) => !v)}>
              <span className={`${s.secHeadIcon} ${s.txGreen}`}><Icon name="icon-check-circle" /></span>
              <span className={`${s.secTitle} ${s.txGreen}`}>Confirmed ({confirmed.length})</span>
              <span className={`${s.secToggle} ${openConfirmed ? s.secToggleOpen : ""}`}><Icon name="icon-chevron-down" /></span>
            </button>
            {openConfirmed && (
              <div className={s.revList}>
                {confirmed.map((line) => (
                  <SwipeRow key={line.id} onRemove={() => onRemoveLine(line.id)}>
                    <span className={s.revThumb}>{line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="icon-check-circle" />}</span>
                    <div className={s.revBody}>
                      <span className={s.revName}>{line.name}</span>
                      <span className={s.revMeta}>
                        {offerSku(line) ? `SKU: ${offerSku(line)}` : ""}
                        {line.expiration_date ? `${offerSku(line) ? " · " : ""}Exp ${formatTraceDate(line.expiration_date)}` : ""}
                      </span>
                    </div>
                    <span className={`${s.resultPill} ${s.pillGreen}`}><Icon name="icon-check-circle" /> Exact match</span>
                  </SwipeRow>
                ))}
              </div>
            )}
          </section>
        )}

        <div className={s.banner}><Icon name="icon-info" /> You can finish this location after saving.</div>
      </div>
      <div className={`${s.footer} ${s.reviewFooter}`}>
        <button type="button" className={s.btnOutline} onClick={onScanMore}><Icon name="icon-scan" /> Scan more</button>
        <button type="button" className={s.btnPrimary} onClick={onSave}><Icon name="icon-check" /> Save session</button>
      </div>

      {linkSheet && (
        <SearchSheet
          title="Identify this item"
          hint="Search the catalog to link the right product."
          onClose={onCloseLink}
          onPick={(product) => {
            const best = product.best_offer || product.offers?.[0] || null;
            const id   = product.id || "";
            onPatchLine(linkSheet.id, {
              canonical_product_id: id.startsWith("mcp") ? id : null,
              supplier_product_id:  best?.supplier_product_id || (id.startsWith("msp") ? id : null),
              name:      product.name,
              image_url: product.image_url || best?.image_url || "",
            });
            onCloseLink();
          }}
        />
      )}
    </div>
  );
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
