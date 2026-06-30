"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { SearchResults } from "./catalog";
import { Icon } from "./icons";
import { CRL_SAMPLE_SOURCES, CRL_SOURCE_ICON, CRL_STATUS, SWIPE_REVEAL, collapseOffersBySupplier, compactSizeLabel, computePlanTotals, deriveMatchRows, estimateArrival, formatArrivalShort, formatPackLabel, isOrderable, isPlanIncluded, mapSearchOffer, matchReviewSample, matchReviewSampleStats, matchReviewSampleSummary, money, mrComputeStats, mrConfTone, mrEa, mrMoney, mrPriceLabel, normSupplierName, offerCandidates, offerKey, offerSub, optimizeLandedAssignment, pathForView, rowMode, showPerEa, stripPackFromName, supplierLogoSrc, variantAxisLabel, variantOptionList } from "./lib";
import { BuyingPreferencesCard, CandidateName, CandidateStock, ConfirmModal, DetailDrawer, ListStatusPill, MatchManufacturer, MobileHeader, ProductCard, ProductSearchResults, ProductThumb, ScanHandoffQr, useBarcodeScanner, useProductSearch } from "./ui";

export function DesktopBarcodeScan({ onScan, scanResult, onNavigate }) {
  const [captured, setCaptured] = useState(false);
  const flashTimer = useRef();
  const { videoRef, cameraStatus, autoDetect, capture, retry } = useBarcodeScanner({
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
                : "Tap Try again to allow the camera, or use Upload or CSV import instead."}
            </p>
            {cameraStatus !== "requesting" && (
              <button type="button" className="camera-retry-btn" onClick={retry}>
                <Icon name="icon-refresh" className="button-icon" />
                Try again
              </button>
            )}
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
      <DesktopScanTray result={scanResult} onNavigate={onNavigate} />
    </div>
  );
}

// The result tray beside the desktop camera: reflects the item the buyer just
// scanned (added to the list automatically by addScannedItem). Empty until the
// first scan, then shows the match — or a "no match"/"already added" state.
function DesktopScanTray({ result, onNavigate }) {
  if (!result) {
    return (
      <aside className="desktop-scan-result desktop-scan-result--idle">
        <div className="desktop-scan-idle">
          <Icon name="icon-scan" className="button-icon" />
          <strong>No item scanned yet</strong>
          <p>Point a barcode at the camera. Each match is added to your reorder list automatically.</p>
        </div>
      </aside>
    );
  }

  const { item, status, isDuplicate } = result;
  const notFound = status === "Not found";
  const offer = item.bestOffer;
  const rawPrice = offer?.price ?? (item.oldUnitPrice || null);
  const priceMissing = rawPrice == null || rawPrice <= 0;
  const supplier = offer?.supplier || item.oldVendor || item.matchBrand || "";
  const supplierLogo = supplierLogoSrc(supplier);

  if (notFound) {
    return (
      <aside className="desktop-scan-result desktop-scan-result--nomatch">
        <div className="desktop-scan-result-head">
          <span className="desktop-scan-check nomatch"><Icon name="icon-x-circle" className="button-icon" /></span>
          <div><strong>No catalog match</strong><small>We couldn&rsquo;t find this item in the catalog.</small></div>
        </div>
        <div className="desktop-scan-product">
          <div className="desktop-scan-thumb"><Icon name="icon-x" className="button-icon" /></div>
          <div>
            <strong>{item.barcode ? `Code ${item.barcode}` : "No code read"}</strong>
            <span>Nothing was added — search the catalog to add the right product.</span>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`desktop-scan-result ${isDuplicate ? "desktop-scan-result--duplicate" : ""}`}>
      <div className="desktop-scan-result-head">
        <span className="desktop-scan-check"><Icon name="icon-check-circle" className="button-icon" /></span>
        <div>
          <strong>{isDuplicate ? "Already on your list" : "Added to your list"}</strong>
          <small>{isDuplicate ? "Adjust the quantity on your reorder list." : "Matched to your catalog and added."}</small>
        </div>
      </div>
      <div className="desktop-scan-product">
        <div className="desktop-scan-thumb">
          {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <Icon name="icon-image" className="button-icon" />}
        </div>
        <div>
          <strong>{item.product}</strong>
          {item.sku && <span>{[item.unit ? `${item.unit}` : "", item.sku].filter(Boolean).join(" · ")}</span>}
          {supplier && (
            <span className="desktop-scan-supplier">
              {supplierLogo && <img src={supplierLogo} alt="" />}
              {supplier.toLowerCase().includes("schein") ? "Henry Schein" : supplier}
            </span>
          )}
        </div>
      </div>
      <dl className="desktop-scan-meta">
        <div><dt>UOM</dt><dd>{item.unit || "ea"}</dd></div>
        <div><dt>Unit price</dt><dd>{priceMissing ? "Not listed" : mrMoney(rawPrice)}</dd></div>
        {!priceMissing && offer?.perUnit != null && (
          <div><dt>Per each</dt><dd>${mrEa(offer.perUnit)} / ea</dd></div>
        )}
      </dl>
      {item.canonicalHandle && onNavigate && (
        <button className="secondary-action" type="button" onClick={() => onNavigate(`/app/catalog/${item.canonicalHandle}`)}>
          <Icon name="icon-search" className="button-icon" />View item details
        </button>
      )}
    </aside>
  );
}

