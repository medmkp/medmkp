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
      { name: "Gloves", match: "glove", blurb: "Exam and surgical gloves in nitrile, latex, and vinyl." },
      { name: "Masks", match: "mask", blurb: "Procedure and surgical masks for chairside protection." },
      { name: "Surface Disinfectants", match: "disinfect|cavicide|caviwipe|sani-?cloth|surface wipe", blurb: "Wipes and sprays for operatory surface disinfection." },
      { name: "Sterilization Pouches", match: "pouch|sterilization wrap|autoclave bag|sterilization bag", blurb: "Self-seal pouches and wraps for autoclave cycles." },
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
      { name: "Composites", match: "composite", blurb: "Light-cure composite resins for direct restorations." },
      { name: "Bonding Agents", match: "bond|adhesive|primer", blurb: "Adhesives and primers for enamel and dentin bonding." },
      { name: "Etchants", match: "etch", blurb: "Phosphoric acid gels for enamel and dentin etching." },
      { name: "Matrix Systems", match: "matri(x|ces)|tofflemire|sectional|matrix band", blurb: "Bands, rings, and wedges for tight proximal contacts." },
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
      { name: "Files", match: "\\bfile|reamer|k-?file|h-?file", blurb: "Hand and rotary files for canal shaping and cleaning." },
      { name: "Obturation", match: "obturat|gutta", blurb: "Gutta-percha points and carriers for canal filling." },
      { name: "Irrigants", match: "irrigat|hypochlorite|naocl|edta|chlorhexidine", blurb: "Sodium hypochlorite, EDTA, and chlorhexidine solutions." },
      { name: "Sealers", match: "sealer", blurb: "Root canal sealers for a durable apical seal." },
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
      { name: "Diamond Burs", match: "diamond", blurb: "Diamond rotary burs for cutting and finishing." },
      { name: "Carbide Burs", match: "carbide", blurb: "Tungsten carbide burs for fast, clean cutting." },
      { name: "Polishers", match: "polish", blurb: "Rubber points and cups for chairside polishing." },
      { name: "Discs", match: "\\bdiscs?\\b", blurb: "Finishing and polishing discs for contouring restorations." },
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
      { name: "Scalers & Curettes", match: "scaler|curette|gracey|sickle", blurb: "Hand scalers and curettes for deposit removal." },
      { name: "Mirrors", match: "mirror", blurb: "Mouth mirrors and handles for intraoral visibility." },
      { name: "Forceps", match: "forcep", blurb: "Extraction forceps for upper and lower arches." },
      { name: "Explorers", match: "explorer", blurb: "Diagnostic explorers for caries and calculus detection." },
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
      { name: "Handpieces", match: "handpiece", blurb: "High- and low-speed handpieces for daily use." },
      { name: "Curing Lights", match: "curing", blurb: "LED curing lights for polymerizing restorations." },
      { name: "Motors", match: "motor", blurb: "Endo and implant motors with controlled torque." },
      { name: "Ultrasonics", match: "ultrasonic|piezo|cavitron|scaler insert", blurb: "Ultrasonic scalers and inserts for debridement." },
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
      { name: "Prophy Paste", match: "prophy", blurb: "Prophy paste in assorted grits and flavors." },
      { name: "Fluoride", match: "fluoride|varnish", blurb: "Fluoride varnish, gel, and foam for caries prevention." },
      { name: "Sealants", match: "sealant", blurb: "Pit and fissure sealants for occlusal protection." },
      { name: "Floss & Picks", match: "floss|interdental|\\bpick", blurb: "Floss, tape, and interdental picks for home care." },
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
      { name: "Alginate", match: "alginate", blurb: "Alginate impression materials for study models." },
      { name: "VPS / PVS", match: "\\bvps\\b|\\bpvs\\b|polyvinyl|polysiloxane|vinyl polysiloxane", blurb: "Vinyl polysiloxane materials for precise impressions." },
      { name: "Trays", match: "\\btray", blurb: "Disposable and metal impression trays in all sizes." },
      { name: "Bite Registration", match: "bite registration|bite reg|registration", blurb: "Bite registration materials for accurate occlusion." },
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
      { name: "Gypsum", match: "gypsum|\\bstone\\b|plaster|die stone", blurb: "Dental stones and plaster for casts and dies." },
      { name: "Waxes", match: "\\bwax", blurb: "Inlay, baseplate, and utility waxes for fabrication." },
      { name: "Acrylics", match: "acrylic", blurb: "Self- and heat-cure acrylics for appliances and repairs." },
      { name: "Articulators", match: "articulator|facebow", blurb: "Articulators and facebows for mounting casts." },
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
      { name: "Sensors", match: "sensor", blurb: "Digital sensors for fast intraoral radiographs." },
      { name: "Film", match: "\\bfilm", blurb: "Intraoral and extraoral film for traditional imaging." },
      { name: "Phosphor Plates", match: "phosphor|\\bpsp\\b|imaging plate", blurb: "Reusable phosphor plates for digital scanning." },
      { name: "Mounts", match: "\\bmount", blurb: "Film mounts and barriers for organized imaging." },
    ],
  },
]

function normalize(value) {
  return String(value || "").trim().toLowerCase()
}

export function categoryBySlug(slug) {
  return CATALOG_CATEGORIES.find((category) => category.slug === slug) || null
}

// Resolve a live (supplier-named) category to its curated department for the
// product-page breadcrumb. Uses curatedFor's broad matching (incl. the keyword
// fallback) so long-tail categories still get a department label. Returns
// { slug, name } or null when nothing matches.
export function departmentForCategory(liveName) {
  const dept = curatedFor(liveName)
  return dept ? { slug: dept.slug, name: dept.name } : null
}

// Match a live (supplier-named) category to a curated department. First match
// in CATALOG_CATEGORIES order wins, so specific departments are listed first.
// Exact source name first, then a keyword pattern fallback for the long tail.
// Used for breadcrumbs/labels — NOT counts: bucketCategories uses the stricter
// departmentBySource so landing counts stay aligned with the drill-down.
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

// Exact source-name match only — no keyword fallback. The drill-down
// (/app/catalog/[slug]) lists exactly a department's declared `sources`, so the
// landing roll-up must use the same set; keyword matching would inflate the
// headline count with products the drill-down can't show (the discrepancy this
// is meant to avoid).
function departmentBySource(liveName) {
  const lower = normalize(liveName)
  if (!lower) return null
  return (
    CATALOG_CATEGORIES.find((category) =>
      category.sources.some((source) => normalize(source) === lower)
    ) || null
  )
}

// Roll live category rows (from /api/catalog) up into the curated departments:
// sum product counts, keep the highest supplier count, and the single cheapest
// best-value offer. Returns only populated departments, richest first.
export function bucketCategories(liveCategories = []) {
  const totals = new Map()

  for (const live of liveCategories) {
    const curated = departmentBySource(live.name)
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
