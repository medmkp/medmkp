import { brandsAgree } from "./normalize"
import type { NormalizedProduct, PairDecision } from "./types"

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const setA = a instanceof Set ? (a as Set<string>) : new Set(a)
  const setB = b instanceof Set ? (b as Set<string>) : new Set(b)
  if (!setA.size && !setB.size) {
    return 0
  }
  let shared = 0
  for (const token of setA) {
    if (setB.has(token)) {
      shared += 1
    }
  }
  return shared / (setA.size + setB.size - shared)
}

const trigramCache = new WeakMap<NormalizedProduct, Set<string>>()

export function trigramsOf(product: NormalizedProduct): Set<string> {
  const cached = trigramCache.get(product)
  if (cached) {
    return cached
  }
  const text = `  ${product.nameTokens.join(" ")} `
  const grams = new Set<string>()
  for (let i = 0; i < text.length - 2; i++) {
    grams.add(text.slice(i, i + 3))
  }
  trigramCache.set(product, grams)
  return grams
}

export function trigramDice(a: NormalizedProduct, b: NormalizedProduct): number {
  const gramsA = trigramsOf(a)
  const gramsB = trigramsOf(b)
  if (!gramsA.size || !gramsB.size) {
    return 0
  }
  let shared = 0
  for (const gram of gramsA) {
    if (gramsB.has(gram)) {
      shared += 1
    }
  }
  return (2 * shared) / (gramsA.size + gramsB.size)
}

type NumericComparison = {
  hardConflict: boolean
  agreements: number
  bareConflict: boolean
}

/**
 * Compare unit-qualified attributes. A dimension both products specify with
 * disjoint values (e.g. 25mm vs 31mm) is a hard conflict. Matching values
 * are positive identity evidence.
 */
export function compareNumericAttrs(a: NormalizedProduct, b: NormalizedProduct): NumericComparison {
  let hardConflict = false
  let agreements = 0
  for (const [unit, valuesA] of a.numericAttrs) {
    const valuesB = b.numericAttrs.get(unit)
    if (!valuesB) {
      continue
    }
    let overlap = false
    for (const value of valuesA) {
      if (valuesB.has(value)) {
        overlap = true
        agreements += 1
      }
    }
    if (!overlap) {
      hardConflict = true
    }
  }

  let bareConflict = false
  if (a.bareNumbers.size && b.bareNumbers.size) {
    let overlap = false
    for (const value of a.bareNumbers) {
      if (b.bareNumbers.has(value)) {
        overlap = true
        break
      }
    }
    bareConflict = !overlap
  }

  return { hardConflict, agreements, bareConflict }
}

export function skuEvidence(a: NormalizedProduct, b: NormalizedProduct): { score: number; kind: string } {
  if (a.mfrSku && a.mfrSku === b.mfrSku) {
    return { score: Math.min(a.skuStrength, b.skuStrength), kind: "mfr-sku" }
  }
  const aInB = a.mfrSku.length >= 5 && b.skuLikeTokens.includes(a.mfrSku)
  const bInA = b.mfrSku.length >= 5 && a.skuLikeTokens.includes(b.mfrSku)
  if (aInB || bInA) {
    const sku = aInB ? a.mfrSku : b.mfrSku
    return { score: Math.min(0.9, skuStrengthOf(a, b, sku) * 0.95), kind: "name-embedded-sku" }
  }
  for (const token of a.skuLikeTokens) {
    if (token.length >= 6 && b.skuLikeTokens.includes(token)) {
      return { score: 0.55, kind: "shared-name-code" }
    }
  }
  return { score: 0, kind: "none" }
}

function skuStrengthOf(a: NormalizedProduct, b: NormalizedProduct, sku: string): number {
  if (a.mfrSku === sku) return a.skuStrength
  if (b.mfrSku === sku) return b.skuStrength
  return 0.5
}

export function packRelation(a: NormalizedProduct, b: NormalizedProduct): "same" | "differs" | "unknown" {
  if (a.packQty === null || b.packQty === null) {
    return "unknown"
  }
  return a.packQty === b.packQty ? "same" : "differs"
}

/**
 * Decide whether two supplier products are the same product.
 *
 * The rule structure (rather than a single linear score) keeps decisions
 * explainable: strong SKU evidence needs moderate name corroboration,
 * weak SKU evidence needs strong name corroboration, and unit-qualified
 * attribute conflicts (sizes, gauges, shades) veto a match outright.
 */
export function scorePair(a: NormalizedProduct, b: NormalizedProduct): PairDecision {
  const sku = skuEvidence(a, b)
  const numeric = compareNumericAttrs(a, b)
  const brandRel = brandsAgree(a, b)
  const packRel = packRelation(a, b)

  const tokenSim = jaccard(a.nameTokens, b.nameTokens)
  const charSim = trigramDice(a, b)
  let nameSim = 0.45 * tokenSim + 0.55 * charSim
  nameSim += Math.min(numeric.agreements * 0.05, 0.15)
  if (brandRel === "match") {
    nameSim += 0.05
  }
  if (numeric.bareConflict) {
    nameSim -= 0.1
  }
  nameSim = Math.max(0, Math.min(1, nameSim))

  const detail = `sku=${sku.score.toFixed(2)}(${sku.kind}) name=${nameSim.toFixed(2)} brand=${brandRel} pack=${packRel}`

  const reject = (reason: string): PairDecision => ({
    status: "reject",
    confidence: 0,
    reason: `auto:reject ${reason} ${detail}`,
    skuScore: sku.score,
    nameSim,
    brandRel,
    packRel,
  })

  if (numeric.hardConflict) {
    return reject("numeric-attribute-conflict")
  }

  let accepted = false
  let review = false

  if (sku.score >= 0.55) {
    if (brandRel === "conflict") {
      review = nameSim >= 0.5
    } else if (nameSim >= 0.45) {
      accepted = true
    } else if (nameSim >= 0.25) {
      review = true
    }
  } else if (sku.score >= 0.3) {
    if (nameSim >= 0.6 && brandRel !== "conflict") {
      accepted = true
    } else if (nameSim >= 0.45) {
      review = true
    }
  } else if (sku.score > 0) {
    if (nameSim >= 0.8 && brandRel === "match") {
      accepted = true
    } else if (nameSim >= 0.7) {
      review = true
    }
  } else if (brandRel === "match" && !numeric.bareConflict) {
    // No catalog code at all: rely on brand identity + very high name
    // similarity. Stricter than the weak-SKU path (nothing corroborates the
    // name), and a bare-number disagreement vetoes outright. This is what
    // recovers the pure-distributor catalogs whose only join key is the name.
    if (nameSim >= 0.92) {
      accepted = true
    } else if (nameSim >= 0.8) {
      review = true
    }
  }

  if (accepted) {
    const status = packRel === "differs" ? "variant" : "exact"
    const base = packRel === "differs" ? 70 : 75
    const confidence = Math.min(99, Math.round(base + 25 * ((sku.score + nameSim) / 2)))
    return {
      status,
      confidence,
      reason: `auto:${status} ${detail}`,
      skuScore: sku.score,
      nameSim,
      brandRel,
      packRel,
    }
  }

  if (review) {
    return {
      status: "needs_review",
      confidence: Math.round(40 + 20 * nameSim),
      reason: `auto:needs_review ${detail}`,
      skuScore: sku.score,
      nameSim,
      brandRel,
      packRel,
    }
  }

  return reject("insufficient-evidence")
}
