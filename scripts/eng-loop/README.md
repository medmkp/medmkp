# Engineering quality loop

An unattended loop (for the NUC) that continuously improves TraceDDS — **QA/design,
bug-fixing, and catalog data quality** — and **piles up pull requests** (and
data-quality issues). Each PR is **one focused change** with **before/after
verification** (screenshots for UI, a dry-run metrics diff for clustering). It is
**usage-aware**: it prefers **Claude** when >50% of its limit remains, otherwise
falls back to **Codex** when >25% of *its* limit remains, otherwise skips the tick.
**It never merges, and never mutates prod data** — you review and merge.

## How it works

A cron job runs `run-loop.sh` every few hours. Each tick:

1. **flock** so two ticks never overlap; skips if a `PAUSE` file exists.
2. **Usage gate → engine** (`usage-gate.sh`): reads Claude's real numbers from
   `claude -p "/usage"`. If Claude has >50% remaining → run on **Claude**. Else, if
   `CODEX_ENABLED`, read Codex's remaining from its TUI `/status` panel (scraped via
   tmux in `usage-codex.sh`); if >25% → run on **Codex**. Else skip. Fails **closed**.
3. Branches off the latest `origin/main` in an isolated git worktree.
4. **Picks work**: a labeled issue (`eng-loop`/`qa`) if any, else the next
   **playbook category** in rotation (see `CATEGORIES`) — `qa-design`, `clustering`,
   and `ocr`, with `pricing` opt-in. Categories whose prerequisites aren't met
   (e.g. no DB URL, harvester down) are skipped that tick.
5. Hands a **headless Claude run** the common rules (`loop-prompt.md`) plus the
   chosen **playbook** (`playbooks/*.md`): find one defect, capture **before**,
   fix it, capture **after**, and open a PR — or, for a data-quality problem with
   no safe code fix, file one `data-quality` issue.
6. Tears down the worktree and logs the outcome (PR URL or "no PR").

### Why this design

- **No usage API exists (either CLI).** There is no `claude usage` subcommand/JSON
  flag — `claude -p "/usage"` is the only source of the real numbers, so the gate
  parses its output (the headline week/session % are account-wide; the breakdown
  below is local/approximate — the gate reads only the headline). Codex is worse:
  `codex exec` reports only per-invocation tokens, so we read its real 5h/weekly
  "% left" from the interactive `/status` panel, driven inside **tmux**
  (`expect` can't — codex's TUI needs a real terminal). Whichever engine wins runs
  the same prompt+playbook; Codex has your gstack skills + the `$B` browse CLI too.
