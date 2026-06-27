# TraceDDS Design System

The visual language of TraceDDS, in one place, so any new screen feels like the
same product. It documents what `styles.css`, the screen `*.jsx` files, and the
shared components already do, picks the canonical version where they disagree,
folds in the patterns from the latest desktop + mobile wireframes
(indexed in [`design/SURFACES.md`](design/SURFACES.md)), and gives you a checklist
for building the next view.

**Live mirror:** [`/styleguide`](app/styleguide.jsx) renders these tokens,
scales, and components as a real page. Open it at `/styleguide` (no login). If
the page and this doc ever disagree, the running code is the truth — fix the doc.

**One document, two surfaces.** TraceDDS is one product on two form factors — a
**desktop** back-office app (sidebar shell, dense tables, drawers) and a
**mobile** scanner-first app (full-screen camera, sheets, big tap targets). The
tokens, type scale, color semantics, and voice are shared. Where a rule is
surface-specific it's marked **🖥 Desktop** or **📱 Mobile**; §5 covers the
desktop shell and §16 covers the mobile shell end-to-end.

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
| `--surface` | `#ffffff` | Cards, panels, header, drawers |
| `--surface-2` | `#f4f7ff` | Insets, hover fills, table-header band, disabled |
| `--ink` | `#0b1533` | Primary text |
| `--muted` | `#67728a` | Secondary text, captions, table headers |
| `--line` | `#e4e9f2` | Borders, dividers |
| `--blue` | `#155dfc` | Primary action, links, focus, selected |
| `--blue-2` | `#eef4ff` | Blue tint: focus ring, selected row, info callout, "Preferred"/type chips |
| `--green` | `#0a9861` | Success, savings, in-stock, verified, present, audit-ready |
| `--gold` | `#d88718` | Warning, in-progress, expiring soon, due soon, needs-review |
| `--red` | `#ef4444` | Danger, destructive, out-of-stock, expired, recall, below-par |
| `--shadow` | `0 16px 42px rgba(23,44,92,.08)` | Card elevation |

**Semantic mapping** (use the meaning, not the swatch): blue = the one action
color / neutral-info; green = good / money saved / compliant / verified; gold =
in-progress / needs attention / expiring; red = blocked / destructive / expired
/ overdue. Every status pill, KPI tint, severity tag, and lifecycle state draws
from exactly these four — **don't introduce a fifth hue** for a new state; pick
the closest semantic.

### Tints (KPI chips, pills, callouts)

Status surfaces use a **full-strength foreground on a faint tint of the same
hue**. Build the tint from the token so it tracks the color, instead of pasting
a new hex:

```css
/* canonical tint recipe — used by KPI icon chips, status pills, callouts */
color: var(--green);
background: color-mix(in srgb, var(--green) 12%, var(--surface));
```

Tint strengths that read well on `--surface`: blue **10%**, green **12%**, gold
**15%**, red **10%**. `--blue-2` is the pre-mixed blue tint — use it directly.

### Known drift — fix on touch

The Phase 2/3 module CSS (`locations`, `scansessions`, `dashboard`, `evidence`,
`needsattention`) predates the tokens and **hardcodes hex** — three blues
(`#2f5bd6`, `#0f62ff`), stray inks (`#14202e`, `#2a3a4a`), reds (`#d1352b`,
`#c33124`), and muteds (`#8a97a6`, `#6b7888`). Green is the one color that's
roughly consistent everywhere.

| Concept | Canonical | Stray values to retire |
|---|---|---|
| Blue | `var(--blue)` `#155dfc` | `#0f62ff`, `#2f5bd6`, `#2449b3`, `#1f47b8` |
| Ink | `var(--ink)` `#0b1533` | `#081536`, `#14202e`, `#2a3a4a` |
| Red | `var(--red)` `#ef4444` | `#d1352b`, `#d23b3b`, `#c33124`, `#b3271e` |
| Muted | `var(--muted)` `#67728a` | `#8a97a6`, `#5b6b7c`, `#6a7889`, `#6b7888` |

**Don't add a new shade.** When you edit a file that uses a stray value, repoint
it to the token. New files: tokens only.

---

## 3. Typography

- **Family:** `var(--font-sans)` → `Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` (self-hosted via `next/font`). Base body size **14px**.
- Sizes cluster tightly. Stay on the scale; don't introduce one-off sizes.
- Keep type **light**. The scale tops out at 600 for titles; 700 is reserved for
  numbers you want to land (savings, counts, KPI values, audit scores). No 800/900.

