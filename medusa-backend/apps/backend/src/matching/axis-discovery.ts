import { isFamilyStripToken } from "./attribute-specs"
import { clusterAttributes } from "./family"
import type { Cluster, FamilyInfo } from "./types"

// ---------------------------------------------------------------------------
// Variant-axis discovery (Tier 3, candidate finding)
//
// The registry (attribute-specs.ts) only models variant axes someone has added.
// This finds the GAPS: groups of same-brand canonical products whose names are
// identical except for one token the registry does NOT recognize as an
// attribute — the tell-tale of an unmodeled variant axis (e.g. several
// "<brand> Irrigation Tip" canonicals differing only by "french6" / "french8",
// which the matcher kept as separate cards because no rule captured French size).
//
// This is the deterministic half: it proposes nothing on its own, it surfaces
// candidate groups for the LLM (llm.ts) to name and a human to confirm into a
// registry entry. It is intentionally permissive — precision comes from the LLM
// + human review downstream, so a noisy candidate is cheap (it gets rejected),
// while a missed one is the gap we are trying to close.
// ---------------------------------------------------------------------------

export type AxisCandidate = {
  /** Canonical brand key shared by the group ("" when brandless). */
  brandKey: string
  /** Common core tokens — the product line the variants share. */
  stem: string[]
  /** The distinct unmodeled tokens that vary across the group (>= 2). These are
   * the proposed axis's values. */
  values: string[]
  /** Cluster keys in the group (one per variant). */
  clusterKeys: number[]
  clusterCount: number
  /** Distinct suppliers across the whole group — a proxy for real catalog impact. */
  supplierCount: number
  /** One representative product name per cluster (capped), for the LLM + report. */
  exampleNames: string[]
}

export type FindAxisCandidatesOptions = {
  /** Minimum shared (stem) tokens for a group to count as one product line. */
  minStem?: number
  /** Minimum distinct canonicals (variants) in a group. */
  minClusters?: number
  /** Cap on example names carried per candidate. */
  maxNames?: number
}

/** Union of every modeled attribute VALUE a cluster's members carry, so a
 * differing token that is already an extracted attribute (a color, a shade…) is
 * not mistaken for an unmodeled axis. */
function modeledValues(cluster: Cluster): Set<string> {
  const values = new Set<string>()
  for (const member of cluster.members) {
    for (const set of member.numericAttrs.values()) {
      for (const value of set) {
        values.add(value)
      }
    }
  }
  return values
}

/** Core tokens that the registry does not already account for — neither a
 * selector-axis token (size/shade/…) nor an extracted attribute value. */
function unmodeledCoreTokens(cluster: Cluster): string[] {
  const modeled = modeledValues(cluster)
  return [...new Set(cluster.representative.coreTokens)].filter(
    (token) => !isFamilyStripToken(token) && !modeled.has(token)
  )
}

function distinctSupplierCount(clusters: Cluster[]): number {
  const suppliers = new Set<string>()
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      suppliers.add(member.row.supplier_id)
    }
  }
  return suppliers.size
}

/**
 * Find groups of canonicals that look like one product line split across an
 * unmodeled variant axis. A cluster is a candidate member when it has no
 * selector axis yet (clusterAttributes empty) and is not already a family. Two
 * such clusters belong together when their unmodeled core tokens are identical
 * except for exactly one token each — the "leave-one-out" stem matches and the
 * left-out tokens become the proposed axis values.
 */
export function findAxisCandidates(
  clusters: Cluster[],
  families: Map<number, FamilyInfo>,
  options: FindAxisCandidatesOptions = {}
): AxisCandidate[] {
  const minStem = options.minStem ?? 2
  const minClusters = options.minClusters ?? 2
  const maxNames = options.maxNames ?? 8

  // brand||stem  ->  per-cluster left-out token (the cluster's varying value)
  const groups = new Map<string, Map<number, { cluster: Cluster; value: string }>>()

  for (const cluster of clusters) {
    if (families.has(cluster.key)) {
      continue // already grouped into a variant family
    }
    if (clusterAttributes(cluster).length > 0) {
      continue // already has a modeled selector axis
    }
    const core = unmodeledCoreTokens(cluster)
    // Need a stem PLUS at least one token that could be the varying value.
    if (core.length < minStem + 1) {
      continue
    }
    const brand = cluster.representative.brandKey ?? ""
    for (const value of core) {
      const stem = core.filter((token) => token !== value).sort()
      if (stem.length < minStem) {
        continue
      }
      const sig = `${brand}||${stem.join(" ")}`
      let bucket = groups.get(sig)
      if (!bucket) {
        bucket = new Map()
        groups.set(sig, bucket)
      }
      // One varying value per cluster per stem (first wins — deterministic).
      if (!bucket.has(cluster.key)) {
        bucket.set(cluster.key, { cluster, value })
      }
    }
  }

  const candidates: AxisCandidate[] = []
  for (const [sig, bucket] of groups) {
    if (bucket.size < minClusters) {
      continue
    }
    const entries = [...bucket.values()]
    const values = [...new Set(entries.map((e) => e.value))].sort()
    if (values.length < 2) {
      continue // the "variants" don't actually differ on this stem
    }
    const stem = sig.split("||")[1]?.split(" ").filter(Boolean) ?? []
    const memberClusters = entries.map((e) => e.cluster)
    candidates.push({
      brandKey: sig.split("||")[0] ?? "",
      stem,
      values,
      clusterKeys: memberClusters.map((c) => c.key),
      clusterCount: bucket.size,
      supplierCount: distinctSupplierCount(memberClusters),
      exampleNames: memberClusters
        .slice(0, maxNames)
        .map((c) => c.representative.row.name),
    })
  }

  // Strongest first: most variants, then widest supplier spread. A product line
  // carried by many suppliers across many sizes is the highest-value gap.
  return candidates.sort(
    (a, b) =>
      b.clusterCount - a.clusterCount ||
      b.supplierCount - a.supplierCount ||
      b.values.length - a.values.length
  )
}
