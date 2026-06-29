"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  formatExpiryDate,
  isQrUrl,
  lookupByOcrIdentity,
  scanLinePayload,
  scanLookup,
  scanMissReason,
  traceApi,
} from "./lib";
import { ScanHandoffQr } from "./ui";
import { MobileScanStart, MobileScanSession } from "./scanmobile";
import { planScanMerge } from "./scanMerge";
import { playMatchChime, vibrateNoMatch } from "./scanSound";
import s from "./scansessions.module.css";

// Scanner — session-less, no modes. Pick a location, then scan: every scan lands
// immediately as lot-at-location evidence on that location. A lot not yet on the
// shelf is a receive, an already-filed lot is a confirmation — the backend infers
// which (a new record vs a merge), no record type to choose up front. There is no
// resumable session, no "complete" step — the data is saved as you go. Exact
// matches land as matched evidence; anything the catalog can't identify lands as a
// placeholder that surfaces in Needs Attention until it's linked to a product.
// Scanning is a phone activity; the desktop view keys codes in and hands off to
// the phone camera.

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

export function ScannerView({ startLocationId, onNavigate, onToast, account, onSignOut }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  // "start" → choose location; "scanning" → the camera/keypad surface.
  const [phase, setPhase] = useState(startLocationId ? "scanning" : "start");
  const [currentLocationId, setCurrentLocationId] = useState(startLocationId || null);
  const [items, setItems] = useState([]); // captured this run, for the count + list
  const [pendingItem, setPendingItem] = useState(null);
  // OCR suggestion for the pending item: { itemId, busy, needLot, needExp, lot?,
  // expiry? }, plus identity for an unmatched scan { match?, via?, suggestions? }.
  const [ocr, setOcr] = useState(null);
  const [manual, setManual] = useState("");
  const flashTimer = useRef();
  // Serialize scan processing: one package's 1D and 2D codes fire ~1s apart, and
  // the later read must see the row the first one filed so it merges onto it
  // rather than racing ahead and duplicating it (see planScanMerge).
  const scanLock = useRef(Promise.resolve());
  // Mirror of the pending item, kept in a ref so a racing dual-symbology follow-up
  // sees the row the previous scan just filed (state lags a render behind).
  const pendingItemRef = useRef(null);

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

  // Begin scanning at the chosen location. The put-away / audited location is
  // changed from the scanner's pill as the tech moves; every scan files there.
  const start = useCallback((loc) => {
    setCurrentLocationId(loc?.id || null);
    setItems([]);
    setPendingItem(null);
    pendingItemRef.current = null;
    setOcr(null);
    setPhase("scanning");
  }, []);

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

    // Serialize so a dual-symbology follow-up scan sees the row the first filed and
    // merges onto it rather than racing ahead and duplicating it.
    const prev = scanLock.current;
    let unlock;
    scanLock.current = new Promise((r) => { unlock = r; });
    try {
      await prev;
      const pending = pendingItemRef.current;
      // The camera re-fires a barcode that flickers out of and back into frame
      // (glare on a foil label, focus hunting). It's already in the drawer — don't
      // re-file it (churns the list) or re-chime. OCR keeps reading the held label.
      if (pending && code === pending.barcode) return;

      setOcr(null);
      const { product, scanned, gtin } = await scanLookup(code);
      const payload = scanLinePayload(code, product, scanned);

      // One package, two symbologies: a 1D barcode (GTIN only) and a 2D GS1 code
      // (GTIN + lot + expiry) read a beat apart resolve to the same item — by GTIN
      // even when it isn't in the catalog. Rather than file a duplicate evidence
      // row, fold the richer read's lot/expiry onto the row still pending — or drop
      // the read when it adds nothing (a bare GTIN arriving after the GS1 read).
      // gtin rides on the in-memory item only (not persisted); it's all the merge
      // needs in the held-item window. See planScanMerge.
      const plan = planScanMerge(pending, { ...payload, gtin });
      if (plan.merge) {
        if (plan.patch) {
          const { item } = await traceApi.updateItem(pending.id, plan.patch);
          // Keep the in-memory render data (thumbnail, offer, gtin, the received/
          // confirmed action) the patched row doesn't carry back.
          const merged = { ...pending, ...item, gtin: pending.gtin, _offer: pending._offer, image_url: pending.image_url, inventory_action: pending.inventory_action };
          pendingItemRef.current = merged; // mirror now so a racing follow-up sees it
          setItems((p) => [merged, ...p.filter((i) => i.id !== merged.id)]);
          setPendingItem(merged);
        }
        playMatchChime();
        return;
      }

      // No record type to choose: a scan files the lot at the location as evidence.
      // capture_type records how the lot first entered (a receive); the per-scan
      // received-vs-confirmed distinction comes from the outcome below.
      const body = { location_id: currentLocationId, capture_type: "receiving", ...payload };
      const { item, outcome } = await traceApi.createScan(body);
      // outcome ("added" | "merged" | "unmatched") → inventory_action: a fresh lot
      // at this location is a receive; an existing lot re-scanned is a confirm.
      const inventory_action = outcome === "merged" ? "confirmed" : "received";
      const decorated = { ...decorateItem(item, product), inventory_action, gtin };
      // Mirror into the ref immediately, ahead of the render that sets it, so a
      // dual-symbology follow-up scan merges onto this row instead of duplicating.
      pendingItemRef.current = decorated;
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

      // OCR fallback off the frozen frame, on-device. Two cases:
      //   • the barcode matched but carried no lot/expiry → read those (the common
      //     case, e.g. a bare UPC or HIBC primary code).
      //   • the barcode matched nothing → read the product IDENTITY too, to suggest
      //     a match: the printed catalog/REF number (looked up exactly) or a fuzzy
      //     query for possible substitutes. Lot/expiry come off the same read.
      const needLot = !body.lot_number;
      const needExp = !body.expiration_date;
      if (frame && product && (needLot || needExp)) {
        setOcr({ itemId: item.id, busy: true, needLot, needExp });
        try {
          const { ocrLotExpiry } = await import("./ocrLabel");
          // Pass the scanned code so OCR never mistakes its printed digits for a lot.
          const res = await ocrLotExpiry(frame, { barcode: code });
          setOcr({
            itemId: item.id,
            busy: false,
            needLot,
            needExp,
            lot: needLot ? res.lot || null : null,
            expiry: needExp ? res.expiry || null : null,
          });
        } catch {
          setOcr(null);
        }
      } else if (frame && !product) {
        setOcr({ itemId: item.id, busy: true, needLot, needExp });
        try {
          const { ocrIdentity, parseLotExpiry } = await import("./ocrLabel");
          const id = await ocrIdentity(frame, { barcode: code });
          const le = parseLotExpiry(id.raw, { barcode: code }); // same read, no 2nd pass
          const found = await lookupByOcrIdentity({ refs: id.refs, query: id.query });
          setOcr({
            itemId: item.id,
            busy: false,
            needLot,
            needExp,
            lot: needLot ? le.lot || null : null,
            expiry: needExp ? le.expiry || null : null,
            // A possible identity from the label text — surfaced for the user to
            // confirm, never auto-linked. `match` is an exact REF hit; `suggestions`
            // are fuzzy substitutes.
            match: found.product || null,
            via: found.via,
            suggestions: found.suggestions || [],
          });
        } catch {
          setOcr(null);
        }
      }
    } catch {
      onToast?.("Scan failed — try again.");
    } finally {
      unlock();
    }
  }, [active, currentLocationId, isMobile, onToast]);

  // Add an item the buyer picked from search (no barcode).
  const addProduct = useCallback(async (product) => {
    if (!active || !currentLocationId) return;
    try {
      const body = { location_id: currentLocationId, capture_type: "receiving", ...scanLinePayload(null, product, null) };
      const { item, outcome } = await traceApi.createScan(body);
      const inventory_action = outcome === "merged" ? "confirmed" : "received";
      const decorated = { ...decorateItem(item, product), inventory_action };
      pendingItemRef.current = decorated;
      setItems((prev) => [decorated, ...prev.filter((i) => i.id !== decorated.id)]);
      setPendingItem(decorated);
    } catch {
      onToast?.("Couldn't add that item.");
    }
  }, [active, currentLocationId, onToast]);

  // Link a product the user picked from an OCR suggestion onto an unmatched
  // evidence row — the confirm step for an OCR identity. Patches the catalog ids +
  // name/image (same shape as scanLinePayload's id mapping) and clears the
  // now-resolved suggestion.
  const linkProduct = useCallback(async (id, product) => {
    const best = product?.best_offer || product?.offers?.[0] || null;
    const pid = product?.id || "";
    const patch = {
      canonical_product_id: pid.startsWith("mcp") ? pid : null,
      supplier_product_id: best?.supplier_product_id || (pid.startsWith("msp") ? pid : null),
      name: product?.name || null,
      image_url: product?.image_url || best?.image_url || "",
    };
    try {
      const { item } = await traceApi.updateItem(id, patch);
      const merged = { ...decorateItem(item, product), inventory_action: "received" };
      pendingItemRef.current = merged;
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...merged } : i)));
      setPendingItem((p) => (p && p.id === id ? { ...p, ...merged } : p));
      setOcr(null);
      playMatchChime();
    } catch {
      onToast?.("Couldn't link that product.");
    }
  }, [onToast]);

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
          ocrBusy={Boolean(ocrMatch?.busy)}
          ocrSuggestion={ocrMatch && !ocrMatch.busy ? { lot: ocrMatch.lot, expiry: ocrMatch.expiry, needLot: ocrMatch.needLot, needExp: ocrMatch.needExp, match: ocrMatch.match, via: ocrMatch.via, suggestions: ocrMatch.suggestions } : null}
          onScan={handleScan}
          onAddProduct={addProduct}
          onLinkProduct={linkProduct}
          onPatchItem={patchItem}
          onClearPending={() => { setPendingItem(null); pendingItemRef.current = null; }}
          onBack={() => (startLocationId ? onNavigate?.("/app/locations") : setPhase("start"))}
          locations={locations}
          onSwitchLocation={(loc) => { setCurrentLocationId(loc.id); pendingItemRef.current = null; }}
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
        account={account}
        onSignOut={onSignOut}
      />
    );
  }

  // ── Desktop ─────────────────────────────────────────────────────────
  if (active) {
    return (
      <DesktopScanner
        location={location}
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
      onStart={start}
      onNavigate={onNavigate}
    />
  );
}

// ── Desktop: choose a location ────────────────────────────────────────

function DesktopStart({ loading, locations, onStart, onNavigate }) {
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
              <button key={loc.id} type="button" className={s.pickRow} onClick={() => onStart(loc)}>
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

function DesktopScanner({ location, items, manual, setManual, onSubmitManual, onBack, onNavigate }) {
  const handoffUrl = typeof window !== "undefined" && location
    ? `${window.location.origin}/app/scan-session?location=${encodeURIComponent(location.id)}`
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
            {item.expiration_date && <span>· Exp {formatExpiryDate(item.expiration_date)}</span>}
          </div>
        </div>
        <span className={`${s.linePill} ${matched ? s.txGreen : s.txRed}`}>
          <Icon name={matched ? "icon-check-circle" : "icon-alert-triangle"} /> {matched ? "Exact match" : "Needs review"}
        </span>
      </div>
    </div>
  );
}
