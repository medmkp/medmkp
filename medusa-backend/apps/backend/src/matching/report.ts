import fs from "fs"
import path from "path"
import type { Cluster, MatchRunResult, NormalizedProduct } from "./types"

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function writeCsv(filePath: string, header: string[], rows: unknown[][]) {
  const lines = [header.join(",")]
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","))
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n")
}

function formatPrice(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2)
}

function htmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

type PriceComparison = {
  cluster: Cluster
  minUnitPrice: number
  maxUnitPrice: number
  spread: number
  /**
   * "parsed": every priced member has a parsed pack quantity.
   * "none": no member has one (raw prices compared as-is).
   * "mixed": only some members have one — per-unit comparison unreliable.
   */
  packCertainty: "parsed" | "none" | "mixed"
}

function priceComparisons(clusters: Cluster[]): PriceComparison[] {
  const comparisons: PriceComparison[] = []
  for (const cluster of clusters) {
    if (cluster.supplierCount < 2) {
      continue
    }
    const priced = cluster.members.filter(
      (member) => member.unitPriceCents !== null && member.unitPriceCents > 0
    )
    if (priced.length < 2) {
      continue
    }
    const prices = priced.map((member) => member.unitPriceCents!)
    const withPack = priced.filter((member) => member.packQty !== null).length
    const packCertainty = withPack === priced.length ? "parsed" : withPack === 0 ? "none" : "mixed"
    const minUnitPrice = Math.min(...prices)
    const maxUnitPrice = Math.max(...prices)
    comparisons.push({
      cluster,
      minUnitPrice,
      maxUnitPrice,
      spread: maxUnitPrice / minUnitPrice,
      packCertainty,
    })
  }
  return comparisons
}

