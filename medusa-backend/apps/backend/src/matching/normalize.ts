import { VARIANT_SPECS, type ExtractContext } from "./attribute-specs"
import type { NormalizedProduct, SupplierProductRow } from "./types"

// COLOR_WORDS now lives with the variant registry; re-exported here because
// search.ts (and existing imports) read it from this module.
export { COLOR_WORDS } from "./attribute-specs"

const BRAND_JUNK_PATTERNS = [
  /^\d/,
  /^\s*$/,
  /\b\d+\s*x\s*\d+\b/i,
  /^(pkg|pack|package|box|case|bag|each|refill)\b/i,
  /^(left|right|upper|lower|lateral|anterior|posterior|shaded|assorted|small|medium|large|adult|child|pedo)$/i,
]

const BRAND_STOP_TOKENS = new Set([
  "inc",
  "llc",
  "co",
  "company",
  "corp",
  "corporation",
  "usa",
  "intl",
  "international",
  "by",
  "the",
  "and",
])

/** Distributor house labels applied to every product regardless of maker. */
const HOUSE_LABELS: Record<string, RegExp> = {
  msup_dentalcity_com: /^dental\s*city$/i,
}

const BRAND_ALIASES: Record<string, string> = {
  "3m espe": "3m",
  "3m unitek": "3m",
  "kerr endodontics": "kerr",
  "kerr restoratives": "kerr",
  "dentsply sirona": "dentsply",
}

export const NAME_STOP_TOKENS = new Set([
  "of",
  "the",
  "and",
  "with",
  "for",
  "per",
  "a",
  "an",
  "by",
  "x",
  "pkg",
  "pack",
  "package",
  "packages",
  "box",
  "boxes",
  "case",
  "bag",
  "each",
  "ea",
  "ct",
  "count",
])

export const PACK_UNIT_WORDS =
  "pk|pack|pkg|bx|box|cs|case|bag|ct|count|tub|jar|roll|sleeve|carton|kit|cn|can|bottle|btl|tube|syringe|spool"