// Scan workspace as a modal. Desktop default: a QR code that hands scanning off
// to the buyer's phone — they point a phone camera at it to open /app/scan and
// scan there; items sync back to this list (server-side, last-write-wins), so
// we poll while it's open to surface them live. A "use this computer's camera"
// fallback keeps the old webcam scanner one tap away.
export function ScanModal({ onScan, scanResult, scanCount = 0, itemCount = 0, onNavigate, onRefresh, onClose }) {
  const [mode, setMode] = useState("qr"); // "qr" = phone handoff | "camera" = desktop webcam
  const baselineRef = useRef(itemCount);
  const scanUrl = typeof window !== "undefined" ? `${window.location.origin}/app/scan` : "";
  // Items that have landed on the list since the QR was opened — these arrive
  // from the paired phone session, pulled in by the poll below.
  const phoneAdds = Math.max(0, itemCount - baselineRef.current);

  // While the handoff QR is shown, pull the practice's server list on an
  // interval so items scanned on the phone (a separate, last-write-wins synced
  // session) appear on this screen without a manual refresh.
  useEffect(() => {
    if (mode !== "qr" || !onRefresh) return;
    const id = window.setInterval(() => { onRefresh(); }, 3000);
    return () => window.clearInterval(id);
  }, [mode, onRefresh]);

  return (
    <div className="crl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="scanModalTitle" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`crl-modal ${mode === "camera" ? "crl-modal--scan" : "crl-modal--scanqr"}`}>
        <header className="crl-modal-head">
          <div>
            <h3 id="scanModalTitle">{mode === "camera" ? "Scan barcode" : "Scan with your phone"}</h3>
            <p>
              {mode === "camera"
                ? "Point an item barcode at your camera. Each match is added to your reorder list automatically."
                : "Point your phone’s camera at the code to open the scanner. Items you scan are added to this list automatically."}
            </p>
          </div>
          <button className="crl-modal-close" type="button" aria-label="Close" onClick={onClose}><Icon name="icon-x" className="button-icon" /></button>
        </header>

        {mode === "qr" ? (
          <div className="crl-modal-body scan-qr">
            <div className="scan-qr-code">
              <ScanHandoffQr url={scanUrl} />
            </div>
            <div className="scan-qr-side">
              <ol className="scan-qr-steps">
                <li><span>1</span> Open your phone&rsquo;s camera and point it at the code.</li>
                <li><span>2</span> Tap the link it shows &mdash; sign in on your phone if asked.</li>
                <li><span>3</span> Scan each item&rsquo;s barcode; matches land on this list automatically.</li>
              </ol>
              <div className={`scan-qr-status ${phoneAdds > 0 ? "active" : ""}`}>
                <span className="scan-qr-dot" aria-hidden="true" />
                {phoneAdds > 0
                  ? `${phoneAdds} item${phoneAdds === 1 ? "" : "s"} added from your phone`
                  : "Waiting for scans from your phone…"}
              </div>
              <button type="button" className="scan-qr-camera-link" onClick={() => setMode("camera")}>
                <Icon name="icon-scan" className="button-icon" />
                Use this computer&rsquo;s camera instead
              </button>
            </div>
          </div>
        ) : (
          <div className="crl-modal-body crl-modal-body--scan">
            <DesktopBarcodeScan onScan={onScan} scanResult={scanResult} onNavigate={onNavigate} />
          </div>
        )}

        <footer className="crl-modal-foot">
          {mode === "camera" ? (
            <button type="button" className="scan-qr-back" onClick={() => setMode("qr")}>
              <Icon name="icon-chevron-left" className="button-icon" />Scan with phone
            </button>
          ) : null}
          <span className="crl-scan-count">
            {mode === "camera"
              ? (scanCount > 0 ? `${scanCount} item${scanCount === 1 ? "" : "s"} scanned` : "No items scanned yet")
              : (phoneAdds > 0 ? `${phoneAdds} item${phoneAdds === 1 ? "" : "s"} added` : "Items appear here as you scan")}
          </span>
          <button className="primary-action compact" type="button" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}


// Status pills. "Matched" is our auto match; "Needs review" flags a
// low-confidence match (informational — there's no user "verify" step).

function offerBestPriceValue(candidate) {
  if (!candidate || !isOrderable(candidate)) return Infinity;
  if (candidate.price != null && candidate.price > 0) return candidate.price;
  if (candidate.perEa != null && candidate.perEa > 0) return candidate.perEa;
  return Infinity;
}

function bestOrderableOfferIndex(candidates) {
  let bestIndex = -1;
  let bestValue = Infinity;
  candidates.forEach((candidate, index) => {
    const value = offerBestPriceValue(candidate);
    if (value < bestValue) {
      bestValue = value;
      bestIndex = index;
    }
  });
  if (bestIndex >= 0) return bestIndex;
  return candidates.findIndex((candidate) => isOrderable(candidate));
}

// Per-candidate delivery estimate (from the supplier's published ship-time
// policy, refined to the buyer's state) plus the index of the single soonest
// orderable offer. "Fastest" only means something as a comparison, so we badge
// it only when ≥2 orderable offers carry an estimate AND one is strictly sooner
// than the rest — never a lone known-fast supplier against unknowns, and never a
// tie. Returns { byIndex: (estimate|null)[], fastestIndex }.
function deliveryEstimates(candidates, shippingByName, shipToState) {
  const byIndex = (candidates || []).map((candidate) =>
    isOrderable(candidate)
      ? estimateArrival(shippingByName?.[normSupplierName(candidate.supplier)] || null, shipToState, { available: true })
      : null
  );
  const ranked = [];
  byIndex.forEach((est, index) => {
    if (est && est.status === "ok") {
      ranked.push({ index, by: est.arriveMax.getTime(), tie: est.arriveMin.getTime() });
    }
  });
  ranked.sort((a, b) => a.by - b.by || a.tie - b.tie);
  let fastestIndex = -1;
  if (ranked.length >= 2) {
    const [first, second] = ranked;
    if (first.by < second.by || first.tie < second.tie) fastestIndex = first.index;
  }
  return { byIndex, fastestIndex };
}

function BestPriceStock({ candidate }) {
  if (candidate?.availability !== "limited" && candidate?.liveAvailable === true) {
    return <span className="crl-cand-stock stock-good">In stock</span>;
  }
  return <CandidateStock availability={candidate?.availability} liveAvailable={candidate?.liveAvailable} />;
}

// Compact delivery line for an offer row ("Arrives ~1–2 days"). Null estimate
// (supplier publishes no usable promise) renders nothing.
function CandidateEta({ est }) {
  const label = formatArrivalShort(est);
  if (!label) return null;
  return (
    <span className="crl-cand-eta" title="Estimated delivery — published transit time refined to your state, business days, excludes holidays">
      <Icon name="icon-truck" className="button-icon" />Arrives {label}
    </span>
  );
}

export function MatchPanel({ row, mode, wide, onToggleWide, onClose, onToast, onConfirmMatch, onLinkProduct, onRemoveItem, onNavigate, supplierShipping = {}, shipToState = "" }) {
  const isResolve = mode === "resolve";
  const isView = mode === "view";

  // A matched product may belong to a size/spec variant family (e.g. glove
  // sizes). Fetch the family so the drawer can offer a variant selector;
  // switching a variant swaps to a different canonical product — its own
  // suppliers and offers — previewed locally until the buyer confirms.
  const [variants, setVariants] = useState(null);
  const [family, setFamily] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  // Chosen pack quantity when the active product's offers span packs (null =
  // default to the pack of the best per-unit offer).
  const [packQty, setPackQty] = useState(null);
  // Selected supplier offer, tracked by key so the choice survives (or cleanly
  // falls back) when the candidate set changes under a variant/pack switch.
  const [selectedKey, setSelectedKey] = useState(row.selectedOfferKey || null);

  useEffect(() => {
    if (isResolve || !row.canonicalHandle) { setVariants(null); setFamily(null); return undefined; }
    let live = true;
    fetch(`/api/canonical-products?handle=${encodeURIComponent(row.canonicalHandle)}`)
      .then((response) => response.json())
      .then(({ canonical_products: list, family: familyInfo }) => {
        if (!live) return;
        const vs = list || [];
        if (vs.length <= 1) { setVariants(null); setFamily(null); return; }
        const idx = Math.max(0, vs.findIndex((v) => (v.handle || "").toLowerCase() === (row.canonicalHandle || "").toLowerCase()));
        setVariants(vs);
        setFamily(familyInfo || null);
        setActiveIdx(idx);
        setPackQty(null);
      })
      .catch(() => { if (live) { setVariants(null); setFamily(null); } });
    return () => { live = false; };
  }, [row.canonicalHandle, isResolve]);

  // The product whose offers drive the candidate list: the chosen variant when a
  // family loaded, otherwise the row itself.
  const activeVariant = variants ? variants[activeIdx] : null;
  const variantOffers = activeVariant
    ? (activeVariant.offers || []).map(mapSearchOffer).map((offer) => ({ ...offer, key: offerKey(offer), sub: offerSub(offer) }))
    : null;
  const offerRow = variantOffers
    ? { ...row, offers: variantOffers, recommendedOfferKey: variantOffers[0]?.key ?? null, selectedOfferKey: null, matchName: activeVariant.name }
    : row;
  const variantGroupLabel = variants ? (family?.variant_axis_label || variantAxisLabel(variants)) : null;
  // Collapse cosmetic duplicate variants and drop redundant pack suffixes so
  // each differentiator (gauge/shade/size) shows once. See variantOptionList.
  const variantOptions = variants ? variantOptionList(variants) : [];
  // Short size tokens (XS/S/M/L/XL…) are meant to be compact — lay them out in a
  // single row instead of wrapping, which defeats the purpose of abbreviating.
  const variantsAreCompact =
    variantOptions.length > 1 &&
    variantOptions.every((option) => compactSizeLabel(option.label).length <= 4);
  const activeVariantLabel =
    variantOptions.find((option) => option.indices.includes(activeIdx))?.label ||
    activeVariant?.variant_label ||
    `Option ${activeIdx + 1}`;

  // Pack options come from the active product's full offer set; scoping to a pack
  // and then collapsing per supplier means the supplier list reflects who sells
  // that pack — so changing the pack (or variant) changes the suppliers shown.
  const rawCandidates = isResolve ? [] : offerCandidates(offerRow);
  const packValues = [...new Set(rawCandidates.map((candidate) => candidate.packQty).filter((q) => q != null))].sort((a, b) => a - b);
  const hasPackChoice = packValues.length > 1;
  const defaultPack = (() => {
    // Land on the buyer's saved offer's pack so an existing selection stays
    // visible; otherwise the pack of the cheapest per-unit offer.
    const saved = row.selectedOfferKey ? rawCandidates.find((candidate) => candidate.key === row.selectedOfferKey) : null;
    if (saved?.packQty != null) return saved.packQty;
    const priced = rawCandidates.filter((candidate) => candidate.packQty != null && isOrderable(candidate) && candidate.perEa != null);
    if (priced.length) return priced.reduce((a, b) => (b.perEa < a.perEa ? b : a)).packQty;
    return packValues[0] ?? null;
  })();
  const activePack = hasPackChoice ? (packQty ?? defaultPack) : null;
  const packOptions = packValues.map((q) => ({ qty: q, label: rawCandidates.find((candidate) => candidate.packQty === q)?.packLabel || `${q}/pack` }));
  const activePackLabel = packOptions.find((option) => option.qty === activePack)?.label || "";

  const scoped = activePack != null ? rawCandidates.filter((candidate) => candidate.packQty === activePack) : rawCandidates;
  const candidates = collapseOffersBySupplier(scoped, selectedKey);
  // Land on the buyer's saved choice when it's still in the set, else the lowest
  // priced orderable offer, else the recommendation.
  const bestPriceIndex = bestOrderableOfferIndex(candidates);
  // Delivery estimate per offer + the single soonest one (the "Fastest" badge),
  // mirroring the per-supplier ETA already shown on the Review plan.
  const { byIndex: arrivalByIndex, fastestIndex } = deliveryEstimates(candidates, supplierShipping, shipToState);
  const keyedIndex = selectedKey ? candidates.findIndex((candidate) => candidate.key === selectedKey) : -1;
  const recommendedIndex = candidates.findIndex((candidate) => candidate.recommended);
  const selected = keyedIndex >= 0 ? keyedIndex : bestPriceIndex >= 0 ? bestPriceIndex : Math.max(0, recommendedIndex);

  function selectVariant(index) {
    setActiveIdx(index);
    setPackQty(null);
    setSelectedKey(null);
  }
  function selectPack(qtyValue) {
    setPackQty(qtyValue);
    setSelectedKey(null);
  }

  const [qty] = useState(row.qty || 1);
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
  // "Buy bigger, pay less per unit": among the active product's larger packs,
  // find one whose best per-each beats the selected offer by a meaningful margin.
  // Acting on it just moves the pack selector — never auto-applied.
  const biggerPackDeal = (() => {
    if (!hasPackChoice || !sel || sel.perEa == null || activePack == null) return null;
    const packBestPerEa = (q) => {
      const xs = rawCandidates.filter((candidate) => candidate.packQty === q && isOrderable(candidate) && candidate.perEa != null);
      return xs.length ? Math.min(...xs.map((candidate) => candidate.perEa)) : null;
    };
    let best = null;
    for (const q of packValues) {
      if (q <= activePack) continue;
      const perEa = packBestPerEa(q);
      if (perEa == null || perEa >= sel.perEa) continue;
      if (!best || perEa < best.perEa) best = { packQty: q, perEa, packLabel: packOptions.find((option) => option.qty === q)?.label || "" };
    }
    if (!best) return null;
    const pct = (sel.perEa - best.perEa) / sel.perEa;
    return pct >= 0.1 ? { ...best, pct } : null;
  })();

  // Live savings preview from the entered price vs. the selected offer.
  const selPriceRaw = candidates[selected]?.price ?? row.price ?? null;
  const selPrice = selPriceRaw != null && selPriceRaw > 0 ? selPriceRaw : null;
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
      const chosenKey = candidates[selected]?.key ?? null;
      // A different variant is a different canonical product, so re-link the item
      // to it (carrying the chosen supplier offer); same variant just updates the
      // offer selection in place.
      const switchedVariant = activeVariant && (activeVariant.handle || "").toLowerCase() !== (row.canonicalHandle || "").toLowerCase();
      if (switchedVariant) {
        onLinkProduct?.(row.itemId, activeVariant, { qty, note: notes, paidUnitPrice: paid, selectedOfferKey: chosenKey });
      } else {
        onConfirmMatch?.(row.itemId, { selectedOfferKey: chosenKey, qty, note: notes, paidUnitPrice: paid });
      }
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

  return (
    <DetailDrawer
      label={title}
      lead={<span className="crl-drawer-shield"><Icon name="icon-shield-check" className="button-icon" /></span>}
      title={title}
      subtitle={subtitle}
      wide={wide}
      onToggleWide={onToggleWide}
      onClose={onClose}
      footer={(
        <>
          <button className="crl-ghost-btn" type="button" onClick={onClose}>{isView ? "Close" : "Cancel"}</button>
          {!searching && (
            <button className="primary-action compact" type="button" onClick={confirm}>{isView ? "Update Match" : "Confirm Selected Match"}</button>
          )}
        </>
      )}
    >
        <section className="crl-drawer-section">
          <div className="crl-drawer-section-head">
            <span className="crl-drawer-label">Imported item</span>
            <span className="crl-drawer-badge">{sourceLabel}</span>
          </div>
          <div className="crl-imported">
            <ProductThumb image={row.image} alt={row.canonicalName || row.matchName || row.importedName} />
            <div className="crl-imported-info">
              {row.canonicalHandle ? (
                <button type="button" className="crl-imported-link" onClick={() => onNavigate?.(`/app/product/${row.canonicalHandle}`)} title="View this product in the catalog">
                  {stripPackFromName(row.canonicalName || row.matchName || row.importedName)}
                  <Icon name="icon-arrow-right" className="button-icon" />
                </button>
              ) : (
                <strong>{stripPackFromName(row.canonicalName || row.matchName || row.importedName)}</strong>
              )}
              {(row.canonicalName || row.matchName) && <small>Imported as: {row.importedName}</small>}
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
            {variantOptions.length > 1 && (
              <div className="pdp-variants crl-drawer-variants" role="group" aria-label={`Choose ${variantGroupLabel}`}>
                <span className="pdp-variants-label">{variantGroupLabel}: <strong>{activeVariantLabel}</strong></span>
                <div className={`pdp-variant-options ${variantsAreCompact ? "pdp-variant-options--inline" : ""}`}>
                  {variantOptions.map((option) => {
                    const active = option.indices.includes(activeIdx);
                    return (
                      <button key={option.label} type="button" className={`pdp-variant ${active ? "active" : ""}`} aria-pressed={active} onClick={() => selectVariant(option.indices[0])}>
                        {compactSizeLabel(option.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {hasPackChoice && (
              <div className="pdp-pack crl-drawer-pack" role="group" aria-label="Choose packaging">
                <span className="pdp-pack-label">Packaging: <strong>{activePackLabel}</strong></span>
                <div className="pdp-pack-options">
                  {packOptions.map((option) => (
                    <button key={option.qty} type="button" className={`pdp-pack-option ${option.qty === activePack ? "active" : ""}`} aria-pressed={option.qty === activePack} onClick={() => selectPack(option.qty)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {biggerPackDeal && (
              <button type="button" className="crl-packdeal" onClick={() => selectPack(biggerPackDeal.packQty)}>
                <Icon name="icon-tag" className="button-icon" />
                <span className="crl-packdeal-text">
                  <strong>Buy bigger, save {Math.round(biggerPackDeal.pct * 100)}% per unit</strong>
                  <small>{biggerPackDeal.packLabel || "Larger pack"} at ${mrEa(biggerPackDeal.perEa)}/ea vs ${mrEa(sel.perEa)}/ea — if you use the volume.</small>
                </span>
                <span className="crl-packdeal-switch">Switch</span>
              </button>
            )}
            <div className="crl-cand-list">
              {bestPriceIndex >= 0 && (() => {
                const candidate = candidates[bestPriceIndex];
                const oos = !isOrderable(candidate);
                return (
                  <label key={`best-${candidate.key ?? bestPriceIndex}`} className={`crl-cand crl-cand-hero ${selected === bestPriceIndex ? "active" : ""} ${oos ? "oos" : ""}`} aria-disabled={oos}>
                    <input type="radio" name="crl-cand" checked={selected === bestPriceIndex} disabled={oos} onChange={() => setSelectedKey(candidate.key ?? null)} />
                    <ProductThumb image={candidate.image} alt={candidate.name} />
                    <span className="crl-cand-info">
                      <span className="crl-cand-hero-kicker">Best price</span>
                      <CandidateName supplier={candidate.supplier} name={candidate.name} canonicalName={row.canonicalName} productUrl={candidate.productUrl} />
                      {candidate.packLabel && <small>{candidate.packLabel}</small>}
                      <BestPriceStock candidate={candidate} />
                      <CandidateEta est={arrivalByIndex[bestPriceIndex]} />
                    </span>
                    <span className="crl-cand-right">
                      <strong>{mrPriceLabel(candidate.price)}</strong>
                      {showPerEa(candidate.perEa, candidate.price) && <span className="crl-cand-per">${mrEa(candidate.perEa)} / ea</span>}
                      <span className="crl-cand-tags">
                        {bestPriceIndex === fastestIndex && <span className="crl-cand-fast"><Icon name="icon-truck" className="button-icon" />Fastest</span>}
                        {candidate.recommended && <span className="crl-cand-rec">Recommended</span>}
                        {selected === bestPriceIndex && !candidate.recommended && <span className="crl-cand-sel">Selected</span>}
                      </span>
                    </span>
                  </label>
                );
              })()}
              {candidates.map((candidate, index) => {
                if (index === bestPriceIndex) return null;
                const oos = !isOrderable(candidate);
                return (
                <label key={candidate.key ?? index} className={`crl-cand ${selected === index ? "active" : ""} ${oos ? "oos" : ""}`} aria-disabled={oos}>
                  <input type="radio" name="crl-cand" checked={selected === index} disabled={oos} onChange={() => setSelectedKey(candidate.key ?? null)} />
                  <ProductThumb image={candidate.image} alt={candidate.name} />
                  <span className="crl-cand-info">
                    <CandidateName supplier={candidate.supplier} name={candidate.name} canonicalName={row.canonicalName} productUrl={candidate.productUrl} />
                    {candidate.packLabel && <small>{candidate.packLabel}</small>}
                    <CandidateStock availability={candidate.availability} liveAvailable={candidate.liveAvailable} />
                    <CandidateEta est={arrivalByIndex[index]} />
                  </span>
                  <span className="crl-cand-right">
                    <strong>{mrPriceLabel(candidate.price)}</strong>
                    {showPerEa(candidate.perEa, candidate.price) && <span className="crl-cand-per">${mrEa(candidate.perEa)} / ea</span>}
                    <span className="crl-cand-tags">
                      {index === fastestIndex && <span className="crl-cand-fast"><Icon name="icon-truck" className="button-icon" />Fastest</span>}
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
    </DetailDrawer>
  );
}


export function MobileReorderCard({ row, onOpen, onRemove }) {
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
  const sup = row.supplier && row.supplier !== "—" ? row.supplier : row.matchBrand;
  const supplierLine = sup ? (
    <small className="m-card-supplier">
      {supplierLogoSrc(sup) && <img className="m-card-supplier-logo" src={supplierLogoSrc(sup)} alt="" />}
      {sup.toLowerCase().includes("schein") ? "Henry Schein" : sup}
    </small>
  ) : null;
  const right = (
    <>
      {notFound
        ? <em className="m-conf nomatch">Not found</em>
        : <em className={`m-conf ${mrConfTone(row.confidence)}`}>{row.confidence}%</em>}
      {row.priceMissing
        ? <small className="m-card-noprice">Price not listed</small>
        : row.price != null && <strong>{mrMoney(row.price)}</strong>}
      {!row.priceMissing && showPerEa(row.perEa, row.price) && <small>${mrEa(row.perEa)} / ea</small>}
      {row.lineSavings > 0 && <small className="m-card-save">Save {mrMoney(row.lineSavings)}</small>}
    </>
  );
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
      <ProductCard
        thumb={row.image}
        title={row.matchName || row.importedName}
        meta={[row.importedSub, supplierLine]}
        right={right}
        onClick={handleClick}
        swipeProps={{ onTouchStart, onTouchMove, onTouchEnd }}
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? "none" : "transform .2s ease" }}
      />
    </div>
  );
}

// Mobile card list for the current reorder list (replaces the desktop table on
// phones). Stats band + status tabs + tappable product cards.

export function MobileReorderList({ title, rows, stats, totalItems, tab, onTab, onOpenRow, onToast, onArchiveList, onClearList, onRemoveItem, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="m-list">
      <MobileHeader
        onBack={() => onNavigate?.("/app")}
        actions={
          <>
            <button
              className="m-scan-btn"
              type="button"
              aria-label="Scan items"
              onClick={() => onNavigate?.("/app/scan")}
            >
              <Icon name="icon-scan" className="button-icon" />
              Scan
            </button>
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
                      <span><strong>Save list</strong><small>Save a copy to reorder history</small></span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onClearList?.(); }}>
                      <Icon name="icon-trash" className="button-icon crl-menu-danger" />
                      <span><strong>Clear list</strong><small>Remove all items</small></span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        }
      />
      <div className="m-list-titlebar"><h1>{title}</h1></div>

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
                <p>Tap Scan to add an item by barcode, or upload an invoice to start building your list.</p>
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
            <Icon name="icon-clipboard-check" className="button-icon" />Review
          </button>
        </div>
      )}
    </div>
  );
}

// Full-screen mobile detail page. Layout follows the mobile mockup; the footer
// actions mirror the desktop MatchPanel (Cancel / Confirm by mode).

export function MobileItemDetail({ rows, row, mode, onClose, onOpenRow, onToast, onConfirmMatch, onLinkProduct, onRemoveItem, onNavigate, supplierShipping = {}, shipToState = "" }) {
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
    packLabel: formatPackLabel(offer.packQty, offer.packBasis, offer.baseUnit, offer.packSize),
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
    // No purchasable offer (login-gated supplier, e.g. Henry Schein house
    // brands): name the matched supplier from the catalog brand rather than a
    // bare "—", so the buyer can see who carries it even with no listed price.
    const fallbackSupplier = row.supplier && row.supplier !== "—" ? row.supplier : row.matchBrand || row.supplier;
    candidates.push({ key: row.selectedOfferKey || null, name: row.matchName, supplier: fallbackSupplier, sub: row.matchSub, packLabel: row.packLabel, price: row.price, perEa: row.perEa, image: row.image, recommended: true, confidence: row.confidence, availability: row.availability, liveAvailable: row.liveAvailable, productUrl: row.productUrl || "" });
  }
  const bestPriceIndex = bestOrderableOfferIndex(candidates);
  const bestPriceHeroIndex = bestPriceIndex >= 0 ? bestPriceIndex : 0;
  // Delivery estimate per offer + the single soonest one (the "Fastest" badge).
  const { byIndex: arrivalByIndex, fastestIndex } = deliveryEstimates(candidates, supplierShipping, shipToState);
  const initialSel = candidates.findIndex((candidate) => candidate.key === row.selectedOfferKey);
  const [selected, setSelected] = useState(bestPriceIndex >= 0 ? bestPriceIndex : initialSel < 0 ? 0 : initialSel);
  const [notes, setNotes] = useState(row.note || "");
  const [paid, setPaid] = useState(row.paidUnitPrice != null ? String(row.paidUnitPrice) : "");
  const [searching, setSearching] = useState(isResolve);
  const search = useProductSearch(searching);
  const confLabel = row.confidence == null ? "No catalog match"
    : row.confidence >= 80 ? "High match confidence"
    : row.confidence >= 50 ? "Medium match confidence"
    : "Low match confidence";

  // Live savings from the entered price vs. the selected offer.
  const selPriceRaw = candidates[selected]?.price ?? row.price ?? null;
  const selPrice = selPriceRaw != null && selPriceRaw > 0 ? selPriceRaw : null;
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
          <strong className="m-detail-name">{stripPackFromName(row.canonicalName || row.matchName || row.importedName)}</strong>
          {(row.canonicalName || row.matchName) && <small>Imported as: {row.importedName}</small>}
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
              <span className="m-detail-label">Best price</span>
              <label className={`m-match best m-match-hero ${selected === bestPriceHeroIndex ? "active" : ""} ${!isOrderable(candidates[bestPriceHeroIndex]) ? "oos" : ""}`} aria-disabled={!isOrderable(candidates[bestPriceHeroIndex])}>
                <input type="radio" name="m-cand" checked={selected === bestPriceHeroIndex} disabled={!isOrderable(candidates[bestPriceHeroIndex])} onChange={() => setSelected(bestPriceHeroIndex)} />
                <ProductThumb image={candidates[bestPriceHeroIndex].image} alt={candidates[bestPriceHeroIndex].name} />
                <span className="m-match-info"><CandidateName supplier={candidates[bestPriceHeroIndex].supplier} name={candidates[bestPriceHeroIndex].name} canonicalName={row.canonicalName} productUrl={candidates[bestPriceHeroIndex].productUrl} />{candidates[bestPriceHeroIndex].packLabel && <small>{candidates[bestPriceHeroIndex].packLabel}</small>}<span className="m-match-signals"><BestPriceStock candidate={candidates[bestPriceHeroIndex]} />{bestPriceHeroIndex === fastestIndex && <span className="crl-cand-fast"><Icon name="icon-truck" className="button-icon" />Fastest</span>}</span><CandidateEta est={arrivalByIndex[bestPriceHeroIndex]} /></span>
                <span className="m-match-right"><strong>{mrPriceLabel(candidates[bestPriceHeroIndex].price)}</strong>{showPerEa(candidates[bestPriceHeroIndex].perEa, candidates[bestPriceHeroIndex].price) ? <small>${mrEa(candidates[bestPriceHeroIndex].perEa)} / ea</small> : (!(candidates[bestPriceHeroIndex].price > 0) && candidates[bestPriceHeroIndex].supplier && candidates[bestPriceHeroIndex].supplier !== "—" && <small>Login required</small>)}</span>
              </label>
            </section>
            {candidates.length > 1 && (
              <section className="m-detail-sec">
                <span className="m-detail-label">Other possible matches</span>
                {candidates.map((candidate, index) => {
                  if (index === bestPriceHeroIndex) return null;
                  const oos = !isOrderable(candidate);
                  return (
                  <label className={`m-match ${selected === index ? "active" : ""} ${oos ? "oos" : ""}`} aria-disabled={oos} key={candidate.key ?? index}>
                    <input type="radio" name="m-cand" checked={selected === index} disabled={oos} onChange={() => setSelected(index)} />
                    <span className="m-match-info"><CandidateName supplier={candidate.supplier} name={candidate.name} canonicalName={row.canonicalName} productUrl={candidate.productUrl} />{candidate.packLabel && <small>{candidate.packLabel}</small>}<span className="m-match-signals"><CandidateStock availability={candidate.availability} liveAvailable={candidate.liveAvailable} />{index === fastestIndex && <span className="crl-cand-fast"><Icon name="icon-truck" className="button-icon" />Fastest</span>}</span><CandidateEta est={arrivalByIndex[index]} /></span>
                    <span className="m-match-right"><em className={`m-conf ${mrConfTone(candidate.confidence)}`}>{candidate.confidence}%</em><strong>{mrPriceLabel(candidate.price)}</strong>{showPerEa(candidate.perEa, candidate.price) && <small>${mrEa(candidate.perEa)} / ea</small>}</span>
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


// The reorder-list table header. Shared by the flat Current Reorder List and the
// supplier-grouped Review view so both render identical columns.
export function ReorderTableHead({ select }) {
  return (
    <div className="crl-row crl-row-head">
      {select}
      <span className="crl-h-center">Source</span>
      <span>Item</span>
      <span className="crl-h-center">Qty</span>
      <span className="crl-h-center">Status</span>
      <span>Matched product</span>
      <span className="crl-price-h">Price <Icon name="icon-info" className="button-icon" /></span>
      <span aria-hidden="true" />
    </div>
  );
}

// One reorder-list table row. `onOpen(row, mode)` opens the product-match drawer.
// Extracted so the Review view can render the same rows grouped by supplier.
export function ReorderRow({ row, active, selected, onToggleSelect, onOpen, onConfirmMatch, onRemoveItem, onToast }) {
  const status = CRL_STATUS[row.status];
  const notFound = row.status === "Not found";
  const mode = notFound ? "resolve" : row.status === "Review" ? "review" : "view";
  return (
    <div className={`crl-row crl-row-click ${active ? "active" : ""} ${selected ? "crl-row-selected" : ""}`} onClick={() => onOpen(row, mode)}>
      {onToggleSelect && (
        <span className="crl-select-cell" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.itemId)}
            aria-label={`Select ${row.canonicalName || row.matchName || row.importedName}`}
          />
        </span>
      )}
      <span className="crl-source" title={`Imported from ${row.source.toUpperCase()}`}><Icon name={CRL_SOURCE_ICON[row.source] || "icon-file-text"} className="button-icon" /></span>
      <span className="crl-item">
        <ProductThumb image={row.image} alt={row.canonicalName || row.importedName} />
        <span className="crl-item-id">
          <strong>{stripPackFromName(row.canonicalName || row.importedName)}</strong>
          {row.canonicalName
            ? row.source !== "scan" && <small>From source: {row.importedName}</small>
            : <small>SKU on source: {(row.importedSub || "").replace(/^SKU:\s*/, "") || "—"}</small>}
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
            <strong>{stripPackFromName(row.matchName)}</strong>
            {row.matchSub && <small>{row.matchSub}</small>}
            <MatchManufacturer name={row.matchManufacturer} />
          </>
        )}
      </span>
      <span className="crl-price">
        {notFound ? <span className="crl-dash">—</span> : row.priceMissing ? (
          (() => {
            const sup = row.supplier && row.supplier !== "—" ? row.supplier : row.matchBrand;
            const supName = sup && sup.toLowerCase().includes("schein") ? "Henry Schein" : sup;
            return (
              <span className="crl-noprice">Price not listed
                <small className="crl-noprice-supplier">
                  {sup && supplierLogoSrc(sup) && <img className="crl-noprice-logo" src={supplierLogoSrc(sup)} alt="" />}
                  {supName ? `${supName} — login required` : "Login required"}
                </small>
              </span>
            );
          })()
        ) : (
          <>
            <strong>{mrMoney(row.price)}</strong>
            {showPerEa(row.perEa, row.price) && <small>${mrEa(row.perEa)} / ea</small>}
            {row.lineSavings > 0 && <small className="crl-save">Save {mrMoney(row.lineSavings)}</small>}
          </>
        )}
      </span>
      <span className="crl-actions">
        {row.itemId && (
          <button className="crl-row-delete" type="button" aria-label="Remove from list" title="Remove from list" onClick={(event) => { event.stopPropagation(); onRemoveItem?.(row.itemId); onToast?.("Item removed from list"); }}>
            <Icon name="icon-trash-ios" className="button-icon" />
          </button>
        )}
      </span>
    </div>
  );
}


export function CurrentReorderList({
  items,
  listName = "June Restock",
  listStatus = "draft",
  listStage = "draft",
  onAdvanceStage,
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
  scanResult,
  onClearScanResult,
  scanCount = 0,
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
  shipToState = "",
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const selectAllRef = useRef(null);
  const listNameRef = useRef(null);

  // Advance to Review & optimize. Unresolved items are surfaced (in red) at the
  // bottom of the Review page itself, so no interstitial warning here — go
  // straight in.
  function goToReview() {
    onAdvanceStage?.("review");
    onNavigate?.("/app/review");
  }

  function toggleItemSelection(itemId) {
    if (!itemId) return;
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }
  function confirmBulkDelete() {
    selectedItemIds.forEach((itemId) => onRemoveItem?.(itemId));
    const n = selectedItemIds.size;
    setSelectedItemIds(new Set());
    setConfirmingBulkDelete(false);
    onToast?.(`Removed ${n} item${n === 1 ? "" : "s"} from list`);
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

  // Row selection + bulk delete (desktop). Only real, removable items (with an
  // itemId and a remove handler) are selectable — the demo sample isn't.
  const selectable = usingReal && Boolean(onRemoveItem);
  const visibleSelectableIds = selectable ? filtered.filter((row) => row.itemId).map((row) => row.itemId) : [];
  const selectedVisibleCount = visibleSelectableIds.filter((id) => selectedItemIds.has(id)).length;
  const allVisibleSelected = visibleSelectableIds.length > 0 && selectedVisibleCount === visibleSelectableIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < visibleSelectableIds.length;
  function toggleVisibleSelection() {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleSelectableIds.forEach((id) => next.delete(id));
      else visibleSelectableIds.forEach((id) => next.add(id));
      return next;
    });
  }
  // Drop any selected ids that have left the list (deleted, filtered to another
  // status, etc.) so the count and select-all stay honest.
  useEffect(() => {
    const live = new Set(rows.map((row) => row.itemId).filter(Boolean));
    setSelectedItemIds((prev) => {
      let changed = false;
      const next = new Set();
      prev.forEach((id) => { if (live.has(id)) next.add(id); else changed = true; });
      return changed ? next : prev;
    });
  }, [rows]);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);


  if (isMobile) {
    return (
      <>
        <MobileReorderList
          title="Reorder List"
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
          onNavigate={onNavigate}
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
            supplierShipping={supplierShipping}
            shipToState={shipToState}
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
          <h2 id="homeHeading">Reorder List</h2>
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
          <button
            type="button"
            className="crl-plan-header-btn crl-plan-header-btn--primary"
            onClick={goToReview}
            disabled={totalItems === 0}
            title={totalItems === 0 ? "Add items to your list before you can review" : "Optimize supplier consolidation, shipping, and delivery for this list"}
          >
            <Icon name="icon-clipboard-check" className="button-icon" />
            Review
          </button>
          <div className="crl-add-menu-wrap">
            <button
              className="crl-more crl-more-icon"
              type="button"
              aria-label="List actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="List actions"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg className="crl-kebab-dots" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
            </button>
            {menuOpen && (
              <>
                <div className="crl-add-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="crl-add-menu m-actions-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onArchiveList?.(); }}>
                    <Icon name="icon-archive-down" className="button-icon" />
                    <span><strong>Save list</strong><small>Save a copy to reorder history</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onClearList?.(); }}>
                    <Icon name="icon-trash-ios" className="button-icon crl-menu-danger" />
                    <span><strong>Clear list</strong><small>Remove all items</small></span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {addMode === "search" && (
        <section className="crl-add">
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
              {selectable && selectedItemIds.size > 0 && (
                <div className="crl-bulk" aria-live="polite">
                  <span>{selectedItemIds.size} selected</span>
                  <button type="button" className="crl-bulk-clear" onClick={() => setSelectedItemIds(new Set())}>Clear</button>
                  <button type="button" className="crl-bulk-delete" onClick={() => setConfirmingBulkDelete(true)}>
                    <Icon name="icon-trash" className="button-icon" />Delete
                  </button>
                </div>
              )}
            </div>

            <div className={`crl-table ${selectable ? "crl-table--selectable" : ""}`}>
              <ReorderTableHead
                select={selectable ? (
                  <span className="crl-select-cell">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={visibleSelectableIds.length === 0}
                      onChange={toggleVisibleSelection}
                      aria-label={allVisibleSelected ? "Deselect all items" : "Select all items"}
                    />
                  </span>
                ) : null}
              />
              {isEmpty && (
                <div className="crl-empty">
                  <Icon name="icon-cloud-upload" className="button-icon" />
                  <strong>Your reorder list is empty</strong>
                  <p>Upload an invoice (PDF or CSV) or scan a barcode to start matching items to the best supplier.</p>
                </div>
              )}
              {filtered.map((row) => (
                <ReorderRow
                  key={row.id}
                  row={row}
                  active={detail?.row.id === row.id}
                  selected={selectable && Boolean(row.itemId) && selectedItemIds.has(row.itemId)}
                  onToggleSelect={selectable && row.itemId ? toggleItemSelection : undefined}
                  onOpen={(r, mode) => setDetail({ row: r, mode })}
                  onConfirmMatch={onConfirmMatch}
                  onRemoveItem={onRemoveItem}
                  onToast={onToast}
                />
              ))}
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
            supplierShipping={supplierShipping}
            shipToState={shipToState}
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
            <h3>Savings &amp; totals</h3>
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
            ) : showSample ? (
              <div className="crl-plan">
                <div><span>Estimated total</span><strong>{money.format(matchReviewSampleSummary.estimatedTotal)}</strong></div>
                <div><span>Suppliers</span><strong>{matchReviewSampleSummary.suppliers}</strong></div>
                <div><span>Coverage</span><strong>{matchReviewSampleSummary.coverage}%</strong></div>
                <div><span>Potential savings</span><strong className="green">{money.format(matchReviewSampleSummary.potentialSavings)}</strong></div>
              </div>
            ) : (
              <p className="crl-plan-note">
                Scan a barcode or upload an invoice to start your list — your supplier plan and savings show up here.
              </p>
            )}
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

      {addMode === "scan" && (
        <ScanModal
          onScan={onScan}
          scanResult={scanResult}
          scanCount={scanCount}
          itemCount={totalItems}
          onRefresh={onRefresh}
          onNavigate={onNavigate}
          onClose={() => { onAddMode(""); onClearScanResult?.(); }}
        />
      )}

      {confirmingBulkDelete && (
        <ConfirmModal
          title="Remove selected items?"
          body={`This removes ${selectedItemIds.size} selected item${selectedItemIds.size === 1 ? "" : "s"} from your reorder list.`}
          confirmLabel="Remove selected"
          destructive
          onConfirm={confirmBulkDelete}
          onClose={() => setConfirmingBulkDelete(false)}
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

// Savings surface. Aggregates the real per-line savings we already compute
// (paid "what you pay now" minus the cheapest pack-normalized option) across the
// live list and archived lists. No fabricated numbers: when nothing has a paid
// price yet, the page is an honest order-history-import onboarding instead.
export function SavingsView({ rows = [], archivedLists = [], onNavigate, onImportInvoice }) {
  const sumSavings = (list) => list.reduce((total, row) => total + (row.lineSavings || 0), 0);
  const listSavings = sumSavings(rows);
  const archiveSavings = archivedLists.reduce((total, entry) => total + sumSavings(entry.rows || []), 0);
  const lifetime = listSavings + archiveSavings;
  const priced = rows.filter((row) => row.hasPaidPrice);
  const opportunities = rows
    .filter((row) => row.lineSavings > 0 && row.paidUnitPrice != null)
    .sort((a, b) => b.lineSavings - a.lineSavings);
  const hasData = priced.length > 0 || archiveSavings > 0;
  const nameOf = (row) => row.canonicalName || row.matchName || row.importedName || "Item";

  return (
    <div className="sv">
      <header className="sv-head">
        <h1>Savings</h1>
        <p>How much your reorder list beats what you pay today — compared per unit, including the cheapest in-stock supplier. We never get between you and your vendor.</p>
      </header>

      {!hasData ? (
        <div className="sv-empty">
          <span className="sv-empty-icon"><Icon name="icon-dollar-circle" /></span>
          <h2>See what you&rsquo;re overpaying</h2>
          <p>Import a recent supplier invoice and we&rsquo;ll line every item up against the cheapest option per unit. No logins, no passwords — just the PDF or CSV.</p>
          <button type="button" className="sv-import" onClick={onImportInvoice}>
            <Icon name="icon-cloud-upload" className="button-icon" />
            Import an invoice
          </button>
          <p className="sv-fine">
            Or open any line on your{" "}
            <button type="button" className="sv-link" onClick={() => onNavigate?.(pathForView("home"))}>reorder list</button>{" "}
            and enter &ldquo;what you pay now.&rdquo;
          </p>
        </div>
      ) : (
        <>
          <div className="sv-metrics">
            <div className="sv-metric">
              <span className="sv-metric-label">Savings on this list</span>
              <strong className="sv-metric-value">{money.format(listSavings)}</strong>
            </div>
            <div className="sv-metric">
              <span className="sv-metric-label">Lifetime savings</span>
              <strong className="sv-metric-value">{money.format(lifetime)}</strong>
            </div>
            <div className="sv-metric">
              <span className="sv-metric-label">Lines with a cheaper option</span>
              <strong className="sv-metric-value">{opportunities.length}</strong>
            </div>
          </div>

          {opportunities.length > 0 ? (
            <section className="sv-section">
              <h2>Where you can save now</h2>
              <ul className="sv-list">
                {opportunities.map((row) => (
                  <li key={row.itemId || row.id} className="sv-row">
                    <div className="sv-row-main">
                      <strong>{nameOf(row)}</strong>
                      <small>{row.supplier && row.supplier !== "—" ? `Cheapest: ${row.supplier}` : "Cheapest match"}</small>
                    </div>
                    <div className="sv-row-prices">
                      <span className="sv-was">You pay {money.format(row.paidUnitPrice)}</span>
                      <span className="sv-now">Best {money.format(row.comparableUnitPrice ?? row.paidUnitPrice - row.lineSavings / (row.qty || 1))}</span>
                    </div>
                    <span className="sv-save">save {money.format(row.lineSavings)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="sv-allgood">Every priced line on this list is already at or below what you pay. Nice.</p>
          )}

          <div className="sv-footer">
            <button type="button" className="sv-import sv-import-ghost" onClick={onImportInvoice}>
              <Icon name="icon-cloud-upload" className="button-icon" />
              Import another invoice
            </button>
            <span className="sv-footer-note">Savings count only confident (exact + variant) matches.</span>
          </div>
        </>
      )}
    </div>
  );
}

// Consolidation preview: shows exactly which lines the landed-cost optimizer
// would move to a different supplier (and the before/after landed cost) so the
// buyer confirms the supplier reassignment rather than having it applied
// silently. Apply sets the per-line selections via onApplyOptimized.

export function ConsolidatePreviewModal({ moves, savings, fromSuppliers, toSuppliers, landedBefore, landedAfter, onApply, onClose }) {
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

export function UploadModal({
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
                      <strong>{stripPackFromName(row.importedName)}</strong>
                      <small>Qty {row.qty} · {row.uom}</small>
                    </div>
                    <Icon name="icon-arrow-right" className="button-icon crl-modal-arrow" />
                    <div className="crl-modal-result-to">
                      {notFound ? <span className="crl-dash">No catalog match</span> : (<><strong>{stripPackFromName(row.matchName)}</strong><small>{row.supplier}</small></>)}
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
