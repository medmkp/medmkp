import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// lib.jsx carries JSX elsewhere, so it can't be imported by node directly.
// showPerEa is a pure, dependency-free guard, so we extract its real source
// and evaluate it — the test breaks if the actual guard changes.
const libSource = await readFile(new URL("./lib.jsx", import.meta.url), "utf8");
const fnSource = libSource.match(
  /export function showPerEa\([\s\S]*?\n\}/
)?.[0];
assert.ok(fnSource, "showPerEa source should be present in lib.jsx");
// eslint-disable-next-line no-new-func
const showPerEa = new Function(`${fnSource.replace(/^export /, "")}; return showPerEa;`)();

test("showPerEa hides a null per-unit", () => {
  assert.equal(showPerEa(null, 4.5), false);
});

test("showPerEa hides a zero per-unit (unknown pack qty) so no '$0.000 / ea'", () => {
  // An unknown pack quantity comes back as perEa 0, not null — it must not
  // render as a meaningless "$0.000 / ea".
  assert.equal(showPerEa(0, 4.5), false);
});

test("showPerEa hides a negative per-unit", () => {
  assert.equal(showPerEa(-1, 4.5), false);
});

test("showPerEa hides a per-unit above its pack price (bad pack parse)", () => {
  assert.equal(showPerEa(719.95, 143.99), false);
});

test("showPerEa shows a real per-unit at or below the pack price", () => {
  assert.equal(showPerEa(0.076, 18.9), true);
  assert.equal(showPerEa(4.5, 4.5), true);
});