| px | Weight | Role |
|---|---|---|
| 30 | 700 | Display / page hero |
| 24–26 | 600 | Page title (`h1`) |
| 18 | 600 | Section title (`h2`), drawer title |
| 15 | 600 | Card title / drawer hero name / emphasis |
| 14 | 400 | Body (base) |
| 13 | 400 | Secondary, dense table rows, drawer values |
| 12–12.5 | 500 | Labels, captions, key/value keys, KPI labels |
| 11 | 500–600 | Pills, micro / eyebrow (uppercase, letterspaced `0.03–0.08em`) |
| 28 | 600–700 | KPI value / big stat |

**Numbers earn weight.** Tabular figures (`font-variant-numeric: tabular-nums`)
for any column of numbers, counts, prices, or paginators so they don't jitter.

---

## 4. Spacing, radius, elevation

- **Spacing scale:** `4 · 6 · 8 · 12 · 14 · 16 · 18 · 20 · 24 · 30` (px) for gaps and padding. Pick from it; don't eyeball a 19.
- **Radius — the rule that changed:** TraceDDS uses **rounded-rectangle buttons**, not stadium pills. Only true pills are fully round.

  | Radius | Applies to |
  |---|---|
  | `8px` | Inputs, dense action buttons, pager squares, small chips |
  | `10–12px` | **Buttons** (primary/secondary/destructive), small cards, menus, callouts |
  | `14–16px` | Cards, KPI cards, panels, table cards |
  | `999px` | **Pills, status badges, chips, avatars, toggles, dots** — status only |

  > ⚠️ Correction from earlier guidance: buttons are **10–12px rounded
  > rectangles** (`evidence.module.css .btnPrimary` = 11px), **not** 999px
  > pills. Reserve 999px for status pills/badges/chips. The wireframes confirm
  > this across every primary button (Create Reorder Draft, Save & close, Use
  > this basis).

- **📱 Mobile radii** run slightly tighter and chunkier: panel/sheet **16px**, card **10–12px**, thumbnail **8px**, full-width mobile buttons **12–14px**. Go a touch smaller/lighter when unsure.
- **Elevation:** one card shadow, `var(--shadow)`. Cards = `1px var(--line)` border **plus** that shadow. Drawers and menus get a stronger directional shadow (`-8px 0 28px rgba(11,21,51,.16)` for the left-edge drawer, `var(--shadow)` for menus). Don't stack heavier shadows.

---

## 5. App shell & layout — 🖥 Desktop

The authenticated app is one client-rendered shell (`app/page.jsx`) switching on
a `view` string.

- **Sticky top bar** (`.topbar`), ~80px tall: brand wordmark left, an **org/practice switcher** (`Bright Smiles Dental ▾`), global search center, an **alerts bell** (red dot when unread) and an **account chip** right (avatar initials in a blue circle + name + role + chevron).
- **Left sidebar** (`.sidebar`), `280px` fixed, sticky under the header, `1px` right border, collapsible to a quiet rail. Brand mark on top; nav is a vertical list of **icon + label** rows; the **active row** is a `var(--blue-2)` rounded-rectangle fill with `var(--blue)` icon + text; inactive rows are muted icon + ink label. A nav row can carry a **count badge** (e.g. Needs Attention → red `14`). An **account card** pins to the bottom.
- **Main content** scrolls beside the sidebar. Page width: content sections cap around **1320px** for dashboards (`.page { max-width: 1320px }`), narrower (~980px) for reading-heavy views; full-bleed tables and boards may go wider.

**Page header** (top of every view): optional breadcrumb (`Locations / Hygiene
Cabinet`, last crumb blue), `h1` title (24–26/600), a muted one-line subtitle,
and the page's **primary action button** right-aligned on the title row
(`Create Reorder Draft`, `Upload evidence`, `Start mobile scan`). Secondary
header actions (`Export PDF`, `Download CSV`) sit as ghost buttons left of the
primary.

### Routing (how to add a screen)

Routing is manual, in two files — there is no file-based router for app views:

1. `app/lib.jsx` → add the path to `routeByView` and a match arm in `viewFromPath()` returning a `{ view, isLoggedIn }`.
2. `app/page.jsx` → import the screen and add a `view === "yourview" && <YourView />` branch (logged-in block, or `!isLoggedIn` block for public pages).
3. Add a nav entry in the sidebar tabs array if it's a top-level destination.

`/styleguide` is a worked example of a public route added this way.

---

## 6. Styling approach — the one decision that matters

Two patterns coexist:

