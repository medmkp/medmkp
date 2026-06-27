### Playbook: functional QA / bug-fixing

Goal: find one real **functional** defect or tightly related same-flow defect set in
the running app — broken interactions, console errors, failed actions, dead links,
or broken flows — and fix it, verified with a **before/after repro + screenshots**.
(Cosmetic-only issues belong to the `design` lane.)

#### 1. Bring up the app
- Your cwd is the worktree. Start the dev server in the background: `npm run dev`
  (it runs on the port in RUN CONTEXT). Wait until it responds.
- Use the gstack `/browse` skill: `$B goto <url>`, `$B click <sel>`, `$B fill <sel> <val>`,
  `$B console --errors`, `$B screenshot <path>`, `$B snapshot -a -o <path>`.

#### 2. Find one functional defect
- **If RUN CONTEXT gives an issue:** reproduce it; that repro is your "before".
  Also follow the common rules' related-issue sweep; if nearby issues hit the same
  route/component and can be verified in the same repro, close them in this PR.
- **Else (autonomous):** exercise real flows and watch for breakage — buttons/links that
  do nothing or 404, forms that won't submit, actions that error, `$B console --errors`
  hits, broken navigation, or error/empty states that shouldn't appear. Start public
  (`/`, `/scan`, `/login`); for gated `/app/*` see "Accessing gated pages" in the common rules.
- Pick the clearest, highest-impact, low-risk cohesive slice. Function over cosmetics.

#### 3. Capture BEFORE
- Reproduce the broken behavior: `$B screenshot eng-loop-evidence/<stamp>/before.png` plus
  the console error / wrong result, and note the exact repro steps.

#### 4. Fix it
- Smallest in-style change that addresses the **root cause**. Do not expand into
  unrelated surfaces, but do include tightly coupled same-component fixes that would
  otherwise conflict.

#### 5. Capture AFTER + verify
- Re-run the same repro: it now works, `$B console --errors` is clean, and the surrounding
  flow didn't regress. Screenshot `.../after.png`.

#### 6. Open the PR
- Commit the evidence PNGs + the fix; push; `gh pr create` embedding before/after via
  `<EVIDENCE_RAW_BASE>` plus the repro steps. No evidence → no PR.
