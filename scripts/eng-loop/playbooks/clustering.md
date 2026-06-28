> **RETIRED from the autonomous rotation (see config.env `CATEGORIES`).** This
> playbook produced a steady trickle of one-off per-category regex tweaks to
> `normalize.ts`/`family.ts`. Variant axes are now defined **once** in the
> registry `src/matching/attribute-specs.ts` (extraction + conflict + selector
> display in a single `VariantSpec`), and the durable fix for new variants is the
> structured-attribute path (persist attributes at ingest + LLM-assisted long-tail
> extraction), not hand-coded rules. If you must make a one-off clustering fix,
> add/extend a `VariantSpec` in the registry — do **not** add inline regex to
> `normalize.ts`. Prefer filing a `data-quality` issue over reviving this lane.

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
It prints a `summary` JSON to stdout and writes `.tracedds/matching/latest/` (gitignored —
do not commit it). Save the baseline metrics from `summary.json`:
`clusters_total`, `clusters_multi_supplier`, `products_in_multi_supplier_clusters`,
`accepted_pairs`, `needs_review_pairs`, plus the `price_spread_*` fields.

#### 2. Find ONE concrete defect
- Scan `.tracedds/matching/latest/match-groups-sample.csv` for an **over-clustered**
  canonical (one cluster mixing clearly distinct sizes / gauges / shades / brands), and
  `needs-review-sample.csv` for an **under-clustered** pair (obvious same-product split).
- Or target with read-only SQL (`psql "$DATABASE_URL" -c "..."`):
  - Over: large clusters mixing pack/size —
    group `tracedds_canonical_product_match` (status in exact/variant) by `canonical_product_id`,
    `HAVING COUNT(DISTINCT supplier_product_id) > 10`, aggregating distinct `pack_size`/`brand`.
  - Under: same `name` spread across multiple `canonical_product_id`.
- Pick the **clearest, highest-impact** single case. Trace its root cause to a specific
  rule in `normalize.ts`/`engine.ts` (e.g. an attribute axis not vetoed → over-merge; a
  normalization that collapses distinct shades/sizes; a brand-conflict false reject →
  under-merge).
- **Variant split vs. true under-cluster — don't confuse them.** If the "split" is the same
  product across a *size / shade / pack / gauge* axis (e.g. `Alasta Nitrile Glove` S/M/L/XL,
  `Filtek` A1/A2/A3), that is **not** something to merge: the matcher *intentionally* keeps
  size-specific canonicals separate so per-unit price comparison stays valid. The correct
  fix is the **family overlay** (`matching/family.ts`), not a union-find merge.
  Only treat it as a true under-cluster when the rows are the *same SKU/pack* wrongly split
  (e.g. a brand-conflict false reject).

#### 3. Make a minimal, targeted fix
- Smallest rule change that corrects this case. **Add or extend a unit test** in
  `matching.unit.spec.ts` that captures it (`npm run test:unit` must pass).

#### 3a. Variants → options on the canonical product page (REQUIRED when the fix touches a variant axis)
If your fix changes how a size / shade / pack / gauge axis clusters — splitting an
over-merged axis back apart, or recognizing a new axis — the size-specific canonicals must
**also surface as selectable variants on the product page**, not just resolve in the matcher.
A bare split that leaves no family is a regression: the user sees N separate cards instead of
one product with a variant selector.
- **Assert the family is assigned.** `matching/family.ts` `assignFamilies(clusters)` must group
  the affected canonicals under one `family_id` with distinct `variant_label`/`variant_rank`
  (it is precision-guarded: brand or ≥3 core tokens, ≥2 distinct labels). If your axis is new,
  extend `family.ts`'s grouped-axis set / `formatVariant` so it produces clean, ordered labels —
  and keep sub-integer ranks scaled to integers (taper/mm/shade ranks ×100; `variant_rank` is an
  INTEGER column — fractional values crash `--commit`).
- **Confirm it reaches the PDP.** The store route
  (`api/store/medmkp/canonical-products/route.ts`) groups by `COALESCE(family_id,id)` and the
  handle path returns members sorted by `variant_rank`; `app/catalog.jsx` `ProductDetail`
  renders the `.pdp-variants` selector and the catalog card shows the "N options" pill.
  Add/extend a `family.unit.spec.ts` case for the new grouping.
- **Show it in the PR.** Include the family overlay's before→after (`families` count, the
  affected family's member labels) and, where practical, a PDP screenshot showing the variant
  selector — per CLAUDE.md visual-fidelity. State that populating families in prod needs the
  reviewer's `products:match --commit` (it regenerates canonical handles).

#### 4. Verify (AFTER) — the snapshot
- Re-run `npm run products:match` (dry-run). Diff the new `summary.json` against baseline.
- **Sanity-check for collateral damage:** a rule change can ripple. If `clusters_total`
  or `clusters_multi_supplier` swings wildly (e.g. >2–3%), the fix is too broad — prefer a
  more surgical change, and report the global delta honestly. A good fix moves the targeted
  cluster and barely moves the totals.
- Confirm the specific canonical is now correct (re-query it / find it in the new sample).

#### 5. Open the PR
- Commit only the code + test change (not `.tracedds/`). PR body "Verification" = a
  before→after metrics table from the two `summary.json`s, the targeted cluster's
  membership before/after, and `npm run test:unit` passing. Note the global cluster-count
  delta so the reviewer can judge ripple. State that prod commit (`products:match --commit`)
  is the reviewer's to run.

#### If nothing clean is found
- Clustering is hard; a quiet tick is fine. If you found a real but risky/broad problem you
  can't fix surgically, open ONE `data-quality` issue describing it with the sample rows
  (per the common rules) instead of a shaky PR.
