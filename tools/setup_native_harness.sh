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
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$(cd "$SCRIPT_DIR/../runtime" && pwd)"
LOCK_FILE="$SCRIPT_DIR/build-lock.env"
cd "$RUNTIME_DIR"

# shellcheck disable=SC1090
source "$LOCK_FILE"

SKIP_SYSTEM_DEPS=0
EMSDK_VERSION="${FRISCY_EMSDK_VERSION}"
PRODUCTION=OFF
WIZER=OFF

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-system-deps)
            SKIP_SYSTEM_DEPS=1
            shift
            ;;
        --emsdk-version)
            EMSDK_VERSION="${2:-}"
            shift 2
            ;;
        --production|-p)
            PRODUCTION=ON
            shift
            ;;
        --wizer|-w)
            WIZER=ON
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-system-deps] [--emsdk-version VERSION] [--production] [--wizer]"
            exit 1
            ;;
    esac
done

echo "=== friscy: Local Emscripten build setup ==="
echo "Pinned emsdk version: $EMSDK_VERSION"
echo "Pinned libriscv commit: ${FRISCY_LIBRISCV_COMMIT}"
echo "Production build: $PRODUCTION"
echo "Wizer snapshots: $WIZER"

# 1. System dependencies
if [[ "$SKIP_SYSTEM_DEPS" == "0" ]]; then
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
else
    echo "Skipping system dependency installation (--skip-system-deps)"
fi

# 2. Emscripten SDK (pinned via build-lock.env unless overridden)
if [ ! -d "emsdk" ]; then
    echo "Cloning emsdk..."
    git clone https://github.com/emscripten-core/emsdk.git
fi

cd emsdk
echo "Installing Emscripten ${EMSDK_VERSION}..."
./emsdk install "${EMSDK_VERSION}"
./emsdk activate "${EMSDK_VERSION}"
source ./emsdk_env.sh
cd "$RUNTIME_DIR"

echo "Emscripten version:"
emcc --version | head -1

# 3. Pin libriscv to reproducible commit
bash "$SCRIPT_DIR/pin_libriscv.sh"

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

rm -rf build
mkdir -p build
cd build

emcmake cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DFRISCY_PRODUCTION="${PRODUCTION}" \
    -DFRISCY_WIZER="${WIZER}" \
    -DCMAKE_CXX_FLAGS="-fwasm-exceptions" \
    -DCMAKE_C_FLAGS="-fwasm-exceptions"

emmake make -j$(nproc) VERBOSE=1

cd "$RUNTIME_DIR"

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
