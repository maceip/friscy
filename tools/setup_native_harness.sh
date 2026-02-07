#!/bin/bash
# ============================================================================
# friscy -- Local (non-Docker) build setup for libriscv -> Wasm
#
# This installs Emscripten SDK locally and builds without Docker.
# For Docker-based builds, use harness.sh instead.
#
# Tested on: Ubuntu 22.04+, Debian 12+
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$(cd "$SCRIPT_DIR/../runtime" && pwd)"
cd "$RUNTIME_DIR"

echo "=== friscy: Local Emscripten build setup ==="

# 1. System dependencies
echo "Installing system dependencies..."
if command -v apt-get &>/dev/null; then
    sudo apt-get update
    sudo apt-get install -y \
        build-essential cmake git python3 nodejs npm xz-utils wget
elif command -v dnf &>/dev/null; then
    sudo dnf install -y \
        gcc gcc-c++ cmake git python3 nodejs npm xz wget
else
    echo "Warning: Unknown package manager. Ensure cmake, git, python3, nodejs are installed."
fi

# 2. Emscripten SDK (pinned to 3.1.50 for reproducibility)
if [ ! -d "emsdk" ]; then
    echo "Cloning emsdk..."
    git clone https://github.com/emscripten-core/emsdk.git
fi

cd emsdk
echo "Installing Emscripten 3.1.50..."
./emsdk install 3.1.50
./emsdk activate 3.1.50
source ./emsdk_env.sh
cd "$SCRIPT_DIR"

echo "Emscripten version:"
emcc --version | head -1

# 3. Clone libriscv (upstream -- NOT fbdtemme fork which is stale)
VENDOR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/vendor"
mkdir -p "$VENDOR_DIR"
if [ ! -d "$VENDOR_DIR/libriscv" ]; then
    echo "Cloning libriscv (upstream)..."
    git clone --depth=1 https://github.com/libriscv/libriscv.git "$VENDOR_DIR/libriscv"
else
    echo "libriscv already present."
fi

# 4. Build
echo ""
echo "Building with emcmake..."
echo "Key settings:"
echo "  - wasm32 (NOT wasm64/MEMORY64 -- guest 64-bit addrs are just uint64_t values)"
echo "  - Threaded dispatch (computed goto -- works in Emscripten)"
echo "  - 256MB encompassing arena (28-bit addressing)"
echo "  - Binary translation OFF (no dlopen in Wasm)"
echo "  - C++ exceptions enabled (-fexceptions)"
echo ""

mkdir -p build
cd build

emcmake cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CXX_FLAGS="-fexceptions" \
    -DCMAKE_C_FLAGS="-fexceptions"

emmake make -j$(nproc) VERBOSE=1

cd "$SCRIPT_DIR"

# 5. Verify
if [ -f "build/friscy.js" ] && [ -f "build/friscy.wasm" ]; then
    echo ""
    echo "=== Build successful ==="
    ls -lh build/friscy.js build/friscy.wasm
    echo ""
    echo "Next steps:"
    echo "  1. Install RISC-V cross-compiler:"
    echo "     sudo apt install gcc-riscv64-linux-gnu"
    echo "  2. Cross-compile a guest:"
    echo "     riscv64-linux-gnu-gcc -static -O2 -o guest guest.c"
    echo "  3. Run:"
    echo "     node --experimental-wasm-modules test_node.js guest"
else
    echo "ERROR: Build failed -- check output above"
    exit 1
fi
