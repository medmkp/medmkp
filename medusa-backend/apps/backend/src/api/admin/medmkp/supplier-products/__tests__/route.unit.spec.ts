import { GET } from "../route"

// The inspector must page in the database and hydrate snapshots/matches for
// just the returned page. The previous handler listed ALL supplier products,
// price snapshots, and canonical matches (~1.4M rows in production) on every
// request, which reliably OOM'd the backend — these tests pin the bounded
// query shape so it can't regress.

const PRODUCTS = [
  { id: "sp_1", supplier_id: "sup_a", source_catalog: "cat_a" },
  { id: "sp_2", supplier_id: "sup_b", source_catalog: "cat_b" },
]

function makeService() {
  const service = {
    listAndCountSupplierProducts: jest.fn(async () => [PRODUCTS, 435248]),
    listSuppliers: jest.fn(async () => [{ id: "sup_a", name: "Supplier A" }]),
    listSupplierPriceSnapshots: jest.fn(async () => [
      {
        supplier_product_id: "sp_1",
        captured_at: "2026-07-01T00:00:00Z",
        price_cents: 1000,
      },
      {
        supplier_product_id: "sp_1",
        captured_at: "2026-07-02T00:00:00Z",
        price_cents: 1100,
      },
    ]),
    listCanonicalProductMatches: jest.fn(async () => [
      { supplier_product_id: "sp_2", canonical_product_id: "mcp_1" },
    ]),
  }
  return service
}

function run(service: any, query = "") {
  const req: any = {
    url: `/admin/medmkp/supplier-products${query ? `?${query}` : ""}`,
    scope: { resolve: () => service },
  }
  let body: any
  const res: any = { json: (payload: any) => { body = payload } }
  return GET(req, res).then(() => body)
}

describe("GET /admin/medmkp/supplier-products", () => {
  it("pages in the database and scopes snapshot/match loads to the page", async () => {
    const service = makeService()
    const body = await run(service)

    expect(service.listAndCountSupplierProducts).toHaveBeenCalledWith(
      {},
      { take: 50, skip: 0 }
    )
    // Snapshots and matches are fetched for the page's ids only — never the
    // whole table.
    expect(service.listSupplierPriceSnapshots).toHaveBeenCalledWith({
      supplier_product_id: ["sp_1", "sp_2"],
    })
    expect(service.listCanonicalProductMatches).toHaveBeenCalledWith({
      supplier_product_id: ["sp_1", "sp_2"],
    })

    expect(body.count).toBe(435248)
    expect(body.supplier_products).toHaveLength(2)
    expect(body.supplier_products[0].latest_price.price_cents).toBe(1100)
    expect(body.supplier_products[0].supplier.name).toBe("Supplier A")
    expect(body.supplier_products[1].canonical_match.canonical_product_id).toBe("mcp_1")
  })

  it("pushes filters into the query and caps the limit", async () => {
    const service = makeService()
    await run(service, "supplier_id=sup_a&source_catalog=cat_a&limit=100000&offset=25")

    expect(service.listAndCountSupplierProducts).toHaveBeenCalledWith(
      { supplier_id: "sup_a", source_catalog: "cat_a" },
      { take: 200, skip: 25 }
    )
  })
})
