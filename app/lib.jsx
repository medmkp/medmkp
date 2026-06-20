"use client";


export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Upload aborts after this long so a slow/unreachable backend can't hang the
// modal forever. Generous because a cold catalog-match index can take a while
// to build on the first request; the user can also Cancel sooner.

export const UPLOAD_TIMEOUT_MS = 180000;


export const APP_STATE_KEY = "medmkp_app_state_v1";

export const CATALOG_RECENT_KEY = "medmkp_catalog_recent_v1";

export const SHOPIFY_STOCK_SESSION_KEY = "medmkp_shopify_stock_v1";

export const SHOPIFY_STOCK_MAX_ITEMS = 60;
// Device-local UI preference: whether the left nav sidebar is collapsed. Kept
// out of the synced app-state blob since collapse is per-device, like ChatGPT.

export const NAV_COLLAPSED_KEY = "medmkp_nav_collapsed_v1";

// Unauthenticated visitors get a taste of the scanner before the signup wall:
// FREE_SCAN_LIMIT distinct lookups, counted in localStorage so the budget
// survives a refresh. This is a soft marketing gate, not a security control.

export const FREE_SCAN_LIMIT = 3;

export const FREE_SCAN_KEY = "medmkp_free_scans_v1";


export const DEFAULT_BUYING_PREFS = {
  strategy: "best-price",
  preferredSuppliers: [],
  substitutions: "allowed",
  needByDate: "",
};


export const routeByView = {
  landing: "/",
  pricing: "/pricing",
  about: "/about",
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  home: "/app",
  plan: "/app/review",
  catalog: "/app/catalog",
  history: "/app/history",
  settings: "/app/settings",
};


export function viewFromPath(pathname = "/") {
  const [rawPath, rawQuery = ""] = pathname.split("#")[0].split("?");
  const path = rawPath.replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(rawQuery);

  // Public site
  if (path === "/") return { view: "landing", isLoggedIn: false };
  if (path === "/pricing") return { view: "pricing", isLoggedIn: false };
  if (path === "/about") return { view: "about", isLoggedIn: false };
  if (path === "/login") return { view: "login", isLoggedIn: false };
  if (path === "/signup") return { view: "signup", isLoggedIn: false };
  if (path === "/forgot-password") return { view: "forgotPassword", isLoggedIn: false };
  if (path === "/reset-password") return { view: "resetPassword", isLoggedIn: false };
  if (path === "/sample") return { view: "sample", isLoggedIn: false };
  if (path === "/scan") return { view: "publicScan", isLoggedIn: false };

  // Authenticated app
  if (path === "/app") return { view: "home", isLoggedIn: true };
  if (path === "/app/scan") return { view: "home", isLoggedIn: true, mobileAddItemRoute: true };
  // /app/plan is the former name — kept so old links/bookmarks still resolve.
  if (path === "/app/review/handoff" || path === "/app/plan/handoff") return { view: "handoff", isLoggedIn: true, handoffId: query.get("ho") || "" };
  if (path === "/app/review" || path === "/app/plan") return { view: "plan", isLoggedIn: true };
  if (path === "/app/history") return { view: "history", isLoggedIn: true };
  if (path.startsWith("/app/history/")) return { view: "historyDetail", isLoggedIn: true, historyId: path.split("/")[3] || "" };
  if (path === "/app/catalog") return { view: "catalog", isLoggedIn: true };
  if (path === "/app/catalog/search") return { view: "catalogSearch", isLoggedIn: true, searchQuery: query.get("q") || "" };
  if (path.startsWith("/app/catalog/")) return { view: "catalogCategory", isLoggedIn: true, categorySlug: decodeURIComponent(path.split("/")[3] || "") };
  if (path.startsWith("/app/product/")) return { view: "productDetail", isLoggedIn: true, productHandle: decodeURIComponent(path.split("/")[3] || "") };
  if (path === "/app/settings") return { view: "settings", isLoggedIn: true };

  return { view: "home", isLoggedIn: true };
}


export function pathForView(view) {
  return routeByView[view] || "/app";
}



export function parseAttributes(text) {
  if (!text) return {};
  try {
    return JSON.parse(text) || {};
  } catch (error) {
    return {};
  }
}

// Name the variant selector from the shape of its labels (e.g. "Small"/"Large"
// → Size, "25 mm" → Length, "A2" → Shade), defaulting to a generic "Option".

export function variantAxisLabel(variants) {
  const labels = variants.map((v) => v.variant_label || "");
  if (labels.some((l) => /small|medium|large/i.test(l))) return "Size";
  if (labels.some((l) => /\bmm\b|\bcm\b|\bin\b/i.test(l))) return "Length";
  if (labels.some((l) => /\bga\b/i.test(l))) return "Gauge";
  if (labels.some((l) => /^[A-D][1-4]/.test(l))) return "Shade";
  if (labels.some((l) => /taper/i.test(l))) return "Taper";
  return "Option";
}


export function cap(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}


export function titleCase(value) {
  return value ? String(value).replace(/\b\w/g, (char) => char.toUpperCase()) : value;
}


export function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

// Real availability from the latest price snapshot. We don't have ship-time
// estimates, so we report only the status the supplier actually published and
// leave anything unknown explicitly unconfirmed rather than inventing an ETA.

export function availabilityInfo(value) {
  if (value === "in_stock") return { label: "In stock", tone: "ok" };
  if (value === "limited") return { label: "Limited stock", tone: "warn" };
  if (value === "backordered") return { label: "Backordered", tone: "bad" };
  return { label: "Check with supplier", tone: "muted" };
}

// Suppliers write the same pack a dozen ways ("100/Bx", "100/Box", "Box of 300",
// "200/Box"). The ingestion parser (ingestion/pack.ts) already resolved each to a
// structured (quantity, basis, base_unit), so render one canonical label from
// those fields and only fall back to the raw supplier string when unparsed.
// One canonical spelling per container word, so "Bx"/"box"/"BOXES" all render
// the same. Keyed by the lowercased, de-punctuated supplier token.

export const PACK_UNIT_CANON = {
  box: "Box", bx: "Box", bxs: "Box", boxes: "Box",
  pack: "Pack", pk: "Pack", pkg: "Pack", pkt: "Pack", packs: "Pack", pks: "Pack",
  case: "Case", cs: "Case", cases: "Case",
  bag: "Bag", bg: "Bag", bags: "Bag",
  each: "Each", ea: "Each",
  count: "Count", ct: "Count", cnt: "Count",
  carton: "Carton", ctn: "Carton",
  bottle: "Bottle", btl: "Bottle",
  tube: "Tube", tb: "Tube",
  roll: "Roll", rl: "Roll",
  vial: "Vial", jar: "Jar", kit: "Kit", can: "Can", set: "Set", tray: "Tray",
  sleeve: "Sleeve", pair: "Pair", pr: "Pair", dozen: "Dozen", dz: "Dozen",
  unit: "Unit", piece: "Piece", pc: "Piece", pcs: "Piece",
};

