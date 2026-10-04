#!/usr/bin/env bash
# Installs and builds everything scripts/run-local.sh needs. This is the only step that uses the network.
# Package caches stay inside the repository (.cache/), so nothing is written outside it.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export PIP_CACHE_DIR="$root/.cache/pip" npm_config_cache="$root/.cache/npm" npm_config_update_notifier=false

python3 -m venv .venv
.venv/bin/pip install -q --disable-pip-version-check -r apps/backend/requirements.txt

cd apps/web
npm ci --no-audit --no-fund
npm run build
echo "Built. Start it with: bash scripts/run-local.sh"