- **`styles.css`** (monolithic, ~300KB): the older screens (reorder, catalog, procurement, marketing). Class names are screen-scoped (`.crl-…`, `.cat-…`). These mostly use the tokens correctly.
- **CSS Modules** (`evidence.module.css`, `needsattention.module.css`, `locations.module.css`, `scanmobile.module.css`, …): the Phase 2/3 screens. They hold the canonical *structure* for drawers, stat cards, badges, severity tags — but still **hardcode hex instead of tokens** (the drift in §2).

**For new screens: use a CSS Module** (`yourscreen.module.css`), and **reference
the global tokens inside it** (`color: var(--ink)`, `background: var(--blue)`).
`app/styleguide.module.css` is the reference example of a module done right.
Don't add new screen styles to the monolithic `styles.css`.

> Parallel-agent note: if two screens are built at once, each gets its own
> module file. Never append to a shared `styles.css` from parallel work — it
> causes EOF merge conflicts.

---

## 7. Buttons

Rounded-rectangle, not pills. One blue, used sparingly.

| Variant | Recipe | When |
|---|---|---|
| **Primary** | solid `var(--blue)`, white text + white icon, `10–12px` radius, `10px 16–18px` padding, 13–14/600 | The one main action per view/drawer/sheet. |
| **Secondary / ghost** | `var(--surface)` + `1px var(--line)`, **ink** text | Neutral alternates (`Cancel`, `Export PDF`). |
| **Ghost-blue** | `var(--surface)` + `1px var(--line)`, **blue** text + blue icon | The common secondary in drawers/cards (`View price history`, `Edit item`, `Search manually`). |
| **Destructive** | `var(--surface)`, `var(--red)` text, `1px color-mix(red 35%, line)` border | `Confirm removal`, `Delete`. Red text on white, never solid-red fill for in-table actions. |
| **Link / tertiary** | bare blue text + trailing chevron, no border | `View all evidence ›`, `View all suppliers (7)`. |
| **Icon button** | 28–32px square, `8px` radius, muted glyph, hover `var(--surface-2)` | Close `×`, kebab `⋮`, print. |
| **Small / dense** | `6px 10–14px`, 12–13/600, `8px` radius | Row actions in tables (`Verify removal`, `View recall`). |

- Always pair a primary with a **leading icon** when there's a natural one (cart, plus, arrow). Icons inherit `currentColor`; size 15–16px.
- **There is no shared `.btn` primitive yet** — each module re-declares `.btnPrimary` / `.btnOutline`. The canonical recipe lives on `/styleguide`; extracting a `<Button variant>` into `ui.jsx` is a sanctioned cleanup.
- **Footer button layouts** (drawers, sheets) — two canonical arrangements, see §11.

---

## 8. Badges & status pills

The most-used small component. Fully rounded (999px), semantic color, optional
leading dot or icon. Live taxonomy on `/styleguide`.

**Anatomy:** `inline-flex`, `3px 9px` padding, **11–12px / 600**, `999px`
radius, `color-mix` tint background (§2), foreground = the hue at full strength.
Optional 14px leading status icon (`icon-check-circle`, `icon-alert-triangle`)
or a 6px `currentColor` dot.

| Style | Looks like | Used for |
|---|---|---|
| **Solid-tint — green** | `In stock` · `Verified` · `Present` · `Healthy` · `Exact match` | good / compliant / matched |
| **Solid-tint — gold** | `Limited stock` · `Needs review` · `Expiring soon` · `Due soon` · `In progress` · `Partial` | attention / in-progress |
| **Solid-tint — red** | `Out of stock` · `Expired` · `Recall match` · `Missing SDS` · `Critical` | blocked / urgent |
| **Solid-tint — blue** | `Preferred` · `SDS` · `IFU` · type tags · `New location` | neutral label / classification |
| **Outline pill** | green stroke + check: `✓ Present`, `✓ Exact match` | drawer-hero lifecycle/match confirmation |
| **Dot pill** | leading `currentColor` dot (the reorder `ListStatusPill`) | list lifecycle: draft → review → ordering → ordered → handed off |
| **Severity tag** | `sevPill` — same shape, used in Needs Attention rows | red / amber / gold / green by priority |

- **Inline status text** (no pill) — a leading status icon + colored text, used inside table cells and key/value values: `✓ Verified` (green), `◷ Captured` (muted), `Expired` (red). Classes `inlineStatus` + `ink_ok / ink_warn / ink_bad` in `evidence.module.css`.
- **Type badges** (Evidence): the document-type chip (`SDS`, `IFU`, `Lot record`, `Price evidence`, `Expiration proof`, `Service record`) is a blue/gold/slate tinted pill keyed off a `DOC_TYPES` map.
- **Don't** invent a new pill color. Map the new state to one of the four semantics.

