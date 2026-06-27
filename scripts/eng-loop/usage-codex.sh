#!/usr/bin/env bash
# Read Codex remaining usage % from its TUI /status panel.
#
# Codex has no headless usage readout: `codex exec` only reports per-invocation
# tokens, and the real limits live in the interactive /status panel. That TUI
# doesn't render to a bare pty (expect sees nothing), so we drive it inside tmux
# and read the rendered pane, which shows e.g.:
#     5h limit:     [███...] 96% left (resets ...)
#     Weekly limit: [███...] 80% left (resets ...)
#
# Prints the remaining % for GATE_WINDOW to stdout (the more-constrained window
# for "both"); diagnostics to stderr. Exit 0 if read, 1 if not (fail closed).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[ -f "$here/config.env" ] && . "$here/config.env"
CODEX_BIN="${CODEX_BIN:-codex}"
GATE_WINDOW="${GATE_WINDOW:-both}"
CODEX_AUTO_UPDATE="${CODEX_AUTO_UPDATE:-true}"
CODEX_READY_TIMEOUT="${CODEX_READY_TIMEOUT:-180}"
# NB: do NOT force LC_ALL=C here — codex's TUI needs a UTF-8 locale to render.
# Our grep patterns are ASCII-only, so UTF-8 matching is fine.

log() { printf '[usage-codex] %s\n' "$*" >&2; }

command -v tmux >/dev/null 2>&1     || { log "tmux not found (needed to read codex /status)"; exit 1; }
command -v "$CODEX_BIN" >/dev/null 2>&1 || { log "codex not found"; exit 1; }

sess="codexgate_$$"   # no dot: tmux treats "." as a window.pane separator in -t
cleanup() { tmux kill-session -t "$sess" 2>/dev/null || true; }
trap cleanup EXIT
tmux kill-session -t "$sess" 2>/dev/null || true
# Launch from $HOME, not the repo: /status is account-level (cwd-independent), and
# starting inside a git repo triggers codex's interactive directory-trust prompt.
tmux new-session -d -s "$sess" -c "$HOME" -x 200 -y 55 "$CODEX_BIN" || { log "tmux session failed"; exit 1; }

pane=""
ready=0
# Wait for the TUI to be interactive. Key off the ASCII "model: ...gpt" line in
# the header box (no multibyte chars to match). When Codex presents an update
# prompt, accept the selected "Update now" option once so the unattended usage
# gate does not wedge until someone presses Enter by hand.
update_started=0
continue_sent=0
deadline=$((SECONDS + CODEX_READY_TIMEOUT))
while [ "$SECONDS" -lt "$deadline" ]; do
  sleep 2
  pane="$(tmux capture-pane -t "$sess" -p 2>/dev/null || true)"
  if printf '%s' "$pane" | grep -qiE 'Update available!|Update now'; then
    if [ "$CODEX_AUTO_UPDATE" = "true" ] && [ "$update_started" = "0" ]; then
      log "codex update prompt detected — accepting update"
      tmux send-keys -t "$sess" Enter
      update_started=1
      continue
    fi
    if [ "$CODEX_AUTO_UPDATE" != "true" ]; then
      log "codex update prompt detected but CODEX_AUTO_UPDATE=$CODEX_AUTO_UPDATE"
      exit 1
    fi
  fi
  if [ "$update_started" = "1" ] && [ "$continue_sent" = "0" ] \
     && printf '%s' "$pane" | grep -qiE 'Press enter to continue' \
     && ! printf '%s' "$pane" | grep -qiE 'Update available!|Update now'; then
    log "codex update completed — continuing to TUI"
    tmux send-keys -t "$sess" Enter
    continue_sent=1
    continue
  fi
  printf '%s' "$pane" | grep -qiE 'updating|downloading|fetching|upgrade|installing' && continue
  printf '%s' "$pane" | grep -qiE 'model:.*gpt' && { ready=1; break; }
done
[ "$ready" = 1 ] || { log "codex TUI not ready in time. last pane: $(printf '%s' "$pane" | tr '\n' '|' | cut -c1-280)"; exit 1; }
sleep 3   # let the input composer take focus

tmux send-keys -t "$sess" -l '/status'; sleep 1
tmux send-keys -t "$sess" Enter; sleep 1
tmux send-keys -t "$sess" Enter            # slash-autocomplete can eat the first Enter

for _ in $(seq 1 12); do
  sleep 2
  pane="$(tmux capture-pane -t "$sess" -p 2>/dev/null || true)"
  printf '%s' "$pane" | grep -qiE 'limit:.*% left' && break
done

# Parse "NN% left" from the 5h and weekly limit lines.
grab() { printf '%s\n' "$pane" | grep -iE "$1" | grep -oE '[0-9]+% left' | grep -oE '[0-9]+' | head -1; }
five="$(grab '5h limit')"
week="$(grab 'weekly limit')"

case "$GATE_WINDOW" in
  session) rem="$five" ;;
  week)    rem="$week" ;;
  both)    rem="$five"
           if [ -n "$week" ] && { [ -z "$rem" ] || [ "$week" -lt "$rem" ]; }; then rem="$week"; fi ;;
  *) log "unknown GATE_WINDOW='$GATE_WINDOW'"; exit 1 ;;
esac

if [ -z "${rem:-}" ]; then
  log "could not read codex /status (5h='${five:-}' weekly='${week:-}')"; exit 1
fi
log "codex remaining: window=$GATE_WINDOW rem=${rem}% (5h=${five:-?}% weekly=${week:-?}%)"
echo "$rem"
