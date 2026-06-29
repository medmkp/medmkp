"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLogoMark, Icon } from "./icons";
import { DOC_TYPES, EVIDENCE_MOCK } from "./evidence";
import s from "./evidenceviewer.module.css";

const STATUS_META = {
  verified: { label: "Verified", icon: "icon-check-circle", tone: s.tOk },
  partial: { label: "Partial", icon: "icon-clock", tone: s.tWarn },
  missing: { label: "Missing", icon: "icon-x-circle", tone: s.tBad },
};

// Worst-status-wins so a type with any gap reads honestly. captured (present but
// not review-required) folds into verified — it's on file.
const STATUS_RANK = { verified: 0, captured: 0, partial: 1, missing: 2 };
const STATUS_KEY = { verified: "verified", captured: "verified", partial: "partial", missing: "missing" };

const slug = (str) =>
  String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// A document has a file to open unless it's a known gap (fileType "none").
const isOpenable = (doc) => doc.fileType && doc.fileType !== "none";

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

function activityTime(at) {
  const t = Date.parse(String(at).replace(" · ", " "));
  return Number.isNaN(t) ? 0 : t;
}

// Status section, derived per context: one row per document type present, each
// showing the worst status across that type's documents in this context.
function deriveStatusRows(docs) {
  const order = ["sds", "ifu", "expiration", "lot", "service", "price", "waterline"];
  const byType = {};
  for (const doc of docs) (byType[doc.type] ||= []).push(doc);
  return order
    .filter((type) => byType[type])
    .map((type) => {
      const worst = byType[type].reduce(
        (acc, doc) => (STATUS_RANK[doc.status] > STATUS_RANK[acc.status] ? doc : acc),
        byType[type][0],
      );
      return { key: type, label: DOC_TYPES[type].label, status: STATUS_KEY[worst.status] || "partial", icon: DOC_TYPES[type].icon };
    });
}

// Recent activity flattened across this context's documents, newest first.
function deriveActivity(docs) {
  return docs
    .flatMap((doc) => (doc.activity || []).map((entry) => ({ ...entry, docId: doc.id })))
    .sort((a, b) => activityTime(b.at) - activityTime(a.at))
    .slice(0, 5);
}

// Resolve a context descriptor ({ location, item, doc } from the URL) against the
// evidence data into a view-model the read-only shell renders. A document/location/
// item id that matches nothing returns notFound so the shell shows a non-crashing
// not-found state instead of an empty page with a misleading title.
export function resolveEvidenceContext(data, context) {
  const documents = data.documents || [];

  // Single document.
  if (context?.doc) {
    const doc = documents.find((d) => d.id === context.doc);
    if (!doc) return { notFound: true, kind: "document", id: context.doc };
    const name = doc.detailItem || doc.linkedItem || "Document";
    return {
      kind: "document",
      title: `${name} document`,
      subtitle: "Single document · Read-only presentation mode",
      card: {
        icon: fileIcon(doc),
        heading: doc.fileName,
        kicker: "Document type",
        value: DOC_TYPES[doc.type]?.label || "Document",
        metaIcon: "icon-link",
        metaKicker: "Linked item",
        metaValue: doc.linkedItem || "—",
      },
      docs: [doc],
    };
  }

  // Inventory item / lot — matched by SKU or item name.
  if (context?.item) {
    const want = slug(context.item);
    const docs = documents.filter(
      (d) => slug(d.sku) === want || slug(d.linkedItem) === want || slug(d.detailItem) === want,
    );
    if (!docs.length) return { notFound: true, kind: "item", id: context.item };
    const first = docs[0];
    const name = first.detailItem || first.linkedItem;
    return {
      kind: "item",
      title: `${name} evidence`,
      subtitle: "Item / lot evidence · Read-only presentation mode",
      card: {
        icon: "icon-package",
        heading: name,
        kicker: "SKU / lot",
        value: first.sku && first.sku !== "—" ? first.sku : "No lot on file",
        metaIcon: "icon-tag",
        metaKicker: "Category",
        metaValue: first.category || "—",
      },
      docs,
    };
  }

  // Single location.
  if (context?.location) {
    const want = slug(context.location);
    const docs = documents.filter((d) => slug(d.location) === want);
    if (!docs.length) return { notFound: true, kind: "location", id: context.location };
    const name = docs[0].location;
    return {
      kind: "location",
      title: `${name} evidence`,
      subtitle: "Location evidence · Read-only presentation mode",
      card: {
        icon: "icon-cabinet",
        heading: name,
        kicker: "Location",
        value: "Practice location",
        metaIcon: "icon-folder",
        metaKicker: "Files on file",
        metaValue: String(docs.filter(isOpenable).length),
      },
      docs,
    };
  }

  // Whole practice (no context params).
  return {
    kind: "all",
    title: `${data.practiceName} evidence`,
    subtitle: "All-practice evidence · Read-only presentation mode",
    card: {
      icon: "icon-building",
      heading: data.practiceName,
      kicker: "Scope",
      value: "All practice locations",
      metaIcon: "icon-folder",
      metaKicker: "Documents on file",
      metaValue: String(documents.filter(isOpenable).length),
    },
    docs: documents,
  };
}