export function canonPackUnit(word) {
  const key = String(word).toLowerCase().replace(/\.+$/, "");
  return PACK_UNIT_CANON[key] || word;
}
// Normalize the pack token inside a free-form supplier string ("100/Bx" →
// "100/Box") without touching the rest of the text.

export function normalizePackText(raw) {
  if (!raw) return raw;
  return String(raw).replace(/(\d+)\s*\/\s*([A-Za-z.]+)/g, (_, n, unit) => `${n}/${canonPackUnit(unit)}`);
}
// Unit-of-measure display: collapse the many ways a single unit gets written
// ("each"/"Each"/"ea."/"EA" → "ea") so the Qty column reads consistently.

export const UOM_CANON = {
  each: "ea", ea: "ea", unit: "ea", piece: "ea", pc: "ea", pcs: "ea",
  box: "box", bx: "box", pack: "pack", pk: "pack", pkg: "pack",
  bag: "bag", bg: "bag", case: "case", cs: "case", count: "count", ct: "count",
  bottle: "bottle", btl: "bottle", tube: "tube", roll: "roll", vial: "vial",
};

export function displayUom(uom) {
  if (!uom) return "ea";
  const key = String(uom).toLowerCase().replace(/\.+$/, "");
  return UOM_CANON[key] || uom;
}
// A trustworthy per-unit price is never higher than the pack price it came from
// (a pack holds ≥1 unit). When a bad pack parse inverts that — e.g. a measured
// "0.2g" basis turning $143.99 into "$719.95/ea" — suppress the per-unit rather
// than show a nonsense figure.

export function showPerEa(perEa, packPrice) {
  if (perEa == null) return false;
  if (packPrice != null && perEa > packPrice + 1e-6) return false;
  return true;
}

export const PACK_BASIS_WORD = { box: "Box", case: "Case", pack: "Pack" };

export function formatPackLabel(quantity, basis, baseUnit, raw) {
  // A measured base unit (ml, g, oz…) reads as an amount, not a container count.
  if (quantity != null && baseUnit && baseUnit !== "each") {
    return `${quantity} ${baseUnit}`;
  }
  const word = PACK_BASIS_WORD[basis];
  if (quantity != null && word) {
    return `${quantity}/${word}`;
  }
  return normalizePackText(raw) || (quantity != null ? `${quantity}/Pack` : "");
}

// "Can the buyer order this offer right now?" — conservative: only an explicit
// negative blocks. Unknown stays orderable so we don't flag the whole catalog
// (most ingested products have no published stock signal). A live Shopify check
// (Phase B) overrides the ingestion snapshot when present.

export function isOrderable(offer) {
  if (!offer) return true;
  if (offer.liveAvailable === false) return false;
  if (offer.availability === "backordered") return false;
  return true;
}


export function shopifyStockKey(productUrl) {
  try {
    const url = new URL(productUrl);
    const match = url.pathname.match(/\/products\/([^/]+)/);
    return match ? `${url.origin}/products/${encodeURIComponent(decodeURIComponent(match[1]))}` : null;
  } catch {
    return null;
  }
}

// Apply live results as an ephemeral overlay. The underlying draft remains the
// durable ingestion snapshot; live stock is intentionally session-scoped.

export function applyLiveStock(items, stockByUrl) {
  const applyOffer = (offer) => {
    const key = shopifyStockKey(offer?.productUrl);
    return key && typeof stockByUrl[key] === "boolean"
      ? { ...offer, liveAvailable: stockByUrl[key] }
      : offer;
  };
  return (items || []).map((item) => ({
    ...item,
    bestOffer: item.bestOffer ? applyOffer(item.bestOffer) : item.bestOffer,
    offers: (item.offers || []).map(applyOffer),
  }));
}

// Plan-row stock badge: in_stock / unknown stay quiet, limited warns (amber),
// backordered or a live out-of-stock flags red. Returns null when no badge.

export function availabilityBadge(availability, liveAvailable) {
  if (liveAvailable === false || availability === "backordered") return { label: "Out of stock", tone: "bad" };
  if (availability === "limited") return { label: "Limited stock", tone: "warn" };
  return null;
}

// A line out of stock at its selected supplier with no in-stock alternative
// can't be ordered anywhere — keep it out of supplier groups and handoffs (it
// surfaces in the unresolved bucket instead so it never silently ships).

export function isStrandedOutOfStock(row) {
  return Boolean(row.outOfStock) && !row.switchTarget;
}

// A matched line that belongs in a supplier order: has a real supplier and is
// orderable somewhere. Shared by the plan view and the handoff snapshot so the
// two never disagree on what's included.

export function isPlanIncluded(row) {
  return row.status !== "Not found" && row.supplier && row.supplier !== "—" && !isStrandedOutOfStock(row);
}


export function catMoney(cents) {
  return typeof cents === "number" && !Number.isNaN(cents) ? money.format(cents / 100) : "Price pending";
}

// Category card/row price: lead with the comparable per-unit price (the real
// best deal across pack sizes) and show the pack price + size beneath; fall back
// to the pack price when the best offer has no per-unit price.

export function supplierInitials(name) {
  return (name || "?")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}


