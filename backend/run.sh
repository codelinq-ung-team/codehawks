#!/bin/sh
set -eu
cd "${LAMBDA_TASK_ROOT:-/var/task}"
exec python -m gunicorn --bind "127.0.0.1:${PORT:-8000}" --workers 1 --threads 2 --worker-class gthread --timeout 110 --access-logfile /dev/null backend.app:app
