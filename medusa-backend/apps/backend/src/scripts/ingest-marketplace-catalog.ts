import { readFileSync } from "fs"
import type { MedusaContainer } from "@medusajs/framework"
import {
  createMarketplaceFetcher,
  resolveScraperTemplate,
} from "../ingestion/marketplace/fetch"
import { buildMarketplaceIngestion } from "../ingestion/marketplace/persist"
import {
  reconcileSupplierCatalog,
  type ReconcileInput,
  type ReconcileService,
} from "../ingestion/supplier-catalog-reconcile"
import { getMarketplaceProvider } from "../ingestion/marketplace/providers"
import {
  fetchScraperApiCredits,
  resolveScraperApiKey,
} from "../ingestion/marketplace/scraperapi"
import {
  readSeedQueries,
  resolveSeeds,
  type CanonicalRecord,
} from "../ingestion/marketplace/seeds"
import {
  searchCanonicalOnMarketplace,
  type CanonicalProductInput,
  type MarketplaceCatalogRow,
  type SearchCanonicalResult,
} from "../ingestion/marketplace/search"
import type { MarketplaceProvider } from "../ingestion/marketplace/types"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

type CliOptions = {
  provider: string
  limit: number
  offset: number
  results: number
  queryPrefix: string
  category?: string
  seedsFile?: string
  anchorMin: number
  resolveOnly: boolean
  concurrency: number
  timeoutMs: number
  sample: number
  progressEvery: number
  commit: boolean
}

function optionValue(arg: string) {
  const [, ...parts] = arg.split("=")
  return parts.join("=")
}

function parseOptions(): CliOptions {
  const options: CliOptions = {
    provider: process.env.MARKETPLACE_PROVIDER ?? "alibaba",
    limit: process.env.MARKETPLACE_LIMIT ? Number(process.env.MARKETPLACE_LIMIT) : 25,
    offset: process.env.MARKETPLACE_OFFSET ? Number(process.env.MARKETPLACE_OFFSET) : 0,
    results: process.env.MARKETPLACE_RESULTS ? Number(process.env.MARKETPLACE_RESULTS) : 3,
    queryPrefix: process.env.MARKETPLACE_QUERY_PREFIX ?? "",
    category: process.env.MARKETPLACE_CATEGORY,
    seedsFile: process.env.MARKETPLACE_SEEDS_FILE,
    anchorMin: process.env.MARKETPLACE_ANCHOR_MIN
      ? Number(process.env.MARKETPLACE_ANCHOR_MIN)
      : 20,
    resolveOnly: process.env.MARKETPLACE_RESOLVE_ONLY === "1",
    concurrency: process.env.MARKETPLACE_CONCURRENCY
      ? Number(process.env.MARKETPLACE_CONCURRENCY)
      : 3,
    timeoutMs: process.env.MARKETPLACE_TIMEOUT_MS
      ? Number(process.env.MARKETPLACE_TIMEOUT_MS)
      : 20000,
    sample: process.env.MARKETPLACE_SAMPLE ? Number(process.env.MARKETPLACE_SAMPLE) : 10,
    progressEvery: process.env.MARKETPLACE_PROGRESS_EVERY
      ? Number(process.env.MARKETPLACE_PROGRESS_EVERY)
      : 10,
    commit: process.env.MARKETPLACE_COMMIT === "1",
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === "--commit") options.commit = true
    if (arg.startsWith("--provider=")) options.provider = optionValue(arg)
    if (arg.startsWith("--limit=")) options.limit = Number(optionValue(arg))
    if (arg.startsWith("--offset=")) options.offset = Number(optionValue(arg))
    if (arg.startsWith("--results=")) options.results = Number(optionValue(arg))
    if (arg.startsWith("--query-prefix=")) options.queryPrefix = optionValue(arg)
    if (arg.startsWith("--category=")) options.category = optionValue(arg)
    if (arg.startsWith("--concurrency=")) options.concurrency = Number(optionValue(arg))
    if (arg.startsWith("--timeout-ms=")) options.timeoutMs = Number(optionValue(arg))
    if (arg.startsWith("--sample=")) options.sample = Number(optionValue(arg))
    if (arg.startsWith("--progress-every=")) options.progressEvery = Number(optionValue(arg))
    if (arg.startsWith("--seeds-file=")) options.seedsFile = optionValue(arg)
    if (arg.startsWith("--anchor-min=")) options.anchorMin = Number(optionValue(arg))
    if (arg === "--resolve-only") options.resolveOnly = true
  }

  return options
}

