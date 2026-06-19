import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { tokenizeName } from "../../../../matching/normalize"
import { nameSimilarity, trigrams } from "../../../../matching/search"
import { gtinVariants } from "../../../../matching/gtin"
import { parseHibc } from "../../../../matching/hibc"

// Live product lookup for the search box (fuzzy text) and the scanner
// (exact SKU). Reuses the offline matching engine's tokenizer so ranking stays
// consistent with how invoices are matched, and resolves hits to canonical
// products so the UI can compare prices across suppliers.

type Snapshot = Awaited<ReturnType<MedMKPModuleService["listSupplierPriceSnapshots"]>>[number]

function latestSnapshotsByProduct(snapshots: Snapshot[]) {
  return snapshots.reduce((acc, snapshot) => {
    const existing = acc.get(snapshot.supplier_product_id)
    if (
      !existing ||
      new Date(snapshot.captured_at).getTime() > new Date(existing.captured_at).getTime()
    ) {
      acc.set(snapshot.supplier_product_id, snapshot)
    }
    return acc
  }, new Map<string, Snapshot>())
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>()
  for (const row of rows) {
    if (!seen.has(row.id)) seen.set(row.id, row)
  }
  return [...seen.values()]
}

type CanonicalRow = Awaited<ReturnType<MedMKPModuleService["listCanonicalProducts"]>>[number]
type SupplierProductHit = Awaited<ReturnType<MedMKPModuleService["listSupplierProducts"]>>[number]

async function enrichWithOffers(medmkp: MedMKPModuleService, canonicals: CanonicalRow[]) {
  if (!canonicals.length) return []

  const ids = canonicals.map((product) => product.id)
  const matches = await medmkp.listCanonicalProductMatches({ canonical_product_id: ids })
  const supplierProductIds = [...new Set(matches.map((match) => match.supplier_product_id))]

  const [supplierProducts, snapshots, suppliers] = supplierProductIds.length
    ? await Promise.all([
        medmkp.listSupplierProducts({ id: supplierProductIds }),
        medmkp.listSupplierPriceSnapshots({ supplier_product_id: supplierProductIds }),
        medmkp.listSuppliers(),
      ])
    : [[], [], []]

  const latest = latestSnapshotsByProduct(snapshots)
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
  const supplierProductById = new Map(supplierProducts.map((product) => [product.id, product]))

  return canonicals.map((product) => {
    const offers = matches
      .filter((match) => match.canonical_product_id === product.id && match.match_status !== "unmatched")
      .map((match) => {
        const supplierProduct = supplierProductById.get(match.supplier_product_id)
        const latestPrice = latest.get(match.supplier_product_id)
        if (!supplierProduct || !latestPrice) return null
        const supplier = supplierById.get(supplierProduct.supplier_id)
        return {
          supplier_product_id: supplierProduct.id,
          supplier_id: supplierProduct.supplier_id,
          supplier_name: supplier?.name ?? "Unknown supplier",
          sku: supplierProduct.sku,
          name: supplierProduct.name,
          brand: supplierProduct.brand,
          image_url: supplierProduct.image_url || "",
          price_cents: latestPrice.price_cents,
          unit_price_cents: latestPrice.unit_price_cents ?? null,
          pack_quantity: supplierProduct.pack_quantity ?? null,
          base_unit: supplierProduct.base_unit ?? null,
          pack_size: supplierProduct.pack_size || "",
          availability: latestPrice.availability,
          match_status: match.match_status,
        }
      })
      .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer))
      // Rank by comparable per-unit price; offers with an unknown pack fall last.
      .sort((a, b) => {
        const au = a.unit_price_cents ?? Number.MAX_SAFE_INTEGER
        const bu = b.unit_price_cents ?? Number.MAX_SAFE_INTEGER
        return au !== bu ? au - bu : a.price_cents - b.price_cents
      })

    const bestOffer = offers[0] ?? null
    const prices = offers.map((offer) => offer.price_cents).sort((a, b) => a - b)
    const range = prices.length ? { lowest: prices[0], highest: prices[prices.length - 1] } : null
    const unitPrices = offers
      .map((offer) => offer.unit_price_cents)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b)
    const unitRange = unitPrices.length ? { lowest: unitPrices[0], highest: unitPrices[unitPrices.length - 1] } : null
    const imageUrl = bestOffer?.image_url || offers.find((offer) => offer.image_url)?.image_url || ""

    return {
      ...product,
      offer_count: offers.length,
      best_offer: bestOffer,
      offers,
      image_url: imageUrl,
      price_range_cents: range,
      unit_price_range_cents: unitRange,
      base_unit: bestOffer?.base_unit ?? null,
    }
  })
}

