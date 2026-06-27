"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "./icons";
import { CATALOG_RECENT_KEY, availabilityInfo, cap, catMoney, formatPackLabel, initials, money, normalizePackText, parseAttributes, supplierInitials, supplierLogoSrc, titleCase, variantAxisLabel } from "./lib";
import { CatalogSupplierAvatar, QtyStepper, UomSelect } from "./ui";
import { CATALOG_CATEGORIES, CATALOG_TINTS, bucketCategories, categoryBySlug, departmentForCategory } from "./catalogData";

export function SearchResults({ results, query = "", loading, onNavigate }) {
  const headerLabel = loading && !results.length
    ? "Searching…"
    : results.length ? "Matching canonical products" : "No catalog matches";
  const trimmed = query.trim();
  const catalogHref = trimmed ? `/app/catalog/search?q=${encodeURIComponent(trimmed)}` : "/app/catalog";
  const go = (href) => (event) => { event.preventDefault(); onNavigate?.(href); };
  return (
    <div className="search-results" role="region" aria-label="Catalog search results">
      <div className="search-results-header">
        <strong>{headerLabel}</strong>
        <a className="search-results-link" href={catalogHref} onClick={go(catalogHref)}>View catalog</a>
      </div>
      {results.slice(0, 5).map((result) => {
        const price = typeof result.price_cents === "number"
          ? money.format(result.price_cents / 100)
          : "Price pending";
        const perUnit = typeof result.per_unit_cents === "number"
          ? `${money.format(result.per_unit_cents / 100)}/${result.base_unit || "unit"}`
          : null;
        const href = result.handle ? `/app/product/${result.handle}` : catalogHref;
        const packLabel = formatPackLabel(result.pack_quantity, result.pack_basis, result.base_unit, result.pack_size);

        return (
          <a className="search-result" key={result.id} href={href} onClick={go(href)}>
            <span>
              <strong>{result.name}</strong>
              <small>{result.category || "Uncategorized"} · {result.supplier_name || "Supplier pending"}</small>
            </span>
            <em style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
              <span>{price}</span>
              {perUnit && (
                <small style={{ color: "var(--muted)", fontWeight: 500, fontStyle: "normal" }}>
                  {perUnit}{packLabel ? ` · ${packLabel}` : ""}
                </small>
              )}
            </em>
          </a>
        );
      })}
      {!results.length && !loading && (
        <p>Try gloves, burs, bibs, impression material, or anesthetics.</p>
      )}
    </div>
  );
}


export function CatBestPrice({ best, showBadge }) {
  const perUnit = best && best.unit_comparable && best.unit_price_cents != null ? best.unit_price_cents : null;
  const packLabel = best ? formatPackLabel(best.pack_quantity, best.pack_basis, best.base_unit, best.pack_size) : "";
  return (
    <div className="cat-pt-price">
      {perUnit != null ? (
        <strong>{catMoney(perUnit)}<span className="cat-pt-per"> / {best.base_unit || "ea"}</span></strong>
      ) : (
        <strong>{best ? catMoney(best.price_cents) : "—"}</strong>
      )}
      {perUnit != null && (
        <span className="cat-pt-pack">{catMoney(best.price_cents)}{packLabel ? ` · ${packLabel}` : ""}</span>
      )}
      {showBadge && <span className="cat-pt-badge">Best price</span>}
    </div>
  );
}


export function CatalogStat({ icon, tint, label, value, sub }) {
  return (
    <div className="cat-stat">
      <span className={`cat-stat-icon tint-${tint}`}><Icon name={icon} className="nav-icon" /></span>
      <div>
        <small>{label}</small>
        <strong>{value}{sub && <em>{sub}</em>}</strong>
      </div>
    </div>
  );
}


export function CatalogCard({ category, onNavigate }) {
  const open = () => onNavigate(`/app/catalog/${category.slug}`);
  return (
    <article className="cat-card">
      <button type="button" className="cat-card-open" onClick={open}>
        <span className={`cat-tile tint-${category.tint}`}><Icon name={category.icon} className="nav-icon" /></span>
        <span className="cat-card-headtext">
          <strong>{category.name}</strong>
          <small>{category.description}</small>
        </span>
      </button>
      <p className="cat-card-count">{category.product_count.toLocaleString()} products</p>
      <div className="cat-card-chips">
        {category.subcategories.map((sub) => (
          <button
            key={sub.name}
            type="button"
            className="cat-chip"
            onClick={() => onNavigate(`/app/catalog/${category.slug}?sub=${encodeURIComponent(sub.name)}`)}
          >
            {sub.name}
          </button>
        ))}
      </div>
      <button type="button" className="cat-browse" onClick={open}>
        Browse category
        <Icon name="icon-chevron-right" className="button-icon" />
      </button>
    </article>
  );
}

// In-app catalog landing (/app/catalog). Lives in the app shell so it shares the
// sidebar + topbar. Live category rows roll up into curated departments
// (catalogData.js); the grid, stat row, and right rail are populated from the
// cached /api/catalog + /api/suppliers responses.

