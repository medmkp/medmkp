# Engineering quality loop

An unattended loop (for the NUC) that continuously improves TraceDDS — QA, design,
and bug-fixing — and **piles up pull requests**. Each PR is **one focused change**
with **before/after snapshot verification**. It is **usage-aware**: it only runs
when more than 50% of your Claude Code limit remains. **It never merges** — you
review and merge.

## How it works

A cron job runs `run-loop.sh` every few hours. Each tick:

1. **flock** so two ticks never overlap; skips if a `PAUSE` file exists.
2. **Usage gate** (`usage-gate.sh`): reads the *real* numbers from
   `claude -p "/usage"` and proceeds only if remaining budget > threshold.
   Fails **closed** (skips) if it can't read usage.
3. Branches off the latest `origin/main` in an isolated git worktree.
4. **Picks work**: the oldest open issue labeled `eng-loop`/`qa`, else autonomous
   discovery.
5. Hands a **headless Claude run** (`loop-prompt.md`) the job: bring up the app,
   find/repro one defect, capture **before**, fix it, capture **after**, and open
   a PR embedding the evidence.
6. Tears down the worktree and logs the outcome (PR URL or "no PR").

### Why this design

- **No usage API exists.** There is no `claude usage` subcommand and no JSON flag
  for account limits. `claude -p "/usage"` is the only source of the real numbers,
  so the gate parses its output. The headline session/week percentages are your
  account-wide limit state (server-provided); the "what's contributing" breakdown
  below them is local/approximate — the gate reads only the headline.
- **cron, not `/loop`.** `/loop` needs one long-lived interactive session (context
  grows over days, one crash kills it, doesn't survive reboot). A fresh `claude -p`
  per tick is clean-context, crash-isolated, and reboot-safe.
- **Snapshots** use the gstack `/browse` headless-Chromium daemon, committed to the
  PR branch and embedded via `raw.githubusercontent.com` URLs so they render.

## Files

| File | Purpose |
|---|---|
| `run-loop.sh` | One tick: lock → gate → worktree → pick work → run Claude → teardown → log |
| `usage-gate.sh` | Read `/usage`, parse %, threshold check, fail-closed |
| `loop-prompt.md` | The engineering procedure handed to the headless run |
| `config.env` | Tunables (threshold, window, labels, paths, backend, timeout) |
| `README.md` | This file |

## NUC setup (one time)

Prereqs on the NUC host: `git`, `node`/`npx`, `flock` (util-linux), `jq`, plus:

1. **Claude Code, installed and authenticated** (interactive login once):
   ```sh
   claude          # complete login, then /quit
   claude -p "/usage"   # sanity check: prints your real usage panel
   ```
2. **GitHub CLI, authenticated** with rights to push branches + open PRs:
   ```sh
   gh auth status
   ```
3. **A dedicated checkout for the loop** (kept separate from `/opt/medmkp` so it
   never races Airflow's deploy):
   ```sh
   mkdir -p ~/eng-loop
   git clone git@github.com:tracedds/tracedds.git ~/eng-loop/checkout
   ```
4. **Create the label** in the repo (once):
   ```sh
   gh label create eng-loop --repo tracedds/tracedds \
     --description "Worked by the engineering quality loop" --color 5319e7
   ```
5. **(Optional) test creds** for gated `/app/*` pages — keep out of git:
   ```sh
   cat > ~/.eng-loop.secrets <<'EOF'
   export LOOP_TEST_EMAIL=withloc@local.test
   export LOOP_TEST_PASSWORD=...
   EOF
   chmod 600 ~/.eng-loop.secrets
   ```
6. Make the scripts executable: `chmod +x ~/eng-loop/checkout/scripts/eng-loop/*.sh`

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
  autonomous discovery, oldest first. The loop removes the label from issues it
  can't complete (with a comment) so it won't retry them forever.
- **Tune:** `config.env` — `GATE_THRESHOLD`, `GATE_WINDOW` (`week`/`session`/`both`),
  `LOOP_LABELS`, `BACKEND_TARGET`, `RUN_TIMEOUT`, `CLAUDE_MODEL`.

## Notes / limitations

- Runs with `--permission-mode bypassPermissions` (required for unattended work).
  Blast radius is contained: output is PRs only, work happens in a throwaway
  worktree off `main`, and nothing is merged automatically.
- Evidence PNGs live on the PR branch under `eng-loop-evidence/`; on squash-merge
  they'd land in `main`. If you want `main` pristine, a follow-up is to push
  evidence to an orphan `eng-loop-evidence` branch instead.
- The `/usage` gate is per-account but read on this machine; the headline % is
  authoritative across devices, the contributor breakdown is local-only.
