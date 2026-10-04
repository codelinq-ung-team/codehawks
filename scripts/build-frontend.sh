#!/usr/bin/env bash
# Builds the LinqLife website (codelinq_frontend) into the root of app/public/.
# Called from scripts/build-app.sh before the Advisor3D build. Needs Node 20.19+.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/codelinq_frontend"

npm ci --no-audit --no-fund
npm run build

out="$root/app/public"
mkdir -p "$out"
# Replace only the website's own files; app/public/advisor3d/ is left alone.
rm -rf "$out/assets"
cp -R dist/. "$out/"
echo "LinqLife built into app/public/ (the chat calls /api/intake)"
