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
  styleguide: "/styleguide",
  home: "/app",
  needsAttention: "/app/needs-attention",
  reorderList: "/app/reorder-list",
  locations: "/app/locations",
  locationAdd: "/app/locations/new",
  qrLabels: "/app/locations/qr-labels",
  scanner: "/app/scan-session",
  evidence: "/app/evidence",
  evidenceViewer: "/app/evidence/viewer",
  evidenceBinder: "/app/evidence/binder",
  reports: "/app/reports",
  plan: "/app/review",
  catalog: "/app/catalog",
  savings: "/app/savings",
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
  if (path === "/styleguide") return { view: "styleguide", isLoggedIn: false };

  // Authenticated app
  if (path === "/app") return { view: "home", isLoggedIn: true };
  if (path === "/app/needs-attention") return { view: "needsAttention", isLoggedIn: true };
  if (path === "/app/reorder-list") return { view: "reorderList", isLoggedIn: true };
  if (path === "/app/scan") return { view: "home", isLoggedIn: true, mobileAddItemRoute: true };
  // The session-less scanner. /app/scan-session is canonical; /app/scan-sessions
  // (and any legacy /app/scan-sessions/:id deep link) resolve to the same surface.
  if (path === "/app/scan-session" || path === "/app/scan-sessions")
    return { view: "scanner", isLoggedIn: true, scanLocationId: query.get("location") || "", scanMode: query.get("mode") || "" };
  if (path.startsWith("/app/scan-sessions/")) return { view: "scanner", isLoggedIn: true };
  if (path === "/app/evidence/viewer") return { view: "evidenceViewer", isLoggedIn: true };
  if (path === "/app/evidence/binder") return { view: "evidenceBinder", isLoggedIn: true };
  if (path === "/app/evidence") return { view: "evidence", isLoggedIn: true };
  if (path === "/app/reports") return { view: "reports", isLoggedIn: true };
  // /app/plan is the former name — kept so old links/bookmarks still resolve.
  if (path === "/app/review/handoff" || path === "/app/plan/handoff") return { view: "handoff", isLoggedIn: true, handoffId: query.get("ho") || "" };
  if (path === "/app/review" || path === "/app/plan") return { view: "plan", isLoggedIn: true };
  if (path === "/app/history") return { view: "history", isLoggedIn: true };
  if (path.startsWith("/app/history/")) return { view: "historyDetail", isLoggedIn: true, historyId: path.split("/")[3] || "" };
  if (path === "/app/locations/new") return { view: "locationAdd", isLoggedIn: true };
  if (path === "/app/locations/qr-labels") return { view: "qrLabels", isLoggedIn: true };
  if (path.startsWith("/app/locations/")) return { view: "locationDetail", isLoggedIn: true, locationId: decodeURIComponent(path.split("/")[3] || "") };
  if (path === "/app/locations") return { view: "locations", isLoggedIn: true };
  if (path === "/app/savings") return { view: "savings", isLoggedIn: true };
  if (path === "/app/catalog") return { view: "catalog", isLoggedIn: true };
  if (path === "/app/catalog/search") return { view: "catalogSearch", isLoggedIn: true, searchQuery: query.get("q") || "" };
  if (path.startsWith("/app/catalog/supplier/")) return { view: "catalogSupplier", isLoggedIn: true, supplierId: decodeURIComponent(path.split("/")[4] || "") };
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
  if (labels.some((l) => /^(?:econo|braided|wrapped)$/i.test(l))) return "Style";
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

// Real availability from the latest price snapshot. This reports only the stock
// status the supplier actually published and leaves anything unknown explicitly
// unconfirmed; ship-time estimation lives in estimateArrival() below.

export function availabilityInfo(value) {
  if (value === "in_stock") return { label: "In stock", tone: "ok" };
  if (value === "limited") return { label: "Limited stock", tone: "warn" };
  if (value === "backordered") return { label: "Backordered", tone: "bad" };
  return { label: "Check with supplier", tone: "muted" };
}

