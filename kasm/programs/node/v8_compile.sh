#!/bin/bash
# V8 Emscripten Compilation Script
# Compiles V8 source files to Wasm .o files with all fixes applied
#
# Fixes applied:
# 1. Torque-generated ICU files (regenerated or stubbed)
# 2. Zlib include path added
# 3. Temporal files excluded
# 4. getauxval stub in auxvec.h

set -e

# Source Emscripten environment
source ../../emsdk/emsdk_env.sh 2>/dev/null || true

V8_DIR=node/deps/v8
NODE_OUT=node/out/Release
SHIMS=v8_patches/emscripten-shims
OBJ_DIR=/tmp/v8obj

# Create output directories
mkdir -p "$OBJ_DIR"
for dir in base api interpreter objects heap execution builtins runtime \
           regexp strings numbers parsing ast codegen snapshot utils zone \
           handles roots logging debug libplatform tracing d8; do
    mkdir -p "$OBJ_DIR/$dir"
done

# Find generated headers directory
GEN_DIR=""
for d in "$NODE_OUT/obj/gen" "$NODE_OUT/obj.target/v8_torque_generated" "$NODE_OUT/gen"; do
    if [ -d "$d" ]; then
        GEN_DIR="$d"
        break
    fi
done

if [ -z "$GEN_DIR" ]; then
    echo "ERROR: Cannot find generated headers directory."
    exit 1
fi

echo "Using generated headers from: $GEN_DIR"
echo "Output directory: $OBJ_DIR"
echo ""

# LOCKED IN compile flags - DO NOT CHANGE
COMPILE_FLAGS="-std=c++20 -O0 -w -pthread \
    -UV8_COMPRESS_POINTERS -UV8_ENABLE_SANDBOX -UV8_31BIT_SMIS_ON_64BIT_ARCH \
    -DV8_OS_LINUX=1 -DV8_OS_POSIX=1 -DV8_HAVE_TARGET_OS=1 -DV8_TARGET_OS_LINUX=1 \
    -DV8_ENABLE_WEBASSEMBLY=1 -DV8_JITLESS=1 -DV8_TRAP_HANDLER_SUPPORTED=0 \
    -DV8_USE_EXTERNAL_STARTUP_DATA=0 -DV8_ENABLE_I18N_SUPPORT=1 -DV8_INTL_SUPPORT=1 \
    -DV8_ENABLE_LEAPTIERING=1 -DV8_ENABLE_SPARKPLUG=1 -DV8_ENABLE_MAGLEV=1 \
    -DV8_ENABLE_TURBOFAN=1 -DV8_LOWER_LIMITS_MODE=1 -DV8_TYPED_ARRAY_MAX_SIZE_IN_HEAP=64 \
    -DV8_ENABLE_LAZY_SOURCE_POSITIONS=1 -DV8_ENABLE_REGEXP_INTERPRETER_THREADED_DISPATCH=1 \
    -DV8_ENABLE_JAVASCRIPT_PROMISE_HOOKS=1 -DV8_ENABLE_CONTINUATION_PRESERVED_EMBEDDER_DATA=1 \
    -DV8_ALLOCATION_FOLDING=1 -DV8_ALLOCATION_SITE_TRACKING=1 -DV8_ADVANCED_BIGINT_ALGORITHMS=1 \
    -DV8_ATOMIC_OBJECT_FIELD_WRITES=1 -DV8_USE_SIPHASH=1 -DV8_PROMISE_INTERNAL_FIELD_COUNT=1 \
    -DV8_SHORT_BUILTIN_CALLS=1 -DV8_USE_ZLIB=1 -DV8_ENABLE_PRIVATE_MAPPING_FORK_OPTIMIZATION=1 \
    -DDISABLE_UNTRUSTED_CODE_MITIGATIONS=1 -DBUILDING_V8_SHARED=1 -DBUILDING_V8_PLATFORM_SHARED=1 \
    -D__STDC_FORMAT_MACROS=1 -D__linux__=1 -DNDEBUG \
    -DABSL_FORCE_WAITER_MODE=4 \
    -isystem $SHIMS \
    -I$V8_DIR/include \
    -I$V8_DIR/src \
    -I$V8_DIR \
    -I$V8_DIR/third_party/abseil-cpp \
    -I$V8_DIR/third_party/fp16/src/include \
    -I$V8_DIR/third_party/zlib \
    -I$GEN_DIR \
    -I$GEN_DIR/generate-bytecode-output-root \
    -I$GEN_DIR/torque-generated \
    -I$V8_DIR/../icu-small/source/common"

