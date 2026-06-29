#!/usr/bin/env bash
# Engineering quality loop — one tick.
#
# Usage-gated. Each tick, in priority order:
#   1. REVISE an open loop PR that has an unaddressed "Request changes" review
#      (check out its branch, apply the feedback, push — never a new PR).
#   2. RECONCILE an open loop PR that conflicts with main (merge main in, resolve,
#      re-verify, push — never a new PR, never merge).
#   3. Else work a labeled GitHub issue (eng-loop/qa).
#   4. Else the next autonomous playbook category in rotation (AUTONOMOUS_CATEGORIES).
# Spins up an isolated worktree, hands a headless Claude/Codex run the job, and
# opens/updates exactly one PR (or a data-quality issue). It NEVER merges.
#
# Usage: run-loop.sh [--dry-run]
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
tick_start="$(date +%s)"   # for health.jsonl duration_s

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

needs_db=0

# --- 5. REVISE mode: an open loop PR with unaddressed "Request changes" ------
# Takes priority over new work — clear in-review feedback before opening more PRs.
# A PR needs revision when its latest CHANGES_REQUESTED review is newer than the
# PR's head commit (so once we push a fix, it won't be re-revised until the next
# changes-requested review).
revise_pr=""; revise_branch=""; revise_feedback=""
# Loop PRs are identified by their branch prefix (their label is eng-loop:<category>,
# not the bare eng-loop label, which is only on issues).
for n in $(gh pr list --repo "$LOOP_REPO" --state open --json number,headRefName \
            -q '.[]|select(.headRefName|startswith("eng-loop-"))|.number' 2>/dev/null); do
  data="$(gh pr view "$n" --repo "$LOOP_REPO" --json headRefName,commits,reviews 2>/dev/null)" || continue
  needs="$(printf '%s' "$data" | jq -r '
    ((.commits | last | .committedDate) // "") as $h
    | ([.reviews[] | select(.state=="CHANGES_REQUESTED") | .submittedAt] | max) as $c
    | if ($c != null) and ($c > $h) then "yes" else "no" end' 2>/dev/null)"
  if [ "$needs" = "yes" ]; then
    revise_pr="$n"
    revise_branch="$(printf '%s' "$data" | jq -r '.headRefName')"
    break
  fi
done

if [ -n "$revise_pr" ]; then
  # Gather the reviewer's words: changes-requested review bodies + PR comments + inline comments.
  revise_feedback="$(
    gh pr view "$revise_pr" --repo "$LOOP_REPO" --json reviews,comments \
      --jq '(.reviews[]|select(.state=="CHANGES_REQUESTED")|select(.body!="")|"REVIEW: "+.body),(.comments[]|select(.body!="")|"COMMENT: "+.body)' 2>/dev/null
    gh api "repos/$LOOP_REPO/pulls/$revise_pr/comments" \
      --jq '.[]|"INLINE("+(.path//"?")+"): "+(.body//"")' 2>/dev/null
  )"
  revise_feedback="$(printf '%s\n' "$revise_feedback" | head -80)"
  category="revise"; mode="revise PR #$revise_pr"
  [ -n "${LOOP_DATABASE_URL:-}" ] && needs_db=1   # PR could be FE or BE — give it backend access if we have it
  log "revise: PR #$revise_pr ($revise_branch) has unaddressed change requests — prioritizing"
fi

# --- 5b. RECONCILE mode: an open loop PR that conflicts with main ------------
# If nothing to revise, look for a PR blocked by merge conflicts and resolve them
# (merge origin/main in, reconcile both sides, re-verify, push) so it's mergeable.
reconcile_pr=""; reconcile_branch=""
if [ -z "$revise_pr" ]; then
  sel="$(gh pr list --repo "$LOOP_REPO" --state open --json number,mergeable,headRefName \
        -q '([.[]|select((.headRefName|startswith("eng-loop-")) and .mergeable=="CONFLICTING")]|first) as $p | if $p then "\($p.number) \($p.headRefName)" else empty end' 2>/dev/null || true)"
  if [ -n "$sel" ]; then
    reconcile_pr="${sel%% *}"; reconcile_branch="${sel#* }"
    category="reconcile"; mode="reconcile PR #$reconcile_pr"
    [ -n "${LOOP_DATABASE_URL:-}" ] && needs_db=1
    log "reconcile: PR #$reconcile_pr ($reconcile_branch) conflicts with main — resolving"
  fi
