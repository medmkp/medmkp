#!/usr/bin/env bash
# Vercel "Ignored Build Step" — decides whether Vercel builds a given commit.
#
# Exit-code semantics are INVERTED from intuition:
#   exit 1  -> BUILD (proceed with the deployment)
#   exit 0  -> SKIP  (cancel the deployment)
#
# Why this exists: the autonomous eng-loop opens many PRs/day, and every push
# to an eng-loop branch spawned a Vercel Preview deploy. On the Hobby plan
# (100 deploys/day) that volume exhausted the daily quota and starved
# production merges — a merged fix would sit undeployed with the commit status
# "Deployment rate limited — retry in 24 hours."
#
# eng-loop changes are reviewed via the before/after screenshots the loop
# commits into each PR, or a per-worktree dev server reached over Tailscale
# (scripts/worktree-dev.sh) — not a Vercel preview. So we skip Preview builds
# for eng-loop branches. Production (merges to main) and human-authored PRs
# still build normally.

env="${VERCEL_ENV:-}"
ref="${VERCEL_GIT_COMMIT_REF:-}"

# Always build production — a merge to main must deploy.
if [ "$env" = "production" ]; then
  exit 1
fi

# Skip Preview builds for eng-loop branches (eng-loop-issue-*, eng-loop-qa-*,
# eng-loop-vendor-*, etc.).
case "$ref" in
  eng-loop-*)
    echo "Skipping Vercel preview for eng-loop branch: $ref"
    exit 0
    ;;
esac

# Build everything else (human PRs, one-off branches).
exit 1
