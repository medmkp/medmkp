import { runMatching } from "../engine"
import { assignFamilies } from "../family"
import { normalizeProduct } from "../normalize"
import type { Cluster, FamilyInfo, SupplierProductRow } from "../types"

let nextId = 0
function product(partial: Partial<SupplierProductRow>): SupplierProductRow {
  nextId += 1
  return {
    id: `msp_test_${nextId}`,
    supplier_id: "msup_a_com",
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

// A canonical product is a cluster of >=2 matching supplier listings, so each
// variant needs two suppliers carrying the same strong SKU to form a cluster.
function variantPair(brand: string, name: string, mfrSku: string): SupplierProductRow[] {
  return [
    product({ brand, name, manufacturer_sku: mfrSku, supplier_id: "msup_a_com", sku: `A-${mfrSku}` }),
    product({ brand, name, manufacturer_sku: mfrSku, supplier_id: "msup_b_com", sku: `B-${mfrSku}` }),
  ]
}

function familiesByName(rows: SupplierProductRow[]) {
  const result = runMatching(rows.map(normalizeProduct))
  // Map each cluster's representative name -> assigned family (or null).
  const byRepName = new Map<string, FamilyInfo | null>()
  for (const cluster of result.clusters) {
    byRepName.set(cluster.representative.row.name, result.families.get(cluster.key) ?? null)
  }
  return { result, byRepName }
}

function familyCluster(key: number, name: string, packSize: string): Cluster {
  const members = [
    normalizeProduct(product({ brand: "Aurelia", name, pack_size: packSize, supplier_id: "msup_a_com" })),
    normalizeProduct(product({ brand: "Aurelia", name, pack_size: packSize, supplier_id: "msup_b_com" })),
  ]
  return {
    key,
    contentKey: `test-${key}`,
    members,
    representative: members[0],
    supplierCount: 2,
  }
}

describe("variant families", () => {
  it("groups apparel glove sizes into one family with distinct labels", () => {
    const rows = [
      ...variantPair("Alasta", "Alasta Aloe Nitrile Glove Small 100/Box", "ALASTA-ALOE-NIT-S"),
      ...variantPair("Alasta", "Alasta Aloe Nitrile Glove Medium 100/Box", "ALASTA-ALOE-NIT-M"),
      ...variantPair("Alasta", "Alasta Aloe Nitrile Glove Large 100/Box", "ALASTA-ALOE-NIT-L"),
      ...variantPair("Alasta", "Alasta Aloe Nitrile Glove X-Large 100/Box", "ALASTA-ALOE-NIT-XL"),
    ]
    const { byRepName } = familiesByName(rows)
    const families = [...byRepName.values()].filter((f): f is FamilyInfo => Boolean(f))

    // All four size clusters land in one family.
    const ids = new Set(families.map((f) => f.familyId))
    expect(ids.size).toBe(1)
    expect(families.length).toBe(4)

    const labels = new Set(families.map((f) => f.variantLabel))
    expect(labels).toEqual(new Set(["Small", "Medium", "Large", "X-Large"]))
    expect(families.every((f) => f.variantAxis === "size")).toBe(true)
    // Family title drops the size token.
    expect(families[0].familyName).not.toMatch(/small|medium|large/i)
    expect(families[0].familyName.toLowerCase()).toContain("nitrile glove")
  })

  it("disambiguates duplicate size labels with pack size", () => {
    const clusters = [
      familyCluster(1, "Aurelia Sonic Nitrile Gloves X-Small 100/Box", "100/Box"),
      familyCluster(2, "Aurelia Sonic Nitrile Gloves X-Small 300/Box", "300/Box"),
      familyCluster(3, "Aurelia Sonic Nitrile Gloves Small 300/Box", "300/Box"),
      familyCluster(4, "Aurelia Sonic Nitrile Gloves Medium 300/Box", "300/Box"),
    ]
    const families = [...assignFamilies(clusters).values()]

    expect(new Set(families.map((f) => f.familyId)).size).toBe(1)
    expect(new Set(families.map((f) => f.variantLabel))).toEqual(
      new Set(["X-Small - 100/Box", "X-Small - 300/Box", "Small", "Medium"])
    )
  })

  it("groups measured (mm) variants and labels them with the unit", () => {
    const rows = [
      ...variantPair("Meta", "Meta Gutta Percha Points 25mm", "META-GP-25"),
      ...variantPair("Meta", "Meta Gutta Percha Points 30mm", "META-GP-30"),
    ]
    const families = [...familiesByName(rows).byRepName.values()].filter(
      (f): f is FamilyInfo => Boolean(f)
    )
    expect(new Set(families.map((f) => f.familyId)).size).toBe(1)
    expect(new Set(families.map((f) => f.variantLabel))).toEqual(
      new Set(["25 mm", "30 mm"])
    )
  })

  it("groups short/long injection needles into one family with Short/Long options", () => {
    const rows = [
      ...variantPair(
        "MedMix",
        "Transcodent Painless Steel Dental Injection Needles 25 Gauge Short Red",
        "162241"
      ),
      ...variantPair(
        "MedMix",
        "Transcodent Painless Steel Dental Injection Needles 25 Gauge Long Red",
        "162242"
      ),
    ]
    const { byRepName } = familiesByName(rows)
    const families = [...byRepName.values()].filter((f): f is FamilyInfo => Boolean(f))

    // Both length clusters land in one family with a Short/Long selector.
    expect(new Set(families.map((f) => f.familyId)).size).toBe(1)
    expect(families.length).toBe(2)
    expect(new Set(families.map((f) => f.variantLabel))).toEqual(new Set(["Short", "Long"]))
    expect(families.every((f) => f.variantAxis === "needle_length")).toBe(true)
    // Family title drops the length word, and Short sorts ahead of Long.
    expect(families[0].familyName).not.toMatch(/\bshort\b|\blong\b/i)
    expect(families[0].familyName.toLowerCase()).toContain("injection needles")
  })

  it("keeps a different product line out of the family", () => {
    const rows = [
      ...variantPair("Alasta", "Alasta Aloe Nitrile Glove Small 100/Box", "ALASTA-NIT-S"),
      ...variantPair("Alasta", "Alasta Aloe Nitrile Glove Large 100/Box", "ALASTA-NIT-L"),
      // Same brand, different material (latex) — must not join the nitrile family.
      ...variantPair("Alasta", "Alasta Aloe Latex Glove Small 100/Box", "ALASTA-LAT-S"),
      ...variantPair("Alasta", "Alasta Aloe Latex Glove Large 100/Box", "ALASTA-LAT-L"),
    ]
    const { byRepName } = familiesByName(rows)
    const nitrile = [...byRepName.entries()]
      .filter(([name]) => /nitrile/i.test(name))
      .map(([, f]) => f?.familyId)
    const latex = [...byRepName.entries()]
      .filter(([name]) => /latex/i.test(name))
      .map(([, f]) => f?.familyId)

    expect(new Set(nitrile).size).toBe(1)
    expect(new Set(latex).size).toBe(1)
    expect(nitrile[0]).not.toEqual(latex[0])
  })

  it("does not form a family when only one size exists", () => {
    const rows = variantPair("Alasta", "Alasta Aloe Nitrile Glove Medium 100/Box", "ALASTA-ONLY-M")
    const families = [...familiesByName(rows).byRepName.values()].filter(
      (f): f is FamilyInfo => Boolean(f)
    )
    expect(families.length).toBe(0)
  })

  it("groups cotton roll styles (econo/braided/wrapped) into one family with capitalized labels", () => {
    const rows = [
      ...variantPair("Richmond Dental", "Econo Cotton Rolls Medium 2000/Pkg", "RICH-ECONO-M"),
      ...variantPair("Richmond Dental", "Braided Cotton Rolls Medium 2000/Pkg", "RICH-BRAIDED-M"),
      ...variantPair("Richmond Dental", "Wrapped Cotton Rolls Medium 2000/Pkg", "RICH-WRAPPED-M"),
    ]
    const { byRepName } = familiesByName(rows)
    const families = [...byRepName.values()].filter((f): f is FamilyInfo => Boolean(f))

    // All three style clusters land in one family.
    const ids = new Set(families.map((f) => f.familyId))
    expect(ids.size).toBe(1)
    expect(families.length).toBe(3)

    const labels = new Set(families.map((f) => f.variantLabel))
    expect(labels).toEqual(new Set(["Econo", "Braided", "Wrapped"]))
    expect(families.every((f) => f.variantAxis === "cotton_roll_style")).toBe(true)
    // Family title drops the style word.
    expect(families[0].familyName).not.toMatch(/econo|braided|wrapped/i)
    expect(families[0].familyName.toLowerCase()).toContain("cotton rolls")
  })
})
