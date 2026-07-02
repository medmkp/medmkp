import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import type { MedusaContainer } from "@medusajs/framework"
import { buildSupplierCatalogIngestion } from "../ingestion/supplier-catalog"
import {
  reconcileSupplierCatalog,
  type ReconcileInput,
  type ReconcileService,
} from "../ingestion/supplier-catalog-reconcile"
import type {
  SupplierCatalogIngestionInput,
  SupplierCatalogRow,
} from "../ingestion/supplier-catalog"
import { runSupplierIngestionPipeline } from "../ingestion/supplier-pipeline/pipeline"
import type { SupplierIngestionStage } from "../ingestion/supplier-pipeline/pipeline"
import { normalizeSiteUrl } from "../ingestion/supplier-pipeline/suppliers"
import type {
  IndexedSupplierUrl,
  SupplierSeedRow,
  SupplierSitemapSummary,
  SupplierSourceUrl,
} from "../ingestion/supplier-pipeline/types"
import { findUsableSupplierCatalogSource } from "../ingestion/supplier-vetting"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

const CLI_STAGES = ["discover", "index", "extract", "commit"] as const

type CliStage = (typeof CLI_STAGES)[number]

type CliOptions = {
  supplierId?: string
  supplierName?: string
  stages?: CliStage[]
  stateDir?: string
  limit?: number
  timeoutMs?: number
  sitemapConcurrency?: number
  productConcurrency?: number
  sourceUrls: string[]
  sourceConcurrency?: number
  maxLinksPerSource?: number
  maxSitemapsPerSupplier?: number
  maxDcDentalCatalogPages?: number
  maxPearsonCatalogPages?: number
  maxPracticonCatalogPages?: number
  maxShastaCatalogPages?: number
  debug: boolean
  commit: boolean
  allowEmptyCommit: boolean
  allowCatalogShrink: boolean
  ensureSupplier: boolean
}

function optionValue(arg: string) {
  const [, ...parts] = arg.split("=")
  return parts.join("=")
}

function parseStages(value: string | undefined) {
  if (!value?.trim()) {
    return undefined
  }

  const stages = value
    .split(",")
    .map((stage) => stage.trim())
    .filter(Boolean)

  stages.forEach((stage) => {
    if (!CLI_STAGES.includes(stage as CliStage)) {
      throw new Error(
        `Unknown ingestion stage "${stage}". Expected one of: ${CLI_STAGES.join(", ")}`
      )
    }
  })

  return stages as CliStage[]
}

