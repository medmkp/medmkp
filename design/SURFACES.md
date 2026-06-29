# Design surfaces — the single source of truth

**Start here for any UI work.** This is the one index that joins, per product surface:
the canonical wireframe (with New-vs-Updated overrides already resolved), the intent
notes, the code that renders it, the current-state baseline, and any drift between the
wireframe and what actually shipped.

Everything is keyed by a stable **slug**. The slug is the join key across the wireframe
image (`design/frames/<slug>.png`), the baseline (`design/baselines/<slug>.png`), the
code file, and issue references. Don't reintroduce numbered frame names.

## How to use it (Claude Code, Codex, humans)

1. **Find the surface row** for what you're building.
2. **`Read` the frame** at `design/frames/<slug>.png` *first* — match its
   layout / density / hierarchy, **not** its raster (the wireframes have placeholder
   text + loose grids). Render it in **our design system**: canonical tokens
   (`DESIGN.md`, live `/styleguide`), shared `app/ui.jsx` / `app/icons.jsx`, CSS modules
   referencing global tokens — **no hardcoded hex**.
3. **Read the Status/Drift note.** Where it says *shipped product diverges*, the shipped
   behavior wins over the frame — do not rebuild a flow we deliberately removed. The
   frame is kept for layout/visual reference only.
4. **Compare before calling it done** — screenshot your view beside the frame and close
   the deltas (layout, spacing, type weight/size, color, radius, density, hierarchy).
   The long-form protocol for autonomous runs is in `scripts/eng-loop/loop-prompt.md`.

## Conventions

- `design/frames/<slug>.png` — canonical frame (override-resolved). Variants of the same
  surface (extra states) are `<slug>--2.png`, `<slug>--3.png`.
- `design/frames/archive/` — superseded frames kept only for provenance.
- `design/frames/concept/` — concept art / illustrations, not buildable surfaces.
- `design/baselines/<slug>.png` — current-state "before" screenshot.
- **Override rule (already applied here):** where a surface existed in both
  `TraceDDS (New)` and `Updated Screen Frames`, the Updated frame is the canonical one;
  the New version (if kept) is in `archive/`.
- `docs/design-targets/*.jpg` are **derived** downscaled copies for lean GitHub issue
  bodies — not a separate source. Regenerate them from `design/frames/` as needed.

## Copy & framing rules (apply to every scanner/reorder surface)

From Sean's framing notes. TraceDDS is **scanner-first product evidence + lightweight
reorder timing**, *not* perpetual inventory:

- Say **"Create intake record" / "Save receiving record,"** never "Add stock."
- Quantity is **"Quantity received" (optional)**, never "Quantity on hand."
- Shelf-audit statuses are **Present · Moved · Not found · Removed**. *Expired* is
  **derived** from the expiry date and shown as an issue banner
  ("Expired — verify removal or replacement"), never a manually selected status.
- Reorder timing is **estimated** from receiving/order history or cadence — show the
  **basis + the math**, never a confidence percentage and never exact counts.
- Don't require invoice upload or per-use logging.

---

## Reorder

| Slug | Frame | Code | Baseline | Status / drift |
|---|---|---|---|---|
| `reorder-list` | `reorder-list.png` | `app/reorder.jsx` | — | shipped |
| `reorder-drawer` | `reorder-drawer.png` | `app/reorder.jsx` → `MatchPanel` | — | shipped |
| `reorder-forecast` | `reorder-forecast.png` | `app/reorder.jsx` | — | shipped — forecast/usage settings tab |
| `reorder-basis` | `reorder-basis.png` | `app/reorder.jsx` (drawer) | — | greenfield — newer take on reorder-timing drawer; show basis + math, no confidence % |
| `receiving-history` | `receiving-history.png` | `app/reorder.jsx` (explainer) | — | greenfield — explainer: repeated receiving scans → cadence |
| `savings` | `savings.png` | `app/reorder.jsx` → `SavingsView` | `savings.png` | partial |

## Needs Attention

| Slug | Frame | Code | Baseline | Status / drift |
|---|---|---|---|---|
| `needs-attention` | `needs-attention.png` | `app/needsattention.jsx` | `needs-attention.png` | partial — Updated frame (compliance-first; compliance outranks reorder). New v1 in `archive/`. |

## Locations & office

