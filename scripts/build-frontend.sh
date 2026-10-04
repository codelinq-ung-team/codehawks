#!/usr/bin/env bash
# Builds the LincLife website (codelinc_frontend) into the root of app/public/.
# Called from scripts/build-app.sh before the Advisor3D build. Needs Node 20.19+.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/codelinc_frontend"

npm ci --no-audit --no-fund
npm run build

out="$root/app/public"
mkdir -p "$out"
# Replace only the website's own files; app/public/advisor3d/ is left alone.
rm -rf "$out/assets"
cp -R dist/. "$out/"
echo "LincLife built into app/public/ (the chat calls /api/intake)"
