"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const [shareOpen, setShareOpen] = useState(false);
  const filesRef = useRef(null);

  const openFiles = useCallback(() => {
    filesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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

      <footer className={s.actionBar}>
        <button type="button" className={s.actionGhost} onClick={openFiles}>
          <Icon name="icon-folder" />Open files
        </button>
        <button type="button" className={s.actionPrimary} onClick={() => setShareOpen(true)}>
          <Icon name="icon-archive-down" />Export evidence
        </button>
      </footer>

      {shareOpen && (
        <ShareSheet locationName={LOCATION_NAME} onClose={() => setShareOpen(false)} />
      )}
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

// Read-only share/export bottom sheet. Every action is a presentation/export
// path (copy link, OS share, print/save-as-PDF) — none of them write to an
// evidence record. Browser capabilities are feature-detected at open time and
// degrade to a clear disabled state where unsupported.
function ShareSheet({ locationName, onClose }) {
  const [shareUrl, setShareUrl] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [canCopy, setCanCopy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined") setShareUrl(window.location.href);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    setCanCopy(
      typeof navigator !== "undefined" &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function",
    );
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [onClose]);

  const shareTitle = `${locationName} — Evidence`;

  async function copyLink() {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      /* user denied clipboard — leave the row idle, no record is touched */
    }
  }

  async function shareLink() {
    if (!canShare) return;
    try {
      await navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl });
    } catch {
      /* dismissed share sheet — nothing to do */
    }
  }

  function printView() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div className={s.sheetRoot} role="dialog" aria-modal="true" aria-label="Share evidence">
      <div className={s.sheetBackdrop} onClick={onClose} />
      <div className={s.sheet}>
        <span className={s.sheetGrip} aria-hidden="true" />
        <header className={s.sheetHead}>
          <div>
            <h2>Share evidence</h2>
            <p>Read-only — nothing about this record is changed.</p>
          </div>
          <button type="button" className={s.sheetClose} aria-label="Close" onClick={onClose}>
            <Icon name="icon-x" />
          </button>
        </header>

        <div className={s.sheetActions}>
          <SheetAction
            icon={copied ? "icon-check" : "icon-link"}
            label={copied ? "Link copied" : "Copy link"}
            hint={canCopy ? "Copy this presentation link" : "Clipboard unavailable in this browser"}
            done={copied}
            disabled={!canCopy}
            onClick={copyLink}
          />
          <SheetAction
            icon="icon-share"
            label="Share…"
            hint={canShare ? "Send via your device's share menu" : "Not supported on this device"}
            disabled={!canShare}
            onClick={shareLink}
          />
          <SheetAction
            icon="icon-printer"
            label="Print / Save as PDF"
            hint="Open the print dialog"
            onClick={printView}
          />
        </div>
      </div>
    </div>
  );
}

function SheetAction({ icon, label, hint, onClick, disabled = false, done = false }) {
  return (
    <button
      type="button"
      className={`${s.sheetRow} ${done ? s.sheetRowDone : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={s.sheetRowIcon}><Icon name={icon} /></span>
      <span className={s.sheetRowText}>
        <span className={s.sheetRowLabel}>{label}</span>
        <span className={s.sheetRowHint}>{hint}</span>
      </span>
      {disabled ? (
        <span className={s.sheetRowTag}>Unavailable</span>
      ) : (
        <Icon name="icon-chevron-right" />
      )}
    </button>
  );
}