// ---------------------------------------------------------------------------
// Ship-time estimation
//
// Three honest layers, all opt-in on published data — we never invent an ETA:
//   Layer 1  Published per-supplier delivery promise (stated transit window).
//   Layer 2  Per-destination refinement: when a supplier's distribution-center
//            ZIP(s) are confirmed, approximate ground transit days by the
//            origin→destination distance instead of the blanket promise.
//   Layer 3  Stock gate: a date is only meaningful if the item is orderable;
//            an out-of-stock line shows "Backordered" instead of an arrival.
//
// The distance model is intentionally coarse (state centroids + ground-day
// bands) — enough to separate "next-day-ish" from "cross-country", not a
// substitute for a carrier rating API. Everything is labeled an estimate.
// ---------------------------------------------------------------------------

// Approximate geographic center (lat, lon) of each state + DC.
export const STATE_CENTROIDS = {
  AL: [32.8, -86.8], AK: [64.1, -152.3], AZ: [34.2, -111.7], AR: [34.9, -92.4],
  CA: [37.2, -119.4], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.6, -83.4], HI: [20.3, -156.4],
  ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.0, -93.5],
  KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.0, -92.0], ME: [45.4, -69.2],
  MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3],
  MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8],
  NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.1, -74.7], NM: [34.4, -106.1],
  NY: [42.9, -75.6], NC: [35.6, -79.4], ND: [47.5, -100.5], OH: [40.3, -82.8],
  OK: [35.6, -97.5], OR: [44.0, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.6],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3],
  UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5],
  WV: [38.6, -80.6], WI: [44.6, -90.0], WY: [43.0, -107.5],
};

