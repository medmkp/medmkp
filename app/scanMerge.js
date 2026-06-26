// Many packages carry BOTH a 1D barcode (a bare GTIN) and a 2D GS1 code — a Data
// Matrix or QR that encodes the same GTIN plus the lot and expiry. The camera
// reads whichever it locks onto first, then — because the two are different code
// strings — reads the other a beat later (the scanner's per-code suppression only
// mutes the *same* string). Both resolve to the same product, so without this the
// second read stacks a duplicate review line: one with a lot/expiry, one without.
//
// This decides, for a fresh scan against the line still pending in the post-scan
// drawer (the item the buyer is holding), whether the two are the same physical
// item read through its other symbology — and if so, what traceability to fold
// onto the existing line rather than duplicating it.
//
// Returns:
//   { merge: false }              — a different item; add a normal new line.
//   { merge: true, patch: null }  — the same item, nothing new to add; drop the
//                                   scan (the bare GTIN arriving after the GS1 read).
//   { merge: true, patch: {…} }   — the same item; PATCH these fields onto it (the
//                                   GS1 read arriving after the bare GTIN).
//
// Same item = same GTIN (or, lacking one, same catalog identity) AND no lot
// conflict. Two *different* non-blank lots of one product are distinct items and
// stay separate (FEFO) — only a blank side, or an equal lot, counts as the same
// package's other code.
export function planScanMerge(pending, payload) {
  if (!pending || !payload) return { merge: false };

  // Same physical item? The GTIN is the most fundamental signal — a package's 1D
  // barcode and its 2D GS1 code both encode it, so it identifies the item even when
  // it isn't in our catalog (both scans are then "needs review" with no product id,
  // and the GTIN is all they share). Catalog identity — canonical product, else
  // supplier product — covers SKU/HIBC scans that carry no GTIN.
  const sameProduct =
    (!!payload.gtin && payload.gtin === pending.gtin) ||
    (!!payload.canonical_product_id && payload.canonical_product_id === pending.canonical_product_id) ||
    (!!payload.supplier_product_id && payload.supplier_product_id === pending.supplier_product_id);
  if (!sameProduct) return { merge: false };

  // A lot present on both sides that disagrees means two real lots of the same
  // product (e.g. two boxes scanned in a row) — keep them as separate lines.
  const pLot = pending.lot_number || null;
  const nLot = payload.lot_number || null;
  if (pLot && nLot && pLot !== nLot) return { merge: false };

  // Same physical item. Fold in only the traceability fields the pending line is
  // missing — never overwrite one it already has, since a later read can be the
  // worse one (glare, motion blur), and the first GS1 read is what we trust.
  const patch = {};
  if (!pending.lot_number && payload.lot_number) patch.lot_number = payload.lot_number;
  if (!pending.expiration_date && payload.expiration_date) patch.expiration_date = payload.expiration_date;
  if (!pending.production_date && payload.production_date) patch.production_date = payload.production_date;

  return { merge: true, patch: Object.keys(patch).length ? patch : null };
}