export const matchReviewSample = [
  {
    id: 1, image: "/products/bibs.png", importedName: "BIBS, 2PLY, BLUE, 500/BX", importedSub: "SKU: 112-4521",
    supplier: "Henry Schein", matchName: "Patient Bibs 2-Ply Blue", matchSub: "112-4521 · 500/Box",
    confidence: 95, price: 35.20, perEa: 0.070, status: "Matched", qty: 500, uom: "Box", lineTotal: 35.20,
    others: [
      { name: "Patient Bibs 2-Ply Blue", sub: "112-4520 · 250/Box", supplier: "Henry Schein", price: 18.90, perEa: 0.076, confidence: 85 },
      { name: "Patient Bibs 3-Ply Blue", sub: "113-1070 · 500/Box", supplier: "Henry Schein", price: 41.50, perEa: 0.083, confidence: 62 },
    ],
  },
  {
    id: 2, image: "/products/microbrush.png", importedName: "Microbrush Superfine", importedSub: "REGULAR, BLUE, 100/BAG",
    supplier: "Henry Schein", matchName: "Microbrush Regular Superfine Blue (100/bag)", matchSub: "100-2604",
    confidence: 88, price: 12.45, perEa: 0.125, status: "Matched", qty: 100, uom: "Bag", lineTotal: 12.45,
    others: [{ name: "Microbrush Superfine Blue", sub: "100-2601 · 100/Bag", supplier: "Henry Schein", price: 11.90, perEa: 0.119, confidence: 71 }],
  },
  {
    id: 3, image: "/products/varnish.png", importedName: "3M Clinpro White", importedSub: "VARNISH 5% SOD FLUORIDE",
    supplier: "3M", matchName: "Clinpro White Varnish", matchSub: "5% Sodium Fluoride, 50/Pack · 12125",
    confidence: 92, price: 64.99, perEa: 1.30, status: "Matched", qty: 50, uom: "Pack", lineTotal: 64.99,
    others: [{ name: "Clinpro 5% Sodium Fluoride Varnish", sub: "12126 · 100/Pack", supplier: "3M", price: 119.00, perEa: 1.19, confidence: 64 }],
  },
  {
    id: 4, image: "/products/adhesive.png", importedName: "Kerr OptiBond", importedSub: "ALL-IN-ONE ADHESIVE 5ML",
    supplier: "Henry Schein", matchName: "OptiBond All-In-One Adhesive 5ml", matchSub: "36581",
    confidence: 74, price: 123.10, perEa: 123.10, status: "Review", qty: 1, uom: "Each", lineTotal: 123.10,
    others: [{ name: "OptiBond Universal Adhesive 5ml", sub: "37210", supplier: "Henry Schein", price: 118.50, perEa: 118.50, confidence: 58 }],
  },
  {
    id: 5, image: "/products/wipes.png", importedName: "CaviWipes", importedSub: "DISINFECTING WIPES 160CT",
    supplier: "Metrex", matchName: "CaviWipes Disinfecting Wipes 160 Count", matchSub: "13-1100",
    confidence: 45, price: 11.75, perEa: 0.073, status: "Review", qty: 160, uom: "Count", lineTotal: 11.75,
    others: [{ name: "CaviWipes XL Disinfecting Wipes", sub: "13-1090 · 65 Count", supplier: "Metrex", price: 9.40, perEa: 0.145, confidence: 39 }],
  },
  {
    id: 6, importedName: "XYZ Disposable", importedSub: "NEEDLE 27G SHORT 100/BX",
    supplier: "—", matchName: null, matchSub: null, confidence: null, price: null, perEa: null, status: "Not found", qty: 100, uom: "Box", lineTotal: null, others: [],
  },
  {
    id: 7, importedName: "Gauze Sponges 2x2", importedSub: "NON STERILE 4 PLY 200/BAG",
    supplier: "—", matchName: null, matchSub: null, confidence: null, price: null, perEa: null, status: "Not found", qty: 200, uom: "Bag", lineTotal: null, others: [],
  },
];


export const matchReviewSampleStats = { total: 124, matched: 82, review: 28, notFound: 14, high: 64, med: 40, low: 20, matchedPct: 66, reviewPct: 23, notFoundPct: 11 };


export const MR_STATUS = {
  Matched: { cls: "matched", label: "Matched" },
  Review: { cls: "review", label: "Review" },
  "Not found": { cls: "notfound", label: "Not found" },
};


export function mrMoney(n) { return `$${Number(n).toFixed(2)}`; }
// Price label that treats a null/0 offer price (login-gated suppliers like
// Henry Schein) as "Not listed" instead of a misleading $0.00.

export function mrPriceLabel(n) { return n != null && Number(n) > 0 ? mrMoney(n) : "Not listed"; }

export function mrEa(n) { return Number(n) >= 1 ? Number(n).toFixed(2) : Number(n).toFixed(3); }

export function mrConfTone(n) { return n >= 80 ? "high" : n >= 50 ? "med" : "low"; }

// Stable id for a draft item so a buyer's verification decision can be written
// back to the right row even as the list is filtered, re-sorted, or re-derived.

export let itemIdSeq = 0;

export function newItemId() { return `li_${Date.now().toString(36)}_${(itemIdSeq++).toString(36)}`; }

// Identity for a supplier offer within an item's offer list. Mirrors the
// supplier|sku|price dedupe key used when offers are built in
// app/api/requests/route.js, so a chosen offer survives re-derivation.

export function offerKey(offer) { return `${offer?.supplier || ""}|${offer?.sku || ""}|${offer?.price ?? ""}`; }
// Favicon/small logo per catalog supplier, saved under public/suppliers. Keyed
// by a distinctive substring of the supplier name so it matches regardless of
// how the name is formatted upstream.

export const SUPPLIER_LOGOS = [
  { match: "amazon", src: "/suppliers/amazon.png" },
  { match: "american dental", src: "/suppliers/amerdental.png" },
  { match: "carolina", src: "/suppliers/carolinadental.png" },
  { match: "dc dental", src: "/suppliers/dcdental.png" },
  { match: "dental city", src: "/suppliers/dentalcity.png" },
  { match: "patterson", src: "/suppliers/pattersondental.png" },
  { match: "pearson", src: "/suppliers/pearsondental.png" },
  { match: "unimed", src: "/suppliers/unimedusa.png" },
  { match: "young", src: "/suppliers/youngspecialties.png" },
  { match: "zirc", src: "/suppliers/zirc.png" },
];


export function supplierLogoSrc(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (key.includes("schein")) return "/schein-logo.png";
  return SUPPLIER_LOGOS.find((supplier) => key.includes(supplier.match))?.src || null;
}


export const SCAN_CATALOG = {
  "MBRREG-BLU-100": { product: "Microbrush Regular Superfine Blue", supplier: "Henry Schein", sku: "MBRREG-BLU-100", unit: "Bag", price: 12.45, confidence: 0.96 },
  "HS-GAUZE-2X2-200": { product: "Gauze Sponges 2x2 8-ply", supplier: "Henry Schein", sku: "HS-GAUZE-2X2-200", unit: "Pack", price: 6.8, confidence: 0.93 },
  "051131884021": { product: "Filtek Universal Composite A2", supplier: "3M ESPE", sku: "51131884021", unit: "Syringe", price: 28.9, confidence: 0.9 },
  "SEP-LIDO2-EPI-50": { product: "Lidocaine HCl 2% Epi 1:100k", supplier: "Septodont", sku: "SEP-LIDO2-EPI-50", unit: "Box", price: 41.2, confidence: 0.88 },
  "PRM-PROPHY-SOFT-100": { product: "Disposable Prophy Angles Soft", supplier: "Premier", sku: "PRM-PROPHY-SOFT-100", unit: "Box", price: 18.4, confidence: 0.92 },
  "012345678905": { product: "Earloop Procedure Masks Level 3", supplier: "Crosstex", sku: "012345678905", unit: "Box", price: 9.75, confidence: 0.85 },
  "DEN-CAV-FSI1000-30K": { product: "Cavitron Insert FSI-1000 30K", supplier: "Dentsply Sirona", sku: "DEN-CAV-FSI1000-30K", unit: "Each", price: 64, confidence: 0.81 },
  "PAT-GLOVE-NIT-M-200": { product: "Nitrile Exam Gloves PF Medium", supplier: "Patterson", sku: "PAT-GLOVE-NIT-M-200", unit: "Box", price: 11.3, confidence: 0.89 },
};


