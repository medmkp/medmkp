import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import { extractPattersonProduct } from "../ingestion/supplier-pipeline/adapters/patterson"
import {
  discoverPattersonItemUrls,
  PATTERSON_SITEMAP_INDEX,
} from "../ingestion/supplier-pipeline/patterson-catalog-discovery"
import {
  buildSupplierCatalogIngestion,
  type SupplierCatalogRow,
} from "../ingestion/supplier-catalog"
import {
  beginSupplierCatalogReconcile,
  type ReconcileService,
} from "../ingestion/supplier-catalog-reconcile"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

/**
 * Patterson Dental catalog ingestion.
 *
 * Patterson exposes ~120k product pages logged-out via its sitemap, each
 * carrying name, brand, MPN and pack — but no public price (UnitPrice is gated
 * behind login). So this is an identity-only catalog (like Henry Schein): the
 * rows feed substitute matching by MPN / name+brand; no price snapshots.
 *
 * Stage 1 reads the sitemap index → child sitemaps → /Supplies/ItemDetail URLs.
 * Stage 2 fetches each item page (concurrency-limited, browser UA, one retry),
 * parses the embedded item model, and STREAMS the rows to the DB in batches via
 * the gap-free reconcile session. Streaming keeps peak memory at one batch +
 * the set of seen ids — the whole-catalog-in-memory build OOM-killed the first
 * 65k-product prod run on the 7 GB NUC.
 *
 * Default run is a DRY RUN; --commit writes (subject to the destructive-DB
 * guard, so a remote/prod DB needs ALLOW_REMOTE_DB_DESTRUCTIVE=true).
 *
 *   yarn patterson:ingest                          # dry run, full catalog
 *   yarn patterson:ingest -- --max-products=200    # quick sample dry run
 *   yarn patterson:ingest -- --commit              # write supplier rows + matches
 */

const SUPPLIER_ID = "msup_pattersondental_com"
const SOURCE_CATALOG = "patterson-website-public"
const SOURCE_URL = "https://www.pattersondental.com/Supplies"
const DB_CHUNK_SIZE = 500
// How many item pages to fetch+parse+write per streamed batch. Bounds peak
// memory; one batch of rows + its artifacts is all that's held at a time.
const FETCH_BATCH_SIZE = 1000
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Browser-UA fetch with one retry; returns "" on failure so the run skips a bad
// page instead of aborting the whole crawl.
async function fetchText(url: string): Promise<string> {
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
        console.warn(`[patterson] fetch failed ${url}: ${(error as Error).message}`)
        return ""
      }
      await sleep(1500)
    }
  }
  return ""
}