---

## 9. KPI cards, metric tiles & charts

The header band of every dashboard (Reorder, Needs Attention, Savings, Evidence,
Location Board, Location Detail, Scan Report). Three flavors + two chart types.

### 9.1 Stat card — the default KPI

A row of **4** (`grid-template-columns: repeat(4,1fr)`, gap 14), collapsing to 2
then 1 on narrow. Each card: `var(--surface)`, `1px var(--line)`, `14px` radius,
`16–18px` padding, `flex` row with `gap:14`.

```
[ tinted icon chip ]  Label (12.5/500 muted)
   46px, 12px radius   512   ← value (28/600–700 ink; green if money)
   semantic hue+tint   Across 5 locations  ← sub (12 muted)
```

- The **icon chip** carries the semantic tint (§2): blue = total/neutral, green = good/savings, gold = attention, red = urgent. `JSX` reference: `StatCard({ icon, label, value, sub, tint })` in `evidence.jsx`.
- Value stays `--ink` **except money**, which goes `--green` (`$1,248.35`). A delta like `+18%` is green.

### 9.2 Severity / alert tile — 🖥 Needs Attention

Compact tiles that rank work. Same card, but **severity-colored**: a tinted
icon + label + big count (700) + caption, with the hue mapping to urgency — red
(`Expired`, `Recall match`), gold (`Missing SDS`, `Stale verification`),
blue/slate (`Reorder due`, secondary). Compliance issues outrank reorder, so red
tiles lead and reorder is visually quieter. (`needsattention.module.css .stat*`,
`.tint_*`.)

### 9.3 Compact metric tile — report headers

A denser strip of **5–6** tiles (Scan Report): icon chip + value + label
**below** the number, tighter padding. Same tints.

### 9.4 Coverage / progress bar

`Label  46/52  ▓▓▓▓▓▓▓░` — a labeled row + count + a thin (6–8px, 999px) track
(`var(--surface-2)`) with a fill colored **green when at/above target, gold when
partial**. Used in "Coverage snapshot", "Data quality", and the location **scan
progress** bar (with a trailing `%`). Keep the track quiet; the fill carries the
meaning.

### 9.5 Donut + legend

A ring gauge (`.ring`, SVG/conic) with a **center total** and a legend list to
the side: `● label … value  41%`. Used for "Savings by opportunity type" and the
forecast "days remaining" ring. Legend dots reuse the semantic palette.

---

## 10. Tables — 🖥 Desktop

The workhorse of the back office (Reorder, Needs Attention, Evidence, Location,
Scan Report).

- **Container:** a `tableCard` (surface, `1px line`, `16px` radius, padding).
- **Header row:** muted (`--muted`), **12px**, on a faint `--surface-2` band; numeric columns right-aligned. Not uppercase.
- **Rows:** separated by `1px var(--line)`; generous height; hover = `--surface-2`.
- **Identity cell** (first column): a small **product thumbnail** (`ProductThumb`, ~36–40px, 8px radius) + a two-line stack — name (13–14 ink) over SKU/MPN (12 muted).
- **Semantic values:** below-par / overdue values render **red** (`2 boxes`, `7 days ago`); healthy/savings render green; everything else ink.
- **Status / evidence / priority cells:** a status pill (§8), or inline status text with a leading check (`Expiry proof attached ✓`), or colored priority text (`High`, `Critical` in red).
- **Action cell** (right): a small ghost-blue button (`View`, `Verify removal`, `Review`) and/or a kebab `⋮` (`icon-more-vertical`); a missing-item row shows a `Request` / `Add details` link.
- **Grouped tables:** Needs Attention and the Scan Report group rows under a **severity sub-header** (`⚠ Expired (8) — Highest priority`, red) with a `View all 8 expired items ›` link; groups are ordered by priority.
- **Pagination:** the canonical pager (§14).

---

## 11. Drawers — 🖥 Desktop

The right-side slide-in is TraceDDS's primary **detail + edit** surface (Product
details, Product/Lot Detail, Reorder Basis, Forecast & Usage, Evidence Detail).
The structural reference is `evidence.module.css .drawer*` +
`evidence.jsx DocumentDrawer`; the richer compliance drawers
(`design/frames/lot-detail.png`, `design/frames/reorder-basis.png`) extend it.

### 11.1 Container & motion

