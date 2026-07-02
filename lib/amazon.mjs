// Amazon's add-to-cart endpoint accepts a whole order as GET params — no auth,
// no session — so unlike most suppliers we can prefill a multi-item cart with a
// plain link. ASINs ride in our stored product URLs (/dp/{asin} or
// /gp/product/{asin}); parse here so the cart-link route treats Amazon like the
// other one-click platforms.

export function amazonAsin(productUrl) {
  try {
    const url = new URL(productUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    if (host !== "amazon.com" && !host.endsWith(".amazon.com")) return null;
    const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// items: [{ asin, qty }] → one cart-prefill URL for the whole order.
export function amazonCartUrl(items) {
  const params = new URLSearchParams();
  items.forEach((item, index) => {
    params.set(`ASIN.${index + 1}`, item.asin);
    params.set(`Quantity.${index + 1}`, String(Math.max(1, Math.round(Number(item.qty) || 1))));
  });
  return `https://www.amazon.com/gp/aws/cart/add.html?${params.toString()}`;
}
