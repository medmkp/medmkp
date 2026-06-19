// Pack-size normalization: turn free-text pack descriptions ("100/Box",
// "Pkg of 10") or pack info embedded in a product name ("... Gloves 100/Pk")
// into a structured quantity of base units, so prices can be compared per unit.
//
// Resolved-quantity model (not nested packaging): pack_quantity is the total
// number of base_units in one purchasable SKU. unit_price = price / pack_quantity.

export type PackBasis = "each" | "box" | "case" | "pack" | "unknown"
export type PackParseSource = "pack_size" | "name" | "none"

export type PackParseResult = {
  /** Total base units in one purchasable SKU, or null when unrecoverable. */
  pack_quantity: number | null
  /** The unit prices compare in: "each" (a glove, a sponge) or a measure (ml, g). */
  base_unit: string
  /** The purchasable unit, for display ("100/box"). */
  basis: PackBasis
  /** 0..1 — how much to trust this parse (pack_size beats name). */
  confidence: number
  source: PackParseSource
}

const UNKNOWN: PackParseResult = {
  pack_quantity: null,
  base_unit: "each",
  basis: "unknown",
  confidence: 0,
  source: "none",
}

const MEASURE_UNITS: Record<string, string> = {
  ml: "ml", cc: "ml", l: "l", oz: "oz",
  g: "g", gm: "g", gram: "g", grams: "g", kg: "kg", mg: "mg",
}

function basisFromWord(word: string): PackBasis {
  const w = word.toLowerCase()
  if (/^(box|bx|boxes)$/.test(w)) return "box"
  if (/^(case|cs|cases|carton|ctn)$/.test(w)) return "case"
  if (/^(pack|packs|pk|pks|pkg|pkgs|package|packages|bag|bags|sleeve|sleeves|roll|rolls|jar|jars|tub|tubs|tube|tubes|bottle|bottles|btl|kit|kits|can|cans|spool|spools|cn|ct|count)$/.test(w)) {
    return "pack"
  }
  if (/^(each|ea|unit|units|piece|pieces|pc|pcs)$/.test(w)) return "each"
  return "unknown"
}

type Extracted = { quantity: number; basis: PackBasis; base_unit: string; kind: string }

// Pull a pack quantity out of one text field. `allowDims` enables the "N x M"
// nesting rule (trusted from pack_size, but in a product name "2x2" is usually
// a product dimension like gauze size, not a pack count, so it's disabled there).
function extract(text: string, allowDims: boolean): Extracted | null {
  const t = text.toLowerCase()

  if (allowDims) {
    const nx = t.match(/(?:^|[^0-9.])(\d{1,4})\s*[x×]\s*(\d{1,5})(?:[^0-9.]|$)/)
    if (nx) {
      const quantity = Number(nx[1]) * Number(nx[2])
      if (quantity > 0 && quantity <= 100000) {
        return { quantity, basis: "case", base_unit: "each", kind: "nxm" }
      }
    }
  }

  // "100/Box", "5/Pk", "10 / pack"
  const slash = t.match(/(\d{1,5})\s*\/\s*([a-z]{1,10})\b/)
  if (slash) {
    const basis = basisFromWord(slash[2])
    if (basis !== "unknown") {
      return { quantity: Number(slash[1]), basis, base_unit: "each", kind: "slash" }
    }
  }

  // "Pkg of 10", "box of 200", "case of 10", "pack of 6"
  const wordOf = t.match(/\b(box|bx|case|cs|carton|pack|pk|pkg|package|bag|jar|tub|sleeve|roll|kit)s?\.?\s*of\s*(\d{1,5})\b/)
  if (wordOf) {
    return { quantity: Number(wordOf[2]), basis: basisFromWord(wordOf[1]), base_unit: "each", kind: "wordof" }
  }

  // "Pkg. 200", "Pkg 10", "(Pkg. 100)" — the "Pkg" abbreviation directly followed
  // by the count, no "of" between (American Dental Accessories' / Pearson's house
  // format, which leaves pack_size empty and puts the pack in the name). Only the
  // abbreviation: the full word in "Standard Package 2.6kg" or "Complete Package
  // 1 Powder" is a kit descriptor followed by a spec, not a pack count.
  const pkgN = t.match(/\bpkgs?\.?\s*(\d{1,5})\b/)
  if (pkgN) {
    return { quantity: Number(pkgN[1]), basis: "pack", base_unit: "each", kind: "wordof" }
  }

  // "100 ct", "200 count", "50 pk", "100ct"
  const nUnit = t.match(/\b(\d{1,5})\s*(ct|count|pk|pack|bx|box)\b/)
  if (nUnit) {
    return { quantity: Number(nUnit[1]), basis: basisFromWord(nUnit[2]), base_unit: "each", kind: "nunit" }
  }

  // Volume / weight measure: "5ml", "1.7 ml", "4g"
  const measure = t.match(/(?:^|[^a-z0-9.])(\d{1,4}(?:\.\d{1,2})?)\s*(ml|cc|oz|gm|grams|gram|kg|mg|g|l)\b/)
  if (measure) {
    const unit = MEASURE_UNITS[measure[2]] ?? "each"
    return { quantity: Number(measure[1]), basis: "each", base_unit: unit, kind: "measure" }
  }

  return null
}

