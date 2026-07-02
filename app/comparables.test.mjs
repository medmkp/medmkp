import assert from "node:assert/strict";
import test from "node:test";

import { COMPARABLE_CROSS_CATEGORY_SCORE, COMPARABLE_MIN_SCORE, pickComparables } from "./comparables.js";

const offer = { price_cents: 1000, supplier_name: "Acme Dental" };
const candidate = (overrides = {}) => ({
  id: overrides.id || overrides.handle || "cand",
  handle: "cand",
  name: "Candidate",
  category: "Endodontics",
  family_id: null,
  offer_count: 1,
  best_offer: offer,
  match: { kind: "fuzzy", score: 0.7 },
  ...overrides,
});

const base = { handle: "base", category: "Endodontics" };

test("keeps priced same-category candidates above the similarity floor", () => {
  const picked = pickComparables(base, null, [
    candidate({ handle: "a", id: "a" }),
    candidate({ handle: "b", id: "b" }),
  ]);
  assert.deepEqual(picked.map((p) => p.handle), ["a", "b"]);
});

test("drops the current product and its own family", () => {
  const picked = pickComparables(base, "fam-self", [
    candidate({ handle: "base", id: "self" }),
    candidate({ handle: "sibling", id: "sib", family_id: "fam-self" }),
    candidate({ handle: "other", id: "other" }),
  ]);
  assert.deepEqual(picked.map((p) => p.handle), ["other"]);
});

test("drops mid-similarity cross-category lookalikes (Halo gloves vs Halogen bulbs)", () => {
  const midScore = { kind: "fuzzy", score: COMPARABLE_CROSS_CATEGORY_SCORE - 0.01 };
  const picked = pickComparables(base, null, [
    candidate({ handle: "bulb", id: "bulb", category: "Small Equipment", match: midScore }),
    candidate({ handle: "glove", id: "glove", match: midScore }),
  ]);
  assert.deepEqual(picked.map((p) => p.handle), ["glove"]);
});

test("a near-identical name passes even when suppliers filed it elsewhere", () => {
  // Cotton tip applicators live in both "Infection Control" and "Other Dental
  // Supplies"; a strict category guard would empty the section.
  const picked = pickComparables(base, null, [
    candidate({
      handle: "twin",
      id: "twin",
      category: "Other Dental Supplies",
      match: { kind: "fuzzy", score: COMPARABLE_CROSS_CATEGORY_SCORE },
    }),
  ]);
  assert.deepEqual(picked.map((p) => p.handle), ["twin"]);
});

test("keeps candidates without a category rather than guessing wrong", () => {
  const picked = pickComparables(base, null, [candidate({ handle: "nocat", id: "nocat", category: "" })]);
  assert.deepEqual(picked.map((p) => p.handle), ["nocat"]);
});

test("drops unpriced candidates and low-similarity noise", () => {
  const picked = pickComparables(base, null, [
    candidate({ handle: "unpriced", id: "u", offer_count: 0, best_offer: null }),
    candidate({ handle: "noise", id: "n", match: { kind: "fuzzy", score: COMPARABLE_MIN_SCORE - 0.01 } }),
    candidate({ handle: "floor", id: "f", match: { kind: "fuzzy", score: COMPARABLE_MIN_SCORE } }),
  ]);
  assert.deepEqual(picked.map((p) => p.handle), ["floor"]);
});

test("shows at most one variant per alternative family, three total", () => {
  const picked = pickComparables(base, null, [
    candidate({ handle: "a2", id: "1", family_id: "fam-sonicfill" }),
    candidate({ handle: "a3", id: "2", family_id: "fam-sonicfill" }),
    candidate({ handle: "b1", id: "3", family_id: "fam-filtek" }),
    candidate({ handle: "solo", id: "4" }),
    candidate({ handle: "extra", id: "5" }),
  ]);
  assert.deepEqual(picked.map((p) => p.handle), ["a2", "b1", "solo"]);
});
