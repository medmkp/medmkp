import { attachInventoryPrices } from "../inventory"

// A minimal fake of the slice of MedMKPModuleService attachInventoryPrices uses.
function fakeMedmkp(matches: any[], supplierProducts: any[], snapshots: any[]) {
  return {
    listCanonicalProductMatches: async (_f: any) => matches,
    listSupplierProducts: async (_f: any) => supplierProducts,
    listSupplierPriceSnapshots: async (_f: any) => snapshots,
  } as any
}

describe("attachInventoryPrices", () => {
  it("computes a [lowest, highest] range across matched supplier offers", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1" }]
    const medmkp = fakeMedmkp(
      [
        { canonical_product_id: "can_1", supplier_product_id: "sp_1", match_status: "exact" },
        { canonical_product_id: "can_1", supplier_product_id: "sp_2", match_status: "variant" },
      ],
      [
        { id: "sp_1", supplier_id: "msup_a" },
        { id: "sp_2", supplier_id: "msup_b" },
      ],
      [
        { supplier_product_id: "sp_1", price_cents: 1200, captured_at: "2026-01-01" },
        { supplier_product_id: "sp_2", price_cents: 900, captured_at: "2026-01-01" },
      ]
    )
    const out = await attachInventoryPrices(medmkp, items)
    expect(out[0].price_range_cents).toEqual({ lowest: 900, highest: 1200 })
  })

  it("uses the latest snapshot per supplier product", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1" }]
    const medmkp = fakeMedmkp(
      [{ canonical_product_id: "can_1", supplier_product_id: "sp_1", match_status: "exact" }],
      [{ id: "sp_1", supplier_id: "msup_a" }],
      [
        { supplier_product_id: "sp_1", price_cents: 1500, captured_at: "2026-01-01" },
        { supplier_product_id: "sp_1", price_cents: 1100, captured_at: "2026-02-01" },
      ]
    )
    const out = await attachInventoryPrices(medmkp, items)
    expect(out[0].price_range_cents).toEqual({ lowest: 1100, highest: 1100 })
  })

  it("excludes marketplace (Amazon/Alibaba) offers from the range", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1" }]
    const medmkp = fakeMedmkp(
      [
        { canonical_product_id: "can_1", supplier_product_id: "sp_1", match_status: "exact" },
        { canonical_product_id: "can_1", supplier_product_id: "sp_mp", match_status: "exact" },
      ],
      [
        { id: "sp_1", supplier_id: "msup_a" },
        { id: "sp_mp", supplier_id: "msup_amazon" },
      ],
      [
        { supplier_product_id: "sp_1", price_cents: 1000, captured_at: "2026-01-01" },
        { supplier_product_id: "sp_mp", price_cents: 50, captured_at: "2026-01-01" },
      ]
    )
    const out = await attachInventoryPrices(medmkp, items)
    expect(out[0].price_range_cents).toEqual({ lowest: 1000, highest: 1000 })
  })

  it("ignores needs_review / substitute matches", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1" }]
    const medmkp = fakeMedmkp(
      [{ canonical_product_id: "can_1", supplier_product_id: "sp_1", match_status: "needs_review" }],
      [{ id: "sp_1", supplier_id: "msup_a" }],
      [{ supplier_product_id: "sp_1", price_cents: 1000, captured_at: "2026-01-01" }]
    )
    const out = await attachInventoryPrices(medmkp, items)
    expect(out[0].price_range_cents).toBeNull()
  })

  it("returns null for a matched item whose offers have no price snapshot", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1" }]
    const medmkp = fakeMedmkp(
      [{ canonical_product_id: "can_1", supplier_product_id: "sp_1", match_status: "exact" }],
      [{ id: "sp_1", supplier_id: "msup_a" }],
      []
    )
    const out = await attachInventoryPrices(medmkp, items)
    expect(out[0].price_range_cents).toBeNull()
  })

  it("returns null for an unmatched item without querying", async () => {
    const items = [{ id: "inv_1", canonical_product_id: null }]
    let queried = false
    const medmkp = {
      listCanonicalProductMatches: async () => {
        queried = true
        return []
      },
      listSupplierProducts: async () => [],
      listSupplierPriceSnapshots: async () => [],
    } as any
    const out = await attachInventoryPrices(medmkp, items)
    expect(out[0].price_range_cents).toBeNull()
    expect(queried).toBe(false)
  })
})
