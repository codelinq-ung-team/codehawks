#!/usr/bin/env bash
# Run by the "Deploy hackathon" workflow before app/public/ is published.
# app/public/ is synced to S3 with --delete, so everything the site serves must exist there when this finishes.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The LinqLife website goes in the root of app/public/. Keep it ABOVE the Advisor3D line,
# and never clear app/public/advisor3d/ after that line runs.
bash scripts/build-frontend.sh
bash scripts/build-advisor3d.sh
