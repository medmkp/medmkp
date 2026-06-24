"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  SCAN_BUCKETS,
  daysUntil,
  formatTraceDate,
  scanLinePayload,
  scanLookup,
  scanMissReason,
  traceApi,
  traceErrorMessage,
} from "./lib";
import { ScanHandoffQr, useProductSearch, ProductSearchResults } from "./ui";
import { MobileScanStart, MobileScanSession } from "./scanmobile";
import s from "./scansessions.module.css";

// Phase 2 — Scan Sessions. A stateful, resumable inventory audit: choose a
// location, scan the items on its shelves, and each scan becomes a line that
// carries the lot/expiry the decoder read off the package. Exact matches with
// traceability auto-confirm and land in the location's inventory; lines we can't
// identify wait in "needs review", and identified-but-thin lines wait in "needs
// details". We track the OUTCOME (traceability captured, expiry exposure), not
// scan streaks.

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

const TONE_BG = { blue: s.tBlue, green: s.tGreen, amber: s.tAmber, red: s.tRed, slate: s.tSlate };
const TONE_TX = { green: s.txGreen, amber: s.txAmber, red: s.txRed, blue: s.txBlue };

function Stat({ icon, tone, label, value }) {
  return (
    <div className={s.stat}>
      <span className={`${s.statIcon} ${TONE_BG[tone] || s.tSlate}`}><Icon name={icon} /></span>
      <div className={s.statBody}>
        <span className={s.statLabel}>{label}</span>
        <strong className={s.statValue}>{value}</strong>
      </div>
    </div>
  );
}

// ── Scan Sessions list + start-a-session picker ───────────────────────

