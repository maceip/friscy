#!/bin/bash
# ============================================================================
# friscy — Docker container runner via libriscv → WebAssembly
#
# Goal: Beat WebVM/CheerpX with faster Docker-in-browser execution
#
# Build modes:
#   ./harness.sh              # Development build (fast compile, debugging)
#   ./harness.sh --production # Production build (O3, LTO, SIMD, minified)
#   ./harness.sh --wizer      # Build with Wizer snapshot support
#
# Prerequisites: Docker (or see setup_native_harness.sh for local build)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$(cd "$SCRIPT_DIR/../runtime" && pwd)"
cd "$RUNTIME_DIR"

# Parse arguments
PRODUCTION=OFF
WIZER=OFF
while [[ $# -gt 0 ]]; do
    case $1 in
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
            echo "Usage: $0 [--production] [--wizer]"
            exit 1
            ;;
    esac
done

echo "=== friscy: Docker → WebAssembly Container Runner ==="
echo ""
echo "Build configuration:"
echo "  Production: $PRODUCTION"
echo "  Wizer snapshots: $WIZER"
echo ""

# 1. Clone libriscv (upstream, actively maintained)
VENDOR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/vendor"
mkdir -p "$VENDOR_DIR"
if [ ! -d "$VENDOR_DIR/libriscv" ]; then
    echo "Cloning libriscv (upstream)..."
    git clone --depth=1 https://github.com/libriscv/libriscv.git "$VENDOR_DIR/libriscv"
else
    echo "libriscv already present"
fi

# 2. Build with Emscripten via Docker
echo ""
echo "Building with Emscripten..."
if [ "$PRODUCTION" = "ON" ]; then
    echo "  Mode: PRODUCTION (O3, LTO, SIMD, closure compiler)"
else
    echo "  Mode: DEVELOPMENT (O2, assertions enabled)"
fi
echo ""

mkdir -p build

# Use latest emsdk for best Wasm optimizations
EMSDK_VERSION="3.1.50"

docker run --rm \
    -v "${SCRIPT_DIR}:/src" \
    -w /src/build \
    -u "$(id -u):$(id -g)" \
    emscripten/emsdk:${EMSDK_VERSION} \
    bash -c "
        emcmake cmake .. \
            -DCMAKE_BUILD_TYPE=Release \
            -DFRISCY_PRODUCTION=${PRODUCTION} \
            -DFRISCY_WIZER=${WIZER} \
            -DCMAKE_CXX_FLAGS=\"-fexceptions\" \
            -DCMAKE_C_FLAGS=\"-fexceptions\" \
        && emmake make -j\$(nproc) VERBOSE=1
    "

# 3. Verify output
OUTPUT_FILE="build/friscy.js"
if [ "$PRODUCTION" = "ON" ]; then
    # Production embeds .wasm in .js
    if [ -f "$OUTPUT_FILE" ]; then
        echo ""
        echo "=== Production Build Successful ==="
        ls -lh "$OUTPUT_FILE"
        WASM_SIZE=$(grep -o 'new Uint8Array' "$OUTPUT_FILE" | wc -l || echo "embedded")
        echo "  Wasm: embedded in JS"
    else
        echo "ERROR: Build failed"
        exit 1
    fi
else
    if [ -f "$OUTPUT_FILE" ] && [ -f "build/friscy.wasm" ]; then
        echo ""
        echo "=== Development Build Successful ==="
        ls -lh build/friscy.js build/friscy.wasm
    else
        echo "ERROR: Build failed"
        exit 1
    fi
fi

# 4. Optional: Create Wizer snapshot
if [ "$WIZER" = "ON" ] && command -v wizer &> /dev/null; then
    echo ""
    echo "Creating Wizer snapshot..."
    wizer build/friscy.wasm \
        --init-func wizer_init \
        -o build/friscy-snapshot.wasm
    ls -lh build/friscy-snapshot.wasm
    echo "Snapshot created: build/friscy-snapshot.wasm"
fi

echo ""
echo "=== Quick Start ==="
echo ""
echo "# Run Alpine busybox:"
echo "./container_to_riscv.sh alpine:latest ./output"
echo "node test_node.js --rootfs output/rootfs.tar /bin/busybox ls -la"
echo ""
echo "# Run standalone binary:"
echo "riscv64-linux-gnu-gcc -static -O2 -o hello hello.c"
echo "node test_node.js ./hello"
echo ""
if [ "$PRODUCTION" = "ON" ]; then
    echo "# Deploy: Just copy build/friscy.js (Wasm is embedded)"
else
    echo "# Deploy: Copy build/friscy.js and build/friscy.wasm"
fi
