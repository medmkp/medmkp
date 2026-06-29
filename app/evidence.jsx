"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import s from "./evidence.module.css";

// Phase 3 — Evidence / Compliance (the differentiator). The system-of-record
// surface: the compliance documents a dental practice has to produce when an
// inspector walks in (SDS for hazardous chemicals, IFU for devices,
// lot/expiration proof off the physical package, sterilization/service records,
// pricing evidence) — tracked, gap-checked, and linked to inventory.
//
// FE-first slice: everything renders off the MOCK below. Real capture lands when
// object storage (Supabase) + document-AI are wired; each record carries a
// `storageKey` so the mock maps 1:1 onto the future medmkp_evidence_document row
// (storageKey -> presigned URL at view time). Action buttons (Upload / Edit /
// Replace / View file) are honest stubs — they toast rather than fake a write.
//
// Honesty/gamification note (see inventory-effort-skepticism): the audit-readiness
// score is the OUTCOME — derived from coverage completeness — never the chore
// (files uploaded, streaks). It's computed from the coverage data, not stored, so
// it can't overstate where the practice actually is.

// Each compliance document type: the badge label, icon + accent, donut color, and
// the auditors'-eyebrow "why".
export const DOC_TYPES = {
  sds: { badge: "SDS", short: "SDS", label: "Safety Data Sheet", icon: "icon-file-text", tint: "blue", color: "#2F5BD6", why: "OSHA HazCom — required for every hazardous chemical on site." },
  ifu: { badge: "IFU", short: "IFU", label: "Instructions for Use", icon: "icon-book", tint: "green", color: "#2bb673", why: "Device manufacturer instructions — proof of correct use." },
  expiration: { badge: "Expiration proof", short: "Expiry", label: "Expiration proof", icon: "icon-calendar", tint: "amber", color: "#e0a020", why: "Dated proof the item was in-date when used." },
  lot: { badge: "Lot / UDI record", short: "Lot", label: "Lot / UDI record", icon: "icon-tag", tint: "violet", color: "#7c5cd6", why: "Lot/UDI captured off the package — the data no invoice carries (recall response)." },
  service: { badge: "Service record", short: "Service", label: "Service / sterilization record", icon: "icon-clipboard-check", tint: "magenta", color: "#b06ae6", why: "Spore tests and equipment service logs — infection-control evidence." },
  price: { badge: "Price evidence", short: "Price", label: "Price evidence", icon: "icon-dollar-circle", tint: "slate", color: "#8a97a6", why: "Quoted price captured for savings + spend audit." },
  waterline: { badge: "Waterline proof", short: "Waterline", label: "Waterline test result", icon: "icon-refresh", tint: "teal", color: "#1f9aa6", why: "Dental unit waterline test — CDC infection-control requirement." },
};

const STATUS_META = {
  verified: { label: "Verified", tone: "ok", icon: "icon-check-circle" },
  partial: { label: "Partial", tone: "warn", icon: "icon-clock" },
  captured: { label: "Captured", tone: "info", icon: "icon-info" },
  missing: { label: "Missing proof", tone: "bad", icon: "icon-x-circle" },
};

