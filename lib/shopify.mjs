export const SHOPIFY_FETCH_TIMEOUT_MS = 8000;

// Shopify product pages conventionally live under /products/{handle}. Keep URL
// parsing in one place so live stock checks and cart building resolve the same
// endpoint and dedupe key.
export function shopifyProduct(productUrl) {
  try {
    const url = new URL(productUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const match = url.pathname.match(/\/products\/([^/]+)/);
    if (!match) return null;
    const handle = decodeURIComponent(match[1]);
    return {
      origin: url.origin,
      handle,
      key: `${url.origin}/products/${encodeURIComponent(handle)}`,
    };
  } catch {
    return null;
  }
}

// Resolve the variant Shopify would add to a cart. When the caller knows the
// supplier SKU, the matching variant wins — a multi-variant product (shade,
// size, pack) shares one product URL across our supplier rows, so "first
// available" would happily cart a different shade than the one we priced.
// Without a SKU match this keeps the old behavior: any available variant,
// then the first.
export async function resolveShopifyVariant(origin, handle, sku) {
  try {
    const response = await fetch(`${origin}/products/${encodeURIComponent(handle)}.js`, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(SHOPIFY_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const variants = Array.isArray(data?.variants) ? data.variants : [];
    const wanted = sku ? String(sku).trim().toLowerCase() : "";
    const skuMatch = wanted
      ? variants.find((variant) => String(variant?.sku || "").trim().toLowerCase() === wanted)
      : null;
    if (skuMatch?.id) return { id: skuMatch.id, available: Boolean(skuMatch.available) };
    const inStock = variants.find((variant) => variant?.available);
    const variant = inStock || variants[0];
    return variant?.id ? { id: variant.id, available: Boolean(inStock) } : null;
  } catch {
    return null;
  }
}

export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
