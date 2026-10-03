#!/usr/bin/env bash
# Run by the "Deploy hackathon" workflow before app/public/ is published.
# app/public/ is synced to S3 with --delete, so everything the site serves must exist there when this finishes.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# When the 2D frontend (codelinq_frontend) is wired in, build it and copy its output into
# app/public/ ABOVE the Advisor3D line below, and do not delete app/public/advisor3d/.

bash scripts/build-advisor3d.sh
