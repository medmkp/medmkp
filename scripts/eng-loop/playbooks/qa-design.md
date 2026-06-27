### Playbook: QA / design / bug-fixing (UI)

Goal: find the **highest-value, low-risk cohesive** user-facing defect/slice in the
running app and fix it, verified with **before/after screenshots**.

> **Any visual change MUST follow the "Visual fidelity (UI/visual work)" protocol in
> the common rules** — read the target wireframe, use canonical tokens only, run the
> anti-slop checklist, and iterate screenshot-vs-wireframe (do NOT one-shot). That
> protocol is what keeps output faithful instead of cartoonish.

#### 1. Bring up the app
- Your cwd is the worktree. Start the dev server in the background: `npm run dev`
  (it runs on the port in RUN CONTEXT). Wait until it responds.
- Use the gstack **`/browse`** skill (headless Chromium) for navigation + screenshots:
  `$B goto <url>`, `$B screenshot <path>`, `$B snapshot -a -o <path>` (annotated),
  `$B responsive <prefix>` (mobile/tablet/desktop).

#### 2. Find one defect
- **If RUN CONTEXT gives an issue:** reproduce it; that repro is your "before".
  Also follow the common rules' related-issue sweep; if nearby issues hit the same
  route/component and can be verified in the same screenshots, close them in this PR.
- **Else (autonomous):** browse and pick ONE clear defect — visual bug, broken/janky
  interaction, console error, accessibility problem, layout/overflow, or a design
  inconsistency vs `/styleguide`. Start with public surfaces (`/`, `/styleguide`,
  `/scan`, `/login`); for gated `/app/*` see "Accessing gated pages" in the common rules.
- Prefer impact + safety over cleverness. One cohesive same-surface win beats three
  tiny overlapping PRs or three risky unrelated fixes.

#### 3. Capture BEFORE
- `$B screenshot eng-loop-evidence/<stamp>/before.png` (use `snapshot -a` to annotate
  the problem). Capture mobile too if the defect is responsive.

#### 4. Fix it
- Minimal, in-style cohesive change. Do not expand into unrelated surfaces, but do
  include tightly coupled same-component fixes that would otherwise conflict.
- **Visual changes: run the compare loop** — screenshot, place beside the target
  wireframe, fix the deltas, repeat (≥2 passes). Tokens only; anti-slop checklist.

#### 5. Capture AFTER + verify
- Re-render the same view/state, screenshot it the same way (`.../after.png`).
- Confirm the fix works **and** that the surrounding view didn't regress (check the
  browser console for new errors).
- For visual work, include the **target wireframe** alongside before/after and list
  the deltas you closed against it.

#### 6. Open the PR
- Commit the evidence PNGs under `eng-loop-evidence/<stamp>/` **and** the code fix.
- Push, then `gh pr create`. Embed the snapshots:
  `![before](<EVIDENCE_RAW_BASE>eng-loop-evidence/<stamp>/before.png)` and after.
- No evidence → no PR.
