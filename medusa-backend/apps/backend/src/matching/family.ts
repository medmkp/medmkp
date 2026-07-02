import { createHash } from "crypto"
import { AXIS_PRIORITY, axisLabelFor, COLOR_WORDS, formatVariant, isFamilyStripToken } from "./attribute-specs"
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

// The selector axes, their order, labels, ranks, and which name tokens to strip
// from the family key all come from the variant registry (attribute-specs.ts) so
// the catalog's variant selectors can never drift from the matcher's conflict
// axes. AXIS_PRIORITY / formatVariant / isFamilyStripToken are derived there.

function familyTokens(coreTokens: string[], axis: string): string[] {
  // Drop the tokens that vary THIS family's axis (glove "large", shade "A1",
  // cotton-roll "braided", mask "blue") so its variants share one key, while
  // keeping tokens that vary a different axis as identity. Measured/taper/"#"/bare
  // numbers never reach coreTokens, so only word-token axes need stripping.
  return coreTokens.filter((token) => !isFamilyStripToken(token, axis))
}

function familyKey(rep: NormalizedProduct, axis: string): string {
  const tokens = [...new Set(familyTokens(rep.coreTokens, axis))].sort().join(" ")
  return `${rep.brandKey ?? ""}|${tokens}|${axis}`
}

// Two brand keys can share a family when neither contradicts the other: an
// absent brand (an identity-only supplier that never tagged one) is unknown, not
// a conflict; two different stated brands are a hard conflict.
function brandsCompatible(a: string | null, b: string | null): boolean {
  return !a || !b || a === b
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
 * The cluster's single agreed value on one axis, or null. All members of a
 * cluster share the same modeled attributes (a conflict would have split them),
 * but some members may not state the value, so take the most common stated value
 * — and reject a cluster that carries two disjoint values unless exactly one is
 * unanimous (supplier copy that names a shade range plus the actual shade, e.g.
 * "A1-D4 ... Tab A2", leaves a one-off range value to ignore).
 */
function agreedAxisValue(cluster: Cluster, axis: string): string | null {
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
    return null
  }
  if (counts.size > 1) {
    const unanimous = [...counts.entries()]
      .filter(([, count]) => count === cluster.members.length)
      .map(([value]) => value)
    return unanimous.length === 1 ? unanimous[0] : null
  }
  return [...counts.keys()][0]
}

/**
 * The varying-attribute value for a whole cluster: the agreed value on the
 * highest-priority selector axis the cluster carries.
 */
function clusterVariant(cluster: Cluster): ClusterVariant | null {
  for (const axis of AXIS_PRIORITY) {
    const value = agreedAxisValue(cluster, axis)
    if (value !== null) {
      return { axis, value, ...formatVariant(axis, value) }
    }
  }
  return null
}

/** One modeled attribute persisted for a canonical product (Tier 2). */
export type ClusterAttribute = {
  axis: string
  value: string
  /** Display value, e.g. "Large", "25 mm", "A2". */
  label: string
  /** Human axis name, e.g. "Size", "Shade", "Gauge". */
  axisLabel: string
  /** True for the axis that varies across this product's family (the selector). */
  isVariantAxis: boolean
}

/**
 * Every agreed selector-axis value for a cluster, for the structured attribute
 * store. The highest-priority agreed axis is flagged `isVariantAxis` — it is the
 * same axis `clusterVariant()` turns into the family selector, so the catalog's
 * spec table and its variant selector stay consistent.
 */
export function clusterAttributes(cluster: Cluster): ClusterAttribute[] {
  const out: ClusterAttribute[] = []
  for (const axis of AXIS_PRIORITY) {
    const value = agreedAxisValue(cluster, axis)
    if (value === null) {
      continue
    }
    out.push({
      axis,
      value,
      label: formatVariant(axis, value).label,
      axisLabel: axisLabelFor(axis) ?? axis,
      isVariantAxis: out.length === 0,
    })
  }
  return out
}

/**
 * Strip the varying attribute from a representative product name so the family
 * gets a clean title ("Alasta Aloe Nitrile Glove Large 100/Box - Large" →
 * "Alasta Aloe Nitrile Glove 100/Box").
 */
