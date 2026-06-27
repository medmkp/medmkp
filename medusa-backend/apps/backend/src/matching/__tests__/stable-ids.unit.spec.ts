import { assignCanonicalIds } from "../db"
import { runMatching } from "../engine"
import { normalizeProduct } from "../normalize"
import type { SupplierProductRow } from "../types"

let nextId = 0
function product(partial: Partial<SupplierProductRow>): SupplierProductRow {
  nextId += 1
  return {
    id: `msp_test_${nextId}`,
    supplier_id: "msup_test_com",
    sku: "",
    manufacturer_sku: "",
    brand: "",
    name: "",
    category: "",
    pack_size: "",
    unit_of_measure: "",
    product_url: "",
    image_url: "",
    price_cents: null,
    price_basis: null,
    ...partial,
  }
}

// Two suppliers each carry a Small and a Large of the same glove: the matcher
// makes two clusters (size variants don't merge), one per size.
function catalog(): SupplierProductRow[] {
  return [
    product({ id: "a_s", supplier_id: "msup_a", brand: "BeeSure", manufacturer_sku: "BE306S", name: "BeeSure Nitrile Exam Glove Small", pack_size: "100/Box" }),
    product({ id: "b_s", supplier_id: "msup_b", brand: "BeeSure", manufacturer_sku: "BE306S", name: "BeeSure Nitrile Exam Glove Small", pack_size: "100/Box" }),
    product({ id: "a_l", supplier_id: "msup_a", brand: "BeeSure", manufacturer_sku: "BE306L", name: "BeeSure Nitrile Exam Glove Large", pack_size: "100/Box" }),
    product({ id: "b_l", supplier_id: "msup_b", brand: "BeeSure", manufacturer_sku: "BE306L", name: "BeeSure Nitrile Exam Glove Large", pack_size: "100/Box" }),
  ]
}

function idByMemberId(rows: SupplierProductRow[]): Map<string, string> {
  const result = runMatching(rows.map(normalizeProduct))
  const assigned = assignCanonicalIds(result.clusters)
  const out = new Map<string, string>()
  for (const cluster of result.clusters) {
    const id = assigned.get(cluster.key)!.id
    for (const member of cluster.members) {
      out.set(member.row.id, id)
    }
  }
  return out
}

describe("stable content-addressed canonical ids", () => {
  it("assigns the same id to a product regardless of input order", () => {
    const forward = idByMemberId(catalog())
    const reversed = idByMemberId([...catalog()].reverse())
    // Same real product (keyed by its supplier-product id) -> same canonical id.
    for (const memberId of ["a_s", "b_s", "a_l", "b_l"]) {
      expect(reversed.get(memberId)).toBe(forward.get(memberId))
    }
  })

  it("does not collide pack/size variants onto one id", () => {
    const ids = idByMemberId(catalog())
    // Small and Large are distinct clusters -> distinct ids.
    expect(ids.get("a_s")).toBe(ids.get("b_s"))
    expect(ids.get("a_l")).toBe(ids.get("b_l"))
    expect(ids.get("a_s")).not.toBe(ids.get("a_l"))
  })

  it("derives ids from a content hash, not a positional counter", () => {
    const ids = new Set(idByMemberId(catalog()).values())
    for (const id of ids) {
      expect(id).toMatch(/^mcp_auto_[0-9a-f]{12}/)
    }
  })

  it("keeps ids stable when an unrelated product is added to the catalog", () => {
    const base = idByMemberId(catalog())
    const withExtra = idByMemberId([
      ...catalog(),
      product({ id: "x1", supplier_id: "msup_a", brand: "Crosstex", manufacturer_sku: "GCNXX", name: "Crosstex Cotton Roll #2 Medium", pack_size: "2000/Case" }),
      product({ id: "x2", supplier_id: "msup_b", brand: "Crosstex", manufacturer_sku: "GCNXX", name: "Crosstex Cotton Roll #2 Medium", pack_size: "2000/Case" }),
    ])
    // The positional scheme would have shifted these; the content scheme must not.
    for (const memberId of ["a_s", "b_s", "a_l", "b_l"]) {
      expect(withExtra.get(memberId)).toBe(base.get(memberId))
    }
  })
})