fi

# Shared "working on an existing PR" state (revise or reconcile).
pr_active="${revise_pr}${reconcile_pr}"
pr_branch="${revise_branch:-$reconcile_branch}"

# --- 6. Else pick new work: labeled issue, else autonomous category ---------
if [ -z "$pr_active" ]; then
  issue_num=""; issue_title=""; issue_body=""

  # Issues already covered by an open loop PR. The loop NEVER merges, so an
  # issue stays open until a human merges its PR; without this guard each tick
  # re-picks the same open issue and clones the work into a fresh PR.
  covered="$(gh pr list --repo "$LOOP_REPO" --state open --limit 100 \
             --json closingIssuesReferences \
             --jq '[.[].closingIssuesReferences[]?.number] | unique | .[]' \
             2>/dev/null || true)"

  IFS=',' read -ra _labels <<< "$ISSUE_LABELS"
  for l in "${_labels[@]}"; do
    l="$(printf '%s' "$l" | xargs)"   # trim
    [ -n "$l" ] || continue
    # Pull a page (not just the first) so we can skip issues an open PR covers.
    while IFS=$'\t' read -r n t; do
      [ -n "$n" ] || continue
      if printf '%s\n' "$covered" | grep -qx "$n"; then
        log "skip issue #$n: already covered by an open loop PR"; continue
      fi
      issue_num="$n"; issue_title="$t"
      issue_body="$(gh issue view "$issue_num" --repo "$LOOP_REPO" --json body --jq .body 2>/dev/null || true)"
      break
    done < <(gh issue list --repo "$LOOP_REPO" --label "$l" --state open \
             --limit 20 --json number,title \
             --jq '.[] | "\(.number)\t\(.title)"' 2>/dev/null || true)
    [ -n "$issue_num" ] && break
  done

  if [ -n "$issue_num" ]; then
    mode="issue #$issue_num"; log "work: issue #$issue_num — $issue_title"
  else
    mode="autonomous"; log "work: no labeled issues; autonomous discovery"
  fi

  # Choose a playbook category. A labeled issue overrides rotation. Otherwise
  # round-robin AUTONOMOUS_CATEGORIES, honoring prerequisites + per-category PR backpressure.
  if [ -n "$issue_num" ]; then
    category="issue"
  else
    IFS=',' read -ra _cats <<< "$AUTONOMOUS_CATEGORIES"
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
      [ -f "$here/playbooks/$cand.md" ] || { log "skip $cand: no playbooks/$cand.md"; continue; }
      case "$cand" in
        clustering)
          [ -z "${LOOP_DATABASE_URL:-}" ] && { log "skip clustering: LOOP_DATABASE_URL unset"; continue; } ;;
        pricing)
          [ -z "${LOOP_DATABASE_URL:-}" ] && { log "skip pricing: LOOP_DATABASE_URL unset"; continue; }
          curl -sS -o /dev/null -m 5 "$NET32_HARVESTER_URL" 2>/dev/null \
            || { log "skip pricing: harvester $NET32_HARVESTER_URL unreachable"; continue; } ;;
      esac
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
  [ "$category" = "issue" ] && [ -n "${LOOP_DATABASE_URL:-}" ] && needs_db=1
fi
log "category: $category${pr_active:+ (PR #$pr_active)}"

# --- 7. Worktree (PR work: off the PR branch; else: off origin/main) --------
stamp="$(date +%Y%m%d-%H%M%S)"
if [ -n "$pr_active" ]; then
  branch="$pr_branch"; wt="$LOOP_HOME/worktrees/pr-$pr_active-$stamp"
else
  branch="eng-loop-${category}-${stamp}"; wt="$LOOP_HOME/worktrees/$stamp"
fi