function sample<T>(items: T[], count: number, seed = 42): T[] {
  const copy = [...items]
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

export function writeReports(result: MatchRunResult, outputDir: string): Record<string, unknown> {
  fs.mkdirSync(outputDir, { recursive: true })

  const multiSupplierClusters = result.clusters.filter((cluster) => cluster.supplierCount >= 2)
  const comparisons = priceComparisons(result.clusters)

  const memberRow = (cluster: Cluster, member: NormalizedProduct) => [
    cluster.key,
    member.row.supplier_id,
    member.row.brand,
    member.row.manufacturer_sku,
    member.row.name,
    member.row.pack_size,
    member.packQty ?? "",
    formatPrice(member.row.price_cents),
    formatPrice(member.unitPriceCents),
    member.row.product_url,
  ]
  const memberHeader = [
    "cluster",
    "supplier",
    "brand",
    "manufacturer_sku",
    "name",
    "pack_size",
    "parsed_pack_qty",
    "price",
    "unit_price",
    "url",
  ]

  const sampledClusters = sample(multiSupplierClusters, 150)
  writeCsv(
    path.join(outputDir, "match-groups-sample.csv"),
    memberHeader,
    sampledClusters.flatMap((cluster) => cluster.members.map((member) => memberRow(cluster, member)))
  )

  const comparisonRows = [...comparisons]
    .sort((a, b) => b.spread - a.spread)
    .map(({ cluster, minUnitPrice, maxUnitPrice, spread, packCertainty }) => [
      cluster.key,
      cluster.representative.row.name,
      cluster.supplierCount,
      cluster.members.length,
      formatPrice(minUnitPrice),
      formatPrice(maxUnitPrice),
      spread.toFixed(2),
      packCertainty,
    ])
  writeCsv(
    path.join(outputDir, "price-comparison.csv"),
    [
      "cluster",
      "name",
      "suppliers",
      "members",
      "min_unit_price",
      "max_unit_price",
      "spread_ratio",
      "pack_certainty",
    ],
    comparisonRows
  )

  writeCsv(
    path.join(outputDir, "needs-review-sample.csv"),
    ["supplier_a", "name_a", "sku_a", "supplier_b", "name_b", "sku_b", "confidence", "reason"],
    // Already a bounded reservoir sample — the engine no longer keeps the full
    // needs-review pair list in memory.
    result.reviewPairsSample.map((pair) => [
      pair.a.row.supplier_id,
      pair.a.row.name,
      pair.a.row.manufacturer_sku,
      pair.b.row.supplier_id,
      pair.b.row.name,
      pair.b.row.manufacturer_sku,
      pair.decision.confidence,
      pair.decision.reason,
    ])
  )

  const clusterByKey = new Map(result.clusters.map((cluster) => [cluster.key, cluster]))
  const familyEntries = [...result.families.entries()]
  const familyIds = new Set(familyEntries.map(([, family]) => family.familyId))
  const familyAxisCounts: Record<string, number> = {}
  for (const [, family] of familyEntries) {
    familyAxisCounts[family.variantAxis] = (familyAxisCounts[family.variantAxis] ?? 0) + 1
  }

  writeCsv(
    path.join(outputDir, "families-sample.csv"),
    ["family_id", "family_name", "variant_axis", "variant_label", "cluster", "representative_name"],
    sample(familyEntries, 200).map(([clusterKey, family]) => {
      const cluster = clusterByKey.get(clusterKey)!
      return [
        family.familyId,
        family.familyName,
        family.variantAxis,
        family.variantLabel,
        clusterKey,
        cluster.representative.row.name,
      ]
    })
  )

  writeCsv(
    path.join(outputDir, "substitutes-sample.csv"),
    [
      "cluster",
      "cluster_name",
      "cluster_best_unit_price",
      "substitute_supplier",
      "substitute_brand",
      "substitute_name",
      "substitute_unit_price",
      "type_similarity",
      "confidence",
    ],
    sample(result.substitutes, 200).map((substitute) => {
      const cluster = clusterByKey.get(substitute.clusterKey)!
      const clusterPrices = cluster.members
        .map((member) => member.unitPriceCents)
        .filter((price): price is number => price !== null)
      return [
        substitute.clusterKey,
        cluster.representative.row.name,
        formatPrice(clusterPrices.length ? Math.min(...clusterPrices) : null),
        substitute.product.row.supplier_id,
        substitute.product.row.brand,
        substitute.product.row.name,
        formatPrice(substitute.product.unitPriceCents),
        substitute.typeSim.toFixed(2),
        substitute.confidence,
      ]
    })
  )

  writeHtmlReport(result, sampledClusters, comparisons, outputDir)

  const reliable = comparisons.filter((comparison) => comparison.packCertainty !== "mixed")
  const spreads = reliable.map((comparison) => comparison.spread).sort((a, b) => a - b)
  const summary = {
    generated_at: new Date().toISOString(),
    total_products: result.products.length,
    candidate_pairs: result.pairStats.candidatePairs,
    accepted_pairs: result.pairStats.acceptedCount,
    needs_review_pairs: result.pairStats.reviewCount,
    clusters_total: result.clusters.length,
    clusters_multi_supplier: multiSupplierClusters.length,
    products_in_multi_supplier_clusters: multiSupplierClusters.reduce(
      (total, cluster) => total + cluster.members.length,
      0
    ),
    families_total: familyIds.size,
    products_in_families: familyEntries.length,
    family_axis_counts: familyAxisCounts,
    substitute_candidates: result.substitutes.length,
    accepted_pair_confidence_histogram: result.pairStats.confidenceBuckets,
    cross_supplier_pair_counts: result.pairStats.crossSupplierPairCounts,
    price_comparisons: comparisons.length,
    price_comparisons_mixed_pack: comparisons.length - reliable.length,
    price_spread_median: spreads.length ? spreads[Math.floor(spreads.length / 2)].toFixed(2) : null,
    price_spread_over_3x: spreads.filter((spread) => spread > 3).length,
  }
  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2))
  return summary
}

