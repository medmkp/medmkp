---
name: eng-loop-status
description: Show what the engineering quality loop (eng-loop) is doing right now — liveness, current run, recent ticks, open loop PRs, backlog — without SSHing the NUC. Wraps scripts/eng-loop/status.sh. Use when the user asks "what's the eng-loop doing", "eng-loop status", "is the loop running", "is the NUC up", or wants the loop dashboard / web view.
allowed-tools:
  - Bash
  - Read
---

# /eng-loop-status — engineering-loop dashboard

A thin wrapper over [`scripts/eng-loop/status.sh`](../../../scripts/eng-loop/status.sh) — the
read-only status tool for the autonomous quality loop running on the NUC. It fans out one
`ssh` call (crontab, `cron.log`, usage, worktrees) plus local `gh` calls (open loop PRs,
backlog) and prints a one-screen summary. See `scripts/eng-loop/README.md` for how the loop
works.

The user's argument is in `$ARGUMENTS`. Pick the mode from it:

## Terminal view (default)

For anything that isn't an explicit web/open request, run the CLI and relay the output:

```bash
scripts/eng-loop/status.sh
```

- Pass `-n N` through if the user asks for more/less log tail (e.g. "show 40 log lines" →
  `scripts/eng-loop/status.sh -n 40`).
- The script colorizes for a TTY and degrades to plain text when piped — don't add flags to
  force that.
- If it prints **NUC unreachable**, that's expected when the NUC is offline (it's sometimes
  off). Report it plainly; the GitHub-side PR/backlog sections still populate. Do not retry in
  a loop or try to SSH the NUC yourself.

After it runs, give the user a 1–2 line readout of what matters *now* — e.g. "Loop is idle,
last tick 8m ago on codex; 5 loop PRs open awaiting review; Codex usage is below the 50%
gate so it's on the Codex fallback." Don't just dump the table and stop.

## Web view (when asked for "web", "html", "open", "browser", or "a page")

Generate the self-contained, auto-refreshing HTML dashboard and open it:

```bash
scripts/eng-loop/status.sh --html /tmp/eng-loop-status.html && open /tmp/eng-loop-status.html
```

The page re-fetches every 60s on its own (meta refresh) — tell the user they can leave the
tab open as a live monitor. To regenerate without reopening, just re-run the `--html` line.
It's a static file (no server, no secrets); on a remote/headless host, skip `open` and just
report the path.

## Notes
- **Read-only.** This skill never merges, edits, or mutates anything — it only reports.
- Env knobs (rarely needed): `NUC_HOST` (default `nuc`), `NUC_LOOP_HOME` (default
  `~/eng-loop` on the NUC). Same as the underlying script.
