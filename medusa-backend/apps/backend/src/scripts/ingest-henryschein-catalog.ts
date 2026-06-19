import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import { extractHenryScheinProducts } from "../ingestion/supplier-pipeline/adapters/henryschein"
import {
  buildSupplierCatalogIngestion,
  type SupplierCatalogRow,
} from "../ingestion/supplier-catalog"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

/**
 * Henry Schein catalog ingestion — identity layer only (no prices).
 *
 * HS gates pricing behind login, but its public search/category listings embed
 * a JSON-LD Product block per item (name, brand, mpn, sku). We ingest those so a
 * scanned HS item (HIBC code → REF → sku) resolves to a real product, and the
 * search route can offer priced substitutes from other suppliers.
 *
 * Default run is a DRY RUN (no writes): it fetches the seed queries, extracts
 * rows, matches them against the canonical catalog, and reports coverage. Pass
 * --commit to write (subject to the destructive-DB guard, since writing to a
 * remote/prod DB needs MEDMKP_ALLOW_DESTRUCTIVE_DB=1).
 *
 *   yarn henryschein:ingest                 # dry run
 *   yarn henryschein:ingest -- --commit     # write supplier rows + matches
 *   yarn henryschein:ingest -- --query="cotton roll" --query="prophy paste"
 */

const SUPPLIER_ID = "msup_henryschein_com"
const SOURCE_CATALOG = "henry-schein-website-public"
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"

// Broad dental-supply terms that fan out across the catalog. Not exhaustive —
// full coverage would walk the category tree with pagination (a follow-up); this
// set is enough to ingest the common consumables practices actually scan.
const DEFAULT_QUERIES = [
  "nitrile exam glove",
  "gauze sponge",
  "cotton roll",
  "saliva ejector",
  "prophy paste",
  "prophy angle",
  "fluoride varnish",
  "impression material",
  "composite refill",
  "etch gel",
  "bonding agent",
  "temporary cement",
  "anesthetic",
  "endodontic file",
  "carbide bur",
  "diamond bur",
  "surface disinfectant",
  "barrier film",
  "face mask",
  "suction tip",
]

function searchUrl(query: string) {
  const params = new URLSearchParams({
    did: "dental",
    searchkeyword: query,
    rfm: "Catalog:DENTAL",
  })
  return `https://www.henryschein.com/us-en/Search.aspx?${params.toString()}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchListing(query: string): Promise<string> {
  const url = searchUrl(query)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
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
        console.warn(`[henryschein] fetch failed for "${query}": ${(error as Error).message}`)
        return ""
      }
      await sleep(2000)
    }
  }
  return ""
}

function parseArgs() {
  const args = process.argv.slice(2)
  const queries: string[] = []
  let commit = false
  let maxProducts = Infinity

  for (const arg of args) {
    if (arg === "--commit") commit = true
    else if (arg.startsWith("--query=")) queries.push(arg.slice("--query=".length))
    else if (arg.startsWith("--max-products=")) maxProducts = Number(arg.slice("--max-products=".length))
  }

  return { commit, maxProducts, queries: queries.length ? queries : DEFAULT_QUERIES }
}

export default async function ingestHenryScheinCatalog({
  container,
}: {
  container: MedusaContainer
}) {
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const { commit, maxProducts, queries } = parseArgs()

  console.log(
    `[henryschein] ${commit ? "COMMIT" : "DRY RUN"} — fetching ${queries.length} queries (identity only, no prices)`
  )

  // Crawl: one fetch per query, dedupe products by HS sku across all pages.
  const bySku = new Map<string, SupplierCatalogRow>()
  for (const query of queries) {
    const html = await fetchListing(query)
    const rows = html ? extractHenryScheinProducts(html) : []
    let added = 0
    for (const row of rows) {
      if (!row.sku || bySku.has(row.sku)) continue
      bySku.set(row.sku, row)
      added++
      if (bySku.size >= maxProducts) break
    }
    console.log(`[henryschein]   "${query}": ${rows.length} products, +${added} new (total ${bySku.size})`)
    if (bySku.size >= maxProducts) break
    await sleep(1500) // polite crawl rate
  }

  const rows = [...bySku.values()]
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
