#!/usr/bin/env python3
"""Tiny always-on HTTP server for the eng-loop dashboard.

Runs ON the NUC (kept alive by the eng-loop-status systemd user service). On each
request it shells out to `status.sh --html --local` and serves the resulting card
dashboard, with a short TTL cache so rapid refreshes / multiple viewers don't
hammer `gh`. Read-only: it never mutates anything.

Env: STATUS_PORT (default 8799) · STATUS_LIB (dir holding status.sh; default
     ~/eng-loop/status-server/lib) · STATUS_TTL seconds (default 15) · STATUS_BIND
     (default 0.0.0.0).
"""
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("STATUS_PORT", "8799"))
BIND = os.environ.get("STATUS_BIND", "0.0.0.0")
LIB = os.environ.get("STATUS_LIB", os.path.expanduser("~/eng-loop/status-server/lib"))
STATUS = os.path.join(LIB, "status.sh")
TTL = float(os.environ.get("STATUS_TTL", "15"))

_lock = threading.Lock()
_cache = {"ts": 0.0, "html": b"", "err": ""}


def _esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render():
    """Run status.sh; return (html_bytes | None, err_str)."""
    try:
        p = subprocess.run(
            ["bash", STATUS, "--html", "--local"],
            capture_output=True, timeout=60,
        )
        if p.returncode != 0:
            return None, p.stderr.decode(errors="replace") or f"status.sh exit {p.returncode}"
        return p.stdout, ""
    except Exception as e:  # noqa: BLE001 — surface anything to the page
        return None, str(e)


def get_html():
    """Cached render. On failure, fall back to the last good page if we have one."""
    now = time.time()
    with _lock:
        if _cache["html"] and now - _cache["ts"] < TTL:
            return _cache["html"], ""
    html, err = render()
    with _lock:
        if html is not None:
            _cache.update(ts=now, html=html, err="")
            return html, ""
        _cache["err"] = err
        return (_cache["html"] or None), err


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="text/html; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/healthz":
            self._send(200, b"ok\n", "text/plain; charset=utf-8")
            return
        html, err = get_html()
        if html is None:
            body = (
                "<!doctype html><meta charset=utf-8>"
                "<body style='margin:0;background:#0d1117;color:#f85149;"
                "font:13px/1.5 ui-monospace,Menlo,monospace;padding:24px'>"
                "<h1 style='font-size:14px'>eng-loop status unavailable</h1>"
                f"<pre style='white-space:pre-wrap'>{_esc(err)}</pre>"
                "<p style='color:#6e7681'>the server is up; status.sh failed to render. "
                "retry shortly.</p>"
            ).encode()
            self._send(503, body)
            return
        self._send(200, html)

    def log_message(self, *args):  # keep the journal quiet
        return


def main():
    httpd = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"eng-loop status server listening on {BIND}:{PORT} (lib={LIB}, ttl={TTL}s)", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
