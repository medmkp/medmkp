import { assertCatalogReplaceNotDestructive } from "../ingest-supplier-catalogs"

const base = {
  supplierId: "msup_dcdental_com",
  sourceCatalog: "dc-dental-website-public",
}

describe("assertCatalogReplaceNotDestructive (delete-and-replace backstop)", () => {
  it("blocks a partial that would wipe an established catalog", () => {
    // The DC Dental incident: 1,002 rows about to replace 39,559.
    expect(() =>
      assertCatalogReplaceNotDestructive({
        ...base,
        existingCount: 39559,
        newCount: 1002,
        allowCatalogShrink: false,
      })
    ).toThrow(/Refusing to replace/i)
  })

  it("allows a normal refresh of similar size", () => {
    expect(() =>
      assertCatalogReplaceNotDestructive({
        ...base,
        existingCount: 39559,
        newCount: 39700,
        allowCatalogShrink: false,
      })
    ).not.toThrow()
  })

  it("does not block first-time / tiny catalogs", () => {
    expect(() =>
      assertCatalogReplaceNotDestructive({
        ...base,
        existingCount: 0,
        newCount: 5,
        allowCatalogShrink: false,
      })
    ).not.toThrow()
    expect(() =>
      assertCatalogReplaceNotDestructive({
        ...base,
        existingCount: 40,
        newCount: 1,
        allowCatalogShrink: false,
      })
    ).not.toThrow()
  })

  it("honors --allow-catalog-shrink for intentional large removals", () => {
    expect(() =>
      assertCatalogReplaceNotDestructive({
        ...base,
        existingCount: 39559,
        newCount: 1002,
        allowCatalogShrink: true,
      })
    ).not.toThrow()
  })
})
