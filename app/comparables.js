// Picks the PDP "Comparable products / substitutes" out of name-similarity
// search results (/api/products/search — the same scorer the scanner's
// substitute path uses). The old source was the category listing, which is
// ranked cheapest-first over an entire department, so every product in e.g.
// Endodontics showed the same three cheapest consumables regardless of what
// the buyer was looking at.
//
// Pure helper (no React, no fetch) so it can be unit-tested directly.

// Fuzzy search floors at 0.12 to maximize recall; comparables need precision.
// Below this, an empty section beats an unrelated product.
export const COMPARABLE_MIN_SCORE = 0.3;

// Above this, the names overlap so heavily the candidate is the same kind of
// product even when suppliers filed it under a different category (cotton tip
// applicators live in both "Infection Control" and "Other Dental Supplies").
// Between the two floors, the category must match — that mid band is where
// cross-category lookalikes ("Halo" gloves vs "Halo"gen bulbs) score.
export const COMPARABLE_CROSS_CATEGORY_SCORE = 0.6;

export function pickComparables(base, ownFamilyId, candidates, limit = 3) {
  // Never the current product or its own family — those are variants, not
  // alternatives — and at most one candidate per family for the same reason.
  const seenFamilies = new Set(ownFamilyId ? [ownFamilyId] : []);
  const picked = [];
  for (const entry of candidates || []) {
    if (!entry || entry.handle === base.handle) continue;
    const score = entry.match?.score ?? 0;
    if (score < COMPARABLE_MIN_SCORE) continue;
    // Mid-similarity candidates must share the category; only a near-identical
    // name earns a pass across categories (see COMPARABLE_CROSS_CATEGORY_SCORE).
    if (
      score < COMPARABLE_CROSS_CATEGORY_SCORE &&
      base.category && entry.category && entry.category !== base.category
    ) continue;
    // Only priced candidates — the card promises a price and a supplier.
    if (!entry.best_offer || !(entry.offer_count > 0)) continue;
    const familyKey = entry.family_id || entry.id;
    if (seenFamilies.has(familyKey)) continue;
    seenFamilies.add(familyKey);
    picked.push(entry);
    if (picked.length >= limit) break;
  }
  return picked;
}
