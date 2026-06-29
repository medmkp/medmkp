#!/usr/bin/env bash
# scripts/eng-loop/status.sh — one-screen status for the engineering quality loop.
#
# Read-only. Fans out a SINGLE ssh call to the NUC (crontab, logs, worktrees,
# usage diagnostics) plus local `gh` calls (loop PRs created recently, open loop
# PRs, issue backlog), and renders a compact summary: liveness · current run ·
# PRs created · recent ticks · open PRs · backlog · log tail. Degrades gracefully
# when the NUC is offline (shows "NUC unreachable" + the GitHub-side data).
#
# Two renderers share one data-gathering pass (DRY):
#   • terminal — colored one-screen summary (default)
#   • --html   — a self-contained, auto-refreshing card dashboard
#
# Usage: status.sh [-n N] [--no-color] [--html [PATH]] [--local] [-h]
#   -n N         lines of cron.log to tail (default 14)
#   --no-color   disable ANSI color
#   --html PATH  emit a self-contained, auto-refreshing HTML dashboard (to PATH,
#                or stdout if PATH omitted) instead of the terminal view
#   --local      gather NUC data by running locally instead of over ssh — use
#                when this script IS running on the NUC (e.g. the status server)
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
# Labels the loop drains, in pick priority order (mirrors run-loop.sh). Sourced
# from config.env when present; fallback keeps the queue view working standalone.
ISSUE_LABELS="${ISSUE_LABELS:-eng-loop,qa,eng-loop:qa,eng-loop:qa-design,eng-loop:backend,eng-loop:architecture}"
TAIL_N=14
USE_COLOR=1
HTML=0; HTML_PATH=""
LOCAL=0
TAIL_HIST=300                              # cron.log lines pulled for tick-history parse

while [ $# -gt 0 ]; do case "$1" in
  -n) TAIL_N="${2:-14}"; shift 2 ;;
  --no-color) USE_COLOR=0; shift ;;
  --local) LOCAL=1; shift ;;
  --html) HTML=1; shift; if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then HTML_PATH="$1"; shift; fi ;;
  -h|--help) awk 'NR>1 && /^#/{sub(/^# ?/,"");print;next} NR>1{exit}' "$0"; exit 0 ;;
  *) echo "unknown flag: $1" >&2; exit 2 ;;
esac; done
[ "$TAIL_N" -gt "$TAIL_HIST" ] && TAIL_HIST="$TAIL_N"

# --- colors (terminal renderer only) ----------------------------------------
[ -t 1 ] || USE_COLOR=0
[ -n "${NO_COLOR:-}" ] && USE_COLOR=0
[ -n "${FORCE_COLOR:-}" ] && USE_COLOR=1
[ "$HTML" = "1" ] && USE_COLOR=0
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
esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }  # HTML-escape stdin
e() { printf '%s' "$1" | esc; }                                     # HTML-escape an arg

# ============================================================================
#  DATA GATHERING (runs once; both renderers consume the variables it sets)
# ============================================================================

# --- 1. Fan out to the NUC (one ssh round-trip) -----------------------------
REMOTE='
H="${NUC_LOOP_HOME:-$HOME/eng-loop}"
echo "###hostname###"; hostname 2>/dev/null
echo "###now_epoch###"; date +%s
echo "###now_human###"; date "+%Y-%m-%d %H:%M:%S %Z"
echo "###cron###"; crontab -l 2>/dev/null | grep -F "# eng-loop"
echo "###pause###"; [ -f "$H/PAUSE" ] && echo yes || echo no
echo "###rotation###"; cat "$H/.rotation" 2>/dev/null
echo "###health###"; bash "$H/checkout/scripts/eng-loop/health.sh" json 2>/dev/null
echo "###cronlog_mtime###"; stat -c %Y "$H/logs/cron.log" 2>/dev/null
echo "###worktrees###"; ls -1 "$H/worktrees/" 2>/dev/null
echo "###usage###"; tail -n 800 "$(ls -1t "$H"/logs/[0-9]*.log 2>/dev/null | head -1)" 2>/dev/null | grep -E "usage-gate|usage-codex" | tail -4
echo "###crontail###"; tail -n '"$TAIL_HIST"' "$H/logs/cron.log" 2>/dev/null
echo "###eof###"
'
if [ "$LOCAL" = "1" ]; then               # running ON the NUC: gather locally, no ssh
  BLOB="$(NUC_LOOP_HOME="$NUC_LOOP_HOME" bash -s <<<"$REMOTE" 2>/dev/null)"
