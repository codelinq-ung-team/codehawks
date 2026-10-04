#!/bin/sh
set -eu
cd "${LAMBDA_TASK_ROOT:-/var/task}"
# Lambda freezes the whole process between invocations. Its 120s invocation limit
# and the SDK timeouts bound requests; a worker heartbeat must not count frozen time.
# Close local HTTP connections after each response to avoid stale adapter sockets
# after thaw. The management socket is unused and its default home is read-only.
exec python -m gunicorn --bind "127.0.0.1:${PORT:-8000}" --workers 1 --threads 2 --worker-class gthread --timeout 0 --keep-alive 0 --no-control-socket --worker-tmp-dir /tmp --access-logfile /dev/null backend.app:app
