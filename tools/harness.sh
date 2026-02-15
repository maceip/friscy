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
#   ./harness.sh --native     # Force local emsdk build (no Docker)
#
# Uses pinned versions from tools/build-lock.env.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$(cd "$SCRIPT_DIR/../runtime" && pwd)"
LOCK_FILE="$SCRIPT_DIR/build-lock.env"
cd "$RUNTIME_DIR"

# shellcheck disable=SC1090
source "$LOCK_FILE"

# Parse arguments
PRODUCTION=OFF
WIZER=OFF
FORCE_NATIVE=OFF
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
        --native)
            FORCE_NATIVE=ON
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--production] [--wizer] [--native]"
            exit 1
            ;;
    esac
done

echo "=== friscy: Docker → WebAssembly Container Runner ==="
echo ""
echo "Build configuration:"
echo "  Production: $PRODUCTION"
echo "  Wizer snapshots: $WIZER"
echo "  Force native: $FORCE_NATIVE"
echo "  Pinned emsdk: ${FRISCY_EMSDK_VERSION}"
echo "  Pinned libriscv: ${FRISCY_LIBRISCV_COMMIT}"
echo ""

# 1. Pin libriscv to deterministic commit
bash "$SCRIPT_DIR/pin_libriscv.sh"

build_with_docker() {
    echo ""
    echo "Building with Dockerized Emscripten..."
    rm -rf build
    mkdir -p build
    docker run --rm \
        -v "${PROJECT_DIR}:/src" \
        -w /src/runtime/build \
        -u "$(id -u):$(id -g)" \
        "emscripten/emsdk:${FRISCY_EMSDK_VERSION}" \
        bash -c "
            emcmake cmake .. \
                -DCMAKE_BUILD_TYPE=Release \
                -DFRISCY_PRODUCTION=${PRODUCTION} \
                -DFRISCY_WIZER=${WIZER} \
            && emmake make -j\$(nproc) VERBOSE=1
        "
}

build_with_native_emsdk() {
    echo ""
    echo "Building with native emsdk..."
    local emsdk_dir="$RUNTIME_DIR/emsdk"

    if [[ ! -d "$emsdk_dir" ]]; then
        git clone https://github.com/emscripten-core/emsdk.git "$emsdk_dir"
    fi

    (
        cd "$emsdk_dir"
        ./emsdk install "$FRISCY_EMSDK_VERSION"
        ./emsdk activate "$FRISCY_EMSDK_VERSION"
    )

    # shellcheck disable=SC1091
    source "$emsdk_dir/emsdk_env.sh"
    rm -rf build
    mkdir -p build
    (
        cd build
        emcmake cmake .. \
            -DCMAKE_BUILD_TYPE=Release \
            -DFRISCY_PRODUCTION=${PRODUCTION} \
            -DFRISCY_WIZER=${WIZER} \
        && emmake make -j"$(nproc)" VERBOSE=1
    )
}

# 2. Build runtime
echo ""
echo "Building with Emscripten..."
if [ "$PRODUCTION" = "ON" ]; then
    echo "  Mode: PRODUCTION (O3, LTO, SIMD, closure compiler)"
else
    echo "  Mode: DEVELOPMENT (O2, assertions enabled)"
fi

if [[ "$FORCE_NATIVE" == "OFF" ]] && command -v docker >/dev/null 2>&1; then
    build_with_docker
else
    build_with_native_emsdk
fi

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
        --allow-wasi \
        --wasm-exceptions=true \
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
