# Evidence object-storage provider — decision spike

**Status:** Recommended — 2026-06-28 · **Decision/spike only** (gates #334, epic #308)
**Scope:** choose where Evidence files (SDS / IFU / lot / expiry / service / price /
waterline proof — PDFs + images) live, and define the upload + signed-view contract
#334 will implement. **No code is changed by this doc.** Follow-ups below are
*proposed*, not filed — file them only after Sean approves the provider.

---

## TL;DR

**Use Cloudflare R2 as the v1 evidence store, accessed through Medusa's
already-installed `@medusajs/file-s3` provider** (R2 speaks the S3 API). Keep file
bytes out of the 1 GB Render Postgres (it already OOMs — pivot plan "Open decisions"
#1); Postgres holds only the metadata row that already exists
(`medmkp_evidence_document.storage_key`).

Why R2 over plain S3 / Supabase Storage:

- **Zero egress fees.** Evidence is read-heavy — every Library "View file", every
  Audit Packet, every inspector hand-off re-serves the same PDFs/images. R2 charges
  **$0 egress**; S3 and Supabase bill ~$0.09/GB out. At our read pattern that is the
  single biggest cost lever.
- **No new SDK, no bespoke adapter.** The backend is **Medusa 2.15.5** and
  `@medusajs/file-s3` + `@medusajs/file-local` are **already in `node_modules`**. R2
  is S3-compatible, so #334 configures the built-in File Module instead of writing a
  storage adapter — far less to build and maintain.
- **Generous free tier for a pre-customer phase.** 10 GB storage, 1 M writes,
  10 M reads per month free — we likely pay $0 through early pilots.
- **Compliance posture is sufficient for *these* documents** (see below): the
  evidence set is **not PHI**, so R2's SOC 2 Type II + GDPR DPA + optional EU
  jurisdiction is enough; we do not need an S3 HIPAA BAA for v1.

**One explicit caveat that decides the whole thing:** this recommendation rests on
evidence documents **not** carrying patient-identifying health information (PHI). If
that assumption ever breaks (a practice uploads patient records), R2 is wrong —
Cloudflare does **not** sign a BAA for R2 — and we revisit toward **AWS S3 + BAA**.
The S3-compatible abstraction below makes that switch a config change, not a rewrite.

---

## What we're storing (and why compliance is lighter than it looks)

The seven evidence types (`app/evidence.jsx` `DOC_TYPES`) are **product- and
equipment-facing**, not patient-facing:

| Type | Content | PII/PHI? |
|---|---|---|
| SDS | Manufacturer safety data sheets | Public docs, no PII |
| IFU | Device instructions for use | Public docs, no PII |
| Expiration proof | Photo of a package's printed expiry | No PII |
| Lot / UDI | Lot/UDI captured off packaging | No PII |
| Service | Autoclave/spore-test/equipment logs | Staff name at most — limited PII |
| Price | Supplier quotes | Business data, no PII |
| Waterline | Dental-unit waterline test results | No PII |

So the realistic PII exposure is **operational, not clinical** — a staff member's name
on a service log (already modeled as `uploaded_by` / `reviewed_by`). That is "limited
PII" governed by a standard **DPA + encryption at rest/in transit**, **not** PHI
requiring a HIPAA BAA. This is the load-bearing judgement; it should get a one-line
business/legal confirmation (listed under "Human must provision"). The upload UI
should also discourage uploading anything patient-identifying, since the product has
no reason to ingest it.

---

## Provider comparison

List pricing as published mid-2026; **verify exact numbers at provision time.**

| | **Cloudflare R2 (recommended)** | AWS S3 (Standard) | Supabase Storage |
|---|---|---|---|
| **Storage** | ~$0.015/GB-mo | ~$0.023/GB-mo | ~$0.021/GB-mo (+ plan) |
| **Egress** | **$0** | ~$0.09/GB | ~$0.09/GB (CDN-cached) |
| **Writes / reads** | $4.50/M / $0.36/M | $0.005/1k / $0.0004/1k | included in plan tiers |
| **Free tier** | 10 GB, 1M writes, 10M reads/mo | 5 GB 12-mo only | 1 GB (free project) |
| **Durability** | High (multi-region, 11-9s class) | 99.999999999% | Backed by S3 (11-9s) |
| **S3-compatible API** | **Yes** (works w/ `file-s3`) | Native | Yes (S3 protocol add-on) |
| **Presigned upload (PUT)** | Yes | Yes | Yes (own API + S3) |
| **Presigned download (GET)** | Yes | Yes | Yes |
| **Compliance** | SOC 2 Type II, GDPR DPA, **EU jurisdiction option** | SOC/ISO, GDPR DPA, **HIPAA BAA available** | SOC 2 Type II, GDPR DPA, HIPAA (paid add-on) |
| **HIPAA BAA** | **No** | **Yes** | Yes (paid) |
| **Operational burden** | Low — one account, S3 token scoped to bucket, no egress-bill surprises | Medium — IAM users/policies, bucket policy, egress monitoring | Low–Medium — but adds a *new vendor* (we run Render Postgres, not Supabase) |
| **Net for us** | **Best fit: read-heavy, pre-revenue, S3-native, cheapest to serve** | Pick only if PHI/BAA enters scope | Compelling only if we were already on Supabase; we aren't |

Note: `app/evidence.jsx`'s header comment mentions "Supabase" aspirationally, but the
stack is **Render Postgres + Medusa on Render + Next on Vercel** — Supabase is not in
play, so its main draw (co-located with a Supabase DB/auth) doesn't apply here.

---

## Upload + signed-view flow (the contract #334 implements)

Two hard rules: **(1) file bytes never touch Postgres**, and **(2) large bytes never
stream through the Render backend** (it OOMs). Both are satisfied by direct
browser→R2 transfer using short-lived presigned URLs.

### Object key scheme (tenant-isolated, private bucket)

```
evidence/<practice_id>/<document_type>/<evdoc_id>.<ext>
# e.g.  evidence/prac_01H.../sds/evdoc_01J....pdf
```

Bucket is **private** (no public read). Every read is a freshly-signed, short-TTL GET.
The key is stored in the existing `medmkp_evidence_document.storage_key` column.

### Upload (presigned PUT, direct to R2)

```
1. POST /medmkp/evidence-documents
     body: { document_type, file_name, file_mime_type, file_size_bytes, links… }
   → backend validates MIME allowlist + size cap (reject early, 422 with a clear msg)
   → inserts evidence_document row, status = "captured", computes storage_key
   → returns { id, upload_url (presigned PUT, TTL ~10 min), storage_key }
2. Browser PUTs the bytes straight to upload_url (R2). Backend never sees the blob.
3. POST /medmkp/evidence-documents/:id/confirm
   → backend HEADs the object, verifies size/content-type match the claim,
     flips status to "captured"/"verified" as appropriate (or "rejected" on mismatch).
```

(Small files *may* alternatively go through Medusa's `createFiles` upload, but
presigned PUT is the default to keep bytes off Render.)

### Signed view / download

```
GET /medmkp/evidence-documents/:id/file
  → authorize: the row's practice_id must match the caller's practice
  → generate presigned GET (TTL ~10 min) for storage_key
  → 302 redirect to it (or return { url } for the drawer's "View file")
```

This is exactly what `app/evidence.jsx` already anticipates: `storageKey` → presigned
URL at view time; the "View file" / "Upload" / "Replace" buttons currently call
`soon(...)` and become these calls.

### Validation (rejections #334 must enforce)

- **MIME allowlist:** `application/pdf`, `image/jpeg`, `image/png`, `image/webp`,
  `image/heic`, `application/vnd.openxmlformats-officedocument.*` (docx/xlsx). Reject
  anything else with a clear 422.
- **Size cap:** start at **25 MB/file** (`EVIDENCE_MAX_UPLOAD_BYTES`). Reject oversize
  *before* issuing the presigned PUT.
- **No raw blobs in Postgres** — enforced structurally: the row has no bytea column.

---

## Config / secret contract

R2 is reached through `@medusajs/file-s3`, pointed at R2's S3 endpoint with
**path-style** addressing and region `auto`. Proposed env vars (matching the repo's
explicit-prefix convention, e.g. `MEDMKP_*` / `SUPPLIER_CRED_KEY`), added to
`medusa-backend/apps/backend/.env.template` and set as **secrets on Render**:

| Var | Example / value | Secret? | Where |
|---|---|---|---|
| `EVIDENCE_STORAGE_PROVIDER` | `r2` (or `s3`, `local`) | no | local + Render |
| `EVIDENCE_S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` | no | Render (+ preview) |
| `EVIDENCE_S3_REGION` | `auto` | no | local + Render |
| `EVIDENCE_S3_BUCKET` | `tracedds-evidence-prod` | no | Render (own bucket per env) |
| `EVIDENCE_S3_ACCESS_KEY_ID` | R2 S3 token id | **yes** | Render secret |
| `EVIDENCE_S3_SECRET_ACCESS_KEY` | R2 S3 token secret | **yes** | Render secret |
| `EVIDENCE_S3_PREFIX` | `evidence` | no | local + Render |
| `EVIDENCE_SIGNED_URL_TTL_SECONDS` | `600` | no | local + Render |
| `EVIDENCE_MAX_UPLOAD_BYTES` | `26214400` (25 MB) | no | local + Render |

`@medusajs/file-s3` provider options map directly: `endpoint`, `region`, `bucket`,
`access_key_id`, `secret_access_key`, `prefix`, plus `additional_client_config:
{ forcePathStyle: true }` for R2. Wiring this into `medusa-config.ts`'s `modules`
array is #334's job, not this doc's.

**Local development:** use `@medusajs/file-local` (`EVIDENCE_STORAGE_PROVIDER=local`)
so contributors need **zero cloud credentials** to run the upload flow — bytes go to a
gitignored on-disk dir. R2 is used for **preview/staging and prod** only. (Optional:
a shared `tracedds-evidence-preview` bucket if we want Vercel previews to exercise
real R2; not required for v1.)

---

## What the human must provision (the loop cannot)

1. **Create a Cloudflare account** (or use the org account) and an **R2 bucket** —
   `tracedds-evidence-prod` (and optionally `…-preview`). Choose **jurisdiction**
   (default vs EU) — pick EU only if we commit to EU data residency.
2. **Generate an R2 S3 API token** scoped to that bucket with **Object Read & Write** —
   this yields `EVIDENCE_S3_ACCESS_KEY_ID` + `EVIDENCE_S3_SECRET_ACCESS_KEY`.
3. **Set the secret env vars on Render** (backend service) — the two credentials above;
   add the non-secret vars to the Render env / `render.yaml` and `.env.template`.
4. **Accept Cloudflare's DPA** for R2 and record it in the data-rights register.
5. **Confirm the PHI judgement** — sign off (business/legal) that evidence documents
   are not patient health records, so a HIPAA BAA is not required for v1. If that's
   *not* acceptable, stop and re-scope to **AWS S3 + BAA** before #334 starts.
6. *(Optional)* a **custom domain / R2 public bucket** is **not** needed — all access
   is via signed URLs against the private bucket.

Until #2 and #3 exist, #334 stays `needs-design`.

---

## Proposed follow-up issues (DO NOT FILE until approved)

1. **#334 ready-up — wire `@medusajs/file-s3` File Module against R2** and implement
   the presigned upload + `:id/confirm` + signed-view endpoints above; persist
   `storage_key` + file metadata on `medmkp_evidence_document`; remove `needs-design`
   once creds are provisioned. *(backend; non-breaking/additive)*
2. **Frontend: real upload flow** — replace `soon("Document upload")` /
   `soon("File preview")` / `soon("File replace")` in `app/evidence.jsx` with the
   presigned PUT + signed-GET calls. *(frontend)*
3. **Validation & limits hardening** — MIME allowlist + 25 MB cap + confirm-step
   HEAD verification, with tests for accepted/rejected cases (mirrors #334 acceptance).
4. **Lifecycle / retention & deletion** — on soft-delete of an evidence row, schedule
   object deletion; document retention policy for superseded files.
5. **Local-dev story** — `file-local` provider config + `.env.template` entries +
   README/CONTRIBUTING note so local upload needs no cloud creds.
6. **Data-rights / compliance register** — record the Cloudflare DPA, the PHI-scope
   decision, and a "no patient data in evidence" guardrail in the upload UI/copy.
7. **(Cross-ref, separate epic) Document-AI handoff** — classify/extract/match reads
   the object via `storage_key`; storage choice here is a prerequisite, not part of it.

---

## Verification (acceptance for this spike)

- ✅ One v1 provider recommended with rationale: **Cloudflare R2 via `@medusajs/file-s3`**.
- ✅ Cost, durability, data-rights/compliance (limited-PII, not-PHI), signed
  upload/download support, operational burden, and local+prod config vars documented.
- ✅ Upload + signed-view flow shape defined; **no raw blobs in Postgres** (metadata-only
  `medmkp_evidence_document` already exists with `storage_key`).
- ✅ Human-provisioned credentials/secrets enumerated.
- ✅ Follow-ups listed, **not filed**.
