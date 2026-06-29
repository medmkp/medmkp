"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLogoMark, Icon } from "./icons";
import { DOC_TYPES, EVIDENCE_MOCK } from "./evidence";
import s from "./evidenceviewer.module.css";

// Read-only on-site presentation mode (mobile). One viewer, four contexts —
// driven entirely by the query params parsed in lib.jsx → `context`:
//   • whole-practice  — no params
//   • location        — ?location=<name>
//   • tracked item    — ?item=<name>   (optionally narrowed with ?lot=<ref>)
//   • single document — ?doc=<id>
// Every context resolves to the same calm read-only shell. Unknown ids never
// crash: a missing document id shows a not-found state, and a context with no
// matching evidence shows an honest empty state. Nothing here mutates.

const STATUS_META = {
  verified: { label: "Verified", icon: "icon-check-circle", tone: s.tOk },
  partial: { label: "Partial", icon: "icon-clock", tone: s.tWarn },
  captured: { label: "Captured", icon: "icon-info", tone: s.tInfo },
  missing: { label: "Missing", icon: "icon-x-circle", tone: s.tBad },
};

function fileIcon(doc) {
  if (doc.fileType === "image") return "icon-file-img";
  if (doc.format === "DOCX") return "icon-file-doc";
  if (doc.format === "XLSX") return "icon-file-xls";
  if (doc.fileType === "pdf") return "icon-file-pdf";
  return "icon-file-generic";
}

function fileFormat(doc) {
  if (doc.format && doc.format !== "—") return doc.format;
  if (doc.fileType === "image") return "JPG";
  if (doc.fileType === "pdf") return "PDF";
  return "File";
}

// A document is "viewable" once it has a real file behind it — missing-proof
// rows are gaps, not files, so they never appear in the Open files list.
const isFile = (doc) => doc.fileType && doc.fileType !== "none";
const matchesItem = (doc, name) =>
  !!name && (doc.linkedItem === name || doc.detailItem === name);
const lastActivity = (doc) => doc.activity?.[doc.activity.length - 1] || null;

// Map a list of documents to the "Evidence activity" feed (most-recent entry
// per document), and to per-document status rows.
function docActivity(docs) {
  return docs
    .map((doc) => {
      const a = lastActivity(doc);
      return a ? { title: `${doc.fileName} — ${a.title}`, at: a.at } : null;
    })
    .filter(Boolean)
    .slice(0, 5);
}

function docStatusRows(docs) {
  return docs.map((doc) => ({
    key: doc.id,
    icon: DOC_TYPES[doc.type]?.icon || "icon-file-generic",
    label: DOC_TYPES[doc.type]?.label || "Document",
    status: doc.status,
  }));
}

