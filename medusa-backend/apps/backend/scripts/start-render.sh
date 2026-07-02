#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

echo "Medusa Render start"
echo "Initial cwd: $(pwd)"
echo "App root: $APP_ROOT"

# Detect the built server by its compiled config, which `medusa build` always
# emits — the admin build (public/admin) is absent when DISABLE_ADMIN=true.
if [ -f "$APP_ROOT/.medusa/server/medusa-config.js" ]; then
  echo "Using built Medusa server: $APP_ROOT/.medusa/server"
  cd "$APP_ROOT/.medusa/server"
elif [ -f "$APP_ROOT/medusa-config.js" ]; then
  echo "Already inside built Medusa server: $APP_ROOT"
  cd "$APP_ROOT"
else
  echo "Could not find Medusa server build output."
  echo "Expected one of:"
  echo "  $APP_ROOT/.medusa/server/medusa-config.js"
  echo "  $APP_ROOT/medusa-config.js"
  echo "Nearby medusa-config.js files:"
  find "$APP_ROOT" -maxdepth 5 -name medusa-config.js -print || true
  exit 1
fi

echo "Runtime cwd: $(pwd)"

# Node sizes V8's old space from total memory very conservatively — 256MB on
# the 512MB Starter instance, where the server idles at ~190MB heap after boot
# and routine catalog requests each need another 25-40MB, so concurrent traffic
# OOM'd (exit 134) while the container itself still had ~200MB free. Size the
# heap to 70% of the container's cgroup limit instead (the rest covers
# non-heap process memory and the npm wrapper), on any instance plan. Skipped
# when NODE_OPTIONS is already set, or off-cgroup (local dev).
if [ -z "${NODE_OPTIONS:-}" ]; then
  MEM_LIMIT=$( { cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null; } || true )
  case "$MEM_LIMIT" in
    "" | max | *[!0-9]*) ;;
    *)
      # cgroup v1 reports "unlimited" as a huge number; only trust real limits.
      if [ "$MEM_LIMIT" -ge 268435456 ] && [ "$MEM_LIMIT" -le 68719476736 ]; then
        export NODE_OPTIONS="--max-old-space-size=$((MEM_LIMIT / 1048576 * 70 / 100))"
        echo "Sized V8 old space from container limit ${MEM_LIMIT}B: NODE_OPTIONS=$NODE_OPTIONS"
      fi
      ;;
  esac
fi

exec medusa start --host 0.0.0.0 --port "${PORT:-9000}"