# Issue 3: Files to exclude (temporal + platform-specific + other non-compiling)
EXCLUDE_FILES=(
    # Issue 3: Temporal API (needs Rust temporal_rs)
    "src/objects/js-temporal-objects.cc"
    "src/objects/js-temporal-zoneinfo64.cc"
    # Issue 4: cpu.cc - has x86 inline asm, can't compile to Wasm
    "src/base/cpu.cc"
    # Platform-specific files (Windows, z/OS, AIX, macOS, etc.)
    "src/base/ubsan.cc"
    "src/base/stack_trace_win.cc"
    "src/base/stack_trace_zos.cc"
    "src/base/debug/stack_trace_win.cc"
    "src/base/debug/stack_trace_zos.cc"
    "src/base/platform/platform-aix.cc"
    "src/base/platform/platform-cygwin.cc"
    "src/base/platform/platform-darwin.cc"
    "src/base/platform/platform-zos.cc"
    "src/base/platform/platform-openbsd.cc"
    "src/base/platform/platform-fuchsia.cc"
    "src/base/platform/platform-haiku.cc"
    "src/base/platform/platform-ios.cc"
    "src/base/platform/platform-freebsd.cc"
    "src/base/platform/platform-netbsd.cc"
    "src/base/platform/platform-qnx.cc"
    "src/base/platform/platform-solaris.cc"
    "src/base/platform/platform-win32.cc"
    "src/base/debug/stack_trace_android.cc"
    "src/base/debug/stack_trace_fuchsia.cc"
    "src/base/debug/stack_trace_starboard.cc"
    "src/execution/clobber-registers.cc"
)

# Check if file should be excluded
should_exclude() {
    local file="$1"
    for exclude in "${EXCLUDE_FILES[@]}"; do
        if [[ "$file" == *"$exclude" ]]; then
            return 0
        fi
    done
    return 1
}

# Issue 1: Check for missing torque-generated ICU files
echo "=== Issue 1: Checking Torque-generated ICU files ==="
TORQUE_DIR="$NODE_OUT/obj/gen/torque-generated/src/objects"
MISSING_TORQUE=()
for f in js-break-iterator-tq.inc js-collator-tq.inc js-date-time-format-tq.inc \
         js-display-names-tq.inc js-duration-format-tq.inc js-list-format-tq.inc \
         js-locale-tq.inc js-number-format-tq.inc js-plural-rules-tq.inc \
         js-relative-time-format-tq.inc js-segmenter-tq.inc \
         js-segment-iterator-tq.inc js-segments-tq.inc js-temporal-objects-tq.inc \
         intl-objects-tq.inc; do
    if [ ! -f "$TORQUE_DIR/$f" ]; then
        MISSING_TORQUE+=("$f")
    fi
done

