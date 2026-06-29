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
rel() {  # seconds → coarse "9s ago" / "22m ago" / "2h ago" / "3d ago"
  local s="${1:-0}"
  if   [ "$s" -lt 60 ];    then printf '%ds ago' "$s"
  elif [ "$s" -lt 3600 ];  then printf '%dm ago' $((s/60))
  elif [ "$s" -lt 86400 ]; then printf '%dh ago' $((s/3600))
  else printf '%dd ago' $((s/86400)); fi
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
echo "###uptime###"; uptime -p 2>/dev/null
echo "###platform###"; { . /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"; } || uname -sr 2>/dev/null
echo "###version###"; git -C "$H/checkout" describe --tags --always --dirty 2>/dev/null
echo "###cron###"; crontab -l 2>/dev/null | grep -F "# eng-loop"
echo "###pause###"; [ -f "$H/PAUSE" ] && echo yes || echo no
echo "###rotation###"; cat "$H/.rotation" 2>/dev/null
echo "###health###"; bash "$H/checkout/scripts/eng-loop/health.sh" json 2>/dev/null
echo "###cronlog_mtime###"; stat -c %Y "$H/logs/cron.log" 2>/dev/null
echo "###worktrees###"; ls -1 "$H/worktrees/" 2>/dev/null
echo "###usage###"; _ulogs="$(ls -1t "$H"/logs/[0-9]*.log 2>/dev/null | head -3)"; for _uf in $_ulogs; do _um="$(grep -E "usage-gate.*claude: window=" "$_uf" 2>/dev/null | tail -1)"; [ -n "$_um" ] && { echo "$_um"; break; }; done; for _uf in $_ulogs; do _um="$(grep -E "usage-codex.*codex remaining:" "$_uf" 2>/dev/null | tail -1)"; [ -n "$_um" ] && { echo "$_um"; break; }; done
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
cl_week_used=""; cl_sess_used=""; cx_week_rem=""; cx_5h_rem=""
uptime_h=""; platform=""; version=""; tz=""
if [ "$NUC_OK" = "1" ]; then
  host="$(section hostname)"
  now_epoch="$(section now_epoch)"; now_human="$(section now_human)"
  uptime_h="$(section uptime | sed 's/^up //')"; platform="$(section platform)"; version="$(section version)"
  tz="$(printf '%s' "$now_human" | awk '{print $NF}')"
  cron_line="$(section cron)"; pause="$(section pause)"; rotation="$(section rotation)"
  mtime="$(section cronlog_mtime)"
  worktrees="$(section worktrees | grep -c . || true)"
  [ -n "$cron_line" ] && sched="$(printf '%s' "$cron_line" | grep -oE '^[^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+' || true)"
  [ -n "${mtime:-}" ] && [ -n "${now_epoch:-}" ] && ago=$(( now_epoch - mtime ))

  health_json="$(section health)"
  hv="$(printf '%s' "$health_json" | grep -oE '"verdict":[[:space:]]*"[A-Z]+"' | grep -oE '[A-Z]+' | head -1)"
  hd="$(printf '%s' "$health_json" | sed -nE 's/.*"detail":[[:space:]]*"([^"]*)".*/\1/p' | head -1)"

  # Real usage budgets — parse the MOST RECENT line of each kind from a wide
  # window (the gate skips logging a codex line whenever Claude has budget, so a
  # short tail loses it). Claude bracket = % USED; Codex parens = % REMAINING.
  usage="$(section usage)"
  cl_line="$(printf '%s' "$usage" | grep -E 'usage-gate.*claude: window=' | tail -1)"
  cx_line="$(printf '%s' "$usage" | grep -E 'usage-codex.*codex remaining:' | tail -1)"
  cl="$(printf '%s' "$cl_line" | grep -oE 'remaining=[0-9]+%' | grep -oE '[0-9]+%' | head -1)"
  cx="$(printf '%s' "$cx_line" | grep -oE 'rem=[0-9]+%'       | grep -oE '[0-9]+%' | head -1)"
  cl_week_used="$(printf '%s' "$cl_line" | grep -oE 'week=[0-9]+'    | grep -oE '[0-9]+' | head -1)"
  cl_sess_used="$(printf '%s' "$cl_line" | grep -oE 'session=[0-9]+' | grep -oE '[0-9]+' | head -1)"
  cx_week_rem="$(printf '%s' "$cx_line"  | grep -oE 'weekly=[0-9]+'  | grep -oE '[0-9]+' | head -1)"
  cx_5h_rem="$(printf '%s' "$cx_line"    | grep -oE '5h=[0-9]+'      | grep -oE '[0-9]+' | head -1)"
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
        --json number,title,state,createdAt,mergedAt,headRefName,url,closingIssuesReferences 2>/dev/null)"
RECENT_PR_ROWS="$(printf '%s' "$recent_prs" | jq -r '
  [ .[] | select(.headRefName|startswith("eng-loop-")) ]
  | sort_by(.createdAt) | reverse | .[:8][]
  | (.headRefName | sub("^eng-loop-";"") | sub("-[0-9]{8}-[0-9]{6}$";"")) as $cat
  | ((now - (.createdAt|fromdateiso8601)) | floor) as $age
  | [ .number, (if .mergedAt then "MERGED" else .state end), $cat, $age, .title ] | @tsv' 2>/dev/null)"
# PR → closing-issue number (for the "↳ #issue" link in the unified PR list)
RECENT_PR_ISSUE="$(printf '%s' "$recent_prs" | jq -r '
  .[] | select(.headRefName|startswith("eng-loop-"))
  | [ .number, (.closingIssuesReferences[0].number // "") ] | @tsv' 2>/dev/null)"

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
  # ---- small inline-SVG helpers ------------------------------------------
  ck='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>'
  xk='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'

  lane_pill() {  # colored pill whose hue is derived from the lane name (stable per lane)
    local L="$1"
    [ -z "$L" ] && { printf '<span class="lane mut">—</span>'; return; }
    local h; h=$(printf '%s' "$L" | od -An -tu1 2>/dev/null | awk '{for(i=1;i<=NF;i++)s+=$i} END{print (s%360)}')
    printf '<span class="lane" style="--h:%s">%s</span>' "${h:-210}" "$(e "$L")"
  }
  donut() {  # $1=used% $2=hue $3=engine-name $4=caption ; centre shows N% / used
    local pct="$1" hue="$2" name="$3" cap="$4" mid
    if [ -z "$pct" ]; then mid='<b style="color:#8a93a2">—</b>'; pct=0
    else mid="$(printf '<b style="color:hsl(%s,70%%,42%%)">%s</b><span>used</span>' "$hue" "${pct}%")"; fi
    local circ off
    circ=$(awk 'BEGIN{printf "%.2f", 2*3.14159265*42}')
    off=$(awk -v c="$circ" -v p="$pct" 'BEGIN{printf "%.2f", c*(1-p/100)}')
    printf '<div class="donut"><svg viewBox="0 0 108 108"><circle class="dt" cx="54" cy="54" r="42"/><circle class="dv" cx="54" cy="54" r="42" style="--hue:%s;stroke-dasharray:%s;stroke-dashoffset:%s"/></svg><div class="dc">%s</div><div class="dl">%s</div><div class="dcap">%s</div></div>' \
      "$hue" "$circ" "$off" "$mid" "$(e "$name")" "$(e "$cap")"
  }
  clock() { printf '%s' "$1" | awk -F: '{h=$1+0; ap=(h<12?"AM":"PM"); hh=h%12; if(hh==0)hh=12; printf "%d:%s:%s %s", hh, $2, $3, ap}'; }

  # ---- health verdict ----------------------------------------------------
  case "$hv" in OK) hclass=ok; hword="${hv}"; hsub="${hd:-All systems normal}" ;;
    DEGRADED) hclass=warn; hword="$hv"; hsub="${hd:-Running with warnings}" ;;
    STALLED|DOWN) hclass=bad; hword="$hv"; hsub="${hd:-Loop not advancing}" ;;
    *) hclass=mut; hword="?"; hsub="health unknown" ;; esac
  [ "$NUC_OK" = "0" ] && { hclass=bad; hword="DOWN"; hsub="NUC ($NUC_HOST) unreachable"; }

  # ---- derived liveness numbers -----------------------------------------
  now_time="$(printf '%s' "$now_human" | awk '{print $2}')"
  now_date="$(printf '%s' "$now_human" | awk '{print $1}')"
  cur_min="$(printf '%s' "$now_time" | cut -d: -f2)"
  mfield="$(printf '%s' "$sched" | awk '{print $1}')"; ival=""
  case "$mfield" in */[0-9]*) ival="${mfield#*/}" ;; esac
  nextrun=""
  if [ -n "$ival" ] && [ -n "$cur_min" ]; then
    cm=$((10#$cur_min)); ni=$(( ival - (cm % ival) )); [ "$ni" -eq 0 ] && ni=$ival
    nextrun="~${ni}m"
  fi
  ivh="${ival:-30}"
  ready_hours=""; [ "${qn:-0}" -gt 0 ] && ready_hours="$(awk -v q="$qn" -v i="$ivh" 'BEGIN{printf "%.0f", q*i/60}')"

  cl_rem="${cl%\%}"; cx_rem="${cx%\%}"
  # Usage donuts: weekly % USED is the headline budget; the short window (Claude
  # session / Codex 5h) is the caption. Each falls back to the gate's remaining=.
  claude_used="${cl_week_used}"
  [ -z "$claude_used" ] && [ -n "$cl_rem" ] && claude_used=$(( 100 - cl_rem ))
  codex_used=""
  [ -n "$cx_week_rem" ] && codex_used=$(( 100 - cx_week_rem ))
  [ -z "$codex_used" ] && [ -n "$cx_rem" ] && codex_used=$(( 100 - cx_rem ))
  claude_cap=""; [ -n "$cl_sess_used" ] && claude_cap="session ${cl_sess_used}% used"
  codex_cap="";  [ -n "$cx_5h_rem" ] && codex_cap="5h $(( 100 - cx_5h_rem ))% used"
  eng_next="Claude"; { [ -n "$cl_rem" ] && [ "$cl_rem" -le "$GATE_THRESHOLD" ]; } && eng_next="Codex"

  # pipeline health verdict
  if   [ "${qn:-0}" -ge 8 ]; then pipe_word="Healthy pipeline"; pipe_cls=ok
  elif [ "${qn:-0}" -ge 3 ]; then pipe_word="Adequate backlog"; pipe_cls=warn
  else pipe_word="Low — backfill soon"; pipe_cls=bad; fi
  pipe_sub="queue empty"; [ -n "$ready_hours" ] && pipe_sub="Enough ready work for ~${ready_hours} hours"

  # ---- recent ticks → cycles table + failure tally + sparkline ----------
  fail_n=0
  # lane for a cycle's PR — look it up in RECENT_PR_ROWS (portable; no assoc arrays)
  pr_lane()  { printf '%s\n' "$RECENT_PR_ROWS"  | awk -F'\t' -v n="$1" '$1==n{print $3; exit}'; }
  pr_issue() { printf '%s\n' "$RECENT_PR_ISSUE" | awk -F'\t' -v n="$1" '$1==n{print $2; exit}'; }
  # merge/review/ci detail for an open PR (empty when the PR is not open)
  pr_open_detail() { printf '%s\n' "$PR_ROWS" | awk -F'\t' -v n="$1" '$1==n{print $2"\t"$3"\t"$4; exit}'; }
  # linkify every "#N" in an already-escaped string to issues/ or pull/ on GitHub
  link_refs() { printf '%s' "$1" | sed -E "s|#([0-9]+)|<a href='https://github.com/$LOOP_REPO/$2/\1' target='_blank'>#\1</a>|g"; }
  spark_bars=""
  if [ -n "$TICKS" ]; then
    while IFS=$'\t' read -r t eng work result flag; do
      [ -z "$t" ] && continue
      cls=ok; v=3
      case "$result" in
        *"exit="[1-9]*|*"locked"*)             cls=bad; v=2; fail_n=$((fail_n+1)) ;;
        *"no PR"*|*"skipped"*|*"quiet"*)       cls=mut; v=1 ;;
        *"→ PR"*|*"revised"*|*"reconciled"*)   cls=ok;  v=3 ;;
      esac
      [ "$flag" = "run" ] && { cls=run; v=2; }
      spark_bars+="<i class='$cls' style='--v:$v'></i>"
    done < <(printf '%s\n' "$TICKS" | tail -24)
  fi
  pipe_spark="$(printf '%s\n' "$TICKS" | tail -40 | awk -F'\t' '
    { r=$4; f=$5; v=2;
      if (r ~ /exit=[1-9]|locked/) v=1; else if (r ~ /no PR|skipped|quiet/) v=1; else if (r ~ /PR|revised|reconciled/) v=3;
      if (f=="run") v=2; vals[n++]=v }
    END{ if(n<2){exit}; w=300;h=44; pts="";
      for(i=0;i<n;i++){ x=(i/(n-1))*w; y=h-3-(vals[i]-1)/2*(h-8); pts=pts sprintf("%.1f,%.1f ",x,y) }
      printf "<svg viewBox=\"0 0 %d %d\" preserveAspectRatio=\"none\" class=\"trend\"><polyline points=\"%s\"/></svg>", w,h,pts }')"

  cycles_html=""
  if [ "$NUC_OK" = "0" ]; then cycles_html="<tr><td class='mut' colspan='5'>NUC unreachable</td></tr>"
  elif [ -n "$TICKS" ]; then
    while IFS=$'\t' read -r t eng work result flag; do
      [ -z "$t" ] && continue
      oc=ok; oicon="$ck"
      case "$result" in
        *"exit="[1-9]*|*"locked"*)           oc=bad; oicon="$xk" ;;
        *"no PR"*|*"skipped"*|*"quiet"*)     oc=mut; oicon="$ck" ;;
        *"revised"*|*"reconciled"*)          oc=blu; oicon="$ck" ;;
      esac
      [ "$flag" = "run" ] && { oc=run; oicon="$ck"; result="…running"; }
      # lane: from the PR this cycle opened, else the autonomous "auto: <cat>" category
      lane=""; prn="$(printf '%s' "$result" | grep -oE '#[0-9]+' | head -1 | tr -d '#')"
      [ -n "$prn" ] && lane="$(pr_lane "$prn")"
      [ -z "$lane" ] && case "$work" in auto:\ *) lane="${work#auto: }" ;; esac
      engc=cla; [ "$eng" = "codex" ] && engc=cod
      # work item: link an "issue #N" to the issue, a "PR #N" to the pull request
      wpath=pull; case "$work" in *"issue #"*) wpath=issues ;; esac
      work_html="$(link_refs "$(e "$work")" "$wpath")"
      result_html="$(link_refs "$(e "$result")" "pull")"
      cycles_html+="<tr><td class='mut'>$(e "$t")</td><td><span class='eng $engc'>$(e "$(printf '%s' "$eng" | tr a-z A-Z)")</span></td><td>$(lane_pill "$lane")</td><td class='wi'>$work_html</td><td class='$oc'><span class='oi'>$oicon</span>$result_html</td></tr>"
    done < <(printf '%s\n' "$TICKS" | tail -10)
  else cycles_html="<tr><td class='mut' colspan='5'>no cycles in the last $TAIL_HIST log lines</td></tr>"; fi

  # ---- open-PR failure tally (drives the Pipeline-status banner) ---------
  pr_fail="$(printf '%s' "$PR_ROWS" | awk -F'\t' '$2=="CONFLICTING" || $4=="FAIL"{n++} END{print n+0}')"

  # ---- unified PR list (recent PRs; open ones show review/CI as status) --
  # Collapses "recently created" + "open awaiting review" into one table. For an
  # OPEN PR the Status cell reflects the actionable state (conflict > CI > review);
  # MERGED/CLOSED show as-is. Each PR links its closing issue (↳ #N) when known.
  prlist_html=""
  if [ "$GH_OK" = "0" ]; then prlist_html="<tr><td class='bad' colspan='4'>could not query GitHub (is gh authed?)</td></tr>"
  elif [ -n "$RECENT_PR_ROWS" ]; then
    while IFS=$'\t' read -r num state cat age title; do
      [ -z "$num" ] && continue
      if [ "$state" = "OPEN" ]; then
        IFS=$'\t' read -r merge review ci < <(pr_open_detail "$num")
        if   [ "$merge" = "CONFLICTING" ]; then sc=bad;  sw="Conflicting"
        elif [ "$ci" = "FAIL" ];           then sc=bad;  sw="CI failing"
        elif [ "$ci" = "pending" ];        then sc=warn; sw="CI pending"
        elif [ "$review" = "APPROVED" ];   then sc=ok;   sw="Approved"
        elif [ "$review" = "CHANGES_REQUESTED" ]; then sc=warn; sw="Changes req"
        else sc=blu; sw="Review req"; fi
      else
        case "$state" in MERGED) sc=ok; sw="Merged" ;; *) sc=mut; sw="Closed" ;; esac
      fi
      iss="$(pr_issue "$num")"; isslink=""
      [ -n "$iss" ] && isslink=" <a class='iss' href='https://github.com/$LOOP_REPO/issues/$iss' target='_blank'>↳ #$iss</a>"
      prlist_html+="<tr><td class='prc'><a href='https://github.com/$LOOP_REPO/pull/$num' target='_blank'>#$num</a>$isslink</td><td><span class='pill $sc'>$(e "$sw")</span></td><td>$(lane_pill "$cat")</td><td class='wi'>$(e "$title") <span class='age'>$(rel "${age:-0}")</span></td></tr>"
    done <<EOF
