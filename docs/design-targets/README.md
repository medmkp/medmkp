# design-targets — derived cache (not a source of truth)

The single source of truth for design surfaces is **[`design/SURFACES.md`](../../design/SURFACES.md)**
(canonical frames under `design/frames/`, baselines under `design/baselines/`).

This directory holds only **downscaled JPEG copies** of frames that a specific GitHub
issue embeds, so issue bodies render lean. They are **derived from `design/frames/`** —
regenerate them from there; don't edit them as originals and don't treat them as a
separate vision set.

The `*.jpg` files here are kept in place because already-filed issues (#308–312, …)
link to these exact paths. New issues should reference `design/frames/<slug>.png` and,
optionally, drop a downscaled `docs/design-targets/<slug>.jpg` copy for the body.