function cleanFamilyName(name: string, axis: string): string {
  let cleaned = name
    // shade ranges in supplier helper copy ("A1-D4 Shade Guide") are context,
    // not the specific purchasable variant.
    .replace(/\b[a-dA-D][1-7](?:\.5)?\s*[-–/]\s*[a-dA-D][1-7](?:\.5)?\b/g, "")
    // trailing " - Large" / " - X-Small" appended size label
    .replace(/\s*[-–]\s*(x[\s-]?small|x[\s-]?large|2x[\s-]?large|3x[\s-]?large|extra\s+(?:small|large)|small|medium|large|xs|xl|xxl|xxxl)\s*$/i, "")
    // measured values with unit
    .replace(/\b\d+(?:\.\d+)?\s*(?:mm|cm|ml|cc|oz|gauge|ga|gr|kg|lb|in)\b/gi, "")
    // worded apparel sizes anywhere
    .replace(/\b(?:x[\s-]?small|x[\s-]?large|2x[\s-]?large|3x[\s-]?large|extra\s+(?:small|large)|small|medium|large|xs|xl|xxl|xxxl)\b/gi, "")
    // shade tokens (A1..D7)
    .replace(/\b[a-dA-D][1-7](?:\.5)?\b/g, "")
    .replace(/\s*[-–]\s*shade\s*$/i, "")
    // cotton roll style words
    .replace(/\b(?:econo(?:my)?|braided|wrapped)\b/gi, "")
    // needle length words
    .replace(/\b(?:short|long)\b/gi, "")
  // Color words are dropped only for a color family's title ("… Face Masks -
  // Blue" → "… Face Masks"). For a family whose variant is a different axis, the
  // color is fixed product identity (a "Blue Nitrile Glove" size family), so it
  // stays in the title.
  if (axis === "color") {
    cleaned = cleaned
      .replace(new RegExp(`\\s*[-–]\\s*(?:${COLOR_WORDS.join("|")})\\s*$`, "i"), "")
      .replace(new RegExp(`\\b(?:${COLOR_WORDS.join("|")})\\b`, "gi"), "")
  }
  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–]\s*$/g, "")
    .replace(/\(\s*\)/g, "")
    .trim()
  return cleaned || name
}

function familyNamePenalty(name: string): number {
  let score = 0
  if (name.includes(",")) {
    score += 10
  }
  if (/\b(?:ea|each)\b/i.test(name)) {
    score += 2
  }
  if (/\b(?:replacement|refill|tab|tabs)\b/i.test(name)) {
    score -= 2
  }
  return score
}

function clusterFamilyName(cluster: Cluster, axis: string): string {
  const candidates = cluster.members
    .map((member) => cleanFamilyName(member.row.name, axis))
    .filter(Boolean)
  candidates.sort((a, b) => {
    const score = familyNamePenalty(a) - familyNamePenalty(b)
    if (score !== 0) {
      return score
    }
    return b.length - a.length
  })
  return candidates[0] || cleanFamilyName(cluster.representative.row.name, axis)
}

type Member = { cluster: Cluster; variant: ClusterVariant; tokenCount: number }

// A product can vary on two axes (color AND size, taper AND length) while the
// family model captures only one, so members that agree on the selected axis but
// differ on a second share an indistinguishable chip. These patterns are the
// measured/size vocabulary the matcher already parses — dimensions, a single
// measure, worded sizes — and nothing else: a disambiguator built from them can
// surface the second differentiator but can never leak a SKU or shape code.
const DISAMBIGUATION_PATTERNS: RegExp[] = [
  /\d+(?:\.\d+)?\s?[x×]\s?\d+(?:\.\d+)?(?:\s?(?:mm|cm))?/gi,
  /\d+(?:\.\d+)?\s?(?:mm|cm|ml|cc|oz|gauge|ga|kg|lb|in)\b/gi,
  /\b(?:size|no\.?)\s?\d+[a-z]?\b/gi,
]

function measuredPhrases(name: string): string[] {
  const out: string[] = []
  for (const re of DISAMBIGUATION_PATTERNS) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(name))) {
      out.push(match[0].replace(/\s+/g, " ").trim())
    }
  }
  return out
}

const normalizePhrase = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, "").replace(/×/g, "x")

/**
 * A discriminator proposes, for a still-colliding subset of a family, the value
 * that tells those members apart (empty when it has nothing to say for a member).
 */
type Discriminator = (members: Member[], base: string) => Map<Member, string>

