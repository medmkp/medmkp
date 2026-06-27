# Product Matching Runbook

This document explains how TraceDDS matches identical products across supplier
catalogs, how to regenerate matches after a catalog refresh, and how invoice
line item matching builds on top of product matching.

## What Product Matching Produces

Product matching reads `tracedds_supplier_product` (plus latest prices from
`tracedds_supplier_price_snapshot`) and writes:

- `tracedds_canonical_product` — one row per real-world product
  (ids `mcp_auto_*`, handles `auto-*`).
- `tracedds_canonical_product_match` — links each supplier product to its
  canonical product with a `match_status`, an integer `confidence_score`
  (0–100), and a `match_reason` explaining the decision.

Match statuses:

| Status | Meaning |
| --- | --- |
| `exact` | Same product, same (or unknown) pack size |
| `variant` | Same product, different pack count (compare per-unit prices) |
| `substitute` | Different product of the same type that may be cheaper |
| `needs_review` | Plausible but unproven match; report-only, never clustered |
| `unmatched` | No evidence found |

Every row the matcher writes has a `match_reason` starting with `auto:`. The
matcher also owns every row whose `canonical_product_id` starts with
`mcp_auto_` — both are reset and rewritten on each run, so manual curation
(rows with other reasons pointing at non-auto canonical products) is never
touched.

The code lives in:

```text
medusa-backend/apps/backend/src/matching/
  normalize.ts   # text/SKU/pack/attribute normalization
  score.ts       # pair scoring and accept/review/reject decisions
  engine.ts      # blocking, clustering, substitute detection
  db.ts          # load products, commit results (idempotent)
  report.ts      # verification reports
medusa-backend/apps/backend/src/scripts/match-canonical-products.ts  # CLI
```

## How Matching Works

The central problem: manufacturer SKUs overlap heavily across suppliers
(~19,000 shared SKUs in the current catalog), but raw SKU equality is
unreliable. Short numeric SKUs collide across manufacturers — SKU `0044`
alone is shared by 15 unrelated products (an O-ring, oregano oil, a curing
light, ...). Matching therefore works in five stages, each adding or testing
evidence.

### Stage 1 — Normalize (`normalize.ts`)

Each supplier product is normalized into comparable features:

- **SKU**: uppercase alphanumerics only (`823-4155` → `8234155`), plus a
  *strength* score (0–1). Long mixed alphanumeric SKUs are strong identity
  evidence; short numeric SKUs are weak and need corroboration.
- **Name tokens**: lowercased, diacritics stripped, light plural stemming
  (`elevators` → `elevator`).
- **Name-embedded catalog numbers**: some distributors (Dental City) store an
  internal item number in `manufacturer_sku` and put the real maker part
  number in the product name ("Alpen Flame 5/Pack Medium **852-012**"). These
  tokens become additional join keys. Pack tokens (`100BOX`) and measurements
  (`25MM`) are excluded.
- **Pack quantity**: parsed from `pack_size` and the name ("Pkg of 5",
  "100/Box", trailing "(12)", "(1 x 8)" → 8, "Case of 12 x 160" → 1920).
  A parsed quantity that is really a catalog number ("Pkg 24746") is vetoed.
- **Numeric attributes**: unit-qualified values — sizes (`25mm`), gauges
  (`18ga`), shades (`A4`), tapers (`.04`), hash sizes (`#15`), plus apparel
  sizing (`Small`/`X-Large`/`2XL`, for gloves, gowns and masks). Dental
  products are differentiated by these, so they get special treatment in
  scoring.
- **Brand**: junk brands are discarded (Pearson emits `1 x 6`, `lateral`,
  `pkg. of 12` as brands), distributor house labels are treated as unknown
  (Dental City labels everything "Dental City"), and aliases are folded
  (`Kerr Endodontics` → `kerr`, `3M ESPE` → `3m`).
- **Unit price**: latest `price_cents` divided by pack quantity when known.

### Stage 2 — Block (`engine.ts`)

Comparing all ~200K products pairwise is infeasible and unnecessary. Two
products become a *candidate pair* when they share either:

1. **a normalized catalog code** — equal manufacturer SKUs, or a manufacturer
   SKU appearing as a name-embedded catalog number on the other side; or
2. **the same primary brand plus ≥2 shared core name tokens** — this recovers
   the pure-distributor catalogs (DC Dental, Carolina) whose `manufacturer_sku`
   is an internal code that never collides cross-supplier, so code-based
   blocking is blind to them.

