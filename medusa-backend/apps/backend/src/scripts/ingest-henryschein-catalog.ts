import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import {
  extractHenryScheinCategoryLinks,
  extractHenryScheinProducts,
} from "../ingestion/supplier-pipeline/adapters/henryschein"
import {
  crawlHenryScheinCatalog,
  HS_DENTAL_BROWSE_ROOT,
  HS_TOP_CATEGORY_FALLBACK,
} from "../ingestion/supplier-pipeline/henryschein-catalog-crawl"
import {
  buildSupplierCatalogIngestion,
  type SupplierCatalogRow,
} from "../ingestion/supplier-catalog"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

/**
 * Henry Schein catalog ingestion — identity layer only (no prices).
 *
 * HS gates pricing behind login, but its public dental category listings embed
 * a JSON-LD Product block per item (name, brand, mpn, sku). We ingest those so a
 * scanned HS item (HIBC code → REF → sku) resolves to a real product, and the
 * search route can offer priced substitutes from other suppliers.
 *
 * Default crawl walks the full category tree (top categories → hubs → leaf
 * listings, paginated). Pass --query=… to instead sweep specific keyword
 * searches (faster, partial coverage). Default run is a DRY RUN (no writes);
 * --commit writes (subject to the destructive-DB guard, so a remote/prod DB
 * needs ALLOW_REMOTE_DB_DESTRUCTIVE=true).
 *
 *   yarn henryschein:ingest                       # dry run, full category crawl
 *   yarn henryschein:ingest -- --commit           # write supplier rows + matches
 *   yarn henryschein:ingest -- --query="cotton roll"   # targeted keyword mode
 */

const SUPPLIER_ID = "msup_henryschein_com"
const SOURCE_CATALOG = "henry-schein-website-public"
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Browser-UA fetch with one retry; returns "" on failure so the crawl skips a
// bad node instead of aborting. Akamai stalls the default bot UA but serves a
// real Chrome UA.
async function fetchHtml(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 45000)
      const response = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      if (attempt === 2) {
        console.warn(`[henryschein] fetch failed ${url}: ${(error as Error).message}`)
        return ""
      }
      await sleep(1500)
    }
  }
  return ""
}