// 1. The next modeled selector axis (registry-driven) that carries >=2 distinct
//    agreed values across the subset — "0.04 Taper" + "· 21 mm".
const byNextAxis: Discriminator = (members, _base) => {
  const out = new Map<Member, string>()
  for (const axis of AXIS_PRIORITY) {
    if (axis === members[0].variant.axis) {
      continue
    }
    const values = members.map((member) => agreedAxisValue(member.cluster, axis))
    if (values.some((value) => value === null) || new Set(values).size < 2) {
      continue
    }
    members.forEach((member, i) => out.set(member, formatVariant(axis, values[i]!).label))
    return out
  }
  return out
}

// 2. A measured/size phrase in the name the model didn't capture as an axis
//    (disc dimensions, an instrument size) — "Orange" + "· Size 4". Only phrases
//    the whole subset doesn't share and the base label doesn't already carry.
const byMeasuredPhrase: Discriminator = (members, base) => {
  const lists = members.map((member) => measuredPhrases(member.cluster.representative.row.name))
  const counts = new Map<string, number>()
  for (const list of lists) {
    for (const phrase of new Set(list.map(normalizePhrase))) {
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
    }
  }
  const baseNorm = normalizePhrase(base)
  const out = new Map<Member, string>()
  members.forEach((member, i) => {
    const seen = new Set<string>()
    const parts: string[] = []
    for (const phrase of lists[i]) {
      const norm = normalizePhrase(phrase)
      if (counts.get(norm) === members.length || norm === baseNorm || baseNorm.includes(norm) || seen.has(norm)) {
        continue
      }
      seen.add(norm)
      parts.push(phrase)
    }
    if (parts.length) {
      out.set(member, parts.join(" "))
    }
  })
  return out
}

// 3. The pack size, the last-resort differentiator carried over from the
//    original disambiguator ("#331 · 10/Pkg" vs "· 100/Pkg").
const byPackSize: Discriminator = (members) => {
  const out = new Map<Member, string>()
  for (const member of members) {
    const pack = mostCommon(member.cluster.members.map((m) => m.row.pack_size))
    if (pack) {
      out.set(member, pack)
    }
  }
  return out
}

const DISCRIMINATORS: Discriminator[] = [byNextAxis, byMeasuredPhrase, byPackSize]

/**
 * Give each member of a colliding-label group (same selected-axis value) a
 * distinct label. A product can vary on two axes (color AND size, taper AND
 * length) while the family selects on one, so its variants share an
 * indistinguishable chip. Apply the discriminators in order, each only to the
 * members still colliding and only when it actually separates some of them, so
 * labels grow only as much as they must ("0.04 Taper · 25 mm", not more).
 * Members no discriminator can separate keep the bare label: their clusters are
 * genuinely indistinguishable here (an over-merge, #601), and a fabricated suffix
 * would misrepresent the product. A group of one — every single-axis family — is
 * returned byte-for-byte unchanged.
 */