- `drawerRoot`: `position:fixed; inset:0; z-index:60; display:flex; justify-content:flex-end`.
- `drawerBackdrop`: `rgba(11,21,51,.32)` scrim; click to close.
- `drawer`: `width: min(440px, 94vw)` for a **standard** detail drawer; widen to `min(560px, 96vw)` for **compliance / multi-column** drawers (Product/Lot Detail, Reorder Basis, Forecast). Full height, `var(--surface)`, left shadow `-8px 0 28px rgba(11,21,51,.16)`, slide-in `transform: translateX(16px)→0` over `.18s`.
- Dismiss on backdrop click and `Escape`; `role="dialog" aria-modal="true"`.

### 11.2 Anatomy (top → bottom)

1. **Header** (`drawerHead`, `16px 20px`, bottom `1px var(--line)`): title (16–18/600), optional **record-type pill** beside it (`Evidence record`, `Estimate logic`), optional **icon buttons** (print) + a **close `×`** (28–30px, 8px radius). An optional one-line subtitle sits under the title (`One record per lot per location`).
2. **Identity hero** (`fileCard`): a 92px document preview **or** product thumbnail **or** 46px file-type glyph, next to name (15/600) + sku/subtitle (muted) + a **row of status pills** (`✓ Present`, `✓ Exact match`, `SDS`).
3. **Tabs** *(optional)* — an underline tab bar (`Details · Usage & Forecast · Evidence · Activity`); active tab = blue text + blue underline, inactive muted. Use when the record has clearly separate facets.
4. **Body** (`drawerBody`, scroll, `18–20px` padding, `gap:20`) — a stack of **sections** (`drawerSection`), each a small heading + content.
5. **Footer** (`drawerFoot`, sticky, top `1px line`) — see §11.4.

### 11.3 Section building blocks

- **Section heading** (`drawerSection h4`): 12.5/600, muted, optional uppercase letterspaced (`Evidence metadata`, `Review & compliance`, `Recent activity`).
- **Key/value — right-aligned list** (`meta` dl): `dt` muted left, `dd` ink/500 right, hairline `1px` separators. Good for a single column of facts.
- **Key/value — icon grid** (compliance drawers): a 2-column grid where each cell is `icon · label (muted) · value (ink)`; alert values go red. Used for the Product/Lot facts (Lot, Expiration, Capture source, Last verified…).
- **Lifecycle stepper** (Product/Lot): a **horizontal row of states** joined by a dashed connector — `Present → Expiring soon → Expired unresolved → Removed by confirmation`. Each state = an icon-in-circle + title + one-line sub. The **active** state is filled in its semantic color (green/gold/red/slate); the rest are muted/outline. This visualizes lifecycle, it is not a progress bar.
- **Radio-option cards** (Reorder Basis): a selectable list where each option is a card — `◉ radio · icon · title · two muted example lines · optional pill` (`Recommended`, `In use`). The **selected** card gets a `var(--blue)` border + `var(--blue-2)` tint. Used to choose a reorder basis (Receiving history / Order history / Custom cadence / Opened-date).
- **Info callout** (`callout`): `var(--blue-2)` background, `icon-info`, a sentence + optional `View calculation ⌄` link. The honesty rail of a drawer ("This is an evidence record for one lot at one location. It does not represent exact inventory counts.").
- **Highlight callout**: a tinted card with `icon · big colored headline · sub · pill` — the headline carries the state color (gold `Likely reorder in 3 weeks` + `Due soon` pill). Use for the single most important takeaway.
- **Embedded widgets:** the supplier-pricing **radio table** (`◯ supplier · price · stock pill`, "View all suppliers (7)"), the forecast **donut** + **bar chart**, a **document thumbnail**, and **evidence file tiles** (a grid of file-glyph + filename + status pill, "View all evidence (4) ›").
- **Activity timeline** (`timeline`): a vertical list with a connector line, a **colored dot** per entry (blue = system, green = verified/approved, gold = alert), a title (13/500) + muted sub/author + a right-aligned timestamp (11, `--muted`).

### 11.4 Footer layouts

Two canonical arrangements (`drawerFoot`):

- **Stacked (detail drawers):** a full-width **primary** on top (`Add to reorder draft`, `Edit evidence`) + a row of equal-flex **ghost-blue** buttons below (`View price history` · `Edit item`).
- **Action row (edit/compliance drawers):** a single horizontal row — neutral `Cancel` / secondary on the left, **primary** on the right (`Save & close`, `Use this basis`). A **destructive** action (`Confirm removal`) is a red ghost button in this row, set apart on the right edge.

---

## 12. Forms & inputs