export const MEASURE_UNIT_SUFFIX = /^(\d+(\.\d+)?)(MM|CM|ML|CC|OZ|GA|GAUGE|GR|G|L|IN|KG|LB|PCT)$/

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function normalizeSku(raw: string | null | undefined): string {
  if (!raw) {
    return ""
  }
  return stripDiacritics(raw).toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * How much identity evidence an exact normalized-SKU collision carries.
 * Short or numeric-only SKUs collide across manufacturers constantly
 * (observed: "0044" shared by 15 unrelated products), so they score low
 * and must be corroborated by name similarity.
 */
export function skuStrength(sku: string): number {
  if (!sku) {
    return 0
  }
  if (/^(.)\1*$/.test(sku)) {
    return 0.1
  }
  const hasLetters = /[A-Z]/.test(sku)
  const hasDigits = /[0-9]/.test(sku)
  const len = sku.length
  if (hasLetters && hasDigits) {
    if (len >= 6) return 0.95
    if (len === 5) return 0.85
    if (len === 4) return 0.6
    return 0.3
  }
  if (hasDigits) {
    if (len >= 8) return 0.85
    if (len === 7) return 0.75
    if (len === 6) return 0.65
    if (len === 5) return 0.5
    if (len === 4) return 0.35
    return 0.12
  }
  return len >= 6 ? 0.6 : 0.3
}

/**
 * Manufacturer model with a leading distributor line/category prefix stripped.
 * Some distributors prepend an internal segment to the maker's part number — DC
 * Dental stores Dynarex model 4302 as "219-4302", while Henry Schein carries the
 * same item as plain "4302". That extra "<2-4 digits>-" segment hides the shared
 * model from exact-SKU blocking (normalizeSku("219-4302") = "2194302" != "4302").
 *
 * Returns the trailing core only when it is itself a plausible model (>=4 chars,
 * contains a digit); "" otherwise. This is intentionally *additive* — callers
 * key on it ON TOP OF the full SKU, never instead of it — because the same
 * "<digits>-<digits>" shape also describes a maker part number a distributor
 * merely hyphenates (Dental City "100-3371" == Premier "1003371"), which the
 * full-SKU key already matches. Stray core collisions are left for scoring's
 * brand/name/attribute guards to reject.
 *
 * Applied ONLY to suppliers in PREFIX_CODED_SUPPLIERS, because the "<digits>-"
 * shape is ambiguous: for DC Dental it's a throwaway internal line number, but
 * for distributors who number diamond burs by shape (Darby "846-016C") the
 * leading segment IS the identity and the trailing "016C" is a size+grit shared
 * across many shapes — stripping it fuses different burs. Per-supplier gating
 * keeps the bridge to vendors empirically confirmed to use a throwaway prefix.
 */
/**
 * Suppliers whose manufacturer_sku carries a throwaway "<digits>-" line prefix
 * in front of the real maker model (DC Dental NetSuite, e.g. "219-4302"). Gated
 * narrowly on purpose — add a supplier here only after confirming its prefix is
 * a line code, not a shape/family identifier.
 */
export const PREFIX_CODED_SUPPLIERS = new Set(["msup_dcdental_com"])

export function skuModelCore(raw: string | null | undefined): string {
  if (!raw) {
    return ""
  }
  const cleaned = stripDiacritics(raw).toUpperCase().replace(/[^A-Z0-9-]/g, "")
  const match = cleaned.match(/^\d{2,4}-(.+)$/)
  if (!match) {
    return ""
  }
  const core = match[1].replace(/-/g, "")
  if (core.length < 4 || !/[0-9]/.test(core)) {
    return ""
  }
  return core
}

export function normalizeBrand(
  raw: string | null | undefined,
  supplierId: string
): { key: string | null; tokens: string[] } {
  if (!raw) {
    return { key: null, tokens: [] }
  }
  const trimmed = raw.trim()
  const houseLabel = HOUSE_LABELS[supplierId]
  if (houseLabel?.test(trimmed)) {
    return { key: null, tokens: [] }
  }
  for (const pattern of BRAND_JUNK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { key: null, tokens: [] }
    }
  }
  let lowered = stripDiacritics(trimmed).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  if (BRAND_ALIASES[lowered]) {
    lowered = BRAND_ALIASES[lowered]
  }
  const tokens = lowered.split(/\s+/).filter((token) => token && !BRAND_STOP_TOKENS.has(token))
  if (!tokens.length) {
    return { key: null, tokens: [] }
  }
  return { key: tokens.join(" "), tokens }
}

export function brandsAgree(a: NormalizedProduct, b: NormalizedProduct): "match" | "conflict" | "unknown" {
  if (!a.brandKey || !b.brandKey) {
    return "unknown"
  }
  if (a.brandKey === b.brandKey) {
    return "match"
  }
  const setA = new Set(a.brandTokens)
  const setB = new Set(b.brandTokens)
  const subset = (small: string[], big: Set<string>) => small.every((token) => big.has(token))
  if (subset(a.brandTokens, setB) || subset(b.brandTokens, setA)) {
    return "match"
  }
  if (a.brandTokens[0] === b.brandTokens[0]) {
    return "match"
  }
  return "conflict"
}

export function parsePackQty(packSize: string | null | undefined, name: string): number | null {
  for (const source of [packSize ?? "", name]) {
    const qty = parsePackQtyFromText(source)
    if (qty) {
      return qty
    }
  }
  return null
}

