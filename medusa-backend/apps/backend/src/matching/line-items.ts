import type { Client } from "pg"
import { loadSupplierProducts } from "./db"
import { normalizeProduct, normalizeSku } from "./normalize"
import { compareNumericAttrs, jaccard, scorePair, trigramDice } from "./score"
import type { NormalizedProduct, SupplierProductRow } from "./types"

/**
 * Invoice line item matching (see PRODUCT_MATCHING.md "Line Item Matching").
 *
 * A line item is treated as a supplier product with worse data: a raw
 * description, usually a SKU, plus quantity and prices. Matching reuses the
 * supplier-to-supplier evidence model (normalize.ts / score.ts) in three
 * tiers:
 *
 *   1. Supplier SKU resolution — the invoice vendor is one of our ingested
 *      suppliers and the SKU matches that supplier's own catalog.
 *   2. Catalog-code blocking + scorePair — same fuzzy path the product
 *      matcher uses (manufacturer SKUs, name-embedded catalog numbers).
 *   3. Name similarity — for SKU-less items, the best same-type product
 *      becomes a review-grade suggestion, never an assertion.
 */

export type LineItemInput = {
  description: string
  sku?: string
  brand?: string
  qty?: number
  unit?: string
  unit_price_cents?: number | null
  pack_size?: string
}

export type OfferView = {
  supplier_product_id: string
  supplier_id: string
  supplier_name: string
  sku: string
  name: string
  price_cents: number
  /** price_cents normalized to the invoice item's pack quantity when both are known */
  comparable_price_cents: number
  pack_size: string
  product_url: string
  image_url: string
}

export type LineItemMatch = {
  input: LineItemInput
  match_status: "exact" | "variant" | "needs_review" | "unmatched"
  confidence: number
  match_reason: string
  matched_supplier_product: {
    id: string
    supplier_id: string
    supplier_name: string
    sku: string
    name: string
    image_url: string
  } | null
  canonical_product: { id: string; name: string; category: string } | null
  display_image_url: string
  offers: OfferView[]
  best_offer: OfferView | null
  savings_cents: number
}

type CanonicalLink = {
  canonical_product_id: string
  match_status: string
  confidence_score: number
}

export type CatalogIndex = {
  products: NormalizedProduct[]
  productIdxById: Map<string, number>
  bySupplierSku: Map<string, number[]>
  byMfrSku: Map<string, number[]>
  byCode: Map<string, number[]>
  byCoreToken: Map<string, number[]>
  linkBySupplierProduct: Map<string, CanonicalLink>
  canonicalById: Map<string, { id: string; name: string; category: string }>
  memberIdsByCanonical: Map<string, string[]>
  supplierNameById: Map<string, string>
  loadedAt: number
}

const CORE_TOKEN_MAX_DF = 600
const MIN_SHARED_CORE_TOKENS = 2
const NAME_ONLY_MIN_SIM = 0.55

function push(map: Map<string, number[]>, key: string, idx: number) {
  const list = map.get(key)
  if (list) {
    list.push(idx)
  } else {
    map.set(key, [idx])
  }
}

export async function loadCatalogIndex(client: Client): Promise<CatalogIndex> {
  const rows = await loadSupplierProducts(client)

  const [matches, canonicals, suppliers] = await Promise.all([
    client.query(
      `SELECT supplier_product_id, canonical_product_id, match_status, confidence_score
       FROM medmkp_canonical_product_match
       WHERE deleted_at IS NULL AND match_status IN ('exact', 'variant')
         AND canonical_product_id <> ''`
    ),
    client.query(
      `SELECT id, name, category FROM medmkp_canonical_product WHERE deleted_at IS NULL`
    ),
    client.query(`SELECT id, name FROM medmkp_supplier WHERE deleted_at IS NULL`),
  ])

  const products = rows.map(normalizeProduct)
  const productIdxById = new Map<string, number>()
  const bySupplierSku = new Map<string, number[]>()
  const byMfrSku = new Map<string, number[]>()
  const byCode = new Map<string, number[]>()
  const byCoreToken = new Map<string, number[]>()

  products.forEach((product, idx) => {
    productIdxById.set(product.row.id, idx)
    const supplierSku = normalizeSku(product.row.sku)
    if (supplierSku.length >= 3) {
      push(bySupplierSku, `${product.row.supplier_id}:${supplierSku}`, idx)
    }
    if (product.mfrSku.length >= 4) {
      push(byMfrSku, product.mfrSku, idx)
    }
    if (product.mfrSku.length >= 4 && product.skuStrength > 0.1) {
      push(byCode, product.mfrSku, idx)
    }
    for (const token of product.skuLikeTokens) {
      if (token !== product.mfrSku) {
        push(byCode, token, idx)
      }
    }
    for (const token of new Set(product.coreTokens)) {
      push(byCoreToken, token, idx)
    }
  })

  const linkBySupplierProduct = new Map<string, CanonicalLink>()
  const memberIdsByCanonical = new Map<string, string[]>()
  for (const row of matches.rows) {
    linkBySupplierProduct.set(row.supplier_product_id, {
      canonical_product_id: row.canonical_product_id,
      match_status: row.match_status,
      confidence_score: row.confidence_score,
    })
    const members = memberIdsByCanonical.get(row.canonical_product_id)
    if (members) {
      members.push(row.supplier_product_id)
    } else {
      memberIdsByCanonical.set(row.canonical_product_id, [row.supplier_product_id])
    }
  }

  return {
    products,
    productIdxById,
    bySupplierSku,
    byMfrSku,
    byCode,
    byCoreToken,
    linkBySupplierProduct,
    canonicalById: new Map(
      canonicals.rows.map((row) => [row.id, { id: row.id, name: row.name, category: row.category }])
    ),
    memberIdsByCanonical,
    supplierNameById: new Map(suppliers.rows.map((row) => [row.id, row.name])),
    loadedAt: Date.now(),
  }
}

