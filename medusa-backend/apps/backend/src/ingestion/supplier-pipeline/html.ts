// Named HTML entities seen in supplier product names. The numeric decoder below
// covers the long tail (&#8217;, &#xae;, …); this map only needs the common
// named ones. Legitimate symbols (®, ™, ², é) are decoded and KEPT — only the
// broken stuff (literal entities, smart punctuation, replacement chars) gets
// normalized away by normalizeText.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  reg: "®", trade: "™", copy: "©", deg: "°", ordm: "º", ordf: "ª",
  hellip: "…", middot: "·", bull: "•", times: "×", divide: "÷",
  plusmn: "±", micro: "µ", frac12: "½", frac14: "¼", frac34: "¾",
  sup1: "¹", sup2: "²", sup3: "³",
  mdash: "—", ndash: "–", minus: "−",
  lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", bdquo: "„",
  laquo: "«", raquo: "»",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â",
  ccedil: "ç", ntilde: "ñ", ouml: "ö", uuml: "ü", auml: "ä",
  aring: "å", oslash: "ø", szlig: "ß",
}

// Decode numeric (&#233; / &#xe9;) and named (&reg;) HTML entities.
export function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, body: string) => {
      if (body[0] === "#") {
        const code =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10)
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
          try {
            return String.fromCodePoint(code)
          } catch {
            return match
          }
        }
        return match
      }
      const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()]
      return named ?? match
    }
  )
}

// Normalize the "weird characters" that show up in product names while keeping
// legitimate symbols (®, ™, ², accented letters) intact: drop replacement and
// zero-width characters, fold smart punctuation and exotic spaces/hyphens to
// their ASCII forms, then collapse whitespace.
export function normalizeText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\uFFFD/g, "") // replacement char (byte lost to a bad decode)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "") // zero-width + word-joiner + BOM
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'") // smart single quotes / prime
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"') // smart double quotes / double prime
    .replace(/[\u2010\u2011\u2012]/g, "-") // hyphen / non-breaking / figure dash
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ") // exotic spaces
    .replace(/[\u0000-\u001F\u007F]/g, " ") // control characters
    .replace(/\s+/g, " ")
    .trim()
}

export function decodeHtml(value: string) {
  return normalizeText(decodeHtmlEntities(value))
}

// Some suppliers (carolinadental, dentalcity) emit a literal "?" where a
// character was lost to a bad charset decode at scrape time — between words
// ("Nitrile?Gloves"), after a brand where ®/™ stood ("ProNamel?"), or before a
// pack count ("Jackets?10Pk"). The original glyph is unrecoverable, so fold each
// to a space (which reads correctly in every observed case) and tidy the spacing
// the substitution leaves behind. Scoped to product names only — descriptions
// can legitimately contain "?".
function repairLostSymbols(value: string) {
  // No mojibake marker — leave the name untouched (avoids touching legitimate
  // spacing like " .04 Taper" or " .35gm" that has nothing to do with a "?").
  if (!value.includes("?")) {
    return value
  }
  return value
    .replace(/\?/g, " ")
    .replace(/\s+,/g, ",") // drop the space a "?" left before a comma ("6 ," → "6,")
    .replace(/\s{2,}/g, " ")
    .trim()
}

// Some suppliers append a product's variation options as a trailing
// " - opt / opt / opt" (e.g. WooCommerce variation labels), duplicating the
// size/color/pack already stated in the title:
//   "HSB - Nitrile Gloves, Blue, X-Large 100/Bx - Blue / X-Large / 100/Bx"
// Strip that suffix only when it has ≥2 slash-separated options and EVERY option
// already appears earlier in the name, so we never drop information that is only
// stated in the suffix (e.g. " - Each", or an option not echoed in the title).
function stripRedundantVariantSuffix(value: string) {
  const sep = value.lastIndexOf(" - ")
  if (sep < 0) {
    return value
  }
  const head = value.slice(0, sep).trim()
  const options = value
    .slice(sep + 3)
    .split(" / ")
    .map((part) => part.trim())
    .filter(Boolean)
  if (options.length < 2) {
    return value
  }
  const headLower = head.toLowerCase()
  const allRedundant = options.every((option) =>
    headLower.includes(option.toLowerCase())
  )
  return allRedundant ? head : value
}

