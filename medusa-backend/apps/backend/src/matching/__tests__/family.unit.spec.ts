import { runMatching } from "../engine"
import { assignFamilies, clusterAttributes } from "../family"
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

  it("groups shade-guide replacement tabs into one shade selector", () => {
    const rows = [
      product({
        brand: "VITA North America",
        name: "VITA Classical A1-D4 Shade Guide, VITA Classical Shade Tab A2",
        manufacturer_sku: "G154CN",
        supplier_id: "msup_a_com",
        sku: "A-G154CN",
      }),
      product({
        brand: "VITA North America",
        name: "VITA Classical Shade Guide Replacement Tabs - Shade A2",
        manufacturer_sku: "G154CN",
        supplier_id: "msup_b_com",
        sku: "B-G154CN",
      }),
      product({
        brand: "VITA North America",
        name: "VITA Classical A1-D4 Shade Guide, VITA Classical Shade Tab A3",
        manufacturer_sku: "G155CN",
        supplier_id: "msup_a_com",
        sku: "A-G155CN",
      }),
      product({
        brand: "VITA North America",
        name: "VITA Classical Shade Guide Replacement Tabs - Shade A3",
        manufacturer_sku: "G155CN",
        supplier_id: "msup_b_com",
        sku: "B-G155CN",
      }),
      product({
        brand: "VITA North America",
        name: "VITA Classical A1-D4 Shade Guide, VITA Classical Shade Tab A3.5",
        manufacturer_sku: "G156CN",
        supplier_id: "msup_a_com",
        sku: "A-G156CN",
      }),
      product({
        brand: "VITA North America",
        name: "VITA Classical Shade Guide Replacement Tabs - Shade A3.5",
        manufacturer_sku: "G156CN",
        supplier_id: "msup_b_com",
        sku: "B-G156CN",
      }),
      product({
        brand: "VITA North America",
        name: "VITA Classical A1-D4 Shade Guide, VITA Classical Shade Tab B1",
        manufacturer_sku: "G158CN",
        supplier_id: "msup_a_com",
        sku: "A-G158CN",
      }),
      product({
        brand: "VITA North America",
        name: "VITA Classical Shade Guide Replacement Tabs - Shade B1",
        manufacturer_sku: "G158CN",
        supplier_id: "msup_b_com",
        sku: "B-G158CN",
      }),
    ]
    const families = [...familiesByName(rows).byRepName.values()].filter(
      (f): f is FamilyInfo => Boolean(f)
    )

    expect(new Set(families.map((f) => f.familyId)).size).toBe(1)
    expect(new Set(families.map((f) => f.variantLabel))).toEqual(
      new Set(["A2", "A3", "A3.5", "B1"])
    )
    expect(families.every((f) => f.variantAxis === "shade")).toBe(true)
    expect(families[0].familyName).not.toMatch(/\bshade\s+[a-d][1-7]/i)
    expect(families[0].familyName.toLowerCase()).toContain("replacement tabs")
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

  it("groups mask colors into one Color family (White included, not read as a shade)", () => {
    const rows = [
      ...variantPair("Cranberry", "Cranberry S3+ Face Masks Level 3 - Blue", "CRAN-S3-BLUE"),
      ...variantPair("Cranberry", "Cranberry S3+ Face Masks Level 3 - Black", "CRAN-S3-BLACK"),
      ...variantPair("Cranberry", "Cranberry S3+ Face Masks Level 3 - White", "CRAN-S3-WHITE"),
    ]
    const { byRepName } = familiesByName(rows)
    const families = [...byRepName.values()].filter((f): f is FamilyInfo => Boolean(f))

    // All three color clusters — including White — land in one Color family.
    expect(new Set(families.map((f) => f.familyId)).size).toBe(1)
    expect(families.length).toBe(3)
    expect(new Set(families.map((f) => f.variantLabel))).toEqual(
      new Set(["Blue", "Black", "White"])
    )
    expect(families.every((f) => f.variantAxis === "color")).toBe(true)
    // Family title drops the color word; the "White" mask is a color, not a shade.
    expect(families[0].familyName).not.toMatch(/blue|black|white/i)
    expect(families[0].familyName.toLowerCase()).toContain("face masks")
  })

  it("keeps glove color lines apart as separate size families (color not stripped off-axis)", () => {
    const rows = [
      ...variantPair("Aurelia", "Aurelia Nitrile Exam Gloves Blue Small 100/Box", "AUR-NIT-BLUE-S"),
      ...variantPair("Aurelia", "Aurelia Nitrile Exam Gloves Blue Large 100/Box", "AUR-NIT-BLUE-L"),
      ...variantPair("Aurelia", "Aurelia Nitrile Exam Gloves Purple Small 100/Box", "AUR-NIT-PURP-S"),
      ...variantPair("Aurelia", "Aurelia Nitrile Exam Gloves Purple Large 100/Box", "AUR-NIT-PURP-L"),
    ]
    const { byRepName } = familiesByName(rows)
    const blue = [...byRepName.entries()]
      .filter(([name]) => /blue/i.test(name))
      .map(([, f]) => f)
    const purple = [...byRepName.entries()]
      .filter(([name]) => /purple/i.test(name))
      .map(([, f]) => f)

    // Two distinct Size families (one per color), each with Small + Large — not
    // one collapsed family with duplicate "Large" labels.
    expect(blue.every((f) => f?.variantAxis === "size")).toBe(true)
    expect(purple.every((f) => f?.variantAxis === "size")).toBe(true)
    const blueId = new Set(blue.map((f) => f?.familyId))
    const purpleId = new Set(purple.map((f) => f?.familyId))
    expect(blueId.size).toBe(1)
    expect(purpleId.size).toBe(1)
    expect([...blueId][0]).not.toEqual([...purpleId][0])
    expect(new Set(blue.map((f) => f?.variantLabel))).toEqual(new Set(["Small", "Large"]))
    expect(new Set(purple.map((f) => f?.variantLabel))).toEqual(new Set(["Small", "Large"]))
  })
})