// Map an array with a fixed worker pool so we never hold more than `concurrency`
// in-flight requests against Patterson.
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) break
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function* chunk<T>(items: T[], size: number): Generator<T[]> {
  for (let offset = 0; offset < items.length; offset += size) {
    yield items.slice(offset, offset + size)
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  let commit = false
  let allowShrink = false
  let allowIncomplete = false
  let maxProducts = Infinity
  let concurrency = 6
  let throttleMs = 0

  for (const arg of args) {
    if (arg === "--commit") commit = true
    else if (arg === "--allow-shrink" || arg === "--allow-catalog-shrink") allowShrink = true
    else if (arg === "--allow-incomplete") allowIncomplete = true
    else if (arg.startsWith("--max-products=")) maxProducts = Number(arg.slice("--max-products=".length))
    else if (arg.startsWith("--concurrency=")) concurrency = Number(arg.slice("--concurrency=".length))
    else if (arg.startsWith("--throttle-ms=")) throttleMs = Number(arg.slice("--throttle-ms=".length))
  }

  return { commit, allowShrink, allowIncomplete, maxProducts, concurrency, throttleMs }
}

export default async function ingestPattersonCatalog({
  container,
}: {
  container: MedusaContainer
}) {
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const { commit, allowShrink, allowIncomplete, maxProducts, concurrency, throttleMs } =
    parseArgs()

  console.log(`[patterson] ${commit ? "COMMIT" : "DRY RUN"} — sitemap-driven identity catalog (streamed)`)

  // Stage 1: discover product URLs from the sitemap.
  const itemUrls = await discoverPattersonItemUrls({
    fetchText,
    log: (msg) => console.log(msg),
    maxUrls: maxProducts,
  })
  if (!itemUrls.length) {
    console.error("[patterson] No item URLs discovered — aborting (check sitemap/UA).")
    return
  }
  console.log(`[patterson] Discovered ${itemUrls.length} product URLs; fetching pages…`)

  if (commit) {
    assertDestructiveDbOperationAllowed("patterson:ingest --commit (writes supplier catalog rows)")

    // Ensure the Patterson supplier row exists before we stream products to it.
    const existingSupplier = await medmkp.listSuppliers({ id: [SUPPLIER_ID] })
    if (!existingSupplier.length) {
      await medmkp.createSuppliers([
        {
          id: SUPPLIER_ID,
          name: "Patterson Dental",
          slug: "patterson-dental",
          website_url: "https://www.pattersondental.com",
          support_email: "",
          onboarding_status: "in_review" as const,
          ein_last_four: "",
          certification_summary:
            "Public identity catalog from the Patterson sitemap; prices remain login-gated.",
          default_lead_time_days: 0,
          ach_enabled: false,
          catalog_source_urls: JSON.stringify([PATTERSON_SITEMAP_INDEX]),
          catalog_source_notes:
            "Public /Supplies/ItemDetail pages parsed from the embedded item model (name, brand, MPN, pack); no public price.",
        },
      ])
      console.log(`[patterson] Created supplier ${SUPPLIER_ID}`)
    }
  }

  // The source row is upserted by the reconcile session; build it once (the
  // build's other artifacts are produced per batch).
  const { source } = buildSupplierCatalogIngestion(
    {
      supplier_id: SUPPLIER_ID,
      source_type: "website",
      source_catalog: SOURCE_CATALOG,
      source_url: SOURCE_URL,
      auth_required: false,
      refresh_frequency: "manual",
      rows: [],
    },
    []
  )

  const session = commit
    ? await beginSupplierCatalogReconcile(
        medmkp as unknown as ReconcileService,
        { supplier_id: SUPPLIER_ID, source_catalog: SOURCE_CATALOG, source },
        { allowCatalogShrink: allowShrink, chunkSize: DB_CHUNK_SIZE, log: console.log }
      )
    : null

  // Stage 2: fetch + parse + write in streamed batches. Only one batch's pages
  // and artifacts are in memory at a time; cross-batch SKU dedupe uses a set of
  // strings (cheap), and the reconcile session tracks seen ids for the final
  // stale soft-delete.
  let fetched = 0
  let failures = 0
  let written = 0
  const seenSku = new Set<string>()

  for (const urlBatch of chunk(itemUrls, FETCH_BATCH_SIZE)) {
    const parsed = await mapPool(urlBatch, concurrency, async (url) => {
      const html = await fetchText(url)
      if (throttleMs) await sleep(throttleMs)
      const done = ++fetched
      if (done % 500 === 0 || done === itemUrls.length) {
        console.log(`[patterson]   fetched ${done}/${itemUrls.length} (failures ${failures}, written ${written})`)
      }
      if (!html) {
        failures++
        return null
      }
      const row = extractPattersonProduct(html, url)
      if (!row) failures++
      return row
    })

    const rows: SupplierCatalogRow[] = []
    for (const row of parsed) {
      if (!row?.sku || seenSku.has(row.sku)) continue
      seenSku.add(row.sku)
      rows.push(row)
    }
    if (!rows.length) continue

    if (session) {
      const ingestion = buildSupplierCatalogIngestion(
        {
          supplier_id: SUPPLIER_ID,
          source_type: "website",
          source_catalog: SOURCE_CATALOG,
          source_url: SOURCE_URL,
          auth_required: false,
          refresh_frequency: "manual",
          rows,
        },
        []
      )
      await session.upsertBatch({
        supplierProducts: ingestion.supplierProducts as never,
        canonicalProductMatches: ingestion.canonicalProductMatches as never,
        priceSnapshots: ingestion.priceSnapshots as never,
      })
    }
    written += rows.length
  }

  console.log(
    `[patterson] Parsed/${commit ? "wrote" : "would write"} ${written} unique products from ${itemUrls.length} URLs (${failures} fetch/parse failures)`
  )

  if (!written) {
    console.error("[patterson] No products parsed — aborting.")
    return
  }

  if (!session) {
    console.log("[patterson] DRY RUN complete — no writes. Re-run with --commit to persist.")
    return
  }

  // A degraded crawl must not soft-delete the healthy catalog. The batches are
  // already committed additively (gap-free); on high failure we keep them but
  // skip stale removal (cleaned up by the next healthy run) unless forced.
  const failureRate = failures / itemUrls.length
  const degraded = failureRate > 0.2
  const softDeleteStale = !degraded || allowIncomplete
  if (degraded && !allowIncomplete) {
    console.warn(
      `[patterson] WARNING: ${(failureRate * 100).toFixed(1)}% of pages failed (>20%); ` +
        "committed fetched rows but SKIPPING stale soft-delete (pass --allow-incomplete to force it)."
    )
  }

  try {
    const result = await session.finalize({ softDeleteStale })
    console.log(
      `[patterson] COMMIT complete — products(+${result.supplier_products.created}/~${result.supplier_products.updated}/restore ${result.supplier_products.restored}/-${result.supplier_products.soft_deleted}) ` +
        `matches(+${result.canonical_product_matches.created}/restore ${result.canonical_product_matches.restored}/-${result.canonical_product_matches.soft_deleted}).`
    )
  } catch (error) {
    console.error(`[patterson] ABORT during finalize: ${(error as Error).message}`)
  }
}
