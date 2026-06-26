"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  formatTraceDate,
  isQrUrl,
  scanLinePayload,
  scanLookup,
  scanMissReason,
  traceApi,
} from "./lib";
import { ScanHandoffQr } from "./ui";
import { MobileScanStart, MobileScanSession } from "./scanmobile";
import { playMatchChime, vibrateNoMatch } from "./scanSound";
import s from "./scansessions.module.css";

// Scanner — session-less. Pick a location (and a record type: Receiving or Shelf
// Audit), then scan: every scan lands immediately as lot-at-location evidence on
// that location. There is no resumable session, no "complete" step — the data is
// saved as you go. Exact matches land as matched evidence; anything the catalog
// can't identify lands as a placeholder that surfaces in Needs Attention until
// it's linked to a product. Scanning is a phone activity; the desktop view keys
// codes in and hands off to the phone camera.

const TYPE_META = {
  operatory: { icon: "icon-dental-chair", tint: s.tBlue },
  cabinet: { icon: "icon-archive-down", tint: s.tIndigo },
  sterilization: { icon: "icon-shield-check", tint: s.tTeal },
  lab: { icon: "icon-bolt", tint: s.tViolet },
  storage: { icon: "icon-package", tint: s.tSlate },
  emergency_kit: { icon: "icon-alert-triangle", tint: s.tRed },
  other: { icon: "icon-map-pin", tint: s.tBlue },
};
const typeMeta = (type) => TYPE_META[type] || TYPE_META.other;

const MODE_LABEL = { receiving: "Receiving", shelf_audit: "Shelf Audit" };

// Decorate a freshly-saved evidence item for the scanner UI: attach the matched
// product's image + offer (the inventory row itself carries neither) so the
// post-scan drawer and the desktop list can show them.
function decorateItem(item, product) {
  const best = product?.best_offer || product?.offers?.[0] || null;
  return {
    ...item,
    image_url: item.image_url || product?.image_url || best?.image_url || "",
    _offer: best,
  };
}

