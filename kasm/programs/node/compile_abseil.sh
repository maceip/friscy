#!/bin/bash
# ==========================================================================
# Compile real Abseil synchronization for Emscripten/Wasm
# ==========================================================================
#
# Uses StdcppWaiter (ABSL_FORCE_WAITER_MODE=4), which relies only on
# std::mutex and std::condition_variable — both supported by Emscripten.
#
# No stubs. No hacks. Real Abseil, portable by design.
#
# Usage:
#   cd kasm/programs/node
#   ./compile_abseil.sh
#
# Output: /tmp/v8obj/abseil/*.o
# ==========================================================================

set -e

# Source Emscripten environment
source ../../emsdk/emsdk_env.sh 2>/dev/null || true

V8_DIR=node/deps/v8
ABSEIL_DIR="$V8_DIR/third_party/abseil-cpp"
SHIMS=v8_patches/emscripten-shims
OBJ_DIR=/tmp/v8obj/abseil

if [ ! -d "$ABSEIL_DIR" ]; then
    echo "ERROR: Abseil not found at $ABSEIL_DIR"
    echo "Make sure node source is checked out (git submodule update --init)"
    exit 1
fi

mkdir -p "$OBJ_DIR"

# --------------------------------------------------------------------------
# Compiler flags
# --------------------------------------------------------------------------
# ABSL_FORCE_WAITER_MODE=4 = StdcppWaiter (std::mutex + std::condition_variable)
# This is the key flag — it bypasses futex, sem_t, and pthread_cond_t
# in favor of pure C++ standard library primitives.
# --------------------------------------------------------------------------

ABSEIL_FLAGS="-std=c++20 -O2 -w -pthread \
    -DABSL_FORCE_WAITER_MODE=4 \
    -DABSL_LOW_LEVEL_ALLOC_MISSING=1 \
    -D__linux__=1 \
    -DNDEBUG \
    -isystem $SHIMS \
    -I$ABSEIL_DIR"

# --------------------------------------------------------------------------
# Abseil source files to compile
# --------------------------------------------------------------------------
# These are the files needed for V8's Abseil usage:
#   - Synchronization (Mutex, CondVar, Notification)
#   - Threading (ThreadIdentity, PerThreadSem)
#   - Base utilities (SpinLock, CycleClock)
#   - Debugging (StackTrace)
#
# Non-selected waiter .cc files (futex, sem, pthread, win32) compile to
# empty translation units — Abseil guards them with #if checks.
# --------------------------------------------------------------------------