// Resolve the parsed query params into a single view model. Pure — no I/O, so a
// bad id just yields { notFound } / { empty } and the shell renders that calmly.
function buildViewerContext(data, context) {
  const ctx = context || {};

  // ── Single document ──────────────────────────────────────────────
  if (ctx.doc) {
    const doc = data.documents.find((d) => d.id === ctx.doc);
    if (!doc) {
      return {
        title: "Document not found",
        notFound: { kind: "document", id: ctx.doc },
      };
    }
    const meta = DOC_TYPES[doc.type] || {};
    return {
      title: doc.fileName,
      subtitle: "Read-only presentation mode",
      shareLabel: doc.fileName,
      card: {
        icon: fileIcon(doc),
        name: doc.detailItem || doc.linkedItem || meta.label,
        kicker: meta.label || "Document",
        value: doc.location ? `${doc.location}` : "Not linked to a location",
        pill: { icon: "icon-scan", text: doc.source },
        aside: { kicker: "Last updated", value: doc.updatedAt },
      },
      statusTitle: "Document status",
      statusRows: [
        { key: "status", icon: meta.icon || "icon-file-generic", label: "Review status", status: doc.status },
        { key: "format", icon: "icon-file-text", label: "File type", text: fileFormat(doc) },
        { key: "expiration", icon: "icon-calendar", label: "Expiration", text: doc.expiration || "—" },
        { key: "review", icon: "icon-clock", label: "Review schedule", text: doc.reviewSchedule || "—" },
      ],
      files: isFile(doc) ? [doc] : [],
      activity: (doc.activity || []).map((a) => ({ title: a.title, at: a.at })),
    };
  }

  // ── Tracked item / lot ───────────────────────────────────────────
  if (ctx.item || ctx.lot) {
    const name = ctx.item || ctx.lot;
    const isLot = !!ctx.lot;
    let docs = data.documents.filter((d) => matchesItem(d, name));
    if (isLot) docs = docs.filter((d) => d.type === "lot" || d.type === "expiration");
    const category = docs.find((d) => d.category)?.category;
    const base = {
      title: `${name} Evidence`,
      subtitle: "Read-only presentation mode",
      shareLabel: name,
      card: {
        icon: isLot ? "icon-tag" : "icon-package",
        name,
        kicker: isLot ? "Lot / UDI record" : "Tracked item",
        value: ctx.lot && ctx.item ? `Lot ${ctx.lot}` : category || "Inventory item",
        aside: { kicker: "Documents", value: String(docs.length) },
      },
    };
    if (!docs.length) {
      return {
        ...base,
        empty: {
          icon: isLot ? "icon-tag" : "icon-package",
          title: isLot ? "No lot or expiry evidence yet" : "No evidence linked yet",
          body: `Nothing is on file for ${name}. Capture it from a shelf scan and it appears here.`,
        },
      };
    }
    return {
      ...base,
      statusTitle: "Evidence status",
      statusRows: docStatusRows(docs),
      files: docs.filter(isFile),
      activity: docActivity(docs),
    };
  }

  // ── Location ─────────────────────────────────────────────────────
  if (ctx.location) {
    const loc = ctx.location;
    const docs = data.documents.filter((d) => d.location === loc);
    const base = {
      title: `${loc} Evidence`,
      subtitle: "Read-only presentation mode",
      shareLabel: loc,
      card: {
        icon: "icon-cabinet",
        name: loc,
        kicker: "Location",
        value: "On-site location",
        pill: { icon: "icon-scan", text: "Opened from QR label" },
        aside: { kicker: "Documents", value: String(docs.length) },
      },
    };
    if (!docs.length) {
      return {
        ...base,
        empty: {
          icon: "icon-map-pin",
          title: "No evidence at this location yet",
          body: `Nothing is linked to ${loc}. Run a shelf audit here and captured evidence shows up automatically.`,
        },
      };
    }
    return {
      ...base,
      statusTitle: "Evidence status",
      statusRows: docStatusRows(docs),
      files: docs.filter(isFile),
      activity: docActivity(docs),
    };
  }

  // ── Whole practice (default) ─────────────────────────────────────
  const docs = data.documents;
  return {
    title: `${data.practiceName} Evidence`,
    subtitle: "Read-only presentation mode",
    shareLabel: data.practiceName,
    card: {
      icon: "icon-building",
      name: data.practiceName,
      kicker: "Scope",
      value: "All-practice evidence",
      aside: { kicker: "Locations", value: String(data.stats.locations) },
    },
    statusTitle: "Coverage by type",
    statusRows: data.coverageSnapshot.map((row) => ({
      key: row.type,
      icon: DOC_TYPES[row.type]?.icon || "icon-file-generic",
      label: row.label,
      metric: `${row.covered} / ${row.total}`,
      tone: row.tone === "warn" ? s.tWarn : s.tOk,
    })),
    files: docs.filter(isFile).slice(0, 6),
    activity: data.recent.map((r) => ({ title: `${r.fileName} — ${r.sub}`, at: r.ago })),
  };
}

