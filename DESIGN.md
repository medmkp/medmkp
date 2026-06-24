# TraceDDS Design System

The visual language of TraceDDS, in one place, so any new screen feels like the
same product. This is **inferred from the existing code**, not invented — it
documents what `styles.css`, the screen `*.jsx` files, and the shared components
already do, picks the canonical version where they disagree, and gives you a
checklist for building the next view.

**Live mirror:** [`/styleguide`](app/styleguide.jsx) renders these tokens,
scales, and components as a real page. Open it at `/styleguide` (no login). If
the page and this doc ever disagree, the running code is the truth — fix the doc.

---

## 1. What TraceDDS should feel like

Serious software for a regulated job. A dental practice trusts it as the
system of record for what's on their shelves and whether they'd pass an audit.
The design is **calm, dense, and credible** — closer to a clinical dashboard or
a bank than a consumer marketplace. Savings are the hook, but compliance and
traceability are the spine, so nothing should feel gimmicky.

Concretely that means: white surfaces on a faint blue-white background, one
confident blue for action, real data over decoration, generous use of cards and
pills, and no fake numbers or stock imagery.

---

## 2. Color tokens

Defined once in `:root` at the top of `styles.css`. **Always reference the
token, never the raw hex.** That single rule is what keeps screens in sync.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#f8faff` | App background (faint blue-white) |
| `--surface` | `#ffffff` | Cards, panels, header |
| `--surface-2` | `#f4f7ff` | Insets, hover fills, disabled |
| `--ink` | `#0b1533` | Primary text |
| `--muted` | `#67728a` | Secondary text, captions |
| `--line` | `#e4e9f2` | Borders, dividers |
| `--blue` | `#155dfc` | Primary action, links, focus |
| `--blue-2` | `#eef4ff` | Blue tint, focus ring, "review" pill |
| `--green` | `#0a9861` | Success, savings, in-stock, audit-ready |
| `--gold` | `#d88718` | Warning, in-progress ("ordering") |
| `--red` | `#ef4444` | Danger, destructive, out-of-stock |
| `--shadow` | `0 16px 42px rgba(23,44,92,.08)` | Card elevation |

**Semantic mapping** (use the meaning, not the swatch): green = good / money
saved / compliant; gold = in-progress / needs attention; red = blocked /
destructive; blue = the one action color.

### Known drift — fix on touch

The codebase currently holds three blues, and `--ink` / `--red` have stray
variants. This is the single biggest obstacle to consistent new screens.

| Concept | Canonical | Stray values to retire |
|---|---|---|
| Blue | `var(--blue)` `#155dfc` | `#0f62ff` (in styles.css), `#2f5bd6` / `#2449b3` / `#1f47b8` (module CSS) |
| Ink | `var(--ink)` `#0b1533` | `#081536` (styles.css), `#14202e` / `#2a3a4a` (module CSS) |
| Red | `var(--red)` `#ef4444` | `#d1352b` / `#d23b3b` |
| Muted | `var(--muted)` `#67728a` | `#8a97a6` / `#5b6b7c` / `#6a7889` |

Green (`#0a9861`) is the one color that's consistent everywhere — match that bar.
**Don't add a new shade.** When you edit a file that uses a stray value, repoint
it to the token. New files: tokens only.

---

## 3. Typography

- **Family:** `var(--font-sans)` → `Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` (self-hosted via `next/font`). Base body size **14px**.
- Sizes cluster tightly. Stay on the scale; don't introduce one-off sizes.
- Keep type light. The scale tops out at 600 for titles; 700 is reserved for rare display/stat moments. No 800/900.

| px | Weight | Role |
|---|---|---|
| 30 | 700 | Display / page hero |
| 24 | 600 | Page title (`h1`) |
| 18 | 600 | Section title (`h2`) |
| 15 | 600 | Card title / emphasis |
| 14 | 400 | Body (base) |
| 13 | 400 | Secondary / dense table rows |
| 12 | 500 | Labels, pills, captions |
| 11 | 500 | Micro / eyebrow (uppercase, letterspaced) |

