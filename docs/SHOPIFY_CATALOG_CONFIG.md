# Config-driven Shopify catalog routing

Onboarding a **Shopify** supplier used to require editing two hand-maintained
shared arrays, so every new-vendor PR collided on the same lines. This change
makes Shopify **routing** config-driven: a Shopify vendor is now onboarded by
dropping a config object into a per-supplier vetting file — no shared-code edit.

> **Scope of this change:** *routing only* (which candidates the Shopify adapter
> claims). Extraction is unchanged. The remaining phases from the parent issue
> (declarative `map{}`/transform engine, golden-fixture harness, config→discovery
> runtime consumer, and the Airflow DAG generalization) are intentionally **not**
> in this change — see [Remaining work](#remaining-work).

## How to add a Shopify vendor

Add (or extend) `medusa-backend/apps/backend/data/supplier-vetting/<slug>-catalog-sources.json`.
The vetting JSON is a **backward-compatible superset** — a file is still an array
of vetting objects; an entry opts into config-driven Shopify routing by adding:

```jsonc
{
  // …existing vetting fields…
  "platform": "shopify",
  "origin": "https://amerdental.com",
  "origin_aliases": ["https://ddisupply.com"],        // optional: 301/mirror domains
  "distributor_aliases": ["american dental accessories"] // optional: match by distributor name
}
```

- Entries **without** `platform: "shopify"` are ignored by the router (legacy
  behavior preserved).
- No edit to `adapters/index.ts` is needed — the adapter is auto-discovered by
  glob (`*-catalog-sources.json` → filter `platform === "shopify"`).
- Configs are validated **fail-closed**: a `platform: "shopify"` entry with a
  missing/invalid `origin` throws at load, so a typo fails loudly instead of
  silently dropping the vendor to the generic adapter.
- Add the new `supplier_id` to the expected-ids receipt list in
  `adapters/__tests__/shopify.unit.spec.ts` (the routing test cases themselves
  derive from the registry — no hand-written case needed).

That's the whole onboarding. Scheduling, triggering, and DB seeding all derive
from the same file:

- **Airflow** (`airflow/dags/shopify_supplier_ingestion.py`) reads the registry
  at parse time: the vendor joins the weekly `shopify_catalog_refresh` fleet
  DAG and the `shopify_supplier_ingest` trigger dropdown automatically after
  `npm run deploy:airflow`. Note: `shopify_catalog_refresh` lands **paused** on
  first creation (fleet convention — dormant until customer onboarding);
  unpause it once on the NUC to activate the weekly schedule. The manual
  `shopify_supplier_ingest` DAG is unpaused and works immediately.
- **Trigger a run** from your dev machine (resolves slug or `msup_` id against
  the registry, then fires the DAG on the NUC over ssh):

  ```bash
  npm run ingest:supplier -- --list        # see registered vendors
  npm run ingest:supplier -- <slug>        # trigger ingestion
  ```

- **DB seeding is automatic**: the DAGs pass `--ensure-supplier`, so the first
  run creates the `medmkp_supplier` row from the vetting entry (create-only —
  editing an existing supplier is still `supplier:seed-usable`'s job).

## Field reality — what Shopify vendors will and won't have

- **`barcode` / GTIN — generally absent.** Shopify strips `variant.barcode` from
  the public list endpoint `/products.json`, so config-driven Shopify vendors will
  usually have **no GTIN/UPC** (and therefore no lot/expiry barcode hook). Barcode
  is only present on the single-product `/products/<handle>.json`/`.js` endpoint,
  and even there is frequently blank. A per-handle enrichment pass (`enrich_per_handle`)
  is a **1 + N per-product fetch** and is out of scope here.
- **`unit_of_measure` — unavailable** (hardcoded `""`); partially recovered
  downstream by `parsePack` from the pack-size text.
- **Price-scale trap.** `/products.json` returns price as a **dollars string**
  (passed through verbatim — `shopify-catalog-extraction.ts` `priceString`), while
  the per-page embedded product JSON path returns **integer cents** (divided by 100 —
  `adapters/shopify.ts` `price`). The two seams must not be naively merged (100× error).

## Source seams confirmed for this change (line references)

- **Old routing allowlist (removed):** `adapters/shopify.ts` — the hardcoded
  `matches()` domain allowlist + distributor regex, replaced by
  `makeShopifyRouter(configs)` in `adapters/shopify-config.ts`.
- **Downstream products.json gate:** `shopify-catalog-extraction.ts:262`
  (`adapterForCandidate(candidate).id !== "shopify"`). The router keeps
  `id: "shopify"`, so this gate is unaffected.
- **`ProductPageCandidate` fields:** `supplier-pipeline/types.ts:61-63` (extends
  `IndexedSupplierUrl`; carries `origin`/`distributor`/`url`, no `supplier_id`/
  `platform`), so routing works off `url`/`distributor` without threading config
  through the candidate.
- **Price seam:** `shopify-catalog-extraction.ts:140-150` (dollars passthrough) vs
  `adapters/shopify.ts` `price()` (cents ÷ 100).
- **Airflow registry-driven DAGs:** `airflow/dags/shopify_supplier_ingestion.py`
  globs the same vetting JSONs at parse time. The legacy
  `supplier_catalog_ingestion.py` `SUPPLIERS = [...]` array now carries only
  non-Shopify suppliers.

## Remaining work (tracked by the parent issue)

1. Declarative `map{}` + transform registry over a shared `shopify-defaults.json`
   (promote `stripTags`/`shopifyVariantName`/`shopifyPackSize`/`shopifyAvailability`).
2. Golden-fixture harness (offline CI replay with field-level assertions).
3. Config→discovery runtime consumer in `runSupplierIngestionPipeline` (seed
   `platform:"shopify"` origins into discovery; origin-level fetch bypass).
4. ~~Airflow DAG generalization~~ — done: registry-driven
   `shopify_supplier_ingest` (manual, supplier dropdown) +
   `shopify_catalog_refresh` (weekly fleet) in
   `airflow/dags/shopify_supplier_ingestion.py`, triggered from a dev machine
   via `npm run ingest:supplier -- <slug>`.