cleanup() {
  log "teardown"
  [ -n "${LOOP_PORT:-}" ] && pkill -f "next dev -p ${LOOP_PORT}" 2>/dev/null || true
  cd "$REPO_DIR" 2>/dev/null || true
  git worktree remove --force "$wt" 2>/dev/null || true
  # Drop the LOCAL branch only; a pushed branch (with its PR) stays on the remote.
  git branch -D "$branch" 2>/dev/null || true
}
trap cleanup EXIT

if [ -n "$pr_active" ]; then
  git fetch --quiet origin "$pr_branch" || { log "fetch PR branch failed"; exit 1; }
  git worktree add -B "$branch" "$wt" "origin/$pr_branch" >/dev/null 2>&1 \
    || { log "worktree add (PR) failed"; exit 1; }
else
  git worktree add -b "$branch" "$wt" "$base_sha" >/dev/null 2>&1 \
    || { log "worktree add failed"; exit 1; }
fi

# Provision per-worktree env (unique free port) + point at the chosen backend.
( cd "$wt" \
   && bash scripts/worktree-init.sh >/dev/null 2>&1 \
   && bash scripts/worktree-db.sh "$BACKEND_TARGET" >/dev/null 2>&1 ) || true
LOOP_PORT="$(sed -n 's/^MEDMKP_PORT=//p' "$wt/.env.local" 2>/dev/null | head -1)"
log "worktree=$wt branch=$branch port=${LOOP_PORT:-?} backend=$BACKEND_TARGET"

# Backend work needs installed deps + a read-only DB URL: symlink node_modules
# from the base checkout (avoids a multi-minute install) + pass DATABASE_URL.
if [ "$needs_db" = "1" ]; then
  for nm in "node_modules" "medusa-backend/apps/backend/node_modules"; do
    [ -d "$REPO_DIR/$nm" ] && [ ! -e "$wt/$nm" ] && ln -s "$REPO_DIR/$nm" "$wt/$nm" 2>/dev/null || true
  done
  log "symlinked node_modules; DATABASE_URL set (read-only prod)"
fi

if [ "$DRY_RUN" = "1" ]; then
  log "dry-run: would invoke $engine now ($mode). Stopping before the model call."
  exit 0
fi

# --- 8. Build the prompt ----------------------------------------------------
prompt="$(cat "$here/loop-prompt.md")"
if [ -n "$revise_pr" ]; then
  prompt+=$'\n\n## THIS RUN: REVISE A PR PER REVIEWER FEEDBACK\n\n'
  prompt+="Revise **PR #$revise_pr** — its branch is checked out in your cwd — per the reviewer's "
  prompt+="\"Request changes\" feedback below. The feedback is **high-level** (the reviewer judged the "
  prompt+="live preview / screenshots, not the code), so interpret intent."$'\n'
  prompt+="- **UI feedback:** start the app (\`npm run dev\`), open the relevant screen, SEE the current "
  prompt+="state, make the requested change following the Visual fidelity protocol (re-screenshot + compare), "
  prompt+="capture before/after."$'\n'
  prompt+="- Commit to THIS branch and \`git push\` (it updates the PR). Then \`gh pr comment $revise_pr -b ...\` "
  prompt+="summarizing what you changed. **Do NOT open a new PR; do NOT merge.**"$'\n'
  prompt+="- If the feedback is ambiguous or you can't satisfy it, comment on the PR asking for specifics and stop."$'\n'
  prompt+=$'\nReviewer feedback:\n'"$revise_feedback"$'\n'
elif [ -n "$reconcile_pr" ]; then
  prompt+=$'\n\n## THIS RUN: RESOLVE MERGE CONFLICTS ON A PR\n\n'
  prompt+="**PR #$reconcile_pr** (its branch is checked out in your cwd) conflicts with \`main\`."$'\n'
  prompt+="- Run \`git merge --no-edit origin/main\`, then resolve EVERY conflict so you keep BOTH this PR's intent AND the changes already on main — drop neither side."$'\n'
  prompt+="- Re-run the relevant verification (tests, or the compare-loop for UI) to confirm nothing broke."$'\n'
  prompt+="- Commit the merge and \`git push\` (updates the PR → mergeable). Do NOT change scope, merge the PR, or open a new PR."$'\n'
  prompt+="- If you can't resolve it correctly: \`git merge --abort\`, comment on the PR explaining, and stop."$'\n'