function parsePackQtyFromText(text: string): number | null {
  if (!text) {
    return null
  }
  const lowered = text.toLowerCase()

  // Count of measured units: "20 - 0.2g Capsules", "24 x 1.2mL Syringe". The
  // leading integer is the purchasable count; the trailing measure is the
  // per-item dose. Matched before the bare-number / measure heuristics so the
  // per-unit price uses the count, not the dose.
  const countMeasure = lowered.match(
    /(?:^|[^0-9.])(\d{1,4})\s*[-x×]\s*\d+(?:\.\d+)?\s*(?:ml|cc|mg|gm|g|oz)\b/
  )
  if (countMeasure) {
    return Number(countMeasure[1])
  }

  const slash = lowered.match(new RegExp(`(\\d{1,5})\\s*\\/\\s*(?:${PACK_UNIT_WORDS})\\b`))
  if (slash) {
    return Number(slash[1])
  }
  const pkgOf = lowered.match(/\b(?:pkg|package|pk)\s*\.?\s*of\s*(\d{1,5})\b/)
  if (pkgOf) {
    return Number(pkgOf[1])
  }
  // Without "of", a long number after "pkg" is usually a catalog number
  // ("Pulp Canal Sealer EWT Pkg 24746"), so only accept up to 3 digits.
  const pkgBare = lowered.match(/\b(?:pkg|package|pk)\s*\.?\s*(\d{1,3})\b/)
  if (pkgBare) {
    return Number(pkgBare[1])
  }
  const nested = lowered.match(
    /\b(?:pkg|pack|box|case|bag|carton)\s+of\s+(\d{1,4})\s*x\s*(?:pkg\s+of\s+)?(\d{1,4})\b/
  )
  if (nested) {
    return Number(nested[1]) * Number(nested[2])
  }
  const wordOf = lowered.match(/\b(?:pack|box|case|bag|carton|sleeve|roll|kit)\s+of\s+(\d{1,5})\b/)
  if (wordOf) {
    return Number(wordOf[1])
  }
  const multiplied = lowered.match(/\((\d{1,3})\s*x\s*(\d{1,4})\)/)
  if (multiplied) {
    return Number(multiplied[1]) * Number(multiplied[2])
  }
  const trailingParen = lowered.match(/\((\d{1,5})\)\s*$/)
  if (trailingParen) {
    return Number(trailingParen[1])
  }
  const count = lowered.match(/\b(\d{1,5})\s*(?:count|ct)\b/)
  if (count) {
    return Number(count[1])
  }
  return null
}

/**
 * Extract unit-qualified numeric attributes. Dental products are heavily
 * differentiated by size/gauge/shade/taper, so disagreement on these is
 * strong evidence two products differ even when SKUs collide.
 */
export function extractNumericAttrs(
  name: string,
  ctx?: { mfrSku?: string; rawMfrSku?: string; brand?: string }
): Map<string, Set<string>> {
  const attrs = new Map<string, Set<string>>()
  const add = (unit: string, value: string) => {
    const normalizedValue = value.replace(/^0+(\d)/, "$1")
    if (!attrs.has(unit)) {
      attrs.set(unit, new Set())
    }
    attrs.get(unit)!.add(normalizedValue)
  }

  const extractContext: ExtractContext = {
    name,
    lowered: stripDiacritics(name).toLowerCase(),
    mfrSku: ctx?.mfrSku ?? "",
    rawMfrSku: ctx?.rawMfrSku ?? "",
    brand: ctx?.brand ?? "",
  }

  // Each variant axis is defined once in the registry (extraction + conflict +
  // selector display). Adding a new axis means appending a VariantSpec there,
  // not editing this driver. Order is irrelevant: every spec writes independent
  // axes into the Map, so they never read each other's output.
  for (const spec of VARIANT_SPECS) {
    for (const [axis, value] of spec.extract(extractContext)) {
      add(axis, value)
    }
  }

  return attrs
}

function stem(token: string): string {
  // Never stem tokens containing a digit: they are catalog/pattern codes
  // (e.g. "151AS" must stay distinct from "151A"), not plural English words.
  if (/[0-9]/.test(token)) {
    return token
  }
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1)
  }
  return token
}

