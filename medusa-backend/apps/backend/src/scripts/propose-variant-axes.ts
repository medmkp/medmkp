import fs from "fs"
import path from "path"
import { Client } from "pg"
import { MODELED_SPEC_IDS } from "../matching/attribute-specs"
import { findAxisCandidates, type AxisCandidate } from "../matching/axis-discovery"
import { loadSupplierProducts } from "../matching/db"
import { runMatching } from "../matching/engine"
import {
  claudeCliRunner,
  proposeAxis,
  type AxisProposal,
  type ModelRunner,
} from "../matching/llm"
import { normalizeProduct } from "../matching/normalize"

// ---------------------------------------------------------------------------
// products:propose-axes — Tier 3 variant-axis discovery
//
// Finds same-brand canonicals that look like one product line split across an
// unmodeled variant axis, asks Claude to name that axis, and writes a review
// report of proposed registry entries. READ-ONLY: never writes the DB or the
// registry. The LLM call uses the headless `claude` CLI (logged-in subscription,
// no API key) — run this where `claude` is authenticated (your machine or the
// NUC), exactly like the eng-loop.
//
//   ts-node ./src/scripts/propose-variant-axes.ts [--limit N] [--min-clusters N]
//                                                 [--model haiku] [--stub]
//                                                 [--input candidates.json]
//                                                 [--out <dir>]
//
//   --stub   skip the LLM; emit a deterministic placeholder proposal per
//            candidate (for exercising the pipeline without spending tokens).
//   --input  read AxisCandidate[] from a JSON file instead of matching the DB
//            (offline / testing). Otherwise loads + matches the read-only prod DB.
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : undefined
}
function flag(name: string): boolean {
  return process.argv.includes(name)
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  const envPath = path.resolve(__dirname, "../../.env")
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const match = line.match(/^DATABASE_URL=(.+)$/)
      if (match) {
        return match[1].trim()
      }
    }
  }
  throw new Error("DATABASE_URL is not set and could not be read from .env")
}

async function loadCandidates(minClusters: number): Promise<AxisCandidate[]> {
  const inputPath = arg("--input")
  if (inputPath) {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"))
    if (!Array.isArray(parsed)) {
      throw new Error("--input must be a JSON array of AxisCandidate")
    }
    return parsed as AxisCandidate[]
  }

  const databaseUrl = resolveDatabaseUrl()
  const client = new Client({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
    keepAlive: true,
    keepAliveInitialDelayMillis: 30000,
  })
  await client.connect()
  try {
    console.log("Loading supplier products (read-only)...")
    const rows = await loadSupplierProducts(client)
    console.log(`Loaded ${rows.length} supplier products. Matching...`)
    const result = runMatching(rows.map(normalizeProduct))
    console.log(`Matched ${result.clusters.length} clusters. Scanning for unmodeled axes...`)
    return findAxisCandidates(result.clusters, result.families, { minClusters })
  } finally {
    await client.end()
  }
}

/** Deterministic stand-in for the LLM, so --stub exercises the whole pipeline. */
const stubRunner: ModelRunner = async ({ user }) => {
  const brand = /^Brand:\s*(.*)$/m.exec(user)?.[1] ?? ""
  const stem = /^Shared words:\s*(.*)$/m.exec(user)?.[1] ?? ""
  const values = (/^Tokens that vary across the set:\s*(.*)$/m.exec(user)?.[1] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
  const id = `${brand} ${stem}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "proposed_axis"
  return JSON.stringify({
    is_variant_axis: true,
    axis_id: `${id}_variant`,
    axis_label: "Variant",
    gate_keywords: stem.split(/\s+/).filter(Boolean),
    value_map: values.map((value) => ({ name: value, value })),
    confidence: 0.4,
    reasoning: "stub proposal (no model call)",
  })
}

function specSketch(p: AxisProposal): string {
  const gate = p.gateKeywords.length
    ? p.gateKeywords.map((k) => `/\\b${k}\\b/.test(lowered)`).join(" && ")
    : "/* gate */"
  return [
    "```ts",
    "{",
    `  id: ${JSON.stringify(p.axisId)},`,
    "  extract: ({ lowered }) => {",
    `    if (!(${gate})) return []`,
    "    // TODO: capture the value with a regex over `lowered`",
    `    return [] // [[${JSON.stringify(p.axisId)}, value]]`,
    "  },",
    "  // optional — make it a catalog selector:",
    `  // family: { ${JSON.stringify(p.axisId)}: { priority: 99, axisLabel: ${JSON.stringify(p.axisLabel)}, label: (v) => v, rank: () => 0 } },`,
    "}",
    "```",
  ].join("\n")
}

