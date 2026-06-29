"use client";

import { Fragment, useMemo, useRef, useState } from "react";
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
// Compliance Update Review (redline) — frame-26 surface.
//
// When a supplier publishes a newer version of a document we already hold (an SDS
// reissued under a new GHS revision, an IFU update), the practice has to review
// what changed before it replaces the accepted copy on file. This fixture is the
// FE-first stand-in for the planned CR-3 diff response: a per-field change list
// plus a section-level redline. Shape is deliberately API-ready so the mock maps
// 1:1 onto the future endpoint (document identity, accepted-vs-pending versions,
// change[] with kind/impact/confidence, and section[] redline segments).
//
// Honesty: nothing here is presented as a verified regulatory determination. The
// changes are a detected diff awaiting human review; every action is an honest
// stub (toast) — we never fabricate a reviewer, an approval, or an audit date.
// Each text run is a segment: a plain string is unchanged; { del } was removed
// from the accepted copy; { add } appears only in the pending copy.
export const REDLINE_MOCK = {
  document: {
    type: "sds",
    name: "CaviWipes SDS",
    product: "CaviWipes Disinfectant Wipes",
    manufacturer: "Metrex",
    linkedLocation: "Bright Smiles Dental",
  },
  // The copy currently on file (accepted) vs the newer one detected (pending).
  accepted: { version: "Jan 2026", label: "Current saved version" },
  pending: { version: "Apr 2026", label: "Latest detected version" },
  confidence: "High",
  // Acknowledgment is *recommended* when the diff touches these sections — stated
  // as guidance, not a regulatory requirement we're asserting on the user's behalf.
  ackTriggers: ["use", "PPE", "contact time", "sterilization", "storage", "expiration", "disposal"],
  ackRecommended: true,
  // Per-field change list. `segments` is reused to render both the saved cell
  // (text + del) and the latest cell (text + add). `minor` rows hide behind a toggle.
  changes: [
    {
      id: "c1", kind: "changed", title: "Hazard statement changed", section: "2.2", sectionLabel: "Hazards",
      impact: "high", confidence: "High",
      segments: ["Causes serious eye ", { del: "irritation" }, { add: "damage" }, "."],
    },
    {
      id: "c2", kind: "changed", title: "PPE guidance updated", section: "8.2", sectionLabel: "Controls",
      impact: "high", confidence: "High",
      segments: ["Wear ", { del: "protective" }, { add: "chemical-resistant" }, " gloves, eye protection", { add: ", and face shield" }, "."],
    },
    {
      id: "c3", kind: "changed", title: "Contact time changed", section: "7.3", sectionLabel: "Use",
      impact: "high", impactNote: "Review disinfectant protocol", confidence: "High",
      segments: ["Contact time: ", { del: "2 minutes" }, { add: "3 minutes" }],
    },
    {
      id: "c4", kind: "changed", title: "Storage instruction changed", section: "7.1", sectionLabel: "Storage",
      impact: "medium", confidence: "High",
      segments: ["Store ", { del: "at room temperature (15–30°C)" }, { add: "in a cool, dry place (5–25°C)" }],
    },
    {
      id: "c5", kind: "added", title: "First-aid note added", section: "4.1", sectionLabel: "First aid", minor: true,
      impact: "low", confidence: "Medium",
      segments: [{ add: "If swallowed, rinse mouth. Do NOT induce vomiting." }],
    },
    {
      id: "c6", kind: "removed", title: "Outdated handling note removed", section: "8.2", sectionLabel: "Controls", minor: true,
      impact: "low", confidence: "Medium",
      segments: [{ del: "Product is non-irritating to skin under normal use." }],
    },
  ],
  // Section-level redline of the document body. `changeRef` links the [Change N]
  // tag back to the change list; unchanged sections carry no ref.
  sections: [
    {
      id: "2.2", num: "2.2", title: "Hazards", changeRef: 1,
      body: ["Hazard statements: Causes serious eye ", { del: "irritation" }, { add: "damage" }, ". May cause skin irritation. Harmful if swallowed."],
    },
    {
      id: "7.1", num: "7.1", title: "Storage", changeRef: 4,
      body: ["Store ", { del: "at room temperature (15–30°C)" }, { add: "in a cool, dry place (5–25°C)" }, ". Keep container tightly closed. Keep out of reach of children."],
    },
    {
      id: "7.3", num: "7.3", title: "Use", changeRef: 3,
      body: ["Apply to hard, non-porous surfaces. Ensure surface remains wet for the entire contact time. Contact time: ", { del: "2 minutes" }, { add: "3 minutes" }, "."],
    },
    {
      id: "8.2", num: "8.2", title: "PPE & Controls", changeRef: 2,
      body: ["Wear ", { del: "protective" }, { add: "chemical-resistant" }, " gloves, eye protection", { add: ", and face shield" }, ". Long-sleeved protective clothing is recommended."],
    },
    {
      id: "13", num: "13", title: "Disposal", changeRef: null,
      body: ["Dispose of contents/container in accordance with local, state, and federal regulations."],
    },
  ],
};

