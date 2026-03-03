#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_BUILD="${SKIP_BUILD:-0}"
STOP_DB_ON_EXIT="${STOP_DB_ON_EXIT:-0}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd docker
require_cmd go
require_cmd npm

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "${UI_PID:-}" ]] && kill -0 "$UI_PID" 2>/dev/null; then
    kill -- "-$UI_PID" 2>/dev/null || true
  fi

  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill -- "-$BACKEND_PID" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  if [[ "$STOP_DB_ON_EXIT" == "1" ]]; then
    echo "[prod] Stopping MongoDB..."
    (cd "$ROOT_DIR" && docker compose down)
  fi
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
echo "[prod] Starting MongoDB..."
docker compose up -d mongodb

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "[prod] Building Next.js UI..."
  (
    cd "$ROOT_DIR/ui"
    npm run build
  )
fi

echo "[prod] Starting backend on :8090..."
setsid bash -lc "cd \"$ROOT_DIR\" && exec go run cmd/server/main.go" &
BACKEND_PID=$!

echo "[prod] Starting Next.js production server on :3000..."
setsid bash -lc "cd \"$ROOT_DIR/ui\" && exec env NODE_ENV=production npm run start -- -H 0.0.0.0 -p 3000" &
UI_PID=$!

echo "[prod] Running. Press Ctrl+C to stop backend + UI."
echo "[prod] Set STOP_DB_ON_EXIT=1 to also stop MongoDB on exit."
wait -n "$BACKEND_PID" "$UI_PID"
