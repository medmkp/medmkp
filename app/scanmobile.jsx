"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogoMark, BrandMark, Icon } from "./icons";
import { formatTraceDate } from "./lib";
import { ProductSearchResults, useBarcodeScanner, useProductSearch } from "./ui";
import s from "./scanmobile.module.css";

// Mobile scan flow. Three scan modes set intent before the camera opens:
//   Receiving   — new shipment arrives; captures lot/expiry/supplier/qty/date
//   Shelf Audit — verify items already on shelves; records presence/status
//   Reorder List — quick scan to add products to the reorder list
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
    optional: ["Qty received", "Supplier"],
  },
  shelf_audit: {
    label: "Shelf Audit",
    emoji: "📋",
    emojiLabel: "Clipboard",
    desc: "Use when verifying items already in the office.",
    records: ["Lot", "Expiry", "Location", "Status"],
    statuses: ["Present", "Moved", "Not found", "Removed"],
  },
  reorder_list: {
    label: "Reorder List",
    emoji: "🛒",
    emojiLabel: "Shopping cart",
    desc: "Scan items to add directly to your reorder list.",
    records: ["Product match"],
    optional: ["Location"],
  },
};

const AUDIT_STATUSES = [
  { value: "present",   label: "Present",   icon: "icon-check-circle",  desc: "Item is on shelf" },
  { value: "moved",     label: "Moved",     icon: "icon-arrow-right",   desc: "Location changed" },
  { value: "not_found", label: "Not found", icon: "icon-search",        desc: "Not on shelf" },
  { value: "removed",   label: "Removed",   icon: "icon-x-circle",      desc: "Pulled from use" },
];

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