// Nested packaging: an inner pack multiplied by an outer case/box, written out
// as "A/inner x B/outer" — e.g. "60/Can x 12/Case" = 720, "50/Pk x 4/Cs" = 200.
// A plain pack_size like "12/Case" only carries the OUTER count, so without this
// the resolved quantity collapses to 12 and the per-unit price is inflated ~60x.
// The outer token must be a bulk word (case/box) so we don't multiply two peers
// or a product dimension; the inner word can be anything.
function extractNested(text?: string | null): number | null {
  const t = text?.trim().toLowerCase()
  if (!t) return null
  const m = t.match(
    /(\d{1,5})\s*\/\s*[a-z]{1,10}\s*[x×]\s*(\d{1,5})\s*\/\s*(?:case|cases|cs|carton|ctn|box|boxes|bx)\b/
  )
  if (m) {
    const quantity = Number(m[1]) * Number(m[2])
    if (quantity > 0 && quantity <= 1_000_000) {
      return quantity
    }
  }
  return null
}

function confidenceFor(source: "pack_size" | "name", kind: string): number {
  if (source === "pack_size") {
    if (kind === "slash" || kind === "wordof" || kind === "nxm") return 0.92
    if (kind === "nunit") return 0.85
    return 0.78
  }
  if (kind === "slash" || kind === "wordof") return 0.7
  if (kind === "nunit") return 0.6
  return 0.55
}

export function parsePack(
  packSize?: string | null,
  name?: string | null,
  _category?: string | null
): PackParseResult {
  const ps = packSize?.trim()
  const nm = name?.trim()

  // Highest priority: explicit nested packaging ("A/inner x B/Case"). It usually
  // lives in the name (the richest field) even when pack_size holds only the
  // outer count, so check both and multiply rather than trusting the outer token.
  const nestedFromPack = extractNested(ps)
  if (nestedFromPack !== null) {
    return { pack_quantity: nestedFromPack, base_unit: "each", basis: "case", confidence: 0.92, source: "pack_size" }
  }
  const nestedFromName = extractNested(nm)
  if (nestedFromName !== null) {
    return { pack_quantity: nestedFromName, base_unit: "each", basis: "case", confidence: 0.8, source: "name" }
  }

  if (ps) {
    const extracted = extract(ps, true)
    if (extracted && extracted.quantity > 0) {
      return {
        pack_quantity: extracted.quantity,
        base_unit: extracted.base_unit,
        basis: extracted.basis,
        confidence: confidenceFor("pack_size", extracted.kind),
        source: "pack_size",
      }
    }
  }

  if (nm) {
    const extracted = extract(nm, false)
    if (extracted && extracted.quantity > 0) {
      return {
        pack_quantity: extracted.quantity,
        base_unit: extracted.base_unit,
        basis: extracted.basis,
        confidence: confidenceFor("name", extracted.kind),
        source: "name",
      }
    }
  }

  return { ...UNKNOWN }
}

// price_cents is for one purchasable SKU; divide by pack_quantity for the
// comparable per-base-unit price. Null when quantity is unknown.
export function unitPriceCents(priceCents: number, packQuantity: number | null): number | null {
  if (packQuantity === null || packQuantity <= 0) return null
  if (!Number.isFinite(priceCents) || priceCents < 0) return null
  return Math.round(priceCents / packQuantity)
}
