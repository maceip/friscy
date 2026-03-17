# V8 d8 Emscripten Compilation Log

## Date: March 17, 2026

## Target: IA-32 (wasm32 maps to IA32 in V8's architecture model)

## Attempts

### Attempt 1: Raw compilation
**Result:** `v8config.h:912: "Host architecture was not detected as supported by v8"`
**Cause:** Emscripten defines `__wasm32__` and `__EMSCRIPTEN__`, not `__i386__`.
**Fix:** Added `__wasm32__`/`__EMSCRIPTEN__` to the architecture detection chain in `v8config.h`, mapping to `V8_HOST_ARCH_IA32`.

### Attempt 2: With `-DV8_HOST_ARCH_IA32=1`
**Result:** Same error — the `-D` flag doesn't override `v8config.h`'s `#elif` chain.
**Cause:** The architecture detection in `v8config.h` runs unconditionally via `#if/#elif` — external defines are ignored.
**Fix:** Source patch to `v8config.h` (see Attempt 1 fix).

### Attempt 3: With `-UV8_COMPRESS_POINTERS -UV8_ENABLE_SANDBOX`
**Result:** `v8-internal.h:167: size_t{1} << 32` overflow + pointer compression assertion failure.
**Cause:** `V8_COMPRESS_POINTERS=0` still defines the macro. `#ifdef` checks existence, not value.
**Fix:** Use `-U` (undefine) instead of `=0`. The `#ifdef V8_COMPRESS_POINTERS` block is now correctly skipped.

### Attempt 4: With Abseil includes
**Result:** `semaphore.h:70: unknown type name 'NativeHandle'`
**Cause:** Emscripten doesn't define `__linux__`, so `V8_OS_POSIX` was never set. The semaphore's `#if V8_OS_POSIX` branch was not taken.
**Fix:** Add `-DV8_OS_LINUX=1 -DV8_OS_POSIX=1 -D__linux__=1` to force POSIX platform selection.

### Attempt 5: With OS defines forced + warnings suppressed
**Result:** `builtins-definitions.h:8: fatal error: 'builtins-generated/bytecodes-builtins-list.h' file not found`
**Cause:** V8 requires Torque-generated C++ headers that don't exist until the Torque compiler runs.
**Status:** Building Torque natively via `make run_torque` in Node.js out/ directory.

## Working Compiler Flags (so far)

```bash
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
    -I$V8_DIR/include \
    -I$V8_DIR/src \
    -I$V8_DIR \
    -I$V8_DIR/third_party/abseil-cpp
```

## Source Patches Applied

### v8config.h — Host architecture detection (line 911)
```cpp
// Added before the #error:
#elif defined(__wasm32__) || defined(__wasm__) || defined(__EMSCRIPTEN__)
#define V8_HOST_ARCH_IA32 1
#define V8_HOST_ARCH_32_BIT 1
```

### v8config.h — Target architecture detection (line 950)
```cpp
// Added before the #error:
#elif defined(__wasm32__) || defined(__wasm__) || defined(__EMSCRIPTEN__)
#define V8_TARGET_ARCH_IA32 1
```

## Next Steps

1. Wait for Torque build to complete (generates bytecodes-builtins-list.h, torque-generated/*.h)
2. Add generated file include paths
3. Continue compilation — expect more errors in:
   - IA32-specific codegen (assembler-ia32.cc) — need to exclude JIT assembler
   - Signal handling code — need `__EMSCRIPTEN__` guards
   - /proc/self/maps parsing — need guards
   - memfd_create — need stub
4. Each error is one patch. The error count should converge to zero.

## Key Insight

V8's architecture is designed with platform abstraction. The `platform-posix.cc` file
provides the OS layer, and with `-DV8_OS_POSIX=1 -D__linux__=1`, most of it compiles
under Emscripten because Emscripten provides POSIX-compatible headers for mmap,
pthreads, semaphores, mutexes, etc.

The blockers are NOT fundamental — they're specific functions that Emscripten doesn't
provide (memfd_create, sigaltstack, /proc access) which can be stubbed.

## Syscall Requirements (from strace of native Node.js)

For `console.log('hello')`:
- 61 mmap, 48 mprotect, 51 munmap — all handled by our mmap shim
- 14 brk — Emscripten handles
- 35 madvise — need stub (return 0)
- 63 rt_sigaction — no-op in Wasm
- 7 clone3 — Emscripten pthreads
- Total: 721 syscalls, 37 unique types
