### Playbook: catalog clustering quality (over- / under-clustering)

Goal: fix **one** matching defect — an over-clustered canonical (distinct products
wrongly merged) or an under-clustered one (the same product split across canonicals)
— with a **minimal matching-rule change**, verified by a **dry-run metrics diff**.
This is exactly how the vendor-prefix fix was shipped (`maxSize 308→77, 13,431
recovered`, 40 tests).

**Hard limits:** dry-run + read-only SQL only. **Never** `--commit`, never refresh
read-models/match-index, never set `ALLOW_REMOTE_DB_DESTRUCTIVE`. The PR is the
*code change*; a human runs the careful prod commit separately. `DATABASE_URL`
(read-only prod) is set in your environment.

#### Where things live
- Engine: `medusa-backend/apps/backend/src/matching/engine.ts` (UnionFind, `attrsCompatible`,
  candidate pairs, transitive merge).
- Normalization: `.../src/matching/normalize.ts` (tokenize, pack parse, SKU/brand canon,
  attribute extraction — sizes, gauges, shades).
- Tests: `.../src/matching/__tests__/matching.unit.spec.ts` — run with `npm run test:unit`.

#### 1. Baseline (BEFORE)
From `medusa-backend/apps/backend`:
```
npm run products:match            # dry-run: read-only, ~minutes; NO --commit
```
It prints a `summary` JSON to stdout and writes `.medmkp/matching/latest/` (gitignored —
do not commit it). Save the baseline metrics from `summary.json`:
`clusters_total`, `clusters_multi_supplier`, `products_in_multi_supplier_clusters`,
`accepted_pairs`, `needs_review_pairs`, plus the `price_spread_*` fields.

#### 2. Find ONE concrete defect
- Scan `.medmkp/matching/latest/match-groups-sample.csv` for an **over-clustered**
  canonical (one cluster mixing clearly distinct sizes / gauges / shades / brands), and
  `needs-review-sample.csv` for an **under-clustered** pair (obvious same-product split).
- Or target with read-only SQL (`psql "$DATABASE_URL" -c "..."`):
  - Over: large clusters mixing pack/size —
    group `medmkp_canonical_product_match` (status in exact/variant) by `canonical_product_id`,
    `HAVING COUNT(DISTINCT supplier_product_id) > 10`, aggregating distinct `pack_size`/`brand`.
  - Under: same `name` spread across multiple `canonical_product_id`.
- Pick the **clearest, highest-impact** single case. Trace its root cause to a specific
  rule in `normalize.ts`/`engine.ts` (e.g. an attribute axis not vetoed → over-merge; a
  normalization that collapses distinct shades/sizes; a brand-conflict false reject →
  under-merge).

#### 3. Make a minimal, targeted fix
- Smallest rule change that corrects this case. **Add or extend a unit test** in
  `matching.unit.spec.ts` that captures it (`npm run test:unit` must pass).

#### 4. Verify (AFTER) — the snapshot
- Re-run `npm run products:match` (dry-run). Diff the new `summary.json` against baseline.
- **Sanity-check for collateral damage:** a rule change can ripple. If `clusters_total`
  or `clusters_multi_supplier` swings wildly (e.g. >2–3%), the fix is too broad — prefer a
  more surgical change, and report the global delta honestly. A good fix moves the targeted
  cluster and barely moves the totals.
- Confirm the specific canonical is now correct (re-query it / find it in the new sample).

#### 5. Open the PR
- Commit only the code + test change (not `.medmkp/`). PR body "Verification" = a
  before→after metrics table from the two `summary.json`s, the targeted cluster's
  membership before/after, and `npm run test:unit` passing. Note the global cluster-count
  delta so the reviewer can judge ripple. State that prod commit (`products:match --commit`)
  is the reviewer's to run.

#### If nothing clean is found
- Clustering is hard; a quiet tick is fine. If you found a real but risky/broad problem you
  can't fix surgically, open ONE `data-quality` issue describing it with the sample rows
  (per the common rules) instead of a shaky PR.
