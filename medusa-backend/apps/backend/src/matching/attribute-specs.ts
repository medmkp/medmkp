// ---------------------------------------------------------------------------
// Variant attribute registry — the single source of truth for product variants
//
// Dental products are heavily differentiated by size / gauge / shade / flavor /
// model. The matcher treats each such axis as a HARD CONFLICT: two listings that
// state disjoint values on a shared axis are different products and must not
// cluster (so per-unit price comparison stays valid). The catalog then RE-GROUPS
// the split canonicals into one browsable product with a variant selector
// (see family.ts).
//
// Historically each new product category added one bespoke regex to
// normalize.ts AND a matching entry to family.ts — a two-file change per axis.
// This registry collapses that to ONE declarative entry: a VariantSpec carries
//   - extract():  how to read the axis value(s) from a listing  (drives matching)
//   - family?:    per-axis selector display config              (drives the PDP)
// An axis WITHOUT a `family` entry is conflict-only: it splits clusters but is
// not surfaced as a selectable option (e.g. color, suture needle). An axis WITH
// one becomes a catalog variant selector with ordered, labeled options.
//
// Adding a new variant axis = appending one VariantSpec here. normalize.ts and
// family.ts both read from this file; neither needs editing.
// ---------------------------------------------------------------------------

/** Inputs available to a spec's extractor. */
export type ExtractContext = {
  /** Original product name. */
  name: string
  /** Diacritic-stripped, lowercased name — what most regexes run against. */
  lowered: string
  /** Normalized manufacturer SKU (uppercase alphanumerics only). */
  mfrSku: string
  /** Raw manufacturer_sku as supplied. */
  rawMfrSku: string
  /** Raw brand as supplied. */
  brand: string
}

/** Display config for an axis that is surfaced as a catalog variant selector. */
export type FamilyAxisConfig = {
  /**
   * Selection order when a cluster carries several modeled axes — the lowest
   * number wins as the variant dimension. Product-line/length axes sit ahead of
   * generic size/measure axes because those SKUs can share a size or gauge
   * across the variants, so the specific axis is what actually varies.
   */
  priority: number
  /**
   * Human name for the axis itself, shown as the selector group heading and the
   * spec-row label (e.g. "Shade", "Size", "Gauge"). Persisted by the matcher so
   * the catalog labels variants from the registry, not a value-shape heuristic.
   */
  axisLabel: string
  /** Human label for a value, e.g. "Large", "25 mm", "A2". */
  label: (value: string) => string
  /**
   * Sort order within the family selector. Persisted in an INTEGER column, so
   * every value must be a whole number — magnitudes that can be fractional
   * (taper 0.04, 2.5mm, shade A1.5) are scaled ×100 so sub-integer ordering
   * survives the rounding.
   */
  rank: (value: string) => number
  /**
   * Worded tokens removed from the family key so variants group (glove "large",
   * cotton-roll "braided"). Measured/coded tokens never reach the family key, so
   * only word-token axes need this.
   */
  stripTokens?: string[]
  /** Token pattern removed from the family key (shade "A1" etc.). */
  stripPattern?: RegExp
}

/** One variant axis (or a small cluster of related axes from one category). */
export type VariantSpec = {
  /** Stable identifier for the spec (documentation / debugging only). */
  id: string
  /**
   * Read axis values from a listing. Returns [axis, value] pairs; the caller
   * normalizes and de-duplicates values. The extractor owns its own category
   * gate (an early return when the listing isn't of the relevant type) so the
   * behavior maps 1:1 onto the old inline blocks.
   */
  extract: (ctx: ExtractContext) => Array<[axis: string, value: string]>
  /** Per-axis selector display config; omit for conflict-only axes. */
  family?: Record<string, FamilyAxisConfig>
}

// --- shared vocab ----------------------------------------------------------

/** Common product colors captured as a hard-conflict axis. Also consumed by
 * search.ts (re-exported through normalize.ts) for stop-word filtering. */
export const COLOR_WORDS = [
  "black",
  "blue",
  "brown",
  "clear",
  "gold",
  "gray",
  "green",
  "grey",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "teal",
  "white",
  "yellow",
]

const TOPICAL_FLUORIDE_FLAVORS = [
  "berry",
  "bubblegum",
  "cherry",
  "grape",
  "melon",
  "mint",
  "raspberry",
  "strawberry",
]

// --- selector label/rank helpers -------------------------------------------

const SIZE_RANK: Record<string, number> = {
  XS: 0, S: 1, M: 2, L: 3, XL: 4, "2XL": 5, "3XL": 6,
}
/** Selector sort order for colors — the registry list order (blue before black,
 * etc.). Values are already normalized (grey → gray), so the map is keyed on the
 * normalized value. */
