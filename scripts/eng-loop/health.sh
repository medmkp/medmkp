#!/usr/bin/env bash
# scripts/eng-loop/health.sh — health verdict + alerting for the engineering loop.
#
# Single owner of the per-tick health record schema (logs/health.jsonl) and of
# the verdict logic that turns those records into OK / DEGRADED / STALLED / DOWN.
# Used four ways:
#   health.sh emit    append one record (called by run-loop.sh; reads EL_* env)
#   health.sh alert   recompute verdict; POST to ALERT_WEBHOOK_URL on state change
#                     (edge-triggered: alert once on OK->bad, re-arm every
#                      HEALTH_REARM_HOURS while bad, "recovered" on bad->OK)
#   health.sh json    print {"verdict","reason","detail"} (status.sh banner)
#   health.sh         print "VERDICT — detail" (humans)
#
# Read-only except logs/health.jsonl (emit) and .health-state (alert).
# The webhook URL is a secret: it lives in an untracked secrets.env (sourced by
# config.env) or the environment, never in the repo.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[ -f "$here/config.env" ] && . "$here/config.env"
export LOOP_HOME="${LOOP_HOME:-$HOME/eng-loop}"
export HEALTH_FAIL_STREAK="${HEALTH_FAIL_STREAK:-3}"
export HEALTH_STALL_HOURS="${HEALTH_STALL_HOURS:-24}"
export HEALTH_REARM_HOURS="${HEALTH_REARM_HOURS:-6}"
export ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

exec python3 - "$@" <<'PY'
import json, os, sys, time, urllib.request

HOME      = os.environ.get("LOOP_HOME", os.path.expanduser("~/eng-loop"))
HEALTH    = os.path.join(HOME, "logs", "health.jsonl")
STATE     = os.path.join(HOME, ".health-state")
STREAK_N  = int(os.environ.get("HEALTH_FAIL_STREAK", "3"))
STALL_H   = float(os.environ.get("HEALTH_STALL_HOURS", "24"))
REARM_H   = float(os.environ.get("HEALTH_REARM_HOURS", "6"))
WEBHOOK   = os.environ.get("ALERT_WEBHOOK_URL", "")
# Engine errors that mean "this engine cannot run at all" (vs. a one-off flake).
HARD      = {"model_not_found", "auth", "rate_limit"}


def load(n=50):
    out = []
    try:
        with open(HEALTH) as f:
            for line in f:
                line = line.strip()
                if line:
                    try: out.append(json.loads(line))
                    except Exception: pass
    except FileNotFoundError:
        return []
    return out[-n:]


# ---- emit: append one record (classifies the run from its transcript) --------
def read_claude(transcript):
    model = result = None
    try:
        with open(transcript, errors="ignore") as f:
            for line in f:
                if model is None and '"subtype":"init"' in line:
                    try: model = json.loads(line).get("model")
                    except Exception: pass
                if '"type":"result"' in line:
                    try: result = json.loads(line)
                    except Exception: pass
    except OSError:
        pass
    return model, result


def emit():
    e = os.environ
    engine = e.get("EL_ENGINE", "?")
    fmt    = e.get("EL_ENGINE_FMT", "")
    rc     = e.get("EL_RC", "")
    transcript = e.get("EL_TRANSCRIPT", "")
    pr_action  = e.get("EL_PR_ACTION", "none")
    pr_number  = e.get("EL_PR_NUMBER", "")
    model  = e.get("EL_MODEL", "") or "default"
    tokens, error_class, is_error = -1, "none", False

    if fmt == "claude" and transcript and os.path.exists(transcript):
        m, result = read_claude(transcript)
        if m: model = m
        if result:
            is_error = bool(result.get("is_error"))
            tokens   = (result.get("usage") or {}).get("output_tokens", -1)
            st       = result.get("api_error_status")
            blob     = ((result.get("result") or "") + " " + str(result.get("error") or "")).lower()
            if is_error:
                if "model_not_found" in blob or st == 404:                 error_class = "model_not_found"
                elif st == 401 or "unauthor" in blob or "authentication" in blob: error_class = "auth"
                elif st == 429 or ("rate" in blob and "limit" in blob):    error_class = "rate_limit"
                else:                                                       error_class = "api_error"
    if rc == "124":  # GNU timeout exit code → the run was killed at the ceiling
        is_error, error_class = True, "timeout"

    if fmt == "claude":
        outcome = "FAIL" if is_error else ("ok-pr" if pr_action != "none" else "ok-quiet")
    else:  # codex: only the transcript-less rc is available; be conservative so a
           # quiet codex tick (rc=1, no changes) is NOT misread as a failure.
        outcome = "FAIL" if rc == "124" else ("ok-pr" if pr_action != "none" else "ok-quiet")
    if outcome == "FAIL":
        pr_action, pr_number = "none", ""

    rec = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ts_epoch": int(time.time()),
        "engine": engine, "model": model,
        "mode": e.get("EL_MODE", ""), "mode_kind": e.get("EL_MODE_KIND", ""),
        "category": e.get("EL_CATEGORY", ""), "exit_code": rc,
        "outcome": outcome, "error_class": error_class,
        "tokens_out": tokens, "duration_s": int(e.get("EL_DUR", "0") or 0),
        "pr_action": pr_action, "pr_number": pr_number,
    }
    os.makedirs(os.path.dirname(HEALTH), exist_ok=True)
    with open(HEALTH, "a") as f:
        f.write(json.dumps(rec) + "\n")


