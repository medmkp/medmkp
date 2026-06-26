import assert from "node:assert/strict";
import test from "node:test";
import { planScanMerge } from "./scanMerge.js";

// A line already in the post-scan drawer, from a bare 1D barcode read (GTIN only,
// no traceability yet).
const pendingBarcodeOnly = {
  id: "line_1",
  canonical_product_id: "mcp_123",
  supplier_product_id: null,
  barcode: "785306841174",
  lot_number: null,
  expiration_date: null,
  production_date: null,
};

// The payload a GS1 Data Matrix / QR of the SAME product produces: same canonical
// identity, plus the lot + expiry it encodes.
const gs1Payload = {
  canonical_product_id: "mcp_123",
  supplier_product_id: null,
  barcode: "010078530684117417260212102640AB",
  lot_number: "2640AB",
  expiration_date: "2026-02-12",
  production_date: null,
};

test("GS1 read after a bare barcode folds lot/expiry onto the pending line", () => {
  const plan = planScanMerge(pendingBarcodeOnly, gs1Payload);
  assert.equal(plan.merge, true);
  assert.deepEqual(plan.patch, { lot_number: "2640AB", expiration_date: "2026-02-12" });
});

test("bare barcode arriving after the GS1 read adds nothing — merge with no patch", () => {
  // Pending line already carries the lot/expiry (the GS1 read landed first); the
  // later 1D scan of the same product must be dropped, not stacked as a duplicate.
  const pendingWithTrace = { ...pendingBarcodeOnly, lot_number: "2640AB", expiration_date: "2026-02-12" };
  const barePayload = { canonical_product_id: "mcp_123", barcode: "785306841174", lot_number: null, expiration_date: null };
  const plan = planScanMerge(pendingWithTrace, barePayload);
  assert.equal(plan.merge, true);
  assert.equal(plan.patch, null);
});

test("two different lots of the same product stay separate (FEFO)", () => {
  const pendingLotA = { ...pendingBarcodeOnly, lot_number: "AAA111", expiration_date: "2026-01-31" };
  const payloadLotB = { canonical_product_id: "mcp_123", lot_number: "BBB222", expiration_date: "2027-01-31" };
  assert.deepEqual(planScanMerge(pendingLotA, payloadLotB), { merge: false });
});

test("a different product is never merged", () => {
  const otherProduct = { ...gs1Payload, canonical_product_id: "mcp_999" };
  assert.deepEqual(planScanMerge(pendingBarcodeOnly, otherProduct), { merge: false });
});

test("supplier-only identity merges on supplier_product_id", () => {
  const pendingSupplier = { id: "l2", canonical_product_id: null, supplier_product_id: "msp_7", lot_number: null, expiration_date: null };
  const payloadSupplier = { canonical_product_id: null, supplier_product_id: "msp_7", lot_number: "L99", expiration_date: null };
  assert.deepEqual(planScanMerge(pendingSupplier, payloadSupplier), { merge: true, patch: { lot_number: "L99" } });
});

test("two unidentified scans never merge (no proof they're one item)", () => {
  const pendingUnknown = { id: "l3", canonical_product_id: null, supplier_product_id: null, barcode: "785306841174", lot_number: null };
  const payloadUnknown = { canonical_product_id: null, supplier_product_id: null, barcode: "010078530684117417260212", lot_number: null };
  assert.deepEqual(planScanMerge(pendingUnknown, payloadUnknown), { merge: false });
});

test("no pending line → no merge", () => {
  assert.deepEqual(planScanMerge(null, gs1Payload), { merge: false });
});

// The real-world case: a package whose GTIN is NOT in our catalog. Both the 1D
// barcode and the 2D GS1 Data Matrix resolve to "needs review" with no product id;
// the GTIN the backend extracted is all they share, and is what links them.
const pendingUnmatched1D = {
  id: "line_u",
  canonical_product_id: null,
  supplier_product_id: null,
  barcode: "816784430225",
  gtin: "816784430225",
  lot_number: null,
  expiration_date: null,
  production_date: null,
};
const unmatched2D = {
  canonical_product_id: null,
  supplier_product_id: null,
  barcode: "(01)00816784430225(11)241212(10)2414012102Z",
  gtin: "816784430225", // canonicalized: GTIN-14 "00816784430225" → core matches the UPC-A
  lot_number: "2414012102Z",
  expiration_date: null,
  production_date: "2024-12-12",
};

test("unmatched item: 1D + 2D merge on GTIN alone (no catalog identity)", () => {
  const plan = planScanMerge(pendingUnmatched1D, unmatched2D);
  assert.equal(plan.merge, true);
  assert.deepEqual(plan.patch, { lot_number: "2414012102Z", production_date: "2024-12-12" });
});

test("unmatched item: bare GTIN after the GS1 read adds nothing", () => {
  const pendingWithTrace = { ...pendingUnmatched1D, lot_number: "2414012102Z", production_date: "2024-12-12" };
  const bare2 = { canonical_product_id: null, gtin: "816784430225", lot_number: null };
  assert.deepEqual(planScanMerge(pendingWithTrace, bare2), { merge: true, patch: null });
});

test("same GTIN but two different lots stay separate (FEFO)", () => {
  const a = { ...pendingUnmatched1D, lot_number: "LOT-A" };
  const b = { gtin: "816784430225", lot_number: "LOT-B" };
  assert.deepEqual(planScanMerge(a, b), { merge: false });
});

test("different GTINs never merge", () => {
  const other = { gtin: "999999999999", lot_number: "X", canonical_product_id: null };
  assert.deepEqual(planScanMerge(pendingUnmatched1D, other), { merge: false });
});
