import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("./catalog.jsx", import.meta.url), "utf8");
const libSource = await readFile(new URL("./lib.jsx", import.meta.url), "utf8");

test("product detail quantity defaults to one", () => {
  const productDetail = pageSource.match(
    /function ProductDetail\([\s\S]*?(?=\nfunction [A-Z]|\nexport default|$)/
  )?.[0];

  assert.ok(productDetail, "ProductDetail source should be present");
  assert.match(productDetail, /const \[qty, setQty\] = useState\(1\);/);
});

test("add-to-list unit is derived from the pack, not a dropdown", () => {
  // The old UomSelect dropdown let the buyer pick an arbitrary unit unrelated to
  // any real offer. The unit is now derived from the selected pack/offer, so no
  // free-choice control and no `uom` state should remain.
  assert.doesNotMatch(pageSource, /UomSelect/, "the UOM dropdown should be gone");
  assert.doesNotMatch(pageSource, /\[uom, setUom\]/, "the uom state should be gone");
  assert.match(pageSource, /const orderUnit =/, "the derived orderUnit should exist");
  // The item + toast carry the derived unit, not the removed select value.
  assert.match(pageSource, /onAddToList\?\.\(product, qty, orderUnit\)/);
  assert.match(pageSource, /Added \$\{qty\} × \$\{orderUnit\}/);
});

// The derivation contract, exercised against the real canonPackUnit from lib.
// Eval the PACK_UNIT_CANON map and the function together so the test breaks if
// the actual container-word normalization changes.
const canonSource = libSource.match(
  /export const PACK_UNIT_CANON =[\s\S]*?export function canonPackUnit\([\s\S]*?\n\}/
)?.[0];
assert.ok(canonSource, "canonPackUnit source should be present in lib.jsx");
// eslint-disable-next-line no-new-func
const canonPackUnit = new Function(
  `${canonSource.replace(/export /g, "")}; return canonPackUnit;`
)();

// Mirror of the component's derivation so the intended behavior is pinned.
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function deriveOrderUnit({ unitOfMeasure, packText }) {
  const token =
    packText && packText !== "—" ? packText.match(/\d+\s*\/\s*([A-Za-z.]+)/)?.[1] : null;
  return cap(unitOfMeasure) || (token ? cap(canonPackUnit(token)) : "Unit");
}

test("derived unit pulls the container word from the pack", () => {
  assert.equal(deriveOrderUnit({ unitOfMeasure: "", packText: "100/Box" }), "Box");
  assert.equal(deriveOrderUnit({ unitOfMeasure: "", packText: "24/Case" }), "Case");
});

test("a real unit_of_measure still wins over the pack", () => {
  assert.equal(deriveOrderUnit({ unitOfMeasure: "each", packText: "100/Box" }), "Each");
});

test("a measured or unknown pack falls back to Unit (matches the spec row)", () => {
  assert.equal(deriveOrderUnit({ unitOfMeasure: "", packText: "100 ml" }), "Unit");
  assert.equal(deriveOrderUnit({ unitOfMeasure: "", packText: "—" }), "Unit");
});
