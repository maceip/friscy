#!/bin/bash
# Build EdgeJS for browser via Emscripten
# Replaces wasix/build-wasix.sh from upstream EdgeJS
#
# Prerequisites:
#   - Emscripten SDK installed and activated (source emsdk_env.sh)
#   - EdgeJS source cloned into src/
#   - node-wasix32 wasi shims in wasi-shims/ (optional, for POSIX gap fixes)
#
# Usage:
#   ./build-emscripten.sh [--debug]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/src"
BUILD_DIR="${SCRIPT_DIR}/build-emscripten"
SHIMS_DIR="${SCRIPT_DIR}/wasi-shims"
OUTPUT="${SCRIPT_DIR}/edgejs.js"
OUTPUT_WASM="${SCRIPT_DIR}/edgejs.wasm"

# --- Parse args ---
BUILD_TYPE="Release"
if [[ "${1:-}" == "--debug" ]]; then
    BUILD_TYPE="Debug"
fi

# --- Check prerequisites ---
if [[ ! -d "$SRC_DIR" ]]; then
    echo "ERROR: EdgeJS source not found at $SRC_DIR"
    echo "Run: git clone https://github.com/wasmerio/edgejs.git src/"
    exit 1
fi

if ! command -v emcc &>/dev/null; then
    echo "ERROR: Emscripten not found. Run: source \$EMSDK/emsdk_env.sh"
    exit 1
fi

echo "=== EdgeJS Emscripten Build ==="
echo "Source:     $SRC_DIR"
echo "Build dir:  $BUILD_DIR"
echo "Build type: $BUILD_TYPE"
echo "Emscripten: $(emcc --version | head -1)"
echo ""

# --- Prepare build directory ---
mkdir -p "$BUILD_DIR"

# --- Configure with CMake ---
echo ">>> Configuring..."
emcmake cmake -S "$SRC_DIR" -B "$BUILD_DIR" \
    -DCMAKE_TOOLCHAIN_FILE="${SCRIPT_DIR}/emscripten-toolchain.cmake" \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
    -DEDGE_NAPI_PROVIDER=imports \
    -DEDGE_PLATFORM=emscripten \
    ${SHIMS_DIR:+-DEDGE_EXTRA_INCLUDES="$SHIMS_DIR"} \
    2>&1 | tee "${BUILD_DIR}/configure.log"

# --- Build ---
echo ""
echo ">>> Building..."
cmake --build "$BUILD_DIR" -j "$(nproc)" \
    2>&1 | tee "${BUILD_DIR}/build.log"

# --- Post-process ---
if [[ -f "${BUILD_DIR}/edgejs.js" ]]; then
    cp "${BUILD_DIR}/edgejs.js" "$OUTPUT"
    cp "${BUILD_DIR}/edgejs.wasm" "$OUTPUT_WASM"

    WASM_SIZE=$(stat -c%s "$OUTPUT_WASM" 2>/dev/null || stat -f%z "$OUTPUT_WASM")
    WASM_SIZE_MB=$(echo "scale=1; $WASM_SIZE / 1048576" | bc)

    echo ""
    echo "=== Build Complete ==="
    echo "Output:   $OUTPUT"
    echo "Wasm:     $OUTPUT_WASM ($WASM_SIZE_MB MB)"
    echo ""

    # Gzip for size estimate
    if command -v gzip &>/dev/null; then
        gzip -k -f "$OUTPUT_WASM"
        GZ_SIZE=$(stat -c%s "${OUTPUT_WASM}.gz" 2>/dev/null || stat -f%z "${OUTPUT_WASM}.gz")
        GZ_SIZE_MB=$(echo "scale=1; $GZ_SIZE / 1048576" | bc)
        echo "Gzipped:  ${OUTPUT_WASM}.gz ($GZ_SIZE_MB MB)"
        rm -f "${OUTPUT_WASM}.gz"
    fi
else
    echo ""
    echo "=== Build FAILED ==="
    echo "Check ${BUILD_DIR}/build.log for errors"
    exit 1
fi