function renderReport(items: Array<{ candidate: AxisCandidate; proposal: AxisProposal }>): string {
  const lines: string[] = [
    "# Proposed variant axes",
    "",
    "Candidates the matcher left ungrouped that look like one product line across an",
    "unmodeled variant axis. Review each; to accept, add a `VariantSpec` to",
    "`src/matching/attribute-specs.ts` (sketch below) and re-run `products:match`.",
    "",
    `Generated ${items.length} proposal(s).`,
    "",
  ]
  for (const { candidate, proposal } of items) {
    lines.push(
      `## ${proposal.axisLabel || "(unnamed)"} \`${proposal.axisId}\` — confidence ${proposal.confidence.toFixed(2)}`,
      "",
      `- Brand: **${candidate.brandKey || "(unbranded)"}** · ${candidate.clusterCount} variants · ${candidate.supplierCount} suppliers`,
      `- Gate keywords: ${proposal.gateKeywords.join(", ") || "—"}`,
      `- Values: ${candidate.values.join(", ")}`,
      `- Why: ${proposal.reasoning}`,
      "",
      "Examples:",
      ...candidate.exampleNames.map((n) => `  - ${n}`),
      "",
      specSketch(proposal),
      "",
    )
  }
  return lines.join("\n")
}

async function main() {
  const limit = Number(arg("--limit") ?? 25)
  const minClusters = Number(arg("--min-clusters") ?? 2)
  const model = arg("--model") || "haiku"
  const useStub = flag("--stub")
  const outDir = path.resolve(arg("--out") ?? path.resolve(__dirname, "../../.medmkp/variant-proposals"))

  const candidates = (await loadCandidates(minClusters)).slice(0, limit)
  console.log(`Found ${candidates.length} candidate group(s)${useStub ? " (stub mode)" : ""}.`)

  const runner = useStub ? stubRunner : claudeCliRunner()
  const kept: Array<{ candidate: AxisCandidate; proposal: AxisProposal }> = []
  for (const [i, candidate] of candidates.entries()) {
    const { proposal, error } = await proposeAxis(candidate, { modeledAxes: MODELED_SPEC_IDS, model, runner })
    const label = `${candidate.brandKey || "?"} | ${candidate.stem.join(" ")}`
    if (error || !proposal) {
      console.log(`  [${i + 1}/${candidates.length}] ${label} — skipped (${error ?? "no proposal"})`)
      continue
    }
    if (!proposal.isVariantAxis) {
      console.log(`  [${i + 1}/${candidates.length}] ${label} — not a variant axis`)
      continue
    }
    if (MODELED_SPEC_IDS.includes(proposal.axisId)) {
      console.log(`  [${i + 1}/${candidates.length}] ${label} — already modeled (${proposal.axisId})`)
      continue
    }
    console.log(`  [${i + 1}/${candidates.length}] ${label} → ${proposal.axisLabel} (${proposal.axisId})`)
    kept.push({ candidate, proposal })
  }

  kept.sort((a, b) => b.proposal.confidence - a.proposal.confidence)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, "proposals.md"), renderReport(kept))
  fs.writeFileSync(path.join(outDir, "proposals.json"), JSON.stringify(kept, null, 2))
  console.log(`\n${kept.length} proposal(s) written to ${outDir}/proposals.md`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
