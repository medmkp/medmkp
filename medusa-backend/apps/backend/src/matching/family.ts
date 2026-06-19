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

// Axes we will collapse into a selector, in the order we prefer to label by.
// Keys match extractNumericAttrs() unit keys.
const AXIS_PRIORITY = [
  "size", "shade", "taper", "#", "mm", "cm", "in", "ga", "ml", "cc", "oz", "gr", "kg", "lb", "l", "%",
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
    (token) => !SIZE_TOKENS.has(token) && !SHADE_TOKEN_RE.test(token)
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
  if (axis === "size") {
    return { label: SIZE_LABEL[value] ?? value, rank: SIZE_RANK[value] ?? 99 }
  }
  if (axis === "shade") {
    const upper = value.toUpperCase()
    const rank = upper.charCodeAt(0) * 10 + (parseFloat(upper.slice(1)) || 0)
    return { label: upper, rank }
  }
  if (axis === "taper") {
    return { label: `${value} Taper`, rank: parseFloat(value) || 0 }
  }
  if (axis === "#") {
    return { label: `#${value}`, rank: parseFloat(value) || 0 }
  }
  if (axis === "%") {
    return { label: `${value}%`, rank: parseFloat(value) || 0 }
  }
  const unit = axis === "ga" ? "ga" : axis
  return { label: `${value} ${unit}`, rank: parseFloat(value) || 0 }
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
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–]\s*$/g, "")
    .replace(/\(\s*\)/g, "")
    .trim()
  return cleaned || name
}

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
  type Member = { cluster: Cluster; variant: ClusterVariant; tokenCount: number }
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
        variantLabel: member.variant.label,
        variantRank: member.variant.rank,
        variantAxis: member.variant.axis,
      })
    }
  }

  return result
}