// Canonical product-name cleaner, applied at the supplier-catalog persistence
// boundary so every ingestion path (all pipeline adapters, CSV, marketplace,
// Henry Schein) lands a cleaned name regardless of how its adapter extracted it.
// Idempotent: re-running on an already-clean name is a no-op.
export function cleanProductName(value: string) {
  return stripRedundantVariantSuffix(repairLostSymbols(decodeHtml(value)))
}

export function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
}

export function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    const value = match?.[1]?.trim()

    if (value) {
      return decodeHtml(value)
    }
  }

  return ""
}

export function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
        "i"
      ),
    ]
    const value = firstMatch(html, patterns)

    if (value) {
      return value
    }
  }

  return ""
}

export function jsonLdBlocks(html: string) {
  return [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ]
    .map((match) => stripTags(match[1]))
    .map((json) => {
      try {
        return JSON.parse(json)
      } catch {
        return undefined
      }
    })
    .filter(Boolean)
}

export function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd)
  }

  if (typeof value !== "object") {
    return []
  }

  const record = value as Record<string, unknown>
  return [record, ...flattenJsonLd(record["@graph"])]
}

export function stringValue(value: unknown) {
  if (typeof value === "string") {
    return decodeHtml(value)
  }

  if (typeof value === "number") {
    return String(value)
  }

  return ""
}

function absoluteUrl(value: string, baseUrl: string) {
  if (!value.trim()) {
    return ""
  }

  try {
    return new URL(value, baseUrl).href
  } catch {
    return ""
  }
}

function imageValueUrls(value: unknown): string[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(imageValueUrls)
  }

  if (typeof value === "string" || typeof value === "number") {
    return [stringValue(value)]
  }

  if (typeof value !== "object") {
    return []
  }

  const record = value as Record<string, unknown>
  return [
    record.url,
    record.contentUrl,
    record.thumbnailUrl,
    record.src,
  ].flatMap(imageValueUrls)
}

export function uniqueImageUrls(urls: string[], baseUrl: string) {
  return [
    ...new Set(
      urls
        .map((url) => absoluteUrl(url, baseUrl))
        .filter((url) => /^https?:\/\//i.test(url))
    ),
  ]
}

export function productImageUrls(
  html: string,
  baseUrl: string,
  product?: Record<string, unknown>
) {
  const jsonLdProduct = product ?? productJsonLd(html)
  const itempropImages = [
    ...html.matchAll(
      /<(?:meta|link|img)\b[^>]+\bitemprop=["']image["'][^>]*(?:content|href|src)=["']([^"']+)["'][^>]*>/gi
    ),
    ...html.matchAll(
      /<(?:meta|link|img)\b[^>]+(?:content|href|src)=["']([^"']+)["'][^>]*\bitemprop=["']image["'][^>]*>/gi
    ),
  ].map((match) => decodeHtml(match[1]))

  return uniqueImageUrls(
    [
      ...imageValueUrls(jsonLdProduct?.image),
      ...imageValueUrls(jsonLdProduct?.thumbnailUrl),
      metaContent(html, ["og:image", "og:image:secure_url", "twitter:image"]),
      ...itempropImages,
    ],
    baseUrl
  )
}

export function productJsonLd(html: string) {
  return jsonLdBlocks(html)
    .flatMap(flattenJsonLd)
    .find((record) => {
      const type = record["@type"]

      return Array.isArray(type)
        ? type.some((entry) => String(entry).toLowerCase() === "product")
        : String(type).toLowerCase() === "product"
    })
}

export function nestedString(
  record: Record<string, unknown> | undefined,
  path: string[]
) {
  let current: unknown = record

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return ""
    }

    current = (current as Record<string, unknown>)[key]
  }

  return stringValue(current)
}
