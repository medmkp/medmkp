#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

echo "Medusa Render start"
echo "Initial cwd: $(pwd)"
echo "App root: $APP_ROOT"

if [ -f "$APP_ROOT/.medusa/server/public/admin/index.html" ]; then
  echo "Using built Medusa server: $APP_ROOT/.medusa/server"
  cd "$APP_ROOT/.medusa/server"
elif [ -f "$APP_ROOT/public/admin/index.html" ]; then
  echo "Already inside built Medusa server: $APP_ROOT"
  cd "$APP_ROOT"
else
  echo "Could not find Medusa admin build output."
  echo "Expected one of:"
  echo "  $APP_ROOT/.medusa/server/public/admin/index.html"
  echo "  $APP_ROOT/public/admin/index.html"
  echo "Nearby index.html files:"
  find "$APP_ROOT" -maxdepth 5 -name index.html -print || true
  exit 1
fi

echo "Runtime cwd: $(pwd)"
exec medusa start --host 0.0.0.0 --port "${PORT:-9000}"