export const EVIDENCE_MOCK = {
  practiceName: "Bright Smiles Dental",
  // Headline counts across the whole library (the table below is one page of it).
  stats: { total: 286, verified: 214, missing: 31, linked: 172, locations: 5 },
  // Per doc-type completeness across tracked items — drives the right-rail
  // snapshot AND the derived audit-readiness headline (sum covered / sum total).
  coverageSnapshot: [
    { type: "sds", label: "SDS linked", covered: 46, total: 52, tone: "ok" },
    { type: "ifu", label: "IFUs linked", covered: 38, total: 41, tone: "ok" },
    { type: "expiration", label: "Expiration proof", covered: 57, total: 70, tone: "warn" },
    { type: "lot", label: "Lot records", covered: 24, total: 29, tone: "ok" },
    { type: "price", label: "Price evidence", covered: 51, total: 78, tone: "warn" },
  ],
  // Library composition — the donut + legend (sums to stats.total).
  typeBreakdown: [
    { type: "sds", label: "SDS", count: 82 },
    { type: "ifu", label: "IFU", count: 61 },
    { type: "expiration", label: "Expiration proof", count: 70 },
    { type: "lot", label: "Lot / UDI", count: 29 },
    { type: "service", label: "Service", count: 24 },
    { type: "price", label: "Price evidence", count: 20 },
  ],
  recent: [
    { id: "r1", fileName: "gloves_sds.pdf", sub: "Nitrile Exam Gloves / Main Office", ago: "2 min ago", fileType: "pdf" },
    { id: "r2", fileName: "epi_expiration_photo.jpg", sub: "Emergency Kit / Main Office", ago: "18 min ago", fileType: "image" },
    { id: "r3", fileName: "sterilizer_service_log.docx", sub: "Sterilization Room / Sterilizer A", ago: "32 min ago", fileType: "pdf" },
    { id: "r4", fileName: "waterline_test_result.pdf", sub: "Operatory 2", ago: "1 hr ago", fileType: "pdf" },
  ],
  // One page of the library. storageKey is the future Supabase object key.
  documents: [
    {
      id: "doc_1", type: "sds", fileName: "gloves_sds.pdf", fileType: "pdf",
      linkedItem: "Nitrile Exam Gloves", location: "Main Office", status: "verified",
      source: "Supplier upload", updatedAt: "May 16, 2024", review: { text: "No expiry" },
      detailItem: "Nitrile Exam Gloves, Medium", sku: "GLV-NTR-M", category: "PPE",
      preferredSupplier: "Henry Schein", preferred: true, uploadedBy: "Alex Kim",
      uploadedAt: "May 16, 2024", fileSize: "2.1 MB", format: "PDF",
      expiration: "No expiry", reviewSchedule: "Annual review not required", auditNote: "Linked and acceptable",
      activity: [
        { title: "Supplier file uploaded", sub: "by Alex Kim", at: "May 16, 2024 · 9:12 AM" },
        { title: "Linked to tracked item", sub: "Nitrile Exam Gloves, Medium", at: "May 16, 2024 · 9:14 AM" },
        { title: "Reviewed by Alex Kim", sub: "Verified and accepted", at: "May 16, 2024 · 9:18 AM" },
        { title: "Metadata updated", sub: "Source set to Supplier upload", at: "May 16, 2024 · 9:20 AM" },
      ],
      storageKey: "evidence/sds/gloves-sds.pdf",
    },
    {
      id: "doc_2", type: "ifu", fileName: "caviwipes_ifu.pdf", fileType: "pdf",
      linkedItem: "CaviWipes", location: "Hygiene Cabinet", status: "verified",
      source: "Auto-linked", updatedAt: "May 15, 2024", review: { text: "Annual review due Jun 2025" },
      detailItem: "CaviWipes Surface Wipes", sku: "CW-160", category: "Surface disinfectant",
      preferredSupplier: "Patterson", uploadedBy: "System", uploadedAt: "May 15, 2024", fileSize: "1.4 MB", format: "PDF",
      expiration: "No expiry", reviewSchedule: "Annual review due Jun 2025", auditNote: "Linked and acceptable",
      activity: [
        { title: "Auto-linked from catalog", sub: "Matched on SKU", at: "May 15, 2024 · 8:02 AM" },
        { title: "Reviewed", sub: "Verified and accepted", at: "May 15, 2024 · 8:40 AM" },
      ],
      storageKey: "evidence/ifu/caviwipes-ifu.pdf",
    },
    {
      id: "doc_3", type: "service", fileName: "sterilizer_service_log.docx", fileType: "pdf",
      linkedItem: "Sterilization Room", location: "Sterilizer A", status: "verified",
      source: "Manual upload", updatedAt: "May 12, 2024", review: { text: "Review due Aug 2024" },
      detailItem: "Statim 2000 Autoclave", sku: "—", category: "Equipment",
      preferredSupplier: "SciCan", uploadedBy: "Dana R.", uploadedAt: "May 12, 2024", fileSize: "0.6 MB", format: "DOCX",
      expiration: "—", reviewSchedule: "Service review due Aug 2024", auditNote: "Linked and acceptable",
      activity: [
        { title: "Service record uploaded", sub: "by Dana R.", at: "May 12, 2024 · 2:10 PM" },
        { title: "Linked to equipment", sub: "Statim 2000 Autoclave", at: "May 12, 2024 · 2:12 PM" },
      ],
      storageKey: "evidence/service/sterilizer-service-log.pdf",
    },
    {
      id: "doc_4", type: "expiration", fileName: "epi_expiration_photo.jpg", fileType: "image",
      linkedItem: "Emergency Kit", location: "Main Office", status: "partial",
      source: "Mobile scan", updatedAt: "May 14, 2024", review: { text: "Expires Jun 2024", tone: "bad" },
      detailItem: "Epinephrine 1:1000 Ampules", sku: "EPI-1MG", category: "Emergency drug",
      preferredSupplier: "Henry Schein", uploadedBy: "Dana R.", uploadedAt: "May 14, 2024", fileSize: "0.9 MB", format: "JPG",
      expiration: "Expires Jun 2024", reviewSchedule: "Replace before expiry", auditNote: "Expiring — needs follow-up",
      activity: [
        { title: "Photo captured", sub: "Mobile scan by Dana R.", at: "May 14, 2024 · 11:05 AM" },
        { title: "Flagged expiring", sub: "Expires Jun 2024", at: "May 14, 2024 · 11:06 AM" },
      ],
      storageKey: "evidence/expiry/epi-expiration.jpg",
    },
    {
      id: "doc_5", type: "lot", fileName: "implant_lot_sheet.pdf", fileType: "pdf",
      linkedItem: "Operatory 1", location: "Implant Kit", status: "verified",
      source: "Invoice import", updatedAt: "May 11, 2024", review: { text: "No expiry" },
      detailItem: "BioHorizons Tapered Implant", sku: "BH-TLX-4.6", category: "Implant",
      preferredSupplier: "BioHorizons", uploadedBy: "System", uploadedAt: "May 11, 2024", fileSize: "0.3 MB", format: "PDF",
      expiration: "No expiry", reviewSchedule: "No review required", auditNote: "Linked and acceptable",
      activity: [
        { title: "Imported from invoice", sub: "Lot captured", at: "May 11, 2024 · 4:20 PM" },
        { title: "Linked to tracked item", sub: "BioHorizons Tapered Implant", at: "May 11, 2024 · 4:21 PM" },
      ],
      storageKey: "evidence/lot/implant-lot-sheet.pdf",
    },
    {
      id: "doc_6", type: "price", fileName: "price_quote_hs_0516.xlsx", fileType: "pdf",
      linkedItem: "Nitrile Exam Gloves", location: "", status: "captured",
      source: "Supplier quote", updatedAt: "May 16, 2024", review: { text: "Review in 30 days" },
      detailItem: "Nitrile Exam Gloves, Medium", sku: "GLV-NTR-M", category: "PPE",
      preferredSupplier: "Henry Schein", preferred: true, uploadedBy: "Alex Kim", uploadedAt: "May 16, 2024", fileSize: "0.2 MB", format: "XLSX",
      expiration: "—", reviewSchedule: "Re-check price in 30 days", auditNote: "Captured for spend audit",
      activity: [
        { title: "Quote captured", sub: "Supplier quote by Alex Kim", at: "May 16, 2024 · 10:02 AM" },
      ],
      storageKey: "evidence/price/price-quote-hs-0516.pdf",
    },
    {
      id: "doc_7", type: "waterline", fileName: "waterline_test_result.pdf", fileType: "pdf",
      linkedItem: "Operatory 2", location: "", status: "verified",
      source: "Manual upload", updatedAt: "May 10, 2024", review: { text: "Next test due Jun 2024" },
      detailItem: "Operatory 2 Dental Unit", sku: "—", category: "Waterline",
      preferredSupplier: "—", uploadedBy: "Dana R.", uploadedAt: "May 10, 2024", fileSize: "0.4 MB", format: "PDF",
      expiration: "—", reviewSchedule: "Next test due Jun 2024", auditNote: "Linked and acceptable",
      activity: [
        { title: "Test result uploaded", sub: "by Dana R.", at: "May 10, 2024 · 9:30 AM" },
      ],
      storageKey: "evidence/waterline/waterline-test-result.pdf",
    },
    {
      id: "doc_8", type: "sds", fileName: "bibs_sds_missing", fileType: "none",
      linkedItem: "Patient Bibs", location: "Hygiene Room", status: "missing",
      source: "System flag", updatedAt: "May 16, 2024", review: { text: "Follow up now", tone: "bad" },
      detailItem: "Patient Bibs", sku: "BIB-500", category: "PPE",
      preferredSupplier: "Darby", uploadedBy: "—", uploadedAt: "—", fileSize: "—", format: "—",
      expiration: "—", reviewSchedule: "Required — not on file", auditNote: "Missing proof",
      activity: [
        { title: "Gap detected", sub: "Required SDS not on file", at: "May 16, 2024 · 6:00 AM" },
      ],
      storageKey: "evidence/sds/bibs-sds.pdf",
    },
    {
      id: "doc_9", type: "ifu", fileName: "ultrasonic_ifu.pdf", fileType: "pdf",
      linkedItem: "Ultrasonic Cleaner", location: "Sterilization", status: "verified",
      source: "Manual upload", updatedAt: "May 9, 2024", review: { text: "Annual review due Sep 2024" },
      detailItem: "Ultrasonic Cleaner", sku: "USC-3L", category: "Equipment",
      preferredSupplier: "Tuttnauer", uploadedBy: "Dana R.", uploadedAt: "May 9, 2024", fileSize: "1.1 MB", format: "PDF",
      expiration: "No expiry", reviewSchedule: "Annual review due Sep 2024", auditNote: "Linked and acceptable",
      activity: [
        { title: "IFU uploaded", sub: "by Dana R.", at: "May 9, 2024 · 3:15 PM" },
      ],
      storageKey: "evidence/ifu/ultrasonic-ifu.pdf",
    },
  ],
  // Per-item required vs present — the audit spine the binder is built from.
  coverage: [
    { id: "cov_cavicide", product: "CaviCide Surface Disinfectant", category: "Surface disinfectant", location: "Sterilization", required: ["sds"], present: ["sds"] },
    { id: "cov_scotchbond", product: "Scotchbond Universal Adhesive", category: "Bonding agent", location: "Operatory 1", required: ["sds", "ifu", "lot"], present: ["sds"] },
    { id: "cov_filtek", product: "3M Filtek Supreme Composite", category: "Restorative", location: "Operatory 2", required: ["ifu", "lot", "expiration"], present: ["ifu", "lot", "expiration"] },
    { id: "cov_septocaine", product: "Septocaine Articaine 4%", category: "Anesthetic", location: "Operatory 2", required: ["lot", "expiration"], present: ["lot", "expiration"] },
    { id: "cov_lidocaine", product: "Lidocaine 2% w/ Epinephrine", category: "Anesthetic", location: "Operatory 1", required: ["lot", "expiration"], present: [] },
    { id: "cov_implant", product: "BioHorizons Tapered Implant", category: "Implant", location: "Storage", required: ["ifu", "lot", "expiration"], present: ["ifu", "lot"] },
    { id: "cov_statim", product: "Statim 2000 Autoclave", category: "Equipment", location: "Sterilization", required: ["service"], present: ["service"] },
    { id: "cov_spore", product: "Weekly Spore Test", category: "Sterilization monitoring", location: "Sterilization", required: ["service"], present: ["service"] },
    { id: "cov_waterline", product: "Operatory 2 Dental Unit", category: "Waterline", location: "Operatory 2", required: ["waterline"], present: ["waterline"] },
  ],
};

