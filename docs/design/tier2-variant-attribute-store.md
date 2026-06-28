# Tier 2 — Persist variant attributes as structured product data

**Status:** MVP implemented (JSON-blob form). The SQL-table form below is the
**Tier 2.5** upgrade, deferred until faceted catalog filtering is actually needed.
**Depends on:** Tier 1 registry (`src/matching/attribute-specs.ts`, PR #400)

## What shipped (MVP)

Discovered during implementation: the matcher writer already persists an
`attributes` JSON object onto `medmkp_canonical_product.attributes_text`, and the
PDP already reads it + already renders a variant selector. So the MVP needed **no
migration**:
- Registry: each selector axis carries an `axisLabel` ("Shade", "Gauge", …);
  `axisLabelFor()` / `clusterAttributes()` expose them.
- Matcher (`db.ts`): writes `variant_axis`, `variant_axis_label`, and
  `modeled_attributes: [{axis,value,label,axis_label,is_variant_axis}]` into the
  existing `attributes_text` JSON — every agreed selector axis for the canonical.
- Store route: surfaces `variant_axis_label` on the family summary.
- PDP (`app/catalog.jsx`): labels the variant selector from `variant_axis_label`
  (precise) instead of the value-shape heuristic, and renders `modeled_attributes`
  as data-driven spec rows. Falls back to the old behavior for products matched
  before the attribute store shipped (i.e. prod, until the next match run writes
  the new fields).

The SQL table below remains the right move **only** once faceted filtering /
attribute search is on the roadmap; the JSON blob serves the PDP today.

---

**Related:** Product variant families (family overlay + migration still PENDING prod),
catalog taxonomy normalization (#393), defer-canonical-matching (match DAG is the
sole writer), matview refresh DAG rule.

## Problem this solves

Today product attributes exist only **transiently**: the matcher recomputes
`numericAttrs` from each supplier listing's free-text name on every run
(`extractNumericAttrs`), uses them to split/group clusters, and persists only the
*derived* family selector fields (`family_id`, `variant_label`, `variant_rank`,
`variant_axis`) onto the canonical match rows. The structured attributes
themselves (shade=A2, size=L, gauge=25) are thrown away.

Consequences:
- The catalog/PDP can only show the **one** varying axis the family overlay
  picked. It cannot render a full spec table, and it cannot offer faceted
  filtering ("show 25-gauge", "show A2 shade") because the data isn't stored.
- Every consumer that wants an attribute must re-parse the name.
- Tier 3 (LLM-assisted extraction) has nowhere to write its results.

## Goal

Persist the registry's extracted attributes as **structured rows keyed to the
canonical product**, written by the match DAG, read by the catalog. The matcher
keeps computing attributes in-memory for clustering (unchanged); persistence is
the **output side**, consumed by browse/PDP/search — not a new matching input.

## Schema

New table, written by the canonical matcher (sole writer, per
defer-canonical-matching):

```
tracedds_canonical_product_attribute
  canonical_product_id   text    not null   -- FK → canonical product (content-addressed id)
  axis                   text    not null   -- registry axis key: "shade","size","ga","cad_block_size",…
  value                  text    not null   -- normalized value: "a2","L","25","14l"
  label                  text    null        -- display label from formatVariant() when axis is a selector
  is_variant_axis        boolean not null    -- true if this is the family's varying axis (drives the selector)
  source                 text    not null    -- "registry" | "llm" | "manual"  (provenance; Tier 3 writes "llm")
  confidence             real    null        -- for non-registry sources
  primary key (canonical_product_id, axis, value, source)
```

- **Grain = canonical product.** A canonical is a cluster of listings that already
  agree on every modeled axis (a conflict would have split them), so the cluster
  has one agreed value per axis — exactly what `clusterVariant()` already computes.
  Persist the full agreed attribute set, not just the selector axis.
- `is_variant_axis` lets the PDP know which axis is the selectable dimension vs.
  which are fixed specs, generically (no per-category code).
- `source` keeps registry-extracted and LLM-inferred attributes separable so we
  can trust/curate them differently and let Tier 3 layer in without clobbering.

Keep the existing `variant_*` columns on the canonical match row for ordering/back-
compat, or migrate the PDP to read ordering from this table — decide during build.

## Write path

Extend the matcher's persistence (the same writer that already emits
`assignFamilies()` output, `matching/db.ts`) to also emit attribute rows:

1. For each cluster, take `cluster`'s agreed attributes. The agreed value per axis
   is already derivable the way `clusterVariant()` does it (scan members, take the
   unanimous/most-common stated value). Generalize that from "the one selector
   axis" to "every axis present".
