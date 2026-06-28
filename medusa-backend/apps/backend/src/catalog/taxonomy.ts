export type TaxonomyInput = {
  name?: string | null
  category?: string | null
  subcategory?: string | null
}

export type TaxonomyClassification = {
  slug: string
  department: string
  subcategory: string
  path: string[]
  confidence: number
  reason: string
}

type TaxonomyRule = {
  slug: string
  department: string
  aliases: string[]
  categoryPattern: RegExp
  productPattern: RegExp
  subcategories: { name: string; pattern: RegExp }[]
}

const GENERIC_CATEGORY_NAMES = new Set(["", "dental supplies", "shop by category"])

const TAXONOMY_RULES: TaxonomyRule[] = [
  {
    slug: "gloves",
    department: "Gloves",
    aliases: ["gloves", "exam gloves", "surgical gloves"],
    categoryPattern: /\bgloves?\b/i,
    productPattern: /\b(nitrile|latex|vinyl|chloroprene|exam|surgical)\s+gloves?\b|\bgloves?\b/i,
    subcategories: [
      { name: "Nitrile Gloves", pattern: /\bnitrile\b/i },
      { name: "Latex Gloves", pattern: /\blatex\b/i },
      { name: "Vinyl Gloves", pattern: /\bvinyl\b/i },
      { name: "Surgical Gloves", pattern: /\bsurgical\b/i },
    ],
  },
  {
    slug: "infection-control",
    department: "Infection Control",
    aliases: ["infection control", "infection control & ppe", "barrier protection"],
    categoryPattern: /infection|barrier|ppe|disinfect|sanit/i,
    productPattern: /disinfect|cavicide|caviwipe|sani-?cloth|mask|face shield|gown|barrier|bib|tray cover/i,
    subcategories: [
      { name: "Surface Disinfectants", pattern: /disinfect|cavicide|caviwipe|sani-?cloth/i },
      { name: "Masks & Face Shields", pattern: /mask|face shield/i },
      { name: "Barrier Covers", pattern: /barrier|tray cover|sleeve|bib/i },
      { name: "Gowns & Apparel", pattern: /gown|jacket|apparel/i },
    ],
  },
  {
    slug: "sterilization",
    department: "Sterilization",
    aliases: ["sterilization", "sterilization & infection prevention"],
    categoryPattern: /steriliz|autoclave|pouch|spore|indicator/i,
    productPattern: /steriliz|autoclave|pouch|wrap|indicator|spore|cassette/i,
    subcategories: [
      { name: "Sterilization Pouches", pattern: /pouch|bag/i },
      { name: "Wraps", pattern: /wrap/i },
      { name: "Indicators & Tests", pattern: /indicator|spore|integrator|test/i },
      { name: "Cassettes", pattern: /cassette/i },
    ],
  },
  {
    slug: "burs-diamonds",
    department: "Burs & Diamonds",
    aliases: ["burs & diamonds", "burs", "diamonds"],
    categoryPattern: /\bburs?\b|diamond/i,
    productPattern: /\bburs?\b|diamond|carbide|fg\b|hp\b|ra\b/i,
    subcategories: [
      { name: "Diamond Burs", pattern: /diamond/i },
      { name: "Carbide Burs", pattern: /carbide/i },
      { name: "Surgical Burs", pattern: /surgical/i },
      { name: "Lab Burs", pattern: /\blab\b|hp\b/i },
    ],
  },
  {
    slug: "finishing-polishing",
    department: "Finishing & Polishing",
    aliases: ["finishing & polishing", "polishing", "abrasives"],
    categoryPattern: /finish|polish|abrasive|disc/i,
    productPattern: /finish|polish|abrasive|disc|strip|cup|point|wheel/i,
    subcategories: [
      { name: "Polishers", pattern: /polish|cup|point|wheel/i },
      { name: "Finishing Discs", pattern: /\bdisc/i },
      { name: "Strips", pattern: /strip/i },
      { name: "Abrasives", pattern: /abrasive/i },
    ],
  },
  {
    slug: "restorative",
    department: "Composites & Restoratives",
    aliases: ["restorative", "restorative & cosmetic", "cosmetic dentistry", "surgical & restoratives"],
    categoryPattern: /restorat|cosmetic|composite|filling/i,
    productPattern: /composite|restorative|flowable|amalgam|glass ionomer|liner|base/i,
    subcategories: [
      { name: "Composite", pattern: /composite|flowable/i },
      { name: "Amalgam", pattern: /amalgam/i },
      { name: "Glass Ionomer", pattern: /glass ionomer|gi\b/i },
      { name: "Liners & Bases", pattern: /liner|base/i },
    ],
  },
  {
    slug: "bonding-etching",
    department: "Bonding Agents & Etchants",
    aliases: ["bonding agents", "bonding agents & etchants", "etchants"],
    categoryPattern: /bond|adhesive|etch|primer/i,
    productPattern: /bond|adhesive|etch|primer|silane/i,
    subcategories: [
      { name: "Bonding Agents", pattern: /bond|adhesive/i },
      { name: "Etchants", pattern: /etch/i },
      { name: "Primers", pattern: /primer/i },
      { name: "Silane", pattern: /silane/i },
    ],
  },
  {
    slug: "matrix-materials",
    department: "Matrix Materials",
    aliases: ["matrix materials", "matrix bands", "matrix systems"],
    categoryPattern: /matrix|matrices|tofflemire|wedge/i,
    productPattern: /matrix|matrices|tofflemire|wedge|sectional|band/i,
    subcategories: [
      { name: "Sectional Matrix", pattern: /sectional/i },
      { name: "Matrix Bands", pattern: /band|matrix|matrices/i },
      { name: "Wedges", pattern: /wedge/i },
      { name: "Retainers", pattern: /tofflemire|retainer/i },
    ],
  },
  {
    slug: "endodontics",
    department: "Endodontics",
    aliases: ["endodontics", "endo"],
    categoryPattern: /endo|root canal|obturat|gutta|irrigant/i,
    productPattern: /endo|root canal|gutta|file|reamer|obturation|irrigant|sealer|paper point/i,
    subcategories: [
      { name: "Files & Reamers", pattern: /\bfile|reamer|rotary/i },
      { name: "Gutta Percha", pattern: /gutta/i },
      { name: "Irrigation", pattern: /irrigat|hypochlorite|naocl|edta/i },
      { name: "Sealers", pattern: /sealer/i },
    ],
  },
  {
    slug: "preventive",
    department: "Preventive",
    aliases: ["preventive", "preventives", "preventive & hygiene", "hygiene"],
    categoryPattern: /prevent|hygiene|prophy|fluoride|sealant/i,
    productPattern: /prophy|fluoride|varnish|sealant|floss|interdental|toothbrush|paste/i,
    subcategories: [
      { name: "Prophy", pattern: /prophy|paste|cup|brush/i },
      { name: "Fluoride", pattern: /fluoride|varnish/i },
      { name: "Sealants", pattern: /sealant/i },
      { name: "Floss & Home Care", pattern: /floss|interdental|toothbrush/i },
    ],
  },
  {
    slug: "impression-materials",
    department: "Impression Materials",
    aliases: ["impression material", "impression materials"],
    categoryPattern: /impression|alginate|vps|pvs|bite registration/i,
    productPattern: /impression|alginate|vps|pvs|polyvinyl|polysiloxane|bite registration|tray adhesive/i,
    subcategories: [
      { name: "Alginate", pattern: /alginate/i },
      { name: "VPS / PVS", pattern: /vps|pvs|polyvinyl|polysiloxane/i },
      { name: "Bite Registration", pattern: /bite registration|bite reg/i },
      { name: "Tray Adhesives", pattern: /adhesive/i },
    ],
  },
  {
    slug: "evacuation",
    department: "Evacuation",
    aliases: ["evacuation", "saliva ejectors", "suction"],
    categoryPattern: /evacuat|suction|saliva ejector|hve/i,
    productPattern: /saliva ejector|hve|suction|evacuat|aspirator tip/i,
    subcategories: [
      { name: "Saliva Ejectors", pattern: /saliva ejector/i },
      { name: "HVE Tips", pattern: /hve|high volume/i },
      { name: "Surgical Suction", pattern: /surgical|aspirator/i },
      { name: "Adapters", pattern: /adapter|valve/i },
    ],
  },
  {
    slug: "instruments",
    department: "Instruments",
    aliases: ["instruments", "hand instruments"],
    categoryPattern: /instrument|scaler|forcep|plier|mirror|explorer/i,
    productPattern: /scaler|curette|forcep|plier|mirror|explorer|excavator|burnisher|elevator/i,
    subcategories: [
      { name: "Scalers & Curettes", pattern: /scaler|curette|gracey|sickle/i },
      { name: "Mirrors", pattern: /mirror/i },
      { name: "Forceps & Elevators", pattern: /forcep|elevator/i },
      { name: "Pliers", pattern: /plier/i },
    ],
  },
  {
    slug: "oral-surgery",
    department: "Oral Surgery",
    aliases: ["oral surgery", "surgical"],
    categoryPattern: /oral surgery|surgical|suture|scalpel|blade/i,
    productPattern: /suture|scalpel|blade|hemostat|rongeur|surgical/i,
    subcategories: [
      { name: "Sutures", pattern: /suture/i },
      { name: "Scalpels & Blades", pattern: /scalpel|blade/i },
      { name: "Surgical Instruments", pattern: /hemostat|rongeur|surgical/i },
      { name: "Hemostatic Agents", pattern: /hemostat|collagen|gelatin/i },
    ],
  },
  {
    slug: "orthodontics",
    department: "Orthodontics",
    aliases: ["orthodontics", "ortho"],
    categoryPattern: /orthodont|ortho|bracket|archwire|elastic/i,
    productPattern: /orthodont|bracket|archwire|elastic|ligature|retainer|separator|bondable tube/i,
    subcategories: [
      { name: "Brackets", pattern: /bracket/i },
      { name: "Archwires", pattern: /archwire|wire/i },
      { name: "Elastics & Ligatures", pattern: /elastic|ligature/i },
      { name: "Retainers & Separators", pattern: /retainer|separator/i },
    ],
  },
  {
    slug: "anesthetics",
    department: "Anesthetics",
    aliases: ["anesthetics", "anesthetic", "anesthesia"],
    categoryPattern: /anesth|lidocaine|benzocaine|needle/i,
    productPattern: /anesth|lidocaine|benzocaine|articaine|carpule|needle|syringe/i,
    subcategories: [
      { name: "Local Anesthetic", pattern: /lidocaine|articaine|carpule|local/i },
      { name: "Topical Anesthetic", pattern: /topical|benzocaine/i },
      { name: "Needles", pattern: /needle/i },
      { name: "Syringes", pattern: /syringe/i },
    ],
  },
  {
    slug: "crown-bridge",
    department: "Crown & Bridge",
    aliases: ["crown & bridge", "crown and bridge", "temporary crowns"],
    categoryPattern: /crown|bridge|cement|temporary/i,
    productPattern: /crown|bridge|cement|temporary|provisional|core build/i,
    subcategories: [
      { name: "Cements", pattern: /cement/i },
      { name: "Temporary Crowns", pattern: /temporary|provisional/i },
      { name: "Core Build-Up", pattern: /core build/i },
      { name: "Crown Forms", pattern: /crown form|strip crown/i },
    ],
  },
  {
    slug: "xray-imaging",
    department: "X-Ray & Imaging",
    aliases: ["x-ray", "xray", "x-ray & imaging", "imaging"],
    categoryPattern: /x-?ray|radiograph|imaging|sensor|film/i,
    productPattern: /x-?ray|radiograph|imaging|sensor|film|phosphor|psp|mount/i,
    subcategories: [
      { name: "Sensors & Plates", pattern: /sensor|phosphor|psp|plate/i },
      { name: "Film", pattern: /\bfilm\b/i },
      { name: "Positioners", pattern: /positioner|holder/i },
      { name: "Mounts", pattern: /mount/i },
    ],
  },
  {
    slug: "small-equipment",
    department: "Small Equipment",
    aliases: ["small equipment", "equipment"],
    categoryPattern: /equipment|handpiece|curing|motor|ultrasonic/i,
    productPattern: /handpiece|curing light|motor|ultrasonic|cavitron|piezo|equipment/i,
    subcategories: [
      { name: "Handpieces", pattern: /handpiece/i },
      { name: "Curing Lights", pattern: /curing light/i },
      { name: "Motors", pattern: /motor/i },
      { name: "Ultrasonics", pattern: /ultrasonic|cavitron|piezo/i },
    ],
  },
  {
    slug: "laboratory",
    department: "Laboratory",
    aliases: ["laboratory", "laboratory products", "lab"],
    categoryPattern: /laborator|\blab\b|gypsum|wax|acrylic|model/i,
    productPattern: /gypsum|stone|plaster|wax|acrylic|articulator|model|lab/i,
    subcategories: [
      { name: "Gypsum & Stone", pattern: /gypsum|stone|plaster/i },
      { name: "Waxes", pattern: /\bwax/i },
      { name: "Acrylics", pattern: /acrylic/i },
      { name: "Model Supplies", pattern: /model|articulator/i },
    ],
  },
]

