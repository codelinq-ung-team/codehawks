#!/usr/bin/env bash
# Run by the "Deploy hackathon" workflow before build/site/ is published.
# build/site/ is synced to S3 with --delete, so everything the site serves must exist there when this finishes.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The LincLife website goes in the root of build/site/. Keep it ABOVE the Advisor3D line,
# and never clear build/site/advisor3d/ after that line runs.
bash scripts/build-frontend.sh
bash scripts/build-advisor3d.sh
