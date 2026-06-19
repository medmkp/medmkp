// HIBC (Health Industry Bar Code) parsing for the scanner lookup.
//
// Many dental / medical SKUs carry no GS1 GTIN — they're labeled with an HIBC
// LIC barcode instead (Henry Schein private label, Pulpdent, etc.). The scanner
// hands us the raw HIBC string, which gtinVariants() rejects as a non-GTIN. We
// extract the Product/Catalog Number (PCN) so it can be resolved through the
// same manufacturer-SKU index the SKU scan path already uses: the catalog holds
// no HIBC data, but a manufacturer's PCN *is* its catalog number — e.g. Pulpdent
// "ER24" is stored as a manufacturer_sku on Dental City and Pearson.
//
// HIBC LIC primary data structure:
//   + <LIC:4> <PCN:1-18> <UoM:1 digit> <check char>
// When concatenated with secondary data (lot / expiry) the segments are joined
// by "/" and the primary's check character moves to the end of the whole
// message:
//   + <LIC:4> <PCN> <UoM> / <secondary…> <check char>
//
// We deliberately don't validate the mod-43 check character: the PCN is consumed
// by an exact-match SKU lookup, so a misread simply returns no rows (a safe "no
// match") rather than a wrong product.

export type HibcParts = { lic: string; pcn: string }

export function parseHibc(value: string | null | undefined): HibcParts | null {
  if (typeof value !== "string") return null
  // Drop Code 39 start/stop guards and any human-readable whitespace; the
  // on-wire data carries neither, but a reader may echo them.
  const raw = value.trim().replace(/^\*+|\*+$/g, "").replace(/\s+/g, "")
  if (!raw.startsWith("+")) return null

  const body = raw.slice(1) // strip the HIBC flag character
  if (body.length < 4) return null
  const lic = body.slice(0, 4)
  const rest = body.slice(4)

  const slash = rest.indexOf("/")
  let pcn: string
  if (slash >= 0) {
    // Concatenated: the segment before "/" is PCN + UoM (the check character
    // lives at the tail of the secondary data).
    const primary = rest.slice(0, slash)
    if (primary.length < 2) return null
    pcn = primary.slice(0, -1) // drop the unit-of-measure digit
  } else {
    // Standalone primary: a trailing UoM digit + check character follow the PCN.
    if (rest.length < 3) return null
    pcn = rest.slice(0, -2) // drop UoM + check character
  }

  if (!pcn) return null
  return { lic, pcn }
}
