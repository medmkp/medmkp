import { NextResponse } from "next/server";
import { mapWithConcurrency, resolveShopifyVariant, shopifyProduct } from "../../../lib/shopify.mjs";
import { amazonAsin, amazonCartUrl } from "../../../lib/amazon.mjs";
import { PEARSON_CART_URL, pearsonAddUrl } from "../../../lib/pearson.mjs";
import { MEDUSA_URL } from "../../../lib/medusaAuth";

// Turn one supplier's order lines into the best available "build cart" target.
//
// Suppliers don't share a universal cart-prefill URL, so we resolve per platform:
//   • Shopify storefronts take a `/cart/{variant}:{qty},…` permalink that
//     prefills the whole cart in one click. The variant id comes from our own
//     catalog first (ingestion stores the exact variant we priced); the
//     storefront's per-product `.js` endpoint is a live fallback plus a stock
//     check, fetched server-side to dodge the browser's CORS block.
//   • Amazon takes the whole order as GET params on its add-to-cart endpoint
//     (the buyer may pass through an Amazon sign-in first).
//   • Pearson's legacy cart adds one item per GET (oadd.asp) — no single
//     permalink, but each link lands the item in the same session cart, so we
//     hand back per-item add links plus the cart URL.
//   • Everyone else (NetSuite, ASP, BigCommerce, …) has no reliable GET-based
//     cart prefill, so we hand back the product pages for the buyer to open and
//     add to the supplier's own cart.

const MAX_ITEMS = 60;
const MAX_CONCURRENCY = 5;
const STORED_VARIANT_TIMEOUT_MS = 5000;

// Look up the variant ids ingestion stored for these lines, keyed by
// sku + product URL — a multi-variant Shopify product shares one URL across our
// supplier rows, so the sku is what pins the exact variant. Best-effort: any
// failure just means falling back to live resolution.
async function storedVariantIds(items) {
  const withSku = items.filter((item) => item.sku);
  if (!withSku.length) return new Map();
  try {
    const response = await fetch(`${MEDUSA_URL}/medmkp/cart-variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: withSku.map((item) => ({ product_url: item.productUrl, sku: item.sku })),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(STORED_VARIANT_TIMEOUT_MS),
    });
    if (!response.ok) return new Map();
    const data = await response.json();
    const map = new Map();
    for (const variant of data?.variants || []) {
      if (variant?.external_variant_id) {
        map.set(`${variant.sku}\n${variant.product_url}`, variant.external_variant_id);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const withUrls = items.filter((item) => item?.productUrl);

  // Amazon first: the permalink is pure URL parsing, no fetches. Groups are
  // per-supplier, so an Amazon group is all-Amazon; anything that still fails
  // to yield an ASIN is surfaced for manual adding.
  const amazon = withUrls
    .map((item) => ({ item, asin: amazonAsin(item.productUrl) }))
    .filter((entry) => entry.asin);
  if (amazon.length) {
    const leftovers = withUrls
      .filter((item) => !amazon.some((entry) => entry.item === item))
      .map((item) => ({ name: item.name || "", qty: item.qty, productUrl: item.productUrl }));
    return NextResponse.json({
      kind: "amazon-cart",
      url: amazonCartUrl(amazon.map((entry) => ({ asin: entry.asin, qty: entry.item.qty }))),
      count: amazon.length,
      leftovers,
      stock: [],
    });
  }

  // Pearson: one add-to-cart GET per item, all landing in one session cart.
  const pearson = withUrls
    .map((item) => ({ item, addUrl: pearsonAddUrl(item.productUrl, item.qty) }))
    .filter((entry) => entry.addUrl);
  if (pearson.length) {
    const leftovers = withUrls
      .filter((item) => !pearson.some((entry) => entry.item === item))
      .map((item) => ({ name: item.name || "", qty: item.qty, productUrl: item.productUrl }));
    return NextResponse.json({
      kind: "add-pages",
      cartUrl: PEARSON_CART_URL,
      items: pearson.map((entry) => ({
        name: entry.item.name || "",
        qty: entry.item.qty,
        productUrl: entry.item.productUrl,
        addUrl: entry.addUrl,
      })),
      count: pearson.length,
      leftovers,
      missing: items.length - withUrls.length,
      stock: [],
    });
  }

  // Shopify path. Stored variant ids win (they name the exact variant we
  // priced, and survive storefronts that block server-side fetches); the live
  // `.js` resolve remains as both fallback and best-effort stock signal.
  const shopifyItems = withUrls.filter((item) => shopifyProduct(item.productUrl));
  const stored = shopifyItems.length ? await storedVariantIds(shopifyItems) : new Map();

  const resolved = await mapWithConcurrency(
    withUrls,
    MAX_CONCURRENCY,
    async (item) => {
      const shop = shopifyProduct(item.productUrl);
      if (!shop) return { item, variantId: null, available: null, origin: null };
      const storedId = item.sku ? stored.get(`${item.sku}\n${item.productUrl}`) : null;
      const live = await resolveShopifyVariant(shop.origin, shop.handle, item.sku);
      // Live availability only counts when it describes the variant we're
      // adding; a stored id with an unreachable storefront stays addable.
      const available = live ? (storedId && live.id !== storedId ? null : live.available) : null;
      return {
        item,
        variantId: storedId || live?.id || null,
        available,
        origin: shop.origin,
      };
    }
  );

  const stock = resolved
    .filter((result) => result.variantId && result.available !== null)
    .map((result) => ({ productUrl: result.item.productUrl, available: result.available }));

  // Cart the lines we can: a known variant that isn't known to be out of stock.
  const addable = resolved.filter((r) => r.variantId && r.available !== false);
  if (addable.length) {
    // All of one supplier's items share an origin; pin to the first resolved
    // storefront and bundle every variant that lives there into one permalink.
    const origin = addable[0].origin;
    const sameShop = addable.filter((r) => r.origin === origin);
    const pairs = sameShop.map(
      (r) => `${r.variantId}:${Math.max(1, Math.round(Number(r.item.qty) || 1))}`
    );
    // Anything not in the permalink (out of stock, or a non-Shopify line that
    // slipped into the group) is surfaced so the buyer can add it by hand.
    const leftovers = resolved
      .filter((r) => !sameShop.includes(r))
      .map((r) => ({ name: r.item.name || "", qty: r.item.qty, productUrl: r.item.productUrl }));
    return NextResponse.json({
      kind: "shopify-cart",
      url: `${origin}/cart/${pairs.join(",")}`,
      count: sameShop.length,
      leftovers,
      stock,
    });
  }

  // No prefillable storefront — return the product pages to open one by one.
  return NextResponse.json({
    kind: "pages",
    items: withUrls.map((item) => ({
      name: item.name || "",
      qty: item.qty,
      productUrl: item.productUrl,
    })),
    missing: items.length - withUrls.length,
    stock,
  });
}