// Render an array of text segments in one of several modes. A plain string is
// unchanged text; { del } was removed from the accepted copy; { add } is new in
// the pending copy.
//   redline — show both, struck deletions + marked insertions (the diff)
//   saved   — the accepted copy as text (drop additions, keep deletions plain)
//   latest  — the pending copy as text (drop deletions, keep additions plain)
//   old     — the saved cell: unchanged text + struck deletions, no additions
//   new     — the latest cell: unchanged text + marked insertions, no deletions
function RedlineText({ segments, mode = "redline", dim = false }) {
  const out = [];
  segments.forEach((seg, i) => {
    if (typeof seg === "string") { out.push(<span key={i} className={dim ? s.rlDimText : undefined}>{seg}</span>); return; }
    if (seg.del != null) {
      if (mode === "latest" || mode === "new") return;
      if (mode === "saved") out.push(<span key={i}>{seg.del}</span>);
      else out.push(<del key={i} className={s.rlDel}>{seg.del}</del>);
      return;
    }
    if (seg.add != null) {
      if (mode === "saved" || mode === "old") return;
      if (mode === "latest") out.push(<span key={i}>{seg.add}</span>);
      else out.push(<ins key={i} className={s.rlAdd}>{seg.add}</ins>);
    }
  });
  return out.length ? out : <span className={s.rlEmpty}>—</span>;
}

const IMPACT_META = {
  high: { label: "High", cls: "impactHigh" },
  medium: { label: "Medium", cls: "impactMed" },
  low: { label: "Low", cls: "impactLow" },
};