function parseOptions(): CliOptions {
  const options: CliOptions = {
    supplierId: process.env.SUPPLIER_ID,
    supplierName: process.env.SUPPLIER_NAME,
    stages: parseStages(process.env.SUPPLIER_INGESTION_STAGES),
    stateDir: process.env.SUPPLIER_INGESTION_STATE_DIR,
    limit: process.env.PRODUCT_PAGE_LIMIT
      ? Number(process.env.PRODUCT_PAGE_LIMIT)
      : undefined,
    timeoutMs: process.env.PRODUCT_PAGE_TIMEOUT_MS
      ? Number(process.env.PRODUCT_PAGE_TIMEOUT_MS)
      : undefined,
    sitemapConcurrency: process.env.SUPPLIER_INGESTION_SITEMAP_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_SITEMAP_CONCURRENCY)
      : undefined,
    productConcurrency: process.env.SUPPLIER_INGESTION_PRODUCT_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_PRODUCT_CONCURRENCY)
      : undefined,
    sourceUrls: process.env.SUPPLIER_INGESTION_SOURCE_URLS
      ? process.env.SUPPLIER_INGESTION_SOURCE_URLS.split(",").map((url) => url.trim()).filter(Boolean)
      : [],
    sourceConcurrency: process.env.SUPPLIER_INGESTION_SOURCE_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_SOURCE_CONCURRENCY)
      : undefined,
    maxLinksPerSource: process.env.SUPPLIER_INGESTION_MAX_LINKS_PER_SOURCE
      ? Number(process.env.SUPPLIER_INGESTION_MAX_LINKS_PER_SOURCE)
      : undefined,
    maxSitemapsPerSupplier: process.env.SUPPLIER_INGESTION_MAX_SITEMAPS_PER_SUPPLIER
      ? Number(process.env.SUPPLIER_INGESTION_MAX_SITEMAPS_PER_SUPPLIER)
      : undefined,
    maxDcDentalCatalogPages: process.env.SUPPLIER_INGESTION_MAX_DCDENTAL_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_DCDENTAL_CATALOG_PAGES)
      : undefined,
    maxPearsonCatalogPages: process.env.SUPPLIER_INGESTION_MAX_PEARSON_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_PEARSON_CATALOG_PAGES)
      : undefined,
    maxPracticonCatalogPages: process.env.SUPPLIER_INGESTION_MAX_PRACTICON_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_PRACTICON_CATALOG_PAGES)
      : undefined,
    maxShastaCatalogPages: process.env.SUPPLIER_INGESTION_MAX_SHASTA_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_SHASTA_CATALOG_PAGES)
      : undefined,
    debug: process.env.SUPPLIER_INGESTION_DEBUG === "1",
    commit: process.env.SUPPLIER_INGESTION_COMMIT === "1",
    allowEmptyCommit: process.env.SUPPLIER_INGESTION_ALLOW_EMPTY_COMMIT === "1",
    allowCatalogShrink: process.env.SUPPLIER_INGESTION_ALLOW_CATALOG_SHRINK === "1",
    ensureSupplier: process.env.SUPPLIER_INGESTION_ENSURE_SUPPLIER === "1",
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === "--debug") {
      options.debug = true
    }
    if (arg === "--commit") {
      options.commit = true
    }
    if (arg === "--allow-empty-commit") {
      options.allowEmptyCommit = true
    }
    if (arg === "--allow-catalog-shrink") {
      options.allowCatalogShrink = true
    }
    if (arg === "--ensure-supplier") {
      options.ensureSupplier = true
    }
    if (arg.startsWith("--supplier-id=")) {
      options.supplierId = optionValue(arg)
    }
    if (arg.startsWith("--stages=")) {
      options.stages = parseStages(optionValue(arg))
    }
    if (arg.startsWith("--state-dir=")) {
      options.stateDir = optionValue(arg)
    }
    if (arg.startsWith("--supplier=")) {
      options.supplierName = optionValue(arg)
    }
    if (arg.startsWith("--limit=")) {
      options.limit = Number(optionValue(arg))
    }
    if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(optionValue(arg))
    }
    if (arg.startsWith("--sitemap-concurrency=")) {
      options.sitemapConcurrency = Number(optionValue(arg))
    }
    if (arg.startsWith("--product-concurrency=")) {
      options.productConcurrency = Number(optionValue(arg))
    }
    if (arg.startsWith("--source-url=")) {
      options.sourceUrls.push(optionValue(arg))
    }
    if (arg.startsWith("--source-concurrency=")) {
      options.sourceConcurrency = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-links-per-source=")) {
      options.maxLinksPerSource = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-sitemaps-per-supplier=")) {
      options.maxSitemapsPerSupplier = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-dcdental-catalog-pages=")) {
      options.maxDcDentalCatalogPages = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-pearson-catalog-pages=")) {
      options.maxPearsonCatalogPages = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-practicon-catalog-pages=")) {
      options.maxPracticonCatalogPages = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-shasta-catalog-pages=")) {
      options.maxShastaCatalogPages = Number(optionValue(arg))
    }
  }

  return options
}

function sourceCatalogForSupplier(supplier: { slug?: string; website_url: string }) {
  const slug = supplier.slug?.trim()

  if (slug) {
    return `${slug}-website-public`
  }

  return new URL(supplier.website_url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() + "-website-public"
}

function cents(value: string | undefined) {
  if (!value?.trim()) {
    return undefined
  }

  const dollars = Number(value.replace(/[$,\s]/g, ""))

  return Number.isFinite(dollars) ? Math.round(dollars * 100) : undefined
}

function catalogRows(rows: Awaited<ReturnType<typeof runSupplierIngestionPipeline>>["products"]) {
  return rows.map((row): SupplierCatalogRow => ({
    ...row,
    price_cents: row.price_cents ?? cents(row.price),
  }))
}

function validUrl(value: string | undefined) {
  if (!value?.trim()) {
    return false
  }

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function parseSupplierSourceUrls(value: string | undefined) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)

    if (Array.isArray(parsed)) {
      return parsed.filter((url): url is string => typeof url === "string")
    }
  } catch {
    // Fall through to line/comma parsing for hand-edited values.
  }

  return trimmed
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter(Boolean)
}