export function ScanSessionsView({ onOpenSession, onNavigate, onToast }) {
  const [sessions, setSessions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => { setIsMobile(window.matchMedia("(max-width: 900px)").matches); }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      traceApi.listSessions().catch(() => ({ sessions: [] })),
      traceApi.listLocations().catch(() => ({ locations: [] })),
    ]).then(([s1, s2]) => {
      if (!alive) return;
      setSessions(s1.sessions || []);
      setLocations(s2.locations || []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const active = sessions.filter((x) => x.status === "active");
  const past = sessions.filter((x) => x.status !== "active");

  // Real needs-attention rollup: the backend flags each inventory item that's
  // expiring/expired, at/below par, or missing lot+expiry, and /locations rolls
  // the per-location counts on. Sum them for the mobile home card.
  const needsAttention = useMemo(() => {
    const items = locations.reduce((sum, l) => sum + (l.needs_attention_count || 0), 0);
    const locs = locations.filter((l) => (l.needs_attention_count || 0) > 0).length;
    return { items, locations: locs };
  }, [locations]);

  async function startFor(location, captureType) {
    setStarting(location?.id || "__new__");
    try {
      const body = {};
      if (location?.id) body.location_id = location.id;
      if (captureType) body.capture_type = captureType;
      const { session } = await traceApi.startSession(body);
      onOpenSession(session.id);
    } catch (err) {
      onToast?.(traceErrorMessage(err, "Couldn't start a scan session — please try again."));
      setStarting("");
      setPicking(false);
    }
  }

  if (isMobile) {
    return (
      <MobileScanStart
        loading={loading}
        sessions={sessions}
        locations={locations}
        starting={starting}
        needsAttention={needsAttention}
        onOpenSession={onOpenSession}
        onStart={startFor}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.title}>Scan Sessions</h1>
          <p className={s.subtitle}>
            Walk a location, scan what&rsquo;s on the shelf, and capture the lot &amp; expiry off each
            package. Confirmed items flow straight into that location&rsquo;s inventory.
          </p>
        </div>
        <button type="button" className={s.scanBtn} onClick={() => setPicking(true)}>
          <Icon name="icon-scan" /> Start scan session
        </button>
      </header>

      {loading ? (
        <div className={s.empty}>Loading sessions…</div>
      ) : (
        <>
          <section className={s.group}>
            <h2 className={s.groupTitle}>In progress</h2>
            {active.length === 0 ? (
              <div className={s.emptyCard}>
                <span className={s.emptyIcon}><Icon name="icon-scan" /></span>
                <strong>No scan in progress</strong>
                <span>Start a session to begin auditing a location&rsquo;s shelves.</span>
                <button type="button" className={s.ghostBtn} onClick={() => setPicking(true)}>
                  <Icon name="icon-plus" /> Start scan session
                </button>
              </div>
            ) : (
              <div className={s.cards}>
                {active.map((sess) => (
                  <SessionCard key={sess.id} sess={sess} onOpen={() => onOpenSession(sess.id)} resume />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className={s.group}>
              <h2 className={s.groupTitle}>Recent sessions</h2>
              <div className={s.cards}>
                {past.map((sess) => (
                  <SessionCard key={sess.id} sess={sess} onOpen={() => onOpenSession(sess.id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {picking && (
        <LocationPicker
          locations={locations}
          starting={starting}
          onPick={startFor}
          onAddLocation={() => onNavigate?.("/app/locations/new")}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function SessionCard({ sess, onOpen, resume }) {
  const meta = typeMeta(sess.location_type);
  const c = sess.counts || {};
  const total = c.scanned || 0;
  const pct = total ? Math.round(((c.confirmed || 0) / total) * 100) : 0;
  return (
    <article className={s.card}>
      <button type="button" className={s.cardHead} onClick={onOpen}>
        <span className={`${s.cardIcon} ${meta.tint}`}><Icon name={meta.icon} /></span>
        <div className={s.cardHeadBody}>
          <span className={s.cardName}>{sess.location_name || "Location"}</span>
          <span className={s.cardSub}>
            {sess.status === "active" ? "In progress" : "Completed"} · {total} scanned
          </span>
        </div>
        <span className={`${s.statusDot} ${sess.status === "active" ? s.dotBlue : s.dotGreen}`} />
      </button>
      <div className={s.cardCounts}>
        <span className={s.txGreen}><Icon name="icon-check-circle" /> {c.confirmed || 0}</span>
        <span className={s.txAmber}><Icon name="icon-clock" /> {c.needs_details || 0}</span>
        <span className={s.txRed}><Icon name="icon-alert-triangle" /> {c.needs_review || 0}</span>
      </div>
      <div className={s.progress}>
        <span className={s.progressTrack}><span className={s.progressFill} style={{ width: `${pct}%` }} /></span>
        <span className={s.progressPct}>{pct}%</span>
      </div>
      <button type="button" className={resume ? s.cardCta : s.cardCtaGhost} onClick={onOpen}>
        {resume ? <><Icon name="icon-scan" /> Resume scan</> : <>View session <Icon name="icon-chevron-right" /></>}
      </button>
    </article>
  );
}

function LocationPicker({ locations, starting, onPick, onAddLocation, onClose }) {
  return (
    <div className={s.overlay} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.modal}>
        <header className={s.modalHead}>
          <div>
            <h3>Choose a location</h3>
            <p>Which shelf or cabinet are you scanning?</p>
          </div>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close"><Icon name="icon-x" /></button>
        </header>
        {locations.length === 0 ? (
          <div className={s.emptyCard}>
            <span className={s.emptyIcon}><Icon name="icon-map-pin" /></span>
            <strong>No locations yet</strong>
            <span>Add a location first, then scan its shelves.</span>
            <button type="button" className={s.scanBtn} onClick={onAddLocation}><Icon name="icon-plus" /> Add location</button>
          </div>
        ) : (
          <div className={s.pickList}>
            {locations.map((loc) => {
              const meta = typeMeta(loc.type);
              return (
                <button key={loc.id} type="button" className={s.pickRow} disabled={Boolean(starting)} onClick={() => onPick(loc)}>
                  <span className={`${s.cardIcon} ${meta.tint}`}><Icon name={meta.icon} /></span>
                  <span className={s.pickBody}>
                    <strong>{loc.name}</strong>
                    <small>{loc.item_count ?? 0} item{(loc.item_count ?? 0) === 1 ? "" : "s"} tracked</small>
                  </span>
                  {starting === loc.id ? <span className={s.pickSpin}>…</span> : <Icon name="icon-chevron-right" className={s.pickChevron} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Active scan session ───────────────────────────────────────────────

export function ScanSessionView({ sessionId, onBack, onNavigate, onToast }) {
  const [session, setSession] = useState(null);
  const [lines, setLines] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [isMobile, setIsMobile] = useState(false);
  const [manual, setManual] = useState("");
  const [pendingLine, setPendingLine] = useState(null);
  const flashTimer = useRef();

  useEffect(() => { setIsMobile(window.matchMedia("(max-width: 900px)").matches); }, []);

  useEffect(() => {
    traceApi.listLocations().then((d) => setLocations(d.locations || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    traceApi.getSession(sessionId)
      .then((data) => { if (!alive) return; setSession(data.session); setLines(data.lines || []); setLoading(false); })
      .catch(() => { if (alive) { setLoading(false); onToast?.("Couldn't load this scan session."); } });
    return () => { alive = false; };
  }, [sessionId, onToast]);

  const active = session?.status === "active";

  const handleScan = useCallback(async (code) => {
    if (!code || !active) return;
    try {
      const { product, scanned, kind } = await scanLookup(code);
      const payload = scanLinePayload(code, product, scanned);
      const { line, counts } = await traceApi.addLine(sessionId, payload);
      const merged = { ...line, _offer: product?.best_offer || product?.offers?.[0] || null };
      setLines((prev) => [merged, ...prev]);
      setSession((prev) => (prev ? { ...prev, counts } : prev));
      setPendingLine(merged);
      // Tell the buyer why an unmatched scan landed in review (marketing QR,
      // uncarried barcode, non-product code) rather than leaving it unexplained;
      // and flag a case/pack-barcode match so they can confirm the pack size.
      if (kind === "none" && !product) onToast?.(scanMissReason(code));
      else if (kind === "barcode_pack") onToast?.("Matched by case/pack barcode — confirm the pack size is right.");
      // Desktop auto-dismisses the flash; mobile keeps the result card up so its
      // Undo / Edit / Review actions stay reachable until the next scan.
      if (!isMobile) {
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setPendingLine(null), 2600);
      }
      if (navigator.vibrate) navigator.vibrate(40);
    } catch {
      onToast?.("Scan failed — try again.");
    }
  }, [active, sessionId, onToast, isMobile]);

  // Add an item the buyer picked from search (no barcode) as a scan line.
  const addProduct = useCallback(async (product) => {
    if (!active) return;
    try {
      const payload = scanLinePayload(null, product, null);
      const { line, counts } = await traceApi.addLine(sessionId, payload);
      const merged = { ...line, _offer: product?.best_offer || product?.offers?.[0] || null };
      setLines((prev) => [merged, ...prev]);
      setSession((prev) => (prev ? { ...prev, counts } : prev));
      setPendingLine(merged);
    } catch {
      onToast?.("Couldn't add that item.");
    }
  }, [active, sessionId, onToast]);

  function submitManual(e) {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    handleScan(v);
    setManual("");
  }

  async function patchLine(id, body) {
    try {
      const { line, counts } = await traceApi.updateLine(id, body);
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...line } : l)));
      setSession((prev) => (prev ? { ...prev, counts } : prev));
    } catch {
      onToast?.("Couldn't save that change.");
    }
  }

  async function removeLine(id) {
    try {
      const { counts } = await traceApi.deleteLine(id);
      setLines((prev) => prev.filter((l) => l.id !== id));
      setSession((prev) => (prev ? { ...prev, counts } : prev));
    } catch {
      onToast?.("Couldn't remove that item.");
    }
  }

  async function complete() {
    try {
      const { session: saved } = await traceApi.updateSession(sessionId, { status: "completed" });
      setSession(saved);
      onToast?.("Scan session completed — items saved to the location.");
      // On mobile, land on the location's items so the tech sees what they
      // captured; desktop returns to the sessions board.
      if (isMobile && saved?.location_id) onNavigate?.(`/app/locations/${saved.location_id}`);
      else onBack?.();
    } catch {
      onToast?.("Couldn't complete the session.");
    }
  }

  // Walk to another room mid-audit: start/resume that location's session and
  // navigate into it (the backend keeps one active session per location).
  async function switchLocation(location) {
    try {
      const { session: next } = await traceApi.startSession({ location_id: location.id });
      onNavigate?.(`/app/scan-sessions/${next.id}`);
    } catch {
      onToast?.("Couldn't switch location.");
    }
  }

  const counts = session?.counts || { scanned: 0, confirmed: 0, needs_details: 0, needs_review: 0 };
  const traced = useMemo(() => lines.filter((l) => l.lot_number && l.expiration_date).length, [lines]);
  const tracePct = counts.scanned ? Math.round((traced / counts.scanned) * 100) : 0;
  const expiringSoon = useMemo(
    () => lines.filter((l) => { const d = daysUntil(l.expiration_date); return d != null && d <= 30; }).length,
    [lines],
  );
  const visible = filter === "all" ? lines : lines.filter((l) => l.status === filter);

  if (loading) return <div className={s.page}><div className={s.empty}>Loading session…</div></div>;
  if (!session) return <div className={s.page}><div className={s.empty}>Session not found.</div></div>;

  if (isMobile) {
    return (
      <MobileScanSession
        session={session}
        lines={lines}
        counts={counts}
        active={active}
        pendingLine={pendingLine}
        captureType={session.capture_type || "shelf_audit"}
        onScan={handleScan}
        onAddProduct={addProduct}
        onPatchLine={patchLine}
        onRemoveLine={removeLine}
        onComplete={complete}
        onBack={onBack}
        onClearPending={() => setPendingLine(null)}
        locations={locations}
        onSwitchLocation={switchLocation}
        onNavigate={onNavigate}
      />
    );
  }

  const meta = typeMeta(session.location_type);

  return (
    <div className={s.session}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        <button type="button" className={s.crumbLink} onClick={onBack}>Scan sessions</button>
        <span className={s.crumbSep}>/</span>
        <span className={s.crumbCurrent}>{session.location_name || "Location"}</span>
      </nav>

      <header className={s.sessionHead}>
        <div className={s.sessionId}>
          <span className={`${s.cardIcon} ${meta.tint}`}><Icon name={meta.icon} /></span>
          <div>
            <div className={s.sessionTitleRow}>
              <h1 className={s.title}>{session.location_name || "Location"}</h1>
              <span className={`${s.badge} ${active ? s.badgeBlue : s.badgeGreen}`}>{active ? "In progress" : "Completed"}</span>
            </div>
            <p className={s.subtitle}>Scan items on this shelf — lot &amp; expiry are captured automatically when the code carries them.</p>
          </div>
        </div>
        {active && (
          <button type="button" className={s.completeBtn} onClick={complete} disabled={!counts.scanned}>
            <Icon name="icon-check" /> Complete session
          </button>
        )}
      </header>

      <div className={s.stats}>
        <Stat icon="icon-scan" tone="blue" label="Scanned" value={counts.scanned} />
        <Stat icon="icon-check-circle" tone="green" label="Confirmed" value={counts.confirmed} />
        <Stat icon="icon-clock" tone="amber" label="Needs details" value={counts.needs_details} />
        <Stat icon="icon-alert-triangle" tone="red" label="Needs review" value={counts.needs_review} />
      </div>

      <div className={s.grid}>
        <div className={s.main}>
          {active && (
            <section className={s.scanPanel}>
              <div className={s.handoff}>
                <div className={s.handoffQr}>
                  <ScanHandoffQr url={typeof window !== "undefined" ? `${window.location.origin}/app/scan-sessions/${session.id}` : ""} />
                </div>
                <div className={s.handoffBody}>
                  <strong>Scan with your phone</strong>
                  <p>Open this session on your phone&rsquo;s camera for a far better read of small Data Matrix codes — or key a code in below.</p>
                  {flash && <FlashCard flash={flash} inline />}
                </div>
              </div>
              <form className={s.manualRow} onSubmit={submitManual}>
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
          )}

          <section className={s.queue}>
            <div className={s.queueHead}>
              <h2 className={s.groupTitle}>Review queue</h2>
              <div className={s.filters}>
                <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={counts.scanned} />
                <FilterChip active={filter === "confirmed"} onClick={() => setFilter("confirmed")} label="Confirmed" count={counts.confirmed} tone="green" />
                <FilterChip active={filter === "needs_details"} onClick={() => setFilter("needs_details")} label="Needs details" count={counts.needs_details} tone="amber" />
                <FilterChip active={filter === "needs_review"} onClick={() => setFilter("needs_review")} label="Needs review" count={counts.needs_review} tone="red" />
              </div>
            </div>

            {visible.length === 0 ? (
              <div className={s.emptyCard}>
                <span className={s.emptyIcon}><Icon name="icon-scan" /></span>
                <strong>{counts.scanned ? "Nothing in this bucket" : "No items scanned yet"}</strong>
                <span>{counts.scanned ? "Switch filters to see your other items." : "Scan an item to start the audit."}</span>
              </div>
            ) : (
              <div className={s.lineList}>
                {visible.map((line) => (
                  <SessionLine key={line.id} line={line} editable={active} onPatch={patchLine} onRemove={removeLine} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className={s.rail}>
          <section className={s.railCard}>
            <h2 className={s.railTitle}>Audit outcomes</h2>
            <div className={s.outcome}>
              <div className={s.outcomeRow}>
                <span><Icon name="icon-shield-check" className={s.txBlue} /> Traceability captured</span>
                <strong>{tracePct}%</strong>
              </div>
              <div className={s.progress}>
                <span className={s.progressTrack}><span className={s.progressFill} style={{ width: `${tracePct}%` }} /></span>
              </div>
              <small className={s.muted}>{traced} of {counts.scanned} items carry lot &amp; expiry</small>
            </div>
            <div className={s.outcomeRow}>
              <span><Icon name="icon-clock" className={s.txAmber} /> Expiring within 30 days</span>
              <strong className={expiringSoon ? s.txAmber : ""}>{expiringSoon}</strong>
            </div>
            <div className={s.outcomeRow}>
              <span><Icon name="icon-alert-triangle" className={s.txRed} /> Need your review</span>
              <strong className={counts.needs_review ? s.txRed : ""}>{counts.needs_review}</strong>
            </div>
          </section>

          <section className={s.railCard}>
            <h2 className={s.railTitle}>How it flows</h2>
            <ul className={s.steps}>
              <li><span className={`${s.stepDot} ${s.txGreen}`}><Icon name="icon-check-circle" /></span> Identified + lot/expiry → confirmed &amp; added to inventory</li>
              <li><span className={`${s.stepDot} ${s.txAmber}`}><Icon name="icon-clock" /></span> Identified, missing lot/expiry → add details</li>
              <li><span className={`${s.stepDot} ${s.txRed}`}><Icon name="icon-alert-triangle" /></span> Not in the catalog → link a product</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function FlashCard({ flash, inline }) {
  const bucket = SCAN_BUCKETS[flash.status] || SCAN_BUCKETS.needs_review;
  const expiry = flash.expiration_date;
  const lot = flash.lot_number;
  return (
    <div className={`${s.flash} ${inline ? s.flashInline : ""} ${TONE_TX[bucket.tone] || ""}`} role="status" aria-live="polite">
      <Icon name={bucket.icon} />
      <div className={s.flashBody}>
        <strong>{flash.name}</strong>
        <small>{expiry ? `Exp ${formatTraceDate(expiry)}${lot ? ` · Lot ${lot}` : ""}` : bucket.label}</small>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, tone }) {
  return (
    <button type="button" className={`${s.chip} ${active ? s.chipActive : ""} ${tone ? s[`chip_${tone}`] : ""}`} onClick={onClick}>
      {label} <span className={s.chipCount}>{count || 0}</span>
    </button>
  );
}

function SessionLine({ line, editable, onPatch, onRemove }) {
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const bucket = SCAN_BUCKETS[line.status] || SCAN_BUCKETS.needs_review;
  const expDays = daysUntil(line.expiration_date);
  const expTone = expDays != null && expDays <= 0 ? s.txRed : expDays != null && expDays <= 30 ? s.txAmber : s.muted;

  return (
    <div className={`${s.line} ${open ? s.lineOpen : ""}`}>
      <div className={s.lineMain}>
        <span className={s.lineThumb}>
          {line.image_url ? <img src={line.image_url} alt="" loading="lazy" /> : <Icon name={bucket.icon} />}
        </span>
        <div className={s.lineBody}>
          <strong className={s.lineName}>{line.name}</strong>
          <div className={s.lineMeta}>
            <span>Qty {line.quantity}</span>
            {line.lot_number && <span>· Lot {line.lot_number}</span>}
            {line.expiration_date && <span className={expTone}>· Exp {formatTraceDate(line.expiration_date)}</span>}
            {line.shelf_area && <span>· {line.shelf_area}</span>}
          </div>
        </div>
        <span className={`${s.linePill} ${TONE_TX[bucket.tone] || ""}`}><Icon name={bucket.icon} /> {bucket.label}</span>
      </div>

      {editable && (
        <div className={s.lineActions}>
          {line.status === "needs_review" ? (
            <button type="button" className={s.lineBtnPrimary} onClick={() => setLinking((v) => !v)}>
              <Icon name="icon-link" /> Link a product
            </button>
          ) : (
            <button type="button" className={s.lineBtn} onClick={() => setOpen((v) => !v)}>
              <Icon name="icon-edit" /> {line.status === "needs_details" ? "Add details" : "Edit"}
            </button>
          )}
          <button type="button" className={s.lineBtnGhost} onClick={() => onRemove(line.id)} aria-label="Remove item"><Icon name="icon-trash" /></button>
        </div>
      )}

      {open && editable && <CaptureForm line={line} onSave={(body) => { onPatch(line.id, body); setOpen(false); }} onCancel={() => setOpen(false)} />}
      {linking && editable && <LinkProduct onPick={(body) => { onPatch(line.id, body); setLinking(false); }} onCancel={() => setLinking(false)} />}
    </div>
  );
}

function CaptureForm({ line, onSave, onCancel }) {
  const [qty, setQty] = useState(line.quantity || 1);
  const [lot, setLot] = useState(line.lot_number || "");
  const [exp, setExp] = useState(line.expiration_date ? String(line.expiration_date).slice(0, 10) : "");
  const [shelf, setShelf] = useState(line.shelf_area || "");
  const [condition, setCondition] = useState(line.package_condition || "good");

  function save(e) {
    e.preventDefault();
    onSave({
      quantity: Number(qty) || 1,
      lot_number: lot.trim() || null,
      expiration_date: exp || null,
      shelf_area: shelf.trim() || null,
      package_condition: condition,
    });
  }

  return (
    <form className={s.capture} onSubmit={save}>
      <div className={s.captureGrid}>
        <label className={s.field}><span>Quantity</span><input type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} /></label>
        <label className={s.field}><span>Lot number</span><input value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. 13593092" /></label>
        <label className={s.field}><span>Expiration</span><input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></label>
        <label className={s.field}><span>Shelf / area</span><input value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="e.g. Top shelf" /></label>
        <label className={s.field}>
          <span>Package condition</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="good">Good</option>
            <option value="damaged">Damaged</option>
            <option value="missing">Missing</option>
          </select>
        </label>
      </div>
      <div className={s.captureFoot}>
        <button type="button" className={s.ghostBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={s.lookupBtn}><Icon name="icon-check" /> Save details</button>
      </div>
    </form>
  );
}

function LinkProduct({ onPick, onCancel }) {
  const { query, setQuery, results, loading } = useProductSearch(true);

  function pick(product) {
    const best = product.best_offer || product.offers?.[0] || null;
    const id = product.id || "";
    onPick({
      canonical_product_id: id.startsWith("mcp") ? id : null,
      supplier_product_id: best?.supplier_product_id || (id.startsWith("msp") ? id : null),
      name: product.name,
      image_url: product.image_url || best?.image_url || "",
    });
  }

  return (
    <div className={s.linkPanel}>
      <label className={s.manualField}>
        <Icon name="icon-search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the catalog to identify this item…" aria-label="Search products" autoFocus />
      </label>
      <ProductSearchResults query={query} results={results} loading={loading} onPick={pick} emptyHint="Type a product name to link it." />
      <button type="button" className={s.ghostBtn} onClick={onCancel}>Cancel</button>
    </div>
  );
}