**Weights in use:** 400 (body), 500 (labels / medium), 600 (titles), 700 (display / big stats).
Reserve 700 for numbers you want to land — savings, counts, scores.

---

## 4. Spacing, radius, elevation

- **Spacing scale:** `4 · 6 · 8 · 12 · 16 · 24 · 30` (px) for gaps and padding. Pick from it; don't eyeball a 19.
- **Radius:** `8px` inputs/chips · `10–12px` cards · `14px` panels · **`999px` pills & buttons**. Pills and primary buttons are fully rounded.
- **Elevation:** one shadow, `var(--shadow)`. Cards = `1px var(--line)` border **plus** that shadow. Avoid stacking heavier shadows.

---

## 5. App shell & layout

The authenticated app is one client-rendered shell (`app/page.jsx`) switching on
a `view` string. Structure:

- **Sticky top bar** (`.topbar`), ~80px tall: brand wordmark left, global search center, alerts + account menu right.
- **Left sidebar** (`.sidebar`), `280px` fixed, sticky under the header, `1px` right border, collapsible to a quiet rail.
- **Main content** scrolls beside the sidebar.

Page width: content sections cap around **980px** for readability; full-bleed
tables and boards may go wider. New full pages live inside this shell unless
they are public (landing, pricing, `/scan`, `/styleguide`).

### Routing (how to add a screen)

Routing is manual, in two files — there is no file-based router for app views:

1. `app/lib.jsx` → add the path to `routeByView` and a match arm in `viewFromPath()` returning a `{ view, isLoggedIn }`.
2. `app/page.jsx` → import the screen and add a `view === "yourview" && <YourView />` branch (in the logged-in block, or the `!isLoggedIn` block for public pages).
3. Add a nav entry in the sidebar tabs array if it's a top-level destination.

`/styleguide` is a worked example of a public route added this way.

---

## 6. Styling approach — the one decision that matters

Two patterns coexist:

- **`styles.css`** (monolithic, ~300KB): the older screens (reorder, catalog, procurement, marketing). Class names are screen-scoped (`.crl-…`, `.cat-…`). These mostly use the tokens correctly.
- **CSS Modules** (`scansessions.module.css`, `locations.module.css`, `dashboard.module.css`): the Phase 2 screens. Currently **hardcode hex instead of tokens** — that's the drift above.

**For new screens: use a CSS Module** (`yourscreen.module.css`), and **reference
the global tokens inside it** (`color: var(--ink)`, `background: var(--blue)`).
The tokens are global, so a module can use them — the existing modules just
didn't. `app/styleguide.module.css` is the reference example of a module done
right. Don't add new screen styles to the monolithic `styles.css`.

> Parallel-agent note: if two screens are built at once, each gets its own
> module file. Never append to a shared `styles.css` from parallel work — it
> causes merge conflicts.

---

## 7. Components — reuse before you rebuild

Shared, in `app/ui.jsx` and `app/icons.jsx`. Reach for these first.

| Component | What it is |
|---|---|
| `ListStatusPill` | Reorder-list lifecycle chip: draft → review → ordering → ordered → handed off |
| `QtyStepper` | − / value / + quantity control |
| `UomSelect` | Unit-of-measure dropdown |
| `ProductThumb` | Product image with fallback |
| `MatchSupplier`, `CandidateName`, `CandidateStock`, `CandidateSub` | Supplier + match-candidate rows |
| `BuyingPreferencesCard` | Editable buying-preferences panel |
| `ConfirmModal` | Confirm / destructive dialog (`destructive` prop turns it red) |
| `ScanResultCard`, `ScanHandoffQr` | Barcode scan result + handoff QR |
| `CatalogSupplierAvatar`, `MatchSupplier` | Supplier logo / initials badge |
| `useBarcodeScanner`, `useProductSearch` | Hooks for scanning and product search |
| `Icon`, `BrandMark`, `IconSprite` | One SVG sprite; `<Icon name="icon-…" />` inherits `currentColor` |