export function mapSearchOffer(offer) {
  return {
    name: offer.name,
    supplier: offer.supplier_name,
    supplierId: offer.supplier_id,
    sku: offer.sku,
    brand: offer.brand || "",
    price: (offer.price_cents ?? 0) / 100,
    comparablePrice: (offer.price_cents ?? 0) / 100,
    perUnit: offer.unit_price_cents != null ? offer.unit_price_cents / 100 : null,
    packQty: offer.pack_quantity ?? null,
    packBasis: offer.pack_basis ?? null,
    baseUnit: offer.base_unit ?? null,
    packSize: offer.pack_size || "",
    imageUrl: offer.image_url || "",
    productUrl: offer.product_url || "",
  };
}

// Resolve a scanned value to a catalog product: try the GTIN/UPC barcode path
// first (the scanner's main case), then fall back to an exact SKU lookup so
// SKU-encoded labels and manually keyed codes still resolve.

export async function lookupScannedProduct(code) {
  if (!code) return null;
  const tryLookup = async (param) => {
    try {
      const response = await fetch(`/api/products/search?${param}=${encodeURIComponent(code)}&limit=1`);
      const data = await response.json();
      return data.canonical_products?.[0] || null;
    } catch {
      return null;
    }
  };
  return (await tryLookup("barcode")) || (await tryLookup("code"));
}


export function makeScanDraftItem(code, product) {
  const base = {
    id: newItemId(),
    source: "scan",
    draftQty: 1,
    qty: 1,
    included: true,
    documentIds: ["scan"],
    documentQuantities: { scan: 1 },
    barcode: code || "",
    extractedFrom: `Scanned · ${code || "no code"}`,
    // A barcode carries no price, so there's no savings anchor until the buyer
    // tells us what they currently pay (captured in the item detail panel).
    paidUnitPrice: null,
  };
  // Real catalog match from the lookup endpoint.
  if (product) {
    const offers = (product.offers || []).map(mapSearchOffer);
    const best = offers[0] || (product.best_offer ? mapSearchOffer(product.best_offer) : null);
    // When a product matches but carries no purchasable offer (login-gated
    // suppliers like Henry Schein ingest with no price), fall back to the
    // catalog brand so the row can still show the supplier logo.
    const matchBrand = best?.supplier || parseAttributes(product.attributes_text).brands?.[0] || "";
    return {
      ...base,
      product: product.name,
      canonicalName: product.name,
      canonicalHandle: product.handle || product.id || "",
      sku: product.best_offer?.sku || code || "",
      unit: product.base_unit || product.unit_of_measure || "ea",
      matchStatus: "exact",
      confidence: product.match?.score ?? 0.9,
      imageUrl: product.image_url || product.best_offer?.image_url || "",
      matchBrand,
      oldVendor: best?.supplier || "",
      oldUnitPrice: best?.price ?? 0,
      bestOffer: best,
      offers,
    };
  }
  // Demo barcodes (test-barcodes.html) still resolve via the local map.
  const hit = code ? SCAN_CATALOG[code] : null;
  if (hit) {
    const offer = {
      name: hit.product, supplier: hit.supplier, sku: hit.sku, brand: "",
      price: hit.price, comparablePrice: hit.price, perUnit: null,
      packQty: null, packSize: "", imageUrl: "",
    };
    return {
      ...base,
      product: hit.product,
      canonicalName: hit.product,
      sku: hit.sku,
      unit: hit.unit,
      matchStatus: "exact",
      confidence: hit.confidence,
      oldVendor: hit.supplier,
      oldUnitPrice: hit.price,
      bestOffer: offer,
      offers: [offer],
    };
  }
  return {
    ...base,
    product: null,
    canonicalName: null,
    sku: code || "",
    unit: "ea",
    matchStatus: "unmatched",
    confidence: 0,
    oldVendor: "",
    oldUnitPrice: 0,
    bestOffer: null,
    offers: [],
  };
}


export function statusFromItem(item) {
  if (item.matchStatus) {
    // An unmatched line stays "Not found" until the buyer links a product to it.
    if (item.matchStatus === "unmatched" && !item.linked) return "Not found";
    // A linked item is a confident match; otherwise needs_review is the soft
    // low-confidence signal (informational — no user "verify" step).
    if (item.linked) return "Matched";
    return item.matchStatus === "needs_review" ? "Review" : "Matched";
  }
  // Legacy/scan fallback by status string.
  return item.status === "Parsed" ? "Matched" : item.status === "No match" ? "Not found" : "Review";
}

// Choose which supplier offer to surface as "best" given the buyer's
// preferences. Best price ranks by per-unit cost; preferred suppliers filter
// the pool when any match; brand match favors the invoice's own vendor/brand.

export function pickBestOffer(offers, prefs, item) {
  if (!offers || !offers.length) return null;
  let pool = offers;
  const preferred = prefs?.preferredSuppliers || [];
  if (preferred.length) {
    const inPref = offers.filter((offer) =>
      preferred.some((name) => (offer.supplier || "").toLowerCase().includes(name.toLowerCase())));
    if (inPref.length) pool = inPref;
  }
  // Never recommend an out-of-stock offer when an orderable one exists. Prefer
  // in-stock within the chosen pool; if the whole pool is out of stock, fall
  // back to any in-stock offer before settling for an unorderable one. When
  // nothing is orderable, the cheapest still wins (and surfaces the OOS badge).
  const orderable = pool.filter(isOrderable);
  if (orderable.length) pool = orderable;
  else {
    const anyOrderable = offers.filter(isOrderable);
    if (anyOrderable.length) pool = anyOrderable;
  }
  // Treat unpriced offers (e.g. Henry Schein, whose list price is gated behind a
  // login and ingests as 0) as the most expensive, so a real priced offer always
  // wins the "best price" ranking over a $0 placeholder.
  const cost = (offer) => {
    const c = offer.perUnit ?? offer.comparablePrice ?? offer.price;
    return c != null && c > 0 ? c : Infinity;
  };
  if (prefs?.strategy === "brand-match") {
    const want = (item?.oldVendor || "").toLowerCase();
    const branded = want
      ? pool.filter((offer) => (offer.supplier || "").toLowerCase().includes(want) || (offer.brand || "").toLowerCase().includes(want))
      : [];
    if (branded.length) return [...branded].sort((a, b) => cost(a) - cost(b))[0];
  }
  return [...pool].sort((a, b) => cost(a) - cost(b))[0];
}

// Normalize a supplier name so reorder-list rows (which carry the display name)
// can be matched to the shipping policy loaded from /api/suppliers.

export function normSupplierName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Build a { normalizedName -> policy } map from the /api/suppliers payload.
// Cents are converted to dollars to match the reorder list's row math.