function sourceUrlRecord(input: {
  supplierName: string
  supplierWebsiteUrl: string
  prices?: string
  sourceCatalog: string
  sourceUrl: string
}): SupplierSourceUrl {
  const site = normalizeSiteUrl(input.supplierWebsiteUrl)

  return {
    distributor: input.supplierName,
    website_url: input.supplierWebsiteUrl,
    origin: site.origin,
    prices: input.prices ?? "Y",
    source_catalog: input.sourceCatalog,
    source_url: input.sourceUrl,
  }
}

const dcDentalDefaultSourcePaths = [
  "/Supplies",
  "/Small-Equipment",
  "/3M-Merchandise",
]

function defaultSourceUrlsForSupplier(supplier: {
  name: string
  website_url: string
  slug?: string
}) {
  const site = normalizeSiteUrl(supplier.website_url)

  if (!/dcdental.com$/i.test(new URL(site.origin).hostname) &&
    !/dc dental/i.test(supplier.name)) {
    return [] as SupplierSourceUrl[]
  }

  return dcDentalDefaultSourcePaths.map((path) => sourceUrlRecord({
    supplierName: supplier.name,
    supplierWebsiteUrl: supplier.website_url,
    sourceCatalog: sourceCatalogForSupplier(supplier),
    sourceUrl: new URL(path, site.origin).href,
  }))
}

function loadStageState<T>(stateDir: string, name: string): T {
  const path = join(stateDir, name)

  if (!existsSync(path)) {
    throw new Error(
      `Missing ingestion state file ${path}. Run the earlier stage(s) with --state-dir=${stateDir} first.`
    )
  }

  return JSON.parse(readFileSync(path, "utf8")) as T
}

function saveStageState(stateDir: string, name: string, value: unknown) {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(join(stateDir, name), JSON.stringify(value))
}

function assertNonEmptyCandidateState(options: {
  stages: CliStage[]
  allowEmptyCommit: boolean
  productCandidates: number
  extractedProducts: number
}) {
  if (options.allowEmptyCommit) {
    return
  }

  if (options.stages.includes("index") && options.productCandidates === 0) {
    throw new Error(
      "Ingestion index stage produced 0 product candidates. Refusing to save empty state for a commit-capable run. Re-run with --debug to inspect discovery, or pass --allow-empty-commit only if this supplier is intentionally empty."
    )
  }

  if (options.stages.includes("extract") && options.productCandidates === 0) {
    throw new Error(
      "Ingestion extract stage received 0 product candidates. Refusing to continue with empty state. Re-run the index stage with --debug, or pass --allow-empty-commit only if this supplier is intentionally empty."
    )
  }

  if (options.stages.includes("extract") && options.extractedProducts === 0) {
    throw new Error(
      "Ingestion extract stage produced 0 products. Refusing to save empty products for a commit-capable run. Re-run with --debug to inspect extraction failures, or pass --allow-empty-commit only if this supplier is intentionally empty."
    )
  }
}

// Re-exported for back-compat with existing imports/tests; the supplier-agnostic
// shrink backstop now lives in the shared reconcile module.
export { assertCatalogReplaceNotDestructive } from "../ingestion/supplier-catalog-reconcile"

async function replaceSupplierCatalog(
  medmkp: MedMKPModuleService,
  input: SupplierCatalogIngestionInput,
  options: { allowCatalogShrink: boolean }
) {
  const canonicalProducts = await medmkp.listCanonicalProducts()
  const ingestion = buildSupplierCatalogIngestion(
    input,
    canonicalProducts.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      attributes_text: product.attributes_text,
    }))
  )

  // Gap-free reconcile (upsert + soft-delete) instead of delete-all-then-create,
  // so live reads never see this supplier's catalog disappear mid-refresh.
  return reconcileSupplierCatalog(
    medmkp as unknown as ReconcileService,
    {
      supplier_id: input.supplier_id,
      source_catalog: input.source_catalog,
      source: ingestion.source,
      supplierProducts: ingestion.supplierProducts as ReconcileInput["supplierProducts"],
      canonicalProductMatches:
        ingestion.canonicalProductMatches as ReconcileInput["canonicalProductMatches"],
      priceSnapshots: ingestion.priceSnapshots as ReconcileInput["priceSnapshots"],
    },
    { allowCatalogShrink: options.allowCatalogShrink, log: console.log }
  )
}

