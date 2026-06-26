import { pickCategory } from "../db"
import { runMatching } from "../engine"
import { buildOffers } from "../line-items"
import {
  extractNumericAttrs,
  extractSkuLikeTokens,
  normalizeBrand,
  normalizeProduct,
  parsePackQty,
  skuModelCore,
  skuStrength,
  tokenizeName,
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

  it("stems plural words but never alphanumeric pattern codes", () => {
    expect(tokenizeName("Premier Elevators")).toContain("elevator")
    // "151AS" is an instrument pattern, not a plural of "151A" — keep distinct.
    expect(tokenizeName("Extracting Forceps 151AS")).toContain("151as")
    expect(tokenizeName("Extracting Forceps 151A")).toContain("151a")
  })

  it("strips a distributor line prefix to the maker model, conservatively", () => {
    // DC Dental prepends an internal line code the maker (and Henry Schein) omit.
    expect(skuModelCore("219-4302")).toBe("4302")
    expect(skuModelCore("219-4301")).toBe("4301")
    // No prefix, or the trailing part is too short / letter-only to trust.
    expect(skuModelCore("4302")).toBe("")
    expect(skuModelCore("C15053-006")).toBe("") // leading segment isn't numeric
    expect(skuModelCore("826-WC")).toBe("") // core has no digit
    expect(skuModelCore("219-12")).toBe("") // core too short
    expect(skuModelCore("")).toBe("")
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

  it("bridges a DC Dental vendor-prefixed SKU to the plain Henry Schein model", () => {
    // Real prod rows: the same Dynarex applicator, but DC Dental prefixes the
    // model ("219-4302") while Henry Schein carries it as "4302". Without the
    // prefix-stripped core, there's no shared catalog code and the divergent
    // distributor names alone score too low to merge — so the priced DC Dental
    // offer never joins the (price-less) Henry Schein canonical.
    const decision = score(
      {
        supplier_id: "msup_henryschein_com",
        manufacturer_sku: "4302",
        brand: "Dynarex Corporation",
        name: "Applicator 6 in Wood Shaft Non Sterile 1000/Bx",
        pack_size: "1000/Bx",
      },
      {
        supplier_id: "msup_dcdental_com",
        manufacturer_sku: "219-4302",
        brand: "Dynarex",
        name: 'Cotton Tipped Wood Applicators Non-Sterile 6" 1000/Cs',
      }
    )
    expect(["exact", "variant"]).toContain(decision.status)
    expect(decision.confidence).toBeGreaterThanOrEqual(75)
  })

  it("does not let a shared model core merge unrelated products", () => {
    // Both reduce to model "4302" (DC Dental "219-4302" via its core, Dedeco
    // "4302" directly), but they're a cotton applicator and a mounted stone from
    // different makers — brand + name must still veto the core collision.
    const decision = score(
      {
        supplier_id: "msup_dcdental_com",
        manufacturer_sku: "219-4302",
        brand: "Dynarex",
        name: 'Cotton Tipped Wood Applicators Non-Sterile 6" 1000/Cs',
      },
      {
        supplier_id: "msup_henryschein_com",
        manufacturer_sku: "4302",
        brand: "Dedeco International Inc",
        name: "Green Giant Mounted Stones Green 12/Bx",
        pack_size: "12/Bx",
      }
    )
    expect(decision.status).toBe("reject")
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

  it("rejects composite refills that differ on shade, including B5 and layer-lettered codes", () => {
    // Regression: the shade regex missed B5 (digit range) and any shade with a
    // trailing layer letter (A1B/B5B failed the word boundary), so a scanned
    // "B5B" carried no shade and bridged distinct shades into one cluster.
    const decision = score(
      { brand: "3M", name: "3M Filtek Supreme Ultra Universal Composite B5B Body Capsule Refill 20/Bt" },
      {
        supplier_id: "msup_other_com",
        brand: "3M",
        name: "3M Filtek Supreme Ultra A1 Body Caps 20/Pack",
      }
    )
    expect(decision.status).toBe("reject")
  })

  it("reads the same shade from both 'A1 Body' and the layer-lettered 'A1B', so they don't conflict", () => {
    // The layer letter (B=Body) must not change the stored shade value, or the
    // same shade written two ways would falsely hard-conflict.
    const plain = extractNumericAttrs("3M Filtek Supreme Ultra A1 Body Caps 20/Pack").get("shade")
    const lettered = extractNumericAttrs("3M Filtek Supreme Ultra Composite A1B Capsule Refill").get("shade")
    expect([...(plain ?? [])]).toEqual(["a1"])
    expect([...(lettered ?? [])]).toEqual(["a1"])
  })

  it("captures white-family shades (WB / XW / White) that carry no numeric code", () => {
    // Regression: WB (white body) and XW (extra white) have no A1–D7 code, so
    // they were shade-less and bridged every numeric shade into one cluster.
    expect([...(extractNumericAttrs("3M Filtek Supreme Ultra Universal Composite WB Body Capsule Refill 20/Bt").get("shade") ?? [])]).toEqual(["w"])
    expect([...(extractNumericAttrs("3M Filtek Supreme Ultra White Body Caps 20/Pack 6029WHB").get("shade") ?? [])]).toEqual(["w"])
    expect([...(extractNumericAttrs("3M Filtek Supreme Ultra Universal Composite XW Body Capsule Refill 20/Bt").get("shade") ?? [])]).toEqual(["xw"])
    expect([...(extractNumericAttrs("3M Filtek Supreme Ultra XW Body Caps 20/Pack 6029XWB").get("shade") ?? [])]).toEqual(["xw"])
  })

  it("rejects a white-family shade against a numeric shade (no transitive bridge)", () => {
    // The shade-less white/extra-white rows were the bridge that merged A1B…D3B.
    const whiteVsNumeric = score(
      { brand: "3M", name: "3M Filtek Supreme Ultra Universal Composite WB Body Capsule Refill 20/Bt" },
      { supplier_id: "msup_other_com", brand: "3M", name: "3M Filtek Supreme Ultra A1 Body Caps 20/Pack" }
    )
    expect(whiteVsNumeric.status).toBe("reject")
    const xWhiteVsWhite = score(
      { brand: "3M", name: "3M Filtek Supreme Ultra Universal Composite XW Body Capsule Refill 20/Bt" },
      { supplier_id: "msup_other_com", brand: "3M", name: "3M Filtek Supreme Ultra White Body Caps 20/Pack" }
    )
    expect(xWhiteVsWhite.status).toBe("reject")
  })

  it("reads the same white shade from 'WB' and the word 'White', so they don't conflict", () => {
    // White-vs-white must resolve to the same shade value, or the genuine
    // cross-supplier white match would falsely hard-conflict.
    const code = extractNumericAttrs("3M Filtek Supreme Ultra Universal Composite WB Body Capsule Refill").get("shade")
    const word = extractNumericAttrs("3M Filtek Supreme Ultra White Body Caps 20/Pack").get("shade")
    expect([...(code ?? [])]).toEqual(["w"])
    expect([...(word ?? [])]).toEqual(["w"])
  })

  it("captures common product colors as hard-conflict attributes", () => {
    expect([...(extractNumericAttrs("Zirc E-Z ID Tape Teal 70Z300-J").get("color") ?? [])]).toEqual(["teal"])
    expect([...(extractNumericAttrs("EZ-ID Tape System and Rolls, Roll, 10 ft., Green").get("color") ?? [])]).toEqual(["green"])
  })

  it("captures USP suture sizes as hard-conflict attributes", () => {
    expect([...(extractNumericAttrs('Look Nylon Monofilament Sutures, 4-0, 18", 12/Box').get("suture_size") ?? [])]).toEqual(["4-0"])
    expect([...(extractNumericAttrs("LOOK Nylon Black Monofilament Sutures - C6, 5–0").get("suture_size") ?? [])]).toEqual(["5-0"])
    expect([...(extractNumericAttrs('Chromic Gut Sutures, X-1, 4/0, 12/Box, 18"').get("suture_size") ?? [])]).toEqual(["4-0"])
    expect(extractNumericAttrs("Bracket Hook 5-0 Trial").get("suture_size")).toBeUndefined()
  })

  it("rejects same-SKU color variants instead of merging them", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "70Z300J",
        brand: "Zirc",
        name: "Zirc E-Z ID Tape Teal 70Z300-J",
      },
      {
        supplier_id: "msup_darbydental_com",
        manufacturer_sku: "70Z300J",
        brand: "Zirc",
        name: "EZ-ID Tape System and Rolls, Roll, 10 ft., Green",
      }
    )
    expect(decision.status).toBe("reject")
  })

  it("rejects suture variants that differ on USP size", () => {
    const decision = score(
      {
        supplier_id: "msup_darbydental_com",
        manufacturer_sku: "922B",
        brand: "Surgical Specialties",
        name: 'Look Nylon Monofilament Sutures, 4-0, 18", 12/Box, Black, C6',
      },
      {
        supplier_id: "msup_henryschein_com",
        manufacturer_sku: "913B",
        brand: "Surgical Specialties Corp",
        name: 'Suture 5-0 10" Nylon Monofilament C-17 Black 12/Bx',
      }
    )
    expect(decision.status).toBe("reject")
  })

  it("keeps same-SKU products with matching color mergeable", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "70Z300J",
        brand: "Zirc",
        name: "Zirc E-Z ID Tape Teal 70Z300-J",
      },
      {
        supplier_id: "msup_dcdental_com",
        manufacturer_sku: "605-70Z300J",
        brand: "Zirc Dental Products",
        name: "EZ-ID Tape Roll 10' Teal",
      }
    )
    expect(["exact", "variant"]).toContain(decision.status)
  })

  it("rejects non-woven sponges that differ on bare dimension (4x4 vs 2x2)", () => {
    const decision = score(
      { brand: "Henry Schein", name: 'Essentials Rayon/Poly Blend Non-Woven Sponge 4x4" 4 Ply Non-Sterile' },
      {
        supplier_id: "msup_other_com",
        brand: "Henry Schein",
        name: 'Essentials Rayon/Poly Blend Non-Woven Sponge 2x2" 4 Ply Non-Sterile',
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

describe("name+brand matching (no shared catalog code)", () => {
  it("matches the same branded product across distributor catalogs", () => {
    // Same maker name listed by two distributors under different internal
    // SKUs — no catalog code to join on, so the brand+name path must carry it.
    const decision = score(
      {
        supplier_id: "msup_dcdental_com",
        manufacturer_sku: "DC0001",
        brand: "Kuraray America",
        name: "PANAVIA Veneer LC Cement Intro Kit",
      },
      {
        supplier_id: "msup_carolinadental_com",
        manufacturer_sku: "CD9999",
        brand: "Kuraray",
        name: "PANAVIA Veneer LC Cement Intro Kit",
      }
    )
    expect(["exact", "variant"]).toContain(decision.status)
    expect(decision.skuScore).toBe(0)
  })

  it("holds a marginal brand-prefix-only difference for review, not auto-merge", () => {
    const decision = score(
      {
        supplier_id: "msup_dcdental_com",
        manufacturer_sku: "DC0002",
        brand: "Kuraray America",
        name: "PANAVIA Veneer LC Cement Intro Kit",
      },
      {
        supplier_id: "msup_carolinadental_com",
        manufacturer_sku: "CD9998",
        brand: "Kuraray",
        name: "Kuraray - PANAVIA Veneer LC Cement Intro Kit",
      }
    )
    expect(decision.status).toBe("needs_review")
  })

  it("does not merge same-name products from a conflicting brand", () => {
    const decision = score(
      {
        manufacturer_sku: "P1",
        brand: "Acme",
        name: "Universal Composite Syringe A2",
      },
      {
        supplier_id: "msup_other_com",
        manufacturer_sku: "P2",
        brand: "Globex",
        name: "Universal Composite Syringe A2",
      }
    )
    expect(decision.status).toBe("reject")
  })

  it("rejects same-brand glove listings that differ only on size", () => {
    const decision = score(
      {
        manufacturer_sku: "MF1",
        brand: "Microflex",
        name: "Supreno EC PF Nitrile Glove XX-Large 50/Bx",
      },
      {
        supplier_id: "msup_other_com",
        manufacturer_sku: "MF2",
        brand: "Microflex",
        name: "Supreno EC PF Nitrile Glove X-Large 50/Bx",
      }
    )
    expect(decision.status).toBe("reject")
  })

  it("does not treat an instrument pattern suffix as a plural (151A vs 151AS)", () => {
    const decision = score(
      {
        manufacturer_sku: "MX1",
        brand: "Miltex Instrument",
        name: "Extracting Forceps 151A",
      },
      {
        supplier_id: "msup_other_com",
        manufacturer_sku: "MX2",
        brand: "Miltex",
        name: "Extracting Forceps 151AS",
      }
    )
    expect(["exact", "variant"]).not.toContain(decision.status)
  })

  it("does not merge same-brand burs that differ only on their ISO code", () => {
    // 856-018C vs 856-016C both reduce to the bare family number 856, so the
    // size (018 vs 016) hid from the numeric checks and the near-identical names
    // used to auto-merge — collapsing a whole diamond family into one product.
    const decision = score(
      {
        manufacturer_sku: "135-91070-5",
        brand: "SS White",
        name: "Revelation Diamond 856-018C Coarse 5/Pk",
      },
      {
        supplier_id: "msup_other_com",
        manufacturer_sku: "135-91294-5",
        brand: "SS White",
        name: "Revelation Diamond 856-016C Coarse 5/Pk",
      }
    )
    expect(["exact", "variant"]).not.toContain(decision.status)
  })

  it("still merges products that share a catalog code in the name", () => {
    // Same ISO code from two distributors — the disjoint-codes guard must not
    // fire (the codes match), so cross-distributor equivalence still clusters.
    const decision = score(
      {
        manufacturer_sku: "DC1",
        brand: "SS White",
        name: "Revelation Diamond 856-016C Coarse 5/Pk",
      },
      {
        supplier_id: "msup_other_com",
        manufacturer_sku: "CD1",
        brand: "SS White",
        name: "Revelation Diamond 856-016C Coarse 5/Pk",
      }
    )
    expect(["exact", "variant"]).toContain(decision.status)
  })

  it("does not auto-merge different bur product lines that share only an ISO shape code", () => {
    // 801-016M is a generic bur geometry. Dental City's house-label brand used
    // to make it look brand-unknown, so this Piranha row accepted against Alpen
    // and bridged several distinct makers into one canonical.
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "801-016M",
        brand: "Dental City",
        name: "Piranha Round 801-016M FG 25/Box",
        pack_size: "25/Box",
      },
      {
        supplier_id: "msup_henryschein_com",
        manufacturer_sku: "X801M016",
        brand: "Coltene Inc",
        name: "Alpen x1 Diamond Bur Friction Grip Medium 801-016M 25/Bx",
        pack_size: "25/Bx",
      }
    )
    expect(["exact", "variant"]).not.toContain(decision.status)
  })

  it("does not treat an embedded generic bur code as enough to bridge house-label lines", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "1801016M",
        brand: "Dental City",
        name: "Midwest Once Diamonds Round 801-016M 25/Box 1801016M",
        pack_size: "25/Box",
      },
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "801-016M",
        brand: "Dental City",
        name: "Piranha Round 801-016M FG 25/Box",
        pack_size: "25/Box",
      }
    )
    expect(["exact", "variant"]).not.toContain(decision.status)
  })

  it("still merges generic bur-code rows when the product line is shared in the names", () => {
    const decision = score(
      {
        supplier_id: "msup_dentalcity_com",
        manufacturer_sku: "801-016M",
        brand: "Dental City",
        name: "Piranha Round 801-016M FG 25/Box",
        pack_size: "25/Box",
      },
      {
        supplier_id: "msup_henryschein_com",
        manufacturer_sku: "801-016M",
        brand: "S S White Dental Inc.",
        name: "Piranha Diamond Bur Friction Grip Medium Round 801-016M 25/Pk",
        pack_size: "25/Pk",
      }
    )
    expect(["exact", "variant"]).toContain(decision.status)
  })
})