**Patterns:**

- **Button** — pill-shaped. Primary = solid `var(--blue)`, white text. Secondary = ghost (`var(--surface)` + `var(--line)` border). Destructive = `var(--red)` text on surface. There is **no shared button class yet**; the canonical recipe is on `/styleguide` and a `.btn`/`.btn--primary` primitive would be a good cleanup.
- **Status pill** — `.list-pill` + a `--variant`; fully rounded, 12px/500, a leading `currentColor` dot. Tints map to semantic color (review=blue, ordering=gold, ordered=green).
- **Card** — surface, `1px var(--line)`, `var(--shadow)`, 10–14px radius. The default container.
- **Input** — `8px` radius, `1px var(--line)`; focus = `var(--blue)` border + `var(--blue-2)` ring.
- **Search bar** — leading `icon-search` in `var(--muted)` + a borderless input in a `var(--surface)` pill (`1px var(--line)`, `10px` radius). Focus lifts the whole pill: `var(--blue)` border + `var(--blue-2)` ring. One bar across Locations, Needs Attention, Evidence.
- **Filter dropdown** — the canonical filter control on dense toolbars (Locations, Needs Attention). **Not** a native `<select>` (its popup can't be styled): a button trigger plus an in-app `<ul role="listbox">` menu that closes on outside-click / Escape. Notched dark label, light value, chevron rotates `180°` on open, selected row tinted `var(--blue-2)` with a stroked `var(--blue)` check. `10px` radius field, `var(--shadow)` menu. Token-built reference on `/styleguide`; the live copies in `locations.module.css` / `needsattention.module.css` still use stray hexes — extracting a shared `FilterSelect` into `ui.jsx` would be a good cleanup.
- **Pagination** — `Showing X to Y of Z` count (`var(--muted)`) on the left, pager on the right: `32px` square buttons, `8px` radius, `1px var(--line)`; current page = solid `var(--blue)` / white, hover = blue border + text, disabled prev/next lose their border and fade. Prev/next are chevron-only. Canonical copies in `needsattention.module.css` / `evidence.module.css` — match them, don't invent a new pager.
- **Icons** — never hand-roll an SVG inline; add it to the sprite in `app/icons.jsx` and reference by name. The **location / room-type family** (`icon-dental-chair` operatory, `icon-cabinet` cabinet, `icon-shield-check` sterilization, `icon-flask` lab, `icon-package` storage, `icon-first-aid` emergency kit) renders in a `52px` tinted circle — the icon color + circle fill are a fixed semantic pair per type (see `/styleguide`). `icon-scan` is the one blue action icon.

---

## 8. Voice & honesty rules

These are product rules that show up as design:

- **No fabricated data.** No fake ratings, fake activity feeds, invented ETAs, or placeholder assignees. If a number isn't real, don't render it (this has been a repeated cleanup — see prior scan-session and PDP work).
- **Stubs are honest.** An unbuilt action shows a toast ("coming soon"), not a fake success.
- **Numbers earn weight.** Big 700-weight figures are for real, defensible values (savings, audit-readiness, counts).
- **Calm density.** Prefer one well-labeled card over three decorative ones. Whitespace from the spacing scale, not filler.

---

## 9. New-screen checklist

1. CSS Module (`yourscreen.module.css`), **tokens only** — no raw hex.
2. Type/spacing/radius from the scales in §3–4.
3. Reuse `ui.jsx` / `icons.jsx` components before building new ones.
4. Buttons, pills, cards, inputs match §7.
5. Wire the route in `lib.jsx` + `page.jsx` (+ sidebar tab if top-level).
6. No fabricated data; unbuilt actions toast honestly.
7. Check it against `/styleguide` before opening the PR.
