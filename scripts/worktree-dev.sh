#!/usr/bin/env bash
# Run `next dev` on this worktree's assigned port, refreshing the branch shown
# in the in-app badge. In the main checkout (no .env.local) this is a no-op
# wrapper: it just runs `next dev` on the default :3000, with no badge.
set -eu

root="$(git rev-parse --show-toplevel)"
envfile="$root/.env.local"

# A linked worktree has .git as a *file* (a gitdir pointer); the main checkout
# has .git as a directory. Only auto-provision linked worktrees, so the main
# checkout keeps its plain :3000 behaviour.
if [ -f "$root/.git" ] && { [ ! -f "$envfile" ] || ! grep -q '^MEDMKP_PORT=' "$envfile"; }; then
  [ -x "$root/scripts/worktree-init.sh" ] && "$root/scripts/worktree-init.sh"
fi

port=3000
if [ -f "$envfile" ]; then
  p="$(sed -n 's/^MEDMKP_PORT=//p' "$envfile" | head -1 || true)"
  [ -n "$p" ] && port="$p"
  # Refresh the branch so the badge never goes stale after a checkout.
  if grep -q '^MEDMKP_BRANCH=' "$envfile"; then
    branch="$(git -C "$root" branch --show-current 2>/dev/null || true)"
    [ -n "$branch" ] || branch="detached"
    tmp="$(mktemp)"
    sed "s|^MEDMKP_BRANCH=.*|MEDMKP_BRANCH=$branch|" "$envfile" > "$tmp" && mv "$tmp" "$envfile"
  fi
fi

exec npx next dev -p "$port"