else
  prompt+=$'\n\n## THIS RUN\'S PLAYBOOK\n\n'
  if [ "$category" = "issue" ]; then
    prompt+="You are fixing a specific GitHub issue (see RUN CONTEXT). Read it, decide which "
    prompt+="playbook applies, and consult scripts/eng-loop/playbooks/ for technique: "
    prompt+="clustering.md (matching/cluster issues), pricing.md (price/vendor), "
    prompt+="qa-design.md (UI/design/bug)."$'\n'
  else
    prompt+="$(cat "$here/playbooks/$category.md")"$'\n'
  fi
fi
prompt+=$'\n---\nRUN CONTEXT (injected by run-loop.sh):\n'
prompt+="- Mode: $mode"$'\n'
prompt+="- Worktree (your cwd): $wt"$'\n'
prompt+="- Dev URL once you start it: http://localhost:${LOOP_PORT:-3000}"$'\n'
prompt+="- Branch (checked out): $branch"$'\n'
prompt+="- Repo: $LOOP_REPO"$'\n'
prompt+="- Evidence raw-URL base: https://raw.githubusercontent.com/$LOOP_REPO/$branch/"$'\n'
[ "$needs_db" = "1" ] && prompt+="- DATABASE_URL: set in your env (READ-ONLY prod — never --commit)."$'\n'
if [ -n "$revise_pr" ]; then
  prompt+="- Task source: REVISE PR #$revise_pr per the feedback above (push to this branch; never a new PR)."$'\n'
elif [ -n "$reconcile_pr" ]; then
  prompt+="- Task source: RECONCILE PR #$reconcile_pr — merge origin/main, resolve conflicts, re-verify, push (never a new PR)."$'\n'
elif [ -n "$issue_num" ]; then
  prompt+="- Task source: GitHub issue #$issue_num — fix this specific issue."$'\n'
  prompt+="- Issue title: $issue_title"$'\n'
  prompt+="- Issue body:"$'\n'"$issue_body"$'\n'
else
  prompt+="- Task source: AUTONOMOUS — follow the playbook above (category '$category')."$'\n'
fi

# --- 9. Invoke the engine ---------------------------------------------------
log "invoking $engine ($mode, timeout=${RUN_TIMEOUT}s)…"
if [ "$engine" = "codex" ]; then
  cmodel=(); [ -n "${CODEX_MODEL:-}" ] && cmodel=(-m "$CODEX_MODEL")
  (
    cd "$wt" || exit 1
    [ "$needs_db" = "1" ] && export DATABASE_URL="$LOOP_DATABASE_URL"
    timeout "$RUN_TIMEOUT" "${CODEX_BIN:-codex}" exec \
      --dangerously-bypass-approvals-and-sandbox "${cmodel[@]}" <<<"$prompt"
  ) >>"$LOOP_HOME/logs/run-$stamp.codex.log" 2>&1
  rc=$?
  transcript="$LOOP_HOME/logs/run-$stamp.codex.log"; engine_fmt="codex"
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
  transcript="$LOOP_HOME/logs/run-$stamp.jsonl"; engine_fmt="claude"
  log "claude run exit=$rc (transcript: logs/run-$stamp.jsonl)"
fi

# --- 10. Report -------------------------------------------------------------
pr_action="none"; pr_number=""   # for health.jsonl (emit downgrades to none on FAIL)
if [ -n "$pr_active" ]; then
  pr_action="reconciled"; [ -n "$revise_pr" ] && pr_action="revised"; pr_number="$pr_active"
  log "$mode done: PR #$pr_active updated (re-review). exit=$rc"
