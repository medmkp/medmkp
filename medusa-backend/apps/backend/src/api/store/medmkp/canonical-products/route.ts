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

function normalize(value: string | null) {
  return value?.trim().toLowerCase() || ""
}

function offerPriceRange(offers: {
  price_cents: number
}[]) {
  if (!offers.length) {
    return null
  }

  const prices = offers.map((offer) => offer.price_cents).sort((a, b) => a - b)
  return {
    lowest: prices[0],
    highest: prices[prices.length - 1],
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const url = new URL(req.url, "http://localhost")
  const q = url.searchParams.get("q")?.trim()
  const handle = normalize(url.searchParams.get("handle"))
  const category = normalize(url.searchParams.get("category"))
  const supplier = normalize(url.searchParams.get("supplier"))
  const limitParam = Number(url.searchParams.get("limit"))
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 50)
      : 10
  const offsetParam = Number(url.searchParams.get("offset"))
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0

  // Filter at the database instead of loading the entire canonical catalog and
  // filtering in memory. The previous approach fetched every canonical product
  // on each request (~20s in production on the small Render instance), which
  // made both this product page and search crawl. $ilike/$or/$and reproduce the
  // earlier substring/equality matching, but the database does the work.
  const where: Record<string, any>[] = []
  if (handle) {
    where.push({ $or: [{ handle: { $ilike: handle } }, { id: { $ilike: handle } }] })
  }
  if (q) {
    const term = `%${q}%`
    // Restrict to the trigram-indexed columns so Postgres can use the pg_trgm GIN
    // indexes (name/handle/category, added in Migration20260617190000). Including
    // description/attributes_text/unit_of_measure — which have no trgm index —
    // forces a full seq scan (~1.8s vs ~0.8ms).
    where.push({
      $or: [
        { name: { $ilike: term } },
        { handle: { $ilike: term } },
        { category: { $ilike: term } },
      ],
    })
  }
  if (category) {
    where.push({ category: { $ilike: category } })
  }

  const productFilters =
    where.length === 0 ? {} : where.length === 1 ? where[0] : { $and: where }

  // Cap how many rows we pull + enrich for browse/search. A category like
  // "Instruments" has tens of thousands of products; loading and enriching all
  // of them just to slice off one page makes the catalog crawl. A handle lookup
  // targets a single product, so it is never capped. (Mirrors the bounded
  // candidate fetch in /medmkp/products/search.)
  const listOptions = handle ? undefined : { take: 600 }
  const filteredCanonicalProducts = await medmkp.listCanonicalProducts(
    productFilters as any,
    listOptions as any
  )

  if (!filteredCanonicalProducts.length) {
    res.json({ count: 0, canonical_products: [] })
    return
  }

  const matches = await medmkp.listCanonicalProductMatches({
    canonical_product_id: filteredCanonicalProducts.map((product) => product.id),
  })
  const supplierProductIds = [
    ...new Set(matches.map((match) => match.supplier_product_id)),
  ]

  const [supplierProducts, priceSnapshots, suppliers] = supplierProductIds.length
    ? await Promise.all([
        medmkp.listSupplierProducts({ id: supplierProductIds }),
        medmkp.listSupplierPriceSnapshots({
          supplier_product_id: supplierProductIds,
        }),
        medmkp.listSuppliers(),
      ])
    : [[], [], []]
  const latestPrices = latestSnapshotsByProduct(priceSnapshots)
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))

  const enriched = filteredCanonicalProducts.map((product) => {
    const offers = matches
      .filter(
        (match) =>
          match.canonical_product_id === product.id &&
          match.match_status !== "unmatched"
      )
      .map((match) => {
        const supplierProduct = supplierProducts.find(
          (candidate) => candidate.id === match.supplier_product_id
        )
        const latestPrice = latestPrices.get(match.supplier_product_id)

        if (!supplierProduct || !latestPrice) {
          return null
        }

        const supplier = supplierById.get(supplierProduct.supplier_id)

        return {
          supplier_product_id: supplierProduct.id,
          supplier_id: supplierProduct.supplier_id,
          supplier_name: supplier?.name ?? "Unknown supplier",
          sku: supplierProduct.sku,
          name: supplierProduct.name,
          brand: supplierProduct.brand,
          image_url: supplierProduct.image_url || "",
          product_url: supplierProduct.product_url || "",
          price_cents: latestPrice.price_cents,
          availability: latestPrice.availability,
          match_status: match.match_status,
        }
      })
      .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer))
      .sort((a, b) => a.price_cents - b.price_cents)

    const bestOffer = offers[0] ?? null
    const range = offerPriceRange(offers)
    const imageUrl = bestOffer?.image_url || offers.find((offer) => offer.image_url)?.image_url || ""

    return {
      ...product,
      offer_count: offers.length,
      best_offer: bestOffer,
      offers,
      image_url: imageUrl,
      price_range_cents: range,
    }
  })

  const visible = enriched.filter((product) => {
    if (supplier) {
      const matched = product.offers.some((offer) =>
        [offer.supplier_name, offer.supplier_id, offer.brand]
          .filter(Boolean)
          .some((value) => normalize(String(value)).includes(supplier))
      )

      if (!matched) {
        return false
      }
    }

    return true
  })

  const sorted = visible.sort((a, b) => {
    const aPrice = a.best_offer?.price_cents ?? Number.MAX_SAFE_INTEGER
    const bPrice = b.best_offer?.price_cents ?? Number.MAX_SAFE_INTEGER
    if (aPrice !== bPrice) {
      return aPrice - bPrice
    }

    return a.name.localeCompare(b.name)
  })

  const paged = sorted.slice(offset, offset + limit)

  res.json({
    count: visible.length,
    canonical_products: paged,
  })
}