export function buildShippingByName(suppliers) {
  const map = {};
  for (const supplier of suppliers || []) {
    const key = normSupplierName(supplier.name);
    if (!key) continue;
    map[key] = {
      name: supplier.name,
      freeThreshold: supplier.free_shipping_threshold_cents != null ? supplier.free_shipping_threshold_cents / 100 : null,
      flat: supplier.flat_shipping_cents != null ? supplier.flat_shipping_cents / 100 : null,
    };
  }
  return map;
}

// Shipping for one supplier's basket given its item subtotal. Returns null when
// the policy can't price this basket, so the UI says "not estimated" rather than
// implying free shipping.

export function computeSupplierShipping(policy, subtotal) {
  if (!policy) return null;
  const { freeThreshold, flat } = policy;
  if (freeThreshold != null && subtotal >= freeThreshold) return 0;
  if (flat != null) return flat;
  return null;
}

// Landed-cost totals for the plan: item subtotal, shipping estimated per
// supplier basket (free-over-threshold kicks in at the basket level), and the
// combined landed total. Also returns the single most actionable free-shipping
// nudge — the supplier closest to clearing its free threshold.

export function computePlanTotals(rows, shippingByName) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row || row.supplier === "—" || row.lineTotal == null) continue;
    const key = normSupplierName(row.supplier);
    const group = groups.get(key) || { name: row.supplier, subtotal: 0 };
    group.subtotal += row.lineTotal;
    groups.set(key, group);
  }

  let itemsSubtotal = 0;
  let shippingTotal = 0;
  let knownCount = 0;
  let nudge = null;
  for (const [key, group] of groups) {
    itemsSubtotal += group.subtotal;
    const policy = shippingByName?.[key] || null;
    const shipping = computeSupplierShipping(policy, group.subtotal);
    if (shipping == null) continue;
    shippingTotal += shipping;
    knownCount += 1;
    // Keep the closest reachable free-shipping threshold as the nudge.
    if (shipping > 0 && policy?.freeThreshold != null) {
      const remaining = policy.freeThreshold - group.subtotal;
      if (remaining > 0 && (!nudge || remaining < nudge.remaining)) {
        nudge = { supplier: group.name, remaining, saves: shipping };
      }
    }
  }

  const suppliers = groups.size;
  return {
    itemsSubtotal,
    shippingTotal,
    landedTotal: itemsSubtotal + shippingTotal,
    suppliers,
    hasShippingData: knownCount > 0,
    // Every supplier with items has a known policy → the estimate is complete.
    shippingComplete: suppliers > 0 && knownCount === suppliers,
    nudge,
  };
}

// Candidate offers for a line under the buyer's preferences — mirrors
// pickBestOffer's preferred-supplier filter so optimization never proposes a
// supplier the buyer excluded.

export function candidatePool(offers, prefs) {
  const preferred = prefs?.preferredSuppliers || [];
  if (!preferred.length) return offers;
  const inPref = offers.filter((offer) =>
    preferred.some((name) => (offer.supplier || "").toLowerCase().includes(name.toLowerCase())));
  return inPref.length ? inPref : offers;
}

// Landed cost of an assignment (chosen offer + qty per line): item cost plus
// per-supplier shipping evaluated on each supplier's assigned basket.

export function assignmentLanded(assignment, shippingByName) {
  const groups = new Map();
  for (const { offer, qty } of assignment) {
    const key = normSupplierName(offer.supplier);
    const group = groups.get(key) || { subtotal: 0 };
    group.subtotal += (offer.price || 0) * qty;
    groups.set(key, group);
  }
  let total = 0;
  for (const [key, group] of groups) {
    total += group.subtotal + (computeSupplierShipping(shippingByName?.[key] || null, group.subtotal) || 0);
  }
  return total;
}

// Re-assign lines across suppliers to minimize total LANDED cost (item price +
// per-supplier shipping) — this naturally favors consolidating onto a supplier
// whose free-shipping threshold the combined basket can clear. Callers gate this
// on complete shipping data so an unknown policy can't masquerade as free.
//
// Multi-start local search: from each seed (the buyer's current plan, plus one
// "everything to supplier S" per supplier), repeatedly move each line to the
// offer that lowers the landed total until stable, then keep the cheapest result
// across all seeds. The per-supplier seeds keep single-line search from getting
// stuck consolidating onto the wrong supplier. Returns null when nothing beats
// the current plan.

export function optimizeLandedAssignment(rows, shippingByName, prefs) {
  const lines = (rows || [])
    .filter((row) => row.status !== "Not found" && (row.offers || []).length && row.itemId)
    .map((row) => {
      // Only consider offers we can actually order — never consolidate a line
      // onto an out-of-stock supplier just to save shipping. Lines with no
      // orderable offer are stranded and drop out of the optimization below.
      const pool = candidatePool(row.offers, prefs).filter(isOrderable);
      const current = pool.find((offer) => offer.key === row.selectedOfferKey) || pool[0];
      return { itemId: row.itemId, qty: row.qty || 1, pool, current };
    })
    .filter((line) => line.pool.length);
  if (lines.length < 2) return null;

  const landedOf = (assign) =>
    assignmentLanded(assign.map((offer, i) => ({ offer, qty: lines[i].qty })), shippingByName);

  const localSearch = (seed) => {
    const assign = seed.slice();
    let improved = true;
    let passes = 0;
    while (improved && passes < 20) {
      improved = false;
      passes += 1;
      for (let i = 0; i < lines.length; i++) {
        let bestOffer = assign[i];
        let bestCost = landedOf(assign);
        for (const cand of lines[i].pool) {
          if (cand.key === assign[i].key) continue;
          assign[i] = cand;
          const cost = landedOf(assign);
          if (cost < bestCost - 1e-6) { bestCost = cost; bestOffer = cand; improved = true; }
        }
        assign[i] = bestOffer;
      }
    }
    return assign;
  };

  const baseline = lines.map((line) => line.current);
  const baseLanded = landedOf(baseline);
  const cheapest = (pool) => [...pool].sort((a, b) => (a.price || 0) - (b.price || 0))[0];
  const suppliers = new Set();
  for (const line of lines) for (const offer of line.pool) suppliers.add(normSupplierName(offer.supplier));

  const seeds = [baseline];
  for (const sup of suppliers) {
    seeds.push(lines.map((line) => line.pool.find((offer) => normSupplierName(offer.supplier) === sup) || cheapest(line.pool)));
  }

  let best = baseline;
  let bestLanded = baseLanded;
  for (const seed of seeds) {
    const result = localSearch(seed);
    const landed = landedOf(result);
    if (landed < bestLanded - 1e-6) { bestLanded = landed; best = result; }
  }

  const savings = baseLanded - bestLanded;
  if (savings <= 0.5) return null;

  const assignmentByItemId = {};
  for (let i = 0; i < lines.length; i++) assignmentByItemId[lines[i].itemId] = best[i].key;
  return { assignmentByItemId, savings, optimizedLanded: bestLanded, suppliers: new Set(best.map((offer) => normSupplierName(offer.supplier))).size };
}


