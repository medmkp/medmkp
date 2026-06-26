### Playbook: QA / design / bug-fixing (UI)

Goal: find the **single highest-value, low-risk** user-facing defect in the running
app and fix it, verified with **before/after screenshots**.

#### 1. Bring up the app
- Your cwd is the worktree. Start the dev server in the background: `npm run dev`
  (it runs on the port in RUN CONTEXT). Wait until it responds.
- Use the gstack **`/browse`** skill (headless Chromium) for navigation + screenshots:
  `$B goto <url>`, `$B screenshot <path>`, `$B snapshot -a -o <path>` (annotated),
  `$B responsive <prefix>` (mobile/tablet/desktop).

#### 2. Find one defect
- **If RUN CONTEXT gives an issue:** reproduce it; that repro is your "before".
- **Else (autonomous):** browse and pick ONE clear defect — visual bug, broken/janky
  interaction, console error, accessibility problem, layout/overflow, or a design
  inconsistency vs `/styleguide`. Start with public surfaces (`/`, `/styleguide`,
  `/scan`, `/login`); for gated `/app/*` see "Accessing gated pages" in the common rules.
- Prefer impact + safety over cleverness. One clear win beats three risky ones.

#### 3. Capture BEFORE
- `$B screenshot eng-loop-evidence/<stamp>/before.png` (use `snapshot -a` to annotate
  the problem). Capture mobile too if the defect is responsive.

#### 4. Fix it
- Minimal, in-style change. Don't expand scope.

#### 5. Capture AFTER + verify
- Re-render the same view/state, screenshot it the same way (`.../after.png`).
- Confirm the fix works **and** that the surrounding view didn't regress (check the
  browser console for new errors).

#### 6. Open the PR
- Commit the evidence PNGs under `eng-loop-evidence/<stamp>/` **and** the code fix.
- Push, then `gh pr create`. Embed the snapshots:
  `![before](<EVIDENCE_RAW_BASE>eng-loop-evidence/<stamp>/before.png)` and after.
- No evidence → no PR.