Posting lists longer than 100 products are skipped as junk hub keys.

### Stage 3 — Score (`score.ts`)

Each candidate pair gets an explainable rule-based decision built from:

- **SKU evidence** (weighted by SKU strength and how it matched:
  `mfr-sku`, `name-embedded-sku`, `shared-name-code`),
- **name similarity** (token Jaccard + character trigram Dice, boosted by
  agreeing numeric attributes and matching brands),
- **brand relation** (match / conflict / unknown),
- **pack relation** (same / differs / unknown).

The decision ladder:

- Numeric attribute conflict (25mm vs 31mm, shade A2 vs B1, glove XL vs
  XX-Large) → **reject**, always. Listings that differ on a measured or apparel
  size are different products even when every other signal agrees.
- Strong SKU evidence needs moderate name corroboration to accept; brand
  conflict downgrades to `needs_review`.
- Weak SKU evidence (short numeric SKUs) needs strong name similarity and a
  non-conflicting brand.
- No catalog code at all (the brand+name candidates): requires a matching
  brand and *very* high name similarity (≥0.92) to accept as `exact`/`variant`;
  0.80–0.92 is `needs_review`. A bare-number disagreement vetoes outright.
- Accepted pairs with different pack counts become `variant` instead of
  `exact`.
- Middle ground becomes `needs_review` (report-only).

Every decision string is preserved in `match_reason`, e.g.
`auto:exact sku=0.75(mfr-sku) name=0.81 brand=match pack=same`.

### Stage 4 — Cluster

Accepted pairs are merged with union-find into clusters; each multi-member
cluster becomes one canonical product. The member whose name is most central
(highest average token overlap with the others) provides the canonical name.
Canonical `attributes_text` records all member brands, manufacturer SKUs and
pack sizes as JSON.

### Stage 5 — Substitutes

For each cluster with 2+ suppliers and known prices, the engine looks for
products of the same *type* that could replace it for less:

- shared core vocabulary (name tokens minus brand/SKU/pack/measurement
  noise, Jaccard ≥ 0.5),
- no numeric attribute conflicts (same sizes/gauges/shades where stated),
- different (or unknown) brand,
- cheaper per unit than the cluster's best price.

Top 5 per cluster are written as `substitute` rows with deliberately low
confidence (≤ 69) — they are suggestions for review, not assertions of
equivalence.

## Regenerate Product Matching

Run after every catalog ingestion. The pipeline is idempotent — each run
resets and rewrites everything it owns.

```bash
cd medusa-backend/apps/backend

# 1. Dry run: full matching + reports, no DB writes (~30s)
npm run products:match

# 2. Review the outputs (see below)

# 3. Commit to Postgres
npm run products:match -- --commit
```

`DATABASE_URL` is taken from the environment or from
`medusa-backend/apps/backend/.env` (local dev; use
`NODE_ENV=production` to load `.env.production` for the remote database).

Order matters only in one direction: run matching *after* ingestion
commits. If an ingestion lands mid-run, just re-run with `--commit`; the
reset clause cleans up any rows pointing at stale `mcp_auto_*` ids.

### Verification Outputs

Each run writes `medusa-backend/apps/backend/.tracedds/matching/latest/`:

- `review.html` — open in a browser. ~80 sampled match groups side by side
  with brands, SKUs, pack sizes, prices, and clickable supplier links;
  substitute candidates highlighted in yellow. This is the fastest way to
  eyeball precision.
- `summary.json` — run metrics: counts by status, confidence histogram,
  cross-supplier pair counts, price-spread stats. A healthy run on the
  current catalog looks like: ~10K multi-supplier clusters, median unit
  price spread ~1.15x, few hundred groups above 3x.
- `price-comparison.csv` — every multi-supplier cluster sorted by price
  spread, *descending* — bad matches and pack-parsing errors surface at the
  top. The `pack_certainty` column flags groups where per-unit comparison is
  unreliable (`mixed` = only some members had a parseable pack quantity).
- `match-groups-sample.csv`, `needs-review-sample.csv`,
  `substitutes-sample.csv` — flat samples for spreadsheet review.

### Regression Tests

```bash
cd medusa-backend/apps/backend
npm run test:unit
```