export function CatalogView({ onNavigate }) {
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [layout, setLayout] = useState("grid");
  const [recent, setRecent] = useState([]);
  const [showAllSuppliers, setShowAllSuppliers] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/catalog?all=1").then((r) => r.json()).catch(() => ({ categories: [] })),
      fetch("/api/suppliers").then((r) => r.json()).catch(() => ({ suppliers: [] })),
    ]).then(([catRes, supRes]) => {
      if (!active) return;
      setCategories(bucketCategories(catRes.categories || []));
      setSuppliers(
        (supRes.suppliers || [])
          .slice()
          .sort((a, b) => (b.product_count || 0) - (a.product_count || 0))
      );
      setStatus("ready");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      const slugs = JSON.parse(window.localStorage.getItem(CATALOG_RECENT_KEY) || "[]");
      setRecent(slugs.map((slug) => categoryBySlug(slug)).filter(Boolean));
    } catch {
      setRecent([]);
    }
  }, []);

  const totalProducts = categories.reduce((sum, c) => sum + c.product_count, 0);
  const totalSubcategories = CATALOG_CATEGORIES.reduce((sum, c) => sum + c.subcategories.length, 0);
  const popular = categories.slice(0, 6);

  return (
    <div className="cat">
      <nav className="cat-crumb" aria-label="Breadcrumb">
        <span>Products</span>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        <strong>Catalog</strong>
      </nav>
      <h1 className="cat-title">Product Catalog</h1>
      <p className="cat-lede">
        Browse our canonical dental products organized by category. Drill down into subcategories
        to find exactly what you need.
      </p>

      <div className="cat-layout">
        <div className="cat-main">
          <div className="cat-stats">
            <CatalogStat icon="icon-grid" tint="blue" label="Top-level categories" value={categories.length || "—"} />
            <CatalogStat icon="icon-package" tint="green" label="Catalog products" value={totalProducts ? totalProducts.toLocaleString() : "—"} />
            <CatalogStat icon="icon-users" tint="indigo" label="Suppliers covered" value={suppliers.length || "—"} />
            <CatalogStat icon="icon-list" tint="amber" label="Subcategories" value={totalSubcategories} />
          </div>

          <div className="cat-section-head">
            <h2>Top-level categories</h2>
            <div className="cat-viewtoggle" role="group" aria-label="View as">
              <span>View as:</span>
              <button type="button" className={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")} aria-label="Grid view">
                <Icon name="icon-grid" className="button-icon" />
              </button>
              <button type="button" className={layout === "list" ? "active" : ""} onClick={() => setLayout("list")} aria-label="List view">
                <Icon name="icon-list" className="button-icon" />
              </button>
            </div>
          </div>

          {status === "loading" ? (
            <div className="cat-grid grid">
              {Array.from({ length: 8 }).map((_, i) => <div className="cat-card cat-card-skeleton" key={i} />)}
            </div>
          ) : categories.length ? (
            <div className={`cat-grid ${layout}`}>
              {categories.map((category) => (
                <CatalogCard key={category.slug} category={category} onNavigate={onNavigate} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>Catalog unavailable</strong>
              <span>We couldn&rsquo;t load categories right now. Please try again shortly.</span>
            </div>
          )}
        </div>

        <aside className="cat-rail">
          <div className="cat-callout">
            <Icon name="icon-info" className="button-icon" />
            <div>
              <strong>Drill down to find products</strong>
              <p>Pick a category to explore its subcategories and products. Product detail pages open from any listing.</p>
            </div>
          </div>

          <section className="cat-panel">
            <header><h3>Browse by supplier</h3></header>
            <ul className="cat-supplier-list">
              {(showAllSuppliers ? suppliers : suppliers.slice(0, 5)).map((supplier) => (
                <li key={supplier.id}>
                  <button
                    type="button"
                    className="cat-supplier-link"
                    onClick={() => onNavigate(`/app/catalog/supplier/${encodeURIComponent(supplier.id)}`)}
                  >
                    <CatalogSupplierAvatar name={supplier.name} />
                    <span className="cat-supplier-name">{supplier.name}</span>
                    <Icon name="icon-chevron-right" className="button-icon" />
                  </button>
                </li>
              ))}
            </ul>
            {suppliers.length > 5 && (
              <button type="button" className="cat-panel-action" onClick={() => setShowAllSuppliers((open) => !open)}>
                {showAllSuppliers ? "Show fewer suppliers" : `View all suppliers (${suppliers.length})`}
              </button>
            )}
          </section>

          {recent.length > 0 && (
            <section className="cat-panel">
              <header><h3>Recently viewed</h3></header>
              <ul className="cat-recent-list">
                {recent.map((category) => (
                  <li key={category.slug}>
                    <button type="button" onClick={() => onNavigate(`/app/catalog/${category.slug}`)}>
                      <span className={`cat-tile sm tint-${category.tint}`}><Icon name={category.icon} className="nav-icon" /></span>
                      {category.name}
                      <Icon name="icon-chevron-right" className="button-icon" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {popular.length > 0 && (
            <section className="cat-panel">
              <header><h3>Popular categories</h3></header>
              <div className="cat-card-chips">
                {popular.map((category) => (
                  <button key={category.slug} type="button" className="cat-chip" onClick={() => onNavigate(`/app/catalog/${category.slug}`)}>
                    {category.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// In-app search results (/app/catalog/search?q=). Reached from the topbar search
// dropdown ("View catalog" / Enter); self-fetches the same canonical search the
// dropdown uses (higher limit) and lists matches in the category view's table.

export function CatalogSearchView({ query, onNavigate }) {
  const [input, setInput] = useState(query || "");
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState(query ? "loading" : "idle");

  // Keep the refine box in sync when the query changes via the topbar / history.
  useEffect(() => { setInput(query || ""); }, [query]);

  useEffect(() => {
    const q = (query || "").trim();
    if (!q) { setProducts([]); setStatus("idle"); return undefined; }
    const controller = new AbortController();
    setStatus("loading");
    fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=48`, { signal: controller.signal })
      .then((r) => r.json())
      .then(({ canonical_products }) => {
        if (controller.signal.aborted) return;
        setProducts(canonical_products || []);
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setProducts([]);
        setStatus("ready");
      });
    return () => controller.abort();
  }, [query]);

  function submit(event) {
    event.preventDefault();
    const q = input.trim();
    onNavigate(q ? `/app/catalog/search?q=${encodeURIComponent(q)}` : "/app/catalog");
  }

  return (
    <div className="cat">
      <nav className="cat-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => onNavigate("/app/catalog")}>Catalog</button>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        <strong>Search</strong>
      </nav>
      <h1 className="cat-title">{query ? `Results for “${query}”` : "Search the catalog"}</h1>
      <p className="cat-lede">
        {status === "ready"
          ? `${products.length} matching product${products.length === 1 ? "" : "s"}.`
          : "Search canonical dental products across every supplier."}
      </p>

      <form className="cat-search-form" onSubmit={submit}>
        <label className="topbar-search">
          <Icon name="icon-search" className="button-icon" />
          <input
            type="search"
            value={input}
            placeholder="Search products"
            aria-label="Search products"
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button type="submit" className="primary-action compact">Search</button>
      </form>

      {status === "loading" ? (
        <div className="cat-ptable-wrap">
          {Array.from({ length: 6 }).map((_, i) => <div className="cat-pt-skeleton" key={i} />)}
        </div>
      ) : products.length ? (
        <div className="cat-ptable-wrap">
          <table className="cat-ptable">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category / SKU</th>
                <th>Best price</th>
                <th className="cat-pt-num">Suppliers matched</th>
                <th className="cat-pt-act">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const best = product.best_offer;
                const open = product.handle ? () => onNavigate(`/app/product/${product.handle}`) : undefined;
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="cat-pt-product">
                        <span className="cat-pt-thumb">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" loading="lazy" />
                          ) : (
                            <Icon name="icon-image" className="nav-icon" />
                          )}
                        </span>
                        {open ? (
                          <button type="button" className="cat-pt-name" onClick={open}>{product.name}</button>
                        ) : (
                          <span className="cat-pt-name">{product.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="cat-pt-path">
                      <span>{product.category || "Uncategorized"}</span>
                      <em>{best?.sku || "—"}</em>
                    </td>
                    <td>
                      <CatBestPrice best={best} showBadge={false} />
                    </td>
                    <td className="cat-pt-num">{product.offer_count}</td>
                    <td className="cat-pt-act">
                      {open && (
                        <button type="button" className="cat-pt-view" onClick={open}>
                          View product
                          <Icon name="icon-link" className="button-icon" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <strong>{query ? `No products for “${query}”` : "Start typing to search"}</strong>
          <span>Try gloves, burs, bibs, impression material, or anesthetics.</span>
        </div>
      )}
    </div>
  );
}

// Browse by supplier (/app/catalog/supplier/<id>). A flat product table of one
// supplier's catalog, ranked by that supplier's best per-unit price. Backed by
// the medmkp_supplier_catalog_listing read model via /api/canonical-products
// ?supplier=. Each row's price is this supplier's offer; the PDP still shows the
// cross-supplier comparison.
export function CatalogSupplierView({ supplierId, onNavigate }) {
  const PAGE = 48;
  const [supplier, setSupplier] = useState(null);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  // Resolve the supplier's display name for the header.
  useEffect(() => {
    let active = true;
    fetch("/api/suppliers").then((r) => r.json()).catch(() => ({ suppliers: [] }))
      .then(({ suppliers }) => {
        if (!active) return;
        setSupplier((suppliers || []).find((s) => s.id === supplierId) || null);
      });
    return () => { active = false; };
  }, [supplierId]);

  // First page of the supplier's products.
  useEffect(() => {
    if (!supplierId) return undefined;
    const controller = new AbortController();
    setStatus("loading");
    setProducts([]);
    fetch(`/api/canonical-products?supplier=${encodeURIComponent(supplierId)}&limit=${PAGE}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(({ canonical_products, count }) => {
        if (controller.signal.aborted) return;
        setProducts(canonical_products || []);
        setTotal(count || 0);
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setProducts([]);
        setTotal(0);
        setStatus("ready");
      });
    return () => controller.abort();
  }, [supplierId]);

  const loadMore = () => {
    setLoadingMore(true);
    fetch(`/api/canonical-products?supplier=${encodeURIComponent(supplierId)}&limit=${PAGE}&offset=${products.length}`)
      .then((r) => r.json())
      .then(({ canonical_products }) => {
        setProducts((prev) => [...prev, ...(canonical_products || [])]);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const name = supplier?.name || "Supplier";

  return (
    <div className="cat">
      <nav className="cat-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => onNavigate("/app/catalog")}>Catalog</button>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        <span>Suppliers</span>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        <strong>{name}</strong>
      </nav>
      <h1 className="cat-title">{name}</h1>
      <p className="cat-lede">
        {status === "ready"
          ? `${total.toLocaleString()} product${total === 1 ? "" : "s"} from ${name}, ranked by best price.`
          : `Loading ${name}'s catalog…`}
      </p>

      {status === "loading" ? (
        <div className="cat-ptable-wrap">
          {Array.from({ length: 6 }).map((_, i) => <div className="cat-pt-skeleton" key={i} />)}
        </div>
      ) : products.length ? (
        <>
          <div className="cat-ptable-wrap">
            <table className="cat-ptable">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category / SKU</th>
                  <th>Best price</th>
                  <th className="cat-pt-act">Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const best = product.best_offer;
                  const open = product.handle ? () => onNavigate(`/app/product/${product.handle}`) : undefined;
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="cat-pt-product">
                          <span className="cat-pt-thumb">
                            {product.image_url ? (
                              <img src={product.image_url} alt="" loading="lazy" />
                            ) : (
                              <Icon name="icon-image" className="nav-icon" />
                            )}
                          </span>
                          {open ? (
                            <button type="button" className="cat-pt-name" onClick={open}>{product.name}</button>
                          ) : (
                            <span className="cat-pt-name">{product.name}</span>
                          )}
                        </div>
                      </td>
                      <td className="cat-pt-path">
                        <span>{product.category || "Uncategorized"}</span>
                        <em>{best?.sku || "—"}</em>
                      </td>
                      <td>
                        <CatBestPrice best={best} showBadge={false} />
                      </td>
                      <td className="cat-pt-act">
                        {open && (
                          <button type="button" className="cat-pt-view" onClick={open}>
                            View product
                            <Icon name="icon-link" className="button-icon" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {products.length < total && (
            <button type="button" className="cat-pt-all" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : `Load more (${(total - products.length).toLocaleString()} more)`}
              <Icon name="icon-chevron-right" className="button-icon" />
            </button>
          )}
        </>
      ) : (
        <div className="empty-state">
          <strong>No priced products for {name}</strong>
          <span>We don&rsquo;t have current prices from this supplier yet.</span>
          <button type="button" className="secondary-action compact" onClick={() => onNavigate("/app/catalog")}>Back to catalog</button>
        </div>
      )}
    </div>
  );
}

// Category drill-down (/app/catalog/[slug]). Mirrors the catalog landing layout
// scoped to one department: a stat row, a grid of subcategory cards, a popular-
// products table, and a right rail (jump-to box, top suppliers, subcategory
// quick links, recently viewed). Products and stats come from the same
// canonical-products API the search uses; products open the existing PDP.

export function CatalogCategoryView({ slug, onNavigate }) {
  const category = categoryBySlug(slug);
  const [products, setProducts] = useState([]);
  const [productCount, setProductCount] = useState(null);
  const [supplierCount, setSupplierCount] = useState(null);
  const [topSuppliers, setTopSuppliers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [sub, setSub] = useState("");
  const [productLayout, setProductLayout] = useState("list");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [recent, setRecent] = useState([]);
  const productsRef = useRef(null);

  const tintFor = (index) => {
    const base = category ? CATALOG_TINTS.indexOf(category.tint) : 0;
    return CATALOG_TINTS[(Math.max(base, 0) + index) % CATALOG_TINTS.length];
  };

  // Remember this category for the landing page's "Recently viewed" rail, and
  // load the rail's own recent list (excluding the current category).
  useEffect(() => {
    if (!slug) return;
    try {
      const prev = JSON.parse(window.localStorage.getItem(CATALOG_RECENT_KEY) || "[]").filter((s) => s !== slug);
      setRecent(prev.map((s) => categoryBySlug(s)).filter(Boolean).slice(0, 5));
      window.localStorage.setItem(CATALOG_RECENT_KEY, JSON.stringify([slug, ...prev].slice(0, 6)));
    } catch {
      // storage unavailable — non-fatal
    }
  }, [slug]);

  // Seed the active subcategory filter from a ?sub= chip click on the landing.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("sub") || "";
    setSub(initial);
  }, [slug]);

  // Supplier coverage (from the bucketed category summary) + top suppliers for
  // the rail. These don't depend on the active subcategory filter.
  useEffect(() => {
    if (!category) return undefined;
    let active = true;
    Promise.all([
      fetch("/api/catalog?all=1").then((r) => r.json()).catch(() => ({ categories: [] })),
      fetch("/api/suppliers").then((r) => r.json()).catch(() => ({ suppliers: [] })),
    ]).then(([catRes, supRes]) => {
      if (!active) return;
      const bucket = bucketCategories(catRes.categories || []).find((c) => c.slug === slug);
      setSupplierCount(bucket ? bucket.supplier_count : null);
      setTopSuppliers(
        (supRes.suppliers || [])
          .slice()
          .sort((a, b) => (b.product_count || 0) - (a.product_count || 0))
      );
    });
    return () => { active = false; };
  }, [slug, category]);

  useEffect(() => {
    if (!category) { setStatus("missing"); return undefined; }
    // Abort superseded/duplicate fetches (StrictMode double-invoke, filter
    // changes) so we don't pile concurrent heavy queries onto the backend.
    const controller = new AbortController();
    setStatus("loading");
    setShowAllProducts(false);
    // A curated category can own several supplier-named source categories
    // (e.g. Burs & Rotary = "Burs & Diamonds" + "Burs"); fetch each, merge,
    // dedupe, and rank by best offer so the grid spans the whole department.
    // Subcategory filter: send the curated `match` regex (e.g. "scaler|curette")
    // rather than the chip's display label. The label is a plural/compound term
    // ("Scalers & Curettes") that rarely appears verbatim in product names, so a
    // literal substring match returned nothing; the regex matches the real names.
    const subMeta = sub ? category.subcategories.find((s) => s.name === sub) : null;
    const subPattern = subMeta?.match || sub;
    Promise.all(
      category.sources.map((source) => {
        const params = new URLSearchParams({ category: source, limit: "24" });
        if (sub) params.set("pattern", subPattern);
        return fetch(`/api/canonical-products?${params}`, { signal: controller.signal })
          .then((r) => r.json())
          .catch(() => ({ canonical_products: [], count: 0 }));
      })
    ).then((responses) => {
      if (controller.signal.aborted) return;
      const seen = new Set();
      const merged = [];
      let total = 0;
      responses.forEach(({ canonical_products, count }) => {
        total += count || 0;
        (canonical_products || []).forEach((product) => {
          if (seen.has(product.id)) return;
          seen.add(product.id);
          merged.push(product);
        });
      });
      merged.sort((a, b) => (a.best_offer?.price_cents ?? Infinity) - (b.best_offer?.price_cents ?? Infinity));
      setProducts(merged.slice(0, 24));
      setProductCount(total);
      setStatus("ready");
    });
    return () => controller.abort();
  }, [slug, sub, category]);

  if (!category) {
    return (
      <div className="cat">
        <div className="empty-state">
          <strong>Category not found</strong>
          <span>That catalog category doesn&rsquo;t exist.</span>
          <button type="button" className="secondary-action compact" onClick={() => onNavigate("/app/catalog")}>Back to catalog</button>
        </div>
      </div>
    );
  }

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const browseSub = (name) => {
    setSub((prev) => (prev === name ? "" : name));
    requestAnimationFrame(scrollToProducts);
  };
  const visibleProducts = showAllProducts ? products : products.slice(0, 8);
  const bestPrice = products[0]?.best_offer?.price_cents;
  const productsTitle = sub ? `Products in ${sub}` : `Popular products in ${category.name}`;
  const fmt = (value) => (typeof value === "number" ? value.toLocaleString() : "—");
  const viewAllBtn = !showAllProducts && products.length > 8 ? (
    <button type="button" className="cat-pt-all" onClick={() => setShowAllProducts(true)}>
      View all {fmt(productCount)} products in {category.name}
      <Icon name="icon-chevron-right" className="button-icon" />
    </button>
  ) : null;

  return (
    <div className="cat">
      <nav className="cat-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => onNavigate("/app/catalog")}>Products</button>
        <Icon name="icon-chevron-right" className="cat-crumb-sep" />
        {sub ? (
          <button type="button" onClick={() => setSub("")}>{category.name}</button>
        ) : (
          <strong>{category.name}</strong>
        )}
        {sub && (
          <>
            <Icon name="icon-chevron-right" className="cat-crumb-sep" />
            <strong>{sub}</strong>
          </>
        )}
      </nav>
      <div className="cat-cat-head">
        <span className={`cat-tile lg tint-${category.tint}`}><Icon name={category.icon} className="nav-icon" /></span>
        <div>
          <h1 className="cat-title">{category.name}</h1>
          <p className="cat-lede">{category.description}</p>
        </div>
      </div>

      <div className="cat-layout">
        <div className="cat-main">
          <div className="cat-stats">
            <CatalogStat icon="icon-list" tint="blue" label="Subcategories" value={category.subcategories.length} />
            <CatalogStat icon="icon-package" tint="green" label="Products" value={status === "loading" ? "—" : fmt(productCount)} />
            <CatalogStat icon="icon-users" tint="indigo" label="Suppliers covered" value={fmt(supplierCount)} />
            <CatalogStat icon="icon-dollar-circle" tint="amber" label="Best price" value={typeof bestPrice === "number" ? catMoney(bestPrice) : "—"} sub={typeof bestPrice === "number" ? "lowest offer" : null} />
          </div>

          <div className="cat-section-head">
            <h2>Subcategories</h2>
          </div>

          <div className="cat-grid grid">
            {category.subcategories.map((option, index) => (
              <article className={`cat-card ${sub === option.name ? "active" : ""}`} key={option.name}>
                <button type="button" className="cat-card-open" onClick={() => browseSub(option.name)}>
                  <span className={`cat-tile tint-${tintFor(index)}`}><Icon name={category.icon} className="nav-icon" /></span>
                  <span className="cat-card-headtext">
                    <strong>{option.name}</strong>
                    <small>{option.blurb}</small>
                  </span>
                </button>
                <button type="button" className="cat-browse" onClick={() => browseSub(option.name)}>
                  {sub === option.name ? "Clear filter" : "Browse subcategory"}
                  <Icon name="icon-chevron-right" className="button-icon" />
                </button>
              </article>
            ))}
          </div>

          <div className="cat-section-head cat-products-head" ref={productsRef}>
            <h2>{productsTitle}</h2>
            <div className="cat-products-controls">
              {sub && (
                <button type="button" className="cat-clear-filter" onClick={() => setSub("")}>
                  <Icon name="icon-x" className="button-icon" />
                  Clear filter
                </button>
              )}
              <div className="cat-viewtoggle" role="group" aria-label="View as">
                <span>View as:</span>
                <button type="button" className={productLayout === "grid" ? "active" : ""} onClick={() => setProductLayout("grid")} aria-label="Grid view">
                  <Icon name="icon-grid" className="button-icon" />
                </button>
                <button type="button" className={productLayout === "list" ? "active" : ""} onClick={() => setProductLayout("list")} aria-label="List view">
                  <Icon name="icon-list" className="button-icon" />
                </button>
              </div>
            </div>
          </div>

          {status === "loading" ? (
            <div className="cat-ptable-wrap">
              {Array.from({ length: 5 }).map((_, i) => <div className="cat-pt-skeleton" key={i} />)}
            </div>
          ) : products.length ? (
            productLayout === "grid" ? (
            <div className="cat-pgrid-wrap">
              <div className="cat-pgrid">
                {visibleProducts.map((product, index) => {
                  const best = product.best_offer;
                  const open = () => onNavigate(`/app/product/${product.handle}`);
                  return (
                    <article className="cat-pcard" key={product.id}>
                      <button type="button" className="cat-pcard-media" onClick={open} aria-label={`View ${product.name}`}>
                        {product.image_url ? (
                          <img src={product.image_url} alt="" loading="lazy" />
                        ) : (
                          <Icon name="icon-image" className="nav-icon" />
                        )}
                      </button>
                      <div className="cat-pcard-body">
                        <button type="button" className="cat-pcard-name" onClick={open}>{product.name}</button>
                        <span className="cat-pcard-path">
                          {category.name} <Icon name="icon-chevron-right" className="cat-pt-pathsep" /> {product.category}
                        </span>
                        <div className="cat-pcard-foot">
                          <CatBestPrice best={best} showBadge={index === 0 && !sub} />
                          <span className="cat-pcard-suppliers">{product.offer_count} suppliers</span>
                        </div>
                        <button type="button" className="cat-pt-view" onClick={open}>
                          View product
                          <Icon name="icon-link" className="button-icon" />
                        </button>
                      </div>
                      {product.variant_count > 1 && (
                        <span className="cat-pcard-options">{product.variant_count} options</span>
                      )}
                    </article>
                  );
                })}
              </div>
              {viewAllBtn}
            </div>
            ) : (
            <div className="cat-ptable-wrap">
              <table className="cat-ptable">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category path / SKU</th>
                    <th>Best price</th>
                    <th className="cat-pt-num">Suppliers matched</th>
                    <th className="cat-pt-act">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product, index) => {
                    const best = product.best_offer;
                    const open = () => onNavigate(`/app/product/${product.handle}`);
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="cat-pt-product">
                            <span className="cat-pt-thumb">
                              {product.image_url ? (
                                <img src={product.image_url} alt="" loading="lazy" />
                              ) : (
                                <Icon name="icon-image" className="nav-icon" />
                              )}
                            </span>
                            <button type="button" className="cat-pt-name" onClick={open}>{product.name}</button>
                            {product.variant_count > 1 && (
                              <span className="cat-pt-options">{product.variant_count} options</span>
                            )}
                          </div>
                        </td>
                        <td className="cat-pt-path">
                          <span>{category.name} <Icon name="icon-chevron-right" className="cat-pt-pathsep" /> {product.category}</span>
                          <em>{best?.sku || "—"}</em>
                        </td>
                        <td>
                          <CatBestPrice best={best} showBadge={index === 0 && !sub} />
                        </td>
                        <td className="cat-pt-num">{product.offer_count}</td>
                        <td className="cat-pt-act">
                          <button type="button" className="cat-pt-view" onClick={open}>
                            View product
                            <Icon name="icon-link" className="button-icon" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {viewAllBtn}
            </div>
            )
          ) : (
            <div className="empty-state">
              <strong>No products{sub ? ` for ${sub}` : ""}</strong>
              <span>Try a different subcategory or clear the filter.</span>
              {sub && <button type="button" className="secondary-action compact" onClick={() => setSub("")}>Clear filter</button>}
            </div>
          )}
        </div>

        <aside className="cat-rail">
          <div className="cat-callout">
            <Icon name="icon-info" className="button-icon" />
            <div>
              <strong>Drill down or jump to products</strong>
              <p>Explore subcategories to narrow your search, or view all products in {category.name}.</p>
              <div className="cat-callout-actions">
                <button type="button" className="cat-callout-primary" onClick={() => { setSub(""); setShowAllProducts(true); requestAnimationFrame(scrollToProducts); }}>
                  View all {fmt(productCount)} products
                  <Icon name="icon-arrow-right" className="button-icon" />
                </button>
                <button type="button" className="cat-callout-secondary" onClick={() => onNavigate("/app/catalog")}>
                  Back to all categories
                </button>
              </div>
            </div>
          </div>

          {topSuppliers.length > 0 && (
            <section className="cat-panel">
              <header><h3>Top suppliers</h3></header>
              <ul className="cat-supplier-list">
                {topSuppliers.slice(0, 5).map((supplier) => (
                  <li key={supplier.id}>
                    <span className="cat-supplier-avatar">{supplierInitials(supplier.name)}</span>
                    <span className="cat-supplier-name">{supplier.name}</span>
                    <em>{(supplier.product_count || 0).toLocaleString()}</em>
                  </li>
                ))}
              </ul>
              <button type="button" className="cat-panel-action" onClick={() => onNavigate("/app/settings")}>
                View all {topSuppliers.length} suppliers
              </button>
            </section>
          )}

          <section className="cat-panel">
            <header><h3>Subcategories</h3></header>
            <ul className="cat-sublink-list">
              {category.subcategories.map((option) => (
                <li key={option.name}>
                  <button type="button" className={sub === option.name ? "active" : ""} onClick={() => browseSub(option.name)}>
                    {option.name}
                    <Icon name="icon-chevron-right" className="button-icon" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {recent.length > 0 && (
            <section className="cat-panel">
              <header><h3>Recently viewed</h3></header>
              <ul className="cat-recent-list">
                {recent.map((item) => (
                  <li key={item.slug}>
                    <button type="button" onClick={() => onNavigate(`/app/catalog/${item.slug}`)}>
                      <span className={`cat-tile sm tint-${item.tint}`}><Icon name={item.icon} className="nav-icon" /></span>
                      {item.name}
                      <Icon name="icon-chevron-right" className="button-icon" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// Product detail surface reached from search (/app/product/[handle]). Pulls the
// canonical product + supplier offers from the same API the search uses, then
// lays out the comparison, specs, substitutes, and reorder rail.

export function ProductDetail({ handle, onNavigate, onToast, onAddToList, listName, listSummary }) {
  // A product may be a family of size/spec variants. `variants` holds them in
  // selector order; `activeIdx` is the chosen one and drives the whole page.
  const [variants, setVariants] = useState([]);
  const [family, setFamily] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [status, setStatus] = useState("loading");
  const [subs, setSubs] = useState([]);
  const [qty, setQty] = useState(1);
  const [uom, setUom] = useState("Box");
  // Full-screen image viewer (the "View larger image" affordance).
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!handle) {
      setStatus("missing");
      return undefined;
    }

    let live = true;
    setStatus("loading");
    setLightbox(false);
    setActiveIdx(0);

    fetch(`/api/canonical-products?handle=${encodeURIComponent(handle)}`)
      .then((response) => response.json())
      .then(({ canonical_products: products, family: familyInfo }) => {
        if (!live) return;
        const list = products || [];
        if (!list.length) {
          setStatus("missing");
          return;
        }
        // Land on the requested variant; a family handle has no exact match, so
        // default to the first (lowest-ranked) variant.
        const idx = Math.max(
          0,
          list.findIndex((v) => (v.handle || "").toLowerCase() === handle.toLowerCase())
        );
        setVariants(list);
        setFamily(familyInfo || null);
        setActiveIdx(idx);
        setUom(cap(list[idx].unit_of_measure) || "Box");
        setStatus("ready");

        // Comparable products: search by the product's family/type keyword so we
        // surface same-type variants (the curated category is often too narrow).
        const base = list[idx];
        const foundAttrs = parseAttributes(base.attributes_text);
        const term = (familyInfo?.family_name || foundAttrs.family || base.name || "").split(/\s+/)[0];
        if (term) {
          fetch(`/api/canonical-products?q=${encodeURIComponent(term)}&limit=8`)
            .then((response) => response.json())
            .then(({ canonical_products: related }) => {
              if (!live) return;
              setSubs(
                (related || [])
                  .filter(
                    (entry) =>
                      entry.handle !== base.handle &&
                      (!familyInfo || entry.family_id !== familyInfo.family_id)
                  )
                  .slice(0, 3)
              );
            })
            .catch(() => live && setSubs([]));
        }
      })
      .catch(() => live && setStatus("missing"));

    return () => {
      live = false;
    };
  }, [handle]);

  // Switch the selected variant in place (no refetch); keep the URL shareable.
  function selectVariant(index) {
    setActiveIdx(index);
    const nextHandle = variants[index]?.handle;
    if (nextHandle) {
      window.history.replaceState({}, "", `/app/product/${nextHandle}`);
    }
  }

  const product = variants[activeIdx];

  if (status === "loading") {
    return <div className="pdp-state">Loading product&hellip;</div>;
  }

  if (status === "missing" || !product) {
    return (
      <div className="pdp-state">
        <strong>Product not found</strong>
        <p>We couldn&rsquo;t find that product in the catalog.</p>
        <a className="secondary-action compact" href="/app/catalog/search" onClick={(event) => { event.preventDefault(); onNavigate("/app/catalog/search"); }}>Back to search</a>
      </div>
    );
  }

  const attrs = parseAttributes(product.attributes_text);
  // Breadcrumb middle crumb: the curated department this product's live category
  // rolls up into (null when the category doesn't map to one).
  const department = departmentForCategory(product.category);
  const variantGroupLabel = family ? variantAxisLabel(variants) : null;
  // The API returns one offer per supplier variant; collapse to the lowest-priced
  // offer per supplier so the comparison reads as a supplier comparison (one row
  // each) and the "N suppliers" counts stay consistent with the hero badge.
  // Rank suppliers by comparable per-unit price (F1). Offers whose pack is
  // unknown — or whose unit isn't comparable to the rest of the group (F2) —
  // have no trustworthy per-unit price and fall last, ordered by sticker price.
  const offerUnitCost = (offer) =>
    offer.unit_comparable && offer.unit_price_cents != null
      ? offer.unit_price_cents
      : Number.MAX_SAFE_INTEGER;
  const sortedOffers = [...(product.offers || [])].sort((a, b) => {
    const ua = offerUnitCost(a);
    const ub = offerUnitCost(b);
    if (ua !== ub) return ua - ub;
    return (a.price_cents ?? 0) - (b.price_cents ?? 0);
  });
  const seenSuppliers = new Set();
  const offers = sortedOffers.filter((offer) => {
    const key = offer.supplier_id || offer.supplier_name;
    if (seenSuppliers.has(key)) return false;
    seenSuppliers.add(key);
    return true;
  });
  const best = offers[0];
  const supplierCount = offers.length;
  const image = product.image_url || offers.find((offer) => offer.image_url)?.image_url || "";
  const brand = best?.brand || attrs.brands?.[0] || "";
  const packSize = normalizePackText(attrs.pack_sizes?.[0] || best?.name?.match(/(\d+\s*\/\s*[A-Za-z.]+)/)?.[1]) || "—";
  const uomLabel = (uom || "unit").toLowerCase();
  // Whether the group's per-unit prices are comparable (same base unit), and the
  // unit they compare in — drives the "/ ea" labels and the mixed-units note.
  const unitComparable = !!product.unit_comparable;
  const unitBasis = product.unit_comparison_basis || best?.base_unit || "ea";
  const bestPerUnit = best && best.unit_comparable && best.unit_price_cents != null
    ? best.unit_price_cents / 100
    : null;
  const bestUnit = best ? best.price_cents / 100 : null;
  const prices = offers.map((offer) => offer.price_cents);
  const range = prices.length ? { lowest: Math.min(...prices), highest: Math.max(...prices) } : null;
  // Amazon/Alibaba alternatives, kept out of the supplier price comparison above
  // (wholesale/MOQ pricing isn't directly comparable). Shown in their own section.
  const marketplaceListings = product.marketplace_listings || [];

  const chips = [
    attrs.size && ["Size", titleCase(attrs.size)],
    attrs.family && ["Type", titleCase(attrs.family)],
    brand && ["Brand", brand],
    packSize !== "—" && ["Pack", packSize],
    product.category && ["Category", product.category],
  ].filter(Boolean).slice(0, 5);

  const specs = [
    ["Category", product.category],
    ["Unit of measure", cap(product.unit_of_measure)],
    ["Pack size", packSize !== "—" ? packSize : null],
    ["Size", titleCase(attrs.size)],
    ["Type", titleCase(attrs.family)],
    ["Brand", brand],
    ["Suppliers", String(supplierCount)],
    ["Match basis", best?.match_status ? titleCase(best.match_status) : null],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="pdp">
      <div className="pdp-breadcrumb-row">
        <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
          <a href="/app/catalog" onClick={(event) => { event.preventDefault(); onNavigate("/app/catalog"); }}>Products</a>
          {department && (
            <>
              <Icon name="icon-chevron-right" className="nav-icon" />
              <a
                href={`/app/catalog/${department.slug}`}
                onClick={(event) => { event.preventDefault(); onNavigate(`/app/catalog/${department.slug}`); }}
              >
                {department.name}
              </a>
            </>
          )}
          <Icon name="icon-chevron-right" className="nav-icon" />
          <span>{family ? family.family_name : product.name}</span>
        </nav>
        <div className="pdp-top-actions">
          <button className="secondary-action compact" type="button" onClick={() => window.history.back()}>
            <Icon name="icon-chevron-left" className="button-icon" />
            Back
          </button>
          <button className="secondary-action compact" type="button" onClick={() => window.print()}>
            <Icon name="icon-file-text" className="button-icon" />
            Print
          </button>
        </div>
      </div>

      <div className="pdp-layout">
        <div className="pdp-main">
          <section className="crl-card pdp-hero">
            <div className="pdp-hero-media">
              {image ? (
                <img src={image} alt={product.name} onClick={() => setLightbox(true)} style={{ cursor: "zoom-in" }} />
              ) : (
                <div className="pdp-hero-placeholder">No image available</div>
              )}
              {image && (
                <button type="button" className="pdp-view-larger" onClick={() => setLightbox(true)}>
                  <Icon name="icon-search" className="button-icon" />
                  View larger image
                </button>
              )}
            </div>
            <div className="pdp-hero-body">
              <div className="pdp-hero-headline">
                <h1>{family ? family.family_name : product.name}</h1>
                {supplierCount === 0 ? (
                  <span className="pdp-badge muted">
                    <Icon name="icon-info" className="button-icon" />
                    Price not listed{brand ? ` · ${brand.toLowerCase().includes("schein") ? "Henry Schein" : brand}` : ""}
                  </span>
                ) : (
                  <span className="pdp-badge ok">
                    <Icon name="icon-check-circle" className="button-icon" />
                    Matched across {supplierCount} supplier{supplierCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {brand && <span className="pdp-brand-link">{brand}<Icon name="icon-link" className="button-icon" /></span>}
              {variants.length > 1 && (
                <div className="pdp-variants" role="group" aria-label={`Choose ${variantGroupLabel}`}>
                  <span className="pdp-variants-label">{variantGroupLabel}: <strong>{product.variant_label}</strong></span>
                  <div className="pdp-variant-options">
                    {variants.map((variant, index) => (
                      <button
                        key={variant.id}
                        type="button"
                        className={`pdp-variant ${index === activeIdx ? "active" : ""}`}
                        aria-pressed={index === activeIdx}
                        onClick={() => selectVariant(index)}
                      >
                        {variant.variant_label || `Option ${index + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pdp-spec-row">
                <div><span>SKU</span><strong>{best?.sku || "—"}</strong></div>
                <div><span>Pack Size</span><strong>{packSize}</strong></div>
                <div><span>UOM</span><strong>{cap(product.unit_of_measure) || "Unit"}</strong></div>
                <div><span>Category</span><strong>{product.category}</strong></div>
              </div>
              <div className="pdp-desc">
                <h4>Product description</h4>
                <p>{product.description || `${titleCase(attrs.family) || product.name}. Matched across ${supplierCount} supplier${supplierCount === 1 ? "" : "s"} in our catalog.`}</p>
              </div>
              {chips.length > 0 && (
                <div className="pdp-chips">
                  {chips.map(([label, value]) => (
                    <div className="pdp-chip" key={label}>
                      <span className="pdp-chip-dot" aria-hidden="true" />
                      <div><span>{label}</span><strong>{value}</strong></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="crl-card pdp-compare">
            <div className="pdp-compare-head">
              <div className="pdp-compare-title">
                <h2>Supplier pricing comparison</h2>
                <span className="pdp-count-badge">{offers.length} supplier{offers.length === 1 ? "" : "s"}</span>
                {offers.length > 1 && !unitComparable && (
                  <span className="pdp-compare-note" title="These offers use different pack units, so per-unit prices can't be compared directly. Ranked by pack price instead.">
                    <Icon name="icon-alert-triangle" className="button-icon" />
                    Mixed pack units — ranked by pack price
                  </span>
                )}
              </div>
              <span className="pdp-compare-note">Extended price shown for {qty} &times; {cap(uom)}</span>
            </div>

            <div className="pdp-table-wrap">
              <div className="pdp-table">
                <div className="pdp-thead">
                  <span>Supplier</span>
                  <span>Supplier SKU</span>
                  <span>Unit price</span>
                  <span>Est. extended price</span>
                  <span>Availability</span>
                  <span>Actions</span>
                </div>
                {offers.length === 0 && (
                  <div className="pdp-row pdp-row-empty">
                    <p>No pricing available — {brand && brand.toLowerCase().includes("schein") ? "Henry Schein" : (brand || "this supplier")} doesn&rsquo;t publish a price (login required). We&rsquo;ll show pricing as soon as a supplier offer becomes available.</p>
                  </div>
                )}
                {offers.map((offer, index) => {
                  const packPrice = offer.price_cents / 100;
                  // The comparable figure is the per-unit price; show it as the
                  // headline and the pack price/size as context. When the offer
                  // has no comparable unit price, fall back to the pack price.
                  const perUnit = offer.unit_comparable && offer.unit_price_cents != null
                    ? offer.unit_price_cents / 100
                    : null;
                  const packLabel = formatPackLabel(offer.pack_quantity, offer.pack_basis, offer.base_unit, offer.pack_size);
                  const logo = supplierLogoSrc(offer.supplier_name);
                  const avail = availabilityInfo(offer.availability);
                  return (
                    <div className={`pdp-row ${index === 0 ? "best" : ""}`} key={offer.supplier_product_id || index}>
                      <div className="pdp-row-supplier">
                        <span className={`pdp-supplier-logo ${logo ? "has-img" : ""}`}>
                          {logo ? <img src={logo} alt="" /> : initials(offer.supplier_name)}
                        </span>
                        <div>
                          <strong>{offer.supplier_name}</strong>
                          {offer.brand && <small>{offer.brand}</small>}
                        </div>
                      </div>
                      <div className="pdp-row-sku">{offer.sku || "—"}</div>
                      <div className="pdp-row-unit">
                        {perUnit != null ? (
                          <>
                            <strong>{money.format(perUnit)}</strong> <span>/ {unitBasis}</span>
                            <small className="pdp-unit-sub">{money.format(packPrice)}{packLabel ? ` · ${packLabel}` : ""}</small>
                          </>
                        ) : (
                          <>
                            <strong>{money.format(packPrice)}</strong> <span>/ {packLabel ? "pack" : uomLabel}</span>
                            <small className="pdp-unit-sub muted">{packLabel || "pack size unknown"}</small>
                          </>
                        )}
                        {index === 0 && <span className="pdp-tag-best">{unitComparable ? "Best per-unit" : "Lowest price"}</span>}
                      </div>
                      <div className="pdp-row-ext">{money.format(packPrice * qty)}</div>
                      <div className={`pdp-row-avail ${avail.tone}`}>
                        <span><span className="pdp-dot" aria-hidden="true" />{avail.label}</span>
                      </div>
                      <div className="pdp-row-actions">
                        {offer.product_url ? (
                          <a className="pdp-open" href={offer.product_url} target="_blank" rel="noreferrer">
                            <Icon name="icon-link" className="button-icon" />
                            Open supplier
                          </a>
                        ) : (
                          <button className="pdp-open" type="button" onClick={() => onToast(`Supplier link unavailable for ${offer.supplier_name}`)}>
                            <Icon name="icon-link" className="button-icon" />
                            Open supplier
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {range && range.lowest !== range.highest && (
              <div className="pdp-history">
                <div className="pdp-history-head">Price range across suppliers</div>
                <div className="pdp-history-row">
                  <span>Lowest offer</span>
                  <strong>{money.format(range.lowest / 100)}</strong>
                </div>
                <div className="pdp-history-bar" aria-hidden="true"><span /></div>
                <div className="pdp-history-row">
                  <span>Highest offer</span>
                  <strong>{money.format(range.highest / 100)}</strong>
                </div>
                <small>Across {offers.length} current supplier offer{offers.length === 1 ? "" : "s"}.</small>
              </div>
            )}
          </section>

          {marketplaceListings.length > 0 && (
            <section className="crl-card pdp-marketplace">
              <div className="pdp-mkt-head">
                <h2>Also available on Amazon <span className="pdp-mkt-flag"><Icon name="icon-info" className="pdp-mkt-flag-icon" />Not vetted</span></h2>
                <p className="pdp-mkt-note">Third-party Amazon listings, matched by name from our catalog. Sellers and products aren&rsquo;t vetted by TraceDDS and sit outside the supplier price comparison above — verify the item and seller before ordering.</p>
              </div>
              <div className="pdp-mkt-grid">
                {marketplaceListings.map((listing, index) => {
                  const logo = supplierLogoSrc(listing.supplier_name);
                  const priceLabel = listing.price_cents != null ? money.format(listing.price_cents / 100) : "See price";
                  return (
                    <div className="pdp-mkt-card" key={listing.sku || index}>
                      <span className="pdp-mkt-thumb">
                        {listing.image_url ? <img src={listing.image_url} alt={listing.name} loading="lazy" /> : <Icon name="icon-package" className="nav-icon" />}
                      </span>
                      <div className="pdp-mkt-body">
                        <div className="pdp-mkt-supplier">
                          <span className={`pdp-supplier-logo ${logo ? "has-img" : ""}`}>
                            {logo ? <img src={logo} alt="" /> : initials(listing.supplier_name)}
                          </span>
                          <strong>{listing.supplier_name}</strong>
                          {listing.match_status === "substitute" && <span className="pdp-mkt-grade">Similar item</span>}
                        </div>
                        <p className="pdp-mkt-name">{listing.name}</p>
                        {listing.pack_size && <small className="pdp-mkt-pack">{listing.pack_size}</small>}
                      </div>
                      <div className="pdp-mkt-action">
                        <span className="pdp-mkt-price">{priceLabel}</span>
                        {listing.product_url ? (
                          <a className="pdp-open" href={listing.product_url} target="_blank" rel="noreferrer">
                            <Icon name="icon-link" className="button-icon" />
                            View on {listing.supplier_name}
                          </a>
                        ) : (
                          <button className="pdp-open" type="button" onClick={() => onToast(`Link unavailable for this ${listing.supplier_name} listing`)}>
                            <Icon name="icon-link" className="button-icon" />
                            View on {listing.supplier_name}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="pdp-bottom-grid">
            <section className="crl-card pdp-subs">
              <div className="pdp-card-head">
                <h2>Comparable products / substitutes</h2>
                <a className="pdp-link" href="/app/catalog" onClick={(event) => { event.preventDefault(); onNavigate("/app/catalog"); }}>View all</a>
              </div>
              {subs.length === 0 && <p className="pdp-empty">No substitutes found in this category.</p>}
              {subs.map((sub) => {
                const subImage = sub.image_url || sub.best_offer?.image_url || "";
                const subPrice = sub.best_offer ? money.format(sub.best_offer.price_cents / 100) : "Price pending";
                return (
                  <div className="pdp-sub" key={sub.id}>
                    <span className="pdp-sub-thumb">
                      {subImage ? <img src={subImage} alt={sub.name} loading="lazy" /> : <Icon name="icon-package" className="nav-icon" />}
                    </span>
                    <div className="pdp-sub-body">
                      <strong>{sub.name}</strong>
                      <small>{sub.best_offer?.supplier_name || sub.best_offer?.brand || "Supplier pending"}</small>
                    </div>
                    <span className="pdp-sub-price">{subPrice}</span>
                    <button className="pdp-sub-link" type="button" onClick={() => onNavigate(`/app/product/${sub.handle}`)}>View alternative</button>
                  </div>
                );
              })}
            </section>

            <section className="crl-card pdp-specs">
              <div className="pdp-card-head">
                <h2>Product details &amp; specifications</h2>
              </div>
              <div className="pdp-specs-grid">
                {specs.map(([label, value]) => (
                  <div className="pdp-spec" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="pdp-rail">
          <section className="crl-card pdp-add">
            <h3>Add to Reorder List</h3>
            <div className="pdp-field">
              <span>Current list</span>
              <div className="pdp-current-list"><Icon name="icon-list" className="nav-icon" />{listName || "Reorder list"}</div>
            </div>
            <div className="pdp-qty-grid">
              <label className="pdp-field">
                <span>Quantity</span>
                <QtyStepper qty={qty} setQty={setQty} />
              </label>
              <label className="pdp-field">
                <span>UOM</span>
                <UomSelect uom={uom} setUom={setUom} />
              </label>
            </div>
            {best && (
              <div className="pdp-best-box">
                <div className="pdp-best-main">
                  <span>Best price ({best.supplier_name})</span>
                  <strong>{money.format(bestPerUnit ?? bestUnit)} <em>/ {bestPerUnit != null ? unitBasis : uomLabel}</em></strong>
                </div>
                <div className="pdp-best-side">
                  <span>Est. total</span>
                  <strong>{money.format(bestUnit * qty)}</strong>
                </div>
                <small className="pdp-best-foot">{availabilityInfo(best.availability).label}</small>
              </div>
            )}
            <button
              className="primary-action"
              type="button"
              onClick={() => {
                onAddToList?.(product, qty, cap(uom));
                onToast(`Added ${qty} × ${cap(uom)} of ${product.name} to ${listName || "your reorder list"}`);
              }}
            >
              Add to Reorder List
            </button>
            <button className="secondary-action" type="button" onClick={() => onNavigate("/app")}>
              <Icon name="icon-file-text" className="button-icon" />
              View Reorder List
            </button>
          </section>

          {listSummary && listSummary.items > 0 && (
            <section className="crl-card pdp-summary">
              <div className="pdp-card-head">
                <h3>Current list summary</h3>
                <button className="pdp-link" type="button" onClick={() => onNavigate("/app")}>Open list</button>
              </div>
              <div className="pdp-summary-list">
                <div><span>Total items</span><strong>{listSummary.items}</strong></div>
                <div><span>Total suppliers</span><strong>{listSummary.suppliers}</strong></div>
                <div><span>Estimated spend</span><strong>{money.format(listSummary.spend)}</strong></div>
              </div>
            </section>
          )}

          <section className="crl-card pdp-help">
            <h3>Need help?</h3>
            <p>Not seeing what you need? We can help you find the right product or supplier.</p>
            <button className="secondary-action" type="button" onClick={() => onToast("Support request started")}>
              <Icon name="icon-headset" className="button-icon" />
              Contact support
            </button>
          </section>
        </aside>
      </div>

      {lightbox && image && (
        <div className="pdp-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(false)}>
          <button type="button" className="pdp-lightbox-close" aria-label="Close" onClick={() => setLightbox(false)}>&times;</button>
          <img src={image} alt={product.name} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