// Shared tail of the exact-match scan paths (SKU and barcode): resolve the
// matched supplier products to their canonical products and enrich with
// cross-supplier offers. When a hit has no canonical match yet, surface the
// supplier product directly so the scan still returns something useful.
async function resolveHitsToProducts(
  medmkp: MedMKPModuleService,
  hits: SupplierProductHit[],
  matchKind: "sku" | "barcode"
): Promise<any[]> {
  const matches = await medmkp.listCanonicalProductMatches({
    supplier_product_id: hits.map((hit) => hit.id),
  })
  const canonicalIds = [...new Set(matches.map((match) => match.canonical_product_id))]

  let products: any[] = []
  if (canonicalIds.length) {
    const canonicals = await medmkp.listCanonicalProducts({ id: canonicalIds })
    products = (await enrichWithOffers(medmkp, canonicals)).map((product) => ({
      ...product,
      match: { kind: matchKind, score: 1 },
    }))
  }

  if (!products.length) {
    // Supplier product exists but has no canonical match; surface it directly.
    const snapshots = await medmkp.listSupplierPriceSnapshots({
      supplier_product_id: hits.map((hit) => hit.id),
    })
    const latest = latestSnapshotsByProduct(snapshots)
    const suppliers = await medmkp.listSuppliers()
    const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
    products = hits.map((hit) => {
      const latestPrice = latest.get(hit.id)
      const supplier = supplierById.get(hit.supplier_id)
      const offer = latestPrice
        ? {
            supplier_product_id: hit.id,
            supplier_id: hit.supplier_id,
            supplier_name: supplier?.name ?? "Unknown supplier",
            sku: hit.sku,
            name: hit.name,
            brand: hit.brand,
            image_url: hit.image_url || "",
            price_cents: latestPrice.price_cents,
            unit_price_cents: latestPrice.unit_price_cents ?? null,
            pack_quantity: hit.pack_quantity ?? null,
            base_unit: hit.base_unit ?? null,
            pack_size: hit.pack_size || "",
            availability: latestPrice.availability,
            match_status: "exact",
          }
        : null
      return {
        id: hit.id,
        handle: "",
        name: hit.name,
        category: hit.category,
        offer_count: offer ? 1 : 0,
        best_offer: offer,
        offers: offer ? [offer] : [],
        image_url: hit.image_url || "",
        price_range_cents: latestPrice
          ? { lowest: latestPrice.price_cents, highest: latestPrice.price_cents }
          : null,
        unit_price_range_cents: offer?.unit_price_cents != null
          ? { lowest: offer.unit_price_cents, highest: offer.unit_price_cents }
          : null,
        base_unit: offer?.base_unit ?? null,
        match: { kind: matchKind, score: 1 },
      }
    })
  }

  return products
}

// Fuzzy text search over canonical products: pull DB candidates by the most
// distinctive token, then rerank in memory so word order and small typos still
// surface the product. Returned products are enriched with cross-supplier offers
// and ordered offers-first, then by similarity. Shared by the search box (?q=)
// and the scan substitute fallback.
async function fuzzyCanonicalSearch(
  medmkp: MedMKPModuleService,
  q: string,
  limit: number
): Promise<Array<{ product: any; score: number }>> {
  const queryTokens = tokenizeName(q)
  const distinctive = [...queryTokens].sort((a, b) => b.length - a.length)[0] || q
  const candidates = await medmkp.listCanonicalProducts(
    { q: distinctive.length >= 3 ? distinctive : q },
    { take: 600 }
  )

  const queryGrams = trigrams(queryTokens.join(" ") || q.toLowerCase())
  const scored = candidates
    .map((product) => ({ product, score: nameSimilarity(queryTokens, queryGrams, product.name) }))
    .filter((entry) => entry.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2)

  const scoreById = new Map(scored.map((entry) => [entry.product.id, entry.score]))
  const enriched = await enrichWithOffers(medmkp, scored.map((entry) => entry.product))
  return enriched
    .map((product) => ({ product, score: Math.round((scoreById.get(product.id) ?? 0) * 100) / 100 }))
    // Products with real offers first, then by similarity.
    .sort((a, b) =>
      (b.product.offer_count > 0 ? 1 : 0) - (a.product.offer_count > 0 ? 1 : 0) || b.score - a.score
    )
    .slice(0, limit)
}

