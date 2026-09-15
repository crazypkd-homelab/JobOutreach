#!/usr/bin/env bash
# Deploy JobOutreach locally via Docker Compose.
#
# Builds the image from the current source (not the remote `latest` tag),
# (re)starts the container, and verifies the health endpoint.
#
# Usage:
#   ./deploy.sh              # build + up + healthcheck (default)
#   ./deploy.sh --no-build   # skip the build step, just (re)start
#   ./deploy.sh --down       # stop and remove the container
#   ./deploy.sh --logs       # tail container logs after deploy
#   ./deploy.sh --help       # show this help

set -euo pipefail

# Resolve the repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${JO_PORT:-8787}"
SERVICE="joboutreach"
HEALTH_URL="http://localhost:${PORT}/healthz"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

DO_BUILD=1
DO_DOWN=0
DO_LOGS=0

for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --down)     DO_DOWN=1 ;;
    --logs)     DO_LOGS=1 ;;
    --help|-h)  usage ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Preflight: docker + compose available.
if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found on PATH" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "error: 'docker compose' subcommand not available" >&2
  exit 1
fi

if [[ "$DO_DOWN" -eq 1 ]]; then
  echo "==> Stopping $SERVICE"
  docker compose down
  echo "==> Stopped"
  exit 0
fi

if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "==> Building image from local source"
  docker compose build
fi

echo "==> (Re)starting container"
docker compose up -d

echo "==> Waiting for healthcheck on $HEALTH_URL"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done

if [[ "$ok" -ne 1 ]]; then
  echo "error: $SERVICE did not become healthy within 30s" >&2
  echo "--- last 20 log lines ---" >&2
  docker compose logs --tail=20 "$SERVICE" >&2 || true
  exit 1
fi

echo "==> Healthy: $HEALTH_URL -> $(curl -fsS "$HEALTH_URL")"
echo "==> Deployed: http://localhost:${PORT}"

if [[ "$DO_LOGS" -eq 1 ]]; then
  echo "==> Tailing logs (Ctrl-C to stop)"
  docker compose logs -f "$SERVICE"
fi