const COLOR_RANK: Record<string, number> = Object.fromEntries(
  COLOR_WORDS.map((color, index) => [color, index])
)
const SIZE_LABEL: Record<string, string> = {
  XS: "X-Small", S: "Small", M: "Medium", L: "Large",
  XL: "X-Large", "2XL": "2X-Large", "3XL": "3X-Large",
}
const COTTON_ROLL_STYLE_RANK: Record<string, number> = { braided: 0, econo: 1, wrapped: 2 }
const NEEDLE_LENGTH_RANK: Record<string, number> = { short: 0, long: 1 }

const scaled = (value: string) => Math.round((parseFloat(value) || 0) * 100)
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** Display config for a measured-unit axis (mm/ml/ga/...). */
function measureAxis(priority: number, unit: string, axisLabel: string): FamilyAxisConfig {
  return {
    priority,
    axisLabel,
    label: (value) => (unit === "%" ? `${value}%` : `${value} ${unit}`),
    rank: scaled,
  }
}

// ---------------------------------------------------------------------------
// The registry. Order is irrelevant to matching (each axis is independent), but
// kept roughly category-grouped for readability.
// ---------------------------------------------------------------------------

export const VARIANT_SPECS: VariantSpec[] = [
  // Measured units: "25mm", "18ga", "1.2 mm x 1.5 mm". Emits one axis per unit
  // plus an "<unit>_dim" axis for two-dimension callouts (mm/cm/in).
  {
    id: "measure",
    extract: ({ lowered }) => {
      const out: Array<[string, string]> = []
      const measureRe =
        /(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?)\s*)?(mm|cm|ml|cc|oz|gauge|ga|gr|kg|lb|in|l|%|g)\b/g
      let match: RegExpExecArray | null
      while ((match = measureRe.exec(lowered))) {
        let unit = match[3]
        if (unit === "gauge" || unit === "g") {
          unit = "ga"
        }
        out.push([unit, match[1]])
        if (match[2]) {
          out.push([unit, match[2]])
          if (unit === "mm" || unit === "cm" || unit === "in") {
            out.push([`${unit}_dim`, `${match[1]}x${match[2]}`])
          }
        }
      }
      const physicalDimRe = /(\d+(?:\.\d+)?)\s*(mm|cm|in)\s*x\s*(\d+(?:\.\d+)?)\s*\2\b/g
      while ((match = physicalDimRe.exec(lowered))) {
        out.push([`${match[2]}_dim`, `${match[1]}x${match[3]}`])
      }
      return out
    },
    family: {
      mm: measureAxis(7, "mm", "Length"),
      cm: measureAxis(8, "cm", "Length"),
      in: measureAxis(9, "in", "Length"),
      ga: measureAxis(10, "ga", "Gauge"),
      ml: measureAxis(11, "ml", "Volume"),
      cc: measureAxis(12, "cc", "Volume"),
      oz: measureAxis(13, "oz", "Weight"),
      gr: measureAxis(14, "gr", "Weight"),
      kg: measureAxis(15, "kg", "Weight"),
      lb: measureAxis(16, "lb", "Weight"),
      l: measureAxis(17, "l", "Volume"),
      "%": measureAxis(18, "%", "Concentration"),
    },
  },

  // Dental burs often specify both a head diameter and a working length in the
  // same name. The generic "mm" axis collapses both into one set, so split them
  // into separate axes for bur/diamond listings so diameter variants conflict.
  {
    id: "bur_dimensions",
    extract: ({ lowered }) => {
      if (!/\b(?:burs?|diamonds?)\b/.test(lowered)) {
        return []
      }
      const out: Array<[string, string]> = []
      const burMeasurementRe = /(\d+(?:\.\d+)?)\s*mm\s+(diameter|length)\b/g
      let match: RegExpExecArray | null
      while ((match = burMeasurementRe.exec(lowered))) {
        out.push([`bur_${match[2]}`, match[1]])
      }
      return out
    },
  },

  // Composite/restorative shade: a color code (A1..D7, optional .5) with an
  // optional layer letter (B=Body, E=Enamel, T=Translucent), plus the
  // white-family shades (White / Extra White) that carry no numeric code. The
  // layer letter is consumed but not stored, so "A1 Body" and "A1B" still agree;
  // white/extra-white become their own values so they conflict with numeric
  // shades instead of bridging the whole family.
  {
    id: "shade",
    extract: ({ lowered }) => {
      const out: Array<[string, string]> = []
      let match: RegExpExecArray | null
      const shadeRe = /\b([a-d][1-7](?:\.5)?)(?:[bet])?\b/g
      while ((match = shadeRe.exec(lowered))) {
        out.push(["shade", match[1]])
      }
      // "White" / "Extra White" are composite shades, but the same words name a
      // COLOR on masks, gloves, gowns and other textiles. Skip the WORDED white
      // shades for those so a white mask/glove is a color variant (see the color
      // spec), not a shade. Numeric A1-D7 codes above stay global — they're
      // unambiguous — so this only reclassifies the bare word.
      const isApparel =
        /\b(?:masks?|gloves?|gowns?|bibs?|aprons?|drapes?|towels?|napkins?|scrubs?|face\s*shields?)\b/.test(
          lowered
        )
      if (!isApparel) {
        // Extra-white is matched first so "XW"/"XWB" isn't read as plain white.
        const xWhiteRe = /\b(?:x[\s-]?w[be]?|(?:extra|xtra)[\s-]?white)\b/g
        while ((match = xWhiteRe.exec(lowered))) {
          out.push(["shade", "xw"])
        }
        const whiteRe = /\b(?:wb|whb|white)\b/g
        while ((match = whiteRe.exec(lowered))) {
          out.push(["shade", "w"])
        }
      }
      // Ivoclar Tetric composites use roman-style shade codes (IVA/IVB/IVW)
      // instead of the A1-D7 family. Treat them as shades only inside the scoped
      // Tetric composite line so generic roman numerals elsewhere are untouched.
      if (/\btetric\b/.test(lowered) && /\b(?:composite|powerfill|powerflow)\b/.test(lowered)) {
        const tetricShadeRe = /\biv([abw])\b/g
        while ((match = tetricShadeRe.exec(lowered))) {
          out.push(["shade", `iv${match[1]}`])
        }
      }
      return out
    },
    family: {
      shade: {
        priority: 4,
        axisLabel: "Shade",
        label: (value) => value.toUpperCase(),
        rank: (value) => {
          const upper = value.toUpperCase()
          return upper.charCodeAt(0) * 1000 + Math.round((parseFloat(upper.slice(1)) || 0) * 100)
        },
        stripPattern: /^[a-d][1-7](\.5)?$/,
      },
    },
  },

  // Ivoclar ExciTE F and ExciTE F DSC are distinct adhesive variants whose names
  // differ by one short token and share package/SKU-family vocabulary.
  {
    id: "excite_f_variant",
    extract: ({ lowered }) => {
      if (!(/\bexcite\b/.test(lowered) && /\bf\b/.test(lowered) && /\badhesive\b/.test(lowered))) {
        return []
      }
      return [["excite_f_variant", /\bdsc\b/.test(lowered) ? "dsc" : "regular"]]
    },
  },

  // Topical fluoride gels are sold as otherwise-identical flavor variants. Flavor
  // is the product discriminator, not a descriptive color.
  {
    id: "topical_fluoride_flavor",
    extract: ({ lowered }) => {
      if (!(/\b(?:fluoride|apf)\b/.test(lowered) && /\bgels?\b/.test(lowered))) {
        return []
      }
      const out: Array<[string, string]> = []
      const flavorRe = new RegExp(`\\b(${TOPICAL_FLUORIDE_FLAVORS.join("|")})\\b`, "g")
      let match: RegExpExecArray | null
      while ((match = flavorRe.exec(lowered))) {
        const flavor = match[1]
        const dyeFree = /\bdye[\s-]?free\b/.test(lowered) && flavor === "mint"
        out.push(["topical_fluoride_flavor", dyeFree ? "dye_free_mint" : flavor])
      }
      return out
    },
  },

  // CAD/CEREC milling blocks are product variants by physical block size (Size 12
  // vs 14L) and translucency (HT/High vs LT/Low vs MT/Medium).
  {
    id: "cad_block",
    extract: ({ lowered }) => {
      if (!/\b(?:blocs?|milling\s+blocks?|cerec|cad\s*cam|planmill)\b/.test(lowered)) {
        return []
      }
      const out: Array<[string, string]> = []
      if (/\b(?:ht|high\s+translucency)\b/.test(lowered)) {
        out.push(["cad_block_translucency", "ht"])
      }
      if (/\b(?:lt|low\s+translucency)\b/.test(lowered)) {
        out.push(["cad_block_translucency", "lt"])
      }
      if (/\b(?:mt|medium\s+translucency)\b/.test(lowered)) {
        out.push(["cad_block_translucency", "mt"])
      }
      let match: RegExpExecArray | null
      const sizeWordRe = /\bsize\s*(\d{1,2}l?)\b/g
      while ((match = sizeWordRe.exec(lowered))) {
        out.push(["cad_block_size", match[1]])
      }
      const sizeBeforeShadeRe = /\b(\d{1,2}l?)\s+(?:[a-d][1-7](?:\.5)?|bl)\b/g
      while ((match = sizeBeforeShadeRe.exec(lowered))) {
        out.push(["cad_block_size", match[1]])
      }
      return out
    },
  },

  // Common product colors (hard conflict). Surfaced as a selector so
  // otherwise-identical color variants — face masks in Blue/Black/White, gloves,
  // bibs — group into one browsable product with a Color selector instead of a
  // card per color. Lowest selector priority: color yields to a real size /
  // shade / model axis when a listing carries one (see the mask White case,
  // where the shade spec now defers to color for apparel), so color is the
  // variant only when nothing more specific varies.
  {
    id: "color",
    extract: ({ lowered }) => {
      const out: Array<[string, string]> = []
      const colorRe = new RegExp(`\\b(${COLOR_WORDS.join("|")})\\b`, "g")
      let match: RegExpExecArray | null
      while ((match = colorRe.exec(lowered))) {
        out.push(["color", match[1] === "grey" ? "gray" : match[1]])
      }
      return out
    },
    family: {
      color: {
        priority: 40,
        axisLabel: "Color",
        label: capitalize,
        rank: (value) => COLOR_RANK[value] ?? 99,
        stripTokens: COLOR_WORDS,
      },
    },
  },

  // Cotton roll product lines (Econo/Economy, Braided, Wrapped) are distinct
  // catalog items that share size/pack/"cotton roll" tokens.
  {
    id: "cotton_roll_style",
    extract: ({ lowered }) => {
      if (!/\b(?:cotton\s+)?rolls?\b/.test(lowered)) {
        return []
      }
      const out: Array<[string, string]> = []
      if (/\b(?:(?:econo|economy)\s+(?:cotton\s+)?rolls?|(?:cotton\s+)?rolls?\s+(?:econo|economy))\b/.test(lowered)) {
        out.push(["cotton_roll_style", "econo"])
      }
      if (/\bbraided\b/.test(lowered)) {
        out.push(["cotton_roll_style", "braided"])
      }
      if (/\bwrapped\b/.test(lowered)) {
        out.push(["cotton_roll_style", "wrapped"])
      }
      return out
    },
    family: {
      cotton_roll_style: {
        priority: 1,
        axisLabel: "Style",
        label: capitalize,
        rank: (value) => COTTON_ROLL_STYLE_RANK[value] ?? 99,
        stripTokens: ["econo", "economy", "braided", "wrapped"],
      },
    },
  },

  // Bare dimension "4x4" / "2x2" (sponges, gauze, matrix bands): two small
  // integers joined by x with no measure unit. Excludes decimals and
  // unit-suffixed forms so "24x1.2mL" and "5 x 30ml" aren't mistaken for a size.
  {
    id: "dim",
    extract: ({ lowered }) => {
      const out: Array<[string, string]> = []
      const dimRe = /\b(\d{1,2})\s*x\s*(\d{1,2})\b(?!\s*(?:mm|cm|ml|cc|oz|in|g|x|\.|\/))/g
      let match: RegExpExecArray | null
      while ((match = dimRe.exec(lowered))) {
        out.push(["dim", `${match[1]}x${match[2]}`])
      }
      return out
    },
  },

  // Endodontic file/point taper (".04", ".06").
  {
    id: "taper",
    extract: ({ lowered }) => {
      const out: Array<[string, string]> = []
      const taperRe = /(?:^|[^0-9.])\.(\d{2})\b/g
      let match: RegExpExecArray | null
      while ((match = taperRe.exec(lowered))) {
        out.push(["taper", `0.${match[1]}`])
      }
      return out
    },
    family: {
      taper: { priority: 5, axisLabel: "Taper", label: (value) => `${value} Taper`, rank: scaled },
    },
  },

  // "#"-numbered items (bur shapes, blade numbers): "#12", "#15/30".
  {
    id: "hash",
    extract: ({ lowered }) => {
      const out: Array<[string, string]> = []
      const hashRe = /#\s?(\d+(?:\/\d+)?)/g
      let match: RegExpExecArray | null
      while ((match = hashRe.exec(lowered))) {
        out.push(["#", match[1]])
      }
      return out
    },
    family: {
      "#": { priority: 6, axisLabel: "Number", label: (value) => `#${value}`, rank: scaled },
    },
  },

  // Sutures are differentiated by USP size ("4-0", "5/0"), length, and needle
  // code — all too generic to trust unless the name is explicitly a suture.
  {
    id: "suture",
    extract: ({ lowered }) => {
      if (!/\bsutures?\b/.test(lowered)) {
        return []
      }
      const out: Array<[string, string]> = []
      let match: RegExpExecArray | null
      const sutureSizeRe = /\b(\d{1,2})\s*[-–/]\s*0\b/g
      while ((match = sutureSizeRe.exec(lowered))) {
        out.push(["suture_size", `${match[1]}-0`])
      }
      const sutureLengthRe = /\b(\d{1,2})\s*(?:"|\bin(?:ch(?:es)?)?\b)/g
      while ((match = sutureLengthRe.exec(lowered))) {
        out.push(["suture_length", match[1]])
      }
      const sutureNeedleRe = /\b([a-z]{1,3})\s*-?\s*(\d{1,2}[a-z]?)\b/g
      while ((match = sutureNeedleRe.exec(lowered))) {
        out.push(["suture_needle", `${match[1]}${match[2]}`])
      }
      return out
    },
  },

  // Injection/hypodermic needle length (short vs long), scoped to needle
  // listings so generic "short"/"long" adjectives elsewhere don't veto.
  {
    id: "needle_length",
    extract: ({ lowered }) => {
      if (!/\bneedles?\b/.test(lowered)) {
        return []
      }
      const out: Array<[string, string]> = []
      const needleLengthRe = /\b(short|long)\b/g
      let match: RegExpExecArray | null
      while ((match = needleLengthRe.exec(lowered))) {
        out.push(["needle_length", match[1]])
      }
      return out
    },
    family: {
      needle_length: {
        priority: 2,
        axisLabel: "Length",
        label: capitalize,
        rank: (value) => NEEDLE_LENGTH_RANK[value] ?? 99,
        stripTokens: ["short", "long"],
      },
    },
  },

  // Stainless steel crown refills are size-specific. The size can appear as
  // "Size 5" next to a 5/Bx pack count, or in compact codes (UR1 / 1UR1).
  {
    id: "crown_size",
    extract: ({ lowered }) => {
      if (!(/\bcrowns?\b/.test(lowered) || /\b(?:primary|permanent|perm)\s+molar\b/.test(lowered))) {
        return []
      }
      const out: Array<[string, string]> = []
      let match: RegExpExecArray | null
      const crownSizeRe = /\bsize\s*(00|0|[1-9])\b/g
      while ((match = crownSizeRe.exec(lowered))) {
        out.push(["crown_size", match[1]])
      }
      const quadrantTrailingSizeRe = /\b(?:[1-6])?(?:ur|ul|lr|ll)(00|0|[1-9])\b/g
      while ((match = quadrantTrailingSizeRe.exec(lowered))) {
        out.push(["crown_size", match[1]])
      }
      const sizeBeforeQuadrantRe = /\b(00|0|[1-9])(?:ur|ul|lr|ll)\b/g
      while ((match = sizeBeforeQuadrantRe.exec(lowered))) {
        out.push(["crown_size", match[1]])
      }
      return out
    },
  },

  // NSK Ti-Max high-speed handpieces differ by backend/model code (Z890L,
  // Z890KL, ...). Supplier family pages can mention a generic leading model plus
  // the actual variant later, so keep the last model token as the discriminator.
  {
    id: "handpiece_model",
    extract: ({ lowered }) => {
      if (
        !(
          /\bhandpieces?\b/.test(lowered) &&
          /\b(?:nsk|ti[\s-]?max)\b/.test(lowered) &&
          !/\breplacement\s+parts?\b/.test(lowered)
        )
      ) {
        return []
      }
      const handpieceModels = [...lowered.matchAll(/\bz\s*[- ]?(\d{3,4})\s*([a-z]{1,3})\b/g)]
      const handpieceModel = handpieceModels.at(-1)
      return handpieceModel ? [["handpiece_model", `z${handpieceModel[1]}${handpieceModel[2]}`]] : []
    },
  },

  // 3M Unitek crown refills use near-identical names across sizes/positions, and
  // some titles omit the compact "UR1" size token; the six-digit Unitek model is
  // a reliable hard-conflict axis. Read from sku + name so it works whether the
  // model is in the SKU or the title.
  {
    id: "unitek_crown_model",
    extract: ({ lowered, rawMfrSku, name }) => {
      if (!(/\bunitek\b/.test(lowered) && /\bcrowns?\b/.test(lowered))) {
        return []
      }
      const model = `${rawMfrSku} ${name}`.match(/\b9\d{5}\b/)?.[0]
      return model ? [["unitek_crown_model", model]] : []
    },
  },

  // Endodontic paper points and gutta-percha points share brand, shape range
  // (F1/F2/F3), and "points" vocabulary, but are different materials and sizes.
  {
    id: "endo_point",
    extract: ({ lowered }) => {
      const out: Array<[string, string]> = []
      if (/\bpaper\s+points?\b|\babsorbent\s+points?\b/.test(lowered)) {
        out.push(["endo_point_material", "paper"])
      }
      if (/\bgutta[\s-]?percha\b/.test(lowered)) {
        out.push(["endo_point_material", "gutta_percha"])
      }
      if (/\b(?:paper\s+points?|absorbent\s+points?|gutta[\s-]?percha(?:\s+points?)?)\b/.test(lowered)) {
        const endoPointSizeRe = /\b(?:f[1-5]|sm[1-5]|ml[1-5])\b/g
        let match: RegExpExecArray | null
        while ((match = endoPointSizeRe.exec(lowered))) {
          out.push(["endo_point_size", match[0]])
        }
      }
      return out
    },
  },

  // Apparel/glove sizing (gloves, gowns, masks, lab coats). Only worded forms and
  // the X-prefixed family are matched; bare single letters (S/M/L) are too
  // ambiguous to trust.
  {
    id: "apparel_size",
    extract: ({ lowered }) => {
      const out: Array<[string, string]> = []
      let match: RegExpExecArray | null
      const sizeRe = /\b(?:(xxx|xx|3x|2x|x|extra)[\s-]?)?(small|medium|large)\b/g
      while ((match = sizeRe.exec(lowered))) {
        const prefix = match[1]
        const base = match[2]
        let value: string
        if (base === "medium") {
          value = "M"
        } else if (base === "small") {
          value = prefix ? "XS" : "S"
        } else if (!prefix) {
          value = "L"
        } else if (prefix === "x" || prefix === "extra") {
          value = "XL"
        } else if (prefix === "xx" || prefix === "2x") {
          value = "2XL"
        } else {
          value = "3XL"
        }
        out.push(["size", value])
      }
      const letterSizeRe = /\b(xs|xl|xxl|2xl|3xl|xxxl)\b/g
      const letterSizeMap: Record<string, string> = {
        xs: "XS", xl: "XL", xxl: "2XL", "2xl": "2XL", "3xl": "3XL", xxxl: "3XL",
      }
      while ((match = letterSizeRe.exec(lowered))) {
        out.push(["size", letterSizeMap[match[1]]])
      }
      return out
    },
    family: {
      size: {
        priority: 3,
        axisLabel: "Size",
        label: (value) => SIZE_LABEL[value] ?? value,
        rank: (value) => SIZE_RANK[value] ?? 99,
        stripTokens: ["small", "medium", "large", "xs", "xl", "xxl", "xxxl", "2xl", "3xl", "extra"],
      },
    },
  },

  // WallShoulders X-ray apron hanger models (GS####X / WS####X) — a same-supplier
  // name cluster that would otherwise weld distinct hanger models together.
  {
    id: "wallshoulders_model",
    extract: ({ mfrSku, name }) => {
      const model = mfrSku.match(/^(?:GS|WS)\d{4}[A-Z]$/)?.[0]
      if (
        model &&
        /\bwall\s*shoulders\b/i.test(name) &&
        /\bx[\s-]?ray\s+apron\s+hanger\b/i.test(name)
      ) {
        return [["wallshoulders_model", model]]
      }
      return []
    },
  },

  // PDT / Paradise Dental "Amazing Gracey" instrument models (trailing R###[R]).
  {
    id: "pdt_instrument_model",
    extract: ({ mfrSku, brand, name }) => {
      const model = mfrSku.match(/R\d{3}R?$/)?.[0]
      if (model && /\b(?:pdt|paradise\s+dental|amazing\s+gracey)\b/i.test(`${brand} ${name}`)) {
        return [["pdt_instrument_model", model]]
      }
      return []
    },
  },

  // ---- Axes surfaced by the Tier-3 discovery pass (npm run products:propose-axes) ----

  // Rim Lock impression trays are sold per arch position (Upper/Lower quadrant +
  // tooth number, e.g. "U15", "L18") — otherwise-identical trays. Position is the
  // sole variant, so it surfaces as a selector.
  {
    id: "tooth_arch_position",
    extract: ({ lowered }) => {
      if (!(/\brim\s*lock\b/.test(lowered) && /\bimpression\b/.test(lowered) && /\btrays?\b/.test(lowered))) {
        return []
      }
      const out: Array<[string, string]> = []
      const re = /\b([ul][12][1-8])\b/g
      let match: RegExpExecArray | null
      while ((match = re.exec(lowered))) {
        out.push(["tooth_arch_position", match[1]])
      }
      return out
    },
    family: {
      tooth_arch_position: {
        priority: 30,
        axisLabel: "Tray Position",
        label: (value) => value.toUpperCase(),
        rank: (value) => (value[0] === "u" ? 0 : 100) + (parseInt(value.slice(1), 10) || 0),
        stripPattern: /^[ul][12][1-8]$/,
      },
    },
  },

  // Macan rigid electrodes differ only by model code ("#R-F15", "#R-L32"). The
  // code is the variant; the rest of the listing is identical.
  {
    id: "electrode_model",
    extract: ({ lowered }) => {
      if (!(/\belectrode\b/.test(lowered) && /\brigid\b/.test(lowered))) {
        return []
      }
      const out: Array<[string, string]> = []
      const re = /\br[-\s]?([cfl]\d{1,2})\b/g
      let match: RegExpExecArray | null
      while ((match = re.exec(lowered))) {
        out.push(["electrode_model", match[1]])
      }
      return out
    },
    family: {
      electrode_model: {
        priority: 31,
        axisLabel: "Model",
        label: (value) => value.toUpperCase(),
        rank: () => 0,
        stripPattern: /^[cfl]\d{1,2}$/,
      },
    },
  },

  // Piezo scaler tips (e.g. Hu-Friedy "PWR Piezo Tip – S1 / ER2 / P10") differ
  // only by tip code, which selects the clinical use.
  {
    id: "piezo_tip_model",
    extract: ({ lowered }) => {
      if (!(/\bpiezo\b/.test(lowered) && /\btips?\b/.test(lowered))) {
        return []
      }
      const out: Array<[string, string]> = []
      const re = /\b((?:er|s|p)\d{1,2}r?)\b/g
      let match: RegExpExecArray | null
      while ((match = re.exec(lowered))) {
        out.push(["piezo_tip_model", match[1]])
      }
      return out
    },
    family: {
      piezo_tip_model: {
        priority: 32,
        axisLabel: "Tip",
        label: (value) => value.toUpperCase(),
        rank: () => 0,
        stripPattern: /^(?:er|s|p)\d{1,2}r?$/,
      },
    },
  },

  // Carbide "Bur Goldies" differ by ISO bur number ("41-P", "61-A/81-A") — the
  // shape/size designation. The cut type (Regular vs Diamond) stays in the name,
  // so each cut line forms its own family with an ISO-number selector.
  {
    id: "bur_iso_number",
    extract: ({ lowered }) => {
      if (!(/\bcarbide\b/.test(lowered) && /\bburs?\b/.test(lowered) && /\bgoldies?\b/.test(lowered))) {
        return []
      }
      const out: Array<[string, string]> = []
      const re = /\b(\d{2}-[a-z](?:\/\d{2}-[a-z])?)\b/g
      let match: RegExpExecArray | null
      while ((match = re.exec(lowered))) {
        out.push(["bur_iso_number", match[1]])
      }
      return out
    },
    family: {
      bur_iso_number: {
        priority: 33,
        axisLabel: "ISO Number",
        label: (value) => value.toUpperCase(),
        rank: (value) => parseInt(value, 10) || 0,
      },
    },
  },

  // Diamond burs are differentiated by abrasive GRIT (Coarse/Fine/Medium/Super-),
  // stated either as a word or as the trailing letters on a size code ("862-012Sf"
  // → super-fine, "801-014C" → coarse, "767.5C" → coarse). Modeled as a hard
  // conflict so a Coarse bur never clusters with a Fine one. Conflict-only (no
  // selector): these lines also vary by shape and size, so a clean single-axis
  // grit selector would mis-group — a size+grit selector is a follow-up.
  {
    id: "diamond_bur_grit",
    extract: ({ lowered }) => {
      const isDiamondBur =
        /\bdiamonds?\b/.test(lowered) &&
        /\b(?:burs?|hsb|striper|flame|round|taper|needle|cylinder|football|wheel|cone|pear|chamfer|inverted|fg)\b/.test(
          lowered
        )
      if (!isDiamondBur) {
        return []
      }
      // A stated grit word wins (and is taken alone) to avoid a word/code mismatch
      // giving one product two grit values.
      let word: string | null = null
      if (/\bsuper\s*coarse\b/.test(lowered)) word = "supercoarse"
      else if (/\bsuper\s*fine\b/.test(lowered)) word = "superfine"
      else if (/\bextra\s*coarse\b/.test(lowered)) word = "extracoarse"
      else if (/\bextra\s*fine\b/.test(lowered)) word = "extrafine"
      else if (/\bcoarse\b/.test(lowered)) word = "coarse"
      else if (/\bmedium\b/.test(lowered)) word = "medium"
      else if (/\bfine\b/.test(lowered)) word = "fine"
      if (word) {
        return [["diamond_bur_grit", word]]
      }
      const GRIT: Record<string, string> = {
        sf: "superfine", sc: "supercoarse", xf: "extrafine", xc: "extracoarse",
        c: "coarse", f: "fine", m: "medium",
      }
      const out: Array<[string, string]> = []
      const re = /\b\d{2,3}[.\-]\d{1,3}(sf|sc|xf|xc|c|f|m)\b/g
      let match: RegExpExecArray | null
      while ((match = re.exec(lowered))) {
        const grit = GRIT[match[1]]
        if (grit) {
          out.push(["diamond_bur_grit", grit])
        }
      }
      return out
    },
  },
]

