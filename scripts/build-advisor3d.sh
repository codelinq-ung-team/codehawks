#!/usr/bin/env bash
# Builds the Advisor3D WebXR prototype into app/public/advisor3d/.
# Safe to call from scripts/build-app.sh (see docs/advisor3d.md). Needs Node 20+.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/advisor3d"

npm ci --no-audit --no-fund
npm run build

out="$root/app/public/advisor3d"
rm -rf "$out"
mkdir -p "$out"
cp -R dist/. "$out/"
echo "Advisor3D built into app/public/advisor3d/ (open /advisor3d/index.html)"
