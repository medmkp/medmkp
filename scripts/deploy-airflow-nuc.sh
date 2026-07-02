#!/usr/bin/env bash
set -euo pipefail

NUC_HOST="${NUC_HOST:-nuc}"
NUC_REPO_DIR="${NUC_REPO_DIR:-/opt/medmkp}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

if [[ "$BRANCH" == "HEAD" ]]; then
  echo "Could not determine current branch; set BRANCH explicitly." >&2
  exit 1
fi

echo "Deploying Airflow to ${NUC_HOST}:${NUC_REPO_DIR} from origin/${BRANCH}"

ssh "$NUC_HOST" "NUC_REPO_DIR='$NUC_REPO_DIR' BRANCH='$BRANCH' bash -s" <<'REMOTE'
set -euo pipefail

cd "$NUC_REPO_DIR"

echo "Checking remote repo state..."
git fetch origin "$BRANCH"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Remote worktree is dirty; refusing to deploy." >&2
  git status --short >&2
  exit 1
fi

echo "Updating to origin/${BRANCH}..."
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Rebuilding and restarting Airflow..."
cd airflow
docker compose up -d --build

# Idempotent: creates or resizes the single-slot ingest pool every ingestion
# DAG queues through (referenced via the medmkp_supplier_ingest_pool Variable).
# Strict on purpose: tasks referencing a missing pool are never scheduled, so a
# failed creation must fail the deploy, not pass silently.
echo "Ensuring the single-slot ingest pool exists..."
docker compose exec -T airflow airflow pools set medmkp_supplier_ingest 1 \
  "Single-slot pool serializing supplier crawls on this one box"

echo "Airflow status:"
docker compose ps
REMOTE