describe("Tier-3-discovered selector axes", () => {
  it("groups Rim Lock tray arch positions into one family", () => {
    const rows = [
      ...variantPair("Coltene", "Rim Lock Impression Trays U15", "RIMLOCK-U15"),
      ...variantPair("Coltene", "Rim Lock Impression Trays U16", "RIMLOCK-U16"),
      ...variantPair("Coltene", "Rim Lock Impression Trays L15", "RIMLOCK-L15"),
    ]
    const families = [...familiesByName(rows).byRepName.values()].filter((f): f is FamilyInfo => Boolean(f))
    expect(new Set(families.map((f) => f.familyId)).size).toBe(1)
    expect(new Set(families.map((f) => f.variantLabel))).toEqual(new Set(["U15", "U16", "L15"]))
    expect(families.every((f) => f.variantAxis === "tooth_arch_position")).toBe(true)
  })

  it("groups rigid electrode models into one family (strip pattern works)", () => {
    const rows = [
      ...variantPair("Macan", "Rigid Electrode #R-F15 Pkg of 2", "MACAN-RF15"),
      ...variantPair("Macan", "Rigid Electrode #R-L32 Pkg of 2", "MACAN-RL32"),
    ]
    const families = [...familiesByName(rows).byRepName.values()].filter((f): f is FamilyInfo => Boolean(f))
    expect(new Set(families.map((f) => f.familyId)).size).toBe(1)
    expect(new Set(families.map((f) => f.variantLabel))).toEqual(new Set(["F15", "L32"]))
    expect(families.every((f) => f.variantAxis === "electrode_model")).toBe(true)
  })
})

describe("clusterAttributes (Tier 2 structured attributes)", () => {
  it("returns the agreed selector axis labeled from the registry", () => {
    const attrs = clusterAttributes(
      familyCluster(1, "Alasta Aloe Nitrile Glove Large 100/Box", "100/Box")
    )
    expect(attrs).toEqual([
      { axis: "size", value: "L", label: "Large", axisLabel: "Size", isVariantAxis: true },
    ])
  })

  it("flags the highest-priority axis as the variant and keeps the rest as specs", () => {
    // Needle listing carries both a length (priority 2) and a gauge (priority 10):
    // length is the variant axis, gauge becomes a non-variant spec row.
    const attrs = clusterAttributes(
      familyCluster(2, "Transcodent Injection Needles 25 Gauge Long", "100/Box")
    )
    const byAxis = Object.fromEntries(attrs.map((a) => [a.axis, a]))
    expect(byAxis.needle_length).toEqual({
      axis: "needle_length", value: "long", label: "Long", axisLabel: "Length", isVariantAxis: true,
    })
    expect(byAxis.ga).toEqual({
      axis: "ga", value: "25", label: "25 ga", axisLabel: "Gauge", isVariantAxis: false,
    })
  })

  it("returns nothing for a product with no modeled selector axis", () => {
    expect(clusterAttributes(familyCluster(3, "Generic Bib Clip Cord", "1/Each"))).toEqual([])
  })
})