/**
 * Create-if-missing DB provisioning from the vetting registry, so a scheduled
 * or ad-hoc ingest of a newly onboarded supplier does not require a manual
 * `supplier:seed-usable` run first. Mirrors that seeder's field mapping but is
 * strictly additive: it never deletes or overwrites an existing supplier row
 * (re-seeding an edited vetting entry is still `supplier:seed-usable`'s job).
 */
async function ensureSupplierFromVetting(
  medmkp: MedMKPModuleService,
  options: CliOptions
) {
  if (!options.supplierId) {
    throw new Error("--ensure-supplier requires --supplier-id")
  }

  const existing = await medmkp.listSuppliers()
  if (existing.some((supplier) => supplier.id === options.supplierId)) {
    return
  }

  const entry = findUsableSupplierCatalogSource(options.supplierId)
  if (!entry) {
    throw new Error(
      `--ensure-supplier: no vetting entry with supplier_id "${options.supplierId}" ` +
        "under data/supplier-vetting/*-catalog-sources.json"
    )
  }

  await medmkp.createSuppliers([
    {
      id: entry.supplier_id,
      name: entry.supplier_name,
      slug: entry.slug,
      website_url: entry.website_url,
      support_email: "",
      onboarding_status: "in_review" as const,
      ein_last_four: "",
      certification_summary: `Usable dental supplier lead from research CSV. ${entry.notes}`,
      default_lead_time_days: 0,
      ach_enabled: false,
      catalog_source_urls: JSON.stringify([entry.source_url]),
      catalog_source_notes: `Seeded from vetted supplier CSV. Source company row: ${entry.source_company_name}. ${entry.notes}`,
    },
  ])

  const sources = await medmkp.listSupplierCatalogSources()
  const hasSource = sources.some(
    (source) =>
      source.supplier_id === entry.supplier_id &&
      source.source_catalog === entry.source_catalog
  )
  if (!hasSource) {
    await medmkp.createSupplierCatalogSources([
      {
        id: `mscs_${entry.slug.replace(/-/g, "_")}`,
        supplier_id: entry.supplier_id,
        source_type: entry.source_type,
        source_catalog: entry.source_catalog,
        source_url: entry.source_url,
        auth_required: false,
        refresh_frequency: "manual" as const,
        last_crawled_at: new Date().toISOString(),
        status: "active" as const,
        notes: `Seeded from vetted supplier CSV. Source company row: ${entry.source_company_name}.`,
      },
    ])
  }

  console.log(
    `[supplier-ingestion] ensured supplier ${entry.supplier_id} (${entry.supplier_name}) from the vetting registry`
  )
}