const FALLBACK: TaxonomyClassification = {
  slug: "other-dental-supplies",
  department: "Other Dental Supplies",
  subcategory: "General Supplies",
  path: ["Other Dental Supplies", "General Supplies"],
  confidence: 0,
  reason: "fallback",
}

function normalize(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function displayFallback(value: string): string {
  const text = value.trim()
  if (!text) {
    return FALLBACK.department
  }
  return text
    .split(/\s+/)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ")
}

function classifySubcategory(rule: TaxonomyRule, haystack: string): string {
  const match = rule.subcategories.find((subcategory) => subcategory.pattern.test(haystack))
  return match?.name || rule.department
}

export function classifyTaxonomy(input: TaxonomyInput): TaxonomyClassification {
  const category = input.category || ""
  const name = input.name || ""
  const subcategory = input.subcategory || ""
  const categoryKey = normalize(category)
  const categoryText = [category, subcategory].filter(Boolean).join(" ")
  const allText = [category, subcategory, name].filter(Boolean).join(" ")
  const genericCategory = GENERIC_CATEGORY_NAMES.has(categoryKey)

  let best: (TaxonomyClassification & { score: number }) | null = null
  for (const rule of TAXONOMY_RULES) {
    let score = 0
    let reason = ""
    const aliasHit = rule.aliases.find((alias) => normalize(alias) === categoryKey)
    if (aliasHit) {
      score += 120
      reason = `category:${aliasHit}`
    } else if (!genericCategory && rule.aliases.some((alias) => categoryKey.includes(normalize(alias)))) {
      score += 90
      reason = "category-alias"
    }
    if (rule.categoryPattern.test(categoryText)) {
      score += genericCategory ? 25 : 70
      reason ||= "category-pattern"
    }
    if (rule.productPattern.test(allText)) {
      score += genericCategory ? 55 : 35
      reason ||= "product-pattern"
    }
    if (score <= 0) {
      continue
    }
    const sub = classifySubcategory(rule, allText)
    const candidate = {
      slug: rule.slug,
      department: rule.department,
      subcategory: sub,
      path: sub === rule.department ? [rule.department] : [rule.department, sub],
      confidence: Math.min(100, score),
      reason,
      score,
    }
    if (!best || candidate.score > best.score) {
      best = candidate
    }
  }

  if (!best) {
    return FALLBACK
  }

  const { score, ...classification } = best
  return classification
}

export function displayTaxonomyCategory(category: string): string {
  const key = normalize(category)
  const rule = TAXONOMY_RULES.find(
    (candidate) =>
      normalize(candidate.department) === key ||
      candidate.slug === key.replace(/\s+/g, "-") ||
      candidate.aliases.some((alias) => normalize(alias) === key)
  )
  return rule?.department || displayFallback(category)
}

export function taxonomyRules() {
  return TAXONOMY_RULES.map(({ slug, department, aliases }) => ({ slug, department, aliases }))
}