// ---------------------------------------------------------------------------
// Derived views consumed by family.ts. Built once from VARIANT_SPECS so the
// selector behavior can never drift from the matching behavior.
// ---------------------------------------------------------------------------

/** axis -> selector display config, for every axis surfaced as a variant. */
export const SELECTOR_AXES: Map<string, FamilyAxisConfig> = (() => {
  const map = new Map<string, FamilyAxisConfig>()
  for (const spec of VARIANT_SPECS) {
    if (!spec.family) {
      continue
    }
    for (const [axis, config] of Object.entries(spec.family)) {
      map.set(axis, config)
    }
  }
  return map
})()

/** Selector axes in selection-priority order (lowest priority number first). */
export const AXIS_PRIORITY: string[] = [...SELECTOR_AXES.entries()]
  .sort((a, b) => a[1].priority - b[1].priority)
  .map(([axis]) => axis)

/** Per-axis strip config (worded tokens + a token pattern) for building a family
 * key. Scoped to the axis on purpose: a family strips only the tokens of ITS OWN
 * variant axis. Stripping every axis's tokens globally would fuse two lines that
 * are distinct on a different axis — a Blue and a Purple glove line, each stripped
 * of color, would collapse into one Size family with duplicate "Large" labels. */
const AXIS_STRIP: Map<string, { tokens: Set<string>; patterns: RegExp[] }> = (() => {
  const map = new Map<string, { tokens: Set<string>; patterns: RegExp[] }>()
  for (const [axis, config] of SELECTOR_AXES) {
    map.set(axis, {
      tokens: new Set(config.stripTokens ?? []),
      patterns: config.stripPattern ? [config.stripPattern] : [],
    })
  }
  return map
})()