if [ ${#MISSING_TORQUE[@]} -gt 0 ]; then
    echo "Missing torque-generated files: ${#MISSING_TORQUE[@]}"
    for f in "${MISSING_TORQUE[@]}"; do
        echo "  - $f"
    done
    echo "Creating stubs for missing files..."
    for f in "${MISSING_TORQUE[@]}"; do
        # Create empty stub files
        touch "$TORQUE_DIR/$f"
        echo "// Stub file - generated by v8_compile.sh" > "$TORQUE_DIR/$f"
    done
    echo "Created stubs for ${#MISSING_TORQUE[@]} files"
else
    echo "All torque-generated files present"
fi
TORQUE_COUNT=$(find "$TORQUE_DIR" -name "*-tq.inc" 2>/dev/null | wc -l)
echo "Total torque-generated .inc files: $TORQUE_COUNT"
echo ""

# Issue 2 & 4 already fixed in header and compile flags
echo "=== Issue 2: Zlib include path ==="
echo "Added: -I$V8_DIR/third_party/zlib"
echo ""

echo "=== Issue 4: getauxval stub ==="
echo "Added to v8_patches/emscripten-shims/linux/auxvec.h"
cat v8_patches/emscripten-shims/linux/auxvec.h | grep -A4 "getauxval"
echo ""

# Compile function
compile_file() {
    local src="$1"
    local dst="$2"
    local name=$(basename "$src" .cc)

    if should_exclude "$src"; then
        echo "EXCLUDE: $src"
        return 0
    fi

    echo "Compiling: $src -> $dst"
    em++ $COMPILE_FLAGS -c "$src" -o "$dst" 2>&1 | head -20
    return ${PIPESTATUS[0]}
}

# Directories to compile (in order as specified)
V8_DIRS=(
    "base"
    "flags"
    "init"
    "api"
    "interpreter"
    "objects"
    "heap"
    "execution"
    "builtins"
    "runtime"
    "regexp"
    "strings"
    "numbers"
    "parsing"
    "ast"
    "codegen"
    "snapshot"
    "utils"
    "zone"
    "handles"
    "roots"
    "logging"
    "debug"
    "libplatform"
    "tracing"
    "d8"
)

echo "=== Starting V8 Compilation ==="
echo ""

SUCCESS=0
FAILED=0
TOTAL=0

for dir in "${V8_DIRS[@]}"; do
    SRC_DIR="$V8_DIR/src/$dir"
    if [ ! -d "$SRC_DIR" ]; then
        echo "Directory not found: $SRC_DIR"
        continue
    fi

    echo "--- Compiling $dir ---"
    files=()
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$SRC_DIR" -name "*.cc" -type f -print0 2>/dev/null | sort -z)

    for file in "${files[@]}"; do
        # Skip certain patterns
        if [[ "$file" == *"_test.cc" ]] || [[ "$file" == *"-test.cc" ]]; then
            continue
        fi
        if [[ "$file" == *"_unittest.cc" ]]; then
            continue
        fi

        relname=$(basename "$file" .cc)
        outfile="$OBJ_DIR/$dir/$relname.o"

        TOTAL=$((TOTAL + 1))

        if compile_file "$file" "$outfile"; then
            SUCCESS=$((SUCCESS + 1))
        else
            echo "FAILED: $file"
            FAILED=$((FAILED + 1))
        fi
    done
    echo ""
done

echo "=== Compilation Complete ==="
echo "Total files: $TOTAL"
echo "Successful: $SUCCESS"
echo "Failed: $FAILED"
echo ""

# Count total .o files
OBJ_COUNT=$(find "$OBJ_DIR" -name "*.o" 2>/dev/null | wc -l)
echo "Total .o files in $OBJ_DIR: $OBJ_COUNT"
echo ""

if [ $OBJ_COUNT -ge 300 ]; then
    echo "✅ TARGET REACHED: $OBJ_COUNT >= 300"
else
    echo "⚠️  TARGET NOT REACHED: $OBJ_COUNT < 300"
fi

# ============================================================================
# Compile real Abseil (StdcppWaiter mode — no stubs)
# ============================================================================
echo ""
echo "=== Compiling Real Abseil (StdcppWaiter) ==="
./compile_abseil.sh

# V8 platform stubs (non-Abseil, still needed for JIT/snapshot/signals)
echo ""
echo "=== V8 Platform Stubs ==="
mkdir -p "$OBJ_DIR/stubs"
for stub in v8_patches/v8-internal-stubs.cc v8_patches/v8-wasm-stubs.cc v8_patches/embedded-blob-stub.cc; do
    name=$(basename "$stub" .cc)
    if compile_file "$stub" "$OBJ_DIR/stubs/$name.o"; then
        echo "✅ $name compiled"
    else
        echo "❌ $name FAILED"
    fi
done

echo ""
echo "=== Final Link Command ==="
echo "Link: V8 .o + /tmp/v8obj/abseil/*.o + stubs/v8-*.o + stubs/embedded-blob-stub.o"
