#!/usr/bin/env bash
# Install/refresh the eng-loop status dashboard HTTP server on the NUC.
#
# Run from your Mac. Pushes a self-contained snapshot (status.sh + config.env +
# serve.py) to ~/eng-loop/status-server/ on the NUC, installs a systemd *user*
# service, enables linger so it survives reboots/logout, and starts it. Decoupled
# from the loop's own checkout — it never touches what branch the loop runs.
#
# Re-run any time to ship updated status.sh / serve.py (idempotent).
#
# Usage:  scripts/eng-loop/status-server/install.sh
# Env:    NUC_HOST (default nuc) · STATUS_PORT (default 8799)
set -euo pipefail

NUC_HOST="${NUC_HOST:-nuc}"
STATUS_PORT="${STATUS_PORT:-8799}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # scripts/eng-loop/status-server
loopdir="$(dirname "$here")"                            # scripts/eng-loop

echo "Shipping status server to ${NUC_HOST} (port ${STATUS_PORT})…"

# 1) Ship the files as a tar stream into a staging dir (stdin = the tarball, so
#    the remote command must be a plain arg string — no heredoc stealing stdin).
tar -C "$loopdir" -cf - \
      status.sh config.env \
      status-server/serve.py status-server/eng-loop-status.service \
  | ssh "$NUC_HOST" 'rm -rf ~/eng-loop/status-server/_incoming && mkdir -p ~/eng-loop/status-server/_incoming && tar -C ~/eng-loop/status-server/_incoming -xf -'

# 2) Install from the staging dir + (re)start the service (stdin = this heredoc).
ssh "$NUC_HOST" "STATUS_PORT='$STATUS_PORT' bash -s" <<'REMOTE'
set -euo pipefail
BASE="$HOME/eng-loop/status-server"
LIB="$BASE/lib"
tmp="$BASE/_incoming"
mkdir -p "$LIB" "$HOME/.config/systemd/user"

install -m 0755 "$tmp/status.sh"   "$LIB/status.sh"
install -m 0644 "$tmp/config.env"  "$LIB/config.env"
install -m 0755 "$tmp/status-server/serve.py" "$BASE/serve.py"

# Drop the unit with the requested port baked in.
sed "s/^Environment=STATUS_PORT=.*/Environment=STATUS_PORT=$STATUS_PORT/" \
    "$tmp/status-server/eng-loop-status.service" \
    > "$HOME/.config/systemd/user/eng-loop-status.service"

rm -rf "$tmp"
loginctl enable-linger "$USER" >/dev/null 2>&1 || true   # run without an active login session
systemctl --user daemon-reload
systemctl --user enable --now eng-loop-status.service

sleep 1
echo "--- service ---"
systemctl --user --no-pager --lines=0 status eng-loop-status.service | sed -n '1,4p' || true
echo "--- self-check (localhost:$STATUS_PORT) ---"
curl -fsS -m 5 "http://127.0.0.1:$STATUS_PORT/healthz" && echo "healthz ok" || echo "healthz FAILED"
REMOTE

# Resolve the address the user actually reaches the NUC at (ssh HostName).
addr="$(ssh -G "$NUC_HOST" 2>/dev/null | awk '/^hostname /{print $2; exit}')"
echo
echo "Done. Dashboard URL:"
[ -n "$addr" ] && echo "  http://$addr:$STATUS_PORT/"
echo "  http://$NUC_HOST:$STATUS_PORT/   (if '$NUC_HOST' resolves on your machine)"
echo
echo "It auto-refreshes every 60s. Manage on the NUC with:"
echo "  systemctl --user status|restart eng-loop-status"
