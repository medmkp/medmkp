"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLogoMark, Icon } from "./icons";
import { DOC_TYPES, EVIDENCE_MOCK } from "./evidence";
import s from "./evidenceviewer.module.css";

const LOCATION_NAME = "Hygiene Cabinet";

const STATUS_ROWS = [
  { key: "sds", label: "SDS linked", status: "verified", icon: "icon-file-text" },
  { key: "ifu", label: "IFU linked", status: "verified", icon: "icon-book" },
  { key: "expiration", label: "Expiration proof", status: "partial", icon: "icon-calendar" },
  { key: "lot", label: "Lot capture", status: "missing", icon: "icon-package" },
  { key: "audit", label: "Last shelf audit", value: "May 16, 2026", icon: "icon-calendar" },
];

const STATUS_META = {
  verified: { label: "Verified", icon: "icon-check-circle", tone: s.tOk },
  partial: { label: "Partial", icon: "icon-clock", tone: s.tWarn },
  missing: { label: "Missing", icon: "icon-x-circle", tone: s.tBad },
};

const ACTIVITY = [
  { title: "Shelf scan completed, evidence created", at: "May 16, 2026 at 9:15 AM" },
  { title: "Document uploaded, auto-detected as SDS", at: "May 16, 2026 at 9:16 AM" },
  { title: "Match reviewed, evidence linked", at: "May 16, 2026 at 9:18 AM" },
];

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

export function EvidenceMobileViewer({ data = EVIDENCE_MOCK, onBack }) {
  const docs = data.documents
    .filter((doc) => doc.location === LOCATION_NAME || ["doc_1", "doc_2", "doc_4", "doc_6"].includes(doc.id))
    .slice(0, 4);

  const [sheetOpen, setSheetOpen] = useState(false);
  const filesRef = useRef(null);

  function scrollToFiles() {
    filesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className={s.screen} aria-label={`${LOCATION_NAME} evidence viewer`}>
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
          <h1>{LOCATION_NAME} Evidence</h1>
          <p>Read-only presentation mode</p>
        </div>

        <section className={s.contextCard} aria-label="Location context">
          <div className={s.contextIcon}><Icon name="icon-cabinet" /></div>
          <div className={s.contextMain}>
            <h2>{LOCATION_NAME}</h2>
            <span className={s.kicker}>Location type</span>
            <strong>Cabinet</strong>
            <span className={s.qrPill}><Icon name="icon-scan" />Opened from QR label</span>
          </div>
          <div className={s.auditBlock}>
            <span className={s.auditIcon}><Icon name="icon-calendar" /></span>
            <span className={s.kicker}>Last shelf audit</span>
            <strong>May 16, 2026</strong>
          </div>
        </section>

        <EvidenceSection title="Evidence status">
          <div className={s.listCard}>
            {STATUS_ROWS.map((row) => (
              <div className={s.statusRow} key={row.key}>
                <span className={s.rowIcon}><Icon name={row.icon} /></span>
                <span className={s.rowLabel}>{row.label}</span>
                {row.status ? (
                  <span className={`${s.statusValue} ${STATUS_META[row.status].tone}`}>
                    <Icon name={STATUS_META[row.status].icon} />
                    {STATUS_META[row.status].label}
                  </span>
                ) : (
                  <span className={s.dateValue}>{row.value}</span>
                )}
              </div>
            ))}
          </div>
        </EvidenceSection>

        <EvidenceSection title="Open files" anchorRef={filesRef}>
          <div className={s.listCard}>
            {docs.map((doc) => {
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
        </EvidenceSection>

        <EvidenceSection title="Evidence activity">
          <ol className={s.activityCard}>
            {ACTIVITY.map((item) => (
              <li key={item.title}>
                <span className={s.activityDot} aria-hidden="true" />
                <span className={s.activityTitle}>{item.title}</span>
                <time>{item.at}</time>
              </li>
            ))}
          </ol>
        </EvidenceSection>
      </main>

      <footer className={s.footer}>
        <button type="button" className={s.footerGhost} onClick={scrollToFiles}>
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

      {sheetOpen && <ShareSheet location={LOCATION_NAME} onClose={() => setSheetOpen(false)} />}
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
function ShareSheet({ location, onClose }) {
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
      await navigator.share({ title: `${location} Evidence`, url: shareUrl });
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
