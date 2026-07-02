# Supplier Catalog Ingestion Runbook

This document explains how TraceDDS refreshes supplier product catalogs and how to
add new suppliers to the ingestion system.

## Source Of Truth

`tracedds_supplier` is the runtime source of truth for suppliers.

CSV files in `research/` and `data/supplier-vetting/` are curation inputs only.
Use them to discover and seed suppliers, but production ingestion should read
from `tracedds_supplier`.

Catalog data lands in:

- `tracedds_supplier_catalog_source`
- `tracedds_supplier_product`
- `tracedds_supplier_price_snapshot`
- `tracedds_canonical_product_match`

After ingestion commits, regenerate cross-supplier product matches — see
`PRODUCT_MATCHING.md`.

## Pipeline Shape

The supplier pipeline has three stages:

```text
discover -> index -> extract
```

- `discover`: fetches `robots.txt`, reads `Sitemap:` directives, and falls back
  to `/sitemap.xml`.
- `index`: classifies sitemap URLs as product, category, sitemap index, or other.
  It can also fetch configured source/category/search URLs and classify links
  found on those pages.
- `extract`: fetches product candidates and extracts quality-gated product rows.

The code lives in:

```text
medusa-backend/apps/backend/src/ingestion/supplier-pipeline/
```

Supplier-specific logic lives in:

```text
medusa-backend/apps/backend/src/ingestion/supplier-pipeline/adapters/
```

## Refresh A Supplier Catalog

Use the DB-backed command for normal refreshes:

```bash
cd medusa-backend/apps/backend
npm run supplier:ingest:db -- --supplier-id=msup_pearsondental_com --limit=25 --debug
```

This is a dry run. It reads from `tracedds_supplier`, writes debug output, and does
not update catalog tables.

Review:

```text
medusa-backend/apps/backend/.tracedds/ingestion/latest/products.csv
medusa-backend/apps/backend/.tracedds/ingestion/latest/failures.csv
medusa-backend/apps/backend/.tracedds/ingestion/latest/summary.json
```

Commit after review:

```bash
npm run supplier:ingest:db -- --supplier-id=msup_pearsondental_com --limit=25 --commit
```

`--commit` replaces cached supplier products and canonical matches for the same
supplier/source catalog. Price snapshots are appended as historical evidence.

Commits with zero extracted products are rejected by default. To intentionally
clear a supplier/source catalog, pass `--allow-empty-commit`.

## Suppliers Without Sitemaps

Some suppliers block `/sitemap.xml`, omit `Sitemap:` directives, or protect
sitemaps behind Cloudflare. Those suppliers can still be ingested from known
category/search/source URLs.

One-off dry run:

```bash
npm run supplier:ingest:db -- \
  --supplier-id=msup_net32_com \
  --source-url=https://www.net32.com/supplies/gloves \
  --limit=100 \
  --debug
```

Persistent source URL:

1. Update `tracedds_supplier.catalog_source_urls` for the supplier.
2. Store a JSON array of category/search/catalog URLs.
3. Optionally describe the source strategy in `catalog_source_notes`.
4. Run the normal DB-backed ingestion command.

Example value:

```json
["https://www.net32.com/supplies/gloves"]
```

The pipeline will fetch those source URLs during the index stage, extract
same-origin links, classify product candidates, and then run the normal product
extraction adapters.

## Production Safety

Run production refreshes in this order:

1. Dry run with `--debug` and a small `--limit`.
2. Inspect `products.csv` and `failures.csv`.
3. Increase `--limit` gradually.
4. Commit only after product rows pass review.
5. Query Postgres to verify `tracedds_supplier_product` and
   `tracedds_supplier_price_snapshot`.

Recommended production command pattern:

```bash
npm run supplier:ingest:db -- --supplier-id=<supplier_id> --limit=100 --debug
npm run supplier:ingest:db -- --supplier-id=<supplier_id> --limit=100 --commit
```

Do not run broad all-supplier commits until each supplier has a proven adapter or
clean structured data source.

## Quality Gates

Accepted product rows must have:

- product name
- supplier SKU or manufacturer SKU
- price
- product URL

Rows are rejected when:

- the supplier page is an error/product-not-found page
- no SKU/manufacturer SKU is found
- no price is found
- the adapter cannot extract a SKU-level product row

Generic extraction is intentionally conservative. Supplier-specific adapters
should be added for important suppliers.

## Add A Supplier

1. Add or seed the supplier into `tracedds_supplier`.

Required fields:

- `name`
- `slug`
- `website_url`
- `onboarding_status`
- `catalog_source_urls`

2. Dry-run ingestion:

```bash
npm run supplier:ingest:db -- --supplier-id=<supplier_id> --limit=10 --debug
```

3. Review debug output.

If the generic adapter produces clean rows, keep using it cautiously. If not,
write a supplier adapter.

## Add A Supplier Adapter

Create a new adapter:

```text
medusa-backend/apps/backend/src/ingestion/supplier-pipeline/adapters/<supplier>.ts
```

Implement:

```ts
export const supplierAdapter = {
  id: "supplier",
  matches: (candidate) => /supplier-domain\.com/i.test(candidate.url),
  extractProducts: (candidate, html) => {
    return []
  },
}
```

Use `extractProducts` when one page can contain multiple SKU rows. Use
`extractProduct` only when a page is truly one product/SKU.

Register it in:

```text
medusa-backend/apps/backend/src/ingestion/supplier-pipeline/adapters/index.ts
```

Adapter rules:

- Extract SKU-level rows, not SEO page summaries.
- Prefer table/structured fields over meta descriptions.
- Reject product-family pages unless they contain SKU rows.
- Preserve supplier SKU and manufacturer SKU separately.
- Attach source URLs that point to the most specific SKU/product page available.
- Do not fabricate brand, SKU, availability, or pack size.

## CSV-Based Sources

Manual CSV imports still exist for curated supplier files:

```bash
SUPPLIER_CATALOG_CSV=./data/catalog-imports/example.csv \
SUPPLIER_ID=msup_example_com \
SOURCE_CATALOG=example-com-manual-csv \
SOURCE_URL=https://example.com \
npm run supplier:import-csv
```

Use CSV imports for:

- supplier-provided catalog files
- manually reviewed starter catalogs
- one-off imports where website extraction is not reliable

Do not use generated debug CSVs as long-term source files.

## Scheduled Refresh (Airflow)

Shopify suppliers are **registry-driven** — no per-supplier DAG entry.
`airflow/dags/shopify_supplier_ingestion.py` reads
`data/supplier-vetting/*-catalog-sources.json` (entries flagged
`platform: "shopify"`) at DAG-parse time and provides two DAGs for the whole
fleet:

- `shopify_supplier_ingest` — manual trigger for any one supplier, picked from
  a dropdown in the Airflow Trigger UI, or from your dev machine:

  ```bash
  npm run ingest:supplier -- --list      # registered Shopify suppliers
  npm run ingest:supplier -- <slug>      # trigger ingestion on the NUC
  ```

- `shopify_catalog_refresh` — weekly fleet refresh (Sun 04:00 by default; tune
  with the `medmkp_shopify_refresh_schedule` Variable), one mapped task per
  registered supplier.

Both pass `--ensure-supplier`, which auto-creates the `medmkp_supplier` row
from the vetting entry on first run — no manual seed step for Shopify vendors.
Onboarding a Shopify supplier is therefore just the vetting JSON (plus its
test receipt line); see `SHOPIFY_CATALOG_CONFIG.md`.

For everything else, `airflow/dags/supplier_catalog_ingestion.py` refreshes
proven-adapter suppliers weekly by running `supplier:ingest:db --commit` per
supplier with tuned concurrency flags. Henry Schein has a dedicated
`henry_schein` DAG at 16:00 UTC that runs `henryschein:ingest --commit`,
including public web-price enrichment.
The DAGs need the `tracedds_backend_dir` Airflow Variable and an env file with the
target `DATABASE_URL` (Render Postgres: `DB_SSL=true`) — set the
`tracedds_env_file` Variable to `.env.production` on hosts that target the remote
database (`.env` is reserved for local development). Ingestion commands export
`ALLOW_REMOTE_DB_DESTRUCTIVE=true` to pass the db-safety guard that otherwise
blocks destructive scripts on non-local databases.