- **cron, not `/loop`.** `/loop` needs one long-lived interactive session (context
  grows over days, one crash kills it, doesn't survive reboot). A fresh `claude -p`
  per tick is clean-context, crash-isolated, and reboot-safe.
- **Snapshots** use the gstack `/browse` headless-Chromium daemon, committed to the
  PR branch and embedded via `raw.githubusercontent.com` URLs so they render.

## Files

| File | Purpose |
|---|---|
| `run-loop.sh` | One tick: lock → gate → worktree → pick work + category → run Claude → teardown → log |
| `deploy-nuc.sh` | Deploy/update the loop on the NUC from your Mac (`npm run deploy:eng-loop`) |
| `usage-gate.sh` | Pick the engine: Claude if >50% left, else Codex if >25%, else skip |
| `usage-codex.sh` | Read Codex remaining % from its TUI `/status` panel via tmux |
| `loop-prompt.md` | Common rules (PR/issue, evidence, safety, auth) for every run |
| `playbooks/qa-design.md` | UI QA / design / bug-fixing — screenshot evidence |
| `playbooks/clustering.md` | Over/under-clustering fix — dry-run metrics-diff evidence |
| `playbooks/ocr.md` | Lot/expiry label reading — parser-accuracy-diff evidence |
| `playbooks/pricing.md` | Price/vendor coverage vs Net32 (opt-in) — files issues |
| `ocr/check-parser.mjs` | Headless lot/expiry parser-accuracy harness (the OCR "dry-run") |
| `ocr/cases.json` | Ground-truth corpus: raw OCR text → expected lot/expiry (grows over time) |
| `config.env` | Tunables (threshold, window, labels, categories, paths, backend, DB, timeout) |
| `README.md` | This file |

## Deploy from your Mac (no git on the NUC)

`npm run deploy:eng-loop` mirrors `deploy:airflow`: it ssh's to the NUC and
clones-or-syncs a loop-owned checkout, makes the scripts executable, installs deps
if needed, and (with `--cron`) installs the crontab entry — so you never run git on
the NUC.

```sh
npm run deploy:eng-loop                # sync current branch's loop code to the NUC
npm run deploy:eng-loop -- --backend   # + install backend deps (enables clustering)
npm run deploy:eng-loop -- --cron      # + install/refresh the cron schedule
npm run deploy:eng-loop -- --print     # just show what would run on the NUC
```

Env knobs: `NUC_HOST` (default `nuc`), `BRANCH` (default current branch),
`CRON_SCHEDULE` (default `0 */4 * * *`). Re-run it any time to push updated
scripts/playbooks. The cron entry runs via `bash -lc` so it gets your login PATH
(`claude`, `gh`, `node`). The one-time prereqs below (auth, secrets, labels) still
need doing once on the host; the deploy prints a readiness check for them.

## NUC setup (one time)

Prereqs on the NUC host: `git`, `node`/`npx`, `flock` (util-linux), `jq`, and
`tmux` (for the Codex usage check), plus:

1. **Claude Code, installed and authenticated** (interactive login once):
   ```sh
   claude          # complete login, then /quit
   claude -p "/usage"   # sanity check: prints your real usage panel
   ```
1b. **Codex CLI (optional fallback), installed + logged in** with your Codex Pro
   account, and launched once so it finishes any self-update:
   ```sh
   codex login     # then launch `codex` once; in it, run /status to confirm limits
   ```
   The loop reads Codex limits by scraping `/status` in tmux. (Heads-up: verify
   `codex` is authed as your **Pro** account — `/status` shows the account + plan;
   set `CODEX_ENABLED=false` to disable the fallback entirely.)
2. **GitHub CLI, authenticated** with rights to push branches + open PRs:
   ```sh
   gh auth status
   ```
3. **A dedicated checkout for the loop** (kept separate from `/opt/medmkp` so it
   never races Airflow's deploy), with deps installed once so the `clustering`
   playbook's worktrees can symlink them:
   ```sh
   mkdir -p ~/eng-loop
   git clone git@github.com:tracedds/tracedds.git ~/eng-loop/checkout
   cd ~/eng-loop/checkout && npm install
   npm install --prefix medusa-backend/apps/backend   # for products:match dry-run
   ```
4. **Create the labels** in the repo (once):
   ```sh
   gh label create eng-loop --repo tracedds/tracedds \
     --description "Worked by the engineering quality loop" --color 5319e7
   gh label create data-quality --repo tracedds/tracedds \
     --description "Catalog data-quality finding" --color fbca04
   ```
5. **Secrets** (keep out of git) — the read-only prod DB URL is what enables the
   `clustering` playbook; test creds are optional (gated `/app/*` QA):
   ```sh
   cat > ~/.eng-loop.secrets <<'EOF'
   export LOOP_DATABASE_URL='postgres://<readonly-prod-url>'   # enables clustering
   export LOOP_TEST_EMAIL=withloc@local.test                   # optional
   export LOOP_TEST_PASSWORD=...                               # optional
   EOF
   chmod 600 ~/.eng-loop.secrets
   ```
   Without `LOOP_DATABASE_URL` the `clustering` (and `pricing`) categories are
   skipped and the loop runs `qa-design` only.
6. **(Optional) enable the Net32 pricing playbook** once the harvester sidecar is
   up: set `PRICING_ENABLED=true` (and `NET32_HARVESTER_URL` if not the default
   `http://127.0.0.1:8791`) and add `pricing` to `CATEGORIES`. The loop pre-checks
   the harvester each tick and skips pricing if it's unreachable.
7. Make the scripts executable: `chmod +x ~/eng-loop/checkout/scripts/eng-loop/*.sh`

Adjust `config.env` if your paths/labels differ (or export the same vars in cron).

## Verify before trusting cron

Run these from the loop checkout, in order:

```sh
cd ~/eng-loop/checkout/scripts/eng-loop

# 1. Gate reads a real % and returns the right exit code.
./usage-gate.sh; echo "exit=$?"
GATE_THRESHOLD=100 ./usage-gate.sh; echo "forced-skip exit=$? (expect 1)"

# 2. Dry run: gate + work-pick + worktree, NO model call.
./run-loop.sh --dry-run

# 3. One real, watched end-to-end run. Confirm it opens ONE focused PR whose
#    before/after images actually render in the PR body, and inspect the diff.
./run-loop.sh
```

## Schedule it

Cron line (the gate does the real throttling, so a few hours is fine):

```cron
0 */4 * * *  /home/<user>/eng-loop/checkout/scripts/eng-loop/run-loop.sh >> /home/<user>/eng-loop/logs/cron.log 2>&1
```

(Optionally `git -C ~/eng-loop/checkout pull --ff-only` before the run so the loop
scripts/prompt stay current — though it always branches off fresh `origin/main`.)

## Operating it

- **Pause:** `touch ~/eng-loop/PAUSE` (the next tick skips). Resume: remove it.
- **Stop entirely:** remove the crontab line.
- **Logs:** `~/eng-loop/logs/YYYY-MM-DD.log` (human) and `run-<stamp>.jsonl` (full
  transcript per run).
- **Feed it work:** open issues and label them `eng-loop`; they're drained before
  the category rotation, oldest first. The loop removes the label from issues it
  can't complete (with a comment) so it won't retry them forever. Data-quality
  problems it finds but can't safely auto-fix are filed as `data-quality` issues
  (deduped, at most one per tick) — which then feed back into its own queue.
- **Tune:** `config.env` — `GATE_THRESHOLD` (Claude %), `CODEX_ENABLED`/`CODEX_THRESHOLD`
  (fallback), `GATE_WINDOW` (`week`/`session`/`both`), `LOOP_LABELS`, `CATEGORIES`
  (rotation), `BACKEND_TARGET`, `LOOP_DATABASE_URL`, `PRICING_ENABLED`, `RUN_TIMEOUT`,
  `CLAUDE_MODEL`/`CODEX_MODEL`.

## Notes / limitations

- Runs with `--permission-mode bypassPermissions` (required for unattended work).
  Blast radius is contained: output is PRs/issues only, work happens in a throwaway
  worktree off `main`, and nothing is merged automatically.
- **Data quality is read-only.** The `clustering`/`pricing` playbooks only ever run
  the matching **dry-run** (`products:match` with no `--commit`) and read-only SQL.
  The repo's `assertDestructiveDbOperationAllowed` guard also refuses any remote
  `--commit`. A clustering PR is the *code change*; you run the prod commit/refresh
  yourself, as you do today.
- Gate default is `GATE_WINDOW=both` (runs only when both the weekly and 5-hour
  windows have >50% remaining — the conservative choice).
- Evidence PNGs live on the PR branch under `eng-loop-evidence/`; on squash-merge
  they'd land in `main`. If you want `main` pristine, a follow-up is to push
  evidence to an orphan `eng-loop-evidence` branch instead.
- The `/usage` gate is per-account but read on this machine; the headline % is
  authoritative across devices, the contributor breakdown is local-only.
