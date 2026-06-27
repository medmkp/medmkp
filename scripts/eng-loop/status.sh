#!/usr/bin/env bash
# scripts/eng-loop/status.sh — one-screen status for the engineering quality loop.
#
# Read-only. Fans out a SINGLE ssh call to the NUC (crontab, logs, worktrees,
# usage diagnostics) plus local `gh` calls (open loop PRs, issue backlog), and
# prints a compact colored summary: liveness · current run · recent ticks ·
# open loop PRs · backlog · log tail. Degrades gracefully when the NUC is offline
# (prints "NUC unreachable" and still shows the GitHub-side data).
#
# Usage: status.sh [-n N] [--no-color] [--html [PATH]] [-h]
#   -n N         lines of cron.log to tail (default 14)
#   --no-color   disable ANSI color
#   --html PATH  emit a self-contained, auto-refreshing HTML page (to PATH, or
#                stdout if PATH omitted) instead of the terminal view
#
# Env: NUC_HOST (default nuc) · NUC_LOOP_HOME (default ~/eng-loop on the NUC) ·
#      LOOP_REPO (from config.env; default tracedds/tracedds).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[ -f "$here/config.env" ] && . "$here/config.env"

NUC_HOST="${NUC_HOST:-nuc}"
NUC_LOOP_HOME="${NUC_LOOP_HOME:-}"        # empty → remote defaults to $HOME/eng-loop
LOOP_REPO="${LOOP_REPO:-tracedds/tracedds}"
GATE_THRESHOLD="${GATE_THRESHOLD:-50}"
TAIL_N=14
USE_COLOR=1
HTML=0; HTML_PATH=""
TAIL_HIST=300                              # cron.log lines pulled for tick-history parse

while [ $# -gt 0 ]; do case "$1" in
  -n) TAIL_N="${2:-14}"; shift 2 ;;
  --no-color) USE_COLOR=0; shift ;;
  --html) HTML=1; shift; if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then HTML_PATH="$1"; shift; fi ;;
  -h|--help) awk 'NR>1 && /^#/{sub(/^# ?/,"");print;next} NR>1{exit}' "$0"; exit 0 ;;
  *) echo "unknown flag: $1" >&2; exit 2 ;;
esac; done
[ "$TAIL_N" -gt "$TAIL_HIST" ] && TAIL_HIST="$TAIL_N"