function matchesStrip(strip: { tokens: Set<string>; patterns: RegExp[] }, token: string): boolean {
  return strip.tokens.has(token) || strip.patterns.some((re) => re.test(token))
}

/** True when `token` is a varying-attribute token. Scoped to `axis` when given,
 * so a family key drops only the tokens of ITS OWN axis (two glove sizes / two
 * shades / two mask colors share one key, while a token that varies a DIFFERENT
 * axis stays as product identity). With no `axis`, checks across every selector
 * axis — the Tier-3 discovery pass uses that to skip already-modeled tokens. */
export function isFamilyStripToken(token: string, axis?: string): boolean {
  if (axis === undefined) {
    return [...AXIS_STRIP.values()].some((strip) => matchesStrip(strip, token))
  }
  const strip = AXIS_STRIP.get(axis)
  return strip ? matchesStrip(strip, token) : false
}

/** Every modeled concept's id, e.g. for telling the Tier-3 proposer what the
 * registry already covers so it doesn't re-propose a known axis. */
export const MODELED_SPEC_IDS: string[] = VARIANT_SPECS.map((spec) => spec.id)

/** Human name of an axis ("shade" → "Shade"), or null if it isn't a selector. */
export function axisLabelFor(axis: string | null | undefined): string | null {
  if (!axis) {
    return null
  }
  return SELECTOR_AXES.get(axis)?.axisLabel ?? null
}

/** Selector label + sort rank for a value on the given axis. */
export function formatVariant(axis: string, value: string): { label: string; rank: number } {
  const config = SELECTOR_AXES.get(axis)
  if (config) {
    return { label: config.label(value), rank: config.rank(value) }
  }
  // Unknown axis (should not happen for AXIS_PRIORITY-derived variants): fall
  // back to a generic "value unit" label.
  return { label: `${value} ${axis}`, rank: scaled(value) }
}
