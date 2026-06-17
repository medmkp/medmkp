#!/usr/bin/env bash
# Show every worktree's frontend instance: port · DB · branch · path.
set -eu

fmt="%-6s  %-5s  %-32s  %s\n"
# shellcheck disable=SC2059
printf "$fmt" PORT DB BRANCH PATH
for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  envf="$wt/.env.local"
  port="-"; db="-"; branch="-"
  if [ -f "$envf" ]; then
    v="$(sed -n 's/^MEDMKP_PORT=//p' "$envf" | head -1 || true)";       [ -n "$v" ] && port="$v"
    v="$(sed -n 's/^MEDMKP_DB_TARGET=//p' "$envf" | head -1 || true)";  [ -n "$v" ] && db="$v"
    v="$(sed -n 's/^MEDMKP_BRANCH=//p' "$envf" | head -1 || true)";     [ -n "$v" ] && branch="$v"
  fi
  # shellcheck disable=SC2059
  printf "$fmt" "$port" "$db" "$branch" "$wt"
done
