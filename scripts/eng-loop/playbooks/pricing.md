### Playbook: price & vendor coverage vs Net32 (experimental)

Goal: spot-check our catalog's prices and vendor coverage against **Net32** (the
richest public dental pricing source) on a **small sample**, and surface ONE concrete
finding per run. Most findings are **issues, not PRs** (a stale price needs a re-ingest,
which is a human-run data op) — except when the gap traces to a *matching* bug, which
becomes a clustering PR instead.

**Hard limits:** read-only only. Net32 is **not** bulk-ingested — do live lookups via the
NUC harvester sidecar (`NET32_HARVESTER_URL`, default `http://127.0.0.1:8791`). **Never**
ingest/persist Net32 data, never `--commit`. `DATABASE_URL` (read-only prod) is set in
your environment; the harvester reachability was pre-checked before this run.

#### 1. Pick a small sample (≤ ~20 items)
- Read-only SQL (`psql "$DATABASE_URL"`): take a sample of our **priced** canonicals
  across a few categories (join `medmkp_supplier_product` to `medmkp_supplier_current_price`,
  `price_cents > 0`). Capture our best **unit** price and the set of suppliers we list.

#### 2. Look up each on Net32 (read-only)
- Use the existing Net32 path — `medusa-backend/apps/backend/src/ingestion/marketplace/net32-fetch.ts`
  against the harvester — to get Net32's best unit price + vendor set for each sampled item.
  Do **not** run the marketplace ingest with `--commit`.

#### 3. Classify the gap for each item
- **Matching gap** (we show *no price* for an item Net32 clearly prices, because of a
  clustering miss) → this is a clustering defect: switch to the clustering playbook's fix
  flow and open a **PR** (with the dry-run metrics diff). Best outcome.
- **Price/coverage gap** (our price is materially higher than Net32, or Net32 lists vendors
  we lack) → likely stale data or a missing vendor; this is a **finding to file**.

#### 4. Surface ONE finding
- If you found a matching-gap fix, open that PR (done — stop).
- Otherwise open ONE `data-quality` issue (per common rules: dedupe against open issues
  first; at most one): a small before/after-style table — item, our price/vendors, Net32
  price/vendors, % difference — plus the suspected cause (stale snapshot? missing vendor?
  pack-normalization?) and suggested action. No code change.

#### Notes
- This playbook only runs when `PRICING_ENABLED=true` **and** the harvester answered the
  pre-flight check. If the harvester is down mid-run, stop cleanly (quiet tick).
- Keep the sample small — live Net32 lookups are slow and rate-limited.
