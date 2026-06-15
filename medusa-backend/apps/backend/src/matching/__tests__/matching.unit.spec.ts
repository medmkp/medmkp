import { runMatching } from "../engine"
import {
  extractSkuLikeTokens,
  normalizeBrand,
  normalizeProduct,
  parsePackQty,
  skuStrength,
} from "../normalize"
import { scorePair } from "../score"
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

function score(a: Partial<SupplierProductRow>, b: Partial<SupplierProductRow>) {
  return scorePair(normalizeProduct(product(a)), normalizeProduct(product(b)))
}

describe("normalization", () => {
  it("parses pack quantities from common supplier formats", () => {
    expect(parsePackQty("Pkg of 5", "")).toBe(5)
    expect(parsePackQty("100/Box", "")).toBe(100)
    expect(parsePackQty("", "Flexform Saliva Ejector 100/Pack")).toBe(100)
    expect(parsePackQty("", "White Arkansas Shape CN1 (138) - FG (12)")).toBe(12)
    expect(parsePackQty("", "Portrait IPN Upper Mould 334 (1 x 8)")).toBe(8)
    expect(parsePackQty("", "N'Sure Plastic Cups 5oz Aqua Case of 1000")).toBe(1000)
  })

  it("rates short numeric SKUs as weak identity evidence", () => {
    expect(skuStrength("0044")).toBeLessThan(0.4)
    expect(skuStrength("8111")).toBeLessThan(0.4)
    expect(skuStrength("8234155")).toBeGreaterThan(0.7)
    expect(skuStrength("DCG30UNI")).toBeGreaterThan(0.9)
    expect(skuStrength("0000")).toBeLessThanOrEqual(0.1)
  })

  it("treats junk and house-label brands as unknown", () => {
    expect(normalizeBrand("1 X 6", "msup_pearsondental_com").key).toBeNull()
    expect(normalizeBrand("pkg. of 12", "msup_pearsondental_com").key).toBeNull()
    expect(normalizeBrand("lateral", "msup_pearsondental_com").key).toBeNull()
    expect(normalizeBrand("Dental City", "msup_dentalcity_com").key).toBeNull()
    expect(normalizeBrand("Kerr Endodontics", "msup_pearsondental_com").key).toBe("kerr")
  })

  it("extracts catalog numbers embedded in names but not pack/measure tokens", () => {
    const tokens = extractSkuLikeTokens("Alpen Flame 5/Pack Medium 852-012")
    expect(tokens).toContain("852012")
    expect(extractSkuLikeTokens("Glove Nitrile 100/Box 25mm")).toHaveLength(0)
  })
})