| Slug | Frame | Code | Baseline | Status / drift |
|---|---|---|---|---|
| `location-board` | `location-board.png` | `app/locations.jsx` | — | shipped |
| `location-detail` | `location-detail.png` | `app/locations.jsx` | — | shipped |
| `location-edit` | `location-edit.png` | `app/locations.jsx` | — | shipped |
| `lot-detail` | `lot-detail.png` | `app/locations.jsx` (drawer) | — | greenfield — the "source of truth" frame: one record per lot per location (not per package); shows product, lot, last-verified, expiry, lifecycle, evidence, recall/expiry issues |
| `office-layout` | `office-layout.png` | `app/officelayout.jsx` | — | partial |
| `qr-labels` | `qr-labels.png` | `app/qrlabels.jsx` | — | partial |

## Evidence / compliance

| Slug | Frame | Code | Baseline | Status / drift |
|---|---|---|---|---|
| `evidence-library` | `evidence-library.png` | `app/evidence.jsx` | `evidence-library.png` | partial |
| `evidence-detail` | `evidence-detail.png` | `app/evidence.jsx` (drawer) | — | partial |
| `evidence-upload` | `evidence-upload.png` | _greenfield_ | — | greenfield |
| `evidence-match-review` | `evidence-match-review.png` | _greenfield_ | — | greenfield |
| `evidence-redline` | `evidence-redline.png` | `app/evidence.jsx` (`RedlineView`) | — | built (frame-26) — compliance update review: before/after identity, field-level change list (changed/added/removed), section redline, reviewer comment + action footer. FE-first fixture (`REDLINE_MOCK`); actions are honest stubs. Reached via the Evidence Library "newer version" banner → `/app/evidence/redline` |
| `evidence-viewer` | `evidence-viewer.png` | _greenfield_ | — | greenfield — read-only on-site presentation mode (mobile) |
| `compliance-binder` | `compliance-binder.png` | `app/evidence.jsx` (export) | — | partial — Export = `window.print` |
| `scan-report` | `scan-report.png` | _greenfield_ | — | greenfield — supply scan report |

## Mobile scan flow

> **Major drift here.** The shipped scanner is **session-less and single-mode**: every
> scan lands immediately as lot-at-location evidence; receiving-vs-confirmed is inferred
> per scan (backend `capture_type`). Scan sessions and the explicit Receiving/Shelf-Audit
> mode switch were **removed**. Treat these frames as **layout/visual reference**, not the
> interaction model — the shipped no-mode scanner wins.

| Slug | Frame | Code | Baseline | Status / drift |
|---|---|---|---|---|
| `mobile-scanner` | `mobile-scanner.png` | `app/scanmobile.jsx` | — | shipped — full-screen camera scanner |
| `mobile-scan-mode` | `mobile-scan-mode.png` | `app/scanmobile.jsx` | — | **superseded** — Receiving/Shelf split collapsed to one no-mode scanner |
| `mobile-receiving-scan` | `mobile-receiving-scan.png` (+`--2`) | `app/scanmobile.jsx` | — | partial — lot+expiry capture; "Quantity received" optional |
| `mobile-shelf-audit` | `mobile-shelf-audit.png` (+`--2`) | `app/scanmobile.jsx` | — | partial — verify presence; statuses Present/Moved/Not found/Removed |
| `mobile-confirm-match` | `mobile-confirm-match.png` (+`--2`,`--3`) | `app/scanConfirmMatch.jsx` | — | shipped — confirm product match |
| `mobile-shelf-details` | `mobile-shelf-details.png` (+`--2`) | `app/scanmobile.jsx` | — | partial — par_level lives on inventory_item, not the scan line |
| `mobile-scan-success` | `mobile-scan-success.png` | `app/scanmobile.jsx` | — | shipped |
| `mobile-item-added` | `mobile-item-added.png` | `app/scanmobile.jsx` | — | shipped |
| `mobile-scan-start` | `mobile-scan-start.png` | `app/scanmobile.jsx` | — | partial — start/resume scan |
| `mobile-choose-location` | `mobile-choose-location.png` | `app/scanmobile.jsx` | — | **superseded** — separate choose-location screen killed; location is picked in-scanner |
| `mobile-scan-progress` | `mobile-scan-progress.png` | `app/scanmobile.jsx` | — | **superseded** — scan sessions removed (`app/scansessions.jsx` is legacy) |
| `mobile-doc-scan` | `mobile-doc-scan.png` (+`--2`) | _greenfield_ | — | greenfield — mobile compliance-document scan |

## Concept art (not surfaces)

`design/frames/concept/concept-jun21.png`, `concept-jun22.png` — illustrative concepts,
not buildable screens.