export function EvidenceMobileViewer({ data = EVIDENCE_MOCK, context = null, onBack }) {
  const view = resolveEvidenceContext(data, context);
  const [sheetOpen, setSheetOpen] = useState(false);
  const filesRef = useRef(null);

  function scrollToFiles() {
    filesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (view.notFound) {
    return (
      <section className={s.screen} aria-label="Evidence not found">
        <ViewerTopbar onBack={onBack} />
        <div className={s.notFound}>
          <span className={s.notFoundIcon}><Icon name="icon-alert-triangle" /></span>
          <h1>Evidence not found</h1>
          <p>
            We couldn&rsquo;t find {NOT_FOUND_NOUN[view.kind]} for{" "}
            <strong>{view.id}</strong>. It may have been moved, or the link is out of date.
          </p>
          <button type="button" className={s.notFoundBtn} onClick={onBack}>
            <Icon name="icon-chevron-left" />Back to Evidence Library
          </button>
        </div>
      </section>
    );
  }

  const openDocs = view.docs.filter(isOpenable);
  const statusRows = deriveStatusRows(view.docs);
  const activity = deriveActivity(view.docs);

  return (
    <section className={s.screen} aria-label={`${view.card.heading} evidence viewer`}>
      <ViewerTopbar onBack={onBack} />

      <main className={s.body}>
        <div className={s.hero}>
          <h1>{view.title}</h1>
          <p>{view.subtitle}</p>
        </div>

        <section className={s.contextCard} aria-label="Evidence context">
          <div className={s.contextIcon}><Icon name={view.card.icon} /></div>
          <div className={s.contextMain}>
            <h2>{view.card.heading}</h2>
            <span className={s.kicker}>{view.card.kicker}</span>
            <strong>{view.card.value}</strong>
            <span className={s.qrPill}><Icon name="icon-eye" />Read-only view</span>
          </div>
          <div className={s.auditBlock}>
            <span className={s.auditIcon}><Icon name={view.card.metaIcon} /></span>
            <span className={s.kicker}>{view.card.metaKicker}</span>
            <strong>{view.card.metaValue}</strong>
          </div>
        </section>

        {statusRows.length > 0 && (
          <EvidenceSection title="Evidence status">
            <div className={s.listCard}>
              {statusRows.map((row) => (
                <div className={s.statusRow} key={row.key}>
                  <span className={s.rowIcon}><Icon name={row.icon} /></span>
                  <span className={s.rowLabel}>{row.label}</span>
                  <span className={`${s.statusValue} ${STATUS_META[row.status].tone}`}>
                    <Icon name={STATUS_META[row.status].icon} />
                    {STATUS_META[row.status].label}
                  </span>
                </div>
              ))}
            </div>
          </EvidenceSection>
        )}

        <EvidenceSection title="Open files" anchorRef={filesRef}>
          {openDocs.length > 0 ? (
            <div className={s.listCard}>
              {openDocs.map((doc) => {
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
            <div className={s.emptyCard}>
              <span className={s.emptyIcon}><Icon name="icon-folder" /></span>
              <strong>No files to open yet</strong>
              <span>No documents have been captured for this context. The evidence status above shows what&rsquo;s still missing.</span>
            </div>
          )}
        </EvidenceSection>

        {activity.length > 0 && (
          <EvidenceSection title="Evidence activity">
            <ol className={s.activityCard}>
              {activity.map((item, i) => (
                <li key={`${item.docId}-${i}`}>
                  <span className={s.activityDot} aria-hidden="true" />
                  <span className={s.activityTitle}>{item.title}</span>
                  <time>{item.at}</time>
                </li>
              ))}
            </ol>
          </EvidenceSection>
        )}
      </main>

      <footer className={s.footer}>
        <button type="button" className={s.footerGhost} onClick={scrollToFiles} disabled={openDocs.length === 0}>
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

      {sheetOpen && <ShareSheet heading={view.card.heading} onClose={() => setSheetOpen(false)} />}
    </section>
  );
}

const NOT_FOUND_NOUN = {
  document: "a document",
  item: "an item or lot",
  location: "a location",
};

function ViewerTopbar({ onBack }) {
  return (
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
function ShareSheet({ heading, onClose }) {
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
      await navigator.share({ title: `${heading} Evidence`, url: shareUrl });
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
