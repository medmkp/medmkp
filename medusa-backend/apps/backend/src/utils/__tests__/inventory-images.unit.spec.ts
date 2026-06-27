import { attachInventoryImages } from "../inventory"

// A minimal fake of the slice of MedMKPModuleService attachInventoryImages uses.
function fakeMedmkp(matches: any[], supplierProducts: any[]) {
  return {
    listCanonicalProductMatches: async (_f: any) => matches,
    listSupplierProducts: async (_f: any) => supplierProducts,
  } as any
}

describe("attachInventoryImages", () => {
  it("resolves an item's image from its matched supplier product", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1", photo_url: null }]
    const medmkp = fakeMedmkp(
      [{ canonical_product_id: "can_1", supplier_product_id: "sp_1", match_status: "exact" }],
      [{ id: "sp_1", image_url: "https://cdn/img1.jpg" }]
    )
    const out = await attachInventoryImages(medmkp, items)
    expect(out[0].image_url).toBe("https://cdn/img1.jpg")
  })

  it("prefers a captured photo_url over the catalog image", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1", photo_url: "https://cdn/photo.jpg" }]
    const medmkp = fakeMedmkp(
      [{ canonical_product_id: "can_1", supplier_product_id: "sp_1", match_status: "exact" }],
      [{ id: "sp_1", image_url: "https://cdn/img1.jpg" }]
    )
    const out = await attachInventoryImages(medmkp, items)
    expect(out[0].image_url).toBe("https://cdn/photo.jpg")
  })

  it("falls back to an item's direct supplier product image", async () => {
    const items = [{ id: "inv_1", canonical_product_id: null, supplier_product_id: "sp_1", photo_url: null }]
    const medmkp = fakeMedmkp(
      [],
      [{ id: "sp_1", image_url: "https://cdn/direct.jpg" }]
    )
    const out = await attachInventoryImages(medmkp, items)
    expect(out[0].image_url).toBe("https://cdn/direct.jpg")
  })

  it("skips empty images and takes the first non-empty offer per product", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1", photo_url: null }]
    const medmkp = fakeMedmkp(
      [
        { canonical_product_id: "can_1", supplier_product_id: "sp_blank", match_status: "exact" },
        { canonical_product_id: "can_1", supplier_product_id: "sp_2", match_status: "variant" },
      ],
      [
        { id: "sp_blank", image_url: "" },
        { id: "sp_2", image_url: "https://cdn/img2.jpg" },
      ]
    )
    const out = await attachInventoryImages(medmkp, items)
    expect(out[0].image_url).toBe("https://cdn/img2.jpg")
  })

  it("ignores needs_review / substitute matches", async () => {
    const items = [{ id: "inv_1", canonical_product_id: "can_1", photo_url: null }]
    const medmkp = fakeMedmkp(
      [{ canonical_product_id: "can_1", supplier_product_id: "sp_1", match_status: "needs_review" }],
      [{ id: "sp_1", image_url: "https://cdn/img1.jpg" }]
    )
    const out = await attachInventoryImages(medmkp, items)
    expect(out[0].image_url).toBeNull()
  })

  it("returns image_url: null for an unmatched item without querying", async () => {
    const items = [{ id: "inv_1", canonical_product_id: null, photo_url: null }]
    let queried = false
    const medmkp = {
      listCanonicalProductMatches: async () => {
        queried = true
        return []
      },
      listSupplierProducts: async () => [],
    } as any
    const out = await attachInventoryImages(medmkp, items)
    expect(out[0].image_url).toBeNull()
    expect(queried).toBe(false)
  })
})