else
  BLOB="$(ssh -o ConnectTimeout=5 -o BatchMode=yes "$NUC_HOST" \
          "NUC_LOOP_HOME='$NUC_LOOP_HOME' bash -s" <<<"$REMOTE" 2>/dev/null)"
fi
NUC_OK=0
printf '%s' "$BLOB" | grep -q '###eof###' && NUC_OK=1

section() { awk -v s="###$1###" '$0==s{f=1;next} /^###[a-z_]+###$/{f=0} f' <<<"$BLOB"; }

# --- 2. Liveness vars -------------------------------------------------------
host=""; now_epoch=""; now_human=""; sched=""; pause="no"; rotation=""
mtime=""; ago=""; worktrees=0; hv=""; hd=""; cl=""; cx=""
if [ "$NUC_OK" = "1" ]; then
  host="$(section hostname)"
  now_epoch="$(section now_epoch)"; now_human="$(section now_human)"
  cron_line="$(section cron)"; pause="$(section pause)"; rotation="$(section rotation)"
  mtime="$(section cronlog_mtime)"
  worktrees="$(section worktrees | grep -c . || true)"
  [ -n "$cron_line" ] && sched="$(printf '%s' "$cron_line" | grep -oE '^[^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+' || true)"
  [ -n "${mtime:-}" ] && [ -n "${now_epoch:-}" ] && ago=$(( now_epoch - mtime ))

  health_json="$(section health)"
  hv="$(printf '%s' "$health_json" | grep -oE '"verdict":[[:space:]]*"[A-Z]+"' | grep -oE '[A-Z]+' | head -1)"
  hd="$(printf '%s' "$health_json" | sed -nE 's/.*"detail":[[:space:]]*"([^"]*)".*/\1/p' | head -1)"

  usage="$(section usage)"
  cl="$(printf '%s' "$usage" | grep -oE 'claude: window=[^ ]+ remaining=[0-9]+%' | grep -oE '[0-9]+%' | head -1)"
  cx="$(printf '%s' "$usage" | grep -oE 'codex remaining:.*rem=[0-9]+%' | grep -oE 'rem=[0-9]+%' | grep -oE '[0-9]+%' | head -1)"
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
CUR=""; ctime=""; ceng=""; cwork=""
if [ -n "$TICKS" ]; then
  last="$(printf '%s\n' "$TICKS" | tail -1)"
  flag="$(printf '%s' "$last" | awk -F'\t' '{print $5}')"
  if [ "$flag" = "run" ]; then
    CUR="$last"
    ctime="$(printf '%s' "$CUR" | awk -F'\t' '{print $1}')"
    ceng="$(printf '%s' "$CUR"  | awk -F'\t' '{print $2}')"
    cwork="$(printf '%s' "$CUR" | awk -F'\t' '{print $3}')"
  fi
fi

# --- 4. PRs created recently (local gh; merged/open/closed) -----------------
recent_prs="$(gh pr list --repo "$LOOP_REPO" --state all --limit 80 \
        --json number,title,state,createdAt,mergedAt,headRefName,url 2>/dev/null)"
RECENT_PR_ROWS="$(printf '%s' "$recent_prs" | jq -r '
  [ .[] | select(.headRefName|startswith("eng-loop-")) ]
  | sort_by(.createdAt) | reverse | .[:8][]
  | (.headRefName | sub("^eng-loop-";"") | sub("-[0-9]{8}-[0-9]{6}$";"")) as $cat
  | [ .number, (if .mergedAt then "MERGED" else .state end), $cat, .title ] | @tsv' 2>/dev/null)"

# --- 5. Open loop PRs (local gh) --------------------------------------------
prs="$(gh pr list --repo "$LOOP_REPO" --state open --limit 100 \
        --json number,title,headRefName,mergeable,reviewDecision,statusCheckRollup,closingIssuesReferences 2>/dev/null)"
PR_ROWS=""
GH_OK=1; [ -z "$prs" ] && GH_OK=0
if [ "$GH_OK" = "1" ]; then
  PR_ROWS="$(printf '%s' "$prs" | jq -r '
    [ .[] | select(.headRefName|startswith("eng-loop-")) ] | sort_by(.number) | .[] |
    (.statusCheckRollup // []) as $c
    | ($c|map(select(.conclusion=="FAILURE" or .conclusion=="TIMED_OUT" or .conclusion=="CANCELLED" or .state=="FAILURE" or .state=="ERROR"))|length) as $fail
    | ($c|map(select(.status=="IN_PROGRESS" or .status=="QUEUED" or .status=="PENDING" or .state=="PENDING"))|length) as $pend
    | (if ($c|length)==0 then "none" elif $fail>0 then "FAIL" elif $pend>0 then "pending" else "pass" end) as $ci
    | (.headRefName | sub("^eng-loop-";"") | sub("-[0-9]{8}-[0-9]{6}$";"")) as $cat
    | [ .number, (.mergeable//"UNKNOWN"), (.reviewDecision|if .==null or .=="" then "REVIEW_REQUIRED" else . end), $ci, $cat, .title ] | @tsv')"
fi

# --- 6. Work queue + backlog (local gh) -------------------------------------
count_label() { gh issue list --repo "$LOOP_REPO" --state open --label "$1" --json number --jq 'length' 2>/dev/null || echo "?"; }

# Issues already in flight (covered by an open loop PR) — the loop skips these.
COVERED_JSON="$(printf '%s' "$prs" | jq -c '[.[].closingIssuesReferences[]?.number] | unique' 2>/dev/null)"
[ -z "$COVERED_JSON" ] && COVERED_JSON='[]'

# The work queue in the loop's REAL pick order (mirrors run-loop.sh §6):
# ISSUE_LABELS priority, then newest-created first within a label, deduped across
# labels, excluding covered issues. One TSV row per issue: pos, number, label, title.
all_open_issues="$(gh issue list --repo "$LOOP_REPO" --state open --limit 100 \
                   --json number,title,labels,createdAt 2>/dev/null)"
QUEUE_ROWS="$(printf '%s' "$all_open_issues" | jq -r \
  --arg labels "$ISSUE_LABELS" --argjson covered "$COVERED_JSON" '
  ($labels | split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length>0))) as $order
  | . as $issues
  | ( reduce $order[] as $l ([];
        . + ( [ $issues[]
                | select(.labels | any(.name == $l))
                | select([.number] | inside($covered) | not)
                | {number, title, label: $l, createdAt} ]
              | sort_by(.createdAt) | reverse ) ) ) as $ranked
  | reduce $ranked[] as $x ({seen:{}, out:[]};
        if .seen[($x.number|tostring)] then .
        else {seen: (.seen + {($x.number|tostring): true}), out: (.out + [$x])} end)
  | .out | to_entries[]
  | "\(.key + 1)\t\(.value.number)\t\(.value.label)\t\(.value.title)"
  ' 2>/dev/null)"
qn="$(printf '%s' "$QUEUE_ROWS" | grep -c . || true)"
nd="$(count_label needs-design)"
dq="$(count_label data-quality)"

# ============================================================================
#  HTML RENDERER (card dashboard)
# ============================================================================
if [ "$HTML" = "1" ]; then
  # health badge class
  case "$hv" in OK) hclass=ok ;; DEGRADED) hclass=warn ;; STALLED|DOWN) hclass=bad ;; *) hclass=mut ;; esac

  # status chips
  chips=""
  if [ "$NUC_OK" = "0" ]; then
    chips+="<span class='chip bad'>NUC ($(e "$NUC_HOST")) unreachable</span>"
  else
    [ -n "$hv" ] && chips+="<span class='chip $hclass'>$(e "$hv")</span>"
    chips+="<span class='chip'>NUC $(e "${host:-$NUC_HOST}")</span>"
    if [ -n "$sched" ]; then chips+="<span class='chip ok'>cron $(e "$sched")</span>"
    else chips+="<span class='chip bad'>cron not installed</span>"; fi
    [ "$pause" = "yes" ] && chips+="<span class='chip warn'>PAUSED</span>"
    [ -n "$ago" ] && chips+="<span class='chip'>last activity $(e "$(fmt_dur "$ago")") ago</span>"
    [ "${worktrees:-0}" -gt 0 ] && chips+="<span class='chip warn'>${worktrees} worktree(s)</span>"
    [ -n "$rotation" ] && chips+="<span class='chip mut'>next lane: $(e "$rotation")</span>"
    if [ -n "$cl" ]; then
      cln="${cl%\%}"; ucls=warn; [ -n "$cln" ] && [ "$cln" -gt "$GATE_THRESHOLD" ] && ucls=ok
      chips+="<span class='chip $ucls'>Claude $(e "$cl") left</span>"
    fi
    [ -n "$cx" ] && chips+="<span class='chip'>Codex $(e "$cx") left</span>"
  fi

  # current run line
  if [ "$NUC_OK" = "0" ]; then cur_html="<span class='mut'>NUC unreachable</span>"
  elif [ -n "$CUR" ]; then
    el=""; [ -n "$ago" ] && el=" · running $(fmt_dur "$ago")"
    cur_html="<b>$(e "$cwork")</b> on <span class='cyn'>$(e "$ceng")</span> · started $(e "$ctime")$(e "$el")"
  else cur_html="<span class='ok'>idle</span> — last tick complete; waiting for next cron fire."; fi

  # PRs created recently
  recent_html=""
  if [ -n "$RECENT_PR_ROWS" ]; then
    while IFS=$'\t' read -r num state cat title; do
      [ -z "$num" ] && continue
      case "$state" in MERGED) sc=ok ;; OPEN) sc=blu ;; CLOSED) sc=mut ;; *) sc=mut ;; esac
      recent_html+="<li><a href='https://github.com/$LOOP_REPO/pull/$num' target='_blank'>#$num</a> <span class='pill $sc'>$(e "$state")</span> <span class='cat'>$(e "$cat")</span> <span class='t'>$(e "$title")</span></li>"
    done <<EOF
