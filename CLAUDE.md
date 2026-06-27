# TraceDDS

## Design target: `design/SURFACES.md` is the source of truth

**Everything in this product is derived from Sean's wireframes**, indexed in one
place: **[`design/SURFACES.md`](design/SURFACES.md)**. It joins, per surface, the
canonical wireframe (New-vs-Updated overrides already resolved), the intent notes,
the code that renders it, the current-state baseline, and any drift between the
wireframe and what shipped. **Start there for any UI work.**

This applies to **every session and every change** — not just the eng-loop. Any
time you build or modify a screen, drawer, panel, or component:

1. **Find the surface row in `design/SURFACES.md`, then `Read` its frame**
   (`design/frames/<slug>.png`) first. Do not design from imagination or from the
   current code alone. Heed the row's Status/Drift note — where it says the shipped
   product diverges, the shipped behavior wins and the frame is visual reference only.
2. **Match the wireframe's layout / density / hierarchy**, rendered in our design
   system — canonical tokens (`DESIGN.md`, live `/styleguide`), shared
   `ui.jsx` / `icons.jsx`, CSS modules referencing global tokens (no hardcoded
   hex). Don't pixel-copy the raster (it has placeholder text + loose grids), and
   don't invent UI the wireframe doesn't show.
3. **Compare your result against the frame before calling it done** — put your
   screenshot beside it and close the deltas (layout, spacing, type
   weight/size, color, radius, density, hierarchy).

The detailed "Visual fidelity" protocol in `scripts/eng-loop/loop-prompt.md` is
the long form of this rule for autonomous runs; the three steps above are the
broadly-applicable version for every session.

### Where the files live
- `design/SURFACES.md` — the index (one row per surface). **Read this first.**
- `design/frames/<slug>.png` — canonical full-res frames (override-resolved);
  `archive/` = superseded, `concept/` = illustrations, `<slug>--2.png` = variants.
- `design/baselines/<slug>.png` — current-state "before" screenshots.
- `docs/design-targets/` — **derived** downscaled JPEGs for lean GitHub issue
  bodies, regenerated from `design/frames/`. Not a separate source.
