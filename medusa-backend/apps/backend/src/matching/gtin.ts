// GTIN / UPC barcode normalization for the scanner lookup.
//
// A scanner does not hand back the same width we stored. DC Dental's NetSuite
// `upccode` is 12-digit UPC-A, but a phone (BarcodeDetector API / ZXing) usually
// returns EAN-13 = "0" + UPC-A, and case labels can be GTIN-14 = "00" + UPC-A.
// Leading zeros are pure padding across GTIN-8/12/13/14 — the same number, so a
// scan must match the stored value regardless of the width it arrived in.

// Standard GTIN mod-10 check digit, valid for GTIN-8/12/13/14 (and any 8–14
// digit code, right-aligned). Weights alternate 3,1 starting from the rightmost
// data digit. Catches reader misreads and manual-entry typos before we touch
// the DB.
export function isValidGtin(value: string | number): boolean {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (digits.length < 8 || digits.length > 14) return false
  const body = digits.slice(0, -1)
  const check = Number(digits[digits.length - 1])
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    // Rightmost body digit gets weight 3, then alternate moving left.
    const weight = (body.length - i) % 2 === 1 ? 3 : 1
    sum += Number(body[i]) * weight
  }
  return (10 - (sum % 10)) % 10 === check
}

// Equivalent width-agnostic representations of a scanned code, so an exact-match
// IN lookup against the stored barcode hits whatever width was stored (this
// keeps the partial barcode index usable — no functional/LIKE scan). Returns []
// when the input isn't a plausible GTIN, so callers can short-circuit to "no
// match" without querying.
export function gtinVariants(scanned: string | number): string[] {
  const digits = String(scanned ?? "").replace(/\D/g, "")
  if (!isValidGtin(digits)) return []
  const core = digits.replace(/^0+/, "") || "0" // significant digits, unpadded
  return [...new Set([
    digits,                  // as scanned
    core,                    // zero-stripped
    core.padStart(12, "0"),  // UPC-A  (what DC Dental stored)
    core.padStart(13, "0"),  // EAN-13
    core.padStart(14, "0"),  // GTIN-14
  ])]
}

// The leading-zero-stripped significant digits of a GTIN — its identity across
// the GTIN-8/12/13/14 paddings, so a UPC-A and its "00"-padded GTIN-14 form (the
// same item's 1D barcode vs its GS1 Data Matrix AI 01) compare equal. null when
// the value isn't a valid GTIN (an HIBC code, a SKU, OCR garble), so callers can
// tell "no GTIN here" from a real one.
export function canonicalGtin(value: string | number): string | null {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (!isValidGtin(digits)) return null
  return digits.replace(/^0+/, "") || "0"
}

// A GTIN-14 with a non-zero indicator digit (1–8) is a packaging level — a case
// or inner pack — of a base unit that shares the same 12-digit item reference.
// Derive the base unit's GTIN (indicator 0, check digit recomputed) so a scanned
// case can fall back to the each in the catalog. Returns [] for anything that
// isn't an indicator-1–8 GTIN-14 (indicator 0 is already the base unit; 9 marks a
// variable-measure trade item, not a fixed pack of the same each). This is NOT
// folded into gtinVariants: a case and an each are distinct sellable units, so
// the caller must opt in to the cross-pack-level match and flag it as such.
export function baseUnitGtinVariants(scanned: string | number): string[] {
  const digits = String(scanned ?? "").replace(/\D/g, "")
  if (digits.length !== 14 || !isValidGtin(digits)) return []
  const indicator = digits[0]
  if (indicator === "0" || indicator === "9") return []
  const body = "0" + digits.slice(1, 13) // indicator 0 + shared item reference
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const weight = (body.length - i) % 2 === 1 ? 3 : 1
    sum += Number(body[i]) * weight
  }
  const base = body + String((10 - (sum % 10)) % 10)
  return gtinVariants(base).filter((v) => v !== digits)
}