export function deriveMatchRows(items, prefs) {
  return (items || []).map((item, index) => {
    const conf = Math.round((item.confidence ?? item.recommendation?.confidence ?? 0) * 100);
    const status = statusFromItem(item);
    const notFound = status === "Not found";
    // Tag every offer with a stable key + display sub so the verify drawer can
    // list them as selectable candidates and remember the buyer's choice.
    const offers = (item.offers || []).map((offer) => ({
      ...offer,
      key: offerKey(offer),
      sub: [offer.sku, normalizePackText(offer.packSize)].filter(Boolean).join(" · "),
    }));
    // "Recommended" is what our preferences pick — it never moves when the buyer
    // overrides their selection. "Selected" is the offer actually in the plan
    // (the buyer's choice, defaulting to our recommendation).
    const fallback = item.bestOffer ? { ...item.bestOffer, key: offerKey(item.bestOffer), sub: [item.bestOffer.sku, normalizePackText(item.bestOffer.packSize)].filter(Boolean).join(" · ") } : null;
    const recommended = notFound ? null : (pickBestOffer(offers, prefs, item) || fallback);
    const chosen = item.selectedOfferKey ? offers.find((offer) => offer.key === item.selectedOfferKey) : null;
    const best = notFound ? null : (chosen || recommended);
    const supplier = notFound ? "—" : (best?.supplier || item.oldVendor || "—");
    const price = best ? best.price : (item.oldUnitPrice ?? 0);
    const perEa = best ? (best.perUnit ?? null) : null;
    // Matched to a real product but the offer carries no usable price (Henry
    // Schein and other login-gated suppliers ingest at 0). Render it as an
    // honest "Price not listed" state instead of a misleading $0.00, and keep it
    // out of the plan totals (its lineTotal is nulled below).
    const priceMissing = !notFound && (price == null || price <= 0);
    const qty = item.draftQty ?? item.qty ?? 1;
    // When the selected offer can't be ordered now, surface the best orderable
    // alternative (same strategy) as a one-click switch — buyer-driven, never
    // applied silently.
    const selectedOrderable = isOrderable(best);
    const orderableAlts = notFound ? [] : offers.filter((offer) => offer.key !== best?.key && isOrderable(offer));
    const switchTarget = !notFound && best && !selectedOrderable && orderableAlts.length
      ? (pickBestOffer(orderableAlts, prefs, item) || null)
      : null;
    const others = offers
      .filter((offer) => offer.key !== best?.key)
      .slice(0, 3)
      .map((offer) => ({
        name: offer.name,
        sub: offer.sub,
        supplier: offer.supplier,
        price: offer.price,
        perEa: offer.perUnit ?? null,
        confidence: Math.max(conf - 10, 40),
      }));
    // Savings against what the practice currently pays. We compare on the
    // pack-normalized "comparable" price (same basis the backend matcher uses:
    // max(0, (paid - comparable) * qty)) so per-pack-size differences are fair.
    const paidUnitPrice = item.paidUnitPrice != null ? Number(item.paidUnitPrice) : null;
    const hasPaidPrice = paidUnitPrice != null && Number.isFinite(paidUnitPrice) && paidUnitPrice > 0;
    const compareUnitPrice = best ? (best.comparablePrice ?? best.price) : null;
    const lineSavings = !notFound && hasPaidPrice && compareUnitPrice != null && paidUnitPrice > compareUnitPrice
      ? (paidUnitPrice - compareUnitPrice) * qty
      : 0;
    return {
      id: index + 1,
      itemId: item.id || null,
      image: best?.imageUrl || item.imageUrl || "",
      source: item.source || ((item.documentIds || []).includes("scan") ? "scan" : "pdf"),
      canonicalName: notFound ? null : (item.canonicalName || item.product || null),
      canonicalHandle: notFound ? null : (item.canonicalHandle || null),
      importedName: item.extractedFrom,
      importedSub: item.sku ? `SKU: ${item.sku}` : (item.unit || ""),
      supplier,
      matchName: notFound ? null : (best?.name || item.canonicalName || item.product || null),
      matchSub: notFound ? null : (best ? [best.sku, normalizePackText(best.packSize)].filter(Boolean).join(" · ") : ""),
      productUrl: notFound ? "" : (best?.productUrl || ""),
      // Stock signal for the selected offer — drives the OOS badge + switch flow.
      availability: notFound ? "unknown" : (best?.availability ?? "unknown"),
      liveAvailable: notFound ? undefined : best?.liveAvailable,
      outOfStock: !notFound && Boolean(best) && !selectedOrderable,
      switchTarget: switchTarget
        ? { key: switchTarget.key, supplier: switchTarget.supplier, price: switchTarget.price, perEa: switchTarget.perUnit ?? null }
        : null,
      confidence: notFound ? null : conf,
      price: notFound || priceMissing ? null : price,
      perEa: notFound ? null : perEa,
      priceMissing,
      // Brand for an offer-less match (e.g. Henry Schein), so the row can show
      // the supplier logo even though there's no purchasable offer.
      matchBrand: notFound ? null : (best?.supplier || item.matchBrand || null),
      status,
      linked: Boolean(item.linked),
      note: item.note || "",
      offers,
      selectedOfferKey: best?.key || null,
      recommendedOfferKey: recommended?.key || null,
      qty,
      uom: displayUom(item.unit),
      packLabel: notFound ? "" : (best ? formatPackLabel(best.packQty, best.packBasis, best.baseUnit, best.packSize) : ""),
      lineTotal: notFound || priceMissing ? null : (best ? best.price * qty : price * qty),
      paidUnitPrice: hasPaidPrice ? paidUnitPrice : null,
      hasPaidPrice,
      currentLineTotal: hasPaidPrice ? paidUnitPrice * qty : null,
      lineSavings,
      others,
    };
  });
}

// Derive a reorder list's lifecycle status from its rows + whether a supplier
// handoff has been prepared for it. Draft → Review & optimize (buyer advanced
// the list — allowed at any point; unresolved items are simply excluded) →
// Handed off (a handoff snapshot exists). An empty list is always "draft". Used
// for the live list and archives.

export function deriveListStatus(rows, hasHandoff, stage = "draft") {
  if (hasHandoff) return "handoff";
  if (!rows.length) return "draft";
  return stage === "review" ? "review" : "draft";
}


export function mrComputeStats(rows) {
  const total = rows.length;
  const matched = rows.filter((r) => r.status === "Matched").length;
  const review = rows.filter((r) => r.status === "Review").length;
  const notFound = rows.filter((r) => r.status === "Not found").length;
  const conf = rows.filter((r) => r.confidence != null);
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return {
    total, matched, review, notFound,
    high: conf.filter((r) => r.confidence >= 80).length,
    med: conf.filter((r) => r.confidence >= 50 && r.confidence < 80).length,
    low: conf.filter((r) => r.confidence < 50).length,
    matchedPct: pct(matched), reviewPct: pct(review), notFoundPct: pct(notFound),
  };
}


