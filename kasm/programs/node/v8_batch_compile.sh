#!/bin/bash
source ../../emsdk/emsdk_env.sh 2>/dev/null
V8=node/deps/v8
GEN=node/out/Release/obj/gen
SHIMS=v8_patches/emscripten-shims
FLAGS="-std=c++20 -O0 -w -pthread \
  -UV8_COMPRESS_POINTERS -UV8_ENABLE_SANDBOX -UV8_31BIT_SMIS_ON_64BIT_ARCH \
  -UV8_ENABLE_I18N_SUPPORT -UV8_INTL_SUPPORT \
  -DV8_OS_LINUX=1 -DV8_OS_POSIX=1 -DV8_HAVE_TARGET_OS=1 -DV8_TARGET_OS_LINUX=1 \
  -DV8_ENABLE_WEBASSEMBLY=1 -DV8_JITLESS=1 -DV8_TRAP_HANDLER_SUPPORTED=0 \
  -DV8_USE_EXTERNAL_STARTUP_DATA=0 -DV8_ENABLE_LEAPTIERING=1 -DV8_ENABLE_SPARKPLUG=1 \
  -DV8_ENABLE_MAGLEV=1 -DV8_ENABLE_TURBOFAN=1 -DV8_LOWER_LIMITS_MODE=1 \
  -DV8_TYPED_ARRAY_MAX_SIZE_IN_HEAP=64 -DV8_ENABLE_LAZY_SOURCE_POSITIONS=1 \
  -DV8_ENABLE_REGEXP_INTERPRETER_THREADED_DISPATCH=1 -DV8_ENABLE_JAVASCRIPT_PROMISE_HOOKS=1 \
  -DV8_ENABLE_CONTINUATION_PRESERVED_EMBEDDER_DATA=1 -DV8_ALLOCATION_FOLDING=1 \
  -DV8_ALLOCATION_SITE_TRACKING=1 -DV8_ADVANCED_BIGINT_ALGORITHMS=1 \
  -DV8_ATOMIC_OBJECT_FIELD_WRITES=1 -DV8_USE_SIPHASH=1 -DV8_PROMISE_INTERNAL_FIELD_COUNT=1 \
  -DV8_SHORT_BUILTIN_CALLS=1 -DV8_USE_ZLIB=1 -DV8_ENABLE_PRIVATE_MAPPING_FORK_OPTIMIZATION=1 \
  -DDISABLE_UNTRUSTED_CODE_MITIGATIONS=1 -DBUILDING_V8_SHARED=1 -DBUILDING_V8_PLATFORM_SHARED=1 \
  -D__STDC_FORMAT_MACROS=1 -D__linux__=1 -DNDEBUG \
  -DABSL_FORCE_WAITER_MODE=4 \
  -isystem $SHIMS \
  -I$V8/include -I$V8/src -I$V8 -I$V8/third_party/abseil-cpp \
  -I$V8/third_party/fp16/src/include -I$V8/third_party/zlib \
  -I$GEN -I$GEN/generate-bytecode-output-root -I$GEN/torque-generated"

# --- V8 source directories ---
for DIR in regexp strings numbers parsing ast codegen snapshot utils zone handles roots logging debug libplatform tracing json bigint date diagnostics flags profiler tasks common; do
  echo "=== $DIR ==="
  P=0; F=0; FL=""
  mkdir -p /tmp/v8obj/$DIR
  for f in $(find $V8/src/$DIR -maxdepth 1 -name "*.cc" \
    ! -name "*win*" ! -name "*darwin*" ! -name "*fuchsia*" ! -name "*zos*" \
    ! -name "*aix*" ! -name "*starboard*" ! -name "*test*" ! -name "*fuzzer*" \
    ! -path "*/ia32/*" ! -path "*/x64/*" ! -path "*/arm/*" ! -path "*/arm64/*" \
    ! -path "*/mips*" ! -path "*/ppc*" ! -path "*/s390*" ! -path "*/riscv*" ! -path "*/loong*" \
    | sort); do
    B=$(basename $f .cc)
    em++ $FLAGS -c "$f" -o "/tmp/v8obj/$DIR/$B.o" 2>/dev/null
    [ $? -eq 0 ] && P=$((P+1)) || { F=$((F+1)); FL="$FL $B"; }
  done
  echo "  $P pass, $F fail"
  [ $F -gt 0 ] && echo "  Failed:$FL"
done

# --- Real Abseil (not stubs) ---
echo ""
echo "=== ABSEIL (real, StdcppWaiter mode) ==="
echo "Running compile_abseil.sh..."
./compile_abseil.sh

# --- V8 platform stubs (non-Abseil, still needed) ---
echo ""
echo "=== V8 STUBS (non-Abseil) ==="
mkdir -p /tmp/v8obj/stubs
for stub in v8_patches/v8-internal-stubs.cc v8_patches/v8-wasm-stubs.cc v8_patches/embedded-blob-stub.cc; do
  B=$(basename "$stub" .cc)
  em++ $FLAGS -c "$stub" -o "/tmp/v8obj/stubs/$B.o" 2>/dev/null
  [ $? -eq 0 ] && echo "  $B: OK" || echo "  $B: FAILED"
done

echo ""
echo "=== TOTAL ==="
find /tmp/v8obj -name "*.o" | wc -l
echo ".o files"
