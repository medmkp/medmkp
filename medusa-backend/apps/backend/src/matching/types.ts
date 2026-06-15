export type SupplierProductRow = {
  id: string
  supplier_id: string
  sku: string
  manufacturer_sku: string
  brand: string
  name: string
  category: string
  pack_size: string
  unit_of_measure: string
  product_url: string
  image_url: string
  price_cents: number | null
  price_basis: string | null
}

export type NormalizedProduct = {
  row: SupplierProductRow
  /** Normalized manufacturer SKU: uppercase alphanumerics only. */
  mfrSku: string
  /** 0..1 — how trustworthy an exact mfrSku collision is as identity evidence. */
  skuStrength: number
  /** Canonical brand key, or null when the brand field is junk/house label. */
  brandKey: string | null
  brandTokens: string[]
  /** Stemmed name tokens (words + numbers) used for identity similarity. */
  nameTokens: string[]
  /** Word-only tokens minus brand/pack/SKU noise — used for substitute typing. */
  coreTokens: string[]
  /** Catalog-number-looking tokens found in the name (normalized like mfrSku). */
  skuLikeTokens: string[]
  /** unit -> set of values, e.g. "mm" -> {"25"}, "shade" -> {"a4"}. */
  numericAttrs: Map<string, Set<string>>
  /** Bare numbers in the name not attributable to pack or units. */
  bareNumbers: Set<string>
  /** Units per package when parseable (from pack_size, falling back to name). */
  packQty: number | null
  /** price_cents / packQty when both known. */
  unitPriceCents: number | null
}

export type MatchStatus = "exact" | "variant" | "substitute" | "needs_review"

export type PairDecision = {
  status: MatchStatus | "reject"
  /** 0..100 */
  confidence: number
  reason: string
  skuScore: number
  nameSim: number
  brandRel: "match" | "conflict" | "unknown"
  packRel: "same" | "differs" | "unknown"
}

export type ScoredPair = {
  a: NormalizedProduct
  b: NormalizedProduct
  decision: PairDecision
}

export type Cluster = {
  /** Index used to derive the canonical product id. */
  key: number
  members: NormalizedProduct[]
  representative: NormalizedProduct
  supplierCount: number
}

export type SubstituteCandidate = {
  clusterKey: number
  product: NormalizedProduct
  typeSim: number
  confidence: number
  reason: string
}

export type MatchRunResult = {
  products: NormalizedProduct[]
  acceptedPairs: ScoredPair[]
  reviewPairs: ScoredPair[]
  clusters: Cluster[]
  substitutes: SubstituteCandidate[]
}
