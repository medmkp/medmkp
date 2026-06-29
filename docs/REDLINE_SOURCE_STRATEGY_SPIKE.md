# Spike: How TraceDDS Learns an SDS/IFU Has Changed

> **Status:** Decision proposed — awaiting approval. Resolves [#355] and the
> "Master SDS/IFU corpus: build vs. buy" open decision in
> [`TRACEDDS_PIVOT_PLAN.md`](./TRACEDDS_PIVOT_PLAN.md) (§Open decisions #2) and
> the "Master-document source" open decision in epic [#310].
>
> This is an **architecture/research spike, not implementation.** No schema or
> service is built here. It recommends a v1 source strategy and a later strategy,
> documents the tradeoffs, and defines the source-agnostic **update-event shape**
> that the Redline workflow ([#348]–[#354]) builds against.

[#355]: https://github.com/tracedds/tracedds/issues/355
[#310]: https://github.com/tracedds/tracedds/issues/310
[#348]: https://github.com/tracedds/tracedds/issues/348
[#349]: https://github.com/tracedds/tracedds/issues/349
[#350]: https://github.com/tracedds/tracedds/issues/350
[#351]: https://github.com/tracedds/tracedds/issues/351
[#352]: https://github.com/tracedds/tracedds/issues/352
[#353]: https://github.com/tracedds/tracedds/issues/353
[#354]: https://github.com/tracedds/tracedds/issues/354

---

## TL;DR recommendation

- **v1 source strategy: manual replace, version, diff** — a known document is
  superseded by a new file that an **office manager uploads** or that **TraceDDS
  ops stages** for a practice. TraceDDS stores it as an immutable pending version,
  generates the field-level diff, and routes it to review. **Zero data-rights
  risk, near-zero cost, no unsolved dependency**, and it proves the entire
  Redline workflow (versioning → diff → review → re-acknowledgment → Dashboard
  clear) end to end. This is the floor every other strategy is measured against.

- **Later source strategy: licensed SDS corpus for SDS + a scoped
  manufacturer-page watcher for IFUs.** Once the workflow is proven and volume
  justifies it, **buy** versioned SDS data (a commercial SDS-management database)
  to get authoritative revision dates and handled data rights for the chemical
  documents that dominate a dental practice. IFUs and service/waterline records
  are *not* in SDS databases, so cover those with a **narrow allowlist watcher**
  built on the crawl infra we already run — not an open-web crawler.

**Do not build an open-web manufacturer crawler as the change-detection source.**
It is the highest-burden, highest-compliance-risk option and its core failure
mode — silently missing a revision while telling a practice it is "current" — is
worse for an audit-readiness product than honest manual replacement.

The source strategy is deliberately decoupled from the workflow: **whatever the
source, it emits the same update event** (defined below). v1 ships with one
emitter (manual). Later strategies add emitters without touching the diff/review/
audit engine.

---

## Why the source is a separable decision

The retention value in the pivot ([`TRACEDDS_PIVOT_PLAN.md`](./TRACEDDS_PIVOT_PLAN.md)
Phase 5) is the **redline review and re-acknowledgment loop**, not the crawler.
A practice's office manager already learns about many revisions through normal
channels — a distributor ships a reformulated product, a rep emails an updated
IFU, a manufacturer posts a new SDS revision. The hard, differentiated part
TraceDDS owns is turning "here is a newer document" into *"here is exactly what
changed, who must re-acknowledge it, and whether your audit packet is still
clean."*

That means we can ship the entire workflow with a **manual** emitter and add
automated discovery later as a coverage/convenience upgrade. Coupling the epic to
an unsolved corpus problem would block seven shippable issues behind a build-vs-buy
negotiation. Decoupling unblocks [#348]–[#354] immediately.

---

## Options considered

Five ways TraceDDS could learn a document changed, scored on the five axes the
issue asks for. Cost and burden are characterized qualitatively (ranges, not
quotes — a real number needs a procurement RFQ); the **relative** ordering is the
decision-relevant part.

### A. Manual replace / assisted upload — **recommended v1**

The practice uploads the new file, or TraceDDS ops stages it for the practice when
they receive it out-of-band. The pipeline then does the real work: store immutable
version → extract fields → diff vs. accepted version → pending review.

- **Cost:** near zero. Reuses Evidence Upload ([#308]) + extraction ([#309]).
  No licensing, no proxy credits, no per-manufacturer adapter.
- **Reliability:** the *workflow* is fully reliable; *coverage* depends on a human
  noticing a change. Honest about that — it never asserts "we caught everything."
- **Data rights:** clean. The practice supplies a document it already possesses
  for its own compliance file; TraceDDS stores and diffs it for that practice. No
  redistribution, no scraping ToS exposure.
- **Operational burden:** low and bounded; it's user-driven, not a service we
  babysit. No crawl breakage, no captcha arms race.
- **Compliance risk:** lowest. TraceDDS never claims to be the authoritative
  source of "the latest SDS"; it is a faithful version/diff/audit ledger over
  documents the practice provides.
- **Why v1:** proves versioning, diff, review-state-machine, re-acknowledgment,
  and Dashboard clearance ([#348]–[#354]) with **no external dependency**. If the
  workflow isn't valuable manually, no amount of automated sourcing saves it.

### B. Licensed SDS corpus (buy) — **recommended later, for SDS only**

License a commercial SDS-management database (the category: VelocityEHS/MSDSonline,
Verisk 3E, ChemTel, SiteHawk, Chemical Safety — names for orientation, not an
endorsement or a confirmed integration). These maintain millions of
manufacturer-authored SDSs with **revision dates and supersession already
modeled** — exactly the "versioned master document" Phase 5 needs.

- **Cost:** material and recurring — enterprise licensing, typically seat- or
  API-volume-priced, plus procurement lead time. Needs an RFQ before committing.
- **Reliability:** high for SDS specifically; revision tracking is the vendor's
  core product. Coverage is broad for branded chemical products (disinfectants,
  etchants, bonding agents) but **not** for device IFUs, waterline, or service
  records, which are out of scope for these databases.
- **Data rights:** the cleanest *automated* option — the license explicitly grants
  redistribution to our customers, which scraping does not.
- **Operational burden:** moderate — one well-documented integration to maintain
  rather than N brittle site adapters.
- **Compliance risk:** low *for covered documents*; the vendor stands behind
  authoritativeness. Risk is **coverage gaps** (a product not in their corpus
  silently never updates) — must be surfaced, not hidden.
- **Why later, not v1:** overkill before the workflow is proven; SDS-only;
  procurement lead time; cost unjustified at low document volume.

### C. Manufacturer-page watcher (scoped allowlist crawl) — **recommended later, for IFUs**

A *narrow* watcher over a hand-curated allowlist of known manufacturer SDS/IFU
landing pages (start with the manufacturers behind the
[top-50 reorder products](./top-50-dental-reorder-products.md) — e.g. the SDS page
for a CaviWipes-class surface disinfectant, a nitrile-glove line, an etchant).
Periodically fetch the current PDF, compare a content hash to the stored version,
and emit an update event on a real change. This is **build-crawler-lite**: an
allowlist of specific document URLs, not open-web discovery.

- **Cost:** moderate and incremental — **reuses infra we already run**: the
  supplier `discover → index → extract` pipeline, per-source adapters, the
  ScraperAPI proxy with credit auditing, and the Airflow scheduled-DAG pattern
  (see [`SUPPLIER_INGESTION.md`](./SUPPLIER_INGESTION.md)). Cost scales with the
  allowlist size, not the whole web.
- **Reliability:** medium. Manufacturer sites are heterogeneous and unannounced;
  pages move, PDFs get re-hosted on CDNs, anti-bot interstitials return HTTP 200
  (we already see this on marketplaces). Each manufacturer is effectively its own
  adapter to maintain.
- **Data rights:** caution. Fetching a public PDF for change-*detection* is
  defensible; **redistributing** it to a practice as "the official current SDS"
  is the exposed claim. Mitigate by linking out to the manufacturer's page and/or
  pairing with the licensed corpus (Option B) for the authoritative copy.
- **Operational burden:** the highest ongoing-maintenance option per unit of
  coverage — adapters break when sites change.
- **Compliance risk:** medium-high **if** it's the authoritative signal. A missed
  revision produces a false "you're current." Acceptable as a *supplementary*
  detector that only ever stages a **pending** version for human review — never as
  the sole guarantee. Best reserved for **IFUs**, which the licensed SDS corpus
  doesn't cover.

### D. Supplier / distributor feed — not a reliable change signal

Distributors (Net32, Henry Schein, Patterson) attach SDS/IFU links to product
pages, and we already ingest supplier catalogs.

- **Cost:** low-moderate (extends existing ingestion).
- **Reliability:** poor *as a change detector* — distributor docs are inconsistent,
  frequently stale, rarely carry a manufacturer revision number, and there's no
  "revision changed" signal; we'd be diffing whatever they happen to host.
- **Data rights:** distributor ToS restrictions on scraping/redistribution.
- **Burden / risk:** medium burden, medium risk; same false-currency failure mode
  as a crawler with worse source fidelity.
- **Verdict:** possible *enrichment* input later (a candidate file to diff), never
  the primary change-detection trigger.

### E. Manufacturer feed (direct/structured) — aspirational

A manufacturer pushing structured revision notifications would be ideal — clean
rights, authoritative, low burden. In practice dental manufacturers rarely offer
this, and we have no leverage to make them. **Not available for v1 or the
foreseeable later phase**; revisit opportunistically if a major manufacturer
partnership materializes.

---

## Decision matrix

| Option | Cost | Reliability | Data rights | Op. burden | Compliance risk | Role |
|---|---|---|---|---|---|---|
| **A. Manual replace** | ~zero | Workflow: high · Coverage: human-dependent | Clean | Low | **Lowest** | **v1** |
| **B. Licensed SDS corpus** | High, recurring | High (SDS only) | Clean (licensed) | Moderate | Low; coverage gaps | **Later (SDS)** |
| **C. Scoped page watcher** | Moderate, incremental | Medium | Caution (redistribution) | **Highest/coverage** | Medium-high if sole source | **Later (IFU)** |
| D. Supplier feed | Low-moderate | Poor as change signal | Distributor ToS | Medium | Medium | Enrichment only |
| E. Manufacturer feed | n/a | n/a | Clean | Low | Low | Unavailable |

---

## The minimum update-event shape

This is the spike's central contract. **Every source emits the same event**; the
diff/review/audit engine consumes it and never knows or cares which source
produced it. v1 ships exactly one emitter (manual upload). Adding Option B or C
later means adding an emitter — no change to the workflow downstream.

```text
EvidenceUpdateEvent
  evidence_document_id     # the tracked doc this supersedes
                           #   (nullable = brand-new-document candidate, not a redline)
  source_kind              # manual_replace | manufacturer_watch | supplier_feed | licensed_corpus
                           #   (aligns with version.source_kind in epic #310)
  source_ref               # provenance: upload id | watched URL | corpus document id
  candidate_file
    storage_key            # object storage, NOT Postgres (pivot plan open-decision #1)
    mime_type
    file_size_bytes
    sha256                 # content hash — dedupe + idempotency (see below)
  detected_at              # when TraceDDS observed the candidate
  manufacturer_revision    # nullable: revision no./date printed ON the document = authoritative
  effective_date           # nullable
  extracted_fields_json    # nullable at emit time; filled by extraction (#309) before diff
  affected_product_refs[]  # for Dashboard impact + which coverage requirement (#354)
  affected_location_refs[]
  confidence               # 0–1: how sure this is a real, material change (watcher < manual)
```

### Three rules the event must obey

1. **Always pending, never auto-accept.** An event creates a *pending* version and
   a *pending* diff and routes to human review. The binder/viewer keep serving the
   last **accepted** version until a reviewer approves (epic [#310] acceptance:
   "Binder/viewer use the current accepted version, not an unapproved pending
   update"). This holds even for the high-trust licensed-corpus source — TraceDDS
   surfaces changes; a human attests to them.

2. **Content-hash idempotency.** `sha256` over the candidate file dedupes. A
   watcher re-fetching an unchanged PDF, or the same file uploaded twice, must
   **not** create a new version or re-alert. Only a new hash is a candidate.

3. **Material-change gate (anti-alert-fatigue).** Emit/flag for re-acknowledgment
   only when the hash differs **and** (a normalized extracted field changed **or**
   `manufacturer_revision` changed). A re-typeset/re-hosted PDF with identical
   fields is recorded as a new version but should **not** force re-acknowledgment.
   Which field changes are "material" (e.g. hazard statements, PPE requirements,
   first-aid measures on an SDS) is a product/compliance call to settle in the
   diff-generation issue ([#350]).

### Worked example

> A practice tracks the SDS for its CaviWipes-class surface disinfectant
> (accepted version `v3`, manufacturer revision 2023-08). The manufacturer
> publishes revision 2026-05 changing a hazard statement and the recommended PPE.
>
> - **v1 (manual):** the office manager uploads the new PDF. Emitter produces an
>   `EvidenceUpdateEvent` with `source_kind=manual_replace`, a new `sha256`,
>   `manufacturer_revision=2026-05`. Extraction fills fields; the gate sees a
>   changed hazard statement → **material** → pending diff `v3 → v4` routed to
>   review; Dashboard raises a compliance task. Reviewer approves; `v4` becomes
>   accepted; re-acknowledgment recorded; Dashboard clears.
> - **Later (licensed corpus):** the same event is emitted automatically with
>   `source_kind=licensed_corpus` the day the vendor indexes revision 2026-05 — no
>   human had to notice. Everything downstream is identical.

---

## Sequencing & follow-up issues

The Redline child issues already exist; this spike does **not** open new ones
(the issue's acceptance: *"Produces follow-up implementation issues only after the
decision is approved"*). On approval of the manual-v1 decision, these are
**unblocked as-is** because none of them depend on the corpus:

| Issue | What | Status under manual-v1 |
|---|---|---|
| [#348] | Evidence document versioning model | **Unblocked** — immutable versions |
| [#349] | Manual replacement-version API | **Unblocked** — this *is* the v1 emitter |
| [#350] | Field-level diff from metadata/extracted fields | **Unblocked** — incl. material-change gate |
| [#351] | Approve/reject/request-revision APIs | **Unblocked** — review state machine |
| [#352] | Frame-26 review UI | **Unblocked** |
| [#353] | Wire review UI to workflow APIs | **Unblocked** |
| [#354] | Surface pending review in Dashboard | **Unblocked** — compliance-priority task |

**Deferred until the later-strategy decision is separately approved** (do not file
yet): (1) licensed-SDS-corpus integration + emitter, (2) scoped manufacturer-page
IFU watcher built on the existing crawl/Airflow infra, (3) coverage-gap reporting
that tells a practice which tracked documents have *no* automated source so the
"current" claim stays honest.

---

## Open questions for the approver

1. **v1 manual emitter owner:** office-manager self-serve upload, TraceDDS-ops
   staging on the practice's behalf, or both? (Affects [#349] surface area.)
2. **Material-change policy:** which SDS/IFU fields force re-acknowledgment vs.
   record-silently? (Settle in [#350].)
3. **Later-strategy trigger:** what document volume / customer count justifies
   paying for the licensed corpus (Option B)?
4. **Authoritativeness copy:** exact UI language so TraceDDS never overclaims it
   detected "every" manufacturer update before an automated source proves it
   (epic [#310] non-goal).