function searchUrl(query: string, page: number) {
  const params = new URLSearchParams({
    did: "dental",
    searchkeyword: query,
    rfm: "Catalog:DENTAL",
    pageNumber: String(page),
  })
  return `https://www.henryschein.com/us-en/Search.aspx?${params.toString()}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  const queries: string[] = []
  let commit = false
  let maxProducts = Infinity
  let maxPages = 6000
  let concurrency = 4

  for (const arg of args) {
    if (arg === "--commit") commit = true
    else if (arg.startsWith("--query=")) queries.push(arg.slice("--query=".length))
    else if (arg.startsWith("--max-products=")) maxProducts = Number(arg.slice("--max-products=".length))
    else if (arg.startsWith("--max-pages=")) maxPages = Number(arg.slice("--max-pages=".length))
    else if (arg.startsWith("--concurrency=")) concurrency = Number(arg.slice("--concurrency=".length))
  }

  return { commit, maxProducts, maxPages, concurrency, queries }
}

// Top-level dental categories to seed the crawl: read live from the browse root,
// falling back to the known list if that fetch fails.
async function discoverSeedCategories(): Promise<string[]> {
  const html = await fetchHtml(HS_DENTAL_BROWSE_ROOT)
  const top = html ? extractHenryScheinCategoryLinks(html) : []
  return top.length ? top : HS_TOP_CATEGORY_FALLBACK
}

// Keyword-search sweep (optional --query mode): paginate each query until a page
// adds no new SKUs.
async function crawlByQueries(
  queries: string[],
  maxProducts: number
): Promise<SupplierCatalogRow[]> {
  const bySku = new Map<string, SupplierCatalogRow>()
  for (const query of queries) {
    for (let page = 1; page <= 60; page++) {
      const html = await fetchHtml(searchUrl(query, page))
      const rows = html ? extractHenryScheinProducts(html) : []
      let added = 0
      for (const row of rows) {
        if (!row.sku || bySku.has(row.sku)) continue
        bySku.set(row.sku, row)
        added++
        if (bySku.size >= maxProducts) break
      }
      console.log(`[henryschein]   "${query}" p${page}: ${rows.length} products, +${added} (total ${bySku.size})`)
      if (added === 0 || bySku.size >= maxProducts) break
      await sleep(800)
    }
    if (bySku.size >= maxProducts) break
  }
  return [...bySku.values()]
}

export default async function ingestHenryScheinCatalog({
  container,
}: {
  container: MedusaContainer
}) {
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const { commit, maxProducts, maxPages, concurrency, queries } = parseArgs()
  const mode = queries.length ? `keyword sweep (${queries.length})` : "full category crawl"

  console.log(
    `[henryschein] ${commit ? "COMMIT" : "DRY RUN"} — ${mode} (identity only, no prices)`
  )

  let rows: SupplierCatalogRow[]
  if (queries.length) {
    rows = await crawlByQueries(queries, maxProducts)
  } else {
    const seedUrls = await discoverSeedCategories()
    console.log(`[henryschein] seeded ${seedUrls.length} top categories; crawling…`)
    rows = await crawlHenryScheinCatalog({
      fetchHtml,
      seedUrls,
      maxProducts,
      maxPages,
      concurrency,
      log: (msg) => console.log(msg),
    })
  }

  if (!rows.length) {
    console.error("[henryschein] No products extracted — aborting (check fetch/UA).")
    return
  }

  // Match against the live canonical catalog (read-only) to see how the rows land.
  const canonicalProducts = await medmkp.listCanonicalProducts()
  const ingestion = buildSupplierCatalogIngestion(
    {
      supplier_id: SUPPLIER_ID,
      source_type: "website",
      source_catalog: SOURCE_CATALOG,
      source_url: "https://www.henryschein.com/us-en/dental/",
      auth_required: false,
      refresh_frequency: "manual",
      rows,
    },
    canonicalProducts.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      attributes_text: p.attributes_text,
    }))
  )

  const matched = ingestion.canonicalProductMatches.filter(
    (m) => (m as { canonical_product_id: string }).canonical_product_id
  ).length
  console.log(
    `[henryschein] Extracted ${rows.length} products | ${matched} matched to a canonical product | ${rows.length - matched} unmatched | price snapshots ${ingestion.priceSnapshots.length} (expected 0)`
  )

  // Show a few sample matches so the reviewer can judge substitute quality.
  const matchById = new Map(
    canonicalProducts.map((p) => [p.id, p.name] as const)
  )
  const samples = (ingestion.canonicalProductMatches as Array<{
    supplier_product_id: string
    canonical_product_id: string
    match_status: string
    confidence_score: number
  }>)
    .filter((m) => m.canonical_product_id)
    .slice(0, 12)
  const productById = new Map(
    (ingestion.supplierProducts as Array<{ id: string; name: string }>).map((p) => [p.id, p.name])
  )
  console.log("[henryschein] Sample matches (HS item → canonical, status):")
  for (const m of samples) {
    console.log(
      `   • ${productById.get(m.supplier_product_id)?.slice(0, 48)} → ${matchById.get(m.canonical_product_id)?.slice(0, 48)} [${m.match_status} ${m.confidence_score}]`
    )
  }

  if (!commit) {
    console.log("[henryschein] DRY RUN complete — no writes. Re-run with --commit to persist.")
    return
  }

  assertDestructiveDbOperationAllowed("henryschein:ingest --commit (writes supplier catalog rows)")

  // Ensure the Henry Schein supplier row exists.
  const existingSupplier = await medmkp.listSuppliers({ id: [SUPPLIER_ID] })
  if (!existingSupplier.length) {
    await medmkp.createSuppliers([
      {
        id: SUPPLIER_ID,
        name: "Henry Schein",
        slug: "henry-schein",
        website_url: "https://www.henryschein.com",
        support_email: "",
        onboarding_status: "in_review" as const,
        ein_last_four: "",
        certification_summary:
          "Identity-only catalog (prices login-gated) used as a scan-to-substitute reference.",
        default_lead_time_days: 0,
        ach_enabled: false,
        catalog_source_urls: JSON.stringify(["https://www.henryschein.com/us-en/dental/"]),
        catalog_source_notes: "Public JSON-LD listings; no prices ingested.",
      },
    ])
    console.log(`[henryschein] Created supplier ${SUPPLIER_ID}`)
  }

  // Replace any prior HS rows for this source, then write the fresh identity rows.
  const existingProducts = await medmkp.listSupplierProducts({
    supplier_id: SUPPLIER_ID,
    source_catalog: SOURCE_CATALOG,
  })
  if (existingProducts.length) {
    const ids = existingProducts.map((p) => p.id)
    const existingMatches = await medmkp.listCanonicalProductMatches({ supplier_product_id: ids })
    if (existingMatches.length) await medmkp.deleteCanonicalProductMatches(existingMatches.map((m) => m.id))
    await medmkp.deleteSupplierProducts(ids)
    console.log(`[henryschein] Deleted ${ids.length} prior HS products`)
  }

  await medmkp.createSupplierCatalogSources(ingestion.source)
  await medmkp.createSupplierProducts(
    ingestion.supplierProducts as Parameters<typeof medmkp.createSupplierProducts>[0]
  )
  await medmkp.createCanonicalProductMatches(
    ingestion.canonicalProductMatches as Parameters<typeof medmkp.createCanonicalProductMatches>[0]
  )

  console.log(
    `[henryschein] COMMIT complete — wrote ${ingestion.supplierProducts.length} products + ${ingestion.canonicalProductMatches.length} matches (0 price snapshots).`
  )
}
