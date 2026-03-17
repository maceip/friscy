/**
 * Master WASI/Emscripten compatibility header for EdgeJS build.
 *
 * Adapted from Multi-V-VM/node-wasix32's wasi-all-fixes.h.
 * Force-included into every compilation unit via:
 *   -include wasi-shims/wasi-all-fixes.h
 *
 * This file addresses V8/Node.js assumptions about the host platform
 * that don't hold when compiling to WebAssembly via Emscripten.
 */

#ifndef EDGEJS_WASI_ALL_FIXES_H
#define EDGEJS_WASI_ALL_FIXES_H

/* ---- Guard: only apply when targeting Wasm ---- */
#if defined(__EMSCRIPTEN__) || defined(__wasi__)

/* ---- 1. Size Constants ----
 * V8 uses KB/MB/GB macros before defining them in some translation units.
 * Pre-define to avoid undeclared identifier errors.
 */
#ifndef KB
#define KB (1024)
#endif
#ifndef MB
#define MB (1024 * 1024)
#endif
#ifndef GB
#define GB (1024 * 1024 * 1024)
#endif

/* ---- 2. Architecture Detection ----
 * V8 has code paths for ia32, x64, arm, arm64, mips, etc.
 * wasm32 maps closest to ia32 (32-bit, little-endian).
 * node-wasix32 found this mapping is essential for V8 compilation.
 */
#if defined(__wasm32__) && !defined(V8_TARGET_ARCH_IA32)
  /* Don't override if already set — EdgeJS may handle this differently */
#endif

/* ---- 3. Pointer Size ----
 * Ensure consistent pointer size logging for 32-bit Wasm.
 */
#ifndef V8_HOST_ARCH_32_BIT
#define V8_HOST_ARCH_32_BIT 1
#endif

/* ---- 4. Standard Library Pre-includes ----
 * node-wasix32 found that including standard headers at global scope
 * prevents namespace pollution when V8's internal headers re-open namespaces.
 */
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <algorithm>
#include <atomic>
#include <functional>
#include <memory>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

/* ---- 5. Signal Stubs ----
 * Wasm doesn't support POSIX signals. Stub out anything not in Emscripten's headers.
 */
#ifndef SIGBUS
#define SIGBUS 7
#endif
#ifndef SIGSYS
#define SIGSYS 31
#endif

/* ---- 6. Missing Process APIs ----
 * Emscripten stubs some of these, but not all.
 * Only define if not already provided.
 */
#include <sys/types.h>

#ifndef __EMSCRIPTEN__
/* WASIX-only stubs — Emscripten already provides these */
static inline pid_t fork(void) { return -1; }
static inline int execvp(const char *file, char *const argv[]) { return -1; }
#endif

/* ---- 7. Platform-specific V8 Fixes ----
 * These address specific V8 compilation issues found by node-wasix32.
 */

/* V8's platform detection may not recognize Emscripten as a valid target.
 * Ensure the POSIX path is used (Emscripten is POSIX-like). */
#if !defined(V8_OS_POSIX) && defined(__EMSCRIPTEN__)
#define V8_OS_POSIX 1
#define V8_OS_LINUX 1  /* Emscripten emulates Linux */
#endif

/* ---- 8. Thread Local Storage ----
 * Emscripten supports __thread via SharedArrayBuffer.
 * Ensure V8's TLS macros work correctly.
 */
#if defined(__EMSCRIPTEN__) && !defined(V8_NO_TLS)
  /* Emscripten with -pthread supports TLS natively */
#endif

/* ---- 9. Memory Alignment ----
 * wasm32 requires stricter alignment than x86.
 * V8 sometimes does unaligned access — Wasm traps on this.
 */
#if defined(__wasm32__)
#ifndef V8_COMPRESS_POINTERS
  /* Pointer compression is desirable for 32-bit to save memory,
   * but must be configured carefully with Wasm linear memory. */
#endif
#endif

/* ---- 10. JIT Disable ----
 * When EdgeJS uses NAPI_PROVIDER=imports (browser provides JS engine),
 * V8's JIT is irrelevant since we're not compiling V8 itself.
 * But if any V8 code IS compiled (e.g., for snapshot support),
 * ensure JIT is disabled. */
#ifndef V8_JITLESS
#define V8_JITLESS 1
#endif

#endif /* __EMSCRIPTEN__ || __wasi__ */
#endif /* EDGEJS_WASI_ALL_FIXES_H */
