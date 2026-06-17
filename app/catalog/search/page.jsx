import Link from "next/link"
import { getCatalogProducts, formatMoney, formatPriceRange, normalizeParam, availabilityLabel } from "../data"

export const metadata = {
  title: "Catalog search",
  description: "Search canonical dental products and supplier offers.",
}

function selectOptions(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function buildSearchHref(params) {
  const url = new URL("/catalog/search", "http://localhost")
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value)
    }
  })
  return `${url.pathname}${url.search}`
}

export default async function CatalogSearchPage({ searchParams }) {
  const resolvedSearchParams = await searchParams
  const q = normalizeParam(resolvedSearchParams?.q)
  const category = normalizeParam(resolvedSearchParams?.category)
  const supplier = normalizeParam(resolvedSearchParams?.supplier)

  const catalog = await getCatalogProducts({
    q,
    category,
    supplier,
    limit: q || category || supplier ? 50 : 24,
  })

  const products = catalog.products
  const categoryOptions = selectOptions(products.map((entry) => entry.category))
  const supplierOptions = selectOptions(
    products.flatMap((product) => product.offers?.map((offer) => offer.supplier_name) || [])
  )

  return (
    <main className="catalog-page">
      <section className="catalog-toolbar">
        <div>
          <p className="eyebrow">Catalog search</p>
          <h1>{q || category || supplier ? "Filtered listing" : "All products"}</h1>
          <p>{catalog.count} canonical products matched.</p>
        </div>
        <Link className="secondary-action compact" href="/catalog">
          Back to categories
        </Link>
      </section>

      <form className="catalog-filter-bar" action="/catalog/search" method="get">
        <label>
          <span>Search</span>
          <input name="q" type="search" defaultValue={q} placeholder="Search products" />
        </label>
        <label>
          <span>Category</span>
          <select name="category" defaultValue={category}>
            <option value="">All categories</option>
            {categoryOptions.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Supplier</span>
          <select name="supplier" defaultValue={supplier}>
            <option value="">All suppliers</option>
            {supplierOptions.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <button className="primary-action" type="submit">Apply filters</button>
      </form>

      {(q || category || supplier) && (
        <div className="catalog-active-filters">
          {q && <Link href={buildSearchHref({ category, supplier })} className="filter-chip">Search: {q}</Link>}
          {category && <Link href={buildSearchHref({ q, supplier })} className="filter-chip">Category: {category}</Link>}
          {supplier && <Link href={buildSearchHref({ q, category })} className="filter-chip">Supplier: {supplier}</Link>}
        </div>
      )}

      <section className="catalog-results-grid">
        {products.map((product) => {
          const best = product.best_offer
          const priceRange = formatPriceRange(product.price_range_cents, product.offer_count)
          return (
            <article className="catalog-result-card" key={product.id}>
              <Link className="catalog-result-link" href={`/app/product/${product.handle}`}>
                <div className="catalog-result-image">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} loading="lazy" />
                  ) : (
                    <div className="catalog-result-placeholder">No image</div>
                  )}
                </div>
                <div className="catalog-result-copy">
                  <div className="catalog-result-topline">
                    <span className="catalog-category">{product.category}</span>
                    <span className="catalog-result-count">{product.offer_count} offer{product.offer_count === 1 ? "" : "s"}</span>
                  </div>
                  <h2>{product.name}</h2>
                  <p>{product.description || product.attributes_text || "Canonical product"}</p>
                  <div className="catalog-result-meta">
                    <span>{best?.supplier_name || "Supplier pending"}</span>
                    <span>{availabilityLabel(best?.availability)}</span>
                  </div>
                  <div className="catalog-result-price">
                    <strong>{best ? formatMoney(best.price_cents) : "Price pending"}</strong>
                    <small>{priceRange}</small>
                  </div>
                </div>
              </Link>
            </article>
          )
        })}
      </section>

      {!products.length && (
        <div className="empty-state">
          <strong>No matching products</strong>
          <span>Try gloves, burs, bibs, impression material, or anesthetics.</span>
        </div>
      )}
    </main>
  )
}