/** Resolve an invoice vendor name to an ingested supplier id, if any. */
export function resolveVendorSupplier(index: CatalogIndex, vendorName?: string): string | null {
  if (!vendorName) {
    return null
  }
  const vendorTokens = new Set(vendorName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  let best: string | null = null
  let bestSim = 0
  for (const [id, name] of index.supplierNameById) {
    const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    const sim = jaccard(vendorTokens, tokens)
    if (sim > bestSim) {
      bestSim = sim
      best = id
    }
  }
  return bestSim >= 0.5 ? best : null
}

function toPseudoProduct(input: LineItemInput): NormalizedProduct {
  const row: SupplierProductRow = {
    id: "_invoice_line",
    supplier_id: "_invoice",
    sku: input.sku ?? "",
    manufacturer_sku: input.sku ?? "",
    brand: input.brand ?? "",
    name: input.description,
    category: "",
    pack_size: input.pack_size ?? "",
    unit_of_measure: input.unit ?? "",
    product_url: "",
    image_url: "",
    price_cents: input.unit_price_cents ?? null,
    price_basis: null,
  }
  return normalizeProduct(row)
}

/** Same blend scorePair uses, for candidates with no SKU evidence. */
function nameOnlySimilarity(item: NormalizedProduct, candidate: NormalizedProduct): number {
  const numeric = compareNumericAttrs(item, candidate)
  if (numeric.hardConflict) {
    return 0
  }
  let sim =
    0.45 * jaccard(item.nameTokens, candidate.nameTokens) + 0.55 * trigramDice(item, candidate)
  sim += Math.min(numeric.agreements * 0.05, 0.15)
  if (numeric.bareConflict) {
    sim -= 0.1
  }
  return Math.max(0, Math.min(1, sim))
}

function comparablePrice(item: NormalizedProduct, offer: NormalizedProduct): number {
  if (
    item.packQty !== null &&
    offer.packQty !== null &&
    offer.packQty !== item.packQty &&
    offer.unitPriceCents !== null
  ) {
    return Math.round(offer.unitPriceCents * item.packQty)
  }
  return offer.row.price_cents ?? 0
}

function buildOffers(
  index: CatalogIndex,
  item: NormalizedProduct,
  memberIds: string[]
): OfferView[] {
  const offers: OfferView[] = []
  for (const memberId of memberIds) {
    const idx = index.productIdxById.get(memberId)
    if (idx === undefined) {
      continue
    }
    const product = index.products[idx]
    if (product.row.price_cents === null || product.row.price_cents <= 0) {
      continue
    }
    offers.push({
      supplier_product_id: product.row.id,
      supplier_id: product.row.supplier_id,
      supplier_name: index.supplierNameById.get(product.row.supplier_id) ?? "Unknown supplier",
      sku: product.row.sku,
      name: product.row.name,
      price_cents: product.row.price_cents,
      comparable_price_cents: comparablePrice(item, product),
      pack_size: product.row.pack_size,
      product_url: product.row.product_url,
      image_url: product.row.image_url,
    })
  }
  return offers.sort((a, b) => a.comparable_price_cents - b.comparable_price_cents)
}

function finalize(
  index: CatalogIndex,
  input: LineItemInput,
  item: NormalizedProduct,
  matchedIdx: number,
  status: LineItemMatch["match_status"],
  confidence: number,
  reason: string
): LineItemMatch {
  const matched = index.products[matchedIdx]
  const link = index.linkBySupplierProduct.get(matched.row.id)
  const canonical = link ? index.canonicalById.get(link.canonical_product_id) ?? null : null
  const memberIds = link
    ? index.memberIdsByCanonical.get(link.canonical_product_id) ?? [matched.row.id]
    : [matched.row.id]
  const offers = buildOffers(index, item, memberIds)
  const bestOffer = offers[0] ?? null
  const displayImageUrl =
    bestOffer?.image_url ||
    offers.find((offer) => offer.image_url)?.image_url ||
    matched.row.image_url ||
    ""

  const qty = input.qty ?? 1
  const invoicePrice = input.unit_price_cents ?? null
  const savings =
    bestOffer && invoicePrice !== null
      ? Math.max(0, (invoicePrice - bestOffer.comparable_price_cents) * qty)
      : 0

  return {
    input,
    match_status: status,
    confidence,
    match_reason: reason,
    matched_supplier_product: {
      id: matched.row.id,
      supplier_id: matched.row.supplier_id,
      supplier_name: index.supplierNameById.get(matched.row.supplier_id) ?? "Unknown supplier",
      sku: matched.row.sku,
      name: matched.row.name,
      image_url: matched.row.image_url,
    },
    canonical_product: canonical,
    display_image_url: displayImageUrl,
    offers: offers.slice(0, 5),
    best_offer: bestOffer,
    savings_cents: savings,
  }
}

function unmatched(input: LineItemInput, reason: string): LineItemMatch {
  return {
    input,
    match_status: "unmatched",
    confidence: 0,
    match_reason: reason,
    matched_supplier_product: null,
    canonical_product: null,
    display_image_url: "",
    offers: [],
    best_offer: null,
    savings_cents: 0,
  }
}

export function matchLineItem(
  index: CatalogIndex,
  input: LineItemInput,
  vendorSupplierId: string | null
): LineItemMatch {
  const item = toPseudoProduct(input)
  const skuKey = normalizeSku(input.sku)

  // Tier 1: the vendor is an ingested supplier and the SKU is theirs. The
  // supplier's own SKU is authoritative even when the invoice truncates the
  // description, so no name corroboration is required.
  if (vendorSupplierId && skuKey.length >= 3) {
    const hits = index.bySupplierSku.get(`${vendorSupplierId}:${skuKey}`) ?? []
    if (hits.length === 1) {
      return finalize(index, input, item, hits[0], "exact", 97, "line:supplier-sku")
    }
  }

  // Tier 2: catalog-code blocking + scorePair, the same fuzzy path the
  // product matcher uses. Manufacturer SKU collisions are filtered by the
  // scoring ladder (short numeric SKUs need name corroboration).
  const candidateIdxs = new Set<number>()
  if (item.mfrSku.length >= 4) {
    for (const idx of index.byMfrSku.get(item.mfrSku) ?? []) {
      candidateIdxs.add(idx)
    }
  }
  const codeKeys = [item.mfrSku, ...item.skuLikeTokens].filter((key) => key.length >= 4)
  for (const key of codeKeys) {
    for (const idx of index.byCode.get(key) ?? []) {
      candidateIdxs.add(idx)
    }
  }

  let best: { idx: number; status: "exact" | "variant" | "needs_review"; confidence: number; reason: string } | null =
    null
  for (const idx of candidateIdxs) {
    const decision = scorePair(item, index.products[idx])
    if (decision.status !== "exact" && decision.status !== "variant" && decision.status !== "needs_review") {
      continue
    }
    const rank = decision.status === "needs_review" ? 0 : 1
    const bestRank = best && best.status !== "needs_review" ? 1 : 0
    if (!best || rank > bestRank || (rank === bestRank && decision.confidence > best.confidence)) {
      best = { idx, status: decision.status, confidence: decision.confidence, reason: `line:${decision.reason}` }
    }
  }
  if (best && best.status !== "needs_review") {
    return finalize(index, input, item, best.idx, best.status, best.confidence, best.reason)
  }

  // Tier 3: no usable SKU evidence — best same-type product by name
  // similarity becomes a review-grade suggestion.
  const overlapCounts = new Map<number, number>()
  for (const token of new Set(item.coreTokens)) {
    const list = index.byCoreToken.get(token)
    if (!list || list.length > CORE_TOKEN_MAX_DF) {
      continue
    }
    for (const idx of list) {
      overlapCounts.set(idx, (overlapCounts.get(idx) ?? 0) + 1)
    }
  }
  const minShared = Math.min(MIN_SHARED_CORE_TOKENS, new Set(item.coreTokens).size)
  let nameBest: { idx: number; sim: number } | null = null
  for (const [idx, shared] of overlapCounts) {
    if (shared < minShared) {
      continue
    }
    const sim = nameOnlySimilarity(item, index.products[idx])
    if (sim > (nameBest?.sim ?? 0)) {
      nameBest = { idx, sim }
    }
  }

  if (nameBest && nameBest.sim >= NAME_ONLY_MIN_SIM) {
    const confidence = Math.round(40 + 30 * nameBest.sim)
    return finalize(
      index,
      input,
      item,
      nameBest.idx,
      "needs_review",
      confidence,
      `line:needs_review name-sim=${nameBest.sim.toFixed(2)}`
    )
  }

  if (best) {
    return finalize(index, input, item, best.idx, "needs_review", best.confidence, best.reason)
  }

  return unmatched(input, "line:unmatched no candidate above threshold")
}
