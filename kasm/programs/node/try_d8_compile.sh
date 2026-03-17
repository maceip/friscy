#!/bin/bash
# V8 d8 Emscripten compilation attempt
# Run after Torque generates headers:
#   make -C programs/node/node/out run_torque torque_generated_definitions torque_generated_initializers

set -e
source emsdk/emsdk_env.sh 2>/dev/null

V8_DIR=programs/node/node/deps/v8
NODE_OUT=programs/node/node/out/Release
SHIMS=programs/node/v8_patches/emscripten-shims

# Find generated header directories
GEN_DIR=""
for d in "$NODE_OUT/obj/gen" "$NODE_OUT/obj.target/v8_torque_generated" "$NODE_OUT/gen"; do
    if [ -d "$d" ]; then
        GEN_DIR="$d"
        break
    fi
done

if [ -z "$GEN_DIR" ]; then
    echo "ERROR: Cannot find generated headers directory."
    echo "Run: make -C programs/node/node/out run_torque torque_generated_definitions torque_generated_initializers"
    echo "Then check programs/node/node/out/ for torque-generated/ and builtins-generated/ directories"
    find programs/node/node/out -name "bytecodes-builtins-list.h" 2>/dev/null
    find programs/node/node/out -path "*torque-generated*" -name "*.h" 2>/dev/null | head -5
    exit 1
fi

echo "Using generated headers from: $GEN_DIR"

# Compile d8.cc with Emscripten
em++ -std=c++20 -O0 -c \
    -UV8_COMPRESS_POINTERS \
    -UV8_ENABLE_SANDBOX \
    -UV8_31BIT_SMIS_ON_64BIT_ARCH \
    -DV8_OS_LINUX=1 \
    -DV8_OS_POSIX=1 \
    -DV8_ENABLE_WEBASSEMBLY=0 \
    -DV8_JITLESS=1 \
    -DV8_TRAP_HANDLER_SUPPORTED=0 \
    -DV8_USE_EXTERNAL_STARTUP_DATA=0 \
    -DV8_ENABLE_I18N_SUPPORT=0 \
    -DV8_INTL_SUPPORT=0 \
    -DDISABLE_UNTRUSTED_CODE_MITIGATIONS=1 \
    -D__linux__=1 \
    -w \
    -pthread \
    -I"$SHIMS" \
    -I"$V8_DIR/include" \
    -I"$V8_DIR/src" \
    -I"$V8_DIR" \
    -I"$V8_DIR/third_party/abseil-cpp" \
    -I"$GEN_DIR" \
    "$V8_DIR/src/d8/d8.cc" \
    -o /tmp/d8.o \
    2>&1

echo ""
echo "Exit code: $?"