The supported deployment is Docker: `airflow/docker-compose.yml` runs Airflow
standalone (LocalExecutor + Postgres metadata DB) from a custom image with
Node 20 (`airflow/Dockerfile`), bind-mounts the repo at `/opt/tracedds`, and sets
the DAG's Airflow Variables via `AIRFLOW_VAR_*` environment entries — commits
are disabled by default until `AIRFLOW_VAR_TRACEDDS_SUPPLIER_INGEST_COMMIT` is
flipped to `true`. Setup commands are documented at the top of the compose file.

After committing and pushing changes, deploy the NUC instance from your
development machine with `npm run deploy:airflow` at the repo root. The deploy
helper SSHes to `nuc`, fast-forwards `/opt/tracedds` from the current branch,
and runs `docker compose up -d --build` in `airflow/`. Override defaults with
`NUC_HOST`, `NUC_REPO_DIR`, or `BRANCH` when needed.

Before a supplier can be scheduled it must exist in `tracedds_supplier`. Sky
Dental and Shasta Dental seed rows are tracked in
`medusa-backend/apps/backend/data/supplier-vetting/sky-shasta-catalog-sources.json`:

```bash
cd medusa-backend/apps/backend
npm run supplier:seed-usable -- ./data/supplier-vetting/sky-shasta-catalog-sources.json
```

The seed is idempotent: it replaces only the suppliers listed in the file.

## Current Known Adapter

Pearson Dental has a supplier-specific adapter.

It extracts SKU-level rows from Pearson item tables, including:

- supplier SKU
- manufacturer part number
- brand from page title
- clean item name
- item-level price
- SKU-specific `bin2` product URL

Pearson `product_thumb_multi.asp` pages are treated as family/category pages, not
SKU-level product pages.

Sky Dental Supply (skydentalsupply.com) has a supplier-specific adapter.

- Single `sitemap.xml` with ~7,600 `.htm` product URLs; standard sitemap
  discovery works.
- Product pages serve full schema.org Product JSON-LD (name, sku, mpn, brand,
  price, availability).
- Category/subcategory/product line come from BreadcrumbList markup; image
  URLs are stored in `raw.image_urls`.
- Discontinued products return HTTP 410 and are logged as failures.

Shasta Dental Supply (shastadentalsupply.com) has a supplier-specific adapter
plus a full-catalog discovery module (`shasta-catalog-discovery.ts`).

- No sitemap: `sitemap.xml` 404s and robots.txt has no `Sitemap:` directive,
  so discovery crawls `index.aspx -> show_Categories.aspx -> show_Subs.aspx ->
  show_Products.aspx` (family pages) and emits SKU-level
  `show_Product.aspx?ID=` URLs. Cap the crawl with
  `--max-shasta-catalog-pages` (default 5000).
- SKU pages expose Item Number (supplier SKU), Manufacturer, Mfg. Number,
  price with a basis suffix (`ea`/`bx`/`cs`/`pk`), availability, breadcrumb
  taxonomy, and pack size (`Components`).
- Clearance items strike the list price and show a `Sale Price:` line; the
  adapter extracts the sale price and keeps the list price in
  `raw.list_price`.

Henry Schein uses a dedicated catalog command because its Microsoft Commerce
Server catalog has no usable sitemap:

```bash
cd medusa-backend/apps/backend
npm run henryschein:ingest                 # dry run
npm run henryschein:ingest -- --commit    # replace the cached HS catalog
```

- The full category crawl ingests public JSON-LD identity fields for the entire
  dental catalog. It follows category pagination until the first empty or
  repeated page; large departments are no longer cut off at page 60. Most HS
  prices remain login-gated.
