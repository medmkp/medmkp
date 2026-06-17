#!/usr/bin/env bash
# Flip this worktree's frontend between the prod and local backend (= which DB).
# Restart `npm run dev` afterwards — Next reads env at server start.
set -eu

PROD_URL="https://medmkp-medusa.onrender.com"
LOCAL_URL="http://127.0.0.1:9000"

case "${1:-}" in
  prod)  target="prod";  url="$PROD_URL" ;;
  local) target="local"; url="$LOCAL_URL" ;;
  *) echo "usage: worktree-db.sh prod|local" >&2; exit 2 ;;
esac

root="$(git rev-parse --show-toplevel)"
envfile="$root/.env.local"
if [ ! -f "$envfile" ]; then
  [ -x "$root/scripts/worktree-init.sh" ] && "$root/scripts/worktree-init.sh" >/dev/null
fi

tmp="$(mktemp)"
sed -e "s|^MEDMKP_DB_TARGET=.*|MEDMKP_DB_TARGET=$target|" \
    -e "s|^MEDUSA_BACKEND_URL=.*|MEDUSA_BACKEND_URL=$url|" \
    "$envfile" > "$tmp" && mv "$tmp" "$envfile"

echo "worktree-db: → $target ($url). Restart \`npm run dev\` to apply."