/**
 * Resolve seed queries to search items against the canonical catalog, logging
 * each seed -> canonical anchor decision so a run is auditable.
 */
function seedSearchItems(
  seedsFile: string,
  canonical: CanonicalRecord[],
  anchorMin: number
): CanonicalProductInput[] {
  const resolutions = resolveSeeds(
    readSeedQueries(readFileSync(seedsFile, "utf8")),
    canonical,
    anchorMin
  )

  for (const resolution of resolutions) {
    if (resolution.item && resolution.anchor) {
      console.log(
        `[marketplace-ingestion] seed "${resolution.seed}" -> canonical ${resolution.anchor.id}` +
          ` "${resolution.anchor.name}" (${resolution.score}%)`
      )
    } else {
      console.log(
        `[marketplace-ingestion] seed "${resolution.seed}" -> no canonical anchor >= ${anchorMin}%` +
          ` (best ${resolution.score}%); skipping`
      )
    }
  }

  return resolutions
    .map((resolution) => resolution.item)
    .filter((item): item is CanonicalProductInput => item !== undefined)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  iterator: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await iterator(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker)
  )

  return results
}

async function ensureSupplier(
  medmkp: MedMKPModuleService,
  provider: MarketplaceProvider
): Promise<string> {
  const supplierId = `msup_${provider.id}`
  const existing = await medmkp.listSuppliers({ id: supplierId })

  if (!existing.length) {
    await medmkp.createSuppliers([
      {
        id: supplierId,
        name: provider.supplier.name,
        slug: provider.supplier.slug,
        website_url: provider.supplier.website_url,
        support_email: "",
        onboarding_status: "in_review" as const,
        ein_last_four: "",
        certification_summary: `${provider.supplier.name} marketplace, sourced via canonical-product search.`,
        default_lead_time_days: 0,
        ach_enabled: false,
        catalog_source_urls: JSON.stringify([provider.supplier.website_url]),
        catalog_source_notes: `Auto-provisioned for ${provider.id} marketplace search ingestion.`,
      },
    ])
    console.log(`[marketplace-ingestion] Created supplier ${supplierId} (${provider.supplier.name})`)
  }

  return supplierId
}

async function commitMarketplaceCatalog(
  medmkp: MedMKPModuleService,
  supplierId: string,
  sourceCatalog: string,
  provider: MarketplaceProvider,
  rows: MarketplaceCatalogRow[]
) {
  const ingestion = buildMarketplaceIngestion({
    supplier_id: supplierId,
    source_catalog: sourceCatalog,
    source_url: provider.supplier.website_url,
    rows,
  })

  // Gap-free reconcile (upsert + soft-delete) instead of delete-all-then-create,
  // so live reads never see this marketplace supplier's catalog disappear
  // mid-refresh. Marketplace ingests are search-driven and intentionally narrow,
  // so the shrink guard is relaxed here.
  const result = await reconcileSupplierCatalog(
    medmkp as unknown as ReconcileService,
    {
      supplier_id: supplierId,
      source_catalog: sourceCatalog,
      source: ingestion.source,
      supplierProducts: ingestion.supplierProducts as ReconcileInput["supplierProducts"],
      canonicalProductMatches:
        ingestion.canonicalProductMatches as ReconcileInput["canonicalProductMatches"],
      priceSnapshots: ingestion.priceSnapshots as ReconcileInput["priceSnapshots"],
    },
    { allowCatalogShrink: true, log: console.log }
  )

  return {
    supplier_products:
      result.supplier_products.created +
      result.supplier_products.updated +
      result.supplier_products.restored,
    canonical_product_matches: ingestion.canonicalProductMatches.length,
    price_snapshots: ingestion.priceSnapshots.length,
  }
}

