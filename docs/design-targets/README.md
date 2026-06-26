# Wireframes — Sean's product vision (design source of truth)

These are downscaled JPEGs of Sean's target screens, committed so eng-loop issues can
reference an exact visual target (see the "Visual fidelity" protocol in
`scripts/eng-loop/loop-prompt.md`). Match the wireframe's **layout / density / hierarchy**
rendered in **our tokens** (`styles.css` / `DESIGN.md`) — don't pixel-copy the raster (it
has placeholder text + loose grids).

The **full-res originals are committed in-repo at `wireframes/`** (`TraceDDS (New)/` +
`Updated Screen Frames/`) — they are the source of truth for all UI work (see the repo
root `CLAUDE.md`). The downscaled JPEGs in *this* dir are just lean copies of the frames a
specific issue references, for compact issue bodies; add more here per surface as issues
are created.

| File (committed) | Wireframe | Surface | Current view |
|---|---|---|---|
| `reorder-list.jpg` | 1 — Desktop Reorder List | Reorder | `app/reorder.jsx` |
| `reorder-drawer.jpg` | 1.1 — Reorder Product Drawer | Reorder drawer | `reorder.jsx` → `MatchPanel` |
| `reorder-forecast.jpg` | 1.3 — Forecast/Usage Settings Drawer | Reorder drawer (tabs) | `reorder.jsx` |

### Full vision set (originals local-only until referenced)
Reorder (1, 1.1, 1.3) · Needs Attention (2.1) · Mobile scan (3–10) · Locations + Office
(11, 12, 13, 19) · Savings (14) · **Compliance/Evidence (15, 16, 17, 20, 20.1, 21, 22, 23,
24, 26) — biggest gap** · QR labels (18). See the gap analysis (`docs/VISION_GAP.md`, WIP).