function matchPill(status) {
  if (status === "needs_review") return { label: "Needs review", cls: s.pillRed, icon: "icon-alert-triangle" };
  return { label: "Exact match", cls: s.pillGreen, icon: "icon-check-circle" };
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

// ── Mode picker card ──────────────────────────────────────────────────

function ModeCard({ value, selected, onSelect, meta }) {
  return (
    <button
      type="button"
      className={`${s.modeCard} ${selected ? s.modeCardSelected : ""}`}
      onClick={() => onSelect(value)}
      aria-pressed={selected}
    >
      <div className={s.modeCardHeader}>
        <span className={`${s.modeCardRadio} ${selected ? s.modeCardRadioSelected : ""}`} aria-hidden="true" />
        <span className={s.modeCardTitle}>{meta.label}</span>
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
  loading, sessions, locations, starting, needsAttention,
  onOpenSession, onStart, onNavigate,
}) {
  // "home" | "choose-scan-mode" | "choose-location"
  const [step, setStep] = useState("home");
  const [scanMode, setScanMode] = useState(null);

  const attnItems = needsAttention?.items || 0;
  const attnLocs  = needsAttention?.locations || 0;

  const active = useMemo(() => sessions.filter((x) => x.status === "active"), [sessions]);
  const resume = active[0] || null;

  const recentIds = useMemo(() => {
    const seen = [];
    for (const sess of sessions) {
      if (sess.location_id && !seen.includes(sess.location_id)) seen.push(sess.location_id);
    }
    return seen;
  }, [sessions]);
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const lastUsed = recentIds.map((id) => byId.get(id)).find(Boolean) || null;
  const others = locations.filter((l) => l.id !== lastUsed?.id);
  const recentNames = recentIds.slice(0, 3).map((id) => byId.get(id)?.name).filter(Boolean);

  // ── Screen: choose scan mode ────────────────────────────────────────
  if (step === "choose-scan-mode") {
    return (
      <div className={`${s.screen} ${s.screenNav}`}>
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
              <ModeCard
                key={value}
                value={value}
                selected={scanMode === value}
                onSelect={setScanMode}
                meta={meta}
              />
            ))}
          </div>

          <div className={s.infoBanner}>
            <Icon name="icon-info" />
            Same scanner, different record type. Choose what matters most right now.
          </div>
        </div>
        <div className={s.footer}>
          <button
            type="button"
            className={s.btnPrimary}
            disabled={!scanMode}
            onClick={() => {
              if (scanMode === "reorder_list") {
                // Reorder List mode = scan barcodes straight onto the reorder
                // list. /app/scan is the full-screen barcode scanner that does
                // exactly that (MobileScanItemView).
                onNavigate?.("/app/scan");
              } else {
                // Receiving + Shelf Audit both pick a location next.
                setStep("choose-location");
              }
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: choose location ─────────────────────────────────────────
  if (step === "choose-location") {
    return (
      <div className={`${s.screen} ${s.screenNav}`}>
        <header className={s.topbar}>
          <button type="button" className={s.iconBtn} onClick={() => setStep("choose-scan-mode")} aria-label="Back">
            <Icon name="icon-chevron-left" />
          </button>
          <span className={s.barTitle}>Choose location</span>
        </header>
        <div className={s.body}>
          <div className={s.intro}>
            <p className={s.sub}>Select where you&rsquo;re scanning so items stay organized.</p>
          </div>

          {locations.length === 0 ? (
            <div className={s.emptyNote}>
              No locations yet. Add one to start scanning its shelves.
            </div>
          ) : (
            <>
              {lastUsed && (
                <>
                  <div className={s.sectionLabel}>Last used</div>
                  <button
                    type="button"
                    className={s.lastUsed}
                    disabled={Boolean(starting)}
                    onClick={() => onStart(lastUsed, scanMode)}
                  >
                    <span className={`${s.lastUsedIcon} ${typeMeta(lastUsed.type).tint}`}>
                      <Icon name={typeMeta(lastUsed.type).icon} />
                    </span>
                    <span className={s.lastUsedBody}>
                      <span className={s.lastUsedName}>{lastUsed.name}</span>
                      <span className={s.lastUsedSub}>{starting === lastUsed.id ? "Starting…" : "Last used recently"}</span>
                    </span>
                    <span className={s.lastUsedCheck}><Icon name="icon-check" /></span>
                  </button>
                </>
              )}

              {others.length > 0 && (
                <>
                  <div className={s.sectionLabel}>Other locations</div>
                  <div className={s.locList}>
                    {others.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        className={s.locRow}
                        disabled={Boolean(starting)}
                        onClick={() => onStart(loc, scanMode)}
                      >
                        <span className={s.locRowIcon}><Icon name={typeMeta(loc.type).icon} /></span>
                        <span className={s.locRowName}>{loc.name}</span>
                        <span className={s.locRowChevron}><Icon name="icon-chevron-right" /></span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {recentNames.length > 0 && (
                <button type="button" className={s.recent} onClick={() => lastUsed && onStart(lastUsed, scanMode)}>
                  <span className={s.recentIcon}><Icon name="icon-clock" /></span>
                  <span className={s.recentBody}>
                    <span className={s.recentTitle}>Recent locations</span>
                    <span className={s.recentNames}>{recentNames.join(" · ")}</span>
                  </span>
                </button>
              )}
            </>
          )}

          <div className={s.manage}>
            <span className={s.manageHint}>Don&rsquo;t see what you need?</span>
            <button type="button" className={s.manageLink} onClick={() => onNavigate?.("/app/locations")}>
              Manage locations
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: home ────────────────────────────────────────────────────
  // No top bar: this is a primary tab destination, so the H1 is the title and
  // the persistent bottom nav carries identity + navigation.
  return (
    <div className={`${s.screen} ${s.screenNav}`}>
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
            {resume && (
              <div className={s.resumeCard}>
                <button
                  type="button"
                  className={s.resumeTop}
                  onClick={() => onOpenSession(resume.id)}
                  style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", width: "100%" }}
                >
                  <span className={s.resumeIcon}><Icon name="icon-refresh" /></span>
                  <span className={s.resumeBody}>
                    <span className={s.resumeKicker}>IN PROGRESS</span>
                    <span className={s.resumeTitle}>Continue {resume.location_name || "location"}</span>
                    <span className={s.resumeMeta}><Icon name="icon-calendar" /> {resume.counts?.scanned || 0} items scanned</span>
                    <span className={s.resumeMeta}><Icon name="icon-clock" /> Last updated {relTime(resume.updated_at) || "recently"}</span>
                  </span>
                  <span className={s.resumeChevron}><Icon name="icon-chevron-right" /></span>
                </button>
                <button type="button" className={s.resumeBtn} onClick={() => onOpenSession(resume.id)}>Resume</button>
              </div>
            )}

            <div className={s.actionList}>
              <button type="button" className={s.actionRow} onClick={() => { setScanMode(null); setStep("choose-scan-mode"); }}>
                <span className={s.actionIcon}><Icon name="icon-plus" /></span>
                <span className={s.actionText}>
                  <span className={s.actionTitle}>Start new scan session</span>
                  <span className={s.actionSub}>Choose scan mode then pick a location</span>
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

// ── Camera + mode-specific bottom sheets ──────────────────────────────

export function MobileScanSession({
  session, lines, counts, active,
  pendingLine, captureType,
  onScan, onAddProduct, onPatchLine, onRemoveLine, onComplete, onBack, onClearPending,
  locations, onSwitchLocation, onNavigate,
}) {
  const [viewMode, setViewMode] = useState("scan"); // scan | review
  const [detail, setDetail] = useState(null);
  const [link, setLink]   = useState(null);
  const [sheet, setSheet] = useState(null); // manual | search | help | location
  const [localMode, setLocalMode] = useState(captureType || "shelf_audit");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const pulseTimer = useRef();
  const [captured, setCaptured] = useState(false);

  const cameraActive = active && viewMode === "scan" && !detail && !link && !pendingLine;

  const { videoRef, cameraStatus, autoDetect, retry } = useBarcodeScanner({
    active: cameraActive,
    onScan: (code) => {
      onScan(code);
      setCaptured(true);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  useEffect(() => {
    if (cameraStatus !== "ready") { setTorchSupported(false); setTorchOn(false); return; }
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    const caps  = track?.getCapabilities?.();
    setTorchSupported(Boolean(caps && "torch" in caps && caps.torch));
  }, [cameraStatus, videoRef]);

  function toggleTorch() {
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    track.applyConstraints({ advanced: [{ torch: next }] }).then(() => setTorchOn(next)).catch(() => {});
  }

  function switchMode(m) {
    setLocalMode(m);
    if (pendingLine) onClearPending?.();
  }

  const locName = session.location_name || "Location";

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
        <span className={s.camBrand}><BrandMark /></span>
        <span className={s.camRight}>
          {torchSupported && (
            <button
              type="button"
              className={`${s.camCircle} ${torchOn ? s.camCircleActive : ""}`}
              onClick={toggleTorch}
              aria-label="Toggle flash"
              aria-pressed={torchOn}
            >
              <Icon name="icon-bolt" />
            </button>
          )}
          <button type="button" className={s.camCircle} onClick={() => setSheet("help")} aria-label="How scanning works">
            <Icon name="icon-help-circle" />
          </button>
          {counts.scanned > 0 && (
            <button
              type="button"
              className={s.camReviewBtn}
              onClick={() => setViewMode("review")}
              aria-label={`Review ${counts.scanned} scanned items`}
            >
              <Icon name={typeMeta(session.location_type).icon} />
              <span className={s.camCountBadge}>{counts.scanned > 99 ? "99+" : `+${counts.scanned}`}</span>
            </button>
          )}
        </span>
      </div>

      {/* Location pill — shelf audit only */}
      {localMode === "shelf_audit" && (
        <button type="button" className={s.locPill} onClick={() => setSheet("location")}>
          <Icon name="icon-map-pin" />
          <span className={s.locPillName}>{locName}</span>
          <span className={s.locPillCaret}><Icon name="icon-chevron-down" /></span>
        </button>
      )}

      {/* Current mode badge — single pill, not a toggle */}
      <div className={s.modeBadgeRow}>
        <span className={s.modeBadge}>
          {SCAN_MODE_META[localMode]?.emoji} {SCAN_MODE_META[localMode]?.label}
        </span>
      </div>

      <div className={s.camFrame} aria-hidden="true"><span /><span /><span /><span /></div>
      {!pendingLine && cameraStatus === "ready" && (
        <div className={s.camHint}>Point at a barcode</div>
      )}

      {/* Mode-specific bottom sheets after a scan */}
      {pendingLine && localMode === "receiving" && (
        <ReceivingSheet
          line={pendingLine}
          locName={locName}
          onClose={onClearPending}
          onSave={(body) => { onPatchLine(pendingLine.id, body); onClearPending?.(); }}
          onUndo={() => { onRemoveLine(pendingLine.id); onClearPending?.(); }}
        />
      )}
      {pendingLine && localMode === "shelf_audit" && (
        <ShelfAuditSheet
          line={pendingLine}
          locName={locName}
          onClose={onClearPending}
          onSave={(body) => { onPatchLine(pendingLine.id, body); onClearPending?.(); }}
          onUndo={() => { onRemoveLine(pendingLine.id); onClearPending?.(); }}
        />
      )}
      {pendingLine && localMode === "reorder_list" && (
        <ReorderQuickSheet
          line={pendingLine}
          locName={locName}
          locations={locations}
          onClose={onClearPending}
          onUndo={() => { onRemoveLine(pendingLine.id); onClearPending?.(); }}
          onNavigate={onNavigate}
        />
      )}

      {sheet === "manual"   && <ManualSheet onClose={() => setSheet(null)} onSubmit={(code) => { onScan(code); setSheet(null); }} />}
      {sheet === "search"   && <SearchSheet title="Search product" onClose={() => setSheet(null)} onPick={(p) => { onAddProduct(p); setSheet(null); }} />}
      {sheet === "help"     && <HelpSheet onClose={() => setSheet(null)} />}
      {sheet === "location" && (
        <LocationSheet
          locations={locations}
          currentId={session.location_id}
          onClose={() => setSheet(null)}
          onPick={(loc) => { setSheet(null); if (loc.id !== session.location_id) onSwitchLocation(loc); }}
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

// ── Receiving bottom sheet ────────────────────────────────────────────

function ReceivingSheet({ line, locName, onClose, onSave, onUndo }) {
  const [lot,          setLot]          = useState(line.lot_number || "");
  const [exp,          setExp]          = useState(line.expiration_date ? String(line.expiration_date).slice(0, 10) : "");
  const [qty,          setQty]          = useState(1);
  const [supplier,     setSupplier]     = useState("");
  const [receivedDate, setReceivedDate] = useState(todayIso());

  function save() {
    onSave({
      lot_number:      lot.trim() || null,
      expiration_date: exp || null,
      quantity:        qty,
      supplier_name:   supplier.trim() || null,
      received_date:   receivedDate || null,
    });
  }

  return (
    <div className={s.modeSheet}>
      <div className={s.modeSheetBackdrop} onClick={onClose} />
      <div className={s.modeSheetPanel}>
        <div className={s.modeSheetGrip} aria-hidden="true" />
        <ModeSheetProductHeader line={line} modeBadge="Receiving" modeBadgeCls={s.badgeBlue} />

        <div className={s.modeSheetFields}>
          <ModeSheetRow label="Lot number">
            <input className={s.input} value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. A219" />
          </ModeSheetRow>
          <ModeSheetRow label="Expiration date">
            <input className={s.input} type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
          </ModeSheetRow>
          <ModeSheetRow label={<>Qty received <span className={s.optionalLabel}>(optional)</span></>}>
            <div className={s.stepper}>
              <button type="button" className={s.stepBtn} onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span className={s.stepVal}>{qty}</span>
              <button type="button" className={s.stepBtn} onClick={() => setQty((q) => q + 1)}>+</button>
            </div>
          </ModeSheetRow>
          <ModeSheetRow label={<>Supplier <span className={s.optionalLabel}>(optional)</span></>}>
            <input className={s.input} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Henry Schein" />
          </ModeSheetRow>
          <ModeSheetRow label="Received date">
            <input className={s.input} type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </ModeSheetRow>
          <ModeSheetRow label="Location">
            <span className={s.modeSheetLocPill}><Icon name="icon-map-pin" /> {locName}</span>
          </ModeSheetRow>
        </div>

        <div className={s.modeSheetInfo}>
          <Icon name="icon-info" /> This receiving scan creates compliance evidence and contributes to reorder history.
        </div>

        <div className={s.modeSheetActions}>
          <button type="button" className={s.btnOutline} onClick={onUndo}>Undo scan</button>
          <button type="button" className={s.btnPrimary} onClick={save}>Save receiving record</button>
        </div>
      </div>
    </div>
  );
}

// ── Shelf audit bottom sheet ──────────────────────────────────────────

function ShelfAuditSheet({ line, locName, onClose, onSave, onUndo }) {
  const [status,  setStatus]  = useState("present");
  const [lot,     setLot]     = useState(line.lot_number || "");
  const [exp,     setExp]     = useState(line.expiration_date ? String(line.expiration_date).slice(0, 10) : "");

  const isExpired = exp && new Date(exp) <= new Date();

  function save() {
    onSave({
      lot_number:         lot.trim() || null,
      expiration_date:    exp || null,
      shelf_audit_status: status,
    });
  }

  return (
    <div className={s.modeSheet}>
      <div className={s.modeSheetBackdrop} onClick={onClose} />
      <div className={s.modeSheetPanel}>
        <div className={s.modeSheetGrip} aria-hidden="true" />
        <ModeSheetProductHeader line={line} modeBadge="Shelf audit" modeBadgeCls={s.badgeTeal} />

        {isExpired && (
          <div className={s.expiredBanner}>
            <Icon name="icon-alert-triangle" />
            Expired — verify removal or replacement before saving.
          </div>
        )}

        <div className={s.auditStatuses}>
          <p className={s.auditStatusesLabel}>Verify status</p>
          <div className={s.auditStatusGrid}>
            {AUDIT_STATUSES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${s.auditStatusBtn} ${status === opt.value ? s.auditStatusBtnActive : ""}`}
                onClick={() => setStatus(opt.value)}
              >
                <Icon name={opt.icon} />
                <span className={s.auditStatusLabel}>{opt.label}</span>
                <span className={s.auditStatusDesc}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={s.modeSheetFields}>
          <ModeSheetRow label="Lot number">
            <input className={s.input} value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. A219" />
          </ModeSheetRow>
          <ModeSheetRow label="Expiration date">
            <input className={s.input} type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
          </ModeSheetRow>
          <ModeSheetRow label="Location">
            <span className={s.modeSheetLocPill}><Icon name="icon-map-pin" /> {locName}</span>
          </ModeSheetRow>
        </div>

        <div className={s.modeSheetActions}>
          <button type="button" className={s.btnOutline} onClick={onUndo}>Undo scan</button>
          <button type="button" className={s.btnPrimary} onClick={save}>Save verification</button>
        </div>
      </div>
    </div>
  );
}

// ── Reorder quick-add sheet ───────────────────────────────────────────

function ReorderQuickSheet({ line, locName, onClose, onUndo, onNavigate }) {
  const pill = matchPill(line.status);
  return (
    <div className={s.modeSheet}>
      <div className={s.modeSheetBackdrop} onClick={onClose} />
      <div className={s.modeSheetPanel}>
        <div className={s.modeSheetGrip} aria-hidden="true" />
        <ModeSheetProductHeader line={line} modeBadge="Reorder list" modeBadgeCls={s.badgeSlate} />

        <div className={s.reorderSheetBody}>
          <p className={s.reorderSheetHint}>
            To add this item to your reorder list, go to the Reorder List and use its scan feature there.
            You can also manage your list from the menu.
          </p>
          <div className={s.reorderSheetLoc}>
            <Icon name="icon-map-pin" /> {locName}
          </div>
        </div>

        <div className={s.modeSheetActions}>
          <button type="button" className={s.btnOutline} onClick={onUndo}>Undo scan</button>
          <button type="button" className={s.btnPrimary} onClick={() => onNavigate?.("/app/reorder-list")}>
            Go to reorder list
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared sheet sub-components ───────────────────────────────────────

function ModeSheetProductHeader({ line, modeBadge, modeBadgeCls }) {
  return (
    <div className={s.modeSheetProduct}>
      <span className={s.modeSheetThumb}>
        {line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="icon-package" />}
      </span>
      <div className={s.modeSheetProductInfo}>
        <span className={s.modeSheetProductName}>{line.name}</span>
        {offerSku(line) && <span className={s.modeSheetSku}>SKU: {offerSku(line)}</span>}
      </div>
      <span className={`${s.badge} ${s.badgeGreen}`}>
        <Icon name="icon-check-circle" /> Exact match
      </span>
      <span className={`${s.badge} ${modeBadgeCls}`}>{modeBadge}</span>
    </div>
  );
}

function ModeSheetRow({ label, children }) {
  return (
    <div className={s.modeSheetRow}>
      <span className={s.modeSheetLabel}>{label}</span>
      <div className={s.modeSheetControl}>{children}</div>
    </div>
  );
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

function ReviewSession({ session, lines, counts, onBack, onScanMore, onSave, onDetail, onLink, linkSheet, onCloseLink, onPatchLine }) {
  const review    = lines.filter((l) => l.status === "needs_review");
  const details   = lines.filter((l) => l.status === "needs_details");
  const confirmed = lines.filter((l) => l.status === "confirmed");

  const [openReview,    setOpenReview]    = useState(true);
  const [openDetails,   setOpenDetails]   = useState(true);
  const [openConfirmed, setOpenConfirmed] = useState(false);
  const [showAllDetails,   setShowAllDetails]   = useState(false);
  const [showAllConfirmed, setShowAllConfirmed] = useState(false);

  const detailsShown   = showAllDetails   ? details   : details.slice(0, 4);
  const confirmedShown = showAllConfirmed ? confirmed : confirmed.slice(0, 2);

  return (
    <div className={s.screen}>
      <header className={s.topbar}>
        <button type="button" className={s.iconBtn} onClick={onBack} aria-label="Back"><Icon name="icon-chevron-left" /></button>
        <span className={s.barTitle}>Review {session.location_name || "location"}</span>
      </header>
      <div className={s.body}>
        <div className={s.reviewTitle}>
          <span className={s.reviewSub}>Scan session review</span>
        </div>

        <div className={s.statGrid}>
          <div className={s.statCard}><Icon name="icon-scan" className={s.txBlue} /><span className={s.statVal}>{counts.scanned}</span><span className={s.statLabel}>scanned</span></div>
          <div className={s.statCard}><Icon name="icon-check-circle" className={s.txGreen} /><span className={s.statVal}>{counts.confirmed}</span><span className={s.statLabel}>confirmed</span></div>
          <div className={s.statCard}><Icon name="icon-clock" className={s.txAmber} /><span className={s.statVal}>{counts.needs_details}</span><span className={s.statLabel}>need details</span></div>
          <div className={s.statCard}><Icon name="icon-alert-triangle" className={s.txRed} /><span className={s.statVal}>{counts.needs_review}</span><span className={s.statLabel}>need review</span></div>
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
                  <div key={line.id} className={s.revRow}>
                    <span className={s.revThumb}>{line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="icon-alert-triangle" />}</span>
                    <div className={s.revBody}>
                      <span className={s.revName}>{line.name}</span>
                      <span className={s.revMeta}>{offerSku(line) ? `SKU: ${offerSku(line)}` : "No catalog match"}</span>
                      <span className={s.revLoc}><Icon name="icon-map-pin" /> {session.location_name}</span>
                    </div>
                    <button type="button" className={s.revBtn} onClick={() => onLink(line)}>Review</button>
                  </div>
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
                {detailsShown.map((line) => (
                  <div key={line.id} className={s.revRow}>
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
                  </div>
                ))}
                {details.length > 4 && !showAllDetails && (
                  <button type="button" className={s.moreRow} onClick={() => setShowAllDetails(true)}>
                    <Icon name="icon-plus" /> {details.length - 4} more items
                  </button>
                )}
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
                {confirmedShown.map((line) => (
                  <div key={line.id} className={s.revRow}>
                    <span className={s.revThumb}>{line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="icon-check-circle" />}</span>
                    <div className={s.revBody}>
                      <span className={s.revName}>{line.name}</span>
                      <span className={s.revMeta}>
                        {offerSku(line) ? `SKU: ${offerSku(line)}` : ""}
                        {line.expiration_date ? `${offerSku(line) ? " · " : ""}Exp ${formatTraceDate(line.expiration_date)}` : ""}
                      </span>
                    </div>
                    <span className={`${s.resultPill} ${s.pillGreen}`}><Icon name="icon-check-circle" /> Exact match</span>
                  </div>
                ))}
                {confirmed.length > 2 && !showAllConfirmed && (
                  <button type="button" className={s.moreRow} onClick={() => setShowAllConfirmed(true)}>
                    <Icon name="icon-plus" /> {confirmed.length - 2} more confirmed items
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        <div className={s.banner}><Icon name="icon-info" /> You can finish this location after saving.</div>
      </div>
      <div className={s.footer}>
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

function HelpSheet({ onClose }) {
  return (
    <SheetShell title="How scanning works" onClose={onClose}>
      <ul className={s.helpList}>
        <li><span className={`${s.helpDot} ${s.txGreen}`}><Icon name="icon-check-circle" /></span> Point the camera at a barcode — exact matches add to this location automatically.</li>
        <li><span className={`${s.helpDot} ${s.txAmber}`}><Icon name="icon-clock" /></span> Lot &amp; expiry are read off the package when the code carries them; fill in any gaps in the form.</li>
        <li><span className={`${s.helpDot} ${s.txRed}`}><Icon name="icon-alert-triangle" /></span> Anything we can&rsquo;t identify waits in Review, where you can link the right product.</li>
      </ul>
      <p className={s.sheetHint}>Use Enter SKU when a code won&rsquo;t scan, or Search product to add an item by name.</p>
    </SheetShell>
  );
}

function LocationSheet({ locations, currentId, onClose, onPick, onManage }) {
  return (
    <SheetShell title="Scanning location" onClose={onClose}>
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
    </SheetShell>
  );
}
