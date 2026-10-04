#!/usr/bin/env bash
# Runs the API on port 8000 and the built website on port 4173, as the README's local setup does.
# Uses no network and writes nothing outside the repository once scripts/build-local.sh has run;
# if that has not happened yet, it runs it first.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [ ! -x .venv/bin/python ] || [ ! -x apps/web/node_modules/.bin/vite ] || [ ! -f apps/web/dist/index.html ]; then
  bash scripts/build-local.sh
fi

(cd apps && exec ../.venv/bin/python -m flask --app backend.app run --port 8000) &
api=$!
trap 'kill "$api" 2>/dev/null || true' EXIT

# Vite is started directly: npm would write its logs to the home directory.
cd apps/web
node_modules/.bin/vite preview --host 0.0.0.0 --port "${PORT:-4173}"
