import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { tokenizeName } from "../../../../matching/normalize"
import { nameSimilarity, trigrams } from "../../../../matching/search"
import { gtinVariants, baseUnitGtinVariants } from "../../../../matching/gtin"
import { parseGs1 } from "../../../../matching/gs1"
import { parseHibc } from "../../../../matching/hibc"
import { analyzeOffers, compareOffers, isUnitComparable } from "../../../../matching/offers"
import { isMarketplaceSupplierId } from "../../../../ingestion/marketplace/suppliers"

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

// Lot + expiry are read off the physical package by parseGs1 / parseHibc and
// returned to the client as a `scanned` block on the scan response, alongside
// the matched products. They identify the specific box on the shelf — the data
// that feeds expiry alerts and recall pull-lists, and that exists nowhere in our
// catalog or a practice's purchase history.
type ScanMeta = { lot?: string; expiry?: string; production_date?: string }

function scanMeta(lot?: string, expiry?: string, productionDate?: string): ScanMeta | undefined {
  if (!lot && !expiry && !productionDate) return undefined
  const meta: ScanMeta = {}
  if (lot) meta.lot = lot
  if (expiry) meta.expiry = expiry
  if (productionDate) meta.production_date = productionDate
  return meta
}

function withScanned<T extends object>(resp: T, scanned?: ScanMeta): T {
  return scanned ? { ...resp, scanned } : resp
}