# ---- verdict: turn the tail of health.jsonl into a single judgement ----------
def verdict():
    recs = load()
    if not recs:
        return "UNKNOWN", "no-data", "no health records yet"
    last, now = recs[-1], time.time()

    # DOWN — the last run hit an error that means the engine can't run at all.
    if last.get("outcome") == "FAIL" and last.get("error_class") in HARD:
        return ("DOWN", last["error_class"],
                f"last {last.get('engine')} run failed: {last['error_class']} "
                f"(model {last.get('model')})")

    # DOWN — a run of consecutive failures of any kind.
    streak = 0
    for r in reversed(recs):
        if r.get("outcome") == "FAIL": streak += 1
        else: break
    if streak >= STREAK_N:
        return "DOWN", "fail-streak", f"{streak} consecutive failed ticks"

    # STALLED — no PR produced within the window despite ticks that were trying
    # (issue / reconcile / revise work, or failures). A quiet backlog won't trip it.
    last_pr = next((r["ts_epoch"] for r in reversed(recs)
                    if r.get("pr_action") in ("created", "reconciled", "revised")), None)
    working = [r for r in recs
              if r.get("mode_kind") in ("issue", "reconcile", "revise") or r.get("outcome") == "FAIL"]
    base = last_pr if last_pr is not None else float(recs[0].get("ts_epoch", now))
    hrs = (now - float(base)) / 3600
    if hrs >= STALL_H and working:
        return "STALLED", "no-pr", f"no PR produced in {hrs:.0f}h ({len(working)} working ticks)"

    # DEGRADED — elevated failure rate but still producing.
    recent = recs[-10:]
    fails = sum(1 for r in recent if r.get("outcome") == "FAIL")
    if fails >= max(2, len(recent) // 2):
        return "DEGRADED", "fail-rate", f"{fails}/{len(recent)} recent ticks failed"

    return "OK", "healthy", f"last tick: {last.get('outcome')} ({last.get('mode') or last.get('mode_kind')})"


# ---- alert: edge-triggered webhook ------------------------------------------
def send(msg):
    if not WEBHOOK:
        sys.stderr.write("health: ALERT_WEBHOOK_URL unset — alert suppressed\n")
        return
    key = "content" if "discord" in WEBHOOK else "text"  # Discord vs Slack payload
    data = json.dumps({key: msg}).encode()
    req = urllib.request.Request(WEBHOOK, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as ex:
        sys.stderr.write(f"health: webhook POST failed: {ex}\n")


def alert():
    v, r, d = verdict()
    prev, last_alert = "OK", 0.0
    try:
        with open(STATE) as f:
            parts = f.read().split()
            prev = parts[0]; last_alert = float(parts[1]) if len(parts) > 1 else 0.0
    except (OSError, ValueError, IndexError):
        pass
    now = time.time()
    bad = lambda x: x in ("DOWN", "STALLED")
    if bad(v):
        if not bad(prev) or (now - last_alert) >= REARM_H * 3600:
            send(f"\U0001F534 eng-loop {v}: {d}\nCheck: /eng-loop-status")
            last_alert = now
    elif v == "OK" and bad(prev):
        send(f"✅ eng-loop recovered: {d}")
    try:
        with open(STATE, "w") as f:
            f.write(f"{v} {last_alert:.0f}\n")
    except OSError:
        pass
    print(f"{v} {r}")


cmd = sys.argv[1] if len(sys.argv) > 1 else "verdict"
if cmd == "emit":
    emit()
elif cmd == "alert":
    alert()
elif cmd == "json":
    v, r, d = verdict()
    print(json.dumps({"verdict": v, "reason": r, "detail": d}))
else:
    v, r, d = verdict()
    print(f"{v} — {d}")
PY