export default async function ingestMarketplaceCatalog({
  container,
}: {
  container: MedusaContainer
}) {
  const options = parseOptions()
  const provider = getMarketplaceProvider(options.provider)
  const sourceCatalog = `${provider.id}-marketplace-search`
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  const allCanonical = await medmkp.listCanonicalProducts()
  const canonicalRecords: CanonicalRecord[] = allCanonical.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    unit_of_measure: product.unit_of_measure,
  }))

  // Two ways to choose what to search for:
  //  - seeds file: curated query phrases (e.g. the top-50 reorder list), each
  //    attached to its best-matching canonical product;
  //  - otherwise: the canonical products themselves (optionally category-filtered),
  //    searched by their own name. --offset + --limit page through the catalog so a
  //    scheduled job can sweep it in nightly batches (offset rotates by run date).
  const searchItems: CanonicalProductInput[] = options.seedsFile
    ? seedSearchItems(options.seedsFile, canonicalRecords, options.anchorMin)
    : (options.category
        ? canonicalRecords.filter((product) =>
            product.category?.toLowerCase().includes(options.category!.toLowerCase())
          )
        : canonicalRecords
      ).slice(options.offset, options.offset + options.limit)

  console.log(
    `[marketplace-ingestion] provider=${provider.id}` +
      ` ${options.seedsFile ? "seeds" : "canonical_products"}=${searchItems.length}` +
      ` (offset ${options.offset}, limit ${options.limit}, of ${allCanonical.length} canonical)` +
      ` results_per_query=${options.results} commit=${options.commit}`
  )

  if (options.resolveOnly) {
    console.log(
      `[marketplace-ingestion] resolve-only: ${searchItems.length} search item(s) resolved; exiting before any marketplace fetch.`
    )
    return
  }

  // Amazon (static cards) and Alibaba (stealth/JS) need different proxy settings,
  // so prefer a provider-specific MARKETPLACE_SCRAPER_URL_<PROVIDER> over the
  // shared one. The DAG runs each provider as its own task off the same env file.
  const scraperTemplate = resolveScraperTemplate(provider.id)
  if (!scraperTemplate) {
    console.log(
      `[marketplace-ingestion] NOTE: no scraper template for ${provider.id} ` +
        `(set MARKETPLACE_SCRAPER_URL_${provider.id.toUpperCase()} or MARKETPLACE_SCRAPER_URL) — ` +
        "fetching the marketplace directly. Alibaba/Amazon answer bot traffic with a captcha page, " +
        "so most rows will be blocked. Use a scraping proxy template (containing {url}) for real results."
    )
  }

  // Audit ScraperAPI credit consumption around the run (metered/paid service).
  const scraperApiKey = resolveScraperApiKey()
  const creditsBefore = scraperApiKey
    ? await fetchScraperApiCredits(scraperApiKey)
    : undefined
  if (creditsBefore?.credits_left !== undefined) {
    console.log(
      `[marketplace-ingestion] scraperapi credits before run: ${creditsBefore.credits_left}` +
        ` / ${creditsBefore.request_limit ?? "?"}`
    )
  }

  const fetcher = createMarketplaceFetcher({ scraperUrlTemplate: scraperTemplate })
  const startedAt = Date.now()
  const progress = { done: 0, listings: 0, blocked: 0, errored: 0, withResults: 0 }
  const searches: SearchCanonicalResult[] = await mapWithConcurrency(
    searchItems,
    options.concurrency,
    async (product) => {
      const search = await searchCanonicalOnMarketplace(
        provider,
        fetcher,
        {
          id: product.id,
          name: product.name,
          category: product.category,
          unit_of_measure: product.unit_of_measure,
        },
        {
          maxResults: options.results,
          queryPrefix: options.queryPrefix,
          timeoutMs: options.timeoutMs,
        }
      )

      // Live progress so a long run is observable via stdout / `tail -f` rather
      // than only printing a summary at the very end.
      progress.done += 1
      progress.listings += search.results.length
      if (search.blocked) progress.blocked += 1
      if (search.error) progress.errored += 1
      if (search.results.length) progress.withResults += 1
      if (progress.done % options.progressEvery === 0 || progress.done === searchItems.length) {
        const elapsed = Math.round((Date.now() - startedAt) / 1000)
        console.log(
          `[marketplace-ingestion] progress ${progress.done}/${searchItems.length}` +
            ` | with_results ${progress.withResults} | listings ${progress.listings}` +
            ` | blocked ${progress.blocked} | errored ${progress.errored} | ${elapsed}s`
        )
      }

      return search
    }
  )

  const rows = searches.flatMap((search) => search.rows)
  const blockedCount = searches.filter((search) => search.blocked).length
  const errorCount = searches.filter((search) => search.error).length
  const withResults = searches.filter((search) => search.results.length > 0).length

  const summary = {
    provider: provider.id,
    source_catalog: sourceCatalog,
    queries_searched: searchItems.length,
    queries_with_results: withResults,
    searches_blocked: blockedCount,
    searches_errored: errorCount,
    listings_found: rows.length,
    listings_with_price: rows.filter((row) => typeof row.price_cents === "number").length,
    listings_with_image: rows.filter((row) => Boolean(row.image_url)).length,
  }

  const sample = rows.slice(0, options.sample).map((row) => ({
    canonical_product_id: row.canonical_product_id,
    sku: row.sku,
    name: row.name,
    price_cents: row.price_cents,
    image_url: row.image_url,
    product_url: row.product_url,
    match: `${row.canonical_match_status} (${row.canonical_match_confidence}%)`,
  }))

  let importResult: Awaited<ReturnType<typeof commitMarketplaceCatalog>> | undefined
  if (options.commit) {
    assertDestructiveDbOperationAllowed(
      "marketplace:ingest --commit (replaces marketplace supplier catalog)"
    )
    if (!rows.length) {
      throw new Error(
        "Commit aborted: 0 marketplace listings found (likely anti-bot blocked). " +
          "Configure MARKETPLACE_SCRAPER_URL and re-run without --commit to inspect results first."
      )
    }
    const supplierId = await ensureSupplier(medmkp, provider)
    importResult = await commitMarketplaceCatalog(
      medmkp,
      supplierId,
      sourceCatalog,
      provider,
      rows
    )
  }

  const creditsAfter = scraperApiKey
    ? await fetchScraperApiCredits(scraperApiKey)
    : undefined
  const creditsUsed =
    creditsBefore?.credits_left !== undefined && creditsAfter?.credits_left !== undefined
      ? creditsBefore.credits_left - creditsAfter.credits_left
      : undefined
  if (creditsAfter?.credits_left !== undefined) {
    console.log(
      `[marketplace-ingestion] scraperapi credits remaining: ${creditsAfter.credits_left}` +
        ` / ${creditsAfter.request_limit ?? "?"}` +
        (creditsUsed !== undefined ? ` (used ${creditsUsed} this run)` : "")
    )
  }

  const scraperapi = scraperApiKey
    ? {
        credits_before: creditsBefore?.credits_left,
        credits_after: creditsAfter?.credits_left,
        credits_used: creditsUsed,
        request_limit: creditsAfter?.request_limit ?? creditsBefore?.request_limit,
      }
    : undefined

  console.log(
    JSON.stringify(
      { ...summary, commit: options.commit, scraperapi, import: importResult, sample },
      null,
      2
    )
  )
}