2. For each `(axis, value)`, look up the registry's `family` config (via
   `SELECTOR_AXES` / `formatVariant` from `attribute-specs.ts`) to fill `label`
   and `is_variant_axis` (true iff this axis === the family's `variantAxis`).
3. Upsert rows; soft-delete/replace stale ones the same gap-free way catalog rows
   are reconciled (no attribute vanish mid-run).

No change to the matching/scoring logic — this reads `cluster.members[*].numericAttrs`
which already exist.

## Read path (catalog / PDP)

- **PDP** (`api/store/medmkp/canonical-products/route.ts` + `app/catalog.jsx`
  `ProductDetail`): the variant selector already renders from `variant_*`; point it
  at `is_variant_axis = true` rows so it's data-driven. Add a generic **spec table**
  from the remaining attributes (label/value), replacing any name-derived guessing.
- **Catalog facets (later):** the `(axis, value)` rows are the substrate for
  filtering and "N options" counts without re-parsing names.

## Taxonomy coupling (#393)

Use the normalized category taxonomy to scope **which axes are variant-defining vs
descriptive per category** (e.g. composite → shade is the variant; gauge is just a
spec). MVP can treat `is_variant_axis` purely from the family overlay; the taxonomy
refinement makes selectors correct where a category has several modeled axes.

## Migration & rollout

- New table → a migration. If a matview is built on it for the catalog, it must go
  in the refresh DAG with a UNIQUE index (matview refresh-DAG rule).
- Prod write happens via the **NUC match DAG**, not a Render `--commit` (avoids the
  known OOM on bulk re-match); follow the careful prod-rematch procedure.
- Ship the **still-pending family overlay migration** as part of this — Tier 2 is
  the natural moment, since the selector becomes fully data-driven.

## Sequencing

1. Migration + table.
2. Matcher writes attribute rows (extend `db.ts`; generalize `clusterVariant`'s
   agreement scan to all axes).
3. PDP reads `is_variant_axis` rows for the selector + a generic spec table.
4. Backfill via one NUC match run; verify a few known families (gloves S–XL,
   Filtek shades, gutta-percha sizes) render correct selectors + specs.
5. (Tier 3, separate) LLM extraction writes `source="llm"` rows for the long tail.

## Open decisions for review

- **Grain**: canonical-level (recommended) vs also persisting per-supplier-listing
  attributes (needed only if we later want per-offer spec differences).
- Keep `variant_*` columns or fully migrate ordering into the new table.
- Whether faceted catalog filtering is in Tier 2 scope or a Tier 2.5 follow-up.

---

# Tier 3 — LLM-assisted axis discovery (shipped)

**Status:** implemented as an **offline discovery tool**, not an inline matcher
LLM call. The matcher stays deterministic and dependency-free; the model only
*proposes* registry entries for human review (it never writes the matcher, the
registry, or the DB). This is the deliberate replacement for the retired eng-loop
clustering lane: instead of a human/loop discovering each new axis reactively, a
pass over the catalog surfaces the gaps.

**Why offline, not inline:** the matcher processes ~100k+ listings per run, and a
modeled attribute is a hard conflict — a hallucinated value would split or merge a
price-comparison cluster. An LLM call per listing would be expensive, slow, and
high-risk. Discovery is run on demand and advisory, so it is cheap and safe.

**How it works** (`npm run products:propose-axes`):
1. `axis-discovery.ts` `findAxisCandidates()` (deterministic, unit-tested): groups
   same-brand canonicals whose names are identical except for **one token the
   registry does not recognize** — already-modeled axes/values and existing
   families are excluded using the registry itself, so colors/shades/sizes aren't
   re-proposed. The differing tokens are the candidate axis's values.
2. `llm.ts` asks Claude (headless `claude -p`, **logged-in subscription, no API
   key** — same as the eng-loop) to name the axis or reject the group, returning
   strict JSON (defensively parsed).
3. `propose-variant-axes.ts` validates against the registry and writes
   `.medmkp/variant-proposals/proposals.{md,json}` — each proposal carries the
   examples, values, confidence, and a ready-to-edit `VariantSpec` **sketch**.
   `--stub` exercises the pipeline with no model call; `--input` runs offline from
   a candidate fixture.

**Accepting a proposal** = paste/adapt the sketch into `attribute-specs.ts` (one
entry — that's the Tier-1 payoff) and re-run `products:match`. Tier 2 then persists
and the PDP renders the new variants automatically.

**Run it where `claude` is authenticated** (your machine or the NUC). The deterministic
half (candidate finding, prompt assembly, JSON parsing, report) is fully unit-tested
and runnable anywhere via `--stub`/`--input`.

**Future extensions (not built):** numeric-only unmodeled axes (the finder keys on
word tokens today, since numeric values are already captured as measures/bare
numbers); feeding the matcher's `needs-review` pairs as a second candidate source;
auto-opening a PR from an accepted proposal.
