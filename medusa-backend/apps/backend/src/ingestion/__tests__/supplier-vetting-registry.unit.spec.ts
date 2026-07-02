import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  findUsableSupplierCatalogSource,
  loadUsableSupplierCatalogSources,
} from "../supplier-vetting"

const entry = {
  supplier_id: "msup_example_com",
  supplier_name: "Example Dental",
  slug: "example",
  website_url: "https://example.com",
  source_catalog: "example-website-public",
  source_type: "website",
  source_url: "https://example.com",
  classification: "catalog_candidate",
  confidence_score: 0.9,
  source_company_name: "Example Dental, Inc.",
  notes: "test entry",
}

describe("vetting registry loader", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "supplier-vetting-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("loads entries from *-catalog-sources.json files and skips other files", () => {
    writeFileSync(join(dir, "example-catalog-sources.json"), JSON.stringify([entry]))
    writeFileSync(join(dir, "unrelated.json"), JSON.stringify([{ supplier_id: "msup_nope" }]))
    writeFileSync(
      join(dir, "not-array-catalog-sources.json"),
      JSON.stringify({ supplier_id: "msup_object" })
    )

    const loaded = loadUsableSupplierCatalogSources(dir)
    expect(loaded.map((e) => e.supplier_id)).toEqual(["msup_example_com"])
  })

  it("throws on invalid JSON instead of silently skipping the file", () => {
    writeFileSync(join(dir, "broken-catalog-sources.json"), "{not json")
    expect(() => loadUsableSupplierCatalogSources(dir)).toThrow(/invalid JSON/)
  })

  it("finds an entry by supplier_id", () => {
    writeFileSync(join(dir, "example-catalog-sources.json"), JSON.stringify([entry]))
    expect(findUsableSupplierCatalogSource("msup_example_com", dir)?.slug).toBe("example")
    expect(findUsableSupplierCatalogSource("msup_missing_com", dir)).toBeUndefined()
  })

  it("loads every real vetting file (registry stays parseable)", () => {
    const real = loadUsableSupplierCatalogSources()
    expect(real.length).toBeGreaterThan(0)
    for (const loaded of real) {
      expect(typeof loaded.supplier_id).toBe("string")
      expect(loaded.supplier_id).toMatch(/^msup_/)
    }
  })
})
