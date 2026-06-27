import { createHash } from "crypto"
import type { Cluster, FamilyInfo, NormalizedProduct } from "./types"

// ---------------------------------------------------------------------------
// Variant families
//
// The matcher deliberately keeps size/spec variants apart: a numeric-attribute
// conflict (glove S vs L, gutta percha 25mm vs 31mm, shade A1 vs A2) vetoes a
// match, so each variant is its own canonical product. That is correct for
// per-unit price comparison, but it makes the catalog show one card per size.
//
// A *family* groups those canonical products back together for browsing only:
// products that are identical except for one modeled attribute axis become one
// product with a selectable variant. Family grouping never merges canonical
// products or changes price comparison — it is a display-layer overlay keyed by
// (brand + core name tokens with the varying attribute removed).
// ---------------------------------------------------------------------------

// Worded apparel-size tokens that survive into coreTokens (measured tokens like
// "25mm"/"18ga" are already excluded by normalizeProduct, and taper/"#"/bare
// numbers never reach coreTokens because they carry no letter). Stripping these
// is what lets two glove sizes share a family key.
const SIZE_TOKENS = new Set([
  "small", "medium", "large", "xs", "xl", "xxl", "xxxl", "2xl", "3xl", "extra",
])
const SHADE_TOKEN_RE = /^[a-d][1-4](\.5)?$/
// Cotton roll style words that distinguish product lines (econo/economy/braided/
// wrapped) must be stripped from the family key so all three styles can share
// one family, just like size tokens are stripped from glove families.
const COTTON_ROLL_STYLE_TOKENS = new Set(["econo", "economy", "braided", "wrapped"])
// Needle length words (short/long) split distinct needle SKUs in the matcher but
// must be stripped from the family key so the two lengths share one family and
// surface as a Short/Long selector. extractNumericAttrs only emits needle_length
// for needle listings, so this strip is harmless elsewhere.
const NEEDLE_LENGTH_TOKENS = new Set(["short", "long"])

// Axes we will collapse into a selector, in the order we prefer to label by.
// Keys match extractNumericAttrs() unit keys. Product-line/length axes sit ahead
// of generic size/measure axes because those SKUs can share a size or gauge
// across the variants, so the specific axis is what actually varies.
const AXIS_PRIORITY = [
  "cotton_roll_style", "needle_length", "size", "shade", "taper", "#", "mm", "cm", "in", "ga", "ml", "cc", "oz", "gr", "kg", "lb", "l", "%",
] as const

const SIZE_RANK: Record<string, number> = {
  XS: 0, S: 1, M: 2, L: 3, XL: 4, "2XL": 5, "3XL": 6,
}
const SIZE_LABEL: Record<string, string> = {
  XS: "X-Small", S: "Small", M: "Medium", L: "Large",
  XL: "X-Large", "2XL": "2X-Large", "3XL": "3X-Large",
}

function familyTokens(coreTokens: string[]): string[] {
  return coreTokens.filter(
    (token) =>
      !SIZE_TOKENS.has(token) &&
      !SHADE_TOKEN_RE.test(token) &&
      !COTTON_ROLL_STYLE_TOKENS.has(token) &&
      !NEEDLE_LENGTH_TOKENS.has(token)
  )
}

function familyKey(rep: NormalizedProduct, axis: string): string {
  const tokens = [...new Set(familyTokens(rep.coreTokens))].sort().join(" ")
  return `${rep.brandKey ?? ""}|${tokens}|${axis}`
}

function stableId(prefix: string, key: string): string {
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 10)
  return `${prefix}_${hash}`
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56)
}

type ClusterVariant = { axis: string; value: string; label: string; rank: number }

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) {
    const cleaned = value.trim()
    if (!cleaned) {
      continue
    }
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1)
  }
  let best = ""
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/**
 * The varying-attribute value for a whole cluster. All members of a cluster
 * share the same modeled attributes (a conflict would have split them), but
 * some members may not state the value, so scan members and take the most
 * common stated value on the highest-priority axis any member carries.
 */
function clusterVariant(cluster: Cluster): ClusterVariant | null {
  for (const axis of AXIS_PRIORITY) {
    const counts = new Map<string, number>()
    for (const member of cluster.members) {
      const values = member.numericAttrs.get(axis)
      if (!values) {
        continue
      }
      for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }
    if (!counts.size) {
      continue
    }
    // A cluster that somehow carries two disjoint values on this axis is not a
    // clean single variant; skip the axis rather than label it ambiguously.
    if (counts.size > 1) {
      continue
    }
    const value = [...counts.keys()][0]
    return { axis, value, ...formatVariant(axis, value) }
  }
  return null
}

