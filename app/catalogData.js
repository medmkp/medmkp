// Curated top-level catalog taxonomy. The ingested catalog stores flat,
// supplier-named categories (DC Dental "subcat2" values). This module groups
// them into clean, buyer-facing departments with descriptions, a representative
// product image, and subcategories — the McMaster-style tree the catalog
// renders. Counts come
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
    slug: "gloves",
    image: "https://www.dcdental.com/images/318530652454.01.png",
    name: "Gloves",
    tint: "blue",
    description: "Exam and surgical gloves organized by material and use.",
    sources: ["Gloves"],
    pattern: /\bglove|nitrile|latex|vinyl|chloroprene/,
    subcategories: [
      { name: "Nitrile Gloves", match: "nitrile", blurb: "Powder-free nitrile exam gloves in every size." },
      { name: "Latex Gloves", match: "latex", blurb: "Latex exam and surgical gloves." },
      { name: "Vinyl Gloves", match: "vinyl", blurb: "Vinyl gloves for light clinical and cleaning tasks." },
      { name: "Surgical Gloves", match: "surgical", blurb: "Sterile gloves for surgical procedures." },
    ],
  },
  {
    slug: "infection-control",
    image: "https://www.pearsondental.com/catalog/img_ext/Z190115_Group.jpg",
    name: "Infection Control",
    tint: "violet",
    description: "Surface disinfection, masks, barriers, and chairside protection.",
    sources: ["Infection Control", "Infection Control & PPE", "Barrier Protection"],
    pattern: /infection|disinfect|barrier|sanit|mask|gown|bib|tray cover/,
    subcategories: [
      { name: "Masks & Face Shields", match: "mask|face shield", blurb: "Procedure masks, surgical masks, and face shields." },
      { name: "Surface Disinfectants", match: "disinfect|cavicide|caviwipe|sani-?cloth|surface wipe", blurb: "Wipes and sprays for operatory surface disinfection." },
      { name: "Barrier Covers", match: "barrier|tray cover|sleeve|bib", blurb: "Covers and sleeves for surfaces, trays, and devices." },
      { name: "Gowns & Apparel", match: "gown|jacket|apparel", blurb: "Protective apparel for clinical teams." },
    ],
  },
  {
    slug: "sterilization",
    image: "https://www.dcdental.com/images/808645136388.01.png",
    name: "Sterilization",
    tint: "rose",
    description: "Pouches, wraps, indicators, and autoclave workflow supplies.",
    sources: ["Sterilization", "Sterilization & Infection Prevention"],
    pattern: /steriliz|autoclave|pouch|spore|indicator|cassette/,
    subcategories: [
      { name: "Sterilization Pouches", match: "pouch|sterilization bag", blurb: "Self-seal and heat-seal pouches for instruments." },
      { name: "Wraps", match: "wrap", blurb: "Sterilization wraps and CSR wrap supplies." },
      { name: "Indicators & Tests", match: "indicator|spore|integrator|test", blurb: "Process indicators, integrators, and spore tests." },
      { name: "Cassettes", match: "cassette", blurb: "Instrument cassettes for sterilization cycles." },
    ],
  },
  {
    slug: "burs-diamonds",
    image: "https://www.pearsondental.com/catalog/img/P86-0020.jpg",
    name: "Burs & Diamonds",
    tint: "amber",
    description: "Diamond, carbide, surgical, and lab burs.",
    sources: ["Burs & Diamonds", "Burs", "Diamonds", "Burs & Rotary"],
    pattern: /\bburs?\b|diamond|carbide/,
    subcategories: [
      { name: "Diamond Burs", match: "diamond", blurb: "Diamond rotary burs for cutting and finishing." },
      { name: "Carbide Burs", match: "carbide", blurb: "Tungsten carbide burs for fast, clean cutting." },
      { name: "Surgical Burs", match: "surgical", blurb: "Burs for oral surgery and sectioning." },
      { name: "Lab Burs", match: "\\blab\\b|\\bhp\\b", blurb: "HP and lab burs for extraoral finishing." },
    ],
  },
  {
    slug: "finishing-polishing",
    image: "https://www.dcdental.com/images/477131688078.01.png",
    name: "Finishing & Polishing",
    tint: "indigo",
    description: "Polishers, discs, strips, points, cups, and abrasives.",
    sources: ["Finishing & Polishing", "Polishing", "Abrasives"],
    pattern: /finish|polish|abrasive|\bdiscs?\b|strip/,
    subcategories: [
      { name: "Polishers", match: "polish|cup|point|wheel", blurb: "Points, cups, wheels, and polishing systems." },
      { name: "Finishing Discs", match: "\\bdiscs?\\b", blurb: "Finishing discs for contouring restorations." },
      { name: "Strips", match: "strip", blurb: "Interproximal finishing and polishing strips." },
      { name: "Abrasives", match: "abrasive", blurb: "Abrasive points, wheels, and accessories." },
    ],
  },
  {
    slug: "restorative",
    image: "https://www.pearsondental.com/catalog/img_ext/P720754_Bottle.jpg",
    name: "Composites & Restoratives",
    tint: "teal",
    description: "Composites, glass ionomers, liners, bases, and filling materials.",
    sources: ["Composites & Restoratives", "Restorative", "Restorative & Cosmetic", "Cosmetic Dentistry", "Surgical & Restoratives"],
    pattern: /restorat|composite|cosmetic|flowable|amalgam|glass ionomer/,
    subcategories: [
      { name: "Composite", match: "composite|flowable", blurb: "Light-cure and flowable composite resins." },
      { name: "Amalgam", match: "amalgam", blurb: "Amalgam capsules and filling materials." },
      { name: "Glass Ionomer", match: "glass ionomer|\\bgi\\b", blurb: "Glass ionomer restorative and luting materials." },
      { name: "Liners & Bases", match: "liner|base", blurb: "Pulp protection, bases, and cavity liners." },
    ],
  },
  {
    slug: "bonding-etching",
    image: "https://www.pearsondental.com/catalog/img/S15-0430.jpg",
    name: "Bonding Agents & Etchants",
    tint: "green",
    description: "Adhesives, etchants, primers, and silane.",
    sources: ["Bonding Agents & Etchants", "Bonding Agents", "Etchants"],
    pattern: /bond|adhesive|etch|primer|silane/,
    subcategories: [
      { name: "Bonding Agents", match: "bond|adhesive", blurb: "Universal and generation-specific dental adhesives." },
      { name: "Etchants", match: "etch", blurb: "Phosphoric acid gels and etching solutions." },
      { name: "Primers", match: "primer", blurb: "Dentin, ceramic, and metal primers." },
      { name: "Silane", match: "silane", blurb: "Silane coupling agents for ceramic restorations." },
    ],
  },
  {
    slug: "matrix-materials",
    image: "https://www.dcdental.com/images/148322664323.01.png",
    name: "Matrix Materials",
    tint: "cyan",
    description: "Bands, retainers, sectional systems, rings, and wedges.",
    sources: ["Matrix Materials", "Matrix Bands", "Matrix Systems"],
    pattern: /matri(x|ces)|tofflemire|sectional|wedge|matrix band/,
    subcategories: [
      { name: "Sectional Matrix", match: "sectional", blurb: "Sectional matrix bands, rings, and systems." },
      { name: "Matrix Bands", match: "matrix|matrices|band", blurb: "Universal and specialty matrix bands." },
      { name: "Wedges", match: "wedge", blurb: "Wood and plastic wedges for proximal adaptation." },
      { name: "Retainers", match: "tofflemire|retainer", blurb: "Retainers and Tofflemire-style systems." },
    ],
  },
  {
    slug: "endodontics",
    image: "https://www.darbydental.com/media/catalog/product/9/5/9514336_large_3.jpg",
    name: "Endodontics",
    tint: "slate",
    description: "Files, obturation, irrigants, sealers, and root canal supplies.",
    sources: ["Endodontics", "Endo"],
    pattern: /endo|root canal|obturat|gutta|irrigant/,
    subcategories: [
      { name: "Files & Reamers", match: "\\bfile|reamer|k-?file|h-?file|rotary", blurb: "Hand and rotary files for canal shaping." },
      { name: "Gutta Percha", match: "gutta", blurb: "Gutta-percha points and obturation supplies." },
      { name: "Irrigation", match: "irrigat|hypochlorite|naocl|edta|chlorhexidine", blurb: "Canal irrigation solutions and tips." },
      { name: "Sealers", match: "sealer", blurb: "Root canal sealers for a durable apical seal." },
    ],
  },
  {
    slug: "preventive",
    image: "https://www.dcdental.com/images/321008518725.01.png",
    name: "Preventive",
    tint: "sky",
    description: "Prophylaxis, fluoride, sealants, and caries prevention.",
    sources: ["Preventive", "Preventives", "Preventive & Hygiene", "Hygiene"],
    pattern: /prevent|prophy|fluorid|sealant|hygien|floss/,
    subcategories: [
      { name: "Prophy", match: "prophy|paste|cup|brush", blurb: "Prophy paste, cups, and brushes." },
      { name: "Fluoride", match: "fluoride|varnish", blurb: "Fluoride varnish, gel, and foam for caries prevention." },
      { name: "Sealants", match: "sealant", blurb: "Pit and fissure sealants for occlusal protection." },
      { name: "Floss & Home Care", match: "floss|interdental|\\bpick|toothbrush", blurb: "Floss, tape, toothbrushes, and home-care aids." },
    ],
  },
  {
    slug: "impression-materials",
    image: "https://www.darbydental.com/media/catalog/product/8/1/8131706_large_3.jpg",
    name: "Impression Materials",
    tint: "blue",
    description: "Alginate, VPS/PVS, bite registration, and tray adhesives.",
    sources: ["Impression Materials", "Impression Material"],
    pattern: /impression|alginate|\bvps\b|\bpvs\b|bite registration/,
    subcategories: [
      { name: "Alginate", match: "alginate", blurb: "Alginate impression materials for study models." },
      { name: "VPS / PVS", match: "\\bvps\\b|\\bpvs\\b|polyvinyl|polysiloxane|vinyl polysiloxane", blurb: "Vinyl polysiloxane materials for precise impressions." },
      { name: "Bite Registration", match: "bite registration|bite reg|registration", blurb: "Bite registration materials for accurate occlusion." },
      { name: "Tray Adhesives", match: "adhesive", blurb: "Adhesives for impression tray retention." },
    ],
  },
  {
    slug: "evacuation",
    image: "https://www.darbydental.com/media/catalog/product/4/9/4952089_large_3.jpg",
    name: "Evacuation",
    tint: "violet",
    description: "Saliva ejectors, HVE tips, aspirator tips, and suction adapters.",
    sources: ["Evacuation", "Saliva Ejectors", "Suction"],
    pattern: /evacuat|suction|saliva ejector|\bhve\b|aspirator/,
    subcategories: [
      { name: "Saliva Ejectors", match: "saliva ejector", blurb: "Disposable saliva ejectors and tips." },
      { name: "HVE Tips", match: "\\bhve\\b|high volume", blurb: "High-volume evacuation tips." },
      { name: "Surgical Suction", match: "surgical|aspirator", blurb: "Surgical aspirator and suction tips." },
      { name: "Adapters", match: "adapter|valve", blurb: "Suction valves, screens, and adapters." },
    ],
  },
  {
    slug: "instruments",
    image: "https://www.pearsondental.com/catalog/img_ext/A914999_Item.jpg",
    name: "Instruments",
    tint: "rose",
    description: "Hand instruments for diagnostic, restorative, hygiene, and surgical procedures.",
    sources: ["Instruments", "Hand Instruments"],
    pattern: /instrument|scaler|forcep|plier|mirror|explorer|elevator/,
    subcategories: [
      { name: "Scalers & Curettes", match: "scaler|curette|gracey|sickle", blurb: "Hand scalers and curettes for deposit removal." },
      { name: "Mirrors", match: "mirror", blurb: "Mouth mirrors and handles for intraoral visibility." },
      { name: "Forceps & Elevators", match: "forcep|elevator", blurb: "Extraction forceps and elevators." },
      { name: "Pliers", match: "plier", blurb: "Orthodontic and utility pliers." },
    ],
  },
  {
    slug: "oral-surgery",
    image: "https://www.dcdental.com/images/515302415600.01.png",
    name: "Oral Surgery",
    tint: "amber",
    description: "Sutures, blades, surgical instruments, and hemostatic supplies.",
    sources: ["Oral Surgery", "Surgical"],
    pattern: /oral surgery|surgical|suture|scalpel|blade|hemostat/,
    subcategories: [
      { name: "Sutures", match: "suture", blurb: "Absorbable and non-absorbable sutures." },
      { name: "Scalpels & Blades", match: "scalpel|blade", blurb: "Scalpel handles and surgical blades." },
      { name: "Surgical Instruments", match: "hemostat|rongeur|surgical", blurb: "Surgical hand instruments and accessories." },
      { name: "Hemostatic Agents", match: "hemostat|collagen|gelatin", blurb: "Hemostatic dressings and agents." },
    ],
  },
  {
    slug: "orthodontics",
    image: "https://www.pearsondental.com/catalog/img/O43-0194.jpg",
    name: "Orthodontics",
    tint: "cyan",
    description: "Brackets, archwires, elastics, ligatures, and retainer supplies.",
    sources: ["Orthodontics", "Ortho"],
    pattern: /orthodont|ortho|bracket|archwire|elastic|ligature/,
    subcategories: [
      { name: "Brackets", match: "bracket", blurb: "Metal, ceramic, and specialty brackets." },
      { name: "Archwires", match: "archwire|wire", blurb: "Nickel titanium and stainless archwires." },
      { name: "Elastics & Ligatures", match: "elastic|ligature", blurb: "Elastics, ligatures, and chain." },
      { name: "Retainers & Separators", match: "retainer|separator", blurb: "Retainer and separator supplies." },
    ],
  },
  {
    slug: "anesthetics",
    image: "https://www.dcdental.com/images/505678186624.01.png",
    name: "Anesthetics",
    tint: "indigo",
    description: "Local and topical anesthetics, needles, and syringes.",
    sources: ["Anesthetics", "Anesthetic", "Anesthesia"],
    pattern: /anesth|lidocaine|benzocaine|articaine|carpule|needle|syringe/,
    subcategories: [
      { name: "Local Anesthetic", match: "lidocaine|articaine|carpule|local", blurb: "Injectable local anesthetic cartridges." },
      { name: "Topical Anesthetic", match: "topical|benzocaine", blurb: "Topical gels, ointments, and sprays." },
      { name: "Needles", match: "needle", blurb: "Dental needles by gauge and length." },
      { name: "Syringes", match: "syringe", blurb: "Aspirating and specialty syringes." },
    ],
  },
  {
    slug: "crown-bridge",
    image: "https://www.dcdental.com/images/865082522563.01.png",
    name: "Crown & Bridge",
    tint: "teal",
    description: "Cements, provisional materials, crown forms, and core build-up.",
    sources: ["Crown & Bridge", "Crown and Bridge", "Temporary Crowns"],
    pattern: /crown|bridge|cement|temporary|provisional|core build/,
    subcategories: [
      { name: "Cements", match: "cement", blurb: "Permanent and temporary dental cements." },
      { name: "Temporary Crowns", match: "temporary|provisional", blurb: "Provisional crowns and temporary materials." },
      { name: "Core Build-Up", match: "core build", blurb: "Core build-up materials and accessories." },
      { name: "Crown Forms", match: "crown form|strip crown", blurb: "Crown forms and strip crowns." },
    ],
  },
  {
    slug: "laboratory",
    image: "https://www.pearsondental.com/catalog/img/S240104.JPG",
    name: "Laboratory",
    tint: "slate",
    description: "Gypsum, waxes, acrylics, and lab fabrication supplies.",
    sources: ["Laboratory", "Laboratory Products", "Lab"],
    pattern: /laborator|gypsum|\bwax|acrylic|articulator|model/,
    subcategories: [
      { name: "Gypsum", match: "gypsum|\\bstone\\b|plaster|die stone", blurb: "Dental stones and plaster for casts and dies." },
      { name: "Waxes", match: "\\bwax", blurb: "Inlay, baseplate, and utility waxes for fabrication." },
      { name: "Acrylics", match: "acrylic", blurb: "Self- and heat-cure acrylics for appliances and repairs." },
      { name: "Articulators", match: "articulator|facebow", blurb: "Articulators and facebows for mounting casts." },
    ],
  },
  {
    slug: "xray-imaging",
    image: "https://www.darbydental.com/media/catalog/product/9/5/9522828_large_3.jpg",
    name: "X-Ray & Imaging",
    tint: "sky",
    description: "Sensors, film, phosphor plates, and radiography supplies.",
    sources: ["X-Ray & Imaging", "Imaging & X-Ray", "X-Ray", "Xray", "Imaging"],
    pattern: /x-?ray|radiograph|imaging|sensor|\bfilm\b/,
    subcategories: [
      { name: "Sensors", match: "sensor", blurb: "Digital sensors for fast intraoral radiographs." },
      { name: "Film", match: "\\bfilm", blurb: "Intraoral and extraoral film for traditional imaging." },
      { name: "Phosphor Plates", match: "phosphor|\\bpsp\\b|imaging plate", blurb: "Reusable phosphor plates for digital scanning." },
      { name: "Mounts", match: "\\bmount", blurb: "Film mounts and barriers for organized imaging." },
    ],
  },
  {
    slug: "small-equipment",
    image: "https://www.dcdental.com/images/757540867548.01.png",
    name: "Small Equipment",
    tint: "green",
    description: "Handpieces, curing lights, motors, ultrasonic units, and chairside equipment.",
    sources: ["Small Equipment", "Equipment"],
    pattern: /equipment|handpiece|curing|motor|light|ultrasonic/,
    subcategories: [
      { name: "Handpieces", match: "handpiece", blurb: "High- and low-speed handpieces for daily use." },
      { name: "Curing Lights", match: "curing", blurb: "LED curing lights for polymerizing restorations." },
      { name: "Motors", match: "motor", blurb: "Endo and implant motors with controlled torque." },
      { name: "Ultrasonics", match: "ultrasonic|piezo|cavitron|scaler insert", blurb: "Ultrasonic scalers and inserts for debridement." },
    ],
  },
  {
    slug: "other-dental-supplies",
    image: "https://www.dcdental.com/images/062500558511.01.png",
    name: "Other Dental Supplies",
    tint: "slate",
    description: "General dental products that need more specific taxonomy review.",
    sources: ["Other Dental Supplies", "Dental Supplies"],
    pattern: /dental supplies|misc|general/,
    subcategories: [
      { name: "General Supplies", match: "supply|supplies|general", blurb: "Products waiting for a more precise catalog bucket." },
      { name: "Accessories", match: "accessor", blurb: "Accessories and adjunct supplies." },
      { name: "Organizers", match: "organizer|holder|rack", blurb: "Holders, racks, and storage accessories." },
      { name: "Miscellaneous", match: "misc", blurb: "Low-confidence products queued for review." },
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

// Net32's category popularity ordering, captured 2026-07-01 from the net32.com
// homepage category browser plus the /ec/dental-supplies featured-category
// carousel, mapped onto our departments (e.g. their Infection Control-Personal
// → Gloves, Cements/Liners/Adhesives → Crown & Bridge, Cosmetic Dentistry →
// Composites & Restoratives + Bonding). Departments Net32 doesn't feature fall
// back to product-count order after the ranked ones.
const NET32_CATEGORY_RANK = new Map(
  [
    "infection-control",
    "sterilization",
    "gloves",
    "preventive",
    "oral-surgery",
    "anesthetics",
    "impression-materials",
    "crown-bridge",
    "restorative",
    "bonding-etching",
    "xray-imaging",
    "evacuation",
    "endodontics",
    "instruments",
  ].map((slug, index) => [slug, index])
)

// Roll live category rows (from /api/catalog) up into the curated departments:
// sum product counts, keep the highest supplier count, and the single cheapest
// best-value offer. Returns only populated departments, in Net32 popularity
// order (product-count order for the unranked tail).
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
    .sort((a, b) => {
      const rankA = NET32_CATEGORY_RANK.get(a.slug) ?? Infinity
      const rankB = NET32_CATEGORY_RANK.get(b.slug) ?? Infinity
      return rankA === rankB ? b.product_count - a.product_count : rankA - rankB
    })
}
