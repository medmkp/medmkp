import type { SupplierCatalogRow } from "../supplier-catalog"
import { normalizeProduct } from "../../matching/normalize"
import type { NormalizedProduct, SupplierProductRow } from "../../matching/types"
import { marketplaceProductId, titleOverlapConfidence } from "./parse"
import type {
  MarketplaceFetcher,
  MarketplaceProvider,
  MarketplaceSearchResult,
} from "./types"

type MatchStatus = "exact" | "variant" | "substitute" | "needs_review" | "unmatched"

export type CanonicalProductInput = {
  id: string
  name: string
  category?: string
  unit_of_measure?: string
}

/**
 * A supplier-catalog row carrying the canonical product it was sourced for. The
 * match is known by construction (we searched the marketplace by this canonical
 * product's name), so we attach it directly instead of re-running fuzzy scoring.
 */
export type MarketplaceCatalogRow = SupplierCatalogRow & {
  canonical_product_id: string
  canonical_match_status: MatchStatus
  canonical_match_confidence: number
  canonical_match_reason: string
}

export type SearchCanonicalOptions = {
  /** Max results to keep per canonical product. */
  maxResults?: number
  /** Prepended to the canonical name to bias the search (e.g. "dental "). */
  queryPrefix?: string
  timeoutMs?: number
}

export type SearchCanonicalResult = {
  canonical: CanonicalProductInput
  query: string
  url: string
  status: number
  blocked: boolean
  error?: string
  results: MarketplaceSearchResult[]
  rows: MarketplaceCatalogRow[]
}

// A marketplace listing surfaced by searching the canonical product's name is a
// plausible alternative source, not a verified identical SKU. Title token
// overlap grades how confident that mapping is.
function matchStatusForConfidence(confidence: number): MatchStatus {
  if (confidence >= 80) return "exact"
  if (confidence >= 55) return "variant"
  if (confidence >= 30) return "substitute"
  return "needs_review"
}

// Unit-qualified axes where a difference still leaves an acceptable substitute:
// a buyer reordering gloves will take a different color. Every other extracted
// axis (size, shade, gauge, mm/ml/oz measures, suture/crown sizes, bur grit,
// taper, catalog #) is product-defining — a disagreement means a different
// product, not a substitute.
const SUBSTITUTE_COSMETIC_AXES = new Set(["color"])

/**
 * Normalize a bare product name into the matcher's representation so we can reuse
 * its unit-qualified numeric-attribute extraction. Only the name matters here;
 * the other row fields are left empty.
 */
function normalizedFromName(name: string): NormalizedProduct {
  const row: SupplierProductRow = {
    id: "",
    supplier_id: "",
    sku: "",
    manufacturer_sku: "",
    brand: "",
    name,
    category: "",
    pack_size: "",
    unit_of_measure: "",
    product_url: "",
    image_url: "",
    price_cents: null,
    price_basis: null,
  }
  return normalizeProduct(row)
}

/**
 * True when the canonical name and the listing title disagree on a
 * product-defining numeric axis (size / shade / gauge / measure / catalog #),
 * i.e. both specify that axis but share no value. This is the structural veto
 * the asymmetric title-token-overlap score misses: a listing that shares a brand
 * + a few generic words clears the 30% bar even when it is a different size or
 * shade (the #286 audit measured ~57% of glove substitutes as the wrong size
 * class). Cosmetic axes (color) are ignored — a different color is still a usable
 * substitute. Mirrors the offline engine's `compareNumericAttrs` hard-conflict
 * check, which scored ~100% precision.
 */
export function conflictsOnProductAxis(
  canonicalName: string,
  listingTitle: string
): boolean {
  const canonical = normalizedFromName(canonicalName)
  const listing = normalizedFromName(listingTitle)
  for (const [axis, canonicalValues] of canonical.numericAttrs) {
    if (SUBSTITUTE_COSMETIC_AXES.has(axis)) {
      continue
    }
    const listingValues = listing.numericAttrs.get(axis)
    if (!listingValues) {
      continue
    }
    let overlap = false
    for (const value of canonicalValues) {
      if (listingValues.has(value)) {
        overlap = true
        break
      }
    }
    if (!overlap) {
      return true
    }
  }
  return false
}

export function resultToRow(
  provider: MarketplaceProvider,
  canonical: CanonicalProductInput,
  result: MarketplaceSearchResult
): MarketplaceCatalogRow {
  const sku = `${provider.id}:${marketplaceProductId(result.product_url)}`
  const confidence = titleOverlapConfidence(result.title, canonical.name)

  // Title overlap alone over-promotes: a listing that shares a brand + a few
  // generic words clears the 30% bar even when it is a different size or shade.
  // Veto the `substitute` tier on a product-defining numeric-axis conflict,
  // downgrading to `needs_review` so it stops short of the reorder drawer.
  // (`exact`/`variant` need much higher overlap and are left unchanged — this
  // only narrows what becomes a substitute.)
  let status = matchStatusForConfidence(confidence)
  let reason = `Sourced via ${provider.id} search for canonical product name; ${confidence}% title overlap`
  if (status === "substitute" && conflictsOnProductAxis(canonical.name, result.title)) {
    status = "needs_review"
    reason += "; downgraded: conflicting size/shade/spec"
  }

  return {
    sku,
    name: result.title,
    description: result.title,
    brand: result.brand,
    category: canonical.category || "Dental supplies",
    product_url: result.product_url,
    image_url: result.image_url,
    unit_of_measure: canonical.unit_of_measure,
    price_cents: result.price_cents,
    price_basis: "unknown",
    availability: "unknown",
    raw: {
      provider: provider.id,
      currency: result.currency,
      price_text: result.price_text,
      sourced_for_canonical_product_id: canonical.id,
      ...result.raw,
    },
    canonical_product_id: canonical.id,
    canonical_match_status: status,
    canonical_match_confidence: confidence,
    canonical_match_reason: reason,
  }
}

export function buildQuery(
  canonical: CanonicalProductInput,
  options: SearchCanonicalOptions = {}
): string {
  return `${options.queryPrefix ?? ""}${canonical.name}`.trim()
}

/**
 * Search a marketplace for one canonical product and return normalized rows.
 * Fetching is delegated to the injected fetcher; an anti-bot/captcha response
 * yields zero rows (and blocked=true) rather than garbage.
 */
export async function searchCanonicalOnMarketplace(
  provider: MarketplaceProvider,
  fetcher: MarketplaceFetcher,
  canonical: CanonicalProductInput,
  options: SearchCanonicalOptions = {}
): Promise<SearchCanonicalResult> {
  const query = buildQuery(canonical, options)
  const url = provider.buildSearchUrl(query)
  const fetched = await fetcher(url, { timeoutMs: options.timeoutMs })

  const base = {
    canonical,
    query,
    url,
    status: fetched.status,
    blocked: fetched.blocked,
    error: fetched.error,
  }

  if (!fetched.ok || fetched.blocked || !fetched.body) {
    return { ...base, results: [], rows: [] }
  }

  // Resolve relative hrefs/images against the marketplace search URL we asked
  // for — NOT fetched.final_url, which is the scraper-proxy URL when routed
  // through MARKETPLACE_SCRAPER_URL (that would yield api.scraperapi.com links).
  const parsed = provider.parseResults(fetched.body, {
    query,
    baseUrl: url,
  })
  const results = (options.maxResults
    ? parsed.slice(0, options.maxResults)
    : parsed
  ).filter((result) => result.product_url && result.title.trim())

  return {
    ...base,
    results,
    rows: results.map((result) => resultToRow(provider, canonical, result)),
  }
}
