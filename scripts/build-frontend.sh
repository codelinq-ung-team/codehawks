#!/usr/bin/env bash
# Builds the LincLife website (apps/web) into the root of build/site/.
# Called from scripts/build-app.sh before the Advisor3D build. Needs Node 20.19+.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/apps/web"

npm ci --no-audit --no-fund
npm run build

out="$root/build/site"
mkdir -p "$out"
# Replace only the website's own files; build/site/advisor3d/ is left alone.
rm -rf "$out/assets"
cp -R dist/. "$out/"
echo "LincLife built into build/site/ (the chat calls /api/intake)"
