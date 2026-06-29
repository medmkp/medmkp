import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import { boundedId } from "../ingestion/supplier-catalog"
import { unitPriceCents } from "../ingestion/pack"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

/**
 * Net32 price refresh — the cheap recurring counterpart to the canonical-mode
 * discovery sweep (`marketplace:ingest --provider=net32`).
 *
 * Discovery is slow because every canonical product means a full headful-browser
 * search (navigate + clear Cloudflare + render). But once a Net32 listing is
 * known, its `mpId` is embedded in the stored `product_url` (`/ec/<slug>-d-<mpId>`)
 * and re-pricing it is just a `getBestPrice` POST — no navigation. So this script
 * reads the already-discovered Net32 supplier products, asks the harvester's new
 * `/prices` endpoint to re-price their mpIds in batches, and writes fresh price
 * snapshots. The whole catalog re-prices in minutes instead of the ~45h a full
 * re-search would take.
 *
 *   npm run net32:refresh-prices                 # dry run
 *   npm run net32:refresh-prices -- --limit=200  # quick sample dry run
 *   npm run net32:refresh-prices -- --commit     # write price snapshots
 */

const SUPPLIER_ID = "msup_net32"
const SOURCE_CATALOG = "net32-marketplace-search"
const MP_ID_RE = /-d-(\d+)(?:[/?#]|$)/
const DEFAULT_SIDECAR_URL = "http://127.0.0.1:8791"
const DB_CHUNK = 500

type Options = {
  commit: boolean
  /** mpIds per harvester /prices call (it re-batches by 12 internally). */
  batchSize: number
  /** Cap products processed (0 = all). */
  limit: number
  postal?: string
  sample: number
  timeoutMs: number
}

function parseOptions(): Options {
  const options: Options = {
    commit: process.env.NET32_REFRESH_COMMIT === "1",
    batchSize: process.env.NET32_PRICE_BATCH ? Number(process.env.NET32_PRICE_BATCH) : 240,
    limit: process.env.NET32_REFRESH_LIMIT ? Number(process.env.NET32_REFRESH_LIMIT) : 0,
    postal: process.env.NET32_POSTAL_CODE,
    sample: 10,
    timeoutMs: process.env.NET32_PRICE_TIMEOUT_MS
      ? Number(process.env.NET32_PRICE_TIMEOUT_MS)
      : 120000,
  }
  for (const arg of process.argv.slice(2)) {
    if (arg === "--commit") options.commit = true
    else if (arg.startsWith("--batch-size=")) options.batchSize = Number(arg.split("=")[1])
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.split("=")[1])
    else if (arg.startsWith("--postal=")) options.postal = arg.split("=")[1]
    else if (arg.startsWith("--sample=")) options.sample = Number(arg.split("=")[1])
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = Number(arg.split("=")[1])
  }
  return options
}

type BestPrice = { unitPrice?: number; inStockSw?: boolean }

async function fetchPrices(
  mpIds: number[],
  postal: string | undefined,
  timeoutMs: number
): Promise<{ bestPriceMap: Record<string, BestPrice>; blocked: boolean }> {
  const baseUrl = (
    process.env.NET32_HARVESTER_URL ?? DEFAULT_SIDECAR_URL
  ).replace(/\/$/, "")
  const token = process.env.NET32_HARVESTER_TOKEN ?? ""
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/prices`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ mpIds, postal }),
      signal: controller.signal,
    })
    if (!response.ok) {
      return { bestPriceMap: {}, blocked: false }
    }
    const body = (await response.json()) as {
      bestPriceMap?: Record<string, BestPrice>
      blocked?: boolean
    }
    return { bestPriceMap: body.bestPriceMap ?? {}, blocked: Boolean(body.blocked) }
  } catch {
    return { bestPriceMap: {}, blocked: false }
  } finally {
    clearTimeout(timer)
  }
}

function toCents(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return Math.round(value * 100)
}

export default async function refreshNet32Prices({
  container,
}: {
  container: MedusaContainer
}) {
  const options = parseOptions()
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  // Active Net32 supplier products only (Medusa list excludes soft-deleted).
  const products = (await medmkp.listSupplierProducts(
    { supplier_id: SUPPLIER_ID, source_catalog: SOURCE_CATALOG },
    { select: ["id", "sku", "product_url", "pack_quantity"] }
  )) as Array<{
    id: string
    sku: string
    product_url?: string
    pack_quantity?: number | null
  }>

  // Recover each product's Net32 mpId from its stored URL; dedupe by mpId so a
  // listing shared across canonicals is priced once.
  const byMpId = new Map<
    number,
    { id: string; sku: string; pack_quantity: number | null; product_url: string }
  >()
  for (const product of products) {
    const match = MP_ID_RE.exec(product.product_url ?? "")
    const mpId = match ? Number(match[1]) : 0
    if (!mpId || byMpId.has(mpId)) continue
    byMpId.set(mpId, {
      id: product.id,
      sku: product.sku,
      pack_quantity: product.pack_quantity ?? null,
      product_url: product.product_url ?? "",
    })
  }

  let mpIds = [...byMpId.keys()]
  if (options.limit > 0) mpIds = mpIds.slice(0, options.limit)

  console.log(
    `[net32-refresh] ${mpIds.length} distinct mpIds (of ${products.length} net32 supplier products) — ` +
      `commit=${options.commit} batch=${options.batchSize}`
  )
  if (!mpIds.length) {
    console.log("[net32-refresh] nothing to refresh (run the discovery sweep first).")
    return
  }

  const capturedAt = new Date().toISOString()
  const snapshots: Array<Record<string, unknown> & { id: string }> = []
  let priced = 0
  let blocked = 0
  const startedAt = Date.now()

  for (let i = 0; i < mpIds.length; i += options.batchSize) {
    const chunk = mpIds.slice(i, i + options.batchSize)
    const { bestPriceMap, blocked: chunkBlocked } = await fetchPrices(
      chunk,
      options.postal,
      options.timeoutMs
    )
    if (chunkBlocked) blocked += chunk.length

    for (const mpId of chunk) {
      const bp = bestPriceMap[String(mpId)]
      const price_cents = toCents(bp?.unitPrice)
      if (typeof price_cents !== "number") continue
      const target = byMpId.get(mpId)!
      priced += 1
      snapshots.push({
        id: boundedId("msps", [SUPPLIER_ID, SOURCE_CATALOG, target.sku, capturedAt], 96),
        supplier_product_id: target.id,
        supplier_id: SUPPLIER_ID,
        price_cents,
        price_basis: "unknown",
        unit_price_cents: unitPriceCents(price_cents, target.pack_quantity),
        min_quantity: 1,
        availability: bp?.inStockSw ? "in_stock" : "unknown",
        captured_at: capturedAt,
        source_url: target.product_url,
        confidence_score: 80,
      })
    }

    const done = Math.min(i + options.batchSize, mpIds.length)
    if (done % (options.batchSize * 10) === 0 || done === mpIds.length) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      console.log(
        `[net32-refresh] ${done}/${mpIds.length} mpIds | priced ${priced} | blocked ${blocked} | ${elapsed}s`
      )
    }
  }

  if (options.commit && snapshots.length) {
    assertDestructiveDbOperationAllowed(
      "net32:refresh-prices --commit (writes net32 price snapshots)"
    )
    // Snapshot ids embed captured_at, so a same-window re-run updates; otherwise
    // create. Never delete — the snapshot series is the price history.
    const ids = snapshots.map((snapshot) => snapshot.id)
    const existing = (await medmkp.listSupplierPriceSnapshots(
      { id: ids },
      { withDeleted: true, select: ["id"] }
    )) as Array<{ id: string }>
    const existingIds = new Set(existing.map((row) => row.id))
    const toCreate = snapshots.filter((snapshot) => !existingIds.has(snapshot.id))
    const toUpdate = snapshots.filter((snapshot) => existingIds.has(snapshot.id))
    for (let i = 0; i < toCreate.length; i += DB_CHUNK) {
      await medmkp.createSupplierPriceSnapshots(toCreate.slice(i, i + DB_CHUNK))
    }
    for (let i = 0; i < toUpdate.length; i += DB_CHUNK) {
      await medmkp.updateSupplierPriceSnapshots(toUpdate.slice(i, i + DB_CHUNK))
    }
    console.log(
      `[net32-refresh] COMMIT: created ${toCreate.length}, updated ${toUpdate.length} ` +
        `price snapshots @ ${capturedAt}`
    )
  }

  console.log(
    JSON.stringify(
      {
        net32_supplier_products: products.length,
        mpIds_refreshed: mpIds.length,
        priced,
        blocked,
        snapshots: snapshots.length,
        committed: options.commit,
        captured_at: capturedAt,
        sample: snapshots.slice(0, options.sample).map((snapshot) => ({
          supplier_product_id: snapshot.supplier_product_id,
          price_cents: snapshot.price_cents,
          unit_price_cents: snapshot.unit_price_cents,
          availability: snapshot.availability,
        })),
      },
      null,
      2
    )
  )
}