function formatVariant(axis: string, value: string): { label: string; rank: number } {
  // variantRank is persisted in an INTEGER column and is only ever used to sort
  // variants within a (single-axis) family, so every branch must yield a whole
  // number. Magnitudes that can be fractional (taper 0.04, 2.5mm, shade A1.5)
  // are scaled ×100 so sub-integer ordering survives the rounding.
  const scaledMagnitude = Math.round((parseFloat(value) || 0) * 100)
  if (axis === "size") {
    return { label: SIZE_LABEL[value] ?? value, rank: SIZE_RANK[value] ?? 99 }
  }
  if (axis === "cotton_roll_style") {
    const STYLE_RANK: Record<string, number> = { braided: 0, econo: 1, wrapped: 2 }
    const label = value.charAt(0).toUpperCase() + value.slice(1)
    return { label, rank: STYLE_RANK[value] ?? 99 }
  }
  if (axis === "needle_length") {
    const LENGTH_RANK: Record<string, number> = { short: 0, long: 1 }
    const label = value.charAt(0).toUpperCase() + value.slice(1)
    return { label, rank: LENGTH_RANK[value] ?? 99 }
  }
  if (axis === "shade") {
    const upper = value.toUpperCase()
    const rank = upper.charCodeAt(0) * 1000 + Math.round((parseFloat(upper.slice(1)) || 0) * 100)
    return { label: upper, rank }
  }
  if (axis === "taper") {
    return { label: `${value} Taper`, rank: scaledMagnitude }
  }
  if (axis === "#") {
    return { label: `#${value}`, rank: scaledMagnitude }
  }
  if (axis === "%") {
    return { label: `${value}%`, rank: scaledMagnitude }
  }
  const unit = axis === "ga" ? "ga" : axis
  return { label: `${value} ${unit}`, rank: scaledMagnitude }
}

/**
 * Strip the varying attribute from a representative product name so the family
 * gets a clean title ("Alasta Aloe Nitrile Glove Large 100/Box - Large" →
 * "Alasta Aloe Nitrile Glove 100/Box").
 */
function cleanFamilyName(name: string): string {
  let cleaned = name
    // trailing " - Large" / " - X-Small" appended size label
    .replace(/\s*[-–]\s*(x[\s-]?small|x[\s-]?large|2x[\s-]?large|3x[\s-]?large|extra\s+(?:small|large)|small|medium|large|xs|xl|xxl|xxxl)\s*$/i, "")
    // measured values with unit
    .replace(/\b\d+(?:\.\d+)?\s*(?:mm|cm|ml|cc|oz|gauge|ga|gr|kg|lb|in)\b/gi, "")
    // worded apparel sizes anywhere
    .replace(/\b(?:x[\s-]?small|x[\s-]?large|2x[\s-]?large|3x[\s-]?large|extra\s+(?:small|large)|small|medium|large|xs|xl|xxl|xxxl)\b/gi, "")
    // shade tokens (A1..D4)
    .replace(/\b[a-dA-D][1-4](?:\.5)?\b/g, "")
    // cotton roll style words
    .replace(/\b(?:econo(?:my)?|braided|wrapped)\b/gi, "")
    // needle length words
    .replace(/\b(?:short|long)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–]\s*$/g, "")
    .replace(/\(\s*\)/g, "")
    .trim()
  return cleaned || name
}

function duplicateAwareLabel(member: Member, duplicateLabels: Set<string>): string {
  if (!duplicateLabels.has(member.variant.label)) {
    return member.variant.label
  }
  const packSize = mostCommon(member.cluster.members.map((m) => m.row.pack_size))
  return packSize ? `${member.variant.label} - ${packSize}` : member.variant.label
}

type Member = { cluster: Cluster; variant: ClusterVariant; tokenCount: number }

/**
 * Assign display families over the matcher's clusters. Returns one entry per
 * cluster that belongs to a multi-variant family, keyed by cluster.key.
 * Clusters absent from the map are standalone products (no selector).
 *
 * Precision over recall: a false split just shows two cards (today's behavior),
 * while a false merge shows a wrong size on a product, so grouping requires a
 * brand or a specific (>=3 token) name, distinct labels, and >=2 members.
 */
export function assignFamilies(clusters: Cluster[]): Map<number, FamilyInfo> {
  const groups = new Map<string, Member[]>()

  for (const cluster of clusters) {
    const variant = clusterVariant(cluster)
    if (!variant) {
      continue
    }
    const rep = cluster.representative
    const tokenCount = new Set(familyTokens(rep.coreTokens)).size
    if (tokenCount === 0) {
      continue
    }
    if (!rep.brandKey && tokenCount < 3) {
      // No brand and a generic short name — too weak to group safely.
      continue
    }
    const key = familyKey(rep, variant.axis)
    const list = groups.get(key)
    if (list) {
      list.push({ cluster, variant, tokenCount })
    } else {
      groups.set(key, [{ cluster, variant, tokenCount }])
    }
  }

  const result = new Map<number, FamilyInfo>()
  for (const [key, members] of groups) {
    if (members.length < 2) {
      continue
    }
    const distinctLabels = new Set(members.map((m) => m.variant.label))
    if (distinctLabels.size < 2) {
      continue
    }
    const duplicateLabels = new Set(
      [...distinctLabels].filter(
        (label) => members.filter((m) => m.variant.label === label).length > 1
      )
    )

    const familyId = stableId("mcpf", key)
    // Name from the lowest-rank member (e.g. the "Small"/smallest variant) for a
    // stable, deterministic title regardless of cluster iteration order.
    const naming = [...members].sort((a, b) => a.variant.rank - b.variant.rank)[0]
    const familyName = cleanFamilyName(naming.cluster.representative.row.name)
    const familyHandle = `${slugify(familyName)}-${familyId.slice(-6)}`

    for (const member of members) {
      result.set(member.cluster.key, {
        familyId,
        familyHandle,
        familyName,
        variantLabel: duplicateAwareLabel(member, duplicateLabels),
        variantRank: member.variant.rank,
        variantAxis: member.variant.axis,
      })
    }
  }

  return result
}
