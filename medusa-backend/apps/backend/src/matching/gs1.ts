// GS1 element-string parsing for the scanner lookup.
//
// A GS1 barcode (GS1-128 on a carton, GS1 Data Matrix on a unit) carries the
// product GTIN in application identifier (AI) 01, usually followed by lot (10),
// expiry (17), and production date (11). BarcodeDetector / ZXing return the full
// payload, not just the GTIN — and the lot + expiry are data that lives ONLY on
// the physical package, never in our catalog or a practice's purchase history.
// Pulling them out is what lets a scan feed expiry and recall tracking.
//
// We accept the three shapes a reader can hand us for the same data:
//   - raw element string with FNC1 (ASCII 29) separating variable-length fields,
//     optionally prefixed by a symbology identifier (]C1, ]d2, ]Q3, ]e0);
//   - the parenthesised human-readable form, e.g. "(01)…(10)…(17)…";
//   - a GS1 Digital Link URL, e.g. "https://id.gs1.org/01/<gtin>/10/<lot>".

import { gtinVariants } from "./gtin"

export type Gs1Parts = {
  gtin: string | null
  lot?: string
  expiry?: string
  productionDate?: string
}

const FNC1 = "\x1d" // group separator a reader emits between variable-length fields

// AIs whose value is a fixed width by the standard (no FNC1 terminator follows).
// Only the ones a dental package realistically carries are listed; an unlisted
// AI is treated as variable-length and read up to the next FNC1.
const FIXED_AI_LEN: Record<string, number> = {
  "00": 18, "01": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2,
}

// GS1 dates are YYMMDD. Medical-product dates are all 21st century, so the
// century is fixed at 2000. A day of "00" means "no specific day" → the end of
// that month (the correct reading for an expiry). Returns undefined for a
// malformed date rather than fabricating one.
export function yymmddToIso(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined
  const year = 2000 + Number(yymmdd.slice(0, 2))
  const month = Number(yymmdd.slice(2, 4))
  let day = Number(yymmdd.slice(4, 6))
  if (month < 1 || month > 12) return undefined
  if (day === 0) day = new Date(year, month, 0).getDate()
  if (day < 1 || day > 31) return undefined
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function elements(payload: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (payload.includes("(")) {
    for (const m of payload.matchAll(/\((\d{2,4})\)([^(]*)/g)) out[m[1]] = m[2]
    return out
  }
  let i = 0
  while (i < payload.length) {
    if (payload[i] === FNC1) {
      i++
      continue
    }
    const ai = payload.slice(i, i + 2)
    i += 2
    const fixed = FIXED_AI_LEN[ai]
    if (fixed != null) {
      out[ai] = payload.slice(i, i + fixed)
      i += fixed
    } else {
      let end = payload.indexOf(FNC1, i)
      if (end < 0) end = payload.length
      out[ai] = payload.slice(i, end)
      i = end
    }
  }
  return out
}

export function parseGs1(value: string | null | undefined): Gs1Parts {
  if (typeof value !== "string") return { gtin: null }
  const raw = value.trim().replace(/^\][A-Za-z]\d?/, "") // drop a leading symbology identifier

  if (/^https?:\/\//i.test(raw)) {
    const gtinMatch = raw.match(/\/01\/(\d{8,14})(?:\/|\?|#|$)/i)
    const gtin = gtinMatch && gtinVariants(gtinMatch[1].padStart(14, "0")).length
      ? gtinMatch[1].padStart(14, "0")
      : null
    const lotMatch = raw.match(/\/10\/([^/?#]+)/i)
    const expMatch = raw.match(/\/17\/(\d{6})(?:\/|\?|#|$)/i)
    return {
      gtin,
      lot: lotMatch ? decodeURIComponent(lotMatch[1]) : undefined,
      expiry: expMatch ? yymmddToIso(expMatch[1]) : undefined,
    }
  }

  const ai = elements(raw)
  const gtin = ai["01"] && gtinVariants(ai["01"]).length ? ai["01"] : null
  return {
    gtin,
    lot: ai["10"] || undefined,
    expiry: ai["17"] ? yymmddToIso(ai["17"]) : undefined,
    productionDate: ai["11"] ? yymmddToIso(ai["11"]) : undefined,
  }
}