const CHANGE_KIND_META = {
  changed: { label: "Changed", cls: "kindChanged" },
  added: { label: "Added", cls: "kindAdded" },
  removed: { label: "Removed", cls: "kindRemoved" },
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
export function EvidenceView({ data = EVIDENCE_MOCK, onToast, onBuildPacket, onReviewUpdate, pendingUpdate = REDLINE_MOCK }) {
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
        <button type="button" className={s.btnPrimary} onClick={() => soon("Document upload")}>
          <Icon name="icon-cloud-upload" />Upload evidence
        </button>
      </header>

      {/* Headline counts */}
      <section className={s.stats}>
        <StatCard icon="icon-folder" tint="blue" label="Total evidence files" value={data.stats.total} sub={`Across ${data.stats.locations} locations`} />
        <StatCard icon="icon-shield-check" tint="green" label="Verified" value={data.stats.verified} sub="Ready for audits" />
        <StatCard icon="icon-alert-triangle" tint="amber" label="Missing proof" value={data.stats.missing} sub="Needs follow-up" />
        <StatCard icon="icon-link" tint="blue" label="Linked to tracked items" value={data.stats.linked} sub="Connected to inventory" />
      </section>

      {/* A supplier published a newer version of a document on file — surface the
          review entry point (the redline surface). Honest: it's a detected diff
          awaiting review, not an applied change. */}
      {pendingUpdate && onReviewUpdate && (
        <button type="button" className={s.updateBanner} onClick={() => onReviewUpdate()}>
          <span className={s.updateIcon}><Icon name="icon-refresh" /></span>
          <span className={s.updateBody}>
            <strong>{pendingUpdate.document.name} has a newer version to review</strong>
            <span>{pendingUpdate.changes.filter((c) => !c.minor).length} material changes detected between {pendingUpdate.accepted.version} and {pendingUpdate.pending.version} — review before it replaces the saved copy.</span>
          </span>
          <span className={s.updateCta}>Review update <Icon name="icon-arrow-right" /></span>
        </button>
      )}

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
// Compliance Update Review (redline) — frame-26. A focused review surface for one
// pending document update: the before/after identity, a per-field change list,
// the section-level redline, and an action footer. Every action is an honest
// stub — accepting/keeping is a backend write that lands when storage is wired.
// ---------------------------------------------------------------------------
export function RedlineView({ data = REDLINE_MOCK, onBack, onToast }) {
  const [showMinor, setShowMinor] = useState(false);
  const [docMode, setDocMode] = useState("redline"); // saved | latest | redline
  const [highlightOnly, setHighlightOnly] = useState(true);
  const [comment, setComment] = useState("");
  const [openChange, setOpenChange] = useState(null);

  const soon = (what) => onToast?.(`${what} connects when storage is wired up.`);

  const material = data.changes.filter((c) => !c.minor);
  const minor = data.changes.filter((c) => c.minor);
  const visibleChanges = showMinor ? data.changes : material;
  // Index changes by their 1-based position in the full list so the redline's
  // [Change N] tags line up with the numbered rows above.
  const changeNumber = useMemo(() => {
    const map = new Map();
    data.changes.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [data.changes]);

  const meta = DOC_TYPES[data.document.type];
  // "Highlight changes only" dims unchanged context so the redline pops — it
  // doesn't hide sections (the full document stays reviewable).
  const dimContext = docMode === "redline" && highlightOnly;

  return (
    <div className={s.rlPage}>
      <header className={s.rlHead}>
        <div>
          {onBack && (
            <button type="button" className={s.rlBack} onClick={() => onBack()}>
              <Icon name="icon-chevron-left" />Back to evidence
            </button>
          )}
          <h1 className={s.rlTitle}>Compliance Update Review</h1>
          <p className={s.rlSubtitle}>Review material changes before replacing saved evidence.</p>
        </div>
      </header>

      {/* Identity + summary */}
      <section className={s.rlIdentity}>
        <div className={s.rlIdentCol}>
          <div className={s.rlIdentRow}>
            <span className={`${s.rlIdentIcon} ${s[`tint_${meta.tint}`]}`}><Icon name="icon-file-text" /></span>
            <div><span className={s.rlIdentLabel}>Document</span><strong className={s.rlIdentValue}>{data.document.name}</strong></div>
          </div>
          <div className={s.rlIdentRow}>
            <span className={s.rlIdentIcon}><Icon name="icon-package" /></span>
            <div><span className={s.rlIdentLabel}>Product</span><strong className={s.rlIdentValue}>{data.document.product}</strong></div>
          </div>
          <div className={s.rlIdentRow}>
            <span className={s.rlIdentIcon}><Icon name="icon-building" /></span>
            <div><span className={s.rlIdentLabel}>Manufacturer</span><strong className={s.rlIdentValue}>{data.document.manufacturer}</strong></div>
          </div>
        </div>

        <div className={s.rlIdentCol}>
          <div className={s.rlIdentRow}>
            <span className={s.rlIdentIcon}><Icon name="icon-calendar" /></span>
            <div>
              <span className={s.rlIdentLabel}>{data.accepted.label}</span>
              <span className={s.rlVersionLine}><strong className={s.rlIdentValue}>{data.accepted.version}</strong><span className={`${s.rlVerTag} ${s.rlVerCurrent}`}>Current</span></span>
            </div>
          </div>
          <div className={s.rlIdentRow}>
            <span className={s.rlIdentIcon}><Icon name="icon-calendar" /></span>
            <div>
              <span className={s.rlIdentLabel}>{data.pending.label}</span>
              <span className={s.rlVersionLine}><strong className={s.rlIdentValue}>{data.pending.version}</strong><span className={`${s.rlVerTag} ${s.rlVerPending}`}>Pending</span></span>
            </div>
          </div>
        </div>

        <div className={s.rlSummary}>
          <div className={s.rlStatusRow}>
            <span className={s.rlIdentLabel}>Status</span>
            <span className={s.rlNeedsReview}>Needs review</span>
          </div>
          <div className={s.rlCounts}>
            <div className={s.rlCount}>
              <strong className={s.rlCountMaterial}>{material.length}</strong>
              <span>material changes detected</span>
            </div>
            <div className={s.rlCount}>
              <strong>{minor.length}</strong>
              <span>minor updates</span>
            </div>
          </div>
        </div>

        <button type="button" className={s.rlOutlineBtn} onClick={() => soon("Original document preview")}>
          <Icon name="icon-share" />View original PDFs
        </button>

        <p className={s.rlAckNote}>
          <Icon name="icon-info" />
          Staff acknowledgment recommended if the update affects {data.ackTriggers.join(", ")}.
        </p>
      </section>

      <div className={s.rlMain}>
        <div className={s.rlLeft}>
          {/* Detected changes */}
          <section className={s.rlCard}>
            <div className={s.rlCardHead}>
              <h2 className={s.rlCardTitle}><span className={s.rlStep}>1</span>Detected changes ({material.length})</h2>
              {minor.length > 0 && (
                <label className={s.rlToggle}>
                  <span>Show minor changes ({minor.length})</span>
                  <input type="checkbox" checked={showMinor} onChange={(e) => setShowMinor(e.target.checked)} />
                  <span className={s.rlToggleTrack} aria-hidden="true"><span className={s.rlToggleKnob} /></span>
                </label>
              )}
            </div>

            <div className={s.rlTableScroll}>
              <table className={s.rlTable}>
                <colgroup>
                  <col className={s.rlColChange} />
                  <col className={s.rlColSection} />
                  <col className={s.rlColOld} />
                  <col className={s.rlColNew} />
                  <col className={s.rlColImpact} />
                  <col className={s.rlColConf} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Change</th>
                    <th>Section</th>
                    <th>Old text (saved)</th>
                    <th>New text (latest)</th>
                    <th>Impact</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleChanges.map((c) => {
                    const n = changeNumber.get(c.id);
                    const imp = IMPACT_META[c.impact] || IMPACT_META.low;
                    const kind = CHANGE_KIND_META[c.kind] || CHANGE_KIND_META.changed;
                    const expanded = openChange === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr className={s.rlRow} onClick={() => setOpenChange(expanded ? null : c.id)}>
                          <td>
                            <span className={s.rlChangeCell}>
                              <span className={`${s.rlNum} ${s[imp.cls]}`}>{n}</span>
                              <span className={s.rlChangeText}>
                                <span className={s.rlChangeTitle}>{c.title}</span>
                                <span className={`${s.rlKind} ${s[kind.cls]}`}>{kind.label}</span>
                              </span>
                            </span>
                          </td>
                          <td className={s.rlSectionCell}>{c.section} {c.sectionLabel}</td>
                          <td className={s.rlOldCell}><RedlineText segments={c.segments} mode="old" /></td>
                          <td className={s.rlNewCell}><RedlineText segments={c.segments} mode="new" /></td>
                          <td>
                            <span className={s.rlImpactCell}>
                              <span className={`${s.rlImpact} ${s[imp.cls]}`}>{imp.label}</span>
                              {c.impactNote && <span className={s.rlImpactNote}>{c.impactNote}</span>}
                            </span>
                          </td>
                          <td>
                            <span className={s.rlConfCell}>
                              <Icon name="icon-check-circle" className={s.rlConfIcon} />
                              {c.confidence}
                              <Icon name="icon-chevron-down" className={`${s.rlConfChevron} ${expanded ? s.rlConfChevronOpen : ""}`} />
                            </span>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className={s.rlDetailRow}>
                            <td colSpan={6}>
                              <div className={s.rlDetail}>
                                <span className={s.rlDetailLabel}>Redline</span>
                                <RedlineText segments={c.segments} mode="redline" />
                                <span className={s.rlDetailMeta}>
                                  Section {c.section} · {c.sectionLabel} · {kind.label} · {imp.label} impact · {c.confidence} confidence
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Redline document */}
          <section className={s.rlCard}>
            <div className={s.rlCardHead}>
              <h2 className={s.rlCardTitle}><span className={s.rlStep}>2</span>Redline document</h2>
            </div>

            <div className={s.rlDocBar}>
              <div className={s.rlTabs}>
                {[["saved", "Saved version"], ["latest", "Latest version"], ["redline", "Redline"]].map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    className={`${s.rlTab} ${docMode === m ? s.rlTabOn : ""}`}
                    onClick={() => setDocMode(m)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={s.rlDocActions}>
                <button type="button" className={s.rlDocBtn} onClick={() => soon("Document search")}><Icon name="icon-search" />Search</button>
                <button type="button" className={s.rlDocBtn} onClick={() => soon("Document download")}><Icon name="icon-archive-down" />Download</button>
              </div>
            </div>

            <div className={s.rlDocBody}>
              <nav className={s.rlJump}>
                <span className={s.rlJumpLabel}>Jump to section</span>
                {data.sections.map((sec) => (
                  <button key={sec.id} type="button" className={s.rlJumpItem} onClick={() => soon("Section jump")}>
                    <Icon name="icon-file-text" />{sec.num} {sec.title}
                  </button>
                ))}
              </nav>

              <div className={s.rlDoc}>
                {data.sections.map((sec) => (
                  <article key={sec.id} className={s.rlSection}>
                    <div className={s.rlSectionHead}>
                      <h3 className={s.rlSectionTitle}><span className={s.rlSectionNum}>{sec.num}</span>{sec.title}</h3>
                      {sec.changeRef != null && <span className={s.rlSectionRef}>[Change {sec.changeRef}]</span>}
                    </div>
                    <p className={s.rlSectionBody}><RedlineText segments={sec.body} mode={docMode} dim={dimContext} /></p>
                  </article>
                ))}
              </div>
            </div>

            <div className={s.rlDocFoot}>
              <label className={s.rlCheck}>
                <input type="checkbox" checked={highlightOnly} onChange={(e) => setHighlightOnly(e.target.checked)} />
                <span>Highlight changes only</span>
              </label>
              <button type="button" className={s.rlLink} onClick={() => soon("Full redline view")}>
                Open full redline in new tab <Icon name="icon-share" />
              </button>
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className={s.rlRail}>
          <div className={s.rlCard}>
            <h3 className={s.rlRailTitle}>Review actions</h3>
            <div className={s.rlActions}>
              <button type="button" className={s.rlActPrimary} onClick={() => soon("Accepting the update")}>
                <Icon name="icon-check" />Accept and archive previous version
              </button>
              <button type="button" className={s.rlAct} onClick={() => soon("Keeping the current version")}>
                <Icon name="icon-refresh" />Keep current version
              </button>
              <button type="button" className={s.rlAct} onClick={() => soon("Staff acknowledgment requests")}>
                <Icon name="icon-users" />Request staff acknowledgment
              </button>
              <button type="button" className={s.rlAct} onClick={() => soon("Task creation")}>
                <Icon name="icon-edit" />Create task
              </button>
              <button type="button" className={s.rlAct} onClick={() => soon("Marking not applicable")}>
                <Icon name="icon-x-circle" />Mark not applicable
              </button>
            </div>

            <label className={s.rlCommentLabel} htmlFor="rl-comment">Reviewer comment</label>
            <textarea
              id="rl-comment"
              className={s.rlComment}
              placeholder="Add a note for the record (optional)…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />

            {data.ackRecommended && (
              <p className={s.rlWarn}>
                <Icon name="icon-alert-triangle" />
                This update affects use, PPE, storage, and disposal. Staff acknowledgment is recommended.
              </p>
            )}
          </div>

          <div className={s.rlCard}>
            <h3 className={s.rlRailTitle}>Document details</h3>
            <dl className={s.rlDetails}>
              <div><dt>Manufacturer</dt><dd>{data.document.manufacturer}</dd></div>
              <div><dt>Linked item</dt><dd>{data.document.product}</dd></div>
              <div><dt>Linked location</dt><dd>{data.document.linkedLocation}</dd></div>
              <div><dt>Current saved version</dt><dd>{data.accepted.version}</dd></div>
              <div><dt>Latest detected version</dt><dd><span className={s.rlPendingInline}>{data.pending.version}<span className={`${s.rlVerTag} ${s.rlVerPending}`}>Pending</span></span></dd></div>
              <div><dt>Confidence</dt><dd className={s.rlConfDd}>{data.confidence}<Icon name="icon-check-circle" /></dd></div>
            </dl>
            <button type="button" className={s.rlLink} onClick={() => soon("Version history")}>
              View version history <Icon name="icon-share" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