- **Field label** above the control (12.5/600 ink), a red `*` for required.
- **Text input / select / textarea:** `var(--surface)`, `1px var(--line)`, `8–10px` radius, `9px 12px` padding, 13px. **Focus:** `var(--blue)` border + `0 0 0 3px var(--blue-2)` ring. Textareas show a **char counter** (`0/200`, muted, bottom-right).
- **Native `<select>`** is fine for in-form dropdowns (a trailing chevron); the toolbar **filter dropdown** is the custom control in §14 (because the OS popup can't be styled).
- **Number + unit:** a number input with a trailing unit suffix inside the field (`10 %`, `3 days`, `7 days`), laid out in a small grid (the forecast usage model uses a 3-col grid of these).
- **Quantity stepper:** `QtyStepper` — `−  value  +`.
- **Checkbox cards:** the "Use for" options (Shelves / Operatories / Storage) are bordered selectable tiles with a checkbox, not bare checkboxes.
- **Date field:** input with a leading `icon-calendar`.
- **File upload:** a `Browse files` ghost button / dropzone; uploaded files render as a file-glyph row.
- **Preview pane:** the Add/Edit Location form pairs the field column with a live **preview card** + an **About** explainer on the right rail — mirror real output rather than describing it.

---

## 13. Cards & right-rail panels

- **Card:** `var(--surface)`, `1px var(--line)`, `var(--shadow)`, `12–16px` radius. The default container.
- **Location card** (Location Board): room-type **icon chip** + name + **status pill** (`In progress` / `Healthy` / `Needs attention` / `Not started`) + a muted room-type line + a **mini stat row** (icon+count: Scanned / Confirmed / Needs attention) + a **scan progress bar** with `%` + footer meta (`Last updated 2 min ago`, assignee avatar) + action buttons (`Resume scan` primary, `Open board` ghost, or `Review issues` red ghost).
- **Right-rail panel:** a titled card stack beside the main column (Issues in this location, Evidence coverage, Recent activity, Recommended next steps, Mobile scan shortcuts). Width ~344px. Shortcut rows are `icon · label · ›`. A **promo card** ("Scan on the go" + QR) can close the rail.
- **Meta chips:** small pill chips with a leading icon used as a context line under a report title (`▣ Bright Smiles Dental`, `📍 Hygiene Cabinet`, `📅 May 16, 2024`, `Scanned by Alex Kim`).

---

## 14. Filters, search & pagination — 🖥 Desktop

- **Search bar** — a leading `icon-search` in `var(--muted)` + a borderless input in a `var(--surface)` pill (`1px var(--line)`, `10px` radius). Focus lifts the whole pill: `var(--blue)` border + `var(--blue-2)` ring. One bar across Locations, Needs Attention, Evidence.
- **Filter dropdown** — the canonical filter on dense toolbars. **Not** a native `<select>`: a button trigger + an in-app `<ul role="listbox">` menu that closes on outside-click / Escape. **Notched dark label** in the top border, light value, chevron rotates `180°` on open; selected row tinted `var(--blue-2)` with a stroked `var(--blue)` check; `10px` field, `var(--shadow)` menu. Token-built reference (`FilterSelect`) on `/styleguide`; the live copies in `locations`/`needsattention` modules still use stray hexes — extracting a shared `FilterSelect` into `ui.jsx` would be a good cleanup.
- **Toolbar layout:** search (flex-grow) → filter dropdowns → a `Filters` button; an optional **segmented tab-chip row** under it for quick views (`Expired (8) · Recall match (3) · …`).
- **Pagination** — `Showing X to Y of Z` (muted) left, pager right: `32px` square buttons, `8px` radius, `1px var(--line)`; current page = solid `var(--blue)` / white; hover = blue border + text; prev/next are chevron-only and fade when disabled. Canonical copies in `needsattention`/`evidence` modules; reference on `/styleguide`.

---

## 15. Icons

- One SVG sprite (`app/icons.jsx`). Use `<Icon name="icon-…" />` — paths inherit `currentColor`. **Never hand-roll an inline SVG**; add it to the sprite and reference by name.
- Inventory includes: nav/action (`icon-home`, `icon-scan`, `icon-cart`, `icon-search`, `icon-bell`, `icon-settings`, `icon-plus`, `icon-edit`, `icon-trash`, `icon-eye`, `icon-link`, `icon-refresh`, `icon-cloud-upload`), status (`icon-check`, `icon-check-circle`, `icon-alert-triangle`, `icon-x-circle`, `icon-info`, `icon-clock`, `icon-calendar`, `icon-shield-check`), files (`icon-file-pdf`, `icon-file-img`, `icon-file-doc`, `icon-file-text`, `icon-folder`), and chevrons (`icon-chevron-down/left/right`).
- **Location / room-type family** renders in a **52px tinted circle** — the icon color + circle fill are a fixed semantic pair per type: `icon-dental-chair` operatory (blue), `icon-cabinet` cabinet (indigo), `icon-shield-check` sterilization (teal), `icon-flask` lab (violet), `icon-package` storage (slate), `icon-first-aid` emergency kit (red). `icon-scan` is the one blue action icon. See `/styleguide`.
- **Gap:** there is no `icon-printer` in the sprite yet — the drawer print affordance (Product/Lot, Reorder Basis) needs one added before it's wired.

---

## 16. Mobile — 📱 Scanner-first app

The mobile surface (`scanmobile.jsx` + `scanmobile.module.css`, ≤900px) is a
**scanner-first** flow, not a shrunk desktop. Big tap targets, full-screen
camera, bottom sheets, one action in view at a time. Tighter, chunkier radii
(§4). Reference frames: the `mobile-*` rows in
[`design/SURFACES.md`](design/SURFACES.md) (e.g. `design/frames/mobile-scanner.png`,
`mobile-receiving-scan.png`, `mobile-shelf-audit.png`). **Note the drift:** the shipped
scanner is session-less and single-mode — see the mobile-scan-flow drift note there.

### 16.1 Shell

- **Top app bar:** centered brand (`BrandMark`, light) on a white bar; when it sits **over the live camera** it goes onto the dark video with white text + sometimes a shield/mode glyph.
- **Page header:** big title (24/700) + a muted one-line subtitle, left-aligned, generous top padding.
- **Bottom action bar:** sticky; a **primary** full-width button (`Save intake record`, `Continue`, `Resume`) with optional **ghost** alternates (`Rescan`, `Search manually`) beside or above it; a quiet footer note ("You can edit this item later.").

### 16.2 Scan-mode model (Receiving vs Shelf Audit)

> **Drift:** the shipped scanner is **session-less and single-mode** — the explicit
> Receiving/Shelf-Audit switch below was removed and capture type is now inferred per
> scan. Keep this section as the visual/copy reference; see the mobile-scan-flow note in
> [`design/SURFACES.md`](design/SURFACES.md) for the shipped interaction model.

The same scanner records two different things — make the mode explicit and never
imply perpetual inventory.

- **Mode-select cards** (`Scan Mode`): two cards — **Receiving** ("Use when a new shipment arrives") and **Shelf Audit** ("Use when verifying items already on the shelf"). Each lists what it **Records:** as a row of blue **pill-chips with checks** (`Lot`, `Expiry`, `Received date`, `Location`, `Optional qty received`). Shelf Audit also shows **status-example** colored pills (`Present` green, `Moved` gold, `Expired` red). A blue info callout explains the split.
- **Segmented mode toggle:** inside the scanner, a 2-segment control `Receiving | 🛡 Shelf Audit`; the selected segment is a solid `var(--blue)` fill, the other is quiet. 999px radius.
- **Copy rules** (see [`design/SURFACES.md`](design/SURFACES.md) § Copy & framing): say **"Create intake record" / "Save receiving record,"** never "Add stock." Quantity is **"Quantity received" (optional)**, never "Quantity on hand." Shelf-audit statuses are **Present · Moved · Not found · Removed** — *Expired* is **derived** from the date, shown as an issue banner ("Expired — verify removal or replacement"), not a manual status.

### 16.3 Full-screen camera

- Edge-to-edge dark video. A **location pill** at the top (`▣ Hygiene Cabinet ▾`) — dark, rounded, chevron to switch location.
- A **scan reticle**: bright corner brackets framing the barcode (blue when locked), with a one-line caption (`Align barcode inside frame`).
- A **bottom sheet** docked at the bottom: rounded-top (16px), a center **drag handle**, the active location, a **`🔍 Search product`** input, and a `+` FAB (blue) for manual add.

### 16.4 Result, capture & success

- **Match card** (Confirm Product Match): a **green `✓ Exact match`** pill, product image, name, brand, key/value (`GTIN / UPC`, pack), a supplier row (`Henry Schein · ✓ In stock` + price), and a `View other offers (8)` link.
- **Captured-field cards** (Receiving Scan): small cards each showing `icon · label · value · ✓` — `Lot (captured) A219 ✓`, `Expiry Apr 2027 ✓`, `Location Hygiene Cabinet`, `Quantity received 160 wipes`. A **green success banner** (`✓ Barcode and label detected — Lot and expiry captured`) sits above.
- **Status buttons** (Shelf Audit): outline action tiles — `icon · label · sub` — `Present` (green), `Moved / Location changed` (gold), `Not found`, `Removed`. Tap = record that status; selected gets a blue border.
- **Item-added sheet** (success): a bottom sheet with the product name, where it was saved, the captured checks (`✓ Expiration captured`, `✓ Lot captured`), and `Next` / `Done` / `View session`.

### 16.5 Sessions & lists

- **Resume / in-progress card:** a `var(--blue-2)` tinted card — an `IN PROGRESS` eyebrow (blue), the location name, a stat row (`✓ 29 Confirmed`, `⚠ 6 Needs details`), meta, and a full-width **`Resume session`** button.
- **List rows** (Choose location, session list): a tappable row — title + muted subtitle, the **current/selected** row tinted `var(--blue-2)` with a blue left border. A footer offers `Recent locations …` and a blue `Manage locations` link.
- **Mobile forms** (Add Shelf Details): stacked labeled inputs, a `📅` date field, a quantity stepper, and **segmented toggles** for simple choices (`Yes / No`, `Good / Damaged`).

---

## 17. Voice & honesty rules

These are product rules that show up as design — they keep TraceDDS credible:

- **No fabricated data.** No fake ratings, fake activity feeds, invented ETAs, or placeholder assignees. If a number isn't real, don't render it.
- **Stubs are honest.** An unbuilt action shows a toast ("coming soon"), not a fake success.
- **Numbers earn weight.** Big 700-weight figures are for real, defensible values (savings, audit-readiness, counts).
- **It's evidence, not perpetual inventory.** Each record is *one lot at one location* — quantity is an estimate, never "quantity on hand." Drawers and callouts say so out loud.
- **No confidence percentages on estimates.** Reorder timing shows the **basis + the math** ("received every 38 days, lead time 5 days → reorder in 2–3 weeks"), not a fabricated `87% confident`.
- **Compliance outranks reorder.** In Needs Attention and reports, expired/recall items are visually higher-priority than reorder-due.
- **Calm density.** Prefer one well-labeled card over three decorative ones. Whitespace from the spacing scale, not filler.

---

## 18. New-screen checklist

1. CSS Module (`yourscreen.module.css`), **tokens only** — no raw hex.
2. Type / spacing / radius from §3–4 (**buttons 10–12px, pills 999px**).
3. Reuse `ui.jsx` / `icons.jsx` before building new ones (table below).
4. Buttons §7, badges §8, KPI cards §9, tables §10, drawers §11, forms §12 — match the canonical recipe.
5. 📱 If it has a mobile surface, follow §16 (scanner-first, sheets, big targets, tighter radii) — don't shrink the desktop.
6. Wire the route in `lib.jsx` + `page.jsx` (+ sidebar tab if top-level).
7. No fabricated data; estimates show basis-not-confidence; unbuilt actions toast honestly (§17).
8. Check it against `/styleguide` before opening the PR.

---

## 19. Component reference — reuse before you rebuild

Shared, in `app/ui.jsx` and `app/icons.jsx`.

| Component | What it is |
|---|---|
| `ListStatusPill` | Reorder-list lifecycle dot-pill: draft → review → ordering → ordered → handed off |
| `QtyStepper` | − / value / + quantity control |
| `UomSelect` | Unit-of-measure dropdown |
| `ProductThumb` | Product image with fallback (table identity cells) |
| `StatCard` *(evidence.jsx)* | KPI stat card (`icon, label, value, sub, tint`) |
| `FilterSelect` *(styleguide.jsx)* | Token-built toolbar filter dropdown (reference; promote to `ui.jsx`) |
| `DocumentDrawer` *(evidence.jsx)* | Right-side detail drawer (header / hero / sections / timeline / footer) |
| `MatchSupplier`, `CandidateName`, `CandidateStock`, `CandidateSub` | Supplier + match-candidate rows |
| `BuyingPreferencesCard` | Editable buying-preferences panel |
| `ConfirmModal` | Confirm / destructive dialog (`destructive` prop turns it red) |
| `ScanResultCard`, `ScanHandoffQr` | Barcode scan result + handoff QR |
| `CatalogSupplierAvatar` | Supplier logo / initials badge |
| `useBarcodeScanner`, `useProductSearch` | Hooks for scanning and product search |
| `Icon`, `BrandMark`, `IconSprite` | One SVG sprite; `<Icon name="icon-…" />` inherits `currentColor` |

**Not-yet-shared but canonical (extract when touched):** the `.drawer*`,
`.stat*`, `.badge*`/`.sevPill`, coverage-bar, and pagination recipes live in the
Phase 2/3 module CSS with stray hexes — promoting any of them into a tokenized
shared component is sanctioned cleanup, not scope creep.
