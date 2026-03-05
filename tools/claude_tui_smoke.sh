#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-9090}"
REPORT="${2:-/home/pooppoop/friscy/build/test-reports/claude-tui-gate.json}"

ROOT_DIR="/home/pooppoop/friscy"
SERVE_DIR="${ROOT_DIR}/friscy-bundle"

mkdir -p "$(dirname "$REPORT")"

pushd "$SERVE_DIR" >/dev/null
node serve.js "$PORT" >/tmp/friscy-serve.log 2>&1 &
SERVE_PID=$!
popd >/dev/null

cleanup() {
  kill "$SERVE_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 2

node "${ROOT_DIR}/tools/claude_tui_gate.mjs" --port "$PORT" --report "$REPORT"
echo "Smoke complete. Report: $REPORT"