export default async function ingestSupplierCatalogs({
  container,
}: {
  container: MedusaContainer
}) {
  assertDestructiveDbOperationAllowed(
    "supplier:ingest:db (replaces supplier catalogs)"
  )

  const options = parseOptions()
  const stages = options.stages ?? [...CLI_STAGES]
  const pipelineStages = stages.filter(
    (stage): stage is SupplierIngestionStage => stage !== "commit"
  )
  const stateDir = options.stateDir

  if (options.stages && stages.length < CLI_STAGES.length && !stateDir) {
    throw new Error(
      "Running a subset of stages requires --state-dir so separate stage runs can share intermediate state"
    )
  }

  const initialSitemaps =
    stateDir && pipelineStages.includes("index") && !pipelineStages.includes("discover")
      ? loadStageState<SupplierSitemapSummary[]>(stateDir, "sitemaps.json")
      : undefined
  const initialIndexedUrls =
    stateDir && pipelineStages.includes("extract") && !pipelineStages.includes("index")
      ? loadStageState<IndexedSupplierUrl[]>(stateDir, "indexed-urls.json")
      : undefined

  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  if (options.ensureSupplier) {
    await ensureSupplierFromVetting(medmkp, options)
  }

  const dbSuppliers = await medmkp.listSuppliers()
  const suppliers = dbSuppliers
    .filter((supplier) => !options.supplierId || supplier.id === options.supplierId)
    .map((supplier): SupplierSeedRow => ({
      distributor: supplier.name,
      website_url: supplier.website_url,
      prices: "Y",
    }))
  const matchedSupplier = dbSuppliers.find((supplier) =>
    options.supplierId
      ? supplier.id === options.supplierId
      : supplier.name === (options.supplierName ?? suppliers[0]?.distributor)
  )
  const dbSourceUrls = matchedSupplier
    ? parseSupplierSourceUrls(matchedSupplier.catalog_source_urls)
        .filter(validUrl)
        .map((sourceUrl) => sourceUrlRecord({
          supplierName: matchedSupplier.name,
          supplierWebsiteUrl: matchedSupplier.website_url,
          sourceCatalog: sourceCatalogForSupplier(matchedSupplier),
          sourceUrl,
        }))
    : []
  const cliSourceUrls = matchedSupplier
    ? options.sourceUrls.map((sourceUrl) => sourceUrlRecord({
      supplierName: matchedSupplier.name,
      supplierWebsiteUrl: matchedSupplier.website_url,
      sourceCatalog: sourceCatalogForSupplier(matchedSupplier),
      sourceUrl,
    }))
    : []
  const fallbackSourceUrls = matchedSupplier && !dbSourceUrls.length && !cliSourceUrls.length
    ? defaultSourceUrlsForSupplier(matchedSupplier)
    : []

  const result = await runSupplierIngestionPipeline({
    suppliers,
    supplierName: options.supplierName,
    stages: pipelineStages,
    initialSitemaps,
    initialIndexedUrls,
    productLimit: options.limit,
    timeoutMs: options.timeoutMs,
    sitemapConcurrency: options.sitemapConcurrency,
    productConcurrency: options.productConcurrency,
    sourceUrls: [...dbSourceUrls, ...cliSourceUrls, ...fallbackSourceUrls],
    sourceConcurrency: options.sourceConcurrency,
    maxLinksPerSource: options.maxLinksPerSource,
    maxSitemapsPerSupplier: options.maxSitemapsPerSupplier,
    maxDcDentalCatalogPages: options.maxDcDentalCatalogPages,
    maxPearsonCatalogPages: options.maxPearsonCatalogPages,
    maxPracticonCatalogPages: options.maxPracticonCatalogPages,
    maxShastaCatalogPages: options.maxShastaCatalogPages,
    debug: options.debug,
  })

  assertNonEmptyCandidateState({
    stages,
    allowEmptyCommit: options.allowEmptyCommit,
    productCandidates: result.summary.product_candidates,
    extractedProducts: result.summary.extracted_products,
  })

  if (stateDir) {
    if (pipelineStages.includes("discover")) {
      saveStageState(stateDir, "sitemaps.json", result.sitemaps)
    }
    if (pipelineStages.includes("index")) {
      saveStageState(stateDir, "indexed-urls.json", result.indexedUrls)
    }
    if (pipelineStages.includes("extract")) {
      saveStageState(stateDir, "products.json", result.products)
      saveStageState(stateDir, "failures.json", result.failures)
    }
  }

  const products =
    stateDir && stages.includes("commit") && !stages.includes("extract")
      ? loadStageState<typeof result.products>(stateDir, "products.json")
      : result.products
  const commitRequested = options.commit && stages.includes("commit")
  let importResult:
    | Awaited<ReturnType<typeof replaceSupplierCatalog>>
    | undefined

  if (commitRequested) {
    if (!matchedSupplier) {
      throw new Error("Commit requires exactly one matched DB supplier")
    }
    if (!products.length && !options.allowEmptyCommit) {
      throw new Error(
        "Commit aborted: ingestion extracted 0 products. Re-run without --commit to inspect debug output, or pass --allow-empty-commit if you intentionally want to clear this supplier/source catalog."
      )
    }

    importResult = await replaceSupplierCatalog(medmkp, {
      supplier_id: matchedSupplier.id,
      source_type: "website",
      source_url: matchedSupplier.website_url,
      source_catalog: sourceCatalogForSupplier(matchedSupplier),
      rows: catalogRows(products),
    }, { allowCatalogShrink: options.allowCatalogShrink })
  }

  console.log(
    JSON.stringify(
      {
        source: "medmkp_supplier",
        commit: commitRequested,
        state_dir: stateDir,
        allow_empty_commit: options.allowEmptyCommit,
        supplier_id: matchedSupplier?.id,
        source_urls: dbSourceUrls.length + cliSourceUrls.length + fallbackSourceUrls.length,
        ...result.summary,
        import: importResult,
      },
      null,
      2
    )
  )
}
