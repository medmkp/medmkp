#!/usr/bin/env bash
# Gate the engineering loop on Claude Code usage.
#
# Reads the REAL usage numbers from `claude -p "/usage"` (the only source — there
# is no usage API, subcommand or JSON flag as of CLI v2.1.x) and exits 0 only
# when more than GATE_THRESHOLD% of the chosen window REMAINS.
#
# Fails CLOSED: if a number can't be parsed (not authed, panel changed, timeout)
# it exits non-zero so the loop SKIPS rather than running blind on the budget.
#
# Exit: 0 = proceed (enough budget) · 1 = skip (low budget or unreadable)
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[ -f "$here/config.env" ] && . "$here/config.env"

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
GATE_THRESHOLD="${GATE_THRESHOLD:-50}"
GATE_WINDOW="${GATE_WINDOW:-week}"

log() { printf '[usage-gate] %s\n' "$*" >&2; }

# Capture the /usage panel as plain text (strip ANSI escapes + CRs).
raw="$(timeout 90 "$CLAUDE_BIN" -p "/usage" 2>&1 \
  | sed -E 's/\x1b\[[0-9;?]*[a-zA-Z]//g' | tr -d '\r')" || true

# Echo the integer "% used" from the first line matching the given label.
parse_used() {
  printf '%s\n' "$raw" | grep -iE "$1" | grep -oE '[0-9]+% used' \
    | grep -oE '[0-9]+' | head -1
}

week_used="$(parse_used 'Current week')"
session_used="$(parse_used 'Current session')"

case "$GATE_WINDOW" in
  week)    used="$week_used" ;;
  session) used="$session_used" ;;
  both)    # most-constrained window governs (highest % used)
    used="$week_used"
    if [ -n "$session_used" ] && { [ -z "$used" ] || [ "$session_used" -gt "$used" ]; }; then
      used="$session_used"
    fi ;;
  *) log "unknown GATE_WINDOW='$GATE_WINDOW'"; exit 1 ;;
esac

if [ -z "${used:-}" ]; then
  log "FAIL-CLOSED: could not read usage (week='${week_used:-}' session='${session_used:-}'). Skipping."
  exit 1
fi

remaining=$(( 100 - used ))
log "window=$GATE_WINDOW used=${used}% remaining=${remaining}% (need >${GATE_THRESHOLD}%) [week=${week_used:-?}% session=${session_used:-?}%]"

if [ "$remaining" -gt "$GATE_THRESHOLD" ]; then
  log "PROCEED"
  exit 0
fi
log "SKIP: only ${remaining}% remaining"
exit 1
