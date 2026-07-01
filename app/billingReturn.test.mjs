import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// lib.jsx / billing.jsx carry JSX, so they can't be imported by node directly.
// Extract the real, dependency-free helpers from source and evaluate them — the
// tests break if the actual logic changes.
const libSource = await readFile(new URL("./lib.jsx", import.meta.url), "utf8");
const billingSource = await readFile(new URL("./billing.jsx", import.meta.url), "utf8");

function extract(source, name, pattern) {
  const fnSource = source.match(pattern)?.[0];
  assert.ok(fnSource, `${name} source should be present`);
  // eslint-disable-next-line no-new-func
  return new Function(`${fnSource.replace(/^export /, "")}; return ${name};`)();
}

const isEntitled = extract(libSource, "isEntitled", /export function isEntitled\([\s\S]*?\n\}/);
const billingReturnState = extract(libSource, "billingReturnState", /export function billingReturnState\([\s\S]*?\n\}/);
const safeReturnTo = extract(billingSource, "safeReturnTo", /function safeReturnTo\([\s\S]*?\n\}/);

test("isEntitled unlocks only an active subscription", () => {
  assert.equal(isEntitled({ status: "active" }), true);
});

test("isEntitled keeps every non-active status (and a missing sub) locked", () => {
  // Matches the backend entitlement() — trialing is deliberately NOT entitled,
  // so the FE never unlocks a feature the paywall still gates.
  for (const status of ["trialing", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"]) {
    assert.equal(isEntitled({ status }), false, `${status} should not unlock`);
  }
  assert.equal(isEntitled(null), false);
  assert.equal(isEntitled(undefined), false);
  assert.equal(isEntitled({}), false);
});

test("billingReturnState maps only an explicit cancel to canceled", () => {
  assert.equal(billingReturnState("canceled"), "canceled");
  // A successful, missing, or garbled param all land on the reassuring path —
  // never a false "canceled" for someone who just paid.
  assert.equal(billingReturnState("success"), "activating");
  assert.equal(billingReturnState(""), "activating");
  assert.equal(billingReturnState(undefined), "activating");
});

test("safeReturnTo blocks off-app redirects, defaulting to /app", () => {
  assert.equal(safeReturnTo("/app/review"), "/app/review");
  assert.equal(safeReturnTo("/app"), "/app");
  // Anything not clearly an in-app path falls back to /app (no open redirect).
  assert.equal(safeReturnTo("https://evil.example.com"), "/app");
  assert.equal(safeReturnTo("//evil.example.com"), "/app");
  assert.equal(safeReturnTo("/pricing"), "/app");
  assert.equal(safeReturnTo(""), "/app");
  assert.equal(safeReturnTo(undefined), "/app");
});