function disambiguateGroup(base: string, group: Member[]): Map<Cluster, string> {
  const labels = group.map(() => base)
  for (const discriminate of DISCRIMINATORS) {
    const collisions = new Map<string, number[]>()
    labels.forEach((label, i) => {
      const list = collisions.get(label)
      if (list) {
        list.push(i)
      } else {
        collisions.set(label, [i])
      }
    })
    for (const indices of collisions.values()) {
      if (indices.length < 2) {
        continue
      }
      const values = discriminate(
        indices.map((i) => group[i]),
        base
      )
      // Only append when the value genuinely differs within the subset — never
      // add a suffix every colliding member shares (noise that can't help).
      if (new Set(indices.map((i) => values.get(group[i]) ?? "")).size < 2) {
        continue
      }
      for (const i of indices) {
        const value = values.get(group[i])
        if (value) {
          labels[i] = `${labels[i]} · ${value}`
        }
      }
    }
    if (new Set(labels).size === group.length) {
      break
    }
  }
  const out = new Map<Cluster, string>()
  group.forEach((member, i) => out.set(member.cluster, labels[i]))
  return out
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
  const groups = new Map<string, Member[]>()
  // Per-group identity (shared by every member, since the key encodes it): the
  // brand, the family token set, and the variant axis. Drives the bridge pass.
  const groupMeta = new Map<
    string,
    { brandKey: string | null; tokens: Set<string>; axis: string }
  >()

  for (const cluster of clusters) {
    const variant = clusterVariant(cluster)
    if (!variant) {
      continue
    }
    const rep = cluster.representative
    const tokens = new Set(familyTokens(rep.coreTokens, variant.axis))
    if (tokens.size === 0) {
      continue
    }
    if (!rep.brandKey && tokens.size < 3) {
      // No brand and a generic short name — too weak to group safely.
      continue
    }
    const key = familyKey(rep, variant.axis)
    const list = groups.get(key)
    if (list) {
      list.push({ cluster, variant, tokenCount: tokens.size })
    } else {
      groups.set(key, [{ cluster, variant, tokenCount: tokens.size }])
      groupMeta.set(key, { brandKey: rep.brandKey ?? null, tokens, axis: variant.axis })
    }
  }

  // Bridge: a verbose, single-supplier listing — marketing copy like "HALYARD
  // Purple Nitrile MAX Exam Gloves, Textured Palm/Fingertips, …, Large, 44994
  // (Case of 400)" — states every word of a clean variant family plus extra
  // descriptors, and an identity-only supplier often tags no brand or SKU. Its
  // exact token key therefore never equals the family's and it strands as a
  // one-off card. Re-home such an orphan into an ESTABLISHED family (>=2 members)
  // when that family's whole token set sits inside the orphan's name, the axes
  // match, the brands don't conflict, and the orphan supplies a NEW variant
  // value — the same precision signals the exact key encodes, minus word-for-word
  // equality. Targeting established families only widens a real family rather
  // than welding two lone listings into a speculative one.
  const orphanKeys = [...groups.entries()]
    .filter(([, members]) => members.length === 1)
    .map(([key]) => key)
  // Largest groups first (then key order) so the bridge is deterministic and an
  // orphan lands in the most-established family it fits.
  const targetKeys = [...groups.keys()].sort((a, b) => {
    const sizeDiff = groups.get(b)!.length - groups.get(a)!.length
    return sizeDiff !== 0 ? sizeDiff : a < b ? -1 : 1
  })
  for (const orphanKey of orphanKeys) {
    const orphanList = groups.get(orphanKey)
    if (!orphanList || orphanList.length !== 1) {
      continue
    }
    const orphan = orphanList[0]
    const orphanMeta = groupMeta.get(orphanKey)!
    const orphanCore = new Set(orphan.cluster.representative.coreTokens)
    for (const targetKey of targetKeys) {
      if (targetKey === orphanKey) {
        continue
      }
      const target = groups.get(targetKey)
      if (!target || target.length < 2) {
        continue
      }
      const targetMeta = groupMeta.get(targetKey)!
      if (targetMeta.axis !== orphanMeta.axis) {
        continue
      }
      if (!brandsCompatible(targetMeta.brandKey, orphanMeta.brandKey)) {
        continue
      }
      // Anchor on a specific (>=3 token) family so a generic two-word name can't
      // vacuum up unrelated listings, and require full containment.
      if (targetMeta.tokens.size < 3) {
        continue
      }
      if (![...targetMeta.tokens].every((token) => orphanCore.has(token))) {
        continue
      }
      if (target.some((member) => member.variant.value === orphan.variant.value)) {
        continue
      }
      target.push(orphan)
      groups.delete(orphanKey)
      break
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
    // Members that share a selected-axis value get an indistinguishable chip, so
    // extend each colliding group with the next distinguishing signal; a group of
    // one keeps its bare label. Two-axis products (color AND size, taper AND
    // length) are the driver — see disambiguateGroup.
    const labelByCluster = new Map<Cluster, string>()
    const byBaseLabel = new Map<string, Member[]>()
    for (const member of members) {
      const list = byBaseLabel.get(member.variant.label)
      if (list) {
        list.push(member)
      } else {
        byBaseLabel.set(member.variant.label, [member])
      }
    }
    for (const [base, group] of byBaseLabel) {
      for (const [cluster, label] of disambiguateGroup(base, group)) {
        labelByCluster.set(cluster, label)
      }
    }

    const familyId = stableId("mcpf", key)
    // Name from the lowest-rank member (e.g. the "Small"/smallest variant) for a
    // stable, deterministic title regardless of cluster iteration order.
    const naming = [...members].sort((a, b) => a.variant.rank - b.variant.rank)[0]
    const familyName = clusterFamilyName(naming.cluster, naming.variant.axis)
    const familyHandle = `${slugify(familyName)}-${familyId.slice(-6)}`

    for (const member of members) {
      result.set(member.cluster.key, {
        familyId,
        familyHandle,
        familyName,
        variantLabel: labelByCluster.get(member.cluster) ?? member.variant.label,
        variantRank: member.variant.rank,
        variantAxis: member.variant.axis,
      })
    }
  }

  return result
}
