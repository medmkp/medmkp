# TraceDDS

## Design target: Sean's wireframes are the source of truth

**Everything in this product is derived from Sean's wireframes.** They are
committed in-repo at `wireframes/`:

- `wireframes/TraceDDS (New)/` — the primary vision set (desktop + mobile).
- `wireframes/Updated Screen Frames/` — newer revisions; when a surface appears
  in both, the Updated frame wins. See `wireframes/Updated Screen Frames/usage.md`
  for framing/intent notes.

This applies to **every session and every change** — not just the eng-loop. Any
time you build or modify a screen, drawer, panel, or component:

1. **Find the wireframe for that surface and `Read` the image first.** Do not
   design from imagination or from the current code alone.
2. **Match the wireframe's layout / density / hierarchy**, rendered in our design
   system — canonical tokens (`DESIGN.md`, live `/styleguide`), shared
   `ui.jsx` / `icons.jsx`, CSS modules referencing global tokens (no hardcoded
   hex). Don't pixel-copy the raster (it has placeholder text + loose grids), and
   don't invent UI the wireframe doesn't show.
3. **Compare your result against the wireframe before calling it done** — put your
   screenshot beside the frame and close the deltas (layout, spacing, type
   weight/size, color, radius, density, hierarchy).

The detailed "Visual fidelity" protocol in `scripts/eng-loop/loop-prompt.md` is
the long form of this rule for autonomous runs; the three steps above are the
broadly-applicable version for every session.

### Where the files live
- `wireframes/` — full-res originals (source of truth; reference these when working).
- `docs/design-targets/` — downscaled JPEGs of frames a specific GitHub issue
  references, kept for lean issue bodies. Add per surface as issues are created;
  these are derived from `wireframes/`, not a separate source.