describe("end-to-end clustering", () => {
  it("clusters a name+brand match across suppliers with no shared code", () => {
    const rows = [
      product({
        supplier_id: "msup_dcdental_com",
        manufacturer_sku: "DC0001",
        brand: "Kuraray America",
        name: "PANAVIA Veneer LC Cement Intro Kit",
        price_cents: 9900,
      }),
      product({
        supplier_id: "msup_carolinadental_com",
        manufacturer_sku: "CD9999",
        brand: "Kuraray",
        name: "PANAVIA Veneer LC Cement Intro Kit",
        price_cents: 10500,
      }),
    ]
    const result = runMatching(rows.map(normalizeProduct))
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0].supplierCount).toBe(2)
  })

  it("folds a priced vendor-prefixed offer into a price-less plain-model canonical", () => {
    const rows = [
      product({
        supplier_id: "msup_henryschein_com",
        manufacturer_sku: "4302",
        brand: "Dynarex Corporation",
        name: "Applicator 6 in Wood Shaft Non Sterile 1000/Bx",
        pack_size: "1000/Bx",
        price_cents: null, // login-gated: identity only, no price
      }),
      product({
        supplier_id: "msup_dcdental_com",
        manufacturer_sku: "219-4302",
        brand: "Dynarex",
        name: 'Cotton Tipped Wood Applicators Non-Sterile 6" 1000/Cs',
        price_cents: 11635,
      }),
    ]
    const result = runMatching(rows.map(normalizeProduct))
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0].supplierCount).toBe(2)
  })

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

  it("does not let a vendor-prefixed supplier's own variants weld a family together", () => {
    // The hazard the model-conflict axis guards: DC Dental's "375-330001" /
    // "375-330002" die stones each core-match a DIFFERENT external product, and
    // DC's two listings name-cluster ("Die Stone 33lb"), so without the guard the
    // DC pair acts as a hub that welds two unrelated stones into one canonical.
    // The model axis (carried only by the prefix-coded supplier) makes the two DC
    // listings hard-conflict, so each joins only its own match.
    const rows = [
      product({ supplier_id: "msup_dcdental_com", manufacturer_sku: "375-330001", brand: "Whip Mix", name: "Die Stone Aqua 33lb 330001", price_cents: 4000 }),
      product({ supplier_id: "msup_dcdental_com", manufacturer_sku: "375-330002", brand: "Whip Mix", name: "Die Stone Green 33lb 330002", price_cents: 4000 }),
      product({ supplier_id: "msup_dentalcity_com", manufacturer_sku: "330001", brand: "Whip Mix", name: "Die Stone Aqua 33lb 330001", price_cents: 4200 }),
      product({ supplier_id: "msup_dentalcity_com", manufacturer_sku: "330002", brand: "Whip Mix", name: "Die Stone Green 33lb 330002", price_cents: 4200 }),
    ]
    const result = runMatching(rows.map(normalizeProduct))
    // Two clusters of 2 (Aqua with Aqua, Green with Green) — never one welded 4.
    expect(result.clusters.map((c) => c.members.length).sort()).toEqual([2, 2])
  })

  it("does not let same-supplier disjoint catalog SKUs weld similar product lines", () => {
    // Real prod shape: one supplier carries Richmond Econo and Braided cotton
    // rolls with near-identical size/pack text. Those same-supplier rows should
    // not bridge the two SKU-specific cross-supplier matches into one canonical.
    const rows = [
      product({
        supplier_id: "msup_pattersondental_com",
        manufacturer_sku: "216206",
        brand: "Richmond Dental",
        name: 'Econo Cotton Rolls - Medium, 1-1/2" x 3/8", Nonsterile, 2000/Pkg',
        pack_size: "2000/Pkg",
      }),
      product({
        supplier_id: "msup_pattersondental_com",
        manufacturer_sku: "200204",
        brand: "Richmond Dental",
        name: 'Braided Cotton Rolls - Medium, 1-1/2" x 3/8", Nonsterile, 2000/Pkg',
        pack_size: "2000/Pkg",
      }),
      product({
        supplier_id: "msup_darbydental_com",
        manufacturer_sku: "216206",
        brand: "Richmond Dental",
        name: 'Econo Rolls, 3/8" x 1 1/2", Medium, 2000/Box, NonSterile',
        pack_size: "2000/Box",
      }),
      product({
        supplier_id: "msup_darbydental_com",
        manufacturer_sku: "200204",
        brand: "Richmond Dental",
        name: 'Braided Cotton Rolls, Medium Dia. Junior Pack, 1 1/2", 2000/Pkg',
        pack_size: "2000/Pkg",
      }),
    ]
    const result = runMatching(rows.map(normalizeProduct))
    expect(result.clusters.map((c) => c.members.length).sort()).toEqual([2, 2])
  })

  it("does not let a size-less bridge collapse Small and X-Small into one canonical", () => {
    // The family code UF524 sits in every name so the size-less "parent"
    // listing matches both sizes (name-embedded-SKU); transitively unioning
    // those edges is what used to fold the whole size ladder into one product.
    const small1 = product({
      supplier_id: "msup_darbydental_com",
      manufacturer_sku: "UF524S",
      brand: "Microflex",
      name: "Microflex Ultraform UF524 Nitrile Gloves Small 300/Box",
      price_cents: 1200,
    })
    const small2 = product({
      supplier_id: "msup_dentalcity_com",
      manufacturer_sku: "UF524S",
      brand: "Microflex",
      name: "Microflex Ultraform UF524 Nitrile Gloves Small 300/Box",
      price_cents: 1150,
    })
    const xsmall1 = product({
      supplier_id: "msup_darbydental_com",
      manufacturer_sku: "UF524XS",
      brand: "Microflex",
      name: "Microflex Ultraform UF524 Nitrile Gloves X-Small 300/Box",
      price_cents: 1200,
    })
    const xsmall2 = product({
      supplier_id: "msup_dentalcity_com",
      manufacturer_sku: "UF524XS",
      brand: "Microflex",
      name: "Microflex Ultraform UF524 Nitrile Gloves X-Small 300/Box",
      price_cents: 1150,
    })
    const sizeless = product({
      supplier_id: "msup_pattersondental_com",
      manufacturer_sku: "UF524",
      brand: "Microflex",
      name: "Microflex Ultraform UF524 Nitrile Gloves 300/Box",
      price_cents: 1180,
    })
    const result = runMatching(
      [small1, small2, xsmall1, xsmall2, sizeless].map(normalizeProduct)
    )
    const clusterOf = (id: string) =>
      result.clusters.find((c) => c.members.some((m) => m.row.id === id))
    const smallCluster = clusterOf(small1.id)
    const xsmallCluster = clusterOf(xsmall1.id)
    // Each size keeps its own canonical, and they are not the same cluster.
    expect(smallCluster).toBeDefined()
    expect(xsmallCluster).toBeDefined()
    expect(smallCluster).not.toBe(xsmallCluster)
    expect(smallCluster!.members.map((m) => m.row.id)).toContain(small2.id)
    expect(smallCluster!.members.map((m) => m.row.id)).not.toContain(xsmall1.id)
    expect(xsmallCluster!.members.map((m) => m.row.id)).toContain(xsmall2.id)
  })
})