// ---------------------------------------------------------------------------
// Evidence Match Review fixture. Mirrors the planned candidate-generation
// response (epic #309 / EM-2): an uploaded document the extractor has read but
// that isn't yet linked to a tracked item. Shape is the contract the future API
// returns — extracted fields each carry a *reason label*, and candidates are an
// ordered list with reason chips. We never store or invent a confidence percent
// and never assert a verification outcome; the human confirms the link.
// ---------------------------------------------------------------------------
export const EVIDENCE_REVIEW_MOCK = {
  file: {
    name: "caviwipes_sds.pdf", size: "1.2 MB", fileType: "pdf", pages: 10,
    uploadedBy: "Alex Kim", uploadedAt: "May 16, 2026 · 9:52 AM", source: "Manual upload",
  },
  docType: "sds",
  // Hazard block — present only for SDS / hazardous documents. Drives the GHS
  // pictogram + signal-word treatment in the preview and the rail badge.
  hazard: {
    signalWord: "Warning",
    pictograms: ["flammable"],
    statements: [
      "H226 — Flammable liquid and vapor",
      "H315 — Causes skin irritation",
      "H319 — Causes serious eye irritation",
    ],
  },
  // OCR'd document body — what we read off the upload, rendered as the preview
  // page. Honest representation of the file, not a verification claim.
  preview: {
    brand: "Metrex", title: "Safety Data Sheet",
    product: "CaviWipes Disinfectant Wipes", revision: "SDS-50B · Rev. 08/24",
    sections: [
      { n: "1", h: "Identification", rows: [
        ["Product identifier", "CaviWipes Disinfectant Wipes"],
        ["Recommended use", "Surface disinfectant and cleaner"],
        ["Manufacturer", "Metrex Research, LLC"],
        ["Emergency phone", "(800) 424-9300 (USA)"],
      ] },
      { n: "2", h: "Hazards identification", rows: [
        ["Signal word", "Warning"],
        ["Hazard statements", "H226, H315, H319"],
        ["Precautionary", "P210 — Keep away from heat and open flames"],
      ] },
      { n: "3", h: "Composition / information on ingredients", rows: [
        ["n-Alkyl dimethyl benzyl ammonium chloride", "0.20%"],
        ["n-Alkyl dimethyl ethylbenzyl ammonium chloride", "0.20%"],
        ["Isopropanol", "5.00%"],
      ] },
    ],
  },
  // Fields the extractor read. `reason` is a label, never a percentage.
  extracted: [
    { id: "doctype", icon: "icon-file-text", label: "Document type", value: "SDS", reason: "OCR suggestion", tone: "info" },
    { id: "product", icon: "icon-package", label: "Product", value: "CaviWipes", reason: "Possible match", tone: "ok" },
    { id: "manufacturer", icon: "icon-store", label: "Manufacturer", value: "Metrex", reason: "Possible match", tone: "ok" },
    { id: "revision", icon: "icon-calendar", label: "Revision date", value: "Jan 2026", reason: "Possible match", tone: "ok" },
    { id: "item", icon: "icon-link", label: "Linked item", value: "CaviWipes 160 ct", reason: "Needs confirmation", tone: "warn" },
    { id: "location", icon: "icon-building", label: "Linked location", value: "Hygiene Cabinet", reason: "Needs confirmation", tone: "warn" },
  ],
  // Candidate tracked items, strongest first. Strength is conveyed by the
  // reason chips and the order — there is deliberately no score/percentage.
  candidates: [
    { id: "cav160", name: "CaviWipes Surface Wipes, 160 ct", sku: "CW-160", location: "Hygiene Cabinet",
      reasons: ["Product name match", "Manufacturer match", "Same category"] },
    { id: "cav45", name: "CaviWipes Surface Wipes, 45 ct", sku: "CW-45", location: "Operatory 2",
      reasons: ["Product name match", "Manufacturer match"] },
    { id: "cavicide", name: "CaviCide Surface Disinfectant, 24 oz", sku: "CC-24", location: "Sterilization Room",
      reasons: ["Same manufacturer", "Same category"] },
  ],
  locationOptions: ["Hygiene Cabinet", "Operatory 1", "Operatory 2", "Sterilization Room", "Main Office", "Storage"],
  manualItems: [
    "CaviWipes Surface Wipes, 160 ct",
    "CaviWipes Surface Wipes, 45 ct",
    "CaviCide Surface Disinfectant, 24 oz",
    "Nitrile Exam Gloves, Medium",
    "Patient Bibs",
  ],
};

// No-candidate variant: the extractor read the file but search returned nothing
// to link against. The UI must still let the user link manually or defer.
export const EVIDENCE_REVIEW_EMPTY = {
  ...EVIDENCE_REVIEW_MOCK,
  file: { ...EVIDENCE_REVIEW_MOCK.file, name: "unknown_label_scan.jpg", size: "0.8 MB", fileType: "image", pages: 1, source: "Mobile scan" },
  extracted: EVIDENCE_REVIEW_MOCK.extracted.map((f) =>
    f.id === "item" || f.id === "location"
      ? { ...f, value: "—", reason: "No match found", tone: "bad" }
      : f.id === "product"
        ? { ...f, value: "Unclear", reason: "Text hard to read", tone: "warn" }
        : f,
  ),
  candidates: [],
};

// Readiness derived from the coverage snapshot: covered required-slots over total.
// Outcome-gamified — it only moves when real completeness changes.
function readinessFromSnapshot(snapshot) {
  const covered = snapshot.reduce((a, r) => a + r.covered, 0);
  const total = snapshot.reduce((a, r) => a + r.total, 0);
  return total ? Math.round((covered / total) * 100) : 100;
}