- A second pass reads the public [Web Priced Products](https://www.henryschein.com/us-en/dental/supplies/shop-web-pricing.aspx)
  campaign, discovers its explicit HS item IDs, fetches them in batches, and
  overlays the server-rendered public prices onto matching catalog rows.
- Only campaign-listed products receive price snapshots. A product merely
  accepting `dp=true` is not treated as evidence of a public web price.
- The command keeps the existing catalog shrink guard. Use `--allow-shrink`
  only when an intentional partial replacement is required.
- Commits also require a complete category crawl. Fetch failures, the global
  page cap, or a category reaching its safety cap abort replacement; use
  `--allow-incomplete` only for an intentional partial catalog.
- Keyword mode remains useful for focused dry runs, but cannot replace the full
  catalog unless `--allow-incomplete` is explicitly supplied.

Frontier Dental (frontierdental.com) is currently not ingestible.

- Cloudflare bot management returns 403 for all non-interactive clients,
  including `robots.txt`-allowed paths and `sitemap.xml`, for both plain
  HTTP fetches and headless browsers.
- Do not attempt to bypass the block. Options: request a catalog feed or
  dealer API access from the supplier, or use a manually exported CSV via
  `supplier:import-csv`.

## Marketplace Ingestion (Alibaba, Amazon)

Marketplaces have no catalog we can crawl, so they use a different,
search-driven pipeline. Instead of `discover -> index -> extract`, we ask the
marketplace whether it carries the products TraceDDS already knows about:

```text
list canonical products -> search by name -> parse results -> persist
```

For each canonical product we run a marketplace search for its `name`, take the
top results, and save each as a supplier product with an `image_url` and a price
snapshot. Because we searched *by* a known canonical product, the canonical match
is attached directly (graded by title token overlap), rather than re-running the
fuzzy supplier-catalog scorer.

The code lives in:

```text
medusa-backend/apps/backend/src/ingestion/marketplace/
  fetch.ts            # injectable fetcher + anti-bot detection
  parse.ts            # price / image / id / title-overlap + card + JSON-LD parsers
  providers/          # alibaba.ts, amazon.ts, index.ts (registry)
  search.ts           # canonical product -> search -> rows
  persist.ts          # rows -> supplier products + matches + price snapshots
```

Adding another marketplace is just a new provider (search-URL builder + a
`parseResults` that reuses the shared parsers) registered in `providers/index.ts`.

### Transport: marketplaces block bots

Alibaba (and Amazon) answer automated traffic with a captcha/"slider" page that
still returns HTTP 200. Plain `fetch` *and* a stealth headless browser both land
on it; direct access succeeds only intermittently. The fetcher detects these
interstitials (`detectAntiBot`) and yields zero rows rather than persisting a
captcha page as a product.

For reliable results, route the fetcher through a scraping proxy / data API by
setting a URL template (must contain `{url}`):

```bash
# ScraperAPI / ScrapingBee / Zyte-style endpoints all fit this shape:
export MARKETPLACE_SCRAPER_URL="https://api.scraperapi.com/?api_key=KEY&render=true&url={url}"
```

The parser is transport-agnostic — it reads whatever rendered HTML comes back,
whether from a direct fetch, a proxy, or a data API.

### Run it

```bash
cd medusa-backend/apps/backend

# Dry run (default): reads canonical products from the DB, searches, prints a
# summary + sample. Never writes. The DB read works against prod read-only.
npm run marketplace:ingest -- --provider=alibaba --limit=25 --results=3

# Commit (replaces this marketplace's catalog for the source). Guarded by the
# remote-DB safety check; configure MARKETPLACE_SCRAPER_URL first or most rows
# will be anti-bot blocked and the commit is refused.
npm run marketplace:ingest -- --provider=alibaba --limit=200 --results=3 --commit
```

Options (CLI flag or `MARKETPLACE_*` env): `--provider` (`alibaba`|`amazon`),
`--limit` (canonical products), `--results` (per product), `--query-prefix`,
`--category` (filter canonical products), `--concurrency`, `--timeout-ms`,
`--sample`, `--progress-every`, `--commit`. Products land under supplier
`msup_<provider>` (auto provisioned) and source catalog
`<provider>-marketplace-search`.

### Focused ingest from a seed list

By default the ingest searches canonical products by their own name. To instead
ingest a curated set of products (e.g. the top dental reorder items), pass a seed
file of query phrases — one per line, `#` comments allowed:

```bash
npm run marketplace:ingest -- --provider=amazon \
  --seeds-file=./data/marketplace-seeds/top-dental-reorder.txt \
  --results=20 --commit
```

Each seed is searched on the marketplace and its results are attached to the
best-matching canonical product (`bestCanonicalAnchor`, scored by token overlap,
ignoring the generic `dental`/`disposable` tokens). Seeds whose best anchor falls
below `--anchor-min` (default 20%) are skipped. Preview the seed → canonical
mapping without any marketplace fetch (free, no credits):

```bash
npm run marketplace:ingest -- --provider=amazon \
  --seeds-file=./data/marketplace-seeds/top-dental-reorder.txt --resolve-only
```

`data/marketplace-seeds/top-dental-reorder.txt` is the 50 products from
[top-50-dental-reorder-products.md](./top-50-dental-reorder-products.md). With
`--results=20`, ~50 seeds yield just under 1,000 marketplace products.

### Monitor progress

The ingest emits a live progress line every `--progress-every` queries
(default 10) so a long run is observable instead of only printing a
summary at the end:

```text
[marketplace-ingestion] progress 120/500 | with_results 96 | listings 271 | blocked 0 | errored 2 | 210s
```

`tail -f` the run, or watch it in the Render/Airflow logs. To inspect what's
actually persisted at any time (read-only):

```bash
npm run marketplace:status                      # all providers
npm run marketplace:status -- --provider=amazon # one provider
```

It reports, per provider: supplier provisioned, product count, products with an
image, distinct canonical products matched, match-status breakdown, price
snapshot count, and the last crawl timestamp.

Every ingest also logs ScraperAPI credits remaining before and after the run
(and `credits_used` in the JSON summary) for cost auditing, e.g.:

```text
[marketplace-ingestion] scraperapi credits before run: 3920 / 5000
[marketplace-ingestion] scraperapi credits remaining: 3900 / 5000 (used 20 this run)
```

The key is read from `SCRAPERAPI_API_KEY` or the `api_key` of
`MARKETPLACE_SCRAPER_URL`; the audit is a no-op when neither is a ScraperAPI key.

### Scheduled / re-running (Airflow)

`airflow/dags/marketplace_ingestion.py` defines one DAG per marketplace
(`marketplace_amazon`, `marketplace_alibaba`). Each is a two-task chain:
`ingest` (logs credits + summary) then `status` (logs persisted counts). Trigger
a re-run any time from the Airflow UI.

Because the marketplace fetch costs ScraperAPI credits, the DAGs default to
**manual trigger** (`schedule=None`). Set a cron to refresh prices periodically:

```text
airflow variables set tracedds_marketplace_amazon_schedule "0 9 * * 1"   # weekly Mon
```

The host's env file (`tracedds_env_file`) must define `MARKETPLACE_SCRAPER_URL`
(keep the key there, not in the DAG). Other knobs are Airflow Variables:
`tracedds_marketplace_commit`, `tracedds_marketplace_concurrency`,
`tracedds_marketplace_seeds_file`, `tracedds_marketplace_<name>_results`,
`tracedds_marketplace_<name>_anchor_min`. See the DAG docstring for the full list.

### Official APIs vs scraping

Neither marketplace offers an open keyword→price API: Amazon's Product
Advertising API is gated behind the Associates (affiliate) program and a sales
quota, and SP-API is scoped to a seller's own listings; Alibaba.com (B2B) has no
practical buyer price API (the accessible AliExpress affiliate API is a
different, retail catalog). That is why ingestion goes through `MARKETPLACE_SCRAPER_URL`.
If you obtain API credentials later, add an API-backed provider implementing the
same `MarketplaceProvider` interface — the rest of the pipeline is unchanged.

Note: Alibaba is a "protected domain" for many scraping APIs; ScraperAPI in
particular requires a paid plan (premium/residential proxies) for it, while
Amazon works on the free tier with `render=true`.