ABSEIL_SOURCES=(
    # --- Synchronization core ---
    "absl/synchronization/mutex.cc"
    "absl/synchronization/notification.cc"
    "absl/synchronization/barrier.cc"
    "absl/synchronization/blocking_counter.cc"

    # --- Waiter implementations (only stdcpp_waiter.cc produces real code) ---
    "absl/synchronization/internal/waiter_base.cc"
    "absl/synchronization/internal/stdcpp_waiter.cc"
    "absl/synchronization/internal/futex_waiter.cc"
    "absl/synchronization/internal/pthread_waiter.cc"
    "absl/synchronization/internal/sem_waiter.cc"
    "absl/synchronization/internal/win32_waiter.cc"

    # --- Synchronization internals ---
    "absl/synchronization/internal/kernel_timeout.cc"
    "absl/synchronization/internal/per_thread_sem.cc"
    "absl/synchronization/internal/create_thread_identity.cc"
    "absl/synchronization/internal/graphcycles.cc"

    # --- Base: threading and low-level ---
    "absl/base/internal/thread_identity.cc"
    "absl/base/internal/spinlock.cc"
    # low_level_alloc.cc excluded: ABSL_LOW_LEVEL_ALLOC_MISSING=1 makes it an
    # empty TU, and its unconditional #include of direct_mmap.h fails on Emscripten.
    "absl/base/internal/cycleclock.cc"
    "absl/base/internal/unscaledcycleclock.cc"
    "absl/base/internal/raw_logging.cc"
    "absl/base/internal/sysinfo.cc"
    "absl/base/internal/spinlock_wait.cc"
    "absl/base/internal/throw_delegate.cc"

    # --- Debugging ---
    "absl/debugging/stacktrace.cc"
    "absl/debugging/symbolize.cc"

    # --- Hash (V8 uses Abseil's Swiss tables) ---
    "absl/hash/internal/hash.cc"
    "absl/hash/internal/city.cc"
    "absl/hash/internal/low_level_hash.cc"

    # --- Container internals ---
    "absl/container/internal/raw_hash_set.cc"

    # --- Strings (used by various Abseil internals) ---
    "absl/strings/internal/str_format/arg.cc"
    "absl/strings/internal/str_format/bind.cc"
    "absl/strings/internal/str_format/extension.cc"
    "absl/strings/internal/str_format/float_conversion.cc"
    "absl/strings/internal/str_format/output.cc"
    "absl/strings/internal/str_format/parser.cc"
    "absl/strings/ascii.cc"
    "absl/strings/charconv.cc"
    "absl/strings/escaping.cc"
    "absl/strings/match.cc"
    "absl/strings/numbers.cc"
    "absl/strings/str_cat.cc"
    "absl/strings/str_replace.cc"
    "absl/strings/str_split.cc"
    "absl/strings/string_view.cc"
    "absl/strings/substitute.cc"
    "absl/strings/internal/charconv_bigint.cc"
    "absl/strings/internal/charconv_parse.cc"
    "absl/strings/internal/memutil.cc"
    "absl/strings/internal/ostringstream.cc"
    "absl/strings/internal/utf8.cc"

    # --- Time (used by Duration/Time in Mutex API) ---
    "absl/time/civil_time.cc"
    "absl/time/clock.cc"
    "absl/time/duration.cc"
    "absl/time/format.cc"
    "absl/time/time.cc"
    "absl/time/internal/cctz/src/civil_time_detail.cc"
    "absl/time/internal/cctz/src/time_zone_fixed.cc"
    "absl/time/internal/cctz/src/time_zone_format.cc"
    "absl/time/internal/cctz/src/time_zone_if.cc"
    "absl/time/internal/cctz/src/time_zone_impl.cc"
    "absl/time/internal/cctz/src/time_zone_info.cc"
    "absl/time/internal/cctz/src/time_zone_libc.cc"
    "absl/time/internal/cctz/src/time_zone_lookup.cc"
    "absl/time/internal/cctz/src/time_zone_posix.cc"
    "absl/time/internal/cctz/src/zone_info_source.cc"

    # --- Numeric (int128, used by various) ---
    "absl/numeric/int128.cc"

    # --- Types (used by Condition) ---
    "absl/types/bad_optional_access.cc"
    "absl/types/bad_variant_access.cc"
    "absl/types/bad_any_cast.cc"

    # --- Status (may be referenced) ---
    "absl/status/status.cc"
    "absl/status/status_payload_printer.cc"

    # --- Base ---
    "absl/base/internal/strerror.cc"
    "absl/base/log_severity.cc"
)

# --------------------------------------------------------------------------
# Compile
# --------------------------------------------------------------------------

echo "=== Compiling Real Abseil for Emscripten ==="
echo "Waiter mode: StdcppWaiter (ABSL_FORCE_WAITER_MODE=4)"
echo "Source: $ABSEIL_DIR"
echo "Output: $OBJ_DIR"
echo ""

SUCCESS=0
FAILED=0
FAILED_LIST=""

for src in "${ABSEIL_SOURCES[@]}"; do
    full_path="$ABSEIL_DIR/$src"
    obj_name=$(echo "$src" | tr '/' '_' | sed 's/\.cc$/.o/')

    if [ ! -f "$full_path" ]; then
        echo "SKIP (not found): $src"
        continue
    fi

    if em++ $ABSEIL_FLAGS -c "$full_path" -o "$OBJ_DIR/$obj_name" 2>/tmp/abseil-compile-err.log; then
        SUCCESS=$((SUCCESS + 1))
    else
        FAILED=$((FAILED + 1))
        FAILED_LIST="$FAILED_LIST\n  $src"
        echo "FAIL: $src"
        tail -5 /tmp/abseil-compile-err.log | sed 's/^/       /'
    fi
done

echo ""
echo "=== Abseil Compilation Results ==="
echo "Passed: $SUCCESS"
echo "Failed: $FAILED"

if [ $FAILED -gt 0 ]; then
    echo -e "Failed files:$FAILED_LIST"
    echo ""
    echo "Fix these failures. Do NOT fall back to stubs."
fi

OBJ_COUNT=$(find "$OBJ_DIR" -name "*.o" 2>/dev/null | wc -l)
echo "Total .o files: $OBJ_COUNT"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "SUCCESS: All Abseil files compiled."
    echo ""
    echo "Add to your V8 link command:"
    echo "  \$(find $OBJ_DIR -name '*.o')"
fi
