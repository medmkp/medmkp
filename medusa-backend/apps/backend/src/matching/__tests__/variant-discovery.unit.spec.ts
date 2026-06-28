import { findAxisCandidates } from "../axis-discovery"
import { buildUserPrompt, parseProposal, proposeAxis } from "../llm"
import { normalizeProduct } from "../normalize"
import type { Cluster, SupplierProductRow } from "../types"

let nextId = 0
function product(partial: Partial<SupplierProductRow>): SupplierProductRow {
  nextId += 1
  return {
    id: `msp_${nextId}`, supplier_id: "msup_a_com", sku: "", manufacturer_sku: "",
    brand: "", name: "", category: "", pack_size: "", unit_of_measure: "",
    product_url: "", image_url: "", price_cents: null, price_basis: null, ...partial,
  }
}

// A canonical = a 2-supplier cluster carrying one name/brand.
function cluster(key: number, brand: string, name: string): Cluster {
  const members = [
    normalizeProduct(product({ brand, name, supplier_id: "msup_a_com" })),
    normalizeProduct(product({ brand, name, supplier_id: "msup_b_com" })),
  ]
  return { key, contentKey: `c-${key}`, members, representative: members[0], supplierCount: 2 }
}

describe("findAxisCandidates (Tier 3 discovery)", () => {
  it("surfaces an unmodeled product-line axis as one candidate", () => {
    // Same brand, same stem ("endo sealer"), differing only by an unmodeled token.
    const clusters = [
      cluster(1, "Acme", "Acme Endo Sealer Cruise"),
      cluster(2, "Acme", "Acme Endo Sealer Voyage"),
      cluster(3, "Acme", "Acme Endo Sealer Journey"),
    ]
    const candidates = findAxisCandidates(clusters, new Map())
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      brandKey: "acme",
      stem: ["endo", "sealer"],
      values: ["cruise", "journey", "voyage"],
      clusterCount: 3,
      supplierCount: 2,
    })
    expect(candidates[0].exampleNames).toContain("Acme Endo Sealer Cruise")
  })

  it("ignores groups whose only difference is an already-modeled axis", () => {
    // Size is a registry axis → clusterAttributes is non-empty → skipped.
    const sized = [
      cluster(1, "Acme", "Acme Nitrile Glove Small"),
      cluster(2, "Acme", "Acme Nitrile Glove Large"),
    ]
    expect(findAxisCandidates(sized, new Map())).toHaveLength(0)

    // Color is modeled (conflict-only): the differing token is an extracted
    // attribute value, so it is not mistaken for an unmodeled axis.
    const colored = [
      cluster(3, "Acme", "Acme Bib Clip Red"),
      cluster(4, "Acme", "Acme Bib Clip Blue"),
    ]
    expect(findAxisCandidates(colored, new Map())).toHaveLength(0)
  })

  it("requires at least two distinct varying values", () => {
    const clusters = [
      cluster(1, "Acme", "Acme Endo Sealer Cruise"),
      cluster(2, "Acme", "Acme Endo Sealer Cruise Refill Pack"),
    ]
    // Only one of them carries a distinct extra token → no clean 2-value axis.
    expect(findAxisCandidates(clusters, new Map())).toHaveLength(0)
  })

  it("skips clusters already grouped into a family", () => {
    const clusters = [
      cluster(1, "Acme", "Acme Endo Sealer Cruise"),
      cluster(2, "Acme", "Acme Endo Sealer Voyage"),
    ]
    const families = new Map([[1, {} as any]]) // cluster 1 already a family member
    expect(findAxisCandidates(clusters, families)).toHaveLength(0)
  })
})

describe("LLM proposer parsing", () => {
  const valid = JSON.stringify({
    is_variant_axis: true, axis_id: "endo_sealer_line", axis_label: "Line",
    gate_keywords: ["endo", "sealer"], value_map: [{ name: "Acme Endo Sealer Cruise", value: "cruise" }],
    confidence: 0.8, reasoning: "distinct product lines",
  })

  it("parses a bare JSON object", () => {
    expect(parseProposal(valid)).toMatchObject({ isVariantAxis: true, axisId: "endo_sealer_line", confidence: 0.8 })
  })

  it("parses a fenced and chatty reply", () => {
    expect(parseProposal("Sure!\n```json\n" + valid + "\n```\nHope that helps")).toMatchObject({
      axisLabel: "Line",
      gateKeywords: ["endo", "sealer"],
    })
  })

  it("returns null on malformed or non-conforming replies", () => {
    expect(parseProposal("not json at all")).toBeNull()
    expect(parseProposal("{ broken")).toBeNull()
    expect(parseProposal(JSON.stringify({ axis_id: "x" }))).toBeNull() // missing is_variant_axis
  })

  it("buildUserPrompt includes the brand, stem, values and names", () => {
    const prompt = buildUserPrompt(
      { brandKey: "acme", stem: ["endo", "sealer"], values: ["cruise", "voyage"], clusterKeys: [1, 2], clusterCount: 2, supplierCount: 2, exampleNames: ["Acme Endo Sealer Cruise"] },
      ["shade", "color"]
    )
    expect(prompt).toContain("Brand: acme")
    expect(prompt).toContain("cruise, voyage")
    expect(prompt).toContain("Already-modeled axes")
    expect(prompt).toContain("1. Acme Endo Sealer Cruise")
  })

  it("proposeAxis surfaces a runner error instead of throwing", async () => {
    const result = await proposeAxis(
      { brandKey: "acme", stem: ["endo"], values: ["a", "b"], clusterKeys: [1, 2], clusterCount: 2, supplierCount: 2, exampleNames: [] },
      { modeledAxes: [], runner: async () => { throw new Error("401 Invalid authentication credentials") } }
    )
    expect(result.proposal).toBeNull()
    expect(result.error).toMatch(/401/)
  })

  it("proposeAxis returns the parsed proposal from an injected runner", async () => {
    const result = await proposeAxis(
      { brandKey: "acme", stem: ["endo", "sealer"], values: ["cruise", "voyage"], clusterKeys: [1, 2], clusterCount: 2, supplierCount: 2, exampleNames: [] },
      { modeledAxes: [], runner: async () => valid }
    )
    expect(result.error).toBeUndefined()
    expect(result.proposal).toMatchObject({ axisId: "endo_sealer_line", isVariantAxis: true })
  })
})