describe("identity matching (golden pairs from production data)", () => {
  it("matches Premier Elevator Cameron across suppliers", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "100-3371",
        brand: "Dental City",
        name: "Premier Elevator Cameron",
      },
      {
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "1003371",
        brand: "Premier",
        name: "Premier Elevators Cameron",
      }
    )
    expect(["exact", "variant"]).toContain(decision.status)
    expect(decision.confidence).toBeGreaterThanOrEqual(75)
  })

  it("matches Kerr K3XF files despite different name styles", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "823-4155",
        brand: "Dental City",
        name: "K3 XF NiTi File #15 .04 25mm 823-4155",
      },
      {
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "8234155",
        brand: "Kerr Endodontics",
        name: "K3XF Greater Taper Files .15/.04 25mm pkg of 6",
      }
    )
    expect(["exact", "variant", "needs_review"]).toContain(decision.status)
    expect(decision.status).not.toBe("reject")
  })

  it("matches Dura-Green WH2 as same product with same pack", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "0044",
        brand: "Dental City",
        name: "Dura-Green WH2 HP 0044 12/Pack",
        pack_size: "12/Pack",
      },
      {
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "0044",
        brand: "pkg. of 12",
        name: "Dura Green Shape WH2 - HP (12)",
      }
    )
    expect(decision.status).toBe("exact")
  })

  it("rejects the oregano oil vs o-ring SKU collision", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "4732",
        brand: "Dental City",
        name: "O-Ring for Star 430 / Solara 2/Pack 4732",
      },
      {
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "4732",
        brand: "Now Foods",
        name: "Oregano Oil Enteric 90 Sgels",
      }
    )
    expect(decision.status).toBe("reject")
  })

  it("rejects unrelated products sharing weak SKU 0044", () => {
    const impostors = [
      ["Vivid TriMax Teeth 1x6 Upper 448/A4", "1 X 6"],
      ["VOP Ceramic Bracket Roth .018 Low Ant Pkg of 10", "MTDental"],
      ["EVA Sheet Tray Forming Material (75)", "Nu Radiance Inc"],
      ["Microfile K-Type File #10, Pkg of 6", "Venta Endo"],
    ] as const
    const reference = {
      supplier_id: "msup_dentalcity_com",
      manufacturer_sku: "0044",
      brand: "Dental City",
      name: "Dura-Green WH2 HP 0044 12/Pack",
    }
    for (const [name, brand] of impostors) {
      const decision = score(reference, {
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "0044",
        brand,
        name,
      })
      expect(decision.status).toBe("reject")
    }
  })

  it("rejects same-SKU products that differ on a measured size", () => {
    const decision = score(
      {
        manufacturer_sku: "AB1234",
        brand: "Acme",
        name: "Diamond Bur Round 25mm",
      },
      {
        supplier_id: "msup_other_com",
        manufacturer_sku: "AB1234",
        brand: "Acme",
        name: "Diamond Bur Round 31mm",
      }
    )
    expect(decision.status).toBe("reject")
  })

  it("flags same product with different pack counts as variant", () => {
    const decision = score(
      {
        manufacturer_sku: "NGL225",
        brand: "Acme",
        name: "Nitrile Exam Gloves Medium 100/Box",
        pack_size: "100/Box",
      },
      {
        supplier_id: "msup_other_com",
        manufacturer_sku: "NGL225",
        brand: "Acme",
        name: "Nitrile Exam Gloves Medium Case of 1000",
        pack_size: "Case of 1000",
      }
    )
    expect(decision.status).toBe("variant")
  })

  it("matches via catalog number embedded in the name (Dental City pattern)", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "60032253",
        brand: "Dental City",
        name: "Alpen Flame 5/Pack Medium 852-012",
        pack_size: "5/Pack",
      },
      {
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "852-012",
        brand: "Alpen",
        name: "Alpen Carbide Bur Flame Medium 852 012 pkg of 5",
      }
    )
    expect(["exact", "variant"]).toContain(decision.status)
  })
})

describe("end-to-end clustering", () => {
  it("clusters true matches and isolates impostors sharing a weak SKU", () => {
    const rows = [
      product({
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "0044",
        brand: "Dental City",
        name: "Dura-Green WH2 HP 0044 12/Pack",
        pack_size: "12/Pack",
        price_cents: 1899,
      }),
      product({
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "0044",
        brand: "pkg. of 12",
        name: "Dura Green Shape WH2 - HP (12)",
        price_cents: 2150,
      }),
      product({
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "0044",
        brand: "Now Foods",
        name: "Oregano Oil Enteric 90 Sgels",
        price_cents: 1500,
      }),
      product({
        supplier_id: "msup_carolinadental_com",
        manufacturer_sku: "1003371",
        brand: "Premier",
        name: "Premier Elevator Cameron",
        price_cents: 3000,
      }),
      product({
        supplier_id: "msup_pearsondental_com",
        manufacturer_sku: "1003371",
        brand: "Premier",
        name: "Premier Elevators Cameron",
        price_cents: 3500,
      }),
    ]
    const result = runMatching(rows.map(normalizeProduct))
    expect(result.clusters).toHaveLength(2)
    const sizes = result.clusters.map((cluster) => cluster.members.length).sort()
    expect(sizes).toEqual([2, 2])
    const allMemberNames = result.clusters.flatMap((cluster) =>
      cluster.members.map((member) => member.row.name)
    )
    expect(allMemberNames).not.toContain("Oregano Oil Enteric 90 Sgels")
  })
})