`src/matching/__tests__/matching.unit.spec.ts` contains golden pairs lifted
from production data: true matches (Premier Cameron elevator, Kerr K3XF
files) must keep matching, and known impostors (the `0044` and `4732` SKU
collisions) must keep rejecting. Tune thresholds in `score.ts` only with
these tests passing.

### Useful Queries

```sql
-- Match coverage
SELECT match_status, count(*) FROM tracedds_canonical_product_match
WHERE deleted_at IS NULL GROUP BY 1;

-- Price comparison for one canonical product
SELECT c.name, p.supplier_id, p.name, s.price_cents / 100.0 AS price
FROM tracedds_canonical_product c
JOIN tracedds_canonical_product_match m
  ON m.canonical_product_id = c.id AND m.match_status IN ('exact', 'variant')
JOIN tracedds_supplier_product p ON p.id = m.supplier_product_id
JOIN LATERAL (
  SELECT price_cents FROM tracedds_supplier_price_snapshot s
  WHERE s.supplier_product_id = p.id
  ORDER BY captured_at DESC LIMIT 1
) s ON true
WHERE c.id = '<canonical_product_id>'
ORDER BY price;

-- Integrity: should always return 0
SELECT count(*) FROM tracedds_canonical_product_match m
LEFT JOIN tracedds_canonical_product c ON c.id = m.canonical_product_id
WHERE m.deleted_at IS NULL AND m.match_status <> 'unmatched' AND c.id IS NULL;
```

## Line Item Matching (Design)

This section describes how invoice line item matching should work on top of
product matching. The schema already supports it
(`tracedds_invoice_line_item.canonical_product_id` and `match_status` use the
same enum; `tracedds_savings_opportunity` holds the output); the matching code
below is the part still to build.

### Why It Is the Same Problem

An invoice line item is just a supplier product description with worse data:
a `raw_description` string, usually a `supplier_sku` and/or
`manufacturer_sku`, sometimes a brand, plus quantity and prices. Matching it
to a canonical product uses the exact same evidence model as
supplier-to-supplier matching, so the implementation should reuse
`normalize.ts` and `score.ts` unchanged.

### Pipeline

For each line item on an ingested invoice:

1. **Normalize** the line item as if it were a supplier product:
   `normalizeProduct({ name: raw_description, manufacturer_sku, brand,
   pack_size, ... })`. This yields the same features — normalized SKU,
   name tokens, embedded catalog numbers, pack quantity, numeric attributes.

2. **Resolve by supplier SKU first.** If the invoice's supplier is one of
   our ingested suppliers and `supplier_sku` matches
   `tracedds_supplier_product.sku` for that supplier, the line item resolves
   directly to that supplier product's canonical product. This is the highest
   confidence path and should handle most line items from known suppliers.

3. **Fall back to fuzzy matching.** Otherwise, generate candidates by the
   same blocking keys (normalized `manufacturer_sku`, name-embedded catalog
   numbers) against all supplier products, score each candidate with
   `scorePair`, and take the best accepted decision. Carry the decision's
   status and confidence onto the line item: `exact`, `variant`,
   `needs_review`, or `unmatched`.

4. **Normalize the paid price.** Compute
   `normalized_unit_price_cents = extended_price_cents / (quantity ×
   pack_qty)` using the parsed pack quantity, so invoice prices are
   comparable with catalog per-unit prices.

5. **Generate savings opportunities.** For each matched line item, query the
   canonical product's match group (the price-comparison query above):

   - A supplier selling the same canonical product cheaper per unit →
     `tracedds_savings_opportunity` row of type `exact_match_cheaper`, with
     `recommended_supplier_product_id`, both unit prices, and projected
     monthly/annual savings from the practice's purchase history.
   - A `substitute` match of the canonical product cheaper per unit → type
     `equivalent_substitute`, lower confidence, flagged for review before
     recommendation.
   - A `variant` (bigger pack) of the same canonical product with a lower
     per-unit price → type `bulk_purchase`.

   `explanation` should carry the human-readable evidence (the match reason,
   both product names and prices); `evidence_url` the recommended supplier's
   product URL.

### Trust Rules

- Never auto-recommend from a `needs_review` or `substitute` match without
  human confirmation; surface them as `status = 'reviewing'`.
- Savings math must compare per-unit prices, and only when pack quantities
  are known on both sides (the invoice side and the catalog side) — the same
  `pack_certainty` caution as in the price-comparison report.
- Line items are practice data: matching writes to the line item and to
  `tracedds_savings_opportunity`, never back into catalog tables.