// Per-item readiness (used by the audit binder).
export function computeReadiness(coverage, documents) {
  let requiredSlots = 0;
  let coveredSlots = 0;
  let itemsCovered = 0;
  for (const row of coverage) {
    requiredSlots += row.required.length;
    const covered = row.required.filter((t) => row.present.includes(t)).length;
    coveredSlots += covered;
    if (covered === row.required.length) itemsCovered++;
  }
  return {
    pct: requiredSlots ? Math.round((coveredSlots / requiredSlots) * 100) : 100,
    openGaps: requiredSlots - coveredSlots,
    itemsCovered,
    itemsTotal: coverage.length,
    documents: documents.length,
  };
}

// Flatten coverage into the individual missing (item × required doc-type) pairs.
export function deriveGaps(coverage) {
  const gaps = [];
  for (const row of coverage) {
    for (const type of row.required) {
      if (!row.present.includes(type)) {
        gaps.push({ id: `${row.id}_${type}`, product: row.product, location: row.location, category: row.category, type });
      }
    }
  }
  return gaps;
}

function AuditRing({ pct, size = 116, caption = "audit-ready", compact = false }) {
  const value = Math.max(0, Math.min(100, pct));
  const stroke = compact ? 7 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = value >= 85 ? s.ringGood : value >= 60 ? s.ringWarn : s.ringBad;
  return (
    <span className={s.ringWrap} style={{ width: size, height: size }}>
      <svg className={s.ring} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className={s.ringTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className={`${s.ringFill} ${tone}`} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <span className={`${s.ringInner} ${compact ? s.ringInnerCompact : ""}`}>
        <strong>{value}%</strong>
        {caption && <small>{caption}</small>}
      </span>
    </span>
  );
}

// Library composition donut.
function Donut({ data, total, size = 122 }) {
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <span className={s.donutWrap} style={{ width: size, height: size }}>
      <svg className={s.donut} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" stroke="#eef1f6" />
        {data.map((seg) => {
          const frac = seg.count / total;
          const dash = Math.max(frac * c - 2, 0);
          const el = (
            <circle
              key={seg.type}
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeWidth={stroke}
              fill="none"
              stroke={DOC_TYPES[seg.type]?.color || "#8a97a6"}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-acc * c}
            />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <span className={s.donutInner}>
        <strong>{total}</strong>
        <small>Total</small>
      </span>
    </span>
  );
}

function StatCard({ icon, label, value, sub, tint }) {
  return (
    <div className={s.stat}>
      <span className={`${s.statIcon} ${s[`stat_${tint}`]}`}><Icon name={icon} /></span>
      <div className={s.statBody}>
        <span className={s.statLabel}>{label}</span>
        <strong className={s.statValue}>{value}</strong>
        {sub && <span className={s.statSub}>{sub}</span>}
      </div>
    </div>
  );
}

// File-type logo keyed off the filename extension (PDF / Word / Excel / image),
// falling back to a generic sheet for records with no underlying file.
function FileGlyph({ name = "" }) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const icon =
    ext === "pdf" ? "icon-file-pdf" :
    ext === "doc" || ext === "docx" ? "icon-file-doc" :
    ext === "xls" || ext === "xlsx" || ext === "csv" ? "icon-file-xls" :
    ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext) ? "icon-file-img" :
    "icon-file-generic";
  return <span className={s.fileGlyph}><Icon name={icon} /></span>;
}

function Select({ label, value, onChange, options }) {
  return (
    <label className={s.filter}>
      <span className={s.filterLabel}>{label}</span>
      <select className={s.filterSelect} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="icon-chevron-down" className={s.filterChevron} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Evidence Library (main surface)
// ---------------------------------------------------------------------------
export function EvidenceView({ data = EVIDENCE_MOCK, onToast, onBuildPacket, onReviewMatch }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [openDoc, setOpenDoc] = useState(null);
  const tableRef = useRef(null);

  const pct = useMemo(() => readinessFromSnapshot(data.coverageSnapshot), [data.coverageSnapshot]);

  const locations = useMemo(
    () => Array.from(new Set(data.documents.map((d) => d.location).filter(Boolean))).sort(),
    [data.documents],
  );
  const sources = useMemo(
    () => Array.from(new Set(data.documents.map((d) => d.source).filter(Boolean))).sort(),
    [data.documents],
  );
  const primaryLocation = useMemo(() => {
    const counts = new Map();
    data.documents.forEach((doc) => {
      if (!doc.location) return;
      counts.set(doc.location, (counts.get(doc.location) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "all";
  }, [data.documents]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.documents.filter((d) => {
      if (typeFilter !== "all" && d.type !== typeFilter) return false;
      if (locationFilter !== "all" && d.location !== locationFilter) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (sourceFilter !== "all" && d.source !== sourceFilter) return false;
      if (q && !(`${d.fileName} ${d.linkedItem} ${d.location} ${d.detailItem}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data.documents, query, typeFilter, locationFilter, statusFilter, sourceFilter]);

  // No capture/edit backend in this FE-first slice — be honest, don't fake it.
  const soon = (what) => onToast?.(`${what} connects when storage is wired up.`);
  const viewByLocation = () => {
    setLocationFilter(primaryLocation);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.title}>Evidence Library</h1>
          <p className={s.subtitle}>
            Centralize SDS, IFUs, expiration proof, lot records, service records, and pricing evidence across your practice.
          </p>
        </div>
        <div className={s.headActions}>
          {onReviewMatch && (
            <button type="button" className={s.btnOutline} onClick={() => onReviewMatch()}>
              <Icon name="icon-link" />Review matches
            </button>
          )}
          <button type="button" className={s.btnPrimary} onClick={() => soon("Document upload")}>
            <Icon name="icon-cloud-upload" />Upload evidence
          </button>
        </div>
      </header>

      {/* Headline counts */}
      <section className={s.stats}>
        <StatCard icon="icon-folder" tint="blue" label="Total evidence files" value={data.stats.total} sub={`Across ${data.stats.locations} locations`} />
        <StatCard icon="icon-shield-check" tint="green" label="Verified" value={data.stats.verified} sub="Ready for audits" />
        <StatCard icon="icon-alert-triangle" tint="amber" label="Missing proof" value={data.stats.missing} sub="Needs follow-up" />
        <StatCard icon="icon-link" tint="blue" label="Linked to tracked items" value={data.stats.linked} sub="Connected to inventory" />
      </section>

      <div className={s.main}>
        {/* The library table */}
        <section className={s.tableCard} ref={tableRef}>
          <div className={s.toolbar}>
            <div className={s.search}>
              <Icon name="icon-search" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search evidence files..."
                aria-label="Search evidence files"
              />
            </div>
            <Select
              label="Evidence type"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[{ value: "all", label: "All types" }, ...Object.entries(DOC_TYPES).map(([v, m]) => ({ value: v, label: m.badge }))]}
            />
            <Select
              label="Location"
              value={locationFilter}
              onChange={setLocationFilter}
              options={[{ value: "all", label: "All locations" }, ...locations.map((l) => ({ value: l, label: l }))]}
            />
            <Select
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))]}
            />
            <Select
              label="Source"
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[{ value: "all", label: "All sources" }, ...sources.map((src) => ({ value: src, label: src }))]}
            />
            <button type="button" className={s.filtersBtn} onClick={() => soon("Advanced filters")}>
              <Icon name="icon-filter" />Filters
            </button>
          </div>

          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>File / Record</th>
                  <th>Type</th>
                  <th>Linked item or location</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Last updated</th>
                  <th>Expiration / review</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className={s.tableEmpty}>No evidence files match these filters.</td></tr>
                ) : rows.map((doc) => {
                  const meta = DOC_TYPES[doc.type];
                  const st = STATUS_META[doc.status] || STATUS_META.verified;
                  const action = doc.status === "missing" ? "Request" : doc.status === "partial" ? "Review" : "View";
                  return (
                    <tr key={doc.id} className={s.row} onClick={() => setOpenDoc(doc)}>
                      <td>
                        <span className={s.fileCell}>
                          <FileGlyph name={doc.fileName} />
                          <span className={s.fileName}>{doc.fileName}</span>
                        </span>
                      </td>
                      <td><span className={`${s.typeBadge} ${s[`tint_${meta.tint}`]}`}>{meta.badge}</span></td>
                      <td>
                        <span className={s.linkCell}>
                          <span className={s.linkPrimary}>{doc.linkedItem}</span>
                          {doc.location && <span className={s.linkSecondary}>{doc.location}</span>}
                        </span>
                      </td>
                      <td><span className={`${s.pill} ${s[`pill_${st.tone}`]}`}><Icon name={st.icon} />{st.label}</span></td>
                      <td className={s.muted}>{doc.source}</td>
                      <td className={s.muted}>{doc.updatedAt}</td>
                      <td><span className={doc.review.tone === "bad" ? s.reviewBad : s.muted}>{doc.review.text}</span></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className={s.actions}>
                          <button type="button" className={s.btnOutlineSm} onClick={() => setOpenDoc(doc)}>{action}</button>
                          <button type="button" className={s.kebab} aria-label="More actions" onClick={() => soon("More actions")}>
                            <Icon name="icon-more-vertical" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={s.pagination}>
            <span className={s.pageInfo}>Showing 1 to {rows.length} of {data.stats.total} items</span>
            <div className={s.pager}>
              <button type="button" className={s.pageBtn} aria-label="Previous" onClick={() => soon("Pagination")}><Icon name="icon-chevron-left" /></button>
              {["1", "2", "3", "4", "5", "…", "32"].map((n, i) => (
                <button
                  key={`${n}-${i}`}
                  type="button"
                  className={`${s.pageBtn} ${n === "1" ? s.pageBtnOn : ""}`}
                  disabled={n === "…"}
                  onClick={() => soon("Pagination")}
                >
                  {n}
                </button>
              ))}
              <button type="button" className={s.pageBtn} aria-label="Next" onClick={() => soon("Pagination")}><Icon name="icon-chevron-right" /></button>
            </div>
          </div>
        </section>

        {/* Right rail */}
        <aside className={s.rail}>
          <div className={s.railCard}>
            <h3 className={s.railTitle}>Coverage snapshot</h3>
            <div className={s.covList}>
              {data.coverageSnapshot.map((row) => (
                <div className={s.covItem} key={row.type}>
                  <div className={s.covTop}>
                    <span className={s.covLabel}>
                      <span className={`${s.dot} ${row.tone === "ok" ? s.dotOk : s.dotWarn}`} />
                      {row.label}
                    </span>
                    <span className={s.covNums}>{row.covered} / {row.total}</span>
                  </div>
                  <div className={s.bar}>
                    <div className={`${s.barFill} ${row.tone === "ok" ? s.barOk : s.barWarn}`} style={{ width: `${Math.round((row.covered / row.total) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className={s.railLink} onClick={() => onBuildPacket?.()}>
              View all coverage <Icon name="icon-arrow-right" />
            </button>
          </div>

          <div className={s.railCard}>
            <h3 className={s.railTitle}>Evidence by type</h3>
            <div className={s.byType}>
              <Donut data={data.typeBreakdown} total={data.stats.total} />
              <ul className={s.legend}>
                {data.typeBreakdown.map((seg) => (
                  <li key={seg.type}>
                    <span className={s.legendDot} style={{ background: DOC_TYPES[seg.type]?.color }} />
                    <span className={s.legendLabel}>{seg.label}</span>
                    <span className={s.legendVal}>{seg.count} ({Math.round((seg.count / data.stats.total) * 100)}%)</span>
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" className={s.railLink} onClick={viewByLocation}>
              View by location <Icon name="icon-arrow-right" />
            </button>
          </div>

          <div className={s.railCard}>
            <h3 className={s.railTitle}>Recent uploads</h3>
            <div className={s.recentList}>
              {data.recent.map((r) => (
                <div className={s.recentRow} key={r.id}>
                  <FileGlyph name={r.fileName} />
                  <div className={s.recentInfo}>
                    <span className={s.recentName}>{r.fileName}</span>
                    <span className={s.recentSub}>{r.sub}</span>
                  </div>
                  <span className={s.recentAgo}>{r.ago}</span>
                </div>
              ))}
            </div>
            <button type="button" className={s.railLink} onClick={() => soon("Activity log")}>
              View all activity <Icon name="icon-arrow-right" />
            </button>
          </div>
        </aside>
      </div>

      {/* Audit readiness — the outcome, derived from coverage. */}
      <section className={s.auditBar}>
        <AuditRing pct={pct} size={66} caption={null} compact />
        <div className={s.auditBody}>
          <div className={s.auditTitleRow}>
            <strong>Audit readiness</strong>
            <span className={`${s.auditBadge} ${pct >= 75 ? s.auditOk : s.auditWarn}`}>{pct >= 75 ? "On track" : "Needs attention"}</span>
          </div>
          <p>{pct}% of required evidence is complete across tracked items.</p>
        </div>
        <button type="button" className={s.auditLink} onClick={() => onBuildPacket?.()}>
          View missing evidence <Icon name="icon-arrow-right" />
        </button>
      </section>

      {openDoc && <DocumentDrawer doc={openDoc} onClose={() => setOpenDoc(null)} onToast={onToast} />}
    </div>
  );
}

// Read-only detail for one evidence record. File preview is an honest placeholder
// (no blob behind storageKey yet); the action buttons toast for the same reason.
function DocumentDrawer({ doc, onClose, onToast }) {
  const meta = DOC_TYPES[doc.type];
  const st = STATUS_META[doc.status] || STATUS_META.verified;
  const soon = (what) => onToast?.(`${what} connects when storage is wired up.`);

  return (
    <div className={s.drawerRoot} role="dialog" aria-modal="true" aria-label={doc.fileName}>
      <div className={s.drawerBackdrop} onClick={onClose} />
      <aside className={s.drawer}>
        <header className={s.drawerHead}>
          <h2>Evidence details</h2>
          <button type="button" className={s.drawerClose} aria-label="Close" onClick={onClose}><Icon name="icon-x" /></button>
        </header>

        <div className={s.drawerBody}>
          <div className={s.fileCard}>
            <FileGlyph name={doc.fileName} />
            <div className={s.fileCardInfo}>
              <strong>{doc.fileName}</strong>
              <span>{doc.detailItem || doc.linkedItem}</span>
              <div className={s.fileCardBadges}>
                <span className={`${s.typeBadge} ${s[`tint_${meta.tint}`]}`}>{meta.badge}</span>
                <span className={`${s.pill} ${s[`pill_${st.tone}`]}`}><Icon name={st.icon} />{st.label}</span>
              </div>
            </div>
          </div>

          <section className={s.drawerSection}>
            <h4>Linked location</h4>
            <p className={s.drawerLoc}><Icon name="icon-building" />{doc.location || "—"}</p>
          </section>

          <section className={s.drawerSection}>
            <h4>Evidence metadata</h4>
            <div className={s.metaRow}>
              <dl className={s.meta}>
                <div><dt>Type</dt><dd>{meta.badge}</dd></div>
                <div><dt>Source</dt><dd>{doc.source}</dd></div>
                <div><dt>Uploaded by</dt><dd>{doc.uploadedBy}</dd></div>
                <div><dt>Uploaded</dt><dd>{doc.uploadedAt}</dd></div>
                <div><dt>File size</dt><dd>{doc.fileSize}</dd></div>
                <div><dt>Format</dt><dd>{doc.format}</dd></div>
              </dl>
              <div className={s.thumb} aria-hidden="true">
                <span className={s.thumbKicker}>{meta.badge}</span>
                <span className={s.thumbName}>{doc.detailItem || doc.linkedItem}</span>
                <span className={s.thumbLine} />
                <span className={s.thumbLine} />
                <span className={`${s.thumbLine} ${s.thumbLineShort}`} />
              </div>
            </div>
          </section>

          <section className={s.drawerSection}>
            <h4>Linked records</h4>
            <dl className={s.meta}>
              <div><dt>Linked item</dt><dd>{doc.detailItem || doc.linkedItem}</dd></div>
              <div><dt>SKU</dt><dd>{doc.sku}</dd></div>
              <div><dt>Category</dt><dd>{doc.category}</dd></div>
              <div>
                <dt>Preferred supplier</dt>
                <dd className={s.supplierCell}>
                  {doc.preferredSupplier}
                  {doc.preferred && <span className={s.miniBadge}>Preferred</span>}
                </dd>
              </div>
            </dl>
          </section>

          <section className={s.drawerSection}>
            <h4>Review &amp; compliance</h4>
            <dl className={s.meta}>
              <div><dt>Verification status</dt><dd><span className={`${s.inlineStatus} ${s[`ink_${st.tone}`]}`}><Icon name={st.icon} />{st.label}</span></dd></div>
              <div><dt>Expiration</dt><dd className={doc.review.tone === "bad" ? s.reviewBad : ""}>{doc.expiration}</dd></div>
              <div><dt>Review schedule</dt><dd>{doc.reviewSchedule}</dd></div>
              <div><dt>Audit readiness</dt><dd className={st.tone === "ok" ? s.ink_ok : st.tone === "bad" ? s.ink_bad : s.ink_warn}>{doc.auditNote}</dd></div>
            </dl>
          </section>

          {doc.activity?.length > 0 && (
            <section className={s.drawerSection}>
              <h4>Recent activity</h4>
              <ul className={s.timeline}>
                {doc.activity.map((a, i) => (
                  <li key={i}>
                    <span className={s.timelineDot} />
                    <div className={s.timelineBody}>
                      <span className={s.timelineTitle}>{a.title}</span>
                      {a.sub && <span className={s.timelineSub}>{a.sub}</span>}
                    </div>
                    <span className={s.timelineAt}>{a.at}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className={s.drawerFoot}>
          <div className={s.drawerFootRow}>
            <button type="button" className={s.btnOutline} onClick={() => soon("File preview")}><Icon name="icon-eye" />View file</button>
            <button type="button" className={s.btnOutline} onClick={() => soon("File replace")}><Icon name="icon-cloud-upload" />Replace file</button>
          </div>
          <button type="button" className={`${s.btnPrimary} ${s.btnFull}`} onClick={() => soon("Editing")}><Icon name="icon-edit" />Edit evidence</button>
        </footer>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit packet — the system-of-record payoff. A print-ready binder of every
// document, organized the way an inspection runs: cover sheet with the readiness
// score, then a section per document type. "Export PDF" is the browser's
// print-to-PDF (honest: no server render needed for a FE-first slice).
// ---------------------------------------------------------------------------
export function EvidenceBinderView({ data = EVIDENCE_MOCK, onBack }) {
  const readiness = useMemo(() => computeReadiness(data.coverage, data.documents), [data]);
  const gaps = useMemo(() => deriveGaps(data.coverage), [data.coverage]);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const sections = Object.keys(DOC_TYPES)
    .map((type) => ({ type, meta: DOC_TYPES[type], docs: data.documents.filter((d) => d.type === type && d.fileType !== "none") }))
    .filter((sec) => sec.docs.length);

  function exportPdf() {
    window.print();
  }

  return (
    <div className={s.binderPage}>
      <div className={`${s.binderBar} evd-noprint`}>
        <button type="button" className={s.btnOutline} onClick={() => onBack?.()}>
          <Icon name="icon-chevron-left" />Back to evidence
        </button>
        <button type="button" className={s.btnPrimary} onClick={exportPdf}>
          <Icon name="icon-archive-down" />Export PDF
        </button>
      </div>

      <article className={s.binder}>
        <header className={s.binderCover}>
          <span className={s.binderBrand}><Icon name="icon-shield-check" />TraceDDS · Audit Packet</span>
          <h1>{data.practiceName}</h1>
          <p className={s.binderDate}>Compliance evidence as of {today}</p>
          <div className={s.binderScore}>
            <AuditRing pct={readiness.pct} size={92} />
            <ul>
              <li><strong>{data.stats?.total ?? readiness.documents}</strong> documents on file</li>
              <li><strong>{readiness.itemsCovered}/{readiness.itemsTotal}</strong> regulated items fully covered</li>
              <li className={readiness.openGaps ? s.binderGap : ""}><strong>{readiness.openGaps}</strong> open {readiness.openGaps === 1 ? "gap" : "gaps"}</li>
            </ul>
          </div>
        </header>

        <section className={s.binderToc}>
          <h2>Contents</h2>
          <ol>
            {sections.map((sec) => (
              <li key={sec.type}><span>{sec.meta.label}</span><span className={s.tocDots} /><span>{sec.docs.length}</span></li>
            ))}
            {gaps.length > 0 && <li className={s.tocGap}><span>Outstanding items</span><span className={s.tocDots} /><span>{gaps.length}</span></li>}
          </ol>
        </section>

        {sections.map((sec) => (
          <section className={s.binderSection} key={sec.type}>
            <h2><Icon name={sec.meta.icon} />{sec.meta.label}</h2>
            <p className={s.binderWhy}>{sec.meta.why}</p>
            <table className={s.binderTable}>
              <thead>
                <tr><th>Document</th><th>Item / location</th><th>Captured</th><th>Source</th></tr>
              </thead>
              <tbody>
                {sec.docs.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.fileName}</td>
                    <td>{doc.detailItem || doc.linkedItem}<br /><span className={s.binderSub}>{doc.location || "—"}</span></td>
                    <td>{doc.uploadedAt}<br /><span className={s.binderSub}>{doc.uploadedBy}</span></td>
                    <td>{doc.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {gaps.length > 0 && (
          <section className={s.binderSection}>
            <h2><Icon name="icon-alert-triangle" />Outstanding items</h2>
            <p className={s.binderWhy}>Documents identified as required but not yet on file.</p>
            <table className={s.binderTable}>
              <thead><tr><th>Item</th><th>Missing document</th><th>Location</th></tr></thead>
              <tbody>
                {gaps.map((gap) => (
                  <tr key={gap.id}><td>{gap.product}</td><td>{DOC_TYPES[gap.type].label}</td><td>{gap.location}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className={s.binderFoot}>
          Generated by TraceDDS · {data.practiceName} · {today}. Evidence records reflect documents captured in the practice&rsquo;s compliance library.
        </footer>
      </article>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence Match Review (wireframe 22). An ambiguous upload, read by the
// extractor but not yet linked. The reviewer sees the file preview, the
// extracted-field callouts (each with a reason label, never a %), a ranked
// candidate list (strength = reason chips + order), and the review actions.
// Backend writes (accept/reject/edit, #339/#341) aren't wired yet, so the
// action buttons are honest stubs that toast rather than fake an outcome.
// ---------------------------------------------------------------------------

// GHS hazard pictogram — the red-bordered diamond from a Safety Data Sheet.
// Rendered in tokens (var(--red) border) so SDS uploads read as hazardous.
function GhsPictogram({ kind = "flammable", size = 64 }) {
  return (
    <span className={s.ghs} style={{ width: size, height: size }} role="img" aria-label={`GHS ${kind} pictogram`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect className={s.ghsDiamond} x="9" y="9" width="46" height="46" rx="4" transform="rotate(45 32 32)" />
        {kind === "flammable" && (
          <path className={s.ghsGlyph} d="M33 17c1 6-3 8-5 12-2 3-2 7 1 9-3-1-4-4-4-7-3 3-5 7-5 11 0 7 5 12 12 12s12-5 12-12c0-9-7-13-11-25z" />
        )}
      </svg>
    </span>
  );
}

function ReasonBadge({ reason, tone = "info" }) {
  return <span className={`${s.reasonBadge} ${s[`reason_${tone}`]}`}>{reason}</span>;
}

export function EvidenceMatchReview({ sample = "", data, onBack, onToast }) {
  const review = data || (sample === "empty" ? EVIDENCE_REVIEW_EMPTY : EVIDENCE_REVIEW_MOCK);
  const docMeta = DOC_TYPES[review.docType] || DOC_TYPES.sds;

  const [docType, setDocType] = useState(review.docType);
  const [selectedCandidate, setSelectedCandidate] = useState(review.candidates[0]?.id || "");
  const [manualItem, setManualItem] = useState("");
  const [location, setLocation] = useState(review.candidates[0]?.location || "");
  const [officeWide, setOfficeWide] = useState(false);
  const [notes, setNotes] = useState("");
  const [zoom, setZoom] = useState(100);
  const [rotate, setRotate] = useState(0);

  const soon = (what) => onToast?.(`${what} connects when the review API is wired up.`);

  const hasCandidates = review.candidates.length > 0;
  const chosen = review.candidates.find((c) => c.id === selectedCandidate) || null;
  const linkedItemLabel = officeWide
    ? "Entire practice"
    : chosen?.name || manualItem || "Not linked yet";
  const canConfirm = officeWide || Boolean(chosen) || Boolean(manualItem);

  function pickCandidate(id) {
    setSelectedCandidate(id);
    const c = review.candidates.find((x) => x.id === id);
    if (c?.location) setLocation(c.location);
  }

  return (
    <div className={s.reviewPage}>
      <header className={s.reviewHead}>
        <button type="button" className={s.backLink} onClick={() => onBack?.()}>
          <Icon name="icon-chevron-left" />Evidence library
        </button>
        <div>
          <h1 className={s.title}>Evidence Match Review</h1>
          <p className={s.subtitle}>Review ambiguous uploads before linking them to inventory, locations, or office-wide records.</p>
        </div>
      </header>

      <div className={s.reviewGrid}>
        {/* Uploaded file identity + preview */}
        <section className={s.viewer}>
          <div className={s.viewerHead}>
            <span className={s.fileCell}>
              <FileGlyph name={review.file.name} />
              <span className={s.fileMeta}>
                <span className={s.fileName}>{review.file.name}</span>
                <span className={s.fileSub}>{review.file.size} · {review.file.fileType.toUpperCase()}</span>
              </span>
            </span>
            <span className={s.reviewFlag}><Icon name="icon-clock" />Needs review</span>
          </div>

          <div className={s.viewerToolbar}>
            <span className={s.pageNav}>
              <button type="button" className={s.toolBtn} aria-label="Previous page" disabled><Icon name="icon-chevron-left" /></button>
              <span className={s.pageCount}>1 <span>/ {review.file.pages}</span></span>
              <button type="button" className={s.toolBtn} aria-label="Next page" disabled={review.file.pages < 2} onClick={() => soon("Page navigation")}><Icon name="icon-chevron-right" /></button>
            </span>
            <span className={s.zoomGroup}>
              <button type="button" className={s.toolBtn} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(50, z - 10))}>&minus;</button>
              <span className={s.zoomVal}>{zoom}%</span>
              <button type="button" className={s.toolBtn} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(200, z + 10))}>+</button>
            </span>
            <span className={s.toolSpacer} />
            <button type="button" className={s.toolBtn} aria-label="Rotate" onClick={() => setRotate((r) => (r + 90) % 360)}><Icon name="icon-refresh" /></button>
            <button type="button" className={s.toolBtn} aria-label="Download" onClick={() => soon("Download")}><Icon name="icon-archive-down" /></button>
            <button type="button" className={s.toolBtn} aria-label="Open full file" onClick={() => soon("Open full file")}><Icon name="icon-share" /></button>
          </div>

          <div className={s.viewerStage}>
            {review.file.fileType === "image" ? (
              <div className={s.imgPreview} style={{ transform: `scale(${zoom / 100}) rotate(${rotate}deg)` }}>
                <Icon name="icon-image" />
                <span>Photo upload — {review.file.name}</span>
                <small>Captured by mobile scan. Confirm the item this label belongs to.</small>
              </div>
            ) : (
              <article className={s.sdsDoc} style={{ transform: `scale(${zoom / 100}) rotate(${rotate}deg)` }}>
                <div className={s.sdsTop}>
                  <span className={s.sdsBrand}>{review.preview.brand}</span>
                  <div className={s.sdsTitleWrap}>
                    <h2 className={s.sdsTitle}>{review.preview.title}</h2>
                    <p className={s.sdsProduct}>{review.preview.product}</p>
                  </div>
                  <span className={s.sdsRev}>{review.preview.revision}</span>
                </div>
                {review.preview.sections.map((sec) => (
                  <div className={s.sdsSection} key={sec.n}>
                    <h3 className={s.sdsSectionHead}>{sec.n}. {sec.h}</h3>
                    <dl className={s.sdsRows}>
                      {sec.rows.map(([k, v]) => (
                        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                      ))}
                    </dl>
                    {sec.n === "2" && review.hazard && (
                      <div className={s.sdsHazard}>
                        <GhsPictogram kind={review.hazard.pictograms[0]} />
                        <div className={s.sdsHazardBody}>
                          <span className={s.sdsSignal}>{review.hazard.signalWord}</span>
                          <ul>{review.hazard.statements.map((h) => <li key={h}>{h}</li>)}</ul>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </article>
            )}
          </div>
        </section>

        {/* Review rail */}
        <aside className={s.reviewRail}>
          {/* Extracted-field callouts */}
          <div className={s.railCard}>
            <div className={s.railTitleRow}>
              <h3 className={s.railTitle}>Extracted details</h3>
              {review.hazard && <span className={s.hazardTag}><Icon name="icon-alert-triangle" />Hazardous (SDS)</span>}
            </div>
            <ul className={s.extractList}>
              {review.extracted.map((f) => (
                <li key={f.id} className={s.extractRow}>
                  <span className={s.extractIcon}><Icon name={f.icon} /></span>
                  <span className={s.extractLabel}>{f.label}</span>
                  <span className={s.extractValue}>{f.value}</span>
                  <ReasonBadge reason={f.reason} tone={f.tone} />
                </li>
              ))}
            </ul>
            <div className={s.infoBanner}>
              <Icon name="icon-info" />
              <p>{hasCandidates
                ? "We read these details from the document. Confirm or update the match before linking — nothing is linked until you confirm."
                : "We read this document but couldn't match it to a tracked item. Link it manually or save it for later review."}</p>
            </div>
          </div>

          {/* Candidate list — ranked, reason-labelled, single-select */}
          <div className={s.railCard}>
            <h3 className={s.railTitle}>Candidate matches</h3>
            {hasCandidates ? (
              <div className={s.candidateList} role="radiogroup" aria-label="Candidate matches">
                {review.candidates.map((c, i) => {
                  const on = c.id === selectedCandidate && !officeWide;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      role="radio"
                      aria-checked={on}
                      disabled={officeWide}
                      className={`${s.candidate} ${on ? s.candidateOn : ""}`}
                      onClick={() => pickCandidate(c.id)}
                    >
                      <span className={s.candidateRadio} aria-hidden="true" />
                      <span className={s.candidateBody}>
                        <span className={s.candidateTop}>
                          <span className={s.candidateName}>{c.name}</span>
                          {i === 0 && <span className={s.strongest}>Strongest</span>}
                        </span>
                        <span className={s.candidateSub}>{c.sku} · {c.location}</span>
                        <span className={s.reasonRow}>
                          {c.reasons.map((r) => (
                            <span className={s.reasonChip} key={r}><Icon name="icon-check" />{r}</span>
                          ))}
                        </span>
                      </span>
                    </button>
                  );
                })}
                <button type="button" className={s.candidateManual} onClick={() => soon("Manual item search")}>
                  <Icon name="icon-search" />None of these — search all items
                </button>
              </div>
            ) : (
              <div className={s.emptyMatch}>
                <span className={s.emptyIcon}><Icon name="icon-link" /></span>
                <strong>No candidate matches found</strong>
                <p>We couldn&rsquo;t match this upload to a tracked item automatically.</p>
                <label className={s.manualField}>
                  <span className={s.fieldLabel}>Link manually</span>
                  <span className={s.selectWrap}>
                    <select className={s.select} value={manualItem} onChange={(e) => setManualItem(e.target.value)}>
                      <option value="">Search tracked items…</option>
                      {review.manualItems.map((it) => <option key={it} value={it}>{it}</option>)}
                    </select>
                    <Icon name="icon-chevron-down" className={s.selectChevron} />
                  </span>
                </label>
                <button type="button" className={s.revBtnOutline} onClick={() => soon("Save for later review")}>
                  <Icon name="icon-clock" />Save for later review
                </button>
              </div>
            )}
          </div>

          {/* Confirm form */}
          <div className={s.railCard}>
            <h3 className={s.railTitle}>Review &amp; confirm match</h3>
            <div className={s.confirmForm}>
              <label className={s.field}>
                <span className={s.fieldLabel}>Document type <em>*</em></span>
                <span className={s.selectWrap}>
                  <select className={s.select} value={docType} onChange={(e) => setDocType(e.target.value)}>
                    {Object.entries(DOC_TYPES).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                  </select>
                  <Icon name="icon-chevron-down" className={s.selectChevron} />
                </span>
              </label>

              <label className={s.field}>
                <span className={s.fieldLabel}>Linked item <em>*</em></span>
                <span className={`${s.fieldValue} ${officeWide ? s.fieldValueMuted : ""}`}>
                  <Icon name="icon-link" />{linkedItemLabel}
                </span>
              </label>

              <label className={s.field}>
                <span className={s.fieldLabel}>Linked location <em>*</em></span>
                <span className={s.selectWrap}>
                  <select className={s.select} value={officeWide ? "" : location} onChange={(e) => setLocation(e.target.value)} disabled={officeWide}>
                    <option value="">Select location…</option>
                    {review.locationOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <Icon name="icon-chevron-down" className={s.selectChevron} />
                </span>
              </label>

              <div className={s.toggleRow}>
                <span className={s.toggleLabel}>
                  Mark as office-wide
                  <span className={s.toggleHint} title="Applies to the whole practice rather than one item or location"><Icon name="icon-info" /></span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={officeWide}
                  className={`${s.toggle} ${officeWide ? s.toggleOn : ""}`}
                  onClick={() => setOfficeWide((v) => !v)}
                >
                  <span className={s.toggleKnob} />
                </button>
              </div>

              <label className={s.field}>
                <span className={s.fieldLabel}>Reviewer notes</span>
                <textarea
                  className={s.textarea}
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes or context about this match…"
                />
                <span className={s.charCount}>{notes.length}/500</span>
              </label>
            </div>
          </div>

          {/* Detection provenance */}
          <div className={s.railCard}>
            <h3 className={s.railTitle}>Detection details</h3>
            <dl className={s.detectGrid}>
              <div><dt><Icon name="icon-users" />Uploaded by</dt><dd>{review.file.uploadedBy}</dd></div>
              <div><dt><Icon name="icon-cloud-upload" />Source</dt><dd>{review.file.source}</dd></div>
              <div><dt><Icon name="icon-calendar" />Last updated</dt><dd>{review.file.uploadedAt}</dd></div>
              <div><dt><Icon name="icon-file-text" />File type</dt><dd>{review.file.fileType.toUpperCase()}</dd></div>
            </dl>
          </div>

          {/* Review actions */}
          <div className={s.actionStack}>
            <button type="button" className={s.revBtnPrimary} disabled={!canConfirm} onClick={() => soon("Confirm match")}>
              <Icon name="icon-check-circle" />Confirm match
            </button>
            <button type="button" className={s.revBtnOutline} onClick={() => soon("Change item")}>
              <Icon name="icon-edit" />Change item
            </button>
            <button type="button" className={s.revBtnOutline} onClick={() => setOfficeWide(true)}>
              <Icon name="icon-users" />Mark office-wide
            </button>
            <button type="button" className={s.revBtnOutline} onClick={() => soon("Request better proof")}>
              <Icon name="icon-camera" />Request better proof
            </button>
            <button type="button" className={s.revBtnDanger} onClick={() => soon("Archive upload")}>
              <Icon name="icon-trash" />Archive
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