function writeHtmlReport(
  result: MatchRunResult,
  sampledClusters: Cluster[],
  comparisons: PriceComparison[],
  outputDir: string
) {
  const comparisonByCluster = new Map(comparisons.map((comparison) => [comparison.cluster.key, comparison]))
  const substitutesByCluster = new Map<number, typeof result.substitutes>()
  for (const substitute of result.substitutes) {
    if (!substitutesByCluster.has(substitute.clusterKey)) {
      substitutesByCluster.set(substitute.clusterKey, [])
    }
    substitutesByCluster.get(substitute.clusterKey)!.push(substitute)
  }

  const sections = sampledClusters.slice(0, 80).map((cluster) => {
    const comparison = comparisonByCluster.get(cluster.key)
    const spreadNote = comparison
      ? `<span class="spread">unit price $${(comparison.minUnitPrice / 100).toFixed(2)} – $${(
          comparison.maxUnitPrice / 100
        ).toFixed(2)} (${comparison.spread.toFixed(1)}x)</span>`
      : ""
    const rows = cluster.members
      .map(
        (member) => `<tr>
          <td>${htmlEscape(member.row.supplier_id.replace("msup_", "").replace(/_/g, "."))}</td>
          <td>${htmlEscape(member.row.brand)}</td>
          <td>${htmlEscape(member.row.manufacturer_sku)}</td>
          <td><a href="${htmlEscape(member.row.product_url)}" target="_blank">${htmlEscape(member.row.name)}</a></td>
          <td>${htmlEscape(member.row.pack_size)}${member.packQty ? ` (×${member.packQty})` : ""}</td>
          <td class="num">${member.row.price_cents !== null ? "$" + (member.row.price_cents / 100).toFixed(2) : ""}</td>
          <td class="num">${member.unitPriceCents !== null ? "$" + (member.unitPriceCents / 100).toFixed(2) : ""}</td>
        </tr>`
      )
      .join("\n")
    const subs = (substitutesByCluster.get(cluster.key) ?? [])
      .map(
        (substitute) => `<tr class="sub">
          <td>${htmlEscape(substitute.product.row.supplier_id.replace("msup_", "").replace(/_/g, "."))}</td>
          <td>${htmlEscape(substitute.product.row.brand)}</td>
          <td>${htmlEscape(substitute.product.row.manufacturer_sku)}</td>
          <td><a href="${htmlEscape(substitute.product.row.product_url)}" target="_blank">${htmlEscape(
            substitute.product.row.name
          )}</a> <em>substitute (sim ${substitute.typeSim.toFixed(2)})</em></td>
          <td>${htmlEscape(substitute.product.row.pack_size)}</td>
          <td class="num"></td>
          <td class="num">${
            substitute.product.unitPriceCents !== null
              ? "$" + (substitute.product.unitPriceCents / 100).toFixed(2)
              : ""
          }</td>
        </tr>`
      )
      .join("\n")
    return `<section>
      <h3>#${cluster.key} — ${htmlEscape(cluster.representative.row.name)} ${spreadNote}</h3>
      <table>
        <thead><tr><th>Supplier</th><th>Brand</th><th>Mfr SKU</th><th>Name</th><th>Pack</th><th>Price</th><th>Unit</th></tr></thead>
        <tbody>${rows}${subs}</tbody>
      </table>
    </section>`
  })

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>MedMKP Match Review</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 2rem; color: #1a1a2e; }
  h1 { font-size: 1.4rem; }
  section { margin-bottom: 1.5rem; border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem 1rem; }
  h3 { margin: 0 0 0.5rem; font-size: 0.95rem; }
  .spread { color: #0a7d33; font-weight: normal; font-size: 0.85rem; margin-left: 0.5rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
  th, td { text-align: left; padding: 3px 8px; border-bottom: 1px solid #eee; }
  td.num { text-align: right; white-space: nowrap; }
  tr.sub { background: #fffbe8; }
  a { color: #1849c6; text-decoration: none; }
  em { color: #8a6d00; font-style: normal; font-size: 0.78rem; }
</style></head>
<body>
<h1>MedMKP canonical match review — ${sampledClusters.length} sampled groups</h1>
<p>Every table is one canonical product group the matcher believes is the same item across suppliers.
Yellow rows are cheaper substitute candidates. Verify by eye: same item, same size/shade/gauge, sane prices.</p>
${sections.join("\n")}
</body></html>`
  fs.writeFileSync(path.join(outputDir, "review.html"), html)
}
