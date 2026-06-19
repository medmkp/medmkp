// Ranking the supplier offers shown under one canonical product.
//
// Two rules, applied together:
//   F1 — rank by comparable per-unit price (price ÷ pack_quantity), not sticker
//        price, so a cheap-looking small pack doesn't outrank a bulkier, truly
//        cheaper one. Offers whose pack is unknown have no unit price and fall
//        last (ranked among themselves by sticker price).
//   F2 — only compare per-unit prices that are in the SAME base unit. A group
//        that mixes base units (e.g. one offer priced per gram, another per
//        jar) has no trustworthy per-unit ordering, so we don't claim one:
//        comparisonBasis is null and ranking falls back to sticker price.

export type RankableOffer = {
  price_cents: number
  unit_price_cents: number | null
  base_unit: string | null
}

export type OfferRanking = {
  /**
   * The base unit the per-unit prices are comparable in, or null when the
   * offers don't share a single dominant one (so per-unit numbers must not be
   * compared across the group).
   */
  comparisonBasis: string | null
  /** How many offers are comparable in that basis. */
  comparableCount: number
}

function normalizeBase(unit: string | null | undefined): string {
  return unit && unit.trim() ? unit.trim().toLowerCase() : "each"
}

/**
 * Pick the base unit the group's per-unit prices are comparable in: the one a
 * strict plurality of priced offers share. A tie (e.g. one "g" vs one "each")
 * means there is no trustworthy basis, so we return null and callers fall back
 * to sticker price.
 */
export function analyzeOffers(offers: RankableOffer[]): OfferRanking {
  const counts = new Map<string, number>()
  for (const offer of offers) {
    if (offer.unit_price_cents == null) {
      continue
    }
    const base = normalizeBase(offer.base_unit)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }

  let basis: string | null = null
  let top = 0
  let runnerUp = 0
  for (const [base, count] of counts) {
    if (count > top) {
      runnerUp = top
      top = count
      basis = base
    } else if (count > runnerUp) {
      runnerUp = count
    }
  }

  if (basis === null || top === runnerUp) {
    return { comparisonBasis: null, comparableCount: 0 }
  }
  return { comparisonBasis: basis, comparableCount: top }
}

/** True when this offer's per-unit price can be compared in the group basis. */
export function isUnitComparable(offer: RankableOffer, basis: string | null): boolean {
  return (
    basis !== null &&
    offer.unit_price_cents != null &&
    normalizeBase(offer.base_unit) === basis
  )
}

/**
 * Comparator: comparable offers first, ordered by per-unit price; everything
 * else after, ordered by sticker price. Sticker price breaks ties throughout.
 */
export function compareOffers(a: RankableOffer, b: RankableOffer, basis: string | null): number {
  const aComparable = isUnitComparable(a, basis)
  const bComparable = isUnitComparable(b, basis)

  if (aComparable && bComparable) {
    if (a.unit_price_cents !== b.unit_price_cents) {
      return (a.unit_price_cents as number) - (b.unit_price_cents as number)
    }
    return a.price_cents - b.price_cents
  }
  if (aComparable !== bComparable) {
    return aComparable ? -1 : 1
  }
  return a.price_cents - b.price_cents
}
