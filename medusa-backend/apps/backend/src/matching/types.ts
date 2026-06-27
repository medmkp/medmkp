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
  /** Latest snapshot's stock signal: in_stock | limited | backordered | unknown. */
  availability?: string | null
}

export type NormalizedProduct = {
  row: SupplierProductRow
  /** Normalized manufacturer SKU: uppercase alphanumerics only. */
  mfrSku: string
  /** 0..1 — how trustworthy an exact mfrSku collision is as identity evidence. */
  skuStrength: number
  /**
   * Manufacturer model with a leading distributor line/category prefix stripped
   * (DC Dental "219-4302" -> "4302", where Henry Schein carries the same item as
   * plain "4302"). "" when the SKU carries no such prefix. An *additional* weak
   * join key layered on top of mfrSku, never a replacement — scoring still gates
   * the merge on brand + name.
   */
  skuCore: string
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
  /** Iteration index within a single run. Stable only within that run; used as
   * an in-memory join key (families, substitutes). NEVER persist-derive ids from
   * this — it is positional and shifts between runs. Use contentKey instead. */
  key: number
  /** Deterministic, order-independent fingerprint of the cluster's identity
   * (brand + model + pack + variant). The persisted canonical id and handle are
   * derived from this so a product keeps the same URL across re-match runs. */
  contentKey: string
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

/** Display-only grouping of size/spec variants under one browsable product. */
export type FamilyInfo = {
  /** Stable, content-addressed family id shared by all variants. */
  familyId: string
  /** URL handle for the family's product page. */
  familyHandle: string
  /** Clean family title with the varying attribute removed. */
  familyName: string
  /** This variant's label, e.g. "Large", "25 mm", "A2". */
  variantLabel: string
  /** Sort order of this variant within the family selector. */
  variantRank: number
  /** Which modeled axis varies across the family (size, mm, shade, ...). */
  variantAxis: string
}

export type MatchRunResult = {
  products: NormalizedProduct[]
  acceptedPairs: ScoredPair[]
  reviewPairs: ScoredPair[]
  clusters: Cluster[]
  substitutes: SubstituteCandidate[]
  /** Family overlay keyed by Cluster.key; clusters absent are standalone. */
  families: Map<number, FamilyInfo>
}
