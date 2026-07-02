import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"

function latestSnapshotsByProduct(snapshots: Awaited<ReturnType<MedMKPModuleService["listSupplierPriceSnapshots"]>>) {
  return snapshots.reduce((acc, snapshot) => {
    const existing = acc.get(snapshot.supplier_product_id)

    if (
      !existing ||
      new Date(snapshot.captured_at).getTime() >
        new Date(existing.captured_at).getTime()
    ) {
      acc.set(snapshot.supplier_product_id, snapshot)
    }

    return acc
  }, new Map<string, (typeof snapshots)[number]>())
}

// Paged supplier-product inspector. This used to load the ENTIRE catalog —
// every supplier product, every price snapshot, and every canonical match
// (~1.4M rows) — to filter and join in memory, which allocates far more than
// the V8 heap on any instance size we run: a single request reliably OOM'd
// (exit 134) the production backend. Filter and page in the database instead,
// and hydrate snapshots/matches for just the returned page.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const url = new URL(req.url, "http://localhost")
  const supplierId = url.searchParams.get("supplier_id")
  const sourceCatalog = url.searchParams.get("source_catalog")
  const limitParam = Number(url.searchParams.get("limit"))
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50
  const offsetParam = Number(url.searchParams.get("offset"))
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0

  const filters: Record<string, unknown> = {}
  if (supplierId) {
    filters.supplier_id = supplierId
  }
  if (sourceCatalog) {
    filters.source_catalog = sourceCatalog
  }

  const [products, count] = await medmkp.listAndCountSupplierProducts(filters, {
    take: limit,
    skip: offset,
  })

  const productIds = products.map((product) => product.id)
  const [suppliers, priceSnapshots, matches] = productIds.length
    ? await Promise.all([
        medmkp.listSuppliers(),
        medmkp.listSupplierPriceSnapshots({ supplier_product_id: productIds }),
        medmkp.listCanonicalProductMatches({ supplier_product_id: productIds }),
      ])
    : [[], [], []]
  const latestPrices = latestSnapshotsByProduct(priceSnapshots)
  const matchByProduct = new Map<string, (typeof matches)[number]>()
  for (const match of matches) {
    if (!matchByProduct.has(match.supplier_product_id)) {
      matchByProduct.set(match.supplier_product_id, match)
    }
  }

  res.json({
    count,
    supplier_products: products.map((product) => ({
      ...product,
      supplier: suppliers.find((supplier) => supplier.id === product.supplier_id),
      latest_price: latestPrices.get(product.id),
      canonical_match: matchByProduct.get(product.id),
    })),
  })
}
