#!/usr/bin/env bash
# Clean up finished Claude Code worktrees and reclaim the disk abandoned
# sessions leave behind. Safe by default:
#   * removes only worktrees that are CLEAN and whose HEAD is merged into the
#     base (default: main) — dirty or unmerged worktrees are kept
#   * deletes branches only with `git branch -d` (merged-only, never -D)
#   * never touches the current worktree or the main checkout
#   * rm -rf's leftover directories under .claude/worktrees/ that git no longer
#     tracks as worktrees (the stale node_modules/.next from dead sessions)
#
# Dry run by default — prints what it WOULD do. Pass --apply to execute.
#   scripts/worktree-cleanup.sh                  # preview
#   scripts/worktree-cleanup.sh --apply          # do it
#   scripts/worktree-cleanup.sh --base develop   # compare against a different base
set -eu

base="main"
apply=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply|-y) apply=1 ;;
    --base) shift; base="${1:?--base needs a value}" ;;
    --base=*) base="${1#--base=}" ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

git rev-parse --verify --quiet "$base" >/dev/null || { echo "base branch '$base' not found" >&2; exit 1; }

here="$(git rev-parse --show-toplevel)"
main_root=""
for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  [ -d "$wt/.git" ] && { main_root="$wt"; break; }
done

[ "$apply" -eq 1 ] && echo "mode: APPLY   base: $base" || echo "mode: dry-run (pass --apply to execute)   base: $base"

echo "== worktrees =="
for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  [ "$wt" = "$main_root" ] && continue
  [ "$wt" = "$here" ] && { echo "keep (current)   $wt"; continue; }
  head_sha="$(git -C "$wt" rev-parse HEAD 2>/dev/null || echo)"
  [ -n "$head_sha" ] || continue
  if ! git merge-base --is-ancestor "$head_sha" "$base" 2>/dev/null; then
    echo "keep (unmerged)  $wt"; continue
  fi
  if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
    echo "keep (dirty)     $wt"; continue
  fi
  if [ "$apply" -eq 1 ]; then
    if git worktree remove "$wt"; then echo "removed          $wt"
    else echo "FAILED to remove $wt (remove manually if intended)"; fi
  else
    echo "would remove     $wt"
  fi
done

[ "$apply" -eq 1 ] && git worktree prune

echo "== merged branches (no worktree) =="
git branch --merged "$base" | while read -r line; do
  case "$line" in '*'*|'+'*) continue ;; esac   # skip current (*) and in-worktree (+)
  b="$(echo "$line" | xargs)"
  { [ -z "$b" ] || [ "$b" = "$base" ]; } && continue
  if [ "$apply" -eq 1 ]; then
    git branch -d "$b" >/dev/null 2>&1 && echo "deleted branch   $b" || echo "kept branch      $b (in use or unmerged)"
  else
    echo "would delete     $b"
  fi
done

echo "== orphaned directories =="
wt_dir="$main_root/.claude/worktrees"
[ -d "$wt_dir" ] || exit 0
registered="$(git worktree list --porcelain | awk '/^worktree /{print $2}' | xargs -n1 basename)"
for d in "$wt_dir"/*/; do
  [ -d "$d" ] || continue
  echo "$registered" | grep -qx "$(basename "$d")" && continue
  if [ "$apply" -eq 1 ]; then
    if rm -rf "$d"; then echo "deleted dir      $d"; fi
  else
    echo "would delete dir $d"
  fi
done

[ "$apply" -eq 1 ] || echo "(dry run — nothing changed; re-run with --apply)"
