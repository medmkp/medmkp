import { execFile } from "child_process"
import { promisify } from "util"
import type { AxisCandidate } from "./axis-discovery"

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// LLM axis proposer (Tier 3)
//
// Names the unmodeled variant axis behind a candidate group. Drives the `claude`
// CLI in headless print mode (`claude -p --output-format json`), which uses the
// logged-in Claude subscription — no ANTHROPIC_API_KEY. (Same way the eng-loop
// runs Claude on the NUC.) The model's only job is classification: given a set of
// near-identical product names, say what single attribute distinguishes them, or
// say it's not a clean variant axis. Nothing here writes to the registry or DB —
// the output is a proposal for human review.
// ---------------------------------------------------------------------------

export type AxisProposal = {
  /** True only when these are genuinely variants of one product on a single
   * axis. False when they are different products, or already the same. */
  isVariantAxis: boolean
  /** snake_case registry id, e.g. "irrigation_tip_french_size". */
  axisId: string
  /** Human label for the selector, e.g. "French Size". */
  axisLabel: string
  /** Lowercase name keywords that gate the axis (the spec's appliesWhen). */
  gateKeywords: string[]
  /** Per-product extracted value, e.g. [{name, value:"fr6"}]. */
  valueMap: Array<{ name: string; value: string }>
  /** 0..1 self-rated confidence. */
  confidence: number
  reasoning: string
}

/** A function that returns the model's raw text reply for a (system,user) pair.
 * Injected so the pipeline is testable without spawning `claude`. */
export type ModelRunner = (input: {
  system: string
  user: string
  model: string
}) => Promise<string>

const SYSTEM_PROMPT = [
  "You classify dental-product catalog variants.",
  "You are given several product names that share a brand and most of their words.",
  "Decide whether they are the SAME product offered in variants along ONE attribute",
  "(e.g. size, gauge, length, material, flavor, tip diameter), versus genuinely",
  "different products or the same item duplicated.",
  "",
  "Some attributes are ALREADY modeled by the catalog and must NOT be proposed again;",
  "they are listed in the user message. If the only thing varying is already modeled,",
  "or the items are not a clean single-axis variant set, return is_variant_axis=false.",
  "",
  "Respond with ONE JSON object and nothing else, matching exactly:",
  "{",
  '  "is_variant_axis": boolean,',
  '  "axis_id": string,            // snake_case, e.g. "irrigation_tip_french_size"',
  '  "axis_label": string,         // human label, e.g. "French Size"',
  '  "gate_keywords": string[],    // lowercase name words that identify this product type',
  '  "value_map": [{ "name": string, "value": string }],  // each input name -> its variant value',
  '  "confidence": number,         // 0..1',
  '  "reasoning": string           // one sentence',
  "}",
  "When is_variant_axis is false, still return the object with empty axis fields.",
].join("\n")

export function buildUserPrompt(candidate: AxisCandidate, modeledAxes: string[]): string {
  return [
    `Brand: ${candidate.brandKey || "(unbranded)"}`,
    `Shared words: ${candidate.stem.join(" ") || "(none)"}`,
    `Tokens that vary across the set: ${candidate.values.join(", ")}`,
    "",
    "Already-modeled axes (do NOT propose these):",
    modeledAxes.join(", "),
    "",
    "Product names:",
    ...candidate.exampleNames.map((name, i) => `${i + 1}. ${name}`),
  ].join("\n")
}

/** Pull the JSON object out of a model reply that may be fenced or chatty. */
export function parseProposal(text: string): AxisProposal | null {
  if (!text) {
    return null
  }
  // Prefer a fenced ```json block; else the first {...} span.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end <= start) {
    return null
  }
  let raw: any
  try {
    raw = JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof raw !== "object" || raw === null || typeof raw.is_variant_axis !== "boolean") {
    return null
  }
  return {
    isVariantAxis: raw.is_variant_axis,
    axisId: typeof raw.axis_id === "string" ? raw.axis_id : "",
    axisLabel: typeof raw.axis_label === "string" ? raw.axis_label : "",
    gateKeywords: Array.isArray(raw.gate_keywords)
      ? raw.gate_keywords.filter((k: unknown): k is string => typeof k === "string")
      : [],
    valueMap: Array.isArray(raw.value_map)
      ? raw.value_map
          .filter((v: any) => v && typeof v.name === "string" && typeof v.value === "string")
          .map((v: any) => ({ name: v.name, value: v.value }))
      : [],
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
  }
}

/** Default runner: invoke the headless `claude` CLI (uses the logged-in
 * subscription). Throws a clear error on auth/CLI failure so the caller can
 * skip the candidate rather than abort the whole run. */
export function claudeCliRunner(claudeBin = process.env.CLAUDE_BIN || "claude"): ModelRunner {
  return async ({ system, user, model }) => {
    const { stdout } = await execFileAsync(
      claudeBin,
      ["-p", user, "--output-format", "json", "--model", model, "--append-system-prompt", system],
      { maxBuffer: 8 * 1024 * 1024, timeout: 120_000 }
    )
    const envelope = JSON.parse(stdout)
    if (envelope.is_error) {
      throw new Error(
        `claude CLI error${envelope.api_error_status ? ` (${envelope.api_error_status})` : ""}: ${envelope.result ?? "unknown"}`
      )
    }
    return typeof envelope.result === "string" ? envelope.result : ""
  }
}

export type ProposeOptions = {
  modeledAxes: string[]
  model?: string
  runner?: ModelRunner
}

/** Propose the axis behind one candidate. Returns { proposal } on success, or
 * { error } when the model call or parse fails (so the caller logs + continues). */
export async function proposeAxis(
  candidate: AxisCandidate,
  options: ProposeOptions
): Promise<{ proposal: AxisProposal | null; error?: string }> {
  const runner = options.runner ?? claudeCliRunner()
  const model = options.model || "haiku"
  const user = buildUserPrompt(candidate, options.modeledAxes)
  try {
    const text = await runner({ system: SYSTEM_PROMPT, user, model })
    const proposal = parseProposal(text)
    return proposal ? { proposal } : { proposal: null, error: "unparseable model reply" }
  } catch (error) {
    return { proposal: null, error: error instanceof Error ? error.message : String(error) }
  }
}
