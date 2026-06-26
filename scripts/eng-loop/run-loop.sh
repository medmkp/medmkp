#!/usr/bin/env bash
# Engineering quality loop — one tick.
#
# Usage-gated. Each tick: picks a unit of work (a labeled GitHub issue, else
# autonomous QA/design discovery), spins up an isolated worktree off the latest
# origin/main, and hands a headless Claude run the job of making ONE focused
# improvement and opening a PR with before/after snapshot evidence.
# It NEVER merges — you review and merge.
#
# Usage: run-loop.sh [--dry-run]
#   --dry-run  do everything except the Claude model call (gate + work pick +
#              worktree), then tear down. For wiring/verification.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$here/config.env"
# shellcheck source=/dev/null
[ -f "$SECRETS_FILE" ] && . "$SECRETS_FILE"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

mkdir -p "$LOOP_HOME/logs" "$LOOP_HOME/worktrees"
LOG="$LOOP_HOME/logs/$(date +%Y-%m-%d).log"
log() { printf '%s [run-loop] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG" >&2; }

# --- 1. Single-flight lock --------------------------------------------------
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOOP_HOME/.lock"
  if ! flock -n 9; then
    log "another run holds the lock; exiting."
    exit 0
  fi
else
  log "warning: flock not found — running without overlap protection."
fi

# --- 2. Kill switch ---------------------------------------------------------
if [ -f "$LOOP_HOME/PAUSE" ]; then
  log "PAUSE file present — skipping."
  exit 0
fi

log "=== tick start (dry_run=$DRY_RUN) ==="

# --- 3. Usage gate ----------------------------------------------------------
if ! "$here/usage-gate.sh" 2>>"$LOG"; then
  log "usage gate closed — skipping this tick."
  exit 0
fi

# --- 4. Refresh the loop's own checkout ------------------------------------
if [ ! -d "$REPO_DIR/.git" ]; then
  log "REPO_DIR=$REPO_DIR is not a git checkout (see README setup)."; exit 1
fi
cd "$REPO_DIR" || exit 1
git fetch --quiet origin main || { log "git fetch failed"; exit 1; }
base_sha="$(git rev-parse origin/main)"
log "base origin/main @ ${base_sha:0:8}"

# --- 5. Pick work: labeled issue (OR over labels), else autonomous ----------
issue_num=""; issue_title=""; issue_body=""
IFS=',' read -ra _labels <<< "$LOOP_LABELS"
for l in "${_labels[@]}"; do
  l="$(printf '%s' "$l" | xargs)"   # trim
  [ -n "$l" ] || continue
  picked="$(gh issue list --repo "$LOOP_REPO" --label "$l" --state open \
            --limit 1 --json number,title \
            --jq '.[0] | select(.) | "\(.number)\t\(.title)"' 2>/dev/null || true)"
  if [ -n "$picked" ]; then
    issue_num="${picked%%$'\t'*}"
    issue_title="${picked#*$'\t'}"
    issue_body="$(gh issue view "$issue_num" --repo "$LOOP_REPO" --json body --jq .body 2>/dev/null || true)"
    break
  fi
done

if [ -n "$issue_num" ]; then
  mode="issue #$issue_num"; log "work: issue #$issue_num — $issue_title"
else
  mode="autonomous"; log "work: no labeled issues; autonomous discovery"
fi

# --- 6. Isolated worktree off origin/main ----------------------------------
stamp="$(date +%Y%m%d-%H%M%S)"
branch="eng-loop-${stamp}"          # no slash → clean raw.githubusercontent URLs
wt="$LOOP_HOME/worktrees/$stamp"

cleanup() {
  log "teardown"
  [ -n "${LOOP_PORT:-}" ] && pkill -f "next dev -p ${LOOP_PORT}" 2>/dev/null || true
  cd "$REPO_DIR" 2>/dev/null || true
  git worktree remove --force "$wt" 2>/dev/null || true
  # Drop the LOCAL branch only; a pushed branch (with its PR) stays on the remote.
  git branch -D "$branch" 2>/dev/null || true
}
trap cleanup EXIT

git worktree add -b "$branch" "$wt" "$base_sha" >/dev/null 2>&1 \
  || { log "worktree add failed"; exit 1; }

# Provision per-worktree env (unique free port) + point at the chosen backend.
( cd "$wt" \
   && bash scripts/worktree-init.sh >/dev/null 2>&1 \
   && bash scripts/worktree-db.sh "$BACKEND_TARGET" >/dev/null 2>&1 ) || true
LOOP_PORT="$(sed -n 's/^MEDMKP_PORT=//p' "$wt/.env.local" 2>/dev/null | head -1)"
log "worktree=$wt branch=$branch port=${LOOP_PORT:-?} backend=$BACKEND_TARGET"

if [ "$DRY_RUN" = "1" ]; then
  log "dry-run: would invoke Claude now ($mode). Stopping before the model call."
  exit 0
fi

# --- 7. Hand the job to a headless Claude run ------------------------------
prompt="$(cat "$here/loop-prompt.md")"
prompt+=$'\n\n---\nRUN CONTEXT (injected by run-loop.sh):\n'
prompt+="- Worktree (your cwd): $wt"$'\n'
prompt+="- Dev URL once you start it: http://localhost:${LOOP_PORT:-3000}"$'\n'
prompt+="- Branch (already created & checked out): $branch"$'\n'
prompt+="- Repo: $LOOP_REPO"$'\n'
prompt+="- Evidence raw-URL base: https://raw.githubusercontent.com/$LOOP_REPO/$branch/"$'\n'
if [ -n "$issue_num" ]; then
  prompt+="- Task source: GitHub issue #$issue_num — fix this specific issue."$'\n'
  prompt+="- Issue title: $issue_title"$'\n'
  prompt+="- Issue body:"$'\n'"$issue_body"$'\n'
else
  prompt+="- Task source: AUTONOMOUS — discover the single highest-value QA/design/bug fix."$'\n'
fi

model_args=(); [ -n "${CLAUDE_MODEL:-}" ] && model_args=(--model "$CLAUDE_MODEL")

log "invoking Claude ($mode, timeout=${RUN_TIMEOUT}s)…"
( cd "$wt" && timeout "$RUN_TIMEOUT" "$CLAUDE_BIN" -p "$prompt" \
    --permission-mode bypassPermissions \
    --output-format stream-json --verbose "${model_args[@]}" ) \
  >>"$LOOP_HOME/logs/run-$stamp.jsonl" 2>&1
rc=$?
log "Claude run exit=$rc (transcript: logs/run-$stamp.jsonl)"

# --- 8. Report --------------------------------------------------------------
pr_url="$(cd "$wt" 2>/dev/null && gh pr view --json url --jq .url 2>/dev/null || true)"
if [ -n "$pr_url" ]; then
  log "PR opened: $pr_url"
else
  log "no PR this tick (no actionable improvement, or aborted for lack of evidence)."
fi
log "=== tick end ==="