$RECENT_PR_ROWS
EOF
  else recent_html="<li class='mut'>no loop PRs found</li>"; fi

  # open PRs (awaiting review)
  open_html=""
  if [ "$GH_OK" = "0" ]; then open_html="<li class='bad'>could not query GitHub (is gh authed?)</li>"
  elif [ -n "$PR_ROWS" ]; then
    while IFS=$'\t' read -r num merge review ci cat title; do
      [ -z "$num" ] && continue
      mc=ok; [ "$merge" = "CONFLICTING" ] && mc=bad; [ "$merge" = "UNKNOWN" ] && mc=mut
      case "$review" in CHANGES_REQUESTED) rv="changes requested"; rvc=warn ;; APPROVED) rv=approved; rvc=ok ;; *) rv="review required"; rvc=mut ;; esac
      case "$ci" in FAIL) cic=bad ;; pending) cic=warn ;; none) cic=mut ;; *) cic=ok ;; esac
      open_html+="<li><a href='https://github.com/$LOOP_REPO/pull/$num' target='_blank'>#$num</a> <span class='pill $mc'>$(e "$merge")</span> <span class='pill $rvc'>$(e "$rv")</span> <span class='pill $cic'>CI $(e "$ci")</span> <span class='cat'>$(e "$cat")</span><br><span class='t'>$(e "$title")</span></li>"
    done <<EOF
