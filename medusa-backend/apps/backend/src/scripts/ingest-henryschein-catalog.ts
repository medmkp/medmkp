import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import {
  extractHenryScheinCategoryLinks,
  extractHenryScheinProducts,
  extractHenryScheinWebPricedProductIds,
  extractHenryScheinWebPrices,
  HS_WEB_PRICING_URL,
} from "../ingestion/supplier-pipeline/adapters/henryschein"
import {
  crawlHenryScheinCatalog,
  HS_DENTAL_BROWSE_ROOT,
  HS_TOP_CATEGORY_FALLBACK,
  type HenryScheinCrawlSummary,
} from "../ingestion/supplier-pipeline/henryschein-catalog-crawl"
import {
  buildSupplierCatalogIngestion,
  type SupplierCatalogRow,
} from "../ingestion/supplier-catalog"
import {
  reconcileSupplierCatalog,
  type ReconcileInput,
  type ReconcileService,
} from "../ingestion/supplier-catalog-reconcile"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

/**
 * Henry Schein catalog ingestion with public web-price enrichment.
 *
 * Most HS prices are login-gated. Its public dental category listings provide
 * the full identity catalog, while the Web Priced Products campaign advertises
 * a bounded set of item IDs whose public prices render on Products.aspx. The
 * second pass overlays those prices onto matching identity rows.
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
const WEB_PRICE_BATCH_SIZE = 40
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

function webPriceProductsUrl(skus: string[]) {
  const params = new URLSearchParams({
    productid: skus.join(","),
    dp: "true",
    cdivid: "dental",
    browsingmode: "p",
  })
  return `https://www.henryschein.com/us-en/shopping/products.aspx?${params.toString()}`
}

async function fetchPublicWebPrices(): Promise<Map<string, number>> {
  const landingHtml = await fetchHtml(HS_WEB_PRICING_URL)
  const skus = landingHtml
    ? extractHenryScheinWebPricedProductIds(landingHtml)
    : []
  const prices = new Map<string, number>()

  if (!skus.length) {
    console.warn("[henryschein] Web-pricing campaign yielded no item IDs; continuing without prices")
    return prices
  }

  console.log(`[henryschein] Web-pricing campaign advertises ${skus.length} item IDs`)
  for (let offset = 0; offset < skus.length; offset += WEB_PRICE_BATCH_SIZE) {
    const batch = skus.slice(offset, offset + WEB_PRICE_BATCH_SIZE)
    const html = await fetchHtml(webPriceProductsUrl(batch))
    if (html) {
      for (const [sku, cents] of extractHenryScheinWebPrices(html)) {
        prices.set(sku, cents)
      }
    }
    console.log(
      `[henryschein]   web prices ${Math.min(offset + batch.length, skus.length)}/${skus.length} IDs; ${prices.size} prices`
    )
    if (offset + WEB_PRICE_BATCH_SIZE < skus.length) await sleep(300)
  }

  return prices
}

function parseArgs() {
  const args = process.argv.slice(2)
  const queries: string[] = []
  let commit = false
  let allowShrink = false
  let allowIncomplete = false
  let maxProducts = Infinity
  let maxPages = 12000
  let maxPagesPerCategory = 500
  let concurrency = 4

  for (const arg of args) {
    if (arg === "--commit") commit = true
    else if (arg === "--allow-shrink") allowShrink = true
    else if (arg === "--allow-incomplete") allowIncomplete = true
    else if (arg.startsWith("--query=")) queries.push(arg.slice("--query=".length))
    else if (arg.startsWith("--max-products=")) maxProducts = Number(arg.slice("--max-products=".length))
    else if (arg.startsWith("--max-pages=")) maxPages = Number(arg.slice("--max-pages=".length))
    else if (arg.startsWith("--max-pages-per-category=")) {
      maxPagesPerCategory = Number(arg.slice("--max-pages-per-category=".length))
    }
    else if (arg.startsWith("--concurrency=")) concurrency = Number(arg.slice("--concurrency=".length))
  }

  return {
    commit,
    allowShrink,
    allowIncomplete,
    maxProducts,
    maxPages,
    maxPagesPerCategory,
    concurrency,
    queries,
  }
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
  const {
    commit,
    allowShrink,
    allowIncomplete,
    maxProducts,
    maxPages,
    maxPagesPerCategory,
    concurrency,
    queries,
  } = parseArgs()
  const mode = queries.length ? `keyword sweep (${queries.length})` : "full category crawl"

  console.log(
    `[henryschein] ${commit ? "COMMIT" : "DRY RUN"} — ${mode} + public web-price enrichment`
  )

  let rows: SupplierCatalogRow[]
  let crawlSummary: HenryScheinCrawlSummary | undefined
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
      maxPagesPerNode: maxPagesPerCategory,
      concurrency,
      log: (msg) => console.log(msg),
      onSummary: (summary) => {
        crawlSummary = summary
      },
    })
  }

  if (!rows.length) {
    console.error("[henryschein] No products extracted — aborting (check fetch/UA).")
    return
  }

  if (commit && queries.length && !allowIncomplete) {
    console.error(
      "[henryschein] ABORT: keyword mode is intentionally partial and cannot replace the full catalog. " +
        "Use it as a dry run, or pass --allow-incomplete for an intentional partial replacement."
    )
    return
  }

  if (commit && crawlSummary && !crawlSummary.complete && !allowIncomplete) {
    console.error(
      "[henryschein] ABORT: category crawl was incomplete; refusing to replace the cached catalog. " +
        `failures=${crawlSummary.failedUrls.length} truncated=${crawlSummary.truncatedCategories.length} ` +
        `queued=${crawlSummary.queuedCategories} cap_hit=${crawlSummary.capHit}. ` +
        "Re-run after the site recovers or pass --allow-incomplete for an intentional partial replacement."
    )
    return
  }

  const webPrices = await fetchPublicWebPrices()
  let enriched = 0
  rows = rows.map((row) => {
    const sku = row.sku?.trim()
    const price_cents = sku ? webPrices.get(sku) : undefined
    if (price_cents === undefined) return row
    enriched++
    return {
      ...row,
      price_cents,
      raw: {
        ...((row.raw && typeof row.raw === "object") ? row.raw as Record<string, unknown> : {}),
        web_price_source_url: HS_WEB_PRICING_URL,
      },
    }
  })
  console.log(
    `[henryschein] Applied ${enriched} public prices to catalog rows` +
      (webPrices.size > enriched ? ` (${webPrices.size - enriched} priced IDs absent from this crawl)` : "")
  )

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
    `[henryschein] Extracted ${rows.length} products | ${matched} matched to a canonical product | ${rows.length - matched} unmatched | price snapshots ${ingestion.priceSnapshots.length}`
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
          "Public identity catalog with web-pricing campaign enrichment; most prices remain login-gated.",
        default_lead_time_days: 0,
        ach_enabled: false,
        catalog_source_urls: JSON.stringify(["https://www.henryschein.com/us-en/dental/"]),
        catalog_source_notes: "Public JSON-LD listings enriched from the public Web Priced Products campaign.",
      },
    ])
    console.log(`[henryschein] Created supplier ${SUPPLIER_ID}`)
  }

  // Gap-free reconcile (upsert + soft-delete) so live reads never see the HS
  // catalog disappear mid-refresh. The shrink guard lives inside the helper.
  try {
    const result = await reconcileSupplierCatalog(
      medmkp as unknown as ReconcileService,
      {
        supplier_id: SUPPLIER_ID,
        source_catalog: SOURCE_CATALOG,
        source: ingestion.source,
        supplierProducts: ingestion.supplierProducts as ReconcileInput["supplierProducts"],
        canonicalProductMatches:
          ingestion.canonicalProductMatches as ReconcileInput["canonicalProductMatches"],
        priceSnapshots: ingestion.priceSnapshots as ReconcileInput["priceSnapshots"],
      },
      { allowCatalogShrink: allowShrink, log: console.log }
    )
    console.log(
      `[henryschein] COMMIT complete — products(+${result.supplier_products.created}/~${result.supplier_products.updated}/restore ${result.supplier_products.restored}/-${result.supplier_products.soft_deleted}) ` +
        `matches(+${result.canonical_product_matches.created}/-${result.canonical_product_matches.soft_deleted}) ` +
        `snapshots(+${result.price_snapshots.created}/~${result.price_snapshots.updated}).`
    )
  } catch (error) {
    console.error(`[henryschein] ABORT: ${(error as Error).message}`)
    return
  }
}
