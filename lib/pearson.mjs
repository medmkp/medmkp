// Pearson's legacy ASP cart accepts a plain GET: /catalog/oadd.asp?bin=&bin2=&qty=
// adds one line to the session cart (verified live 2026-07-02 — response 302s to
// login.asp?items_added=1 with the item in the cart; login is only needed to
// persist the cart, not to build it). One item per request; sequential opens
// accumulate in the same session.
//
// BOTH bin and bin2 are required: a bin2-only add duplicated the line ~20x on
// the live site. bin2 rides in every stored product_url (?bin2=Xdddddd, 100%
// coverage) and bin is its display form ("N170008" → "N 17-00-08"), so the add
// URL is derivable from stored data alone. Anything not matching the strict
// pattern falls back to the plain product page.

export function pearsonAddUrl(productUrl, qty) {
  try {
    const url = new URL(productUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    if (host !== "pearsondental.com" && !host.endsWith(".pearsondental.com")) return null;
    const bin2 = url.searchParams.get("bin2") || "";
    if (!/^[A-Za-z][0-9]{6}$/.test(bin2)) return null;
    const digits = bin2.slice(1);
    const bin = `${bin2[0]} ${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
    const params = new URLSearchParams({
      bin,
      bin2,
      qty: String(Math.max(1, Math.round(Number(qty) || 1))),
    });
    return `https://www.pearsondental.com/catalog/oadd.asp?${params.toString()}`;
  } catch {
    return null;
  }
}

export const PEARSON_CART_URL = "https://www.pearsondental.com/catalog/list.asp";