describe("offer availability", () => {
  const ctx = { pool: {} as never, supplierNameById: new Map([["msup_test_com", "Test Supplier"]]) }

  it("carries the snapshot availability onto each offer", () => {
    const item = normalizeProduct(product({ name: "Nitrile Exam Gloves Large", price_cents: 1000 }))
    const members = [
      product({ name: "Nitrile Exam Gloves Large", price_cents: 1000, availability: "backordered" }),
    ]
    const [offer] = buildOffers(ctx, item, members)
    expect(offer.availability).toBe("backordered")
  })

  it("defaults to 'unknown' when the snapshot has no stock signal", () => {
    const item = normalizeProduct(product({ name: "Nitrile Exam Gloves Large", price_cents: 1000 }))
    const members = [product({ name: "Nitrile Exam Gloves Large", price_cents: 1200 })]
    const [offer] = buildOffers(ctx, item, members)
    expect(offer.availability).toBe("unknown")
  })

  it("does not recommend a backordered offer over an orderable one, even if cheaper", () => {
    const item = normalizeProduct(product({ name: "Nitrile Exam Gloves Large", price_cents: 1500 }))
    const members = [
      product({ supplier_id: "msup_test_com", name: "Nitrile Exam Gloves Large", price_cents: 1000, availability: "backordered" }),
      product({ supplier_id: "msup_test_com", name: "Nitrile Exam Gloves Large", price_cents: 1200, availability: "in_stock" }),
    ]
    const offers = buildOffers(ctx, item, members)
    expect(offers[0].availability).toBe("in_stock")
    expect(offers[0].price_cents).toBe(1200)
  })
})

describe("category selection", () => {
  it("prefers a specific category over the 'Dental supplies' catch-all", () => {
    // The X-Small glove variant: one specific tag, two catch-all tags. The
    // catch-all is more numerous, but the specific category should win so the
    // variant matches its siblings.
    expect(pickCategory(["Gloves", "Dental supplies", "Dental supplies"])).toBe("Gloves")
  })

  it("falls back to the catch-all when no member has a specific category", () => {
    expect(pickCategory(["Dental supplies", "", "Dental supplies"])).toBe("Dental supplies")
  })

  it("picks the most common specific category, ignoring the catch-all", () => {
    expect(pickCategory(["Gloves", "Gloves", "Masks", "Dental supplies"])).toBe("Gloves")
  })
})