export function ScannerView({ startLocationId, startMode, onNavigate, onToast }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  // "start" → choose mode + location; "scanning" → the camera/keypad surface.
  const [phase, setPhase] = useState(startLocationId ? "scanning" : "start");
  const [captureType, setCaptureType] = useState(startMode || "shelf_audit");
  const [currentLocationId, setCurrentLocationId] = useState(startLocationId || null);
  const [items, setItems] = useState([]); // captured this run, for the count + list
  const [pendingItem, setPendingItem] = useState(null);
  // OCR suggestion for the pending item: { itemId, busy, lot?, expiry? }.
  const [ocr, setOcr] = useState(null);
  const [manual, setManual] = useState("");
  const flashTimer = useRef();

  useEffect(() => { setIsMobile(window.matchMedia("(max-width: 900px)").matches); }, []);

  useEffect(() => {
    let alive = true;
    traceApi.listLocations()
      .then((d) => { if (alive) { setLocations(d.locations || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const location = useMemo(
    () => locations.find((l) => l.id === currentLocationId) || null,
    [locations, currentLocationId],
  );

  const needsAttention = useMemo(() => {
    const total = locations.reduce((sum, l) => sum + (l.needs_attention_count || 0), 0);
    const locs = locations.filter((l) => (l.needs_attention_count || 0) > 0).length;
    return { items: total, locations: locs };
  }, [locations]);

  const active = phase === "scanning";

  // Begin scanning. Shelf Audit is scoped to the chosen location; Receiving fans
  // out to shelves, so it defaults to the first location and the put-away
  // location is changed from the scanner's pill as the tech moves.
  const start = useCallback((loc, mode) => {
    const cap = mode || "shelf_audit";
    setCaptureType(cap);
    setCurrentLocationId(loc?.id || (cap === "receiving" ? (locations[0]?.id || null) : null));
    setItems([]);
    setPendingItem(null);
    setOcr(null);
    setPhase("scanning");
  }, [locations]);

  const handleScan = useCallback(async (code, getShot) => {
    if (!code || !active) return;
    if (!currentLocationId) { onToast?.("Choose a location to scan into."); return; }
    // A website QR — our own tracedds.com codes or any URL — isn't a product.
    if (isQrUrl(code)) {
      vibrateNoMatch();
      onToast?.("Skipped a website QR code — that's not a product barcode.");
      return;
    }
    // Freeze the scanned frame now (mobile only), while the package is still in
    // view — OCR runs after the lookup, by which point the phone has moved.
    const frame = typeof getShot === "function" ? getShot() : null;
    setOcr(null);
    try {
      const { product, scanned } = await scanLookup(code);
      const body = { location_id: currentLocationId, capture_type: captureType, ...scanLinePayload(code, product, scanned) };
      const { item, outcome } = await traceApi.createScan(body);
      const decorated = decorateItem(item, product);
      // A re-scan of the same lot returns the same record id — replace in place and
      // float it to the top rather than stacking a duplicate row.
      setItems((prev) => [decorated, ...prev.filter((i) => i.id !== decorated.id)]);
      setPendingItem(decorated);

      if (outcome === "unmatched") onToast?.(scanMissReason(code));
      if (product) playMatchChime(); else vibrateNoMatch();
      // Desktop auto-dismisses the pending drawer; mobile keeps it up for edits.
      if (!isMobile) {
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setPendingItem(null), 2600);
      }

      // OCR fallback: the barcode identified the item but carried no lot/expiry —
      // read them off the frozen frame, on-device, as a suggestion the drawer fills.
      const needsLot = !body.lot_number;
      const needsExp = !body.expiration_date;
      if (frame && (needsLot || needsExp)) {
        setOcr({ itemId: item.id, busy: true });
        try {
          const { ocrLotExpiry } = await import("./ocrLabel");
          const res = await ocrLotExpiry(frame);
          setOcr({
            itemId: item.id,
            busy: false,
            lot: needsLot ? res.lot || null : null,
            expiry: needsExp ? res.expiry || null : null,
          });
        } catch {
          setOcr(null);
        }
      }
    } catch {
      onToast?.("Scan failed — try again.");
    }
  }, [active, currentLocationId, captureType, isMobile, onToast]);

  // Add an item the buyer picked from search (no barcode).
  const addProduct = useCallback(async (product) => {
    if (!active || !currentLocationId) return;
    try {
      const body = { location_id: currentLocationId, capture_type: captureType, ...scanLinePayload(null, product, null) };
      const { item } = await traceApi.createScan(body);
      const decorated = decorateItem(item, product);
      setItems((prev) => [decorated, ...prev.filter((i) => i.id !== decorated.id)]);
      setPendingItem(decorated);
    } catch {
      onToast?.("Couldn't add that item.");
    }
  }, [active, currentLocationId, captureType, onToast]);

  const patchItem = useCallback(async (id, body) => {
    try {
      const { item } = await traceApi.updateItem(id, body);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...item } : i)));
    } catch {
      onToast?.("Couldn't save that change.");
    }
  }, [onToast]);

  function submitManual(e) {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    handleScan(v);
    setManual("");
  }

  const ocrMatch = ocr && pendingItem && ocr.itemId === pendingItem.id ? ocr : null;

  // ── Mobile ──────────────────────────────────────────────────────────
  if (isMobile) {
    if (active) {
      return (
        <MobileScanSession
          location={location}
          items={items}
          active={active}
          pendingItem={pendingItem}
          captureType={captureType}
          ocrBusy={Boolean(ocrMatch?.busy)}
          ocrSuggestion={ocrMatch && !ocrMatch.busy ? { lot: ocrMatch.lot, expiry: ocrMatch.expiry } : null}
          onScan={handleScan}
          onAddProduct={addProduct}
          onPatchItem={patchItem}
          onClearPending={() => setPendingItem(null)}
          onBack={() => (startLocationId ? onNavigate?.("/app/locations") : setPhase("start"))}
          locations={locations}
          onSwitchLocation={(loc) => setCurrentLocationId(loc.id)}
          onSwitchMode={(mode) => setCaptureType(mode)}
          onNavigate={onNavigate}
        />
      );
    }
    return (
      <MobileScanStart
        loading={loading}
        locations={locations}
        starting=""
        needsAttention={needsAttention}
        onStart={start}
        onNavigate={onNavigate}
      />
    );
  }

  // ── Desktop ─────────────────────────────────────────────────────────
  if (active) {
    return (
      <DesktopScanner
        location={location}
        captureType={captureType}
        items={items}
        manual={manual}
        setManual={setManual}
        onSubmitManual={submitManual}
        onBack={() => (startLocationId ? onNavigate?.("/app/locations") : setPhase("start"))}
        onNavigate={onNavigate}
      />
    );
  }
  return (
    <DesktopStart
      loading={loading}
      locations={locations}
      captureType={captureType}
      onPickMode={setCaptureType}
      onStart={start}
      onNavigate={onNavigate}
    />
  );
}

// ── Desktop: choose mode + location ───────────────────────────────────

function DesktopStart({ loading, locations, captureType, onPickMode, onStart, onNavigate }) {
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.title}>Scan</h1>
          <p className={s.subtitle}>
            Pick a location and scan its shelves — every scan is saved as lot &amp; expiry evidence on
            that location as you go. Scanning works best from your phone&rsquo;s camera.
          </p>
        </div>
      </header>

      <div className={s.modeToggle}>
        {["shelf_audit", "receiving"].map((m) => (
          <button
            key={m}
            type="button"
            className={`${s.modeToggleBtn} ${captureType === m ? s.modeToggleActive : ""}`}
            onClick={() => onPickMode(m)}
          >
            <Icon name={m === "receiving" ? "icon-package" : "icon-clipboard-check"} /> {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={s.empty}>Loading locations…</div>
      ) : locations.length === 0 ? (
        <div className={s.emptyCard}>
          <span className={s.emptyIcon}><Icon name="icon-map-pin" /></span>
          <strong>No locations yet</strong>
          <span>Add a location first, then scan its shelves.</span>
          <button type="button" className={s.scanBtn} onClick={() => onNavigate?.("/app/locations/new")}>
            <Icon name="icon-plus" /> Add location
          </button>
        </div>
      ) : (
        <div className={s.pickList}>
          {locations.map((loc) => {
            const meta = typeMeta(loc.type);
            return (
              <button key={loc.id} type="button" className={s.pickRow} onClick={() => onStart(loc, captureType)}>
                <span className={`${s.cardIcon} ${meta.tint}`}><Icon name={meta.icon} /></span>
                <span className={s.pickBody}>
                  <strong>{loc.name}</strong>
                  <small>{loc.item_count ?? 0} item{(loc.item_count ?? 0) === 1 ? "" : "s"} tracked</small>
                </span>
                <Icon name="icon-chevron-right" className={s.pickChevron} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Desktop: scanning (keypad + phone handoff + run list) ─────────────

function DesktopScanner({ location, captureType, items, manual, setManual, onSubmitManual, onBack, onNavigate }) {
  const handoffUrl = typeof window !== "undefined" && location
    ? `${window.location.origin}/app/scan-session?location=${encodeURIComponent(location.id)}&mode=${captureType}`
    : "";

  return (
    <div className={s.session}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        <button type="button" className={s.crumbLink} onClick={onBack}>Scan</button>
        <span className={s.crumbSep}>/</span>
        <span className={s.crumbCurrent}>{location?.name || "Location"}</span>
      </nav>

      <header className={s.sessionHead}>
        <div className={s.sessionId}>
          <span className={`${s.cardIcon} ${typeMeta(location?.type).tint}`}><Icon name={typeMeta(location?.type).icon} /></span>
          <div>
            <div className={s.sessionTitleRow}>
              <h1 className={s.title}>{location?.name || "Location"}</h1>
              <span className={`${s.badge} ${s.badgeBlue}`}>{MODE_LABEL[captureType]}</span>
            </div>
            <p className={s.subtitle}>Scans land here as you go — lot &amp; expiry are captured when the code carries them.</p>
          </div>
        </div>
        {location && (
          <button type="button" className={s.completeBtn} onClick={() => onNavigate?.(`/app/locations/${location.id}`)}>
            <Icon name="icon-check" /> Done · view location
          </button>
        )}
      </header>

      <div className={s.grid}>
        <div className={s.main}>
          <section className={s.scanPanel}>
            <div className={s.handoff}>
              <div className={s.handoffQr}><ScanHandoffQr url={handoffUrl} /></div>
              <div className={s.handoffBody}>
                <strong>Scan with your phone</strong>
                <p>Open this location on your phone&rsquo;s camera for a far better read of small Data Matrix codes — or key a code in below.</p>
              </div>
            </div>
            <form className={s.manualRow} onSubmit={onSubmitManual}>
              <label className={s.manualField}>
                <Icon name="icon-scan" />
                <input
                  type="text"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="Enter barcode or SKU"
                  autoComplete="off"
                  autoCapitalize="characters"
                  aria-label="Barcode or SKU"
                />
              </label>
              <button type="submit" className={s.lookupBtn} disabled={!manual.trim()}><Icon name="icon-search" /> Look up</button>
            </form>
          </section>

          <section className={s.queue}>
            <div className={s.queueHead}>
              <h2 className={s.groupTitle}>Scanned this session</h2>
              <span className={s.muted}>{items.length} item{items.length === 1 ? "" : "s"}</span>
            </div>
            {items.length === 0 ? (
              <div className={s.emptyCard}>
                <span className={s.emptyIcon}><Icon name="icon-scan" /></span>
                <strong>No items scanned yet</strong>
                <span>Key a code in above, or scan from your phone.</span>
              </div>
            ) : (
              <div className={s.lineList}>
                {items.map((item) => <DesktopScanRow key={item.id} item={item} />)}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function DesktopScanRow({ item }) {
  const matched = Boolean(item.canonical_product_id || item.supplier_product_id);
  return (
    <div className={s.line}>
      <div className={s.lineMain}>
        <span className={s.lineThumb}>
          {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <Icon name={matched ? "icon-check-circle" : "icon-alert-triangle"} />}
        </span>
        <div className={s.lineBody}>
          <strong className={s.lineName}>{item.name}</strong>
          <div className={s.lineMeta}>
            <span>Qty {item.quantity_on_hand ?? 1}</span>
            {item.lot_number && <span>· Lot {item.lot_number}</span>}
            {item.expiration_date && <span>· Exp {formatTraceDate(item.expiration_date)}</span>}
          </div>
        </div>
        <span className={`${s.linePill} ${matched ? s.txGreen : s.txRed}`}>
          <Icon name={matched ? "icon-check-circle" : "icon-alert-triangle"} /> {matched ? "Exact match" : "Needs review"}
        </span>
      </div>
    </div>
  );
}