export const CRL_STATUS = {
  Matched: { cls: "confirmed", label: "Matched", icon: "icon-check-circle" },
  Review: { cls: "possible", label: "Needs review", icon: "icon-alert-triangle" },
  "Not found": { cls: "nomatch", label: "No match", icon: "icon-x-circle" },
};

// List-level lifecycle pill, keyed by deriveListStatus() output.

export const LIST_STATUS = {
  draft: { label: "Draft", cls: "draft" },
  review: { label: "Review", cls: "review" },
  handoff: { label: "Handed off", cls: "handoff" },
};


export const CRL_SAMPLE_SOURCES = { 1: "pdf", 2: "csv", 3: "scan", 4: "pdf", 5: "csv", 6: "scan", 7: "pdf" };

export const CRL_SOURCE_ICON = { pdf: "icon-file-text", csv: "icon-table", scan: "icon-scan" };

// The Home surface: the active reorder list. Add Items (upload / scan / search)
// feeds the Item List below; the right rail summarizes status and next steps.
// Reuses the match-review data layer; before any real items are added it falls
// back to the sample list so the page reads as designed.
// Product thumbnail: shows the catalog image when available, falls back to the
// neutral image icon if there's no URL or the image fails to load.

export function candidateSub(supplier, sub) {
  return [supplier, sub].filter(Boolean).join(" · ");
}

// Supplier + SKU sub-line for offer candidates in the match drawer, prefixed
// with the supplier's small logo when we have one.

export function collapseOffersBySupplier(candidates, selectedKey) {
  const cost = (c) => c.perEa ?? c.price ?? Infinity;
  const rank = (c) => (c.key && c.key === selectedKey ? 0 : c.recommended ? 1 : 2);
  const better = (c, cur) => rank(c) < rank(cur) || (rank(c) === rank(cur) && cost(c) < cost(cur));
  const bySupplier = new Map();
  for (const c of candidates) {
    const key = (c.supplier || "").toLowerCase().trim();
    const cur = bySupplier.get(key);
    if (!cur || better(c, cur)) bySupplier.set(key, c);
  }
  return [...bySupplier.values()].sort((a, b) =>
    rank(a) !== rank(b) ? rank(a) - rank(b) : cost(a) - cost(b));
}


export function offerCandidates(row) {
  const fromOffers = (row.offers || []).map((offer) => ({
    key: offer.key,
    name: offer.name,
    supplier: offer.supplier,
    sub: offer.sub,
    price: offer.price,
    perEa: offer.perUnit ?? null,
    packQty: offer.packQty ?? null,
    packLabel: formatPackLabel(offer.packQty, offer.packBasis, offer.baseUnit, offer.packSize),
    image: offer.imageUrl || "",
    recommended: offer.key === row.recommendedOfferKey,
    availability: offer.availability,
    liveAvailable: offer.liveAvailable,
    productUrl: offer.productUrl || "",
  }));
  if (fromOffers.length) return fromOffers;
  if (row.matchName) {
    return [{ key: row.selectedOfferKey || null, name: row.matchName, supplier: row.supplier, sub: row.matchSub, price: row.price, perEa: row.perEa, image: row.image, recommended: true, availability: row.availability, liveAvailable: row.liveAvailable, productUrl: row.productUrl || "" }];
  }
  return [];
}

// Debounced catalog search for the verify drawer's resolve / re-link flow.
// Reuses the same /api/products/search endpoint the global search uses.

export function rowMode(row) {
  return row.status === "Not found" ? "resolve" : row.status === "Review" ? "review" : "view";
}

// One reorder-list card with swipe-left-to-reveal Remove. Drag tracks the
// finger; past the threshold it snaps open, otherwise it springs back closed.

export const SWIPE_REVEAL = 88;

export const STRATEGY_LABELS = {
  "best-price": "Best price",
  "brand-match": "Exact brand match",
  balanced: "Balanced",
};

export const SUBSTITUTION_LABELS = {
  allowed: "Allowed",
  approval: "Allowed with approval",
  none: "Not allowed",
};


export function formatNeedBy(value) {
  if (!value) return "Any";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Any"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Buying preferences drive which supplier offer wins per item (see
// pickBestOffer). Preferred-supplier options are the suppliers actually present
// in the current list, so toggling them visibly re-ranks the table.

export function groupRowsBySupplier(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const supplier = row.supplier || "—";
    if (!map.has(supplier)) map.set(supplier, { supplier, supplierId: null, rows: [], subtotal: 0, count: 0 });
    const group = map.get(supplier);
    group.rows.push(row);
    group.subtotal += row.lineTotal || 0;
    group.count += 1;
    // Pin the supplier id from the offer the buyer selected so the buying agent
    // can target the right supplier; the first non-null wins.
    if (!group.supplierId) {
      const selected = (row.offers || []).find((offer) => offer.key === row.selectedOfferKey);
      group.supplierId = selected?.supplierId || row.supplierId || null;
    }
  }
  return [...map.values()].sort((a, b) => b.subtotal - a.subtotal);
}

// Trim a live match row down to the fields a frozen handoff needs, pinning the
// supplier SKU from the offer the buyer actually selected.

export function slimHandoffRow(row) {
  const selected = (row.offers || []).find((offer) => offer.key === row.selectedOfferKey);
  return {
    id: row.id,
    image: row.image || "",
    canonicalName: row.canonicalName || null,
    canonicalHandle: row.canonicalHandle || null,
    matchName: row.matchName || row.canonicalName || "",
    matchSub: row.matchSub || "",
    supplier: row.supplier,
    supplierId: selected?.supplierId || row.supplierId || null,
    sku: selected?.sku || "",
    productUrl: selected?.productUrl || row.productUrl || "",
    availability: selected?.availability ?? row.availability ?? "unknown",
    qty: row.qty,
    uom: row.uom,
    price: row.price,
    perEa: row.perEa ?? null,
    lineTotal: row.lineTotal || 0,
  };
}

// Best-known order page per supplier; unknown suppliers fall back to a search so
// "Open website" always lands the buyer somewhere useful.

export const SUPPLIER_SITES = [
  { match: "dc dental", url: "https://www.dcdental.com" },
  { match: "carolina", url: "https://carolinadentalsupply.com" },
  { match: "dental city", url: "https://www.dentalcity.com" },
  { match: "schein", url: "https://www.henryschein.com" },
  { match: "pearson", url: "https://www.pearsondental.com" },
  { match: "patterson", url: "https://www.pattersondental.com" },
  { match: "amazon", url: "https://www.amazon.com" },
  { match: "unimed", url: "https://unimedusa.com" },
  { match: "young", url: "https://www.youngspecialties.com" },
  { match: "practicon", url: "https://www.practicon.com" },
  { match: "net32", url: "https://www.net32.com" },
];