// When a scan resolves to an item we can identify but can't price (e.g. a Henry
// Schein house-brand product ingested as identity only), suggest priced
// substitutes: fuzzy-search the identified name and keep candidates that carry
// offers, labeled so the UI can present them as alternatives.
async function substitutesFor(
  medmkp: MedMKPModuleService,
  name: string,
  limit: number
): Promise<any[]> {
  if (!name.trim()) return []
  const results = await fuzzyCanonicalSearch(medmkp, name, limit)
  return results
    .filter((r) => r.product.offer_count > 0)
    .map((r) => ({ ...r.product, match: { kind: "substitute", score: r.score } }))
}

// Shared scan response: return the matched products when they carry a price,
// otherwise fall back to priced substitutes for the identified item.
async function scanResponse(
  medmkp: MedMKPModuleService,
  query: string,
  kind: string,
  hits: SupplierProductHit[],
  matchKind: "sku" | "barcode",
  limit: number
) {
  const products = await resolveHitsToProducts(medmkp, hits, matchKind)
  if (products.some((p) => (p.offer_count ?? 0) > 0)) {
    return { query, kind, count: products.length, products: products.slice(0, limit) }
  }

  const identifiedName = products[0]?.name || hits[0]?.name || ""
  const substitutes = await substitutesFor(medmkp, identifiedName, limit)
  if (substitutes.length) {
    return {
      query,
      kind: "substitute",
      count: substitutes.length,
      identified: hits[0]
        ? { name: hits[0].name, brand: hits[0].brand, sku: hits[0].sku }
        : null,
      products: substitutes,
    }
  }

  // Identified but neither priced nor substitutable: return what we have.
  return { query, kind, count: products.length, products: products.slice(0, limit) }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const url = new URL(req.url, "http://localhost")
  const barcode = url.searchParams.get("barcode")?.trim()
  const code = url.searchParams.get("code")?.trim()
  const q = url.searchParams.get("q")?.trim()
  const limit = clamp(Number(url.searchParams.get("limit")) || 8, 1, 25)

  // Scan path (barcode): resolve a scanned GTIN/UPC to its canonical product,
  // tolerating the leading-zero width differences a reader introduces (UPC-A vs
  // EAN-13 vs GTIN-14). gtinVariants() returns [] for a non-GTIN / misread, so a
  // garbage code short-circuits to "none" without querying.
  if (barcode) {
    const variants = gtinVariants(barcode)
    const hits = variants.length
      ? dedupeById(await medmkp.listSupplierProducts({ barcode: variants }))
      : []

    if (hits.length) {
      res.json(await scanResponse(medmkp, barcode, "barcode", hits, "barcode", limit))
      return
    }

    // HIBC fallback: many dental SKUs carry an HIBC code, not a GS1 GTIN. We hold
    // no HIBC data, but a manufacturer's product/catalog number (PCN) is its
    // catalog number — so resolve the PCN through the same SKU index as the SKU
    // scan path (e.g. Pulpdent "ER24" → manufacturer_sku ER24).
    const hibc = parseHibc(barcode)
    if (hibc) {
      const codeVariants = [...new Set([hibc.pcn, hibc.pcn.toUpperCase()])]
      const [bySku, byMfrSku] = await Promise.all([
        medmkp.listSupplierProducts({ sku: codeVariants }),
        medmkp.listSupplierProducts({ manufacturer_sku: codeVariants }),
      ])
      const hibcHits = dedupeById([...bySku, ...byMfrSku])
      if (hibcHits.length) {
        res.json(await scanResponse(medmkp, barcode, "hibc", hibcHits, "sku", limit))
        return
      }
    }

    res.json({ query: barcode, kind: "none", count: 0, products: [] })
    return
  }

  // Scan path (SKU): resolve an exact SKU / manufacturer SKU to its canonical product.
  if (code) {
    const variants = [...new Set([code, code.toUpperCase()])]
    const [bySku, byMfrSku] = await Promise.all([
      medmkp.listSupplierProducts({ sku: variants }),
      medmkp.listSupplierProducts({ manufacturer_sku: variants }),
    ])
    const hits = dedupeById([...bySku, ...byMfrSku])

    if (!hits.length) {
      res.json({ query: code, kind: "none", count: 0, products: [] })
      return
    }

    res.json(await scanResponse(medmkp, code, "sku", hits, "sku", limit))
    return
  }

  if (!q) {
    res.json({ query: "", kind: "none", count: 0, products: [] })
    return
  }

  // Fuzzy text path for the search box.
  const results = await fuzzyCanonicalSearch(medmkp, q, limit)
  const products = results.map((r) => ({ ...r.product, match: { kind: "fuzzy", score: r.score } }))
  res.json({ query: q, kind: "fuzzy", count: products.length, products })
}
