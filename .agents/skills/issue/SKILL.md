---
name: issue
description: Author a complete, eng-loop-ready GitHub issue from a rough description. Greps the repo to fill in exact files/lines, captures the current-state screenshot, references the right wireframe, writes house-format acceptance criteria + evidence, picks the label, and runs `gh issue create`. Use when the user says "file an issue", "open an issue", "make a gh issue", or "write up <X> as an issue".
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - AskUserQuestion
  - Skill
---

# /issue — frictionless, eng-loop-ready GitHub issues

Turn a rough description into an issue the engineering quality loop (or a human) can
execute perfectly on the first try. A great issue front-loads exactly what the worker would
otherwise have to guess: **where** the code is, **what done looks like**, and **what proof**
the PR must carry. You do that legwork here so the issue is complete before it's filed.

The user's rough description is in `$ARGUMENTS`. If it's empty, ask in one line what the
issue is, then proceed.

## The loop reads these — match them

The issue you write is consumed by `scripts/eng-loop/loop-prompt.md` + a playbook in
`scripts/eng-loop/playbooks/`. Skim the relevant playbook so the issue speaks its language:
`qa-design.md` / `qa.md` / `design.md` (UI), `clustering.md` / `pricing.md` (catalog/price),
`ocr.md` (lot/expiry), `scanner.md` (barcode/GS1/HIBC). Visual targets live in
`docs/design-targets/` (see its README); the design system is `DESIGN.md` + live `/styleguide`.

## Workflow

### 1. Classify (sets the section set + label)
Decide which kind this is — it determines structure and label:

- **Functional bug / behavior** → house format below; label `eng-loop` (add `bug` if it's a
  defect report, `qa` if it's QA-style verification work).
- **Visual / design, target is agreed** (a wireframe exists or you can name the exact target)
  → design format below; labels `design` + `eng-loop`.
- **Visual / design, target NOT agreed** (needs a human design or grouping decision first)
  → label `needs-design`, **do not** add `eng-loop` (the loop can't work it yet). Say so in
  the body and what decision is blocking.
- **Data quality** (clustering / pricing / ocr / scanner) → house format + a concrete
  sample/table; labels `eng-loop` + the category (`eng-loop:clustering`, `eng-loop:ocr`, …).

Label cheatsheet: `eng-loop` = the loop should auto-work it. `design` = visual in nature.
`needs-design` = needs a human decision, not loop-able. `qa` = QA pass. `bug`/`enhancement`
= GitHub triage. Confirm labels exist with `gh label list` if unsure.

### 2. Locate — fill "Where" with real coordinates (the highest-value step)
Grep/Glob the repo for the actual files, symbols, and approximate line numbers. Never make
the reader hunt. Aim for the precision of issue #298:

> `app/icons.jsx`: `icon-scan` (~line 121) … `icon-nav-scan` (~line 327) … `QrScanGlyph` (~line 404)

Name the component/function, the file, the `~line`, and every surface that renders it
(desktop + mobile). If a symbol is shared, say "fixing the symbol fixes all usage sites."

### 3. Capture the current state (screenshot helper)
For any UI/behavior issue, screenshot the affected surface **as it is now** so the Problem /
Current section is accurate and the worker has a baseline:

- Use the `/browse` skill (gstack). Start the dev server if needed (`npm run dev`; worktree
  port from `.env.local` `MEDMKP_PORT`).
- For gated `/app/*` pages: log in with the local test account (`withloc@local.test` /
  `noloc@local.test`, pw `Test1234!`) or forge the `medmkp_session` cookie — see the
  "verify gated pages locally" memory. Capture mobile too if the defect is responsive
  (`$B resize 390 844`).
- Save to `docs/design-targets/current/<surface>-current.png` (create the dir). Read the
  screenshot yourself and write the **Current** section from what you actually see — don't
  describe from memory.

### 4. Wireframe target (visual work only)
If there's an agreed visual target:
- Check `docs/design-targets/` for a committed JPEG for this surface (see its README table).
- If one exists, reference it by path and add "**Read it first**" + the visual-fidelity
  protocol pointer (read wireframe → tokens only → anti-slop checklist → screenshot-vs-
  wireframe compare loop ≥2 passes).
- If none exists but the target is agreed, ask the user for the source image, downscale it,
  and commit it to `docs/design-targets/` (add a row to its README). If the target is **not**
  agreed, this is `needs-design` — don't invent one.

### 5. Clarify — at most 2 questions, only if blocking
Use AskUserQuestion only when an answer changes the issue: ambiguous acceptance, `design`
vs `needs-design`, or which of two surfaces. Otherwise pick the sensible default and note it.

### 6. Draft in house format
Keep it tight, scannable, lean prose. Use the matching template.

**Functional / bug / data-quality:**
```markdown
## Problem
<user-visible symptom, one or two sentences — not a code complaint>

## Where
<file(s) + symbol + ~line; every surface (desktop + mobile)>

## Suggested fix
<the smallest focused change; scope it so the worker doesn't over-reach>

## Acceptance
- <checkable bullet — becomes the loop's done-test>
- <expected app behavior, stated concretely>
- <no regression on …>

## Evidence
<exact proof the PR must carry: before/after screenshots for UI (+ mobile), a metrics
diff for data, command/test output for logic. For data quality, paste the concrete
sample/table here.>

Scoped small: <one line on the blast radius>.
```

**Design / visual (target agreed):**
```markdown
> Optional blocker note (e.g. "Blocked on #NNN until wireframe committed").

**Surface:** <file → component (~Lxxx)>; mobile <component (~Lxxx)>.
**Target wireframe:** `docs/design-targets/<file>.jpg`. **Read it first** and follow the
Visual fidelity protocol (compare loop ≥2 passes; anti-slop checklist).
**Current:** <what's wrong today, from the screenshot you captured>.
**Target:** <the change, matching the wireframe's layout/density/hierarchy in our tokens>.
**Tokens (no hardcoded hex):** <e.g. --ink, --muted, --line, --blue, --surface, one --shadow;
cards 12–16px radius; buttons 10–12px; price figures 700/tabular-nums, labels 600/lean>.

**Acceptance criteria**
- <visually checkable bullet>
- <no regression (unmatched/Review items, mobile)>
- Tokens only; passes the anti-slop checklist.
- **Evidence:** before, after, AND the target wireframe; list the deltas closed vs it.

Scoped small: <e.g. hero only>.
```

### 7. Confirm, then create
Show the full draft + the labels you'll apply. On approval, write the body to a temp file and:
```bash
gh issue create --title "<title>" --body-file <tmp> --label <label> [--label <label>]
```
Title style: lowercase-ish, specific, surface-prefixed — e.g. "Reorder drawer: lead with a
'Best price' hero offer", "Scanner icon: use the four-corner viewfinder, drop the center line".
Report the issue URL. If you captured/committed screenshots or a wireframe, mention the paths.

## Quality bar (self-check before creating)
- **Where** has real files + ~lines, not "somewhere in the scanner code".
- **Acceptance** bullets are checkable — a worker can prove each one true/false.
- **Evidence** names the exact artifact the PR must produce (it becomes the PR's Verification).
- Visual issues reference a committed wireframe **or** are labeled `needs-design`.
- One focused change — if it's really two, file two issues.
- Tokens only for any visual ask; no hardcoded hex in the spec.
