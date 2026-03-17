#!/bin/bash
# Node.js Emscripten Build Script
# Phase 4: Node.js/V8 to Wasm
# Estimated time: 4-6 weeks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$SCRIPT_DIR/node"
BUILD_DIR="$SCRIPT_DIR/build"
MMAP_SHIM_DIR="$SCRIPT_DIR/../../mmap-shim"

# Emscripten setup
export EMSDK_DIR="$SCRIPT_DIR/../../emsdk"
export EMCC="$EMSDK_DIR/upstream/emscripten/emcc"
export EMCXX="$EMSDK_DIR/upstream/emscripten/em++"
export PATH="$EMSDK_DIR/upstream/emscripten:$PATH"

echo "========================================="
echo "  Node.js Emscripten Build"
echo "  Phase 4 of Kasm Project"
echo "========================================="
echo ""
echo "Build environment:"
echo "  EMCC: $EMCC"
echo "  NODE_DIR: $NODE_DIR"
echo "  MMAP_SHIM: $MMAP_SHIM_DIR"
echo ""

# Verify Emscripten
if [ ! -f "$EMCC" ]; then
    echo "ERROR: Emscripten not found at $EMCC"
    echo "Please run: cd ../../emsdk && ./emsdk install latest && ./emsdk activate latest"
    exit 1
fi

$EMCC --version | head -1
echo ""

# Create build directory
mkdir -p "$BUILD_DIR"

# ============================================
# STEP 1: Configure V8 for Emscripten
# ============================================
echo "Step 1: Configuring V8 for Emscripten target..."
echo "-------------------------------------------"

# V8 uses GN build system. We need to create a wasm32-emscripten target.
# For now, we'll use the gyp-based build via Node.js configure

cd "$NODE_DIR"

# Create a custom gyp file for Emscripten settings
cat > "$BUILD_DIR/node_emscripten.gypi" << 'EOF'
{
  'target_defaults': {
    'conditions': [
      ['OS=="emscripten"', {
        # Emscripten-specific settings
        'defines': [
          'V8_JITLESS_MODE=1',
          'V8_ENABLE_JITLESS=1',
          'V8_ENABLE_POINTER_COMPRESSION=1',
          'V8_31BIT_SMIS_ON_64BIT_ARCH=1',
          'V8_DISABLE_WASM=1',  # WASM requires JIT, incompatible with jitless
          'USE_MMAP_SHIM=1',
        ],
        'cflags': [
          '-msimd128',
          '-mbulk-memory',
          '-matomics',
          '-mtail-call',
          '-fwasm-exceptions',
        ],
        'cflags_cc': [
          '-std=c++20',
        ],
        'ldflags': [
          '-sSHARED_MEMORY=1',
          '-pthread',
          '-sALLOW_MEMORY_GROWTH=1',
          '-sMAXIMUM_MEMORY=4GB',
          '-sMALLOC=mimalloc',
        ],
      }],
    ],
  },
}
EOF

echo "Created: $BUILD_DIR/node_emscripten.gypi"
echo ""

# ============================================
# STEP 2: Run Node.js configure
# ============================================
echo "Step 2: Running Node.js configure..."
echo "-------------------------------------------"

# Node.js configure with Emscripten target
# Note: This may fail initially - we'll need to patch as we go

python3 configure.py \
    --dest-os=linux \
    --dest-cpu=wasm32 \
    --without-intl \
    --without-inspector \
    --without-ssl \
    --without-report \
    --without-performance \
    --without-v8-sandbox \
    --with-intl=none \
    --shared \
    --prefix=/nonexistent \
    2>&1 | tee "$BUILD_DIR/configure.log" || {
        echo "WARNING: Configure failed - this is expected on first attempt"
        echo "We'll need to patch the build system"
    }

echo ""

# ============================================
# STEP 3: Build V8 Standalone (Test)
# ============================================
echo "Step 3: Testing V8 standalone build..."
echo "-------------------------------------------"

# First, let's see if we can build just V8's d8 shell
V8_DIR="$NODE_DIR/deps/v8"

if [ -d "$V8_DIR" ]; then
    echo "V8 directory found: $V8_DIR"

    # Check if we can build V8 with GN
    if [ -f "$V8_DIR/tools/dev/v8gen.py" ]; then
        echo "V8 gen tool found - can use GN build"
    else
        echo "V8 GN build not available - will use Node.js gyp build"
    fi
else
    echo "WARNING: V8 directory not found at expected location"
fi

echo ""

# ============================================
# STEP 4: Full Node.js Build Attempt
# ============================================
echo "Step 4: Attempting full Node.js build..."
echo "-------------------------------------------"

# This is where the real work happens
# We'll need to iterate on this many times

echo "Build not yet started - requires:"
echo "  1. Patching V8 for Emscripten"
echo "  2. Patching libuv for JSPI"
echo "  3. Resolving all platform dependencies"
echo "  4. Linking against mmap-shim"
echo ""
echo "Estimated time: 4-6 weeks"
echo "See BUILD_STATUS.md for detailed roadmap"

echo ""
echo "========================================="
echo "  Build preparation complete"
echo "  Next: Iterative development"
echo "========================================="