# --- HTML mode: re-render the terminal view (forced color) → static page -----
# Reuses the whole renderer; only the ANSI→HTML wrapping is HTML-specific (DRY).
if [ "$HTML" = "1" ]; then
  E=$'\033'
  body="$(FORCE_COLOR=1 "$0" -n "$TAIL_N" 2>/dev/null | sed \
        -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' \
        -e "s/${E}\[1m/<span class='b'>/g"   -e "s/${E}\[2m/<span class='dim'>/g" \
        -e "s/${E}\[31m/<span class='red'>/g" -e "s/${E}\[32m/<span class='grn'>/g" \
        -e "s/${E}\[33m/<span class='yel'>/g" -e "s/${E}\[34m/<span class='blu'>/g" \
        -e "s/${E}\[36m/<span class='cyn'>/g" -e "s/${E}\[0m/<\/span>/g")"
  page="$(cat <<HTMLEOF
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>eng-loop status</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0d1117; color:#c9d1d9;
         font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .wrap { max-width:920px; margin:0 auto; padding:22px 18px 40px; }
  h1 { font-size:13px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
       color:#8b949e; margin:0 0 4px; }
  .dash { white-space:pre-wrap; word-break:break-word; margin:0; }
  footer { margin-top:18px; color:#6e7681; font-size:11.5px; }
  .b{color:#f0f6fc;font-weight:600} .dim{color:#6e7681} .red{color:#f85149}
  .grn{color:#3fb950} .yel{color:#d29922} .cyn{color:#39c5cf} .blu{color:#58a6ff}
</style></head><body><div class="wrap">
<h1>TraceDDS · eng-loop</h1>
<pre class="dash">$body</pre>
<footer>generated $(date '+%Y-%m-%d %H:%M:%S %Z') · this page auto-refreshes every 60s · read-only</footer>
</div></body></html>
HTMLEOF
)"
  if [ -n "$HTML_PATH" ]; then printf '%s\n' "$page" > "$HTML_PATH"; printf 'Wrote %s\n' "$HTML_PATH" >&2
  else printf '%s\n' "$page"; fi
  exit 0
fi

# --- colors -----------------------------------------------------------------
[ -t 1 ] || USE_COLOR=0
[ -n "${NO_COLOR:-}" ] && USE_COLOR=0
[ -n "${FORCE_COLOR:-}" ] && USE_COLOR=1
if [ "$USE_COLOR" = "1" ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; R=$'\033[0m'
  RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; CYN=$'\033[36m'; BLU=$'\033[34m'
else
  B=''; DIM=''; R=''; RED=''; GRN=''; YEL=''; CYN=''; BLU=''
fi
hdr() { printf '\n%s%s%s\n' "$B" "$1" "$R"; }

fmt_dur() {  # seconds → "1h 02m" / "5m 12s" / "9s"
  local s="$1"
  if [ "$s" -ge 3600 ]; then printf '%dh %02dm' $((s/3600)) $(((s%3600)/60))
  elif [ "$s" -ge 60 ]; then printf '%dm %02ds' $((s/60)) $((s%60))
  else printf '%ds' "$s"; fi
}

# --- 1. Fan out to the NUC (one ssh round-trip) -----------------------------
REMOTE='
H="${NUC_LOOP_HOME:-$HOME/eng-loop}"
echo "###hostname###"; hostname 2>/dev/null
echo "###now_epoch###"; date +%s
echo "###now_human###"; date "+%Y-%m-%d %H:%M:%S %Z"
echo "###cron###"; crontab -l 2>/dev/null | grep -F "# eng-loop"
echo "###pause###"; [ -f "$H/PAUSE" ] && echo yes || echo no
echo "###rotation###"; cat "$H/.rotation" 2>/dev/null
echo "###cronlog_mtime###"; stat -c %Y "$H/logs/cron.log" 2>/dev/null
echo "###worktrees###"; ls -1 "$H/worktrees/" 2>/dev/null
echo "###usage###"; tail -n 800 "$(ls -1t "$H"/logs/[0-9]*.log 2>/dev/null | head -1)" 2>/dev/null | grep -E "usage-gate|usage-codex" | tail -4
echo "###crontail###"; tail -n '"$TAIL_HIST"' "$H/logs/cron.log" 2>/dev/null
echo "###eof###"
'
BLOB="$(ssh -o ConnectTimeout=5 -o BatchMode=yes "$NUC_HOST" \
        "NUC_LOOP_HOME='$NUC_LOOP_HOME' bash -s" <<<"$REMOTE" 2>/dev/null)"
NUC_OK=0
printf '%s' "$BLOB" | grep -q '###eof###' && NUC_OK=1

section() { awk -v s="###$1###" '$0==s{f=1;next} /^###[a-z_]+###$/{f=0} f' <<<"$BLOB"; }

# --- 2. Liveness ------------------------------------------------------------
hdr "ENG-LOOP STATUS"
if [ "$NUC_OK" = "0" ]; then
  printf '  %sNUC (%s) unreachable%s — showing GitHub-side data only.\n' "$RED" "$NUC_HOST" "$R"
else
  host="$(section hostname)"
  now_epoch="$(section now_epoch)"; now_human="$(section now_human)"
  cron_line="$(section cron)"; pause="$(section pause)"; rotation="$(section rotation)"
  mtime="$(section cronlog_mtime)"
  worktrees="$(section worktrees | grep -c . || true)"

  printf '  %-14s %s%s%s  (%s)\n' "NUC:" "$GRN" "${host:-$NUC_HOST}" "$R" "$now_human"
  if [ -n "$cron_line" ]; then
    sched="$(printf '%s' "$cron_line" | grep -oE '^[^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+' || true)"
    printf '  %-14s %sinstalled%s  %s%s%s\n' "Cron:" "$GRN" "$R" "$DIM" "$sched" "$R"
  else
    printf '  %-14s %snot installed%s\n' "Cron:" "$RED" "$R"
  fi
  if [ "$pause" = "yes" ]; then
    printf '  %-14s %sPAUSED%s (PAUSE file present — next tick skips)\n' "Paused:" "$YEL" "$R"
  fi
  if [ -n "${mtime:-}" ] && [ -n "${now_epoch:-}" ]; then
    ago=$(( now_epoch - mtime ))
    printf '  %-14s %s ago\n' "Last activity:" "$(fmt_dur "$ago")"
  fi
  [ "${worktrees:-0}" -gt 0 ] && printf '  %-14s %s%s%s (one is normal during a run; >0 while idle = a stuck/crashed teardown)\n' \
    "Worktrees:" "$YEL" "$worktrees" "$R"
  [ -n "$rotation" ] && printf '  %-14s %s%s%s (next autonomous lane after this)\n' "Rotation:" "$DIM" "$rotation" "$R"

  # Usage diagnostics (parsed from the latest dated log; cheap, no re-gate).
  usage="$(section usage)"
  cl="$(printf '%s' "$usage" | grep -oE 'claude: window=[^ ]+ remaining=[0-9]+%' | grep -oE '[0-9]+%' | head -1)"
  cx="$(printf '%s' "$usage" | grep -oE 'codex remaining:.*rem=[0-9]+%' | grep -oE 'rem=[0-9]+%' | grep -oE '[0-9]+%' | head -1)"
  if [ -n "$cl" ] || [ -n "$cx" ]; then
    cln="${cl%\%}"
    cc="$YEL"; [ -n "$cln" ] && [ "$cln" -gt "$GATE_THRESHOLD" ] && cc="$GRN"
    printf '  %-14s Claude %s%s left%s (gate >%s%%)   Codex %s%s left%s\n' \
      "Usage:" "$cc" "${cl:-?}" "$R" "$GATE_THRESHOLD" "$CYN" "${cx:-?}" "$R"
  fi
fi

# --- 3. Tick history parse (current run + recent ticks) ---------------------
# One awk pass over the cron.log tail → TSV: time, engine, work, status, flags.
TICKS=""
if [ "$NUC_OK" = "1" ]; then
  TICKS="$(section crontail | awk '
    function flush() {
      if (!started) return
      printf "%s\t%s\t%s\t%s\t%s\n", t, eng, (work=="" ? "—" : work), (result=="" ? "(running)" : result), (ended ? "end" : "run")
    }
    /=== tick start/      { flush(); started=1; t=$1; eng="-"; work=""; result=""; ended=0; mode=""; pend_auto=0; rc=0 }
    /\[run-loop\] engine:/{ eng=$NF }
    /usage gate closed/   { mode="skip"; work="(skipped)"; result="usage gate closed"; ended=1 }
    /PAUSE file present/  { mode="skip"; work="(skipped)"; result="paused"; ended=1 }
    /holds the lock/      { mode="skip"; work="(skipped)"; result="locked (overlap)"; ended=1 }
    /no category.s prereq/{ mode="skip"; work="(skipped)"; result="no category ready"; ended=1 }
    /no enabled categories/{mode="skip"; work="(skipped)"; result="no categories"; ended=1 }
    /\[run-loop\] work: issue #/ {
      m=$0; sub(/.*work: issue #/,"",m); n=m; sub(/ .*/,"",n)
      ttl=m; sub(/^[0-9]+ — /,"",ttl); sub(/^[0-9]+ -- /,"",ttl)
      if (length(ttl)>46) ttl=substr(ttl,1,45) "…"
      mode="issue"; work="issue #" n ": " ttl
    }
    /work: no labeled issues/ { pend_auto=1 }
    /\[run-loop\] revise: PR #/   { m=$0; sub(/.*revise: PR #/,"",m); sub(/ .*/,"",m);   mode="revise";   work="revise PR #" m;   prn=m }
    /\[run-loop\] reconcile: PR #/{ m=$0; sub(/.*reconcile: PR #/,"",m); sub(/ .*/,"",m); mode="reconcile"; work="reconcile PR #" m; prn=m }
    /\[run-loop\] category:/ { if (pend_auto) { c=$4; mode="auto"; work="auto: " c } }
    /run exit=/ { m=$0; sub(/.*exit=/,"",m); sub(/ .*/,"",m); rc=m }
    /PR opened:/ { m=$0; sub(/.*pull\//,"",m); sub(/ .*/,"",m); prn=m; result="→ PR #" m }
    /no PR this tick/ { result="no PR (quiet)" }
    /=== tick end/ {
      ended=1
      if (result=="") {
        if (mode=="revise")      result="PR #" prn " revised"
        else if (mode=="reconcile") result="PR #" prn " reconciled"
        else result="no PR"
      }
      if (rc+0 != 0) result=result "  exit=" rc
    }
    END { flush() }
  ')"
fi

# Current run = last tick row whose flag is "run" (no tick-end yet).
CUR=""
if [ -n "$TICKS" ]; then
  last="$(printf '%s\n' "$TICKS" | tail -1)"
  flag="$(printf '%s' "$last" | awk -F'\t' '{print $5}')"
  [ "$flag" = "run" ] && CUR="$last"
fi

hdr "CURRENT RUN"
if [ "$NUC_OK" = "0" ]; then
  printf '  %s(NUC unreachable)%s\n' "$DIM" "$R"
elif [ -n "$CUR" ]; then
  ctime="$(printf '%s' "$CUR" | awk -F'\t' '{print $1}')"
  ceng="$(printf '%s' "$CUR"  | awk -F'\t' '{print $2}')"
  cwork="$(printf '%s' "$CUR" | awk -F'\t' '{print $3}')"
  el=""
  [ -n "${mtime:-}" ] && [ -n "${now_epoch:-}" ] && el="  ·  running $(fmt_dur $(( now_epoch - mtime )))"
  printf '  %s%s%s on %s%s%s%s started %s\n' "$B" "$cwork" "$R" "$CYN" "$ceng" "$R" "$el" "$ctime"
else
  printf '  %sidle%s — last tick complete; waiting for next cron fire.\n' "$GRN" "$R"
fi

# --- 4. Recent ticks --------------------------------------------------------
hdr "RECENT TICKS"
if [ "$NUC_OK" = "0" ]; then
  printf '  %s(NUC unreachable)%s\n' "$DIM" "$R"
elif [ -n "$TICKS" ]; then
  printf '%s\n' "$TICKS" | tail -10 | while IFS=$'\t' read -r t eng work result flag; do
    rc="$GRN"
    case "$result" in
      *"no PR"*|*"skipped"*|*"quiet"*) rc="$DIM" ;;
      *"exit="[1-9]*|*"locked"*)       rc="$RED" ;;
      *"revised"*|*"reconciled"*)      rc="$BLU" ;;
    esac
    [ "$flag" = "run" ] && rc="$CYN" && result="…running"
    engc="$DIM"; [ "$eng" = "codex" ] && engc="$YEL"
    printf '  %s%s%s %s%-6s%s %-50.50s %s%s%s\n' "$DIM" "$t" "$R" "$engc" "$eng" "$R" "$work" "$rc" "$result" "$R"
  done
else
  printf '  %sno ticks in the last %s log lines%s\n' "$DIM" "$TAIL_HIST" "$R"
fi

# --- 5. Open loop PRs (local gh) --------------------------------------------
hdr "OPEN LOOP PRs"
prs="$(gh pr list --repo "$LOOP_REPO" --state open --limit 100 \
        --json number,title,headRefName,mergeable,reviewDecision,statusCheckRollup 2>/dev/null)"
if [ -z "$prs" ]; then
  printf '  %s(could not query GitHub — is `gh` authed?)%s\n' "$RED" "$R"
else
  rows="$(printf '%s' "$prs" | jq -r '
    [ .[] | select(.headRefName|startswith("eng-loop-")) ] | sort_by(.number) | .[] |
    (.statusCheckRollup // []) as $c
    | ($c|map(select(.conclusion=="FAILURE" or .conclusion=="TIMED_OUT" or .conclusion=="CANCELLED" or .state=="FAILURE" or .state=="ERROR"))|length) as $fail
    | ($c|map(select(.status=="IN_PROGRESS" or .status=="QUEUED" or .status=="PENDING" or .state=="PENDING"))|length) as $pend
    | (if ($c|length)==0 then "none" elif $fail>0 then "FAIL" elif $pend>0 then "pending" else "pass" end) as $ci
    | (.headRefName | sub("^eng-loop-";"") | sub("-[0-9]{8}-[0-9]{6}$";"")) as $cat
    | [ .number, (.mergeable//"UNKNOWN"), (.reviewDecision|if .==null or .=="" then "REVIEW_REQUIRED" else . end), $ci, $cat, .title ] | @tsv')"
  if [ -z "$rows" ]; then
    printf '  %snone open%s\n' "$DIM" "$R"
  else
    printf '  %s%-5s %-12s %-18s %-8s %-11s %s%s\n' "$DIM" "PR" "MERGE" "REVIEW" "CI" "LANE" "TITLE" "$R"
    printf '%s\n' "$rows" | while IFS=$'\t' read -r num merge review ci cat title; do
      mc="$GRN"; [ "$merge" = "CONFLICTING" ] && mc="$RED"; [ "$merge" = "UNKNOWN" ] && mc="$DIM"
      rv="$review"; rvc="$DIM"
      case "$review" in
        CHANGES_REQUESTED) rv="CHANGES_REQUESTED"; rvc="$YEL" ;;
        APPROVED)          rvc="$GRN" ;;
        REVIEW_REQUIRED|"") rv="review required"; rvc="$DIM" ;;
      esac
      cic="$GRN"; case "$ci" in FAIL) cic="$RED";; pending) cic="$YEL";; none) cic="$DIM";; esac
      [ ${#title} -gt 42 ] && title="${title:0:41}…"
      printf '  %s#%-4s%s %s%-12s%s %s%-18s%s %s%-8s%s %-11s %s\n' \
        "$B" "$num" "$R" "$mc" "$merge" "$R" "$rvc" "$rv" "$R" "$cic" "$ci" "$R" "$cat" "$title"
    done
  fi
fi

# --- 6. Backlog (local gh) --------------------------------------------------
hdr "BACKLOG"
count_label() { gh issue list --repo "$LOOP_REPO" --state open --label "$1" --json number --jq 'length' 2>/dev/null || echo "?"; }
queued="$(gh issue list --repo "$LOOP_REPO" --state open --limit 30 \
          --search 'is:open label:eng-loop,qa' --json number,title 2>/dev/null)"
nd="$(count_label needs-design)"
dq="$(count_label data-quality)"
qn="$(printf '%s' "$queued" | jq 'length' 2>/dev/null || echo 0)"
printf '  %sLoopable (eng-loop/qa, queued newest-first):%s %s%s%s\n' "$DIM" "$R" "$B" "${qn:-0}" "$R"
if [ "${qn:-0}" != "0" ]; then
  printf '%s' "$queued" | jq -r 'sort_by(-.number) | .[:6][] | "    #\(.number)  \(.title)"' 2>/dev/null \
    | while IFS= read -r l; do [ ${#l} -gt 64 ] && l="${l:0:63}…"; printf '%s%s%s\n' "$DIM" "$l" "$R"; done
fi
printf '  %sBlocked (needs-design):%s %s%s%s    %sdata-quality:%s %s\n' \
  "$DIM" "$R" "$YEL" "$nd" "$R" "$DIM" "$R" "$dq"

# --- 7. Log tail ------------------------------------------------------------
hdr "cron.log (last $TAIL_N)"
if [ "$NUC_OK" = "0" ]; then
  printf '  %s(NUC unreachable)%s\n' "$DIM" "$R"
else
  section crontail | tail -n "$TAIL_N" | sed "s/^/  ${DIM}/; s/\$/${R}/"
fi
echo
