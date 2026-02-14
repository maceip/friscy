#!/bin/bash
# Test: Go echo server full accept/read/write flow in friscy (native)
# Verifies: accept4, getsockname, read/write socket bridging, epoll_pwait socket polling
set -euo pipefail

FRISCY="$(dirname "$0")/../build-native/friscy"
BINARY="/tmp/gotest/echo_minimal"
PORT=9999
TIMEOUT=30
PASS=0
FAIL=0

if [[ ! -x "$FRISCY" ]]; then
    echo "SKIP: build-native/friscy not found (run: cd build-native && make)"
    exit 0
fi
if [[ ! -f "$BINARY" ]]; then
    echo "SKIP: $BINARY not found"
    exit 0
fi

cleanup() {
    [[ -n "${FRISCY_PID:-}" ]] && kill "$FRISCY_PID" 2>/dev/null || true
    wait "$FRISCY_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Start the echo server in friscy
echo "=== Starting friscy echo server ==="
"$FRISCY" "$BINARY" > /tmp/friscy_echo_test.log 2>&1 &
FRISCY_PID=$!

# Wait for server to be ready
echo -n "Waiting for server..."
for i in $(seq 1 $TIMEOUT); do
    if curl -s --max-time 1 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
        echo " ready (${i}s)"
        break
    fi
    if ! kill -0 "$FRISCY_PID" 2>/dev/null; then
        echo " FAIL (friscy exited)"
        echo "Log:"
        tail -20 /tmp/friscy_echo_test.log
        exit 1
    fi
    echo -n "."
    sleep 1
done

check() {
    local name="$1" expected="$2" actual="$3"
    if echo "$actual" | grep -qF "$expected"; then
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name"
        echo "    expected: $expected"
        echo "    got: $actual"
        FAIL=$((FAIL + 1))
    fi
}

echo ""
echo "=== Test 1: GET / (hello endpoint) ==="
RESP=$(curl -s --max-time 5 "http://127.0.0.1:$PORT/")
echo "  Response: $RESP"
check "status message" '"message":"Hello from friscy!"' "$RESP"
check "arch field" '"arch":"riscv64"' "$RESP"

echo ""
echo "=== Test 2: GET /health ==="
RESP=$(curl -s --max-time 5 "http://127.0.0.1:$PORT/health")
echo "  Response: $RESP"
check "health status" '"status":"ok"' "$RESP"

echo ""
echo "=== Test 3: POST /echo with body ==="
RESP=$(curl -s --max-time 5 -X POST -H "Content-Type: text/plain" -d "hello friscy" "http://127.0.0.1:$PORT/echo")
echo "  Response: $RESP"
check "echo method" '"method":"POST"' "$RESP"
check "echo body" '"body":"hello friscy"' "$RESP"

echo ""
echo "=== Test 4: HTTP status codes ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:$PORT/")
check "GET / returns 200" "200" "$STATUS"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:$PORT/nonexistent")
check "GET /nonexistent returns 404" "404" "$STATUS"

echo ""
echo "=== Test 5: Multiple sequential requests ==="
for i in 1 2 3; do
    RESP=$(curl -s --max-time 5 "http://127.0.0.1:$PORT/health")
    check "request #$i" '"status":"ok"' "$RESP"
done

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
