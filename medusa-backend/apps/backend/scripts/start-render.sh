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
exec medusa start --host 0.0.0.0 --port "${PORT:-9000}"
