// Curated top-level catalog taxonomy. The ingested catalog stores flat,
// supplier-named categories (DC Dental "subcat2" values). This module groups
// them into clean, buyer-facing departments with descriptions, icons, and
// subcategory chips — the McMaster-style tree the catalog renders. Counts come
// from live data (see bucketCategories); everything else is curated here so the
// grid reads consistently regardless of how suppliers name things.
//
// Pure data + helpers only (no server imports) so the client app can import it.

export const CATALOG_TINTS = [
  "blue", "violet", "rose", "amber", "indigo",
  "teal", "green", "cyan", "slate", "sky",
]

export const CATALOG_CATEGORIES = [
  {
    slug: "infection-control",
    name: "Infection Control & PPE",
    icon: "icon-shield-check",
    tint: "blue",
    description: "Sterilization, surface disinfection, and cross-contamination prevention.",
    sources: ["Infection Control"],
    pattern: /infection|steriliz|disinfect|barrier|sanit|glove|mask/,
    subcategories: ["Gloves", "Masks", "Surface Disinfectants", "Sterilization Pouches"],
  },
  {
    slug: "restorative",
    name: "Restorative & Cosmetic",
    icon: "icon-tag",
    tint: "violet",
    description: "Composites, bonding, and accessories for direct and indirect restorations.",
    sources: ["Cosmetic Dentistry", "Surgical & Restoratives"],
    pattern: /restorat|composite|cosmetic|matrix|etch/,
    subcategories: ["Composites", "Bonding Agents", "Etchants", "Matrix Systems"],
  },
  {
    slug: "endodontics",
    name: "Endodontics",
    icon: "icon-bolt",
    tint: "rose",
    description: "Files, obturation, irrigants, and root canal therapy supplies.",
    sources: ["Endodontics"],
    pattern: /endo|root canal|obturat|gutta|irrigant/,
    subcategories: ["Files", "Obturation", "Irrigants", "Sealers"],
  },
  {
    slug: "burs-rotary",
    name: "Burs & Rotary",
    icon: "icon-settings",
    tint: "amber",
    description: "Diamond and carbide burs, polishers, discs, and rotary abrasives.",
    sources: ["Burs & Diamonds", "Burs"],
    pattern: /\bburs?\b|diamond|rotary|abrasive|\bdiscs?\b|polish/,
    subcategories: ["Diamond Burs", "Carbide Burs", "Polishers", "Discs"],
  },
  {
    slug: "instruments",
    name: "Instruments",
    icon: "icon-package",
    tint: "indigo",
    description: "Hand instruments for diagnostic and clinical procedures.",
    sources: ["Instruments"],
    pattern: /instrument|scaler|forcep|plier|mirror|explorer/,
    subcategories: ["Scalers & Curettes", "Mirrors", "Forceps", "Explorers"],
  },
  {
    slug: "small-equipment",
    name: "Small Equipment",
    icon: "icon-truck",
    tint: "teal",
    description: "Handpieces, curing lights, motors, and chairside equipment.",
    sources: ["Small Equipment"],
    pattern: /equipment|handpiece|curing|motor|light/,
    subcategories: ["Handpieces", "Curing Lights", "Motors", "Ultrasonics"],
  },
  {
    slug: "preventive",
    name: "Preventive & Hygiene",
    icon: "icon-check-circle",
    tint: "green",
    description: "Prophylaxis, fluoride, sealants, and caries prevention.",
    sources: ["Preventives"],
    pattern: /prevent|prophy|fluorid|sealant|hygien|floss/,
    subcategories: ["Prophy Paste", "Fluoride", "Sealants", "Floss & Picks"],
  },
  {
    slug: "impression",
    name: "Impression Materials",
    icon: "icon-image",
    tint: "cyan",
    description: "Impression materials and trays for accurate models.",
    sources: ["Impression Material"],
    pattern: /impression|alginate|\bvps\b|\bpvs\b|bite registration/,
    subcategories: ["Alginate", "VPS / PVS", "Trays", "Bite Registration"],
  },
  {
    slug: "laboratory",
    name: "Laboratory",
    icon: "icon-store",
    tint: "slate",
    description: "Gypsum, waxes, acrylics, and lab fabrication supplies.",
    sources: ["Laboratory Products"],
    pattern: /laborator|gypsum|\bwax|acrylic|articulator|model/,
    subcategories: ["Gypsum", "Waxes", "Acrylics", "Articulators"],
  },
  {
    slug: "imaging",
    name: "Imaging & X-Ray",
    icon: "icon-scan",
    tint: "sky",
    description: "Sensors, film, phosphor plates, and radiography supplies.",
    sources: ["X-Ray"],
    pattern: /x-?ray|radiograph|imaging|sensor|\bfilm\b/,
    subcategories: ["Sensors", "Film", "Phosphor Plates", "Mounts"],
  },
]

function normalize(value) {
  return String(value || "").trim().toLowerCase()
}

export function categoryBySlug(slug) {
  return CATALOG_CATEGORIES.find((category) => category.slug === slug) || null
}

// Match a live (supplier-named) category to a curated department. First match
// in CATALOG_CATEGORIES order wins, so specific departments are listed first.
function curatedFor(liveName) {
  const lower = normalize(liveName)
  if (!lower) return null
  const sourceNames = new Set()
  for (const category of CATALOG_CATEGORIES) {
    if (category.sources.some((source) => normalize(source) === lower)) {
      return category
    }
    category.sources.forEach((source) => sourceNames.add(normalize(source)))
  }
  // No exact source match — fall back to keyword pattern (covers the long tail
  // that appears once the backend serves all categories, not just the top 12).
  for (const category of CATALOG_CATEGORIES) {
    if (category.pattern.test(lower)) {
      return category
    }
  }
  return null
}

// Roll live category rows (from /api/catalog) up into the curated departments:
// sum product counts, keep the highest supplier count, and the single cheapest
// best-value offer. Returns only populated departments, richest first.
export function bucketCategories(liveCategories = []) {
  const totals = new Map()

  for (const live of liveCategories) {
    const curated = curatedFor(live.name)
    if (!curated) continue
    const entry =
      totals.get(curated.slug) ||
      totals.set(curated.slug, { product_count: 0, supplier_count: 0, best_value_item: null }).get(curated.slug)

    entry.product_count += live.product_count || 0
    entry.supplier_count = Math.max(entry.supplier_count, live.supplier_count || 0)
    const best = live.best_value_item
    if (best && (!entry.best_value_item || best.unit_price_cents < entry.best_value_item.unit_price_cents)) {
      entry.best_value_item = best
    }
  }

  return CATALOG_CATEGORIES.map((category) => ({
    ...category,
    ...(totals.get(category.slug) || { product_count: 0, supplier_count: 0, best_value_item: null }),
  }))
    .filter((category) => category.product_count > 0)
    .sort((a, b) => b.product_count - a.product_count)
}