$RECENT_PR_ROWS
EOF
  else prlist_html="<tr><td class='mut' colspan='4'>no loop PRs found</td></tr>"; fi

  # ---- queued-next list --------------------------------------------------
  queued_html=""
  if [ "${qn:-0}" != "0" ]; then
    n=0
    while IFS=$'\t' read -r pos num label title; do
      [ -z "$num" ] && continue
      n=$((n+1)); [ "$n" -gt 5 ] && continue
      queued_html+="<li><span class='qn'>${pos}.</span><a href='https://github.com/$LOOP_REPO/issues/$num' target='_blank'>#$num</a> $(lane_pill "$label") <span class='qt'>$(e "$title")</span> <span class='badge ok'>Ready</span></li>"
    done <<EOF
$QUEUE_ROWS
EOF
  else
    rot_note=""; [ -n "$rotation" ] && rot_note=" (next: $(e "$rotation"))"
    queued_html="<li class='mut'>queue empty — drawing from autonomous rotation${rot_note}</li>"
  fi

  # ---- failures banner ---------------------------------------------------
  if [ "$fail_n" -eq 0 ] && [ "${pr_fail:-0}" -eq 0 ]; then
    fail_cls=ok; fail_icon="$ck"; fail_word="No failures in view"
  else
    fail_cls=bad; fail_icon="$xk"; fail_word="Attention needed"
  fi

  # ---- system info -------------------------------------------------------
  gh_word="Connected"; gh_cls=ok; [ "$GH_OK" = "0" ] && { gh_word="Disconnected"; gh_cls=bad; }

  # ---- log tail (colorized) ---------------------------------------------
  if [ "$NUC_OK" = "0" ]; then logtail_html="<div class='lg mut'>(NUC unreachable)</div>"
  else
    logtail_html="$(section crontail | tail -n "$TAIL_N" | esc | awk '{
      cls="logi"; if ($0 ~ /ERROR|FAIL|exit=[1-9]/) cls="loge"; else if ($0 ~ /WARN/) cls="logw";
      printf "<div class=\"lg %s\">%s</div>\n", cls, $0 }')"
    [ -z "$logtail_html" ] && logtail_html="<div class='lg mut'>(no log lines)</div>"
  fi

  # status pill for schedule
  if [ "$NUC_OK" = "0" ]; then sched_word="UNREACHABLE"; sched_cls=bad
  elif [ "$pause" = "yes" ]; then sched_word="PAUSED"; sched_cls=warn
  elif [ -n "$sched" ]; then sched_word="ACTIVE"; sched_cls=ok
  else sched_word="NO CRON"; sched_cls=bad; fi
  wt_sub="Idle"; [ "${worktrees:-0}" -gt 0 ] && wt_sub="Active"

  gen="$(date '+%Y-%m-%d %H:%M:%S %Z')"
  page="$(cat <<HTMLEOF
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>Engineering Loop · dashboard</title>
<style>
  :root{
    --bg:#f4f6f8; --panel:#ffffff; --line:#e6e9ee; --line2:#eef1f5;
    --ink:#1f2430; --ink2:#5b6573; --mut:#8a93a2;
    --ok:#1f9d57; --okbg:#e9f7ef; --warn:#b9770b; --warnbg:#fdf4e3;
    --bad:#d23a3a; --badbg:#fdecec; --blu:#2563c9; --blubg:#e8f0fd;
    --accent:#5b6cff; --shadow:0 1px 2px rgba(20,28,45,.05),0 1px 3px rgba(20,28,45,.04);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:13.5px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;}
  a{color:var(--blu);text-decoration:none} a:hover{text-decoration:underline}
  .ic{width:1em;height:1em;display:inline-block;vertical-align:-.12em}
  .app{display:grid;grid-template-columns:208px 1fr;min-height:100vh}
  /* ---- sidebar ---- */
  .side{background:var(--panel);border-right:1px solid var(--line);padding:18px 14px;display:flex;flex-direction:column}
  .brand{display:flex;gap:10px;align-items:center;padding:2px 6px 18px}
  .brand .logo{width:26px;height:26px;border:1.5px solid var(--ink);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--ink)}
  .brand b{font-size:13.5px;font-weight:650;letter-spacing:-.01em;display:block;line-height:1.2}
  .brand small{color:var(--mut);font-size:11px}
  .nav{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
  .nav a{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:7px;color:var(--ink2);font-size:13px;font-weight:500}
  .nav a:hover{background:var(--line2);text-decoration:none}
  .nav a.on{background:#eef0fb;color:var(--accent)}
  .nav .gi{width:15px;height:15px;opacity:.85}
  .side .foot{margin-top:auto;padding-top:16px;color:var(--mut);font-size:11px;line-height:1.6}
  .side .foot .ar{display:flex;align-items:center;gap:7px;color:var(--ink2);font-size:12px;margin-bottom:10px}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block}
  .pillbox{border:1px solid var(--line);border-radius:6px;padding:1px 7px;color:var(--ink2);font-size:11px}
  /* ---- main ---- */
  .main{padding:20px 22px 40px;max-width:1480px}
  .grid{display:grid;gap:14px}
  .r1{grid-template-columns:1.55fr 1fr 1fr}
  .r2{grid-template-columns:1fr 1.25fr 1.1fr .95fr;margin-top:14px}
  .r3{grid-template-columns:1fr 1fr;margin-top:14px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:15px 16px;box-shadow:var(--shadow)}
  .ct{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
  .ct h2,.card>h2{font-size:11px;font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);margin:0}
  .ct a{font-size:12px;font-weight:500}
  .card>h2{margin-bottom:12px}
  /* health card */
  .health{display:flex;gap:18px;align-items:stretch}
  .hbig{display:flex;gap:13px;align-items:center;min-width:172px;padding-right:18px;border-right:1px solid var(--line2)}
  .hring{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px}
  .hring.ok{background:var(--okbg);color:var(--ok)} .hring.warn{background:var(--warnbg);color:var(--warn)}
  .hring.bad{background:var(--badbg);color:var(--bad)} .hring.mut{background:var(--line2);color:var(--mut)}
  .hword{font-size:27px;font-weight:680;letter-spacing:-.02em;line-height:1}
  .hword.ok{color:var(--ok)} .hword.warn{color:var(--warn)} .hword.bad{color:var(--bad)} .hword.mut{color:var(--mut)}
  .hsub{color:var(--mut);font-size:11.5px;margin-top:3px}
  .hstats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;flex:1}
  .hstats .s .k{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
  .hstats .s .v{font-size:13px;font-weight:560;display:flex;align-items:center;gap:5px}
  .hstats .s .sub{color:var(--mut);font-size:11px;font-weight:400;margin-top:1px}
  /* donuts */
  .donuts{display:flex;gap:8px;justify-content:space-around}
  .donut{position:relative;text-align:center}
  .donut svg{width:96px;height:96px;transform:rotate(-90deg)}
  .donut .dt{fill:none;stroke:var(--line2);stroke-width:10}
  .donut .dv{fill:none;stroke:hsl(var(--hue),70%,48%);stroke-width:10;stroke-linecap:round;transition:stroke-dashoffset .6s}
  .donut .dc{position:absolute;top:34px;left:0;right:0;text-align:center;line-height:1.1}
  .donut .dc b{font-size:17px;font-weight:680;display:block} .donut .dc span{font-size:10px;color:var(--mut)}
  .donut .dl{margin-top:4px;color:var(--ink2);font-size:12px;font-weight:540}
  .donut .dcap{color:var(--mut);font-size:10.5px;margin-top:1px}
  /* failures card */
  .fail{display:flex;gap:13px;align-items:center}
  .fic{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:23px;flex-shrink:0}
  .fic.ok{background:var(--okbg);color:var(--ok)} .fic.bad{background:var(--badbg);color:var(--bad)}
  .fail .fw{font-size:15px;font-weight:600} .fail .fs{color:var(--mut);font-size:11.5px;margin-top:2px}
  .spark{display:flex;align-items:flex-end;gap:2px;height:34px;margin-left:auto}
  .spark i{width:5px;border-radius:1px;height:calc(var(--v)*8px + 4px);background:var(--ok)}
  .spark i.bad{background:var(--bad)} .spark i.mut{background:var(--line)} .spark i.run{background:var(--blu)}
  .sparklbl{text-align:right;color:var(--mut);font-size:10px;margin-top:4px}
  /* current activity */
  .pulse{display:flex;flex-direction:column;align-items:center;gap:13px;padding:6px 0 2px}
  .pwrap{position:relative;width:118px;height:118px;display:flex;align-items:center;justify-content:center}
  .pring{position:absolute;inset:0;border-radius:50%;border:2px dashed var(--line);animation:spin 22s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .pcore{color:var(--ok);font-size:30px;line-height:1}
  .pcore.run{color:var(--blu)}
  .ptext{text-align:center}
  .ptext .st{font-size:17px;font-weight:650;letter-spacing:.02em} .ptext .ss{color:var(--mut);font-size:12px;margin-top:2px}
  .pmeta{width:100%;border-top:1px solid var(--line2);padding-top:9px;margin-top:3px;display:flex;flex-direction:column;gap:5px}
  .pmeta .kv{display:flex;justify-content:space-between;font-size:12px} .pmeta .kv span{color:var(--mut)}
  /* queued list */
  .queue{list-style:none;margin:0;padding:0}
  .queue li{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line2);font-size:12.5px}
  .queue li:last-child{border-bottom:0}
  .queue .qn{color:var(--mut);min-width:16px} .queue .qt{flex:1;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qfoot{margin-top:10px;color:var(--mut);font-size:11.5px} .qfoot b{color:var(--ink2);font-weight:600}
  /* pipeline */
  .pipe{display:flex;justify-content:space-between;text-align:center;gap:8px}
  .pipe .pn{font-size:30px;font-weight:680;line-height:1} .pipe .pk{font-size:12px;font-weight:560;margin-top:4px} .pipe .psub{color:var(--mut);font-size:10.5px;margin-top:1px}
  .pipe .ok{color:var(--ok)} .pipe .warn{color:var(--warn)} .pipe .blu{color:var(--blu)}
  .pbar{margin-top:13px;border-top:1px solid var(--line2);padding-top:11px;display:flex;gap:11px;align-items:center}
  .pbar .pi{width:30px;height:30px;border-radius:50%;background:var(--okbg);color:var(--ok);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
  .pbar .pi.warn{background:var(--warnbg);color:var(--warn)} .pbar .pi.bad{background:var(--badbg);color:var(--bad)}
  .pbar .pw{font-size:13px;font-weight:600} .pbar .ps{color:var(--mut);font-size:11px}
  .pbar .trend{width:120px;height:38px;margin-left:auto}
  .trend polyline{fill:none;stroke:var(--ok);stroke-width:1.5;vector-effect:non-scaling-stroke;opacity:.7}
  /* system info */
  .sys{display:flex;flex-direction:column}
  .sys .row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--line2);font-size:12.5px}
  .sys .row:last-child{border-bottom:0}
  .sys .row .k{color:var(--ink2)} .sys .row .v{font-weight:540;color:var(--ink);display:flex;align-items:center;gap:6px}
  /* tables */
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  thead th{text-align:left;color:var(--mut);font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:0 10px 8px 0;border-bottom:1px solid var(--line)}
  tbody td{padding:8px 10px 8px 0;border-bottom:1px solid var(--line2);vertical-align:middle}
  tbody tr:last-child td{border-bottom:0}
  td.wi{color:var(--ink);max-width:1px;width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  td.prc{white-space:nowrap}
  .iss{color:var(--mut);font-size:11px;font-weight:500} .iss:hover{color:var(--blu)}
  .age{color:var(--mut);font-size:10.5px;margin-left:4px}
  .si,.oi{display:inline-flex;margin-right:5px;vertical-align:-.12em}
  /* chips / pills */
  .lane{display:inline-block;padding:1px 9px;border-radius:999px;font-size:11px;font-weight:540;white-space:nowrap;
    background:hsl(var(--h),62%,96%);color:hsl(var(--h),48%,40%);border:1px solid hsl(var(--h),50%,90%)}
  .lane.mut{background:var(--line2);color:var(--mut);border-color:var(--line)}
  .pill{display:inline-block;padding:1px 8px;border-radius:5px;font-size:10.5px;font-weight:600;letter-spacing:.02em}
  .pill.ok{background:var(--okbg);color:var(--ok)} .pill.blu{background:var(--blubg);color:var(--blu)} .pill.mut{background:var(--line2);color:var(--mut)}
  .badge{margin-left:auto;padding:1px 8px;border-radius:5px;font-size:10.5px;font-weight:600}
  .badge.ok{background:var(--okbg);color:var(--ok)} .badge.warn{background:var(--warnbg);color:var(--warn)} .badge.bad{background:var(--badbg);color:var(--bad)}
  .eng{display:inline-block;padding:1px 8px;border-radius:5px;font-size:10.5px;font-weight:650;letter-spacing:.03em}
  .eng.cla{background:#eafaf1;color:#178a4c} .eng.cod{background:#eef0fb;color:#4b59d6}
  /* log */
  .logwrap{font:11.5px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-height:236px;overflow:auto;background:#fbfcfd;border:1px solid var(--line2);border-radius:8px;padding:10px 12px}
  .lg{white-space:pre-wrap;word-break:break-word;color:var(--ink2)}
  .lg.logw{color:var(--warn)} .lg.loge{color:var(--bad)} .lg.mut{color:var(--mut)}
  .ok{color:var(--ok)} .warn{color:var(--warn)} .bad{color:var(--bad)} .blu{color:var(--blu)} .mut{color:var(--mut)} .run{color:var(--blu)}
  .eng.cla,.eng.cod{color:inherit}
  @media(max-width:1180px){.r1,.r2,.r3{grid-template-columns:1fr 1fr}}
  @media(max-width:720px){.app{grid-template-columns:1fr}.side{display:none}.r1,.r2,.r3{grid-template-columns:1fr}}
</style></head><body>
<div class="app">
  <aside class="side">
    <div class="brand"><span class="logo">$ck</span><span><b>Engineering Loop</b><small>Autonomous dev cycle</small></span></div>
    <ul class="nav">
      <li><a class="on" href="#overview"><span class="gi">▦</span> Overview</a></li>
      <li><a href="#prs"><span class="gi">⤴</span> PRs</a></li>
      <li><a href="#queue"><span class="gi">☰</span> Issues Queue</a></li>
      <li><a href="#cycles"><span class="gi">↻</span> Cycles</a></li>
      <li><a href="#queue"><span class="gi">▤</span> Backlog</a></li>
      <li><a href="#logs"><span class="gi">≣</span> Logs</a></li>
    </ul>
    <div class="foot">
      <div class="ar"><span class="dot"></span> Auto-refresh <span class="pillbox">60s</span></div>
      Last updated<br>$(clock "$now_time")<br>$(e "$now_date")
    </div>
  </aside>
  <main class="main" id="overview">
    <div class="grid r1">
      <div class="card">
        <div class="ct"><h2>Health &amp; Liveness</h2></div>
        <div class="health">
          <div class="hbig">
            <div class="hring $hclass">$([ "$hclass" = bad ] && printf '%s' "$xk" || printf '%s' "$ck")</div>
            <div><div class="hword $hclass">$(e "$hword")</div><div class="hsub">$(e "$hsub")</div></div>
          </div>
          <div class="hstats">
            <div class="s"><div class="k">Host</div><div class="v"><span class="dot"></span>$(e "${host:-$NUC_HOST}")</div></div>
            <div class="s"><div class="k">Schedule</div><div class="v">$(e "${sched:-—}")</div><div class="sub $sched_cls">$sched_word</div></div>
            <div class="s"><div class="k">Last activity</div><div class="v">$([ -n "$ago" ] && rel "$ago" || echo "—")</div><div class="sub">$([ -n "$mtime" ] && { date -r "$mtime" "+%-I:%M %p" 2>/dev/null || date -d "@$mtime" "+%-I:%M %p" 2>/dev/null; } || echo "")</div></div>
            <div class="s"><div class="k">Worktrees</div><div class="v">${worktrees:-0}</div><div class="sub">$wt_sub</div></div>
            <div class="s"><div class="k">Next lane</div><div class="v">$(lane_pill "${rotation:-—}")</div></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="ct"><h2>Usage budget <span class="mut" style="text-transform:none;letter-spacing:0">(used)</span></h2></div>
        <div class="donuts">
          $(donut "$claude_used" 145 "Claude" "$claude_cap")
          $(donut "$codex_used" 35 "Codex" "$codex_cap")
        </div>
      </div>
      <div class="card">
        <div class="ct"><h2>Pipeline status</h2></div>
        <div class="fail">
          <div class="fic $fail_cls">$fail_icon</div>
          <div><div class="fw">$fail_word</div><div class="fs">$fail_n cycle failure(s) (recent) &middot; ${pr_fail:-0} conflicting or failing PRs</div></div>
          <div><div class="spark">$spark_bars</div><div class="sparklbl">recent cycles</div></div>
        </div>
      </div>
    </div>

    <div class="grid r2">
      <div class="card">
        <div class="ct"><h2>Current activity</h2></div>
        <div class="pulse">
          <div class="pwrap"><div class="pring"></div><div class="pcore $([ -n "$CUR" ] && echo run)">$([ -n "$CUR" ] && printf '↻' || printf '%s' "$ck")</div></div>
          <div class="ptext">
            <div class="st">$([ -n "$CUR" ] && echo "RUNNING" || echo "IDLE")</div>
            <div class="ss">$([ -n "$CUR" ] && e "$cwork" || echo "Waiting for next cycle")</div>
          </div>
          <div class="pmeta">
            $(if [ -n "$CUR" ]; then
                printf '<div class="kv"><span>Engine</span><b>%s</b></div>' "$(e "$ceng")"
                printf '<div class="kv"><span>Started</span><b>%s</b></div>' "$(e "$ctime")"
                [ -n "$ago" ] && printf '<div class="kv"><span>Elapsed</span><b>%s</b></div>' "$(fmt_dur "$ago")"
              else
                printf '<div class="kv"><span>Next run</span><b>%s</b></div>' "${nextrun:-—}"
                printf '<div class="kv"><span>Planned lane</span><b>%s</b></div>' "$(lane_pill "${rotation:-—}")"
              fi)
          </div>
        </div>
      </div>
      <div class="card" id="queue">
        <div class="ct"><h2>Queued next</h2><a href="https://github.com/$LOOP_REPO/issues" target="_blank">View full queue →</a></div>
        <ul class="queue">$queued_html</ul>
        <div class="qfoot">Engine likely for next: <b>$eng_next</b></div>
      </div>
      <div class="card">
        <div class="ct"><h2>Pipeline health</h2><a href="https://github.com/$LOOP_REPO/issues" target="_blank">View all issues →</a></div>
        <div class="pipe">
          <div><div class="pn ok">${qn:-0}</div><div class="pk">Ready to work</div><div class="psub">Loopable issues</div></div>
          <div><div class="pn warn">${nd:-0}</div><div class="pk">Needs design</div><div class="psub">Blocked</div></div>
          <div><div class="pn blu">${dq:-0}</div><div class="pk">Data quality</div><div class="psub">Needs attention</div></div>
        </div>
        <div class="pbar">
          <div class="pi $pipe_cls">$([ "$pipe_cls" = bad ] && printf '%s' "$xk" || printf '%s' "$ck")</div>
          <div><div class="pw">$pipe_word</div><div class="ps">$pipe_sub</div></div>
          $pipe_spark
        </div>
      </div>
      <div class="card">
        <div class="ct"><h2>System info</h2></div>
        <div class="sys">
          <div class="row"><span class="k">Server time</span><span class="v">$(clock "$now_time")</span></div>
          <div class="row"><span class="k">Uptime</span><span class="v">$(e "${uptime_h:-—}")</span></div>
          <div class="row"><span class="k">Time zone</span><span class="v">$(e "${tz:-—}")</span></div>
          <div class="row"><span class="k">Platform</span><span class="v">$(e "${platform:-—}")</span></div>
          <div class="row"><span class="k">GitHub API</span><span class="v $gh_cls"><span class="dot" style="background:currentColor"></span>$gh_word</span></div>
          <div class="row"><span class="k">Loop version</span><span class="v">$(e "${version:-—}")</span></div>
        </div>
      </div>
    </div>

    <div class="grid r3" id="prs">
      <div class="card">
        <div class="ct"><h2>Pull requests</h2><a href="https://github.com/$LOOP_REPO/pulls" target="_blank">View all →</a></div>
        <table><thead><tr><th>PR</th><th>Status</th><th>Lane</th><th>Title</th></tr></thead><tbody>$prlist_html</tbody></table>
      </div>
      <div class="card" id="cycles">
        <div class="ct"><h2>Recent cycles <span class="mut" style="text-transform:none;letter-spacing:0">(last 10)</span></h2></div>
        <table><thead><tr><th>Time</th><th>Engine</th><th>Lane</th><th>Work item</th><th>Outcome</th></tr></thead><tbody>$cycles_html</tbody></table>
      </div>
    </div>

    <div class="grid" id="logs" style="margin-top:14px">
      <div class="card">
        <div class="ct"><h2>Log tail <span class="mut" style="text-transform:none;letter-spacing:0">($(e "${host:-$NUC_HOST}"))</span></h2><span class="mut" style="font-size:12px">last $TAIL_N</span></div>
        <div class="logwrap">$logtail_html</div>
      </div>
    </div>

    <footer style="margin-top:18px;color:var(--mut);font-size:11px">generated $gen · auto-refreshes every 60s · read-only · repo $LOOP_REPO</footer>
  </main>
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
  printf '%s\n' "$RECENT_PR_ROWS" | while IFS=$'\t' read -r num state cat age title; do
    sc="$GRN"; case "$state" in OPEN) sc="$BLU" ;; CLOSED) sc="$DIM" ;; esac
    [ ${#title} -gt 46 ] && title="${title:0:45}…"
    printf '  %s#%-4s%s %s%-7s%s %-11s %-46s %s%s%s\n' "$B" "$num" "$R" "$sc" "$state" "$R" "$cat" "$title" "$DIM" "$(rel "${age:-0}")" "$R"
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
