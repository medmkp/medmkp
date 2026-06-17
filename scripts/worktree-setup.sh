#!/usr/bin/env bash
# One-time per clone: install the post-checkout hook into the shared hooks dir
# (the common .git/hooks, which every worktree uses) so each future
# `git worktree add` auto-provisions an isolated frontend instance.
set -eu

root="$(git rev-parse --show-toplevel)"
hooks="$(git rev-parse --git-common-dir)/hooks"
mkdir -p "$hooks"
cp "$root/.githooks/post-checkout" "$hooks/post-checkout"
chmod +x "$hooks/post-checkout"
echo "hook installed → $hooks/post-checkout"