$PR_ROWS
EOF
  else open_html="<li class='mut'>none open — all created PRs merged or closed</li>"; fi

  # work queue (real pick order) + backlog counts
  backlog_html="<div class='kv'><span>Queued · next-up order</span><b>${qn:-0}</b></div>"
  if [ "${qn:-0}" != "0" ]; then
    backlog_html+="<ol class='queue'>"
    n=0
    while IFS=$'\t' read -r pos num label title; do
      [ -z "$num" ] && continue
      n=$((n+1)); [ "$n" -gt 15 ] && continue
      backlog_html+="<li><span class='pos'>${pos}</span><a href='https://github.com/$LOOP_REPO/issues/$num' target='_blank'>#$num</a> <span class='cat'>$(e "$label")</span> <span class='t'>$(e "$title")</span></li>"
    done <<EOF
$QUEUE_ROWS
EOF
    [ "${qn:-0}" -gt 15 ] && backlog_html+="<li class='mut'>… +$((qn-15)) more</li>"
    backlog_html+="</ol>"
  else
    rot_note=""; [ -n "$rotation" ] && rot_note=" (next: $(e "$rotation"))"
    backlog_html+="<div class='mut' style='padding:5px 0 8px'>queue empty — drawing from autonomous rotation${rot_note}</div>"
  fi
  backlog_html+="<div class='kv'><span>Blocked · needs-design</span><b class='warn'>${nd}</b></div>"
  backlog_html+="<div class='kv'><span>data-quality</span><b>${dq}</b></div>"

  # recent ticks table + failure tally
  ticks_html=""; fail_n=0
  if [ "$NUC_OK" = "0" ]; then ticks_html="<tr><td class='mut' colspan='4'>NUC unreachable</td></tr>"
  elif [ -n "$TICKS" ]; then
    while IFS=$'\t' read -r t eng work result flag; do
      [ -z "$t" ] && continue
      rc=ok
      case "$result" in
        *"no PR"*|*"skipped"*|*"quiet"*) rc=mut ;;
        *"exit="[1-9]*|*"locked"*)       rc=bad; fail_n=$((fail_n+1)) ;;
        *"revised"*|*"reconciled"*)      rc=blu ;;
      esac
      [ "$flag" = "run" ] && { rc=cyn; result="…running"; }
      engc=mut; [ "$eng" = "codex" ] && engc=warn
      ticks_html+="<tr><td class='mut'>$(e "$t")</td><td class='$engc'>$(e "$eng")</td><td>$(e "$work")</td><td class='$rc'>$(e "$result")</td></tr>"
    done < <(printf '%s\n' "$TICKS" | tail -10)
  else ticks_html="<tr><td class='mut' colspan='4'>no ticks in the last $TAIL_HIST log lines</td></tr>"; fi

  # attention banner (failures in recent ticks + conflicting/failing open PRs)
  attn=""
  pr_fail="$(printf '%s' "$PR_ROWS" | awk -F'\t' '$2=="CONFLICTING" || $4=="FAIL"{n++} END{print n+0}')"
  [ "$fail_n" -gt 0 ] && attn+="<span class='chip bad'>$fail_n recent tick failure(s)</span>"
  [ "${pr_fail:-0}" -gt 0 ] && attn+="<span class='chip bad'>$pr_fail open PR(s) conflicting / CI-failing</span>"
  [ -z "$attn" ] && attn="<span class='chip ok'>no failures in view</span>"

  # log tail
  logtail_html="$(section crontail | tail -n "$TAIL_N" | esc)"
  [ "$NUC_OK" = "0" ] && logtail_html="(NUC unreachable)"

  gen="$(date '+%Y-%m-%d %H:%M:%S %Z')"
  page="$(cat <<HTMLEOF
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>eng-loop dashboard</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0d1117; color:#c9d1d9;
         font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  a { color:#58a6ff; text-decoration:none; } a:hover { text-decoration:underline; }
  .wrap { max-width:1040px; margin:0 auto; padding:22px 18px 48px; }
  h1 { font-size:13px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#8b949e; margin:0 0 12px; }
  .bar { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px; }
  .chip { display:inline-block; padding:2px 9px; border-radius:999px; background:#161b22; border:1px solid #30363d; color:#c9d1d9; font-size:11.5px; }
  .chip.ok{ color:#3fb950; border-color:#23502f } .chip.warn{ color:#d29922; border-color:#5a4413 }
  .chip.bad{ color:#f85149; border-color:#5e2126 } .chip.mut{ color:#8b949e }
  .now { margin:10px 0 16px; padding:10px 12px; background:#161b22; border:1px solid #30363d; border-radius:8px; }
  .now .lbl { color:#8b949e; font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin-bottom:3px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:760px){ .grid{ grid-template-columns:1fr } }
  .card { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:12px 14px; }
  .card h2 { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#8b949e; margin:0 0 10px; }
  .card.wide { grid-column:1 / -1; }
  ul { list-style:none; margin:0; padding:0; }
  li { padding:5px 0; border-bottom:1px solid #21262d; }
  li:last-child { border-bottom:0; }
  ul.tight li { padding:2px 0; border:0; color:#8b949e; }
  ol.queue { list-style:none; margin:6px 0 10px; padding:0; }
  ol.queue li { padding:4px 0; border-bottom:1px solid #21262d; }
  ol.queue li:last-child { border-bottom:0; }
  .pos { display:inline-block; min-width:20px; text-align:right; margin-right:7px; color:#6e7681; }
  .pill { display:inline-block; padding:0 6px; border-radius:4px; font-size:10.5px; border:1px solid #30363d; }
  .pill.ok{color:#3fb950} .pill.warn{color:#d29922} .pill.bad{color:#f85149} .pill.blu{color:#58a6ff} .pill.mut{color:#8b949e}
  .cat { color:#8b949e; font-size:11px; }
  .t { color:#c9d1d9; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  td { padding:4px 8px 4px 0; vertical-align:top; border-bottom:1px solid #21262d; }
  tr:last-child td { border-bottom:0; }
  .kv { display:flex; justify-content:space-between; padding:3px 0; }
  .kv span { color:#8b949e; }
  pre.log { white-space:pre-wrap; word-break:break-word; margin:0; color:#6e7681; font-size:11.5px; }
  details summary { cursor:pointer; color:#8b949e; }
  .ok{color:#3fb950} .warn{color:#d29922} .bad{color:#f85149} .blu{color:#58a6ff} .cyn{color:#39c5cf} .mut{color:#8b949e} b{color:#f0f6fc}
  footer { margin-top:18px; color:#6e7681; font-size:11.5px; }
</style></head><body><div class="wrap">
<h1>TraceDDS · eng-loop dashboard</h1>
<div class="bar">$chips</div>
<div class="bar">$attn</div>
<div class="now"><div class="lbl">Current run</div>$cur_html</div>
<div class="grid">
  <div class="card"><h2>PRs created (recent)</h2><ul>$recent_html</ul></div>
  <div class="card"><h2>Open PRs · awaiting review</h2><ul>$open_html</ul></div>
  <div class="card"><h2>Work queue · next-up order</h2>$backlog_html</div>
  <div class="card"><h2>Recent ticks</h2><table>$ticks_html</table></div>
  <div class="card wide"><h2>cron.log · last $TAIL_N</h2><details open><summary>log tail</summary><pre class="log">$logtail_html</pre></details></div>
</div>
<footer>generated $gen · auto-refreshes every 60s · read-only · repo $LOOP_REPO</footer>
</div></body></html>
HTMLEOF
)"
  if [ -n "$HTML_PATH" ]; then printf '%s\n' "$page" > "$HTML_PATH"; printf 'Wrote %s\n' "$HTML_PATH" >&2
  else printf '%s\n' "$page"; fi
  exit 0
fi

# ============================================================================
#  TERMINAL RENDERER
# ============================================================================

# --- Liveness ---------------------------------------------------------------
hdr "ENG-LOOP STATUS"
if [ "$NUC_OK" = "0" ]; then
  printf '  %sNUC (%s) unreachable%s — showing GitHub-side data only.\n' "$RED" "$NUC_HOST" "$R"
else
  if [ -n "$hv" ]; then
    case "$hv" in OK) hc="$GRN" ;; DEGRADED) hc="$YEL" ;; STALLED|DOWN) hc="$RED" ;; *) hc="$DIM" ;; esac
    printf '  %-14s %s%s%s  %s%s%s\n' "Health:" "$hc" "$hv" "$R" "$DIM" "$hd" "$R"
  fi
  printf '  %-14s %s%s%s  (%s)\n' "NUC:" "$GRN" "${host:-$NUC_HOST}" "$R" "$now_human"
  if [ -n "$sched" ]; then
    printf '  %-14s %sinstalled%s  %s%s%s\n' "Cron:" "$GRN" "$R" "$DIM" "$sched" "$R"
  else
    printf '  %-14s %snot installed%s\n' "Cron:" "$RED" "$R"
  fi
  [ "$pause" = "yes" ] && printf '  %-14s %sPAUSED%s (PAUSE file present — next tick skips)\n' "Paused:" "$YEL" "$R"
  [ -n "$ago" ] && printf '  %-14s %s ago\n' "Last activity:" "$(fmt_dur "$ago")"
  [ "${worktrees:-0}" -gt 0 ] && printf '  %-14s %s%s%s (one is normal during a run; >0 while idle = a stuck/crashed teardown)\n' \
    "Worktrees:" "$YEL" "$worktrees" "$R"
  [ -n "$rotation" ] && printf '  %-14s %s%s%s (next autonomous lane after this)\n' "Rotation:" "$DIM" "$rotation" "$R"
  if [ -n "$cl" ] || [ -n "$cx" ]; then
    cln="${cl%\%}"; cc="$YEL"; [ -n "$cln" ] && [ "$cln" -gt "$GATE_THRESHOLD" ] && cc="$GRN"
    printf '  %-14s Claude %s%s left%s (gate >%s%%)   Codex %s%s left%s\n' \
      "Usage:" "$cc" "${cl:-?}" "$R" "$GATE_THRESHOLD" "$CYN" "${cx:-?}" "$R"
  fi
fi

# --- Current run ------------------------------------------------------------
hdr "CURRENT RUN"
if [ "$NUC_OK" = "0" ]; then
  printf '  %s(NUC unreachable)%s\n' "$DIM" "$R"
elif [ -n "$CUR" ]; then
  el=""; [ -n "$ago" ] && el="  ·  running $(fmt_dur "$ago")"
  printf '  %s%s%s on %s%s%s%s started %s\n' "$B" "$cwork" "$R" "$CYN" "$ceng" "$R" "$el" "$ctime"
else
  printf '  %sidle%s — last tick complete; waiting for next cron fire.\n' "$GRN" "$R"
fi

# --- PRs created (recent) ---------------------------------------------------
hdr "PRs CREATED (recent)"
if [ "$GH_OK" = "0" ]; then
  printf '  %s(could not query GitHub — is `gh` authed?)%s\n' "$RED" "$R"
elif [ -n "$RECENT_PR_ROWS" ]; then
  printf '%s\n' "$RECENT_PR_ROWS" | while IFS=$'\t' read -r num state cat title; do
    sc="$GRN"; case "$state" in OPEN) sc="$BLU" ;; CLOSED) sc="$DIM" ;; esac
    [ ${#title} -gt 46 ] && title="${title:0:45}…"
    printf '  %s#%-4s%s %s%-7s%s %-11s %s\n' "$B" "$num" "$R" "$sc" "$state" "$R" "$cat" "$title"
  done
else
  printf '  %snone%s\n' "$DIM" "$R"
fi

# --- Recent ticks -----------------------------------------------------------
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

# --- Open loop PRs ----------------------------------------------------------
hdr "OPEN LOOP PRs"
if [ "$GH_OK" = "0" ]; then
  printf '  %s(could not query GitHub — is `gh` authed?)%s\n' "$RED" "$R"
elif [ -z "$PR_ROWS" ]; then
  printf '  %snone open%s\n' "$DIM" "$R"
else
  printf '  %s%-5s %-12s %-18s %-8s %-11s %s%s\n' "$DIM" "PR" "MERGE" "REVIEW" "CI" "LANE" "TITLE" "$R"
  printf '%s\n' "$PR_ROWS" | while IFS=$'\t' read -r num merge review ci cat title; do
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

# --- Work queue -------------------------------------------------------------
hdr "WORK QUEUE (next-up order)"
if [ "$GH_OK" = "0" ]; then
  printf '  %s(could not query GitHub — is `gh` authed?)%s\n' "$RED" "$R"
elif [ "${qn:-0}" = "0" ]; then
  if [ -n "$rotation" ]; then
    printf '  %squeue empty%s — no labeled issues; drawing from autonomous rotation (next: %s).\n' "$GRN" "$R" "$rotation"
  else
    printf '  %squeue empty%s — no labeled issues queued.\n' "$GRN" "$R"
  fi
else
  printf '  %s%s queued%s — label priority, then newest first:\n' "$B" "$qn" "$R"
  printf '%s\n' "$QUEUE_ROWS" | head -12 | while IFS=$'\t' read -r pos num label title; do
    [ ${#title} -gt 46 ] && title="${title:0:45}…"
    printf '  %s%2s.%s %s#%-4s%s %s%-18s%s %s\n' "$DIM" "$pos" "$R" "$B" "$num" "$R" "$CYN" "$label" "$R" "$title"
  done
  [ "${qn:-0}" -gt 12 ] && printf '  %s… +%s more%s\n' "$DIM" "$((qn-12))" "$R"
fi
printf '  %sBlocked (needs-design):%s %s%s%s    %sdata-quality:%s %s\n' \
  "$DIM" "$R" "$YEL" "$nd" "$R" "$DIM" "$R" "$dq"

# --- Log tail ---------------------------------------------------------------
hdr "cron.log (last $TAIL_N)"
if [ "$NUC_OK" = "0" ]; then
  printf '  %s(NUC unreachable)%s\n' "$DIM" "$R"
else
  section crontail | tail -n "$TAIL_N" | sed "s/^/  ${DIM}/; s/\$/${R}/"
fi
echo
