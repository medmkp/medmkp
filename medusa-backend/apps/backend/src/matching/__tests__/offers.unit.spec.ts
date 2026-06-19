import { analyzeOffers, compareOffers, isUnitComparable } from "../offers"
import type { RankableOffer } from "../offers"

const offer = (
  price_cents: number,
  unit_price_cents: number | null,
  base_unit: string | null = "each"
): RankableOffer => ({ price_cents, unit_price_cents, base_unit })

// Sort a list the way the routes do.
function rank(offers: RankableOffer[]): RankableOffer[] {
  const { comparisonBasis } = analyzeOffers(offers)
  return [...offers].sort((a, b) => compareOffers(a, b, comparisonBasis))
}

describe("analyzeOffers", () => {
  it("uses the shared base unit when all priced offers agree", () => {
    const result = analyzeOffers([offer(805, 8, "each"), offer(2895, 10, "each")])
    expect(result.comparisonBasis).toBe("each")
    expect(result.comparableCount).toBe(2)
  })

  it("treats null/blank base_unit as 'each'", () => {
    const result = analyzeOffers([offer(805, 8, null), offer(2895, 10, "")])
    expect(result.comparisonBasis).toBe("each")
    expect(result.comparableCount).toBe(2)
  })

  it("refuses a basis when base units tie (per-gram vs per-jar)", () => {
    // The Vac Attak case: one offer priced per gram, one per jar — no trustworthy
    // per-unit ordering, so the basis is null and ranking falls back to sticker.
    const result = analyzeOffers([offer(5647, 7, "g"), offer(5988, 5988, "each")])
    expect(result.comparisonBasis).toBeNull()
    expect(result.comparableCount).toBe(0)
  })

  it("picks the plurality base unit and excludes the odd one out", () => {
    const result = analyzeOffers([
      offer(805, 8, "each"),
      offer(2895, 10, "each"),
      offer(5647, 7, "g"),
    ])
    expect(result.comparisonBasis).toBe("each")
    expect(result.comparableCount).toBe(2)
  })

  it("ignores offers with no unit price when choosing a basis", () => {
    const result = analyzeOffers([offer(805, 8, "each"), offer(999, null, "each")])
    expect(result.comparisonBasis).toBe("each")
    expect(result.comparableCount).toBe(1)
  })
})

describe("isUnitComparable", () => {
  it("is false when there is no basis", () => {
    expect(isUnitComparable(offer(5647, 7, "g"), null)).toBe(false)
  })
  it("is false for an offer outside the basis or without a unit price", () => {
    expect(isUnitComparable(offer(5647, 7, "g"), "each")).toBe(false)
    expect(isUnitComparable(offer(999, null, "each"), "each")).toBe(false)
  })
  it("is true for an in-basis priced offer", () => {
    expect(isUnitComparable(offer(805, 8, "each"), "each")).toBe(true)
  })
})

describe("ranking", () => {
  it("orders by per-unit price, not sticker price (F1)", () => {
    // The 100-count box ($8.05 → $0.08/ea) beats the cheaper-sticker 1-count
    // ($5.00 → $5.00/ea) once normalized.
    const a = offer(805, 8, "each") // 100/box
    const b = offer(500, 500, "each") // single
    expect(rank([b, a])).toEqual([a, b])
  })

  it("sends unknown-pack offers to the back, ordered by sticker", () => {
    const priced = offer(2895, 10, "each")
    const cheapNoPack = offer(999, null, "each")
    const dearNoPack = offer(3195, null, "each")
    expect(rank([dearNoPack, cheapNoPack, priced])).toEqual([priced, cheapNoPack, dearNoPack])
  })

  it("falls back to sticker price when base units are not comparable (F2)", () => {
    // Per-gram $0.07 must NOT be allowed to outrank the per-jar offer just
    // because its unit number is smaller; with no basis we sort by sticker.
    const perGram = offer(5647, 7, "g")
    const perJar = offer(5988, 5988, "each")
    expect(rank([perJar, perGram])).toEqual([perGram, perJar]) // 5647 < 5988
  })
})
