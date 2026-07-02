import { summarizeMatviewHealth, checkMatviewHealth } from "../matview-health"

describe("summarizeMatviewHealth", () => {
  it("reports clean when every medmkp_* matview is populated", () => {
    const health = summarizeMatviewHealth([
      { matviewname: "medmkp_supplier_current_price", ispopulated: true },
      { matviewname: "medmkp_category_catalog_listing", ispopulated: true },
    ])
    expect(health).toEqual({ ok: true, unpopulated: [], checked: 2 })
  })

  it("flags a deployed-but-never-refreshed matview (the #608 case)", () => {
    const health = summarizeMatviewHealth([
      { matviewname: "medmkp_supplier_current_price", ispopulated: true },
      { matviewname: "medmkp_category_catalog_listing", ispopulated: false },
    ])
    expect(health.ok).toBe(false)
    expect(health.unpopulated).toEqual(["medmkp_category_catalog_listing"])
    expect(health.checked).toBe(2)
  })

  it("lists multiple unpopulated views sorted for stable output", () => {
    const health = summarizeMatviewHealth([
      { matviewname: "medmkp_supplier_catalog_listing", ispopulated: false },
      { matviewname: "medmkp_category_catalog_listing", ispopulated: false },
    ])
    expect(health.unpopulated).toEqual([
      "medmkp_category_catalog_listing",
      "medmkp_supplier_catalog_listing",
    ])
    expect(health.ok).toBe(false)
  })

  it("is clean (not broken) when there are no medmkp_* matviews at all", () => {
    expect(summarizeMatviewHealth([])).toEqual({ ok: true, unpopulated: [], checked: 0 })
  })
})

describe("checkMatviewHealth", () => {
  it("queries pg_matviews and summarizes the result", async () => {
    const pool: any = {
      query: jest.fn(async () => ({
        rows: [{ matviewname: "medmkp_category_catalog_listing", ispopulated: false }],
      })),
    }
    const health = await checkMatviewHealth(pool)
    expect(health.ok).toBe(false)
    expect(health.unpopulated).toEqual(["medmkp_category_catalog_listing"])
    const sql = pool.query.mock.calls[0][0] as string
    expect(sql).toMatch(/pg_matviews/)
    expect(sql).toMatch(/medmkp/)
  })

  it("degrades to unknown (ok, with error) rather than throwing when the probe fails", async () => {
    const pool: any = {
      query: jest.fn(async () => {
        throw new Error("permission denied for pg_matviews")
      }),
    }
    const health = await checkMatviewHealth(pool)
    expect(health.ok).toBe(true)
    expect(health.checked).toBe(0)
    expect(health.error).toMatch(/permission denied/)
  })
})
