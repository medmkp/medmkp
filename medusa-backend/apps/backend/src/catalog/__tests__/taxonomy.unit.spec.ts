import { classifyTaxonomy, displayTaxonomyCategory } from "../taxonomy"

describe("catalog taxonomy normalization", () => {
  it("maps supplier aliases into buyer-facing departments", () => {
    expect(classifyTaxonomy({ category: "Burs", name: "NeoDiamond FG Round Bur" })).toMatchObject({
      department: "Burs & Diamonds",
      subcategory: "Diamond Burs",
    })
    expect(classifyTaxonomy({ category: "Cosmetic Dentistry", name: "Flowable Composite A2" })).toMatchObject({
      department: "Composites & Restoratives",
      subcategory: "Composite",
    })
  })

  it("rescues generic supplier categories using product-name evidence", () => {
    expect(classifyTaxonomy({ category: "Dental supplies", name: "Self Seal Sterilization Pouch 3.5 x 9" })).toMatchObject({
      department: "Sterilization",
      subcategory: "Sterilization Pouches",
    })
    expect(classifyTaxonomy({ category: "Dental supplies", name: "Lidocaine Local Anesthetic 2% Carpules" })).toMatchObject({
      department: "Anesthetics",
      subcategory: "Local Anesthetic",
    })
  })

  it("formats materialized-view lowercase category keys for the API", () => {
    expect(displayTaxonomyCategory("burs & diamonds")).toBe("Burs & Diamonds")
    expect(displayTaxonomyCategory("x ray and imaging")).toBe("X-Ray & Imaging")
  })

  it("keeps unknown supplier categories in a routable review bucket", () => {
    expect(classifyTaxonomy({ category: "Novelty Drawer Items", name: "Tiny Tooth Treasure Box" })).toMatchObject({
      department: "Other Dental Supplies",
      subcategory: "General Supplies",
    })
  })
})