export function supplierSiteUrl(name) {
  const key = (name || "").toLowerCase();
  const known = SUPPLIER_SITES.find((site) => key.includes(site.match));
  return known ? known.url : `https://www.google.com/search?q=${encodeURIComponent(`${name} dental supply`)}`;
}

// Suppliers the headless buying agent can drive (a NUC runner adapter exists).
// Matched by name substring; grow this as adapters are added.

export const AGENT_SUPPLIERS = ["dc dental"];

export function isAgentSupplier(name) {
  const key = (name || "").toLowerCase();
  return AGENT_SUPPLIERS.some((match) => key.includes(match));
}


export function planSlug(value) {
  return String(value || "list").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "list";
}


export function downloadTextFile(name, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Plain-text order summary for one supplier — what the buyer pastes into the
// supplier's site, an email, or a phone order.

export function buildSupplierOrderText(group, handoff) {
  const lines = [`${handoff.listName} — ${group.supplier}`];
  if (handoff.practice) lines.push(`Practice: ${handoff.practice}`);
  if (handoff.buyer) lines.push(`Buyer: ${handoff.buyer}`);
  lines.push("");
  for (const row of group.rows) {
    const sku = row.sku ? ` [${row.sku}]` : "";
    const unit = row.price != null ? ` @ ${mrMoney(row.price)}` : "";
    lines.push(`${row.qty} ${row.uom} — ${row.matchName || row.canonicalName}${sku}${unit} = ${mrMoney(row.lineTotal || 0)}`);
  }
  lines.push("");
  lines.push(`Subtotal: ${mrMoney(group.subtotal)}`);
  return lines.join("\n");
}


export function buildHandoffCsv(handoff) {
  const esc = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = [["Supplier", "Item", "SKU", "Qty", "UOM", "Unit price", "Line total"]];
  for (const group of handoff.groups) {
    for (const row of group.rows) {
      rows.push([
        group.supplier,
        row.matchName || row.canonicalName || "",
        row.sku || "",
        row.qty,
        row.uom,
        row.price != null ? Number(row.price).toFixed(2) : "",
        Number(row.lineTotal || 0).toFixed(2),
      ]);
    }
  }
  return rows.map((cells) => cells.map(esc).join(",")).join("\n");
}

// Per-supplier "build cart" helper. Resolves the supplier's lines to the best
// available target via /api/cart-link: a one-click Shopify cart permalink that
// prefills quantities, or — for platforms with no GET-based cart — the product
// pages to open and add by hand. Shared by the live plan and the frozen handoff.

export const ARCHIVED_LISTS = [
  { id: "june-restock", name: "June Restock", date: "Jun 2, 2025", items: 124, suppliers: 5, total: "$5,842.16", status: "handoff" },
  { id: "may-hygiene", name: "May Hygiene Reorder", date: "May 9, 2025", items: 86, suppliers: 4, total: "$3,217.40", status: "handoff" },
  { id: "april-ortho", name: "April Ortho Supplies", date: "Apr 14, 2025", items: 52, suppliers: 3, total: "$1,905.00", status: "draft" },
];


export const SETTINGS_TABS = [
  ["profile", "Profile"],
  ["suppliers", "Supplier logins"],
  ["users", "Users"],
  ["billing", "Billing"],
  ["notifications", "Notifications"],
  ["integrations", "Integrations"],
  ["security", "Security"],
];


export const SETTINGS_TAB_STUBS = {
  users: { icon: "icon-users", title: "Team & users", body: "Invite teammates, assign buyer or approver roles, and manage who can place orders for your practice." },
  billing: { icon: "icon-credit-card", title: "Billing & payment", body: "Manage payment methods, billing contacts, and download invoices for your MedMKP subscription." },
  notifications: { icon: "icon-bell", title: "Notifications", body: "Choose which emails and alerts you receive. Order-related email toggles live under Profile → Preferences for now." },
  integrations: { icon: "icon-plug", title: "Integrations", body: "Connect your practice-management system and accounting tools to sync orders and invoices automatically." },
  security: { icon: "icon-shield-check", title: "Security", body: "Two-factor authentication, active sessions, and audit history. Password changes live under Profile → Change password." },
};


export const DEFAULT_PREFERENCES = {
  currency: "USD",
  itemsPerPage: "25",
  defaultUom: "Each",
  timezone: "America/New_York",
  emailOrderConfirmations: false,
  emailBackInStock: false,
  showPricingWithTax: true,
};


export const CURRENCY_OPTIONS = [
  ["USD", "USD – US Dollar"],
  ["CAD", "CAD – Canadian Dollar"],
  ["EUR", "EUR – Euro"],
  ["GBP", "GBP – British Pound"],
];

export const ITEMS_PER_PAGE_OPTIONS = ["10", "25", "50", "100"];

export const UOM_OPTIONS = ["Each", "Box", "Case", "Pack", "Bag", "Bottle", "Tube", "Kit"];

export const TIMEZONE_OPTIONS = [
  ["America/New_York", "(GMT-05:00) Eastern Time (US & Canada)"],
  ["America/Chicago", "(GMT-06:00) Central Time (US & Canada)"],
  ["America/Denver", "(GMT-07:00) Mountain Time (US & Canada)"],
  ["America/Los_Angeles", "(GMT-08:00) Pacific Time (US & Canada)"],
  ["America/Anchorage", "(GMT-09:00) Alaska"],
  ["Pacific/Honolulu", "(GMT-10:00) Hawaii"],
];

export const COUNTRY_OPTIONS = ["United States", "Canada", "Mexico", "United Kingdom"];

export const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];


export function formFromMe(me) {
  const customer = me?.customer || {};
  const practice = me?.practice || {};
  return {
    first_name: customer.first_name || "",
    last_name: customer.last_name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    name: practice.name || "",
    ship_address_line1: practice.ship_address_line1 || "",
    ship_address_line2: practice.ship_address_line2 || "",
    ship_city: practice.ship_city || "",
    ship_state: practice.ship_state || "",
    ship_zip: practice.ship_zip || "",
    ship_country: practice.ship_country || "United States",
    shipping_notes: practice.shipping_notes || "",
    use_as_billing: Boolean(practice.use_as_billing),
    prefs: { ...DEFAULT_PREFERENCES, ...(practice.preferences || {}) },
  };
}


export function meFromForm(form, prevMe) {
  return {
    customer: {
      ...(prevMe?.customer || {}),
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
    },
    practice: {
      ...(prevMe?.practice || {}),
      name: form.name,
      ship_address_line1: form.ship_address_line1,
      ship_address_line2: form.ship_address_line2,
      ship_city: form.ship_city,
      ship_state: form.ship_state,
      ship_zip: form.ship_zip,
      ship_country: form.ship_country,
      shipping_notes: form.shipping_notes,
      use_as_billing: form.use_as_billing,
      preferences: form.prefs,
    },
  };
}