export function tokenizeName(name: string): string[] {
  const lowered = stripDiacritics(name).toLowerCase()
  return lowered
    .split(/[^a-z0-9.#]+/)
    .map((token) => token.replace(/^[.#]+|[.]+$/g, "").trim())
    .filter((token) => token.length > 0)
    .map(stem)
}

const PACK_TOKEN_RE = new RegExp(`^\\d+(${PACK_UNIT_WORDS.toUpperCase()})$`)

/**
 * Tokens in the product name that look like manufacturer catalog numbers.
 * Some distributors (e.g. Dental City) put the real maker part number in
 * the name while storing an internal item number in manufacturer_sku, so
 * these tokens become additional join keys for blocking.
 */
export function extractSkuLikeTokens(name: string): string[] {
  const found = new Set<string>()
  const upper = stripDiacritics(name).toUpperCase()
  const tokenRe = /[A-Z0-9][A-Z0-9.\-/]{2,}[A-Z0-9]/g
  let match: RegExpExecArray | null
  while ((match = tokenRe.exec(upper))) {
    const normalized = match[0].replace(/[^A-Z0-9]/g, "")
    if (normalized.length < 5) {
      continue
    }
    const digits = normalized.replace(/[^0-9]/g, "").length
    if (digits < 3) {
      continue
    }
    if (MEASURE_UNIT_SUFFIX.test(normalized)) {
      continue
    }
    if (PACK_TOKEN_RE.test(normalized)) {
      continue
    }
    found.add(normalized)
  }
  return [...found]
}

export function normalizeProduct(row: SupplierProductRow): NormalizedProduct {
  const mfrSku = normalizeSku(row.manufacturer_sku)
  const skuCore = PREFIX_CODED_SUPPLIERS.has(row.supplier_id)
    ? skuModelCore(row.manufacturer_sku)
    : ""
  const brand = normalizeBrand(row.brand, row.supplier_id)
  const nameTokens = tokenizeName(row.name)
  const skuLikeTokens = extractSkuLikeTokens(row.name)
  const skuLikeSet = new Set(skuLikeTokens)
  // SKU/brand-keyed model axes (wallshoulders/pdt/unitek) are registry specs, so
  // they need the SKU and brand alongside the name.
  const numericAttrs = extractNumericAttrs(row.name, {
    mfrSku,
    rawMfrSku: row.manufacturer_sku,
    brand: row.brand,
  })
  // The prefix-stripped model is a hard-conflict axis: two products with
  // different models are different products. Only prefix-coded suppliers carry
  // it, so it can only ever veto a pair of THAT supplier's own listings —
  // exactly the same-supplier name-cluster that would otherwise act as a hub,
  // welding each variant's distinct cross-supplier match into one mega-cluster
  // (e.g. DC Dental's "375-330001"/"375-330002" die stones bridging Hard Rock
  // Aqua to Silky Rock). A cross-supplier core match still goes through, because
  // the other side has no model axis to conflict with.
  if (skuCore) {
    numericAttrs.set("model", new Set([skuCore]))
  }
  let packQty = parsePackQty(row.pack_size, row.name)
  // A "pack quantity" that is really the product's catalog number (e.g. a
  // trailing "(24746)") would wreck per-unit prices; veto those.
  if (packQty !== null && (skuLikeSet.has(String(packQty)) || packQty > 20000)) {
    packQty = null
  }

  const numericValues = new Set<string>()
  for (const values of numericAttrs.values()) {
    for (const value of values) {
      numericValues.add(value)
    }
  }

  const brandTokenSet = new Set(brand.tokens.map(stem))
  const coreTokens = nameTokens.filter((token) => {
    if (NAME_STOP_TOKENS.has(token)) return false
    if (!/[a-z]/.test(token)) return false
    if (token.length < 2) return false
    if (brandTokenSet.has(token)) return false
    if (skuLikeSet.has(token.toUpperCase().replace(/[^A-Z0-9]/g, ""))) return false
    if (MEASURE_UNIT_SUFFIX.test(token.toUpperCase())) return false
    return true
  })

  const bareNumbers = new Set<string>()
  for (const token of nameTokens) {
    if (!/^\d{1,4}$/.test(token)) {
      continue
    }
    const cleaned = token.replace(/^0+(\d)/, "$1")
    if (packQty !== null && Number(cleaned) === packQty) {
      continue
    }
    if (numericValues.has(cleaned)) {
      continue
    }
    bareNumbers.add(cleaned)
  }

  const unitPriceCents =
    row.price_cents !== null && row.price_cents > 0
      ? Math.round(row.price_cents / Math.max(packQty ?? 1, 1))
      : null

  return {
    row,
    mfrSku,
    skuStrength: skuStrength(mfrSku),
    skuCore,
    brandKey: brand.key,
    brandTokens: brand.tokens,
    nameTokens,
    coreTokens,
    skuLikeTokens,
    numericAttrs,
    bareNumbers,
    packQty,
    unitPriceCents,
  }
}
