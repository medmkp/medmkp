#!/usr/bin/env bash
# Deploy the engineering quality loop to the NUC from your Mac — no git on the NUC.
#
# Mirrors scripts/deploy-airflow-nuc.sh: ssh in, sync the loop's dedicated checkout
# (clone if missing, else hard-reset to origin/BRANCH), make scripts executable,
# install deps if needed, and (optionally) install the cron entry.
#
# Usage:
#   npm run deploy:eng-loop                 # sync code to the NUC (current branch)
#   npm run deploy:eng-loop -- --deps       # also `npm install` (root)
#   npm run deploy:eng-loop -- --backend    # also install backend deps (for clustering)
#   npm run deploy:eng-loop -- --cron       # also install/refresh the crontab entry
#   npm run deploy:eng-loop -- --print      # print the remote script, don't ssh
#
# Env: NUC_HOST (default nuc) · BRANCH (default current) · NUC_LOOP_HOME (default
#      ~/eng-loop on the NUC) · CRON_SCHEDULE (default "0 */4 * * *").
set -euo pipefail

NUC_HOST="${NUC_HOST:-nuc}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
ORIGIN_URL="${ORIGIN_URL:-$(git remote get-url origin)}"
NUC_LOOP_HOME="${NUC_LOOP_HOME:-}"          # empty → remote defaults to $HOME/eng-loop
CRON_SCHEDULE="${CRON_SCHEDULE:-0 */4 * * *}"

WITH_DEPS=0 WITH_BACKEND=0 WITH_CRON=0 PRINT_ONLY=0
for a in "$@"; do case "$a" in
  --deps) WITH_DEPS=1 ;;
  --backend) WITH_BACKEND=1; WITH_DEPS=1 ;;
  --cron) WITH_CRON=1 ;;
  --print) PRINT_ONLY=1 ;;
  -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "unknown flag: $a" >&2; exit 2 ;;
esac; done

if [[ "$BRANCH" == "HEAD" ]]; then
  echo "Could not determine branch; set BRANCH explicitly." >&2; exit 1
fi

# Remote payload (runs on the NUC). All inputs arrive as env vars.
IFS= read -r -d '' REMOTE <<'REMOTE' || true
set -euo pipefail
LOOP_HOME="${NUC_LOOP_HOME:-$HOME/eng-loop}"
REPO_DIR="$LOOP_HOME/checkout"
mkdir -p "$LOOP_HOME/logs" "$LOOP_HOME/worktrees"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Cloning $ORIGIN_URL → $REPO_DIR"
  git clone "$ORIGIN_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
echo "Syncing to origin/$BRANCH (hard reset; this checkout is loop-owned)..."
git fetch --quiet origin "$BRANCH"
git checkout -f -q -B "$BRANCH" "origin/$BRANCH"   # -f survives any dirty tree
echo "  at $(git rev-parse --short HEAD) on $BRANCH"

chmod +x scripts/eng-loop/*.sh scripts/eng-loop/ocr/*.mjs 2>/dev/null || true

if [ "$WITH_DEPS" = "1" ] || [ ! -d node_modules ]; then
  echo "npm install (root)..."; npm install --no-audit --no-fund
fi
if [ "$WITH_BACKEND" = "1" ]; then
  echo "npm install (backend, for clustering)..."
  npm install --no-audit --no-fund --prefix medusa-backend/apps/backend
fi

CRON_LINE="$CRON_SCHEDULE bash -lc '$REPO_DIR/scripts/eng-loop/run-loop.sh' >> $LOOP_HOME/logs/cron.log 2>&1 # eng-loop"
if [ "$WITH_CRON" = "1" ]; then
  ( crontab -l 2>/dev/null | grep -vF '# eng-loop'; echo "$CRON_LINE" ) | crontab -
  echo "Cron installed: $CRON_LINE"
else
  echo "Cron line (add with --cron, or paste into 'crontab -e'):"
  echo "  $CRON_LINE"
fi

echo "--- readiness ---"
bash -lc 'command -v claude >/dev/null' && echo "  claude: on PATH" || echo "  claude: NOT on PATH (login once: claude)"
bash -lc 'command -v gh >/dev/null'     && echo "  gh: on PATH"     || echo "  gh: NOT on PATH"
bash -lc 'command -v codex >/dev/null'  && echo "  codex: on PATH (fallback engine)" || echo "  codex: NOT on PATH (Codex fallback off until installed+login)"
command -v tmux >/dev/null 2>&1         && echo "  tmux: present (needed for Codex usage check)" || echo "  tmux: MISSING (Codex fallback can't read usage — apt install tmux)"
[ -f "$HOME/.eng-loop.secrets" ] && echo "  secrets: present (clustering enabled if LOOP_DATABASE_URL set)" \
                                  || echo "  secrets: none → loop runs qa-design + ocr only (no DB categories)"
[ -f "$LOOP_HOME/PAUSE" ] && echo "  PAUSE file present — loop is paused (remove to run)." || true
echo "Deployed to $REPO_DIR."
REMOTE

if [ "$PRINT_ONLY" = "1" ]; then
  printf '%s\n' "$REMOTE"; exit 0
fi

echo "Deploying eng-loop to ${NUC_HOST} from origin/${BRANCH}"
ssh "$NUC_HOST" \
  "NUC_LOOP_HOME='$NUC_LOOP_HOME' ORIGIN_URL='$ORIGIN_URL' BRANCH='$BRANCH' \
   WITH_DEPS='$WITH_DEPS' WITH_BACKEND='$WITH_BACKEND' WITH_CRON='$WITH_CRON' \
   CRON_SCHEDULE='$CRON_SCHEDULE' bash -s" <<<"$REMOTE"