// 3-digit ZIP prefix ranges → state. Coarse but enough to resolve a DC's ZIP to
// a centroid for distance estimation. Ranges, not per-prefix, to stay compact.
const ZIP3_STATE_RANGES = [
  [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"],
  [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"],
  [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"],
  [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"],
  [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"],
  [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [570, 577, "SD"],
  [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"],
  [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"],
  [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"],
  [870, 884, "NM"], [889, 898, "NV"], [900, 961, "CA"], [967, 968, "HI"], [970, 979, "OR"],
  [980, 994, "WA"], [995, 999, "AK"],
];

export function zipToState(zip) {
  const p = parseInt(String(zip || "").trim().slice(0, 3), 10);
  if (!Number.isFinite(p)) return null;
  for (const [lo, hi, st] of ZIP3_STATE_RANGES) if (p >= lo && p <= hi) return st;
  return null;
}

function milesBetween(a, b) {
  const [la1, lo1] = a, [la2, lo2] = b;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Ground transit days from shipped distance — approximates the published
// UPS/FedEx ground time-in-transit maps.
function groundDaysFromMiles(miles) {
  if (miles <= 150) return 1;
  if (miles <= 450) return 2;
  if (miles <= 900) return 3;
  if (miles <= 1500) return 4;
  if (miles <= 2200) return 5;
  return 6;
}

// Layer 2: fewest ground days from any of a supplier's distribution centers to
// the destination state. Returns null unless both ends resolve to a centroid.
export function estimateGroundDays(originZips, destState) {
  const dest = STATE_CENTROIDS[String(destState || "").toUpperCase()];
  if (!dest || !originZips) return null;
  const zips = String(originZips).split(/[,\s]+/).filter(Boolean);
  let best = null;
  for (const zip of zips) {
    const st = zipToState(zip);
    const origin = st && STATE_CENTROIDS[st];
    if (!origin) continue;
    const days = groundDaysFromMiles(milesBetween(origin, dest));
    if (best == null || days < best) best = days;
  }
  return best;
}

// Add N business days (skip Sat/Sun) to a date. Holidays are not modeled — the
// result is an estimate, surfaced as such.
export function addBusinessDays(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

// Estimate when a line arrives. Combines the supplier's published window
// (Layer 1) with per-destination ground refinement (Layer 2, when DCs are
// known) and gates on stock (Layer 3). Returns null when the supplier publishes
// no usable promise, so the UI stays silent rather than guessing.
//   policy   — entry from buildShippingByName()
//   destState— buyer's ship-to state (2-letter)
//   opts     — { available?: boolean|null, now?: Date }
export function estimateArrival(policy, destState, opts = {}) {
  if (!policy) return null;
  const { available = null, now = new Date() } = opts;
  if (available === false) return { status: "backordered" };

  let daysMin = null;
  let daysMax = null;
  let source = null;

  const ground = policy.distCenterZips ? estimateGroundDays(policy.distCenterZips, destState) : null;
  if (ground != null) {
    // Distance gives a point estimate; widen by a day for real-world variance.
    daysMin = ground;
    daysMax = ground + 1;
    source = "distance";
  } else if (policy.transitMin != null || policy.transitMax != null) {
    daysMin = policy.transitMin ?? policy.transitMax;
    daysMax = policy.transitMax ?? policy.transitMin;
    source = "published";
  } else {
    return null;
  }

  // Item ships next business day unless it makes the same-day cutoff.
  const handlingDays = policy.shipsSameDay ? 0 : 1;
  return {
    status: "ok",
    source,
    daysMin,
    daysMax,
    arriveMin: addBusinessDays(now, handlingDays + daysMin),
    arriveMax: addBusinessDays(now, handlingDays + daysMax),
  };
}

// Headline string for an estimateArrival() result: "Arrives in ~2 business days"
// / "Arrives in ~1–2 business days" / "Backordered — no ETA". Null in, null out.
export function formatArrival(est) {
  if (!est) return null;
  if (est.status === "backordered") return "Backordered — no ETA";
  const { daysMin, daysMax } = est;
  const plural = (n) => (n === 1 ? "business day" : "business days");
  if (daysMin === daysMax) return `Arrives in ~${daysMin} ${plural(daysMin)}`;
  return `Arrives in ~${daysMin}–${daysMax} ${plural(daysMax)}`;
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

// The cross-device reorder-list merge lives in a plain-JS module (no JSX) so it
// can be unit-tested directly; re-exported here so callers keep importing it
// from "./lib". It is the single reconciliation rule, mirrored by the server
// merge in medusa-backend/.../reorder-list/merge.ts.
export { mergeDraftState, mergeDraftItems } from "./reorderMerge";

// Identity for a supplier offer within an item's offer list. Mirrors the
// supplier|sku|price dedupe key used when offers are built in
// app/api/requests/route.js, so a chosen offer survives re-derivation.

export function offerKey(offer) { return `${offer?.supplier || ""}|${offer?.sku || ""}|${offer?.price ?? ""}`; }
// "sku · pack" subline for an offer. Uses the normalized pack label (built from
// the structured pack fields) rather than the raw supplier pack_size, so the
// pack reads consistently ("24/Pack") instead of each supplier's own wording
// ("Pkg of 24", "20/Bottle", "100/Bx").
export function offerSub(offer) {
  return [offer?.sku, formatPackLabel(offer?.packQty, offer?.packBasis, offer?.baseUnit, offer?.packSize)]
    .filter(Boolean)
    .join(" · ");
}
// Favicon/small logo per catalog supplier, saved under public/suppliers. Keyed
// by a distinctive substring of the supplier name so it matches regardless of
// how the name is formatted upstream.

export const SUPPLIER_LOGOS = [
  { match: "amazon", src: "/suppliers/amazon.png" },
  { match: "american dental", src: "/suppliers/amerdental.png" },
  { match: "carolina", src: "/suppliers/carolinadental.png" },
  { match: "darby", src: "/suppliers/darbydental.png" },
  { match: "dc dental", src: "/suppliers/dcdental.png" },
  { match: "dental city", src: "/suppliers/dentalcity.png" },
  { match: "patterson", src: "/suppliers/pattersondental.png" },
  { match: "pearson", src: "/suppliers/pearsondental.png" },
  { match: "schein", src: "/suppliers/henryschein.png" },
  { match: "unimed", src: "/suppliers/unimedusa.png" },
  { match: "young", src: "/suppliers/youngspecialties.png" },
  { match: "zirc", src: "/suppliers/zirc.png" },
];


export function supplierLogoSrc(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  return SUPPLIER_LOGOS.find((supplier) => key.includes(supplier.match))?.src || null;
}

// Small manufacturer/brand marks surfaced on product detail pages. Supplier
// house brands reuse the supplier image already checked into public/suppliers.

export const BRAND_LOGOS = [
  { match: "darby", src: "/suppliers/darbydental.png" },
  { match: "dental city", src: "/suppliers/dentalcity.png" },
  { match: "henry schein", src: "/suppliers/henryschein.png" },
  { match: "metrex", src: "/brands/metrex.png" },
  { match: "solventum", src: "/brands/solventum.png" },
  { match: "3m", src: "/brands/3m.png" },
  { match: "medicom", src: "/brands/medicom.png" },
  { match: "coltene", src: "/brands/coltene.png" },
  { match: "whaledent", src: "/brands/coltene.png" },
  { match: "hu-friedy", src: "/brands/hu-friedy.png" },
  { match: "crosstex", src: "/brands/crosstex.png" },
  { match: "microbrush", src: "/brands/microbrush.png" },
  { match: "national keystone", src: "/brands/keystone.png" },
  { match: "keystone", src: "/brands/keystone.png" },
  { match: "premier", src: "/brands/premier-dental.png" },
  { match: "gc america", src: "/brands/gc-america.png" },
  { match: "dentsply", src: "/brands/dentsply-sirona.png" },
  { match: "maillefer", src: "/brands/dentsply-sirona.png" },
  { match: "kerr", src: "/brands/kerr.png" },
  { match: "septodont", src: "/brands/septodont.png" },
  { match: "tidi", src: "/brands/tidi.png" },
  { match: "ivoclar", src: "/brands/ivoclar.png" },
  { match: "myco medical", src: "/brands/myco-medical.png" },
  { match: "parkell", src: "/brands/parkell.png" },
  { match: "tokuyama", src: "/brands/tokuyama.png" },
  { match: "diadent", src: "/brands/diadent.png" },
  { match: "pac-dent", src: "/brands/pac-dent.png" },
  { match: "mydent", src: "/brands/mydent-defend.png" },
  { match: "defend", src: "/brands/mydent-defend.png" },
  { match: "lg h&h", src: "/brands/lg-hh.png" },
  { match: "osung", src: "/brands/osung.png" },
  { match: "dental resources", src: "/brands/dental-resources.png" },
  { match: "horico", src: "/brands/horico.png" },
  { match: "medesy", src: "/brands/medesy.png" },
  { match: "edt", src: "/brands/edt.png" },
  { match: "steri-dent", src: "/brands/steri-dent.png" },
  { match: "c-pac", src: "/brands/steri-dent.png" },
  { match: "motives", src: "/brands/motives-international.png" },
  { match: "vh technologies", src: "/brands/vh-technologies.png" },
  { match: "bisco", src: "/brands/bisco.png" },
];


export function brandLogoSrc(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  return BRAND_LOGOS.find((brand) => key.includes(brand.match))?.src || null;
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

// Scan-session lookup: like lookupScannedProduct but also returns the lot/expiry
// the backend decoded off the package (the `scanned` block). The barcode path
// carries traceability (GS1 / HIBC); the SKU path is a plain identity fallback.
export async function scanLookup(code) {
  if (!code) return { product: null, scanned: null, kind: "none", gtin: null };
  try {
    const response = await fetch(`/api/products/search?barcode=${encodeURIComponent(code)}&limit=1`);
    const data = await response.json();
    const product = data.canonical_products?.[0] || null;
    const scanned = data.scanned || null;
    // gtin: the canonical GTIN the backend decoded off the code — present even for
    // an unmatched read, so a package's 1D + 2D symbologies can be merged by it.
    if (product || scanned) return { product, scanned, kind: data.kind || "none", gtin: data.gtin || null };
  } catch {
    /* fall through to SKU lookup */
  }
  try {
    const response = await fetch(`/api/products/search?code=${encodeURIComponent(code)}&limit=1`);
    const data = await response.json();
    return { product: data.canonical_products?.[0] || null, scanned: null, kind: data.kind || "none", gtin: data.gtin || null };
  } catch {
    return { product: null, scanned: null, kind: "none", gtin: null };
  }
}

// Resolve an unmatched scan from text OCR'd off its label. Two routes, both served
// by the existing search endpoint:
//   1. Each catalog/REF number, tried EXACTLY (?code= → the SKU / manufacturer_sku
//      index). An exact hit is high-confidence, so it's returned as `product`.
//   2. If no REF resolves, the denoised query runs the fuzzy ?q= path; its hits
//      come back as `suggestions` — possible substitutes for the user to confirm.
// Returns { product, via, ref, suggestions }. `product` is null unless a REF hit;
// nothing here is auto-linked — the caller surfaces it as a confirm-before-save
// suggestion, the same rule the lot/expiry OCR follows.
export async function lookupByOcrIdentity({ refs = [], query = "", limit = 5 } = {}) {
  for (const ref of refs) {
    try {
      const response = await fetch(`/api/products/search?code=${encodeURIComponent(ref)}&limit=1`);
      const data = await response.json();
      const product = data.canonical_products?.[0] || null;
      if (product) return { product, via: "ref", ref, suggestions: [] };
    } catch {
      /* try the next ref, then the fuzzy fallback */
    }
  }
  if (query.trim()) {
    try {
      // retrieval=multi: union candidate retrieval over every label token, so a
      // noisy OCR query still pulls the product type into the pool to rerank.
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}&retrieval=multi&limit=${limit}`);
      const data = await response.json();
      const suggestions = data.canonical_products || [];
      if (suggestions.length) return { product: null, via: "ocr", ref: null, suggestions };
    } catch {
      /* fall through to empty */
    }
  }
  return { product: null, via: null, ref: null, suggestions: [] };
}

// Standard GTIN mod-10 check (mirrors backend matching/gtin.ts) so we can tell a
// real-but-uncarried barcode from an unreadable / non-product code on the client.
function isLikelyGtin(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  if (d.length < 8 || d.length > 14) return false;
  const body = d.slice(0, -1);
  const check = Number(d[d.length - 1]);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[i]) * ((body.length - i) % 2 === 1 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === check;
}

// A scanned code that's a website link, not a product — our own tracedds.com QR
// codes (on packaging / the styleguide), or any URL QR. These never resolve to a
// catalog item, so the scanner buzzes and skips them rather than filing junk.
export function isQrUrl(code) {
  const raw = String(code || "").trim();
  if (!raw) return false;
  if (/^https?:\/\//i.test(raw)) return true;   // full URL
  if (/^www\./i.test(raw)) return true;         // scheme-less URL
  if (/\btracedds\.com\b/i.test(raw)) return true; // our own QR codes
  return false;
}

// A scanned QR that points back into the app at a specific location — our printed
// cabinet/shelf placards encode `…/app/scan-session?location=<id>` (see
// qrlabels.jsx). Scanning one in the scanner switches which location scans file
// into, so pull the location id back out. Returns null for any other URL/QR.
export function parseLocationQr(code) {
  const raw = String(code || "").trim();
  if (!raw) return null;
  try {
    // A base lets scheme-less placards (www.tracedds.com/…) parse too.
    const url = new URL(raw, "https://tracedds.com");
    // Match the placard path, singular or plural, with or without a trailing slash.
    if (!/\/app\/scan-sessions?\/?$/.test(url.pathname)) return null;
    return url.searchParams.get("location") || null;
  } catch {
    return null;
  }
}

// Why a scan didn't resolve to a catalog product, phrased for the buyer. Turns a
// silent "Needs review" into an explanation: a QR that's only a marketing URL, an
// HIBC/GTIN we don't carry yet, or a code that isn't a product at all (an
// equipment serial, say). The item is still added for review either way.
export function scanMissReason(code) {
  const raw = (code || "").trim();
  if (!raw) return "Couldn't read a code — try Enter SKU or Search product.";
  if (/^https?:\/\//i.test(raw)) return "That's a website link (QR), not a product barcode — added for review.";
  if (raw.startsWith("+")) return "HIBC code isn't in the catalog yet — added for review.";
  if (isLikelyGtin(raw)) return `Barcode ${raw.replace(/\D/g, "")} isn't in the catalog yet — added for review.`;
  return "Not a recognized product code — added for review.";
}

// Build the POST body for a scan (POST /api/scans) from a scan lookup. Splits the
// matched identity into canonical (mcp_) vs supplier-only (msp_) by id prefix so
// the server files it under the right identity, and carries the decoded
// lot/expiry. An unmatched lookup yields null ids — the scan still lands.
export function scanLinePayload(code, product, scanned) {
  const best = product?.best_offer || product?.offers?.[0] || null;
  const id = product?.id || "";
  return {
    barcode: code || null,
    canonical_product_id: id.startsWith("mcp") ? id : null,
    supplier_product_id: best?.supplier_product_id || (id.startsWith("msp") ? id : null),
    name: product?.name || (code ? `Unknown item · ${code}` : "Unknown item"),
    image_url: product?.image_url || best?.image_url || "",
    lot_number: scanned?.lot || null,
    expiration_date: scanned?.expiry || null,
    production_date: scanned?.production_date || null,
    quantity: 1,
  };
}

// Thin client for the Locations + Scan-Session proxies. Each returns parsed JSON
// or throws; callers handle the empty / signed-out / unreachable states.
async function traceFetch(path, opts) {
  const response = await fetch(path, opts);
  if (!response.ok) {
    // Surface the backend's own message ({ error } from our routes, { message }
    // from the Medusa framework) and the status, so callers can tell a real
    // auth failure apart from validation / no-practice / server errors.
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || data.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
function jsonBody(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// Maps a traceFetch rejection to a user-facing toast. Only a 401 is really an
// "are you signed in?" case; 4xx errors carry an actionable backend message, so
// surface it rather than blaming auth. 5xx / network fall back to a retry hint.
export function traceErrorMessage(err, fallback) {
  if (err?.status === 401) return "Your session expired — please sign in again.";
  if (err?.status && err.status < 500 && err.message) return err.message;
  return fallback;
}

export const traceApi = {
  listLocations: () => traceFetch("/api/locations"),
  createLocation: (body) => traceFetch("/api/locations", jsonBody("POST", body)),
  getLocation: (id) => traceFetch(`/api/locations/${encodeURIComponent(id)}`),
  updateLocation: (id, body) => traceFetch(`/api/locations/${encodeURIComponent(id)}`, jsonBody("PATCH", body)),
  deleteLocation: (id, force) =>
    traceFetch(`/api/locations/${encodeURIComponent(id)}${force ? "?force=1" : ""}`, { method: "DELETE" }),
  // Permanently delete every inventory item captured at a location ("Clear list").
  clearLocationItems: (id) =>
    traceFetch(`/api/locations/${encodeURIComponent(id)}/items`, { method: "DELETE" }),
  // Record one scan as lot-at-location evidence at the designated location (no
  // session — it lands immediately). Returns { item, outcome } where outcome is
  // added | merged | unmatched; an unmatched scan still lands, as a placeholder
  // surfaced in Needs Attention until a product is linked.
  createScan: (body) => traceFetch("/api/scans", jsonBody("POST", body)),
  // Capture or correct an evidence record — lot/expiry/qty in the post-scan
  // drawer, or link a product to an unidentified scan ("Identify product").
  updateItem: (id, body) => traceFetch(`/api/inventory/${encodeURIComponent(id)}`, jsonBody("PATCH", body)),
  // Confirm a lot was physically pulled (reason: expiry | recall | manual), or
  // undo with { pulled: false }. The only thing that moves a lot out of active.
  pull: (id, body) => traceFetch(`/api/inventory/${encodeURIComponent(id)}/pull`, jsonBody("POST", body)),
  // Delete a single inventory evidence record (a mis-scan / wrong item).
  removeItem: (id) => traceFetch(`/api/inventory/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

// Format an ISO date for the traceability UI ("Dec 4, 2028"), tolerant of the
// date-time the backend stores. Returns "" for null/unparseable.
export function formatTraceDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Days until an expiration date (negative = already expired); null when absent.
export function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}


export function makeScanDraftItem(code, product, scanned) {
  const base = {
    id: newItemId(),
    source: "scan",
    draftQty: 1,
    qty: 1,
    included: true,
    // Per-item version for cross-device merge: the server keeps the copy with
    // the greatest updatedAt, so a tombstone (included:false) always beats a
    // stale included:true copy and a fresh scan beats an old edit.
    updatedAt: Date.now(),
    documentIds: ["scan"],
    documentQuantities: { scan: 1 },
    barcode: code || "",
    extractedFrom: `Scanned · ${code || "no code"}`,
    // A barcode carries no price, so there's no savings anchor until the buyer
    // tells us what they currently pay (captured in the item detail panel).
    paidUnitPrice: null,
    // Lot / expiry the backend decoded off the package (GS1 / HIBC `scanned`
    // block) so the post-scan drawer pre-fills traceability without re-keying.
    // Absent on plain SKU scans and catalog adds.
    lot: scanned?.lot || "",
    expirationDate: scanned?.expiry || null,
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
    // Tiers arrive as cents from the API; convert to a dollars-sorted ladder so
    // the row math (which works in dollars) can pick the right step.
    const tiers = Array.isArray(supplier.shipping_flat_tiers)
      ? supplier.shipping_flat_tiers
          .map((t) => ({ min: (t.min_subtotal_cents || 0) / 100, flat: (t.flat_cents || 0) / 100 }))
          .sort((a, b) => a.min - b.min)
      : null;
    map[key] = {
      name: supplier.name,
      freeThreshold: supplier.free_shipping_threshold_cents != null ? supplier.free_shipping_threshold_cents / 100 : null,
      flat: supplier.flat_shipping_cents != null ? supplier.flat_shipping_cents / 100 : null,
      tiers: tiers && tiers.length ? tiers : null,
      // Ship-time fields (Layer 1/2). Null where the supplier publishes nothing.
      transitMin: supplier.transit_days_min ?? null,
      transitMax: supplier.transit_days_max ?? null,
      cutoffLocal: supplier.order_cutoff_local ?? null,
      shipsSameDay: supplier.ships_same_day ?? null,
      distCenterZips: supplier.dist_center_zips ?? null,
      carrier: supplier.ship_carrier ?? null,
    };
  }
  return map;
}

// Shipping for one supplier's basket given its item subtotal. Returns null when
// the policy can't price this basket, so the UI says "not estimated" rather than
// implying free shipping. A tiered flat rate (Darby-style) takes precedence over
// the single flat fee: the highest tier whose min is <= the subtotal wins.

export function computeSupplierShipping(policy, subtotal) {
  if (!policy) return null;
  const { freeThreshold, flat, tiers } = policy;
  if (freeThreshold != null && subtotal >= freeThreshold) return 0;
  if (Array.isArray(tiers) && tiers.length) {
    let chosen = null;
    for (const tier of tiers) {
      if (subtotal >= tier.min) chosen = tier.flat;
    }
    // Below the lowest tier's floor, fall back to that first tier's fee.
    return chosen != null ? chosen : tiers[0].flat;
  }
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
      sub: offerSub(offer),
    }));
    // "Recommended" is what our preferences pick — it never moves when the buyer
    // overrides their selection. "Selected" is the offer actually in the plan
    // (the buyer's choice, defaulting to our recommendation).
    const fallback = item.bestOffer ? { ...item.bestOffer, key: offerKey(item.bestOffer), sub: offerSub(item.bestOffer) } : null;
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
      matchSub: notFound ? null : (best ? offerSub(best) : ""),
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
      // The cheapest option normalized to the SAME basis as paidUnitPrice (the
      // pack-comparable price the savings math uses), so "was vs now" compares
      // like for like. perEa above is per individual unit — a different basis.
      comparableUnitPrice: compareUnitPrice,
      currentLineTotal: hasPaidPrice ? paidUnitPrice * qty : null,
      lineSavings,
      others,
    };
  });
}

// Derive a reorder list's lifecycle status from its rows, which supplier orders
// have been submitted, and whether a (legacy) handoff was prepared. Progression:
// Draft → Review & optimize (buyer advanced the list) → Ordering (≥1 supplier
// order submitted) → Ordered (every supplier order submitted). Submitting an
// order outranks review/handoff. An empty list is always "draft". Used for the
// live list and archives.

export function deriveListStatus(rows, hasHandoff, stage = "draft", submittedSuppliers = []) {
  if (!rows.length) return "draft";
  // Only count submissions for suppliers still in the plan, so a stale entry
  // (e.g. the buyer reassigned every line off a submitted supplier) can't claim
  // the list is ordered.
  const planSuppliers = [...new Set(rows.filter(isPlanIncluded).map((row) => row.supplier))];
  const submittedInPlan = planSuppliers.filter((supplier) => submittedSuppliers.includes(supplier));
  if (planSuppliers.length && submittedInPlan.length >= planSuppliers.length) return "ordered";
  if (submittedInPlan.length) return "ordering";
  if (hasHandoff) return "handoff";
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
  ordering: { label: "Ordering", cls: "ordering" },
  ordered: { label: "Ordered", cls: "ordered" },
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

// True when a supplier's own listing title says something meaningfully different
// from the canonical product name — beyond case, punctuation, word order, and
// pack-size wording (counts and unit words already live in the SKU/pack line).
// Drives a muted "Listed as:" hint shown only when it carries real verification
// signal, so identical-after-normalization names don't repeat as noise.
const PACK_WORDS = new Set(["box", "bx", "boxes", "bag", "bags", "pack", "packs", "pk", "pkg", "case", "cs", "ea", "each", "ct", "count", "pc", "pcs", "piece", "pieces", "set", "sets", "of", "per", "x", "ml", "l", "mm", "cm", "g", "gm", "gr", "oz", "mg", "kg", "in", "ft", "gauge", "ga"]);
function nameTokens(value) {
  return new Set(
    String(value || "").toLowerCase()
      // split counts/units glued to a number ("5ml", "160ct") but keep
      // letter+digit codes intact ("A2", "A3.5") so shade/size stays a signal.
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token && !/^\d+$/.test(token) && !PACK_WORDS.has(token))
  );
}
export function listingNameDiffers(canonical, listing) {
  if (!canonical || !listing) return false;
  const a = nameTokens(canonical);
  const b = nameTokens(listing);
  if (!a.size || !b.size) return false;
  for (const token of a) if (!b.has(token)) return true;
  for (const token of b) if (!a.has(token)) return true;
  return false;
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
    // No purchasable offer (login-gated supplier, e.g. Henry Schein house
    // brands): fall back to the catalog brand so the candidate still names the
    // supplier instead of a bare "—". Mirrors the list row's MatchSupplier.
    const fallbackSupplier = row.supplier && row.supplier !== "—" ? row.supplier : row.matchBrand || row.supplier;
    return [{ key: row.selectedOfferKey || null, name: row.matchName, supplier: fallbackSupplier, sub: row.matchSub, packLabel: row.packLabel, price: row.price, perEa: row.perEa, image: row.image, recommended: true, availability: row.availability, liveAvailable: row.liveAvailable, productUrl: row.productUrl || "" }];
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

export const AGENT_SUPPLIERS = ["dc dental", "darby"];

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
  billing: { icon: "icon-credit-card", title: "Billing & payment", body: "Manage payment methods, billing contacts, and download invoices for your TraceDDS subscription." },
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