else
  pr_num="$(cd "$wt" 2>/dev/null && gh pr view --json number -q .number 2>/dev/null || true)"
  if [ -n "$pr_num" ]; then
    pr_action="created"; pr_number="$pr_num"
    gh label create "eng-loop:$category" --repo "$LOOP_REPO" --color ededed 2>/dev/null || true
    # Add the category label via the REST labels endpoint (a PR is an "issue" in
    # the API). We deliberately do NOT use `gh pr edit --add-label`: on the older
    # gh shipped to the NUC (2.45.x) its GraphQL PR query references the
    # now-sunset Projects-classic `projectCards` field, so the whole call fails
    # and the label silently never lands — which in turn defeats the per-category
    # backpressure cap that counts open PRs by this label. Surface failures
    # instead of swallowing them so a future regression is visible in the log.
    if ! label_err="$(gh api -X POST "repos/$LOOP_REPO/issues/$pr_num/labels" \
          -f "labels[]=eng-loop:$category" 2>&1 >/dev/null)"; then
      log "WARN: failed to label PR #$pr_num with eng-loop:$category: $label_err"
    fi
    # Drop the source issue's loop labels so a LATER tick won't re-pick an issue
    # that already has an in-flight PR (the PR carries a "Closes #N" link; merging
    # closes the issue). Re-label the issue to retry if the PR is closed unmerged.
    if [ -n "${issue_num:-}" ]; then
      # Strip EVERY loop label the picker matches on (ISSUE_LABELS) — these are
      # colon-namespaced (e.g. `eng-loop:qa`), so removing bare `eng-loop`/`qa`
      # is a no-op and the issue gets re-picked every tick. Remove only labels
      # actually present, so old gh (2.45) doesn't abort on an unknown label.
      cur_labels="$(gh issue view "$issue_num" --repo "$LOOP_REPO" --json labels --jq '.labels[].name' 2>/dev/null || true)"
      rm_args=()
      IFS=',' read -ra _ils <<< "$ISSUE_LABELS"
      for _il in "${_ils[@]}"; do
        _il="$(printf '%s' "$_il" | xargs)"; [ -n "$_il" ] || continue
        printf '%s\n' "$cur_labels" | grep -qxF "$_il" && rm_args+=(--remove-label "$_il")
      done
      if [ "${#rm_args[@]}" -gt 0 ]; then
        gh issue edit "$issue_num" --repo "$LOOP_REPO" "${rm_args[@]}" 2>/dev/null || true
        log "issue #$issue_num: removed loop labels (${rm_args[*]//--remove-label /}) — PR #$pr_num now carries it"
      else
        log "issue #$issue_num: no loop labels to remove (PR #$pr_num carries it)"
      fi
    fi
    log "PR opened: https://github.com/$LOOP_REPO/pull/$pr_num (eng-loop:$category)"
  else
    log "no PR this tick (quiet tick, a data-quality issue may have been filed, or aborted for lack of evidence)."
  fi
fi

# --- 11. Health record + edge-triggered alert -------------------------------
# Classify this tick into logs/health.jsonl, then let health.sh decide whether
# the loop has crossed into DOWN/STALLED and fire the webhook if so.
mode_kind="autonomous"
[ -n "${issue_num:-}" ]     && mode_kind="issue"
[ -n "${reconcile_pr:-}" ]  && mode_kind="reconcile"
[ -n "${revise_pr:-}" ]     && mode_kind="revise"
EL_ENGINE="$engine" EL_ENGINE_FMT="${engine_fmt:-}" EL_MODEL="${CLAUDE_MODEL:-${CODEX_MODEL:-default}}" \
EL_MODE="$mode" EL_MODE_KIND="$mode_kind" EL_CATEGORY="${category:-}" EL_RC="$rc" \
EL_DUR="$(( $(date +%s) - tick_start ))" EL_PR_ACTION="$pr_action" EL_PR_NUMBER="$pr_number" \
EL_TRANSCRIPT="${transcript:-}" LOOP_HOME="$LOOP_HOME" \
  bash "$here/health.sh" emit 2>>"$LOG" || log "WARN: health emit failed"
bash "$here/health.sh" alert >>"$LOG" 2>&1 || log "WARN: health alert failed"

log "=== tick end ==="
