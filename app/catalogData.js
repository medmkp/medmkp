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
    subcategories: [
      { name: "Gloves", blurb: "Exam and surgical gloves in nitrile, latex, and vinyl." },
      { name: "Masks", blurb: "Procedure and surgical masks for chairside protection." },
      { name: "Surface Disinfectants", blurb: "Wipes and sprays for operatory surface disinfection." },
      { name: "Sterilization Pouches", blurb: "Self-seal pouches and wraps for autoclave cycles." },
    ],
  },
  {
    slug: "restorative",
    name: "Restorative & Cosmetic",
    icon: "icon-tag",
    tint: "violet",
    description: "Composites, bonding, and accessories for direct and indirect restorations.",
    sources: ["Cosmetic Dentistry", "Surgical & Restoratives"],
    pattern: /restorat|composite|cosmetic|matrix|etch/,
    subcategories: [
      { name: "Composites", blurb: "Light-cure composite resins for direct restorations." },
      { name: "Bonding Agents", blurb: "Adhesives and primers for enamel and dentin bonding." },
      { name: "Etchants", blurb: "Phosphoric acid gels for enamel and dentin etching." },
      { name: "Matrix Systems", blurb: "Bands, rings, and wedges for tight proximal contacts." },
    ],
  },
  {
    slug: "endodontics",
    name: "Endodontics",
    icon: "icon-bolt",
    tint: "rose",
    description: "Files, obturation, irrigants, and root canal therapy supplies.",
    sources: ["Endodontics"],
    pattern: /endo|root canal|obturat|gutta|irrigant/,
    subcategories: [
      { name: "Files", blurb: "Hand and rotary files for canal shaping and cleaning." },
      { name: "Obturation", blurb: "Gutta-percha points and carriers for canal filling." },
      { name: "Irrigants", blurb: "Sodium hypochlorite, EDTA, and chlorhexidine solutions." },
      { name: "Sealers", blurb: "Root canal sealers for a durable apical seal." },
    ],
  },
  {
    slug: "burs-rotary",
    name: "Burs & Rotary",
    icon: "icon-settings",
    tint: "amber",
    description: "Diamond and carbide burs, polishers, discs, and rotary abrasives.",
    sources: ["Burs & Diamonds", "Burs"],
    pattern: /\bburs?\b|diamond|rotary|abrasive|\bdiscs?\b|polish/,
    subcategories: [
      { name: "Diamond Burs", blurb: "Diamond rotary burs for cutting and finishing." },
      { name: "Carbide Burs", blurb: "Tungsten carbide burs for fast, clean cutting." },
      { name: "Polishers", blurb: "Rubber points and cups for chairside polishing." },
      { name: "Discs", blurb: "Finishing and polishing discs for contouring restorations." },
    ],
  },
  {
    slug: "instruments",
    name: "Instruments",
    icon: "icon-package",
    tint: "indigo",
    description: "Hand instruments for diagnostic and clinical procedures.",
    sources: ["Instruments"],
    pattern: /instrument|scaler|forcep|plier|mirror|explorer/,
    subcategories: [
      { name: "Scalers & Curettes", blurb: "Hand scalers and curettes for deposit removal." },
      { name: "Mirrors", blurb: "Mouth mirrors and handles for intraoral visibility." },
      { name: "Forceps", blurb: "Extraction forceps for upper and lower arches." },
      { name: "Explorers", blurb: "Diagnostic explorers for caries and calculus detection." },
    ],
  },
  {
    slug: "small-equipment",
    name: "Small Equipment",
    icon: "icon-truck",
    tint: "teal",
    description: "Handpieces, curing lights, motors, and chairside equipment.",
    sources: ["Small Equipment"],
    pattern: /equipment|handpiece|curing|motor|light/,
    subcategories: [
      { name: "Handpieces", blurb: "High- and low-speed handpieces for daily use." },
      { name: "Curing Lights", blurb: "LED curing lights for polymerizing restorations." },
      { name: "Motors", blurb: "Endo and implant motors with controlled torque." },
      { name: "Ultrasonics", blurb: "Ultrasonic scalers and inserts for debridement." },
    ],
  },
  {
    slug: "preventive",
    name: "Preventive & Hygiene",
    icon: "icon-check-circle",
    tint: "green",
    description: "Prophylaxis, fluoride, sealants, and caries prevention.",
    sources: ["Preventives"],
    pattern: /prevent|prophy|fluorid|sealant|hygien|floss/,
    subcategories: [
      { name: "Prophy Paste", blurb: "Prophy paste in assorted grits and flavors." },
      { name: "Fluoride", blurb: "Fluoride varnish, gel, and foam for caries prevention." },
      { name: "Sealants", blurb: "Pit and fissure sealants for occlusal protection." },
      { name: "Floss & Picks", blurb: "Floss, tape, and interdental picks for home care." },
    ],
  },
  {
    slug: "impression",
    name: "Impression Materials",
    icon: "icon-image",
    tint: "cyan",
    description: "Impression materials and trays for accurate models.",
    sources: ["Impression Material"],
    pattern: /impression|alginate|\bvps\b|\bpvs\b|bite registration/,
    subcategories: [
      { name: "Alginate", blurb: "Alginate impression materials for study models." },
      { name: "VPS / PVS", blurb: "Vinyl polysiloxane materials for precise impressions." },
      { name: "Trays", blurb: "Disposable and metal impression trays in all sizes." },
      { name: "Bite Registration", blurb: "Bite registration materials for accurate occlusion." },
    ],
  },
  {
    slug: "laboratory",
    name: "Laboratory",
    icon: "icon-store",
    tint: "slate",
    description: "Gypsum, waxes, acrylics, and lab fabrication supplies.",
    sources: ["Laboratory Products"],
    pattern: /laborator|gypsum|\bwax|acrylic|articulator|model/,
    subcategories: [
      { name: "Gypsum", blurb: "Dental stones and plaster for casts and dies." },
      { name: "Waxes", blurb: "Inlay, baseplate, and utility waxes for fabrication." },
      { name: "Acrylics", blurb: "Self- and heat-cure acrylics for appliances and repairs." },
      { name: "Articulators", blurb: "Articulators and facebows for mounting casts." },
    ],
  },
  {
    slug: "imaging",
    name: "Imaging & X-Ray",
    icon: "icon-scan",
    tint: "sky",
    description: "Sensors, film, phosphor plates, and radiography supplies.",
    sources: ["X-Ray"],
    pattern: /x-?ray|radiograph|imaging|sensor|\bfilm\b/,
    subcategories: [
      { name: "Sensors", blurb: "Digital sensors for fast intraoral radiographs." },
      { name: "Film", blurb: "Intraoral and extraoral film for traditional imaging." },
      { name: "Phosphor Plates", blurb: "Reusable phosphor plates for digital scanning." },
      { name: "Mounts", blurb: "Film mounts and barriers for organized imaging." },
    ],
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
