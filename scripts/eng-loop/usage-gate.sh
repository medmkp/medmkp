#!/usr/bin/env bash
# Engine selection for the engineering loop, gated on usage.
#
# Prefers Claude when its remaining usage > GATE_THRESHOLD (read from
# `claude -p "/usage"`); otherwise falls back to Codex when its remaining
# > CODEX_THRESHOLD (read from the codex TUI /status panel via usage-codex.sh);
# otherwise skips the tick.
#
# Prints the chosen engine ("claude" | "codex") to STDOUT and exits 0. Prints
# nothing and exits 1 when no engine has budget. All diagnostics go to stderr.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[ -f "$here/config.env" ] && . "$here/config.env"

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
GATE_THRESHOLD="${GATE_THRESHOLD:-50}"      # Claude: min % remaining to use Claude
GATE_WINDOW="${GATE_WINDOW:-both}"
CODEX_ENABLED="${CODEX_ENABLED:-true}"
CODEX_THRESHOLD="${CODEX_THRESHOLD:-25}"    # Codex: min % remaining to fall back

log() { printf '[usage-gate] %s\n' "$*" >&2; }

# --- Claude remaining (from `claude -p "/usage"`, which prints "% used") ------
raw="$(timeout 90 "$CLAUDE_BIN" -p "/usage" 2>&1 \
  | sed -E 's/\x1b\[[0-9;?]*[a-zA-Z]//g' | tr -d '\r')" || true
parse_used() { printf '%s\n' "$raw" | grep -iE "$1" | grep -oE '[0-9]+% used' | grep -oE '[0-9]+' | head -1; }
week_used="$(parse_used 'Current week')"
session_used="$(parse_used 'Current session')"

case "$GATE_WINDOW" in
  week)    used="$week_used" ;;
  session) used="$session_used" ;;
  both)    used="$week_used"
           if [ -n "$session_used" ] && { [ -z "${used:-}" ] || [ "$session_used" -gt "$used" ]; }; then used="$session_used"; fi ;;
  *) log "unknown GATE_WINDOW='$GATE_WINDOW'"; exit 1 ;;
esac

if [ -n "${used:-}" ]; then
  claude_remaining=$(( 100 - used ))
  log "claude: window=$GATE_WINDOW remaining=${claude_remaining}% (need >${GATE_THRESHOLD}%) [week=${week_used:-?}% session=${session_used:-?}%]"
  if [ "$claude_remaining" -gt "$GATE_THRESHOLD" ]; then
    echo "claude"; exit 0
  fi
else
  log "claude usage unreadable — treating as not-enough and considering fallback"
fi

# --- Codex fallback (TUI /status via usage-codex.sh) -------------------------
if [ "${CODEX_ENABLED}" = "true" ]; then
  log "claude not >${GATE_THRESHOLD}% — checking Codex fallback…"
  codex_remaining="$("$here/usage-codex.sh")" || codex_remaining=""
  if [ -n "$codex_remaining" ]; then
    if [ "$codex_remaining" -gt "$CODEX_THRESHOLD" ]; then
      log "→ codex (${codex_remaining}% remaining > ${CODEX_THRESHOLD}%)"
      echo "codex"; exit 0
    fi
    log "codex only ${codex_remaining}% remaining (need >${CODEX_THRESHOLD}%)"
  fi
else
  log "codex fallback disabled (CODEX_ENABLED=$CODEX_ENABLED)"
fi

log "SKIP: no engine has budget"
exit 1