// Reverse GUDID lookup: resolve a scanned GTIN to supplier products via the
// medmkp_gtin_reference table (FDA GUDID, brand+model -> GTIN). This catches
// products we couldn't pre-write a barcode for. Because the scanned GTIN is
// exact (it identifies one product family), fuzzier supplier matching is safe.
// Four resolution paths, all keyed off the exact scanned GTIN:
//   1. Henry Schein house brand — companyName "HENRY SCHEIN, INC." + HS item
//      number (= sku).
//   2. Exact brandName + manufacturer SKU.
//   3. Product-line fallback — for vendors GUDID lists under a product line
//      (brandName "Filtek", "Cotton Tipped...") with the real maker in
//      companyName, and where our supplier MPN carries a vendor prefix
//      ("US-3M-6029A2B" vs GUDID "6029A2B"): match when the supplier MPN ends
//      with the model number AND the product-line name appears in the product
//      name. Length guards keep short/generic models from colliding.
//   4. companyName + manufacturer SKU — GUDID often puts a description in
//      brandName ("Cotton Tipped Wood Applicators...") and the real brand in
//      companyName ("Dynarex Corporation"), which equals our supplier brand.
async function resolveByGtinReference(scope: MedusaRequest["scope"], variants: string[]): Promise<string[]> {
  if (!variants.length) return []
  const knex = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  // UNION of the three paths (not one OR-join): the OR prevents the planner from
  // using an index, which seq-scans 230k rows with per-row regexp (~80s, enough
  // to crash a prod backend). As separate branches each path hits a dedicated
  // functional index (idx_msp_norm_sku / _mfrsku / _brand) or trigram GIN index
  // (idx_msp_norm_mfrsku_trgm / _name_trgm) — see Migration20260619190000.
  const { rows } = await knex.raw(
    `with ref as (
       select distinct model_norm, brand_norm, company_name
       from medmkp_gtin_reference where gtin = ANY(?)
     )
     select sp.id
       from ref join medmkp_supplier_product sp
         on sp.supplier_id = 'msup_henryschein_com'
        and lower(regexp_replace(sp.sku, '[^a-z0-9]', '', 'gi')) = ref.model_norm
      where lower(regexp_replace(ref.company_name, '[^a-z0-9]', '', 'gi')) like 'henryschein%'
        and sp.deleted_at is null
     union
     select sp.id
       from ref join medmkp_supplier_product sp
         on lower(regexp_replace(sp.brand, '[^a-z0-9]', '', 'gi')) = ref.brand_norm
        and lower(regexp_replace(sp.manufacturer_sku, '[^a-z0-9]', '', 'gi')) = ref.model_norm
      where sp.deleted_at is null
     union
     select sp.id
       from ref join medmkp_supplier_product sp
         on lower(regexp_replace(sp.manufacturer_sku, '[^a-z0-9]', '', 'gi')) like '%' || ref.model_norm
        and lower(regexp_replace(sp.name, '[^a-z0-9]', '', 'gi')) like '%' || ref.brand_norm || '%'
      where length(ref.model_norm) >= 5 and length(ref.brand_norm) >= 4
        and sp.deleted_at is null
     union
     select sp.id
       from ref join medmkp_supplier_product sp
         on lower(regexp_replace(sp.brand, '[^a-z0-9]', '', 'gi')) = lower(regexp_replace(ref.company_name, '[^a-z0-9]', '', 'gi'))
        and lower(regexp_replace(sp.manufacturer_sku, '[^a-z0-9]', '', 'gi')) = ref.model_norm
      where length(regexp_replace(ref.company_name, '[^a-z0-9]', '', 'gi')) >= 4
        and sp.deleted_at is null
     limit 25`,
    [variants]
  )
  return rows.map((r: { id: string }) => r.id)
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
    const rawOffers = matches
      // Same-product offers only. Substitutes are surfaced separately, and
      // needs-review links are explicitly unproven, so neither belongs in the
      // supplier price comparison or an exact scan result. Amazon/Alibaba
      // marketplace listings are also kept out — they get their own section on
      // the product page rather than competing in the per-unit comparison.
      .filter(
        (match) =>
          match.canonical_product_id === product.id &&
          (match.match_status === "exact" || match.match_status === "variant") &&
          !isMarketplaceSupplierId(
            supplierProductById.get(match.supplier_product_id)?.supplier_id
          )
      )
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
          product_url: supplierProduct.product_url || "",
          price_cents: latestPrice.price_cents,
          unit_price_cents: latestPrice.unit_price_cents ?? null,
          pack_quantity: supplierProduct.pack_quantity ?? null,
          base_unit: supplierProduct.base_unit ?? null,
          pack_basis: supplierProduct.pack_basis ?? null,
          pack_size: supplierProduct.pack_size || "",
          availability: latestPrice.availability,
          match_status: match.match_status,
        }
      })
      .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer))

    // Rank by comparable per-unit price (F1), but only across offers in the same
    // base unit (F2); offers with an unknown pack fall last.
    const ranking = analyzeOffers(rawOffers)
    const offers = rawOffers
      .map((offer) => ({
        ...offer,
        unit_comparable: isUnitComparable(offer, ranking.comparisonBasis),
      }))
      .sort((a, b) => compareOffers(a, b, ranking.comparisonBasis))

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
      unit_comparable: ranking.comparableCount >= 2,
      unit_comparison_basis: ranking.comparisonBasis,
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
  const matches = (await medmkp.listCanonicalProductMatches({
    supplier_product_id: hits.map((hit) => hit.id),
  })).filter(
    (match) => match.match_status === "exact" || match.match_status === "variant"
  )
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
            product_url: hit.product_url || "",
            price_cents: latestPrice.price_cents,
            unit_price_cents: latestPrice.unit_price_cents ?? null,
            pack_quantity: hit.pack_quantity ?? null,
            base_unit: hit.base_unit ?? null,
            pack_basis: hit.pack_basis ?? null,
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
  limit: number,
  // When given, retrieve candidates by EACH of these tokens (union) instead of
  // the single most distinctive one. The substitute path passes the product's
  // top tokens so a house-brand name ("Criterion ...") whose longest token is
  // the brand still pulls the product TYPE ("nitrile") into the pool.
  retrievalTokens?: string[]
): Promise<Array<{ product: any; score: number }>> {
  const queryTokens = tokenizeName(q)
  let candidates: CanonicalRow[]
  if (retrievalTokens && retrievalTokens.length) {
    const pools = await Promise.all(
      retrievalTokens
        .slice(0, 3)
        .map((token) => medmkp.listCanonicalProducts({ q: token }, { take: 400 }))
    )
    candidates = dedupeById(pools.flat())
  } else {
    const distinctive = [...queryTokens].sort((a, b) => b.length - a.length)[0] || q
    candidates = await medmkp.listCanonicalProducts(
      { q: distinctive.length >= 3 ? distinctive : q },
      { take: 600 }
    )
  }

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
  // Retrieve by the few most distinctive tokens, not just the single longest:
  // for a house-brand item ("Criterion N300 Nitrile Exam Gloves ...") the longest
  // token is the brand, so a single-token pull only finds its own price-less
  // siblings. Including the next tokens pulls the product type ("nitrile") into
  // the pool; the full-name rerank then floats the closest priced equivalents.
  const retrieval = [...new Set(tokenizeName(name))]
    .filter((token) => token.length >= 3 && /[a-z]/.test(token))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
  const results = await fuzzyCanonicalSearch(medmkp, name, limit, retrieval)
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
    const gs1 = parseGs1(barcode)
    const variants = gtinVariants(gs1.gtin || barcode)
    let scanned = scanMeta(gs1.lot, gs1.expiry, gs1.productionDate)
    const hits = variants.length
      ? dedupeById(await medmkp.listSupplierProducts({ barcode: variants }))
      : []

    if (hits.length) {
      res.json(withScanned(await scanResponse(medmkp, barcode, "barcode", hits, "barcode", limit), scanned))
      return
    }

    // HIBC fallback: many dental SKUs carry an HIBC code, not a GS1 GTIN. We hold
    // no HIBC data, but a manufacturer's product/catalog number (PCN) is its
    // catalog number — so resolve the PCN through the same SKU index as the SKU
    // scan path (e.g. Pulpdent "ER24" → manufacturer_sku ER24).
    const hibc = parseHibc(barcode)
    if (hibc) {
      if (!scanned) scanned = scanMeta(hibc.lot, hibc.expiry)
      const codeVariants = [...new Set([hibc.pcn, hibc.pcn.toUpperCase()])]
      const [bySku, byMfrSku] = await Promise.all([
        medmkp.listSupplierProducts({ sku: codeVariants }),
        medmkp.listSupplierProducts({ manufacturer_sku: codeVariants }),
      ])
      const hibcHits = dedupeById([...bySku, ...byMfrSku])
      if (hibcHits.length) {
        res.json(withScanned(await scanResponse(medmkp, barcode, "hibc", hibcHits, "sku", limit), scanned))
        return
      }
    }

    // GUDID reference fallback: the GTIN isn't on any product directly, but FDA
    // GUDID may map it to a brand+model (or HS item number) we carry.
    if (variants.length) {
      const refIds = await resolveByGtinReference(req.scope, variants)
      if (refIds.length) {
        const refHits = dedupeById(await medmkp.listSupplierProducts({ id: refIds }))
        if (refHits.length) {
          res.json(withScanned(await scanResponse(medmkp, barcode, "barcode", refHits, "barcode", limit), scanned))
          return
        }
      }
    }

    // Last resort: a scanned case / inner-pack GTIN (indicator digit 1–8) shares
    // its item reference with the base unit. If nothing matched the scanned code,
    // try the base-unit GTIN so scanning a case still identifies the each on the
    // shelf. Flagged kind "barcode_pack" so the client can prompt a pack check —
    // the matched product is a different pack level than what was scanned.
    const packVariants = baseUnitGtinVariants(gs1.gtin || barcode)
    if (packVariants.length) {
      const packHits = dedupeById(await medmkp.listSupplierProducts({ barcode: packVariants }))
      if (packHits.length) {
        res.json(withScanned(await scanResponse(medmkp, barcode, "barcode_pack", packHits, "barcode", limit), scanned))
        return
      }
    }

    res.json(withScanned({ query: barcode, kind: "none", count: 0, products: [] }, scanned))
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
