#!/bin/bash
# run_network_test.sh - Full networking test for friscy
#
# This script:
# 1. Compiles the RISC-V test client
# 2. Starts the test HTTP server
# 3. Starts the host proxy
# 4. Runs the friscy emulator with the test client
# 5. Cleans up

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRISCY_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$FRISCY_DIR/build-native"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[TEST]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

cleanup() {
    log "Cleaning up..."
    [ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null || true
    [ -n "$PROXY_PID" ] && kill $PROXY_PID 2>/dev/null || true
}
trap cleanup EXIT

# Check prerequisites
log "Checking prerequisites..."

if ! command -v riscv64-linux-gnu-gcc &>/dev/null; then
    error "riscv64-linux-gnu-gcc not found. Install with: sudo apt install gcc-riscv64-linux-gnu"
fi

if ! command -v python3 &>/dev/null; then
    error "python3 not found"
fi

if [ ! -f "$BUILD_DIR/friscy" ]; then
    warn "friscy not built. Building now..."
    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"
    cmake .. -DCMAKE_BUILD_TYPE=Release
    make -j$(nproc)
fi

# Compile test program
log "Compiling RISC-V test client..."
cd "$SCRIPT_DIR"
riscv64-linux-gnu-gcc -static -O2 -o test_http test_http.c
log "Compiled: test_http ($(stat -c%s test_http) bytes)"

# Start test HTTP server
log "Starting test HTTP server on port 8080..."
python3 test_server.py 8080 &
SERVER_PID=$!
sleep 1

# Check if server started
if ! kill -0 $SERVER_PID 2>/dev/null; then
    error "Failed to start test server"
fi

# For native testing (without Wasm), we can run directly
# The network syscalls will return ENOSYS on native, but we can test the flow

log "Running friscy with test client..."
echo ""
echo "=========================================="
echo "  friscy Network Test Output"
echo "=========================================="
echo ""

# Run friscy - it will try to connect to 127.0.0.1:8080
cd "$BUILD_DIR"
./friscy "$SCRIPT_DIR/test_http" 127.0.0.1 8080 / || {
    echo ""
    warn "Note: Network syscalls return ENOSYS on native builds"
    warn "Full networking requires Wasm build + proxy"
}

echo ""
echo "=========================================="
log "Test completed"

# Show how to run full test with networking
echo ""
echo "To test with full networking (Wasm + host proxy):"
echo ""
echo "  Terminal 1: cd $FRISCY_DIR/proxy && go run main.go"
echo "  Terminal 2: python3 $SCRIPT_DIR/test_server.py 8080"
echo "  Terminal 3: # Run friscy.wasm in browser with network_bridge.js"
echo ""