export function EvidenceMobileViewer({ data = EVIDENCE_MOCK, context = null, onBack }) {
  const vm = buildViewerContext(data, context);
  const [sheetOpen, setSheetOpen] = useState(false);
  const filesRef = useRef(null);

  function scrollToFiles() {
    filesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const isResolved = !vm.empty && !vm.notFound;
  const hasFiles = isResolved && vm.files.length > 0;

  return (
    <section className={s.screen} aria-label={`${vm.title} evidence viewer`}>
      <header className={s.topbar}>
        <button type="button" className={s.backBtn} onClick={onBack} aria-label="Back to Evidence Library">
          <Icon name="icon-chevron-left" />
        </button>
        <div className={s.brand} aria-label="TraceDDS">
          <BrandLogoMark className={s.brandMark} />
          <span>TraceDDS</span>
        </div>
        <span className={s.topSpacer} aria-hidden="true" />
      </header>

      <main className={s.body}>
        <div className={s.hero}>
          <h1>{vm.title}</h1>
          <p>{vm.subtitle || "Read-only presentation mode"}</p>
        </div>

        {vm.notFound && (
          <EmptyCard
            icon="icon-alert-triangle"
            title="We couldn't find that document"
            body={`No evidence record matches “${vm.notFound.id}”. It may have been removed, or the link is out of date.`}
          />
        )}

        {vm.empty && <EmptyCard icon={vm.empty.icon} title={vm.empty.title} body={vm.empty.body} />}

        {isResolved && (
          <>
            <section className={s.contextCard} aria-label="Context">
              <div className={s.contextIcon}><Icon name={vm.card.icon} /></div>
              <div className={s.contextMain}>
                <h2>{vm.card.name}</h2>
                <span className={s.kicker}>{vm.card.kicker}</span>
                <strong>{vm.card.value}</strong>
                {vm.card.pill && (
                  <span className={s.qrPill}><Icon name={vm.card.pill.icon} />{vm.card.pill.text}</span>
                )}
              </div>
              {vm.card.aside && (
                <div className={s.auditBlock}>
                  <span className={s.kicker}>{vm.card.aside.kicker}</span>
                  <strong>{vm.card.aside.value}</strong>
                </div>
              )}
            </section>

            <EvidenceSection title={vm.statusTitle}>
              <div className={s.listCard}>
                {vm.statusRows.map((row) => (
                  <div className={s.statusRow} key={row.key}>
                    <span className={s.rowIcon}><Icon name={row.icon} /></span>
                    <span className={s.rowLabel}>{row.label}</span>
                    {row.status ? (
                      <span className={`${s.statusValue} ${STATUS_META[row.status].tone}`}>
                        <Icon name={STATUS_META[row.status].icon} />
                        {STATUS_META[row.status].label}
                      </span>
                    ) : row.metric ? (
                      <span className={`${s.statusValue} ${row.tone}`}>{row.metric}</span>
                    ) : (
                      <span className={s.dateValue}>{row.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </EvidenceSection>

            <EvidenceSection title="Open files" anchorRef={filesRef}>
              {hasFiles ? (
                <div className={s.listCard}>
                  {vm.files.map((doc) => {
                    const meta = DOC_TYPES[doc.type];
                    return (
                      <article className={s.fileRow} key={doc.id} aria-label={`${doc.fileName}, ${meta.badge}`}>
                        <span className={s.fileIcon}><Icon name={fileIcon(doc)} /></span>
                        <span className={s.fileName}>{doc.fileName}</span>
                        <span className={s.fileType}>{fileFormat(doc)}</span>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className={s.inlineEmpty}>No files attached in this context yet.</p>
              )}
            </EvidenceSection>

            {vm.activity.length > 0 && (
              <EvidenceSection title="Evidence activity">
                <ol className={s.activityCard}>
                  {vm.activity.map((item, i) => (
                    <li key={`${item.title}-${i}`}>
                      <span className={s.activityDot} aria-hidden="true" />
                      <span className={s.activityTitle}>{item.title}</span>
                      <time>{item.at}</time>
                    </li>
                  ))}
                </ol>
              </EvidenceSection>
            )}
          </>
        )}
      </main>

      {isResolved ? (
        <footer className={s.footer}>
          <button type="button" className={s.footerGhost} onClick={scrollToFiles} disabled={!hasFiles}>
            <Icon name="icon-folder" />Open files
          </button>
          <button
            type="button"
            className={s.footerPrimary}
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
          >
            <Icon name="icon-archive-down" />Export evidence
          </button>
        </footer>
      ) : (
        <footer className={s.footer}>
          <button type="button" className={`${s.footerPrimary} ${s.footerWide}`} onClick={onBack}>
            <Icon name="icon-chevron-left" />Back to evidence library
          </button>
        </footer>
      )}

      {sheetOpen && <ShareSheet label={vm.shareLabel} onClose={() => setSheetOpen(false)} />}
    </section>
  );
}

function EmptyCard({ icon, title, body }) {
  return (
    <section className={s.emptyCard}>
      <span className={s.emptyIcon}><Icon name={icon} /></span>
      <h2>{title}</h2>
      <p>{body}</p>
    </section>
  );
}

function EvidenceSection({ title, children, anchorRef }) {
  return (
    <section className={s.section} ref={anchorRef}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// Read-only share/export sheet. Every action is non-mutating — copy the
// presentation URL, hand off to the OS share sheet, or print/save as PDF.
// Capabilities are feature-detected after mount (SSR-safe) so unsupported
// browsers show a clear disabled "Unavailable" state instead of a dead button.
function ShareSheet({ label, onClose }) {
  const [caps, setCaps] = useState({ clipboard: false, share: false, print: false });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCaps({
      clipboard: typeof navigator !== "undefined" && !!navigator.clipboard?.writeText,
      share: typeof navigator !== "undefined" && typeof navigator.share === "function",
      print: typeof window !== "undefined" && typeof window.print === "function",
    });
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  async function copyLink() {
    if (!caps.clipboard) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (!caps.share) return;
    try {
      await navigator.share({ title: `${label} Evidence`, url: shareUrl });
    } catch {
      /* user cancelled or share failed — read-only, nothing to undo */
    }
  }

  function print() {
    if (caps.print) window.print();
  }

  return (
    <div className={s.sheetRoot} role="dialog" aria-modal="true" aria-label="Share or export evidence">
      <div className={s.sheetBackdrop} onClick={onClose} />
      <div className={s.sheet}>
        <span className={s.sheetGrip} aria-hidden="true" />
        <div className={s.sheetHead}>
          <strong>Share &amp; export</strong>
          <button type="button" className={s.sheetClose} onClick={onClose} aria-label="Close">
            <Icon name="icon-x" />
          </button>
        </div>
        <p className={s.sheetNote}>Read-only — nothing here changes the evidence record.</p>

        <div className={s.sheetActions}>
          <ShareRow
            icon={copied ? "icon-check-circle" : "icon-copy"}
            label={copied ? "Link copied" : "Copy link"}
            sub="Direct link to this presentation view"
            enabled={caps.clipboard}
            done={copied}
            onClick={copyLink}
          />
          <ShareRow
            icon="icon-share"
            label="Share…"
            sub="Open your device share options"
            enabled={caps.share}
            unavailableLabel="Not on this browser"
            onClick={share}
          />
          <ShareRow
            icon="icon-printer"
            label="Print / Save as PDF"
            sub="Print this evidence summary"
            enabled={caps.print}
            onClick={print}
          />
        </div>
      </div>
    </div>
  );
}

function ShareRow({ icon, label, sub, enabled, done, unavailableLabel = "Unavailable", onClick }) {
  return (
    <button
      type="button"
      className={s.shareRow}
      onClick={onClick}
      disabled={!enabled}
      data-done={done ? "true" : undefined}
    >
      <span className={s.shareIcon}><Icon name={icon} /></span>
      <span className={s.shareText}>
        <span className={s.shareLabel}>{label}</span>
        <span className={s.shareSub}>{sub}</span>
      </span>
      {enabled ? (
        <span className={s.shareChevron}><Icon name="icon-chevron-right" /></span>
      ) : (
        <span className={s.shareTag}>{unavailableLabel}</span>
      )}
    </button>
  );
}
