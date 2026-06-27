# TraceDDS Pivot Plan

**Status:** Proposed — 2026-06-22
**Author:** drafted with Claude from Sean's pivot screenshots (`~/Downloads/TraceDDS (New)/`)

## TL;DR

The product is now **TraceDDS**. The center of gravity moves from *"find the cheapest
supplier"* to *"be the system of record for what's on a practice's shelves and whether
they're audit-ready."* The name encodes it: **Trace** (traceability) **DDS** (dental).

Savings does not disappear — it becomes the **free acquisition hook** ("scan your shelves,
see what you'd save"). Once a practice scans, we own their inventory + compliance data,
and that is what retains them.

This is a **pivot of the same product**, not a new product spun out alongside the old one.
There is no live TraceDDS to keep running (pre-customer, ingestion DAGs paused), so we extend
the existing codebase rather than fork it.

---

## What changes

### New information architecture (left rail)

`Dashboard · Needs Attention · Reorder List · Locations · Scan Sessions · Savings · Evidence · Reports · Settings`

Sub-surfaces: Office Layout, Compliance Binder, QR Labels.

Savings drops from "the homepage" to item #6.

### The five new pillars

1. **Locations** — supplies live in physical places (Hygiene Cabinet, Operatory 1/2,
   Sterilization, Emergency Kit, Lab, Storage). Location Board, drag-and-drop **Office Layout**
   floor-plan editor, and **per-cabinet QR labels** you print and stick on shelves.
   This is the new organizing primitive.

2. **Inventory** — each location holds stock with *qty on hand, par level, shelf/area,* and
   critically **lot number, expiration date, package condition, and photo proof.** Replaces
   the jsonb reorder-list as the data spine.

3. **Scan Sessions** — the scanner is reworked from "scan barcode → add to reorder list" into
   a stateful, resumable **inventory audit**: choose location → scan → confirm match → capture
   shelf + traceability → review queue (*confirmed / needs details / needs review*; exact
   matches auto-add, exceptions reviewed later).

4. **Evidence / Compliance** — the genuinely new product and the differentiator. Upload or
   **mobile-scan compliance documents** (SDS, IFU, expiration proof, lot proof, service records);
   a document-AI step classifies, extracts fields, and matches them to a product/location. Then:
   **Evidence Library** with coverage tracking, an **audit-readiness score**, a
   **Compliance Binder / Audit Packet** PDF for inspectors, a read-only **presentation mode**,
   and — the recurring-revenue piece — **SDS/IFU update monitoring with redline diffs** that
   force re-acknowledgment when a manufacturer revises a document.

5. **Needs Attention** — a daily worklist aggregating every exception (expired, expiring soon,
   missing lot, missing proof, needs reorder) across inventory + compliance. The screen a
   practice opens every morning.

The **Reorder List** levels up with usage-based **forecasting** (usage model, par level,
days-of-cover, predicted reorder date) and produces a "Reorder Draft" → supplier handoff.

### What carries over vs. what's net-new

| Reused (existing moat) | Net-new (the build) |
|---|---|
| Catalog + matching engine + pack normalization | Locations + Office Layout + QR labels |
| Barcode / GTIN / HIBC scanning stack | Inventory model (lots, expirations, par) |
| Net32 + supplier ingestion + pricing → feeds the *lure* + reorder drafts | Stateful Scan Sessions + review queue |
| Medusa auth / dental_practice | Evidence: file storage + document-AI pipeline |
| Savings / matcher / landed-cost (demoted, kept working) | Compliance engine + audit packet + SDS/IFU redline |

The matching + scanning stack is exactly what makes scan-to-inventory feel magic — that
investment pays off here.

---

## Repo & branding decision

**Don't fork. Transfer-and-rename.** A fork is for two codebases diverging in parallel; we
have one product becoming another. Plan:

1. Create the **`tracedds` GitHub org** (needed anyway for brand/domain/secrets). *(Sean to do.)*
2. **Transfer** the existing repository into it under **`tracedds/tracedds`**. Transfer preserves
   all history/PRs/issues and sets up redirects so existing clones, the NUC remote, and
   Render/Vercel git integrations keep working until re-pointed.

### Rebrand in layers, not a big-bang find/replace

Current footprint: 177 files mention `tracedds`; `/tracedds/*` API prefix has 107 refs;
~12 `TRACEDDS_*` env vars; a `tracedds` Medusa module; **95 distinct `tracedds_*` DB identifiers**
on the prod Render Postgres.

| Tier | What | Recommendation |
|---|---|---|
| **User-facing** | Logo, copy, titles, `tracedds.com`, frontend | **Do now** (Phase 0) |
| **Code identifiers** | npm package names, `tracedds` module dir, `TRACEDDS_*` env vars | **Do opportunistically** (Phase 0/1) |
| **`/tracedds/*` route prefix** | 107 refs, BE + FE in lockstep, invisible to users | **Leave or alias**; rename later only if it bugs us |
| **95 `tracedds_*` DB objects** | Migrations + matview rebuilds + reindex under load on a 1GB PG that already OOMs, for zero user value | **Leave permanently** as a legacy schema namespace |

The DB prefix is the schema's internal namespace — nobody sees it. Renaming it is pure risk
against a prod database that has already fallen over on heavy refreshes, with no user upside.

---

## Phased migration plan

Sequencing is gated by the data spine: **Locations → Inventory** must land before Scan Sessions
and Evidence have anywhere to write.

### Phase 0 — Brand + IA reskin
Complete the TraceDDS brand pass (logo/copy/domain), stand up the new nav rail, demote Savings.
One-time infra task alongside: new org + repo transfer + new domain + re-point Render/Vercel/NUC.
Mostly frontend. Low risk; makes the pivot visible immediately.
**Verify:** app builds, renders TraceDDS, new rail navigates, Savings demoted.

### Phase 1 — Locations + Inventory spine
Locations entity, Location Board, Office Layout editor, QR label generation. Inventory items
per location (qty on hand, par level). Multi-user + roles + attributable sign-off likely land
here. The backbone everything hangs off; biggest schema add.
**Verify:** create locations, place them on the layout, print a QR sheet, see per-location stock
with par/qty.

### Phase 2 — Scan Sessions + traceability capture
Rework the scanner into stateful, resumable sessions: choose location → scan → confirm match →
capture shelf details + lot/expiration/condition/photo → review queue. Reuses the barcode/match
stack; produces the lot/expiration data later phases depend on.
**Verify:** run a session against a location, scan → confirm → capture lot/expiration/photo →
review queue clears.

### Phase 3 — Evidence & Compliance (split 3a / 3b)
The heaviest, highest-value, riskiest chunk.
- **3a — Capture + Library:** file storage (object storage, **not** Postgres) + upload + mobile
  document scan; document-AI classify + extract + match to product/location; Evidence Library +
  coverage tracking.
  **Verify:** upload/scan an SDS → auto-classified + matched + appears in Library.
- **3b — Audit readiness:** Compliance Binder / Audit Packet PDF export, presentation mode,
  coverage scoring; wire Needs Attention to compliance gaps.
  **Verify:** generate an Audit Packet PDF; coverage score reflects gaps; Needs Attention
  surfaces missing proof.

### Phase 4 — Forecasting + reorder intelligence
Usage models, par-based forecasting, predicted reorder dates, depletion auto-builds a Reorder
Draft with savings attached. Where the "lure" pays back.
**Verify:** usage model predicts a reorder date; depletion auto-builds a draft; savings shows on it.

### Phase 5 — Compliance maintenance (recurring value)
SDS/IFU update monitoring + redline review + re-acknowledgment. Needs a versioned master-document
corpus. The retention / recurring-revenue engine.
**Verify:** a revised manufacturer SDS triggers a redline + re-acknowledgment.

---

## Open decisions (need a call before Phase 1)

1. **File storage + document-AI is brand-new infra.** Blobs go to object storage (S3/R2), **not**
   the 1GB Render Postgres that already OOMs. The OCR/classify/extract step is a vision-LLM
   pipeline — net-new and the hardest new capability. Spec separately.
2. **Master SDS/IFU corpus: build vs. buy.** The redline feature (Phase 5) needs *versioned*
   master documents to diff against. Crawl manufacturer sites, or license an SDS database?
3. **Compliance requirement model needs a source of truth** (OSHA HazCom, CDC infection control,
   state dental-board rules). The "audit-ready" claim is only as good as this. Own research spike.
4. **Multi-user + roles.** Compliance needs attributable sign-off (screens already show
   "Alex Kim, Office Manager"). Auth is currently single-practice login. Roles + audit trail
   likely belong in Phase 1.
