#!/usr/bin/env bash
# Engineering quality loop — one tick.
#
# Usage-gated. Each tick: picks a unit of work (a labeled GitHub issue, else the
# next autonomous playbook category in rotation — see CATEGORIES), spins up an
# isolated worktree off the latest origin/main, and hands a headless Claude run
# the job of making ONE focused improvement and opening a PR (or a data-quality
# issue) with before/after evidence. It NEVER merges — you review and merge.
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
# Accept DB_URL as an alias for LOOP_DATABASE_URL (evaluated after secrets is sourced).
LOOP_DATABASE_URL="${LOOP_DATABASE_URL:-${DB_URL:-}}"

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

# --- 3. Usage gate → pick engine (claude if >50% left, else codex if >25%) ---
engine="$("$here/usage-gate.sh" 2>>"$LOG")" || true
if [ -z "${engine:-}" ]; then
  log "usage gate closed — skipping this tick."
  exit 0
fi
log "engine: $engine"

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

# --- 6. Choose a playbook category -----------------------------------------
# A labeled issue overrides rotation. Otherwise round-robin CATEGORIES, honoring
# each category's prerequisites (DB url; pricing toggle + harvester reachability).
needs_db=0
if [ -n "$issue_num" ]; then
  category="issue"
else
  IFS=',' read -ra _cats <<< "$CATEGORIES"
  cats=()
  for c in "${_cats[@]}"; do
    c="$(printf '%s' "$c" | xargs)"; [ -n "$c" ] || continue
    [ "$c" = "pricing" ] && [ "${PRICING_ENABLED:-false}" != "true" ] && continue
    cats+=("$c")
  done
  [ "${#cats[@]}" -gt 0 ] || { log "no enabled categories — skipping."; exit 0; }
  last="$(cat "$LOOP_HOME/.rotation" 2>/dev/null || true)"
  next_idx=0
  for i in "${!cats[@]}"; do [ "${cats[$i]}" = "$last" ] && next_idx=$(( (i+1) % ${#cats[@]} )); done
  category=""
  for try in $(seq 0 $(( ${#cats[@]} - 1 ))); do
    cand="${cats[$(( (next_idx + try) % ${#cats[@]} ))]}"
    # A category only runs if it has a playbook (so unknown names in CATEGORIES skip safely).
    [ -f "$here/playbooks/$cand.md" ] || { log "skip $cand: no playbooks/$cand.md"; continue; }
    case "$cand" in
      clustering)
        [ -z "${LOOP_DATABASE_URL:-}" ] && { log "skip clustering: LOOP_DATABASE_URL unset"; continue; } ;;
      pricing)
        [ -z "${LOOP_DATABASE_URL:-}" ] && { log "skip pricing: LOOP_DATABASE_URL unset"; continue; }
        curl -sS -o /dev/null -m 5 "$NET32_HARVESTER_URL" 2>/dev/null \
          || { log "skip pricing: harvester $NET32_HARVESTER_URL unreachable"; continue; } ;;
    esac
    # Backpressure: skip a category already at its open-PR cap.
    open_n="$(gh pr list --repo "$LOOP_REPO" --state open --label "eng-loop:$cand" --json number -q 'length' 2>/dev/null || echo 0)"
    if [ "${open_n:-0}" -ge "${MAX_OPEN_PER_CATEGORY:-2}" ]; then
      log "skip $cand: ${open_n} open PRs (cap ${MAX_OPEN_PER_CATEGORY:-2})"; continue
    fi
    category="$cand"; break
  done
  [ -n "$category" ] || { log "no category's prerequisites met this tick — skipping."; exit 0; }
  echo "$category" > "$LOOP_HOME/.rotation"
fi
case "$category" in clustering|pricing) needs_db=1 ;; esac
# An issue could touch any area — give issue runs backend access when we have a DB URL.
[ "$category" = "issue" ] && [ -n "${LOOP_DATABASE_URL:-}" ] && needs_db=1
log "category: $category"

# --- 7. Isolated worktree off origin/main ----------------------------------
stamp="$(date +%Y%m%d-%H%M%S)"
branch="eng-loop-${category}-${stamp}"   # category in name (readable); no slash → clean raw URLs
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

# Backend categories (clustering/pricing) need installed deps + a read-only DB
# URL. Symlink the base checkout's node_modules (avoids a multi-minute install)
# and pass DATABASE_URL through to the run.
db_env=()
if [ "$needs_db" = "1" ]; then
  for nm in "node_modules" "medusa-backend/apps/backend/node_modules"; do
    [ -d "$REPO_DIR/$nm" ] && [ ! -e "$wt/$nm" ] && ln -s "$REPO_DIR/$nm" "$wt/$nm" 2>/dev/null || true
  done
  db_env=(DATABASE_URL="$LOOP_DATABASE_URL")
  log "backend category: symlinked node_modules; DATABASE_URL set (read-only prod)"
fi

if [ "$DRY_RUN" = "1" ]; then
  log "dry-run: would invoke $engine now (category=$category, $mode). Stopping before the model call."
  exit 0
fi

# --- 7. Hand the job to a headless Claude run ------------------------------
prompt="$(cat "$here/loop-prompt.md")"
prompt+=$'\n\n## THIS RUN\'S PLAYBOOK\n\n'
if [ "$category" = "issue" ]; then
  prompt+="You are fixing a specific GitHub issue (see RUN CONTEXT). Read it, decide which "
  prompt+="playbook applies, and consult scripts/eng-loop/playbooks/ for technique: "
  prompt+="clustering.md (matching/cluster issues), pricing.md (price/vendor), "
  prompt+="qa-design.md (UI/design/bug)."$'\n'
else
  prompt+="$(cat "$here/playbooks/$category.md")"$'\n'
fi
prompt+=$'\n---\nRUN CONTEXT (injected by run-loop.sh):\n'
prompt+="- Category: $category"$'\n'
prompt+="- Worktree (your cwd): $wt"$'\n'
prompt+="- Dev URL once you start it: http://localhost:${LOOP_PORT:-3000}"$'\n'
prompt+="- Branch (already created & checked out): $branch"$'\n'
prompt+="- Repo: $LOOP_REPO"$'\n'
prompt+="- Evidence raw-URL base: https://raw.githubusercontent.com/$LOOP_REPO/$branch/"$'\n'
[ "$needs_db" = "1" ] && prompt+="- DATABASE_URL: set in your env (READ-ONLY prod — never --commit)."$'\n'
if [ -n "$issue_num" ]; then
  prompt+="- Task source: GitHub issue #$issue_num — fix this specific issue."$'\n'
  prompt+="- Issue title: $issue_title"$'\n'
  prompt+="- Issue body:"$'\n'"$issue_body"$'\n'
else
  prompt+="- Task source: AUTONOMOUS — follow the playbook above (category '$category')."$'\n'
fi

log "invoking $engine (category=$category, $mode, timeout=${RUN_TIMEOUT}s)…"
if [ "$engine" = "codex" ]; then
  cmodel=(); [ -n "${CODEX_MODEL:-}" ] && cmodel=(-m "$CODEX_MODEL")
  (
    cd "$wt" || exit 1
    [ "$needs_db" = "1" ] && export DATABASE_URL="$LOOP_DATABASE_URL"
    # codex reads the prompt from stdin; bypass approvals/sandbox for unattended work.
    timeout "$RUN_TIMEOUT" "${CODEX_BIN:-codex}" exec \
      --dangerously-bypass-approvals-and-sandbox "${cmodel[@]}" <<<"$prompt"
  ) >>"$LOOP_HOME/logs/run-$stamp.codex.log" 2>&1
  rc=$?
  log "codex run exit=$rc (transcript: logs/run-$stamp.codex.log)"
else
  model_args=(); [ -n "${CLAUDE_MODEL:-}" ] && model_args=(--model "$CLAUDE_MODEL")
  (
    cd "$wt" || exit 1
    [ "$needs_db" = "1" ] && export DATABASE_URL="$LOOP_DATABASE_URL"
    timeout "$RUN_TIMEOUT" "$CLAUDE_BIN" -p "$prompt" \
      --permission-mode bypassPermissions \
      --output-format stream-json --verbose "${model_args[@]}"
  ) >>"$LOOP_HOME/logs/run-$stamp.jsonl" 2>&1
  rc=$?
  log "claude run exit=$rc (transcript: logs/run-$stamp.jsonl)"
fi

# --- 8. Report + label the PR by category (drives the backpressure count) ----
pr_num="$(cd "$wt" 2>/dev/null && gh pr view --json number -q .number 2>/dev/null || true)"
if [ -n "$pr_num" ]; then
  gh label create "eng-loop:$category" --repo "$LOOP_REPO" --color ededed 2>/dev/null || true
  gh pr edit "$pr_num" --repo "$LOOP_REPO" --add-label "eng-loop:$category" 2>/dev/null || true
  log "PR opened: https://github.com/$LOOP_REPO/pull/$pr_num (eng-loop:$category)"
else
  log "no PR this tick (quiet tick, a data-quality issue may have been filed, or aborted for lack of evidence)."
fi
log "=== tick end ==="
