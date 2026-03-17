# V8 Platform Patches for Emscripten/Wasm Target

## Strategy

V8's `platform-posix.cc` compiles mostly as-is under Emscripten because
Emscripten provides POSIX-compatible mmap, mprotect, munmap, pthreads.

We do NOT write a new `platform-emscripten.cc`. Instead, we:
1. Define `V8_OS_LINUX` and `V8_OS_POSIX` (Emscripten is POSIX-like)
2. Patch the few Linux-specific paths that don't work in Emscripten
3. Disable signal handling and trap handlers
4. Stub madvise and memfd_create

## Required Patches

### Patch 1: Disable trap handler (signals don't exist in Wasm)

In `src/trap-handler/handler-inside-posix.cc`:
- Wrap entire file in `#if !defined(__EMSCRIPTEN__)`
- Or simply don't compile this file

In BUILD.gn:
- Exclude `src/trap-handler/handler-inside-posix.cc` from the build

At runtime: V8 checks `V8_TRAP_HANDLER_SUPPORTED` which will be false
for wasm32, so trap handler code is already gated.

### Patch 2: Disable /proc/self/maps parsing

In `src/base/platform/platform-linux.cc`:
```cpp
// Lines that open /proc/self/maps — guard with:
#ifdef __EMSCRIPTEN__
// /proc/self/maps not available in Emscripten
std::vector<OS::SharedLibraryAddress> OS::GetSharedLibraryAddresses() {
    return {};
}
#else
// ... existing implementation
#endif
```

### Patch 3: Signal stack setup (no-op)

In `src/base/platform/platform-posix.cc`:
```cpp
#ifdef __EMSCRIPTEN__
// static
void OS::EnsureAlternativeSignalStackIsAvailableForCurrentThread() {
    // Signals not supported in Emscripten/Wasm — no-op
}
#else
// ... existing sigaltstack implementation
#endif
```

### Patch 4: madvise (accept and ignore)

Emscripten's mmap doesn't support madvise. V8 calls it 35 times
during startup (MADV_DONTNEED, MADV_HUGEPAGE, MADV_DONTFORK).

```cpp
#ifdef __EMSCRIPTEN__
bool OS::DiscardSystemPages(void* address, size_t size) {
    // madvise(MADV_DONTNEED) equivalent — no-op in Emscripten
    // Wasm linear memory is always committed
    return true;
}
#endif
```

### Patch 5: Thread naming (no-op or use emscripten API)

In `platform-posix.cc`, the thread naming code uses `prctl(PR_SET_NAME)`
which doesn't exist in Emscripten:
```cpp
#ifdef __EMSCRIPTEN__
void OS::SetCurrentThreadName(const char* name) {
    // Thread naming not critical — no-op
}
#else
// ... existing implementation
#endif
```

### Patch 6: memfd_create (stub)

V8 uses `memfd_create` for the code range on Linux. In jitless mode
this code path should not be hit, but guard it:
```cpp
#ifdef __EMSCRIPTEN__
// memfd_create not available — V8 jitless mode doesn't need it
#define memfd_create(...) (-1)
#endif
```

### Patch 7: CPU feature detection

V8 probes CPU features via CPUID (x86) or /proc/cpuinfo (arm).
In Wasm, we know exactly what features are available:
```cpp
#ifdef __EMSCRIPTEN__
void CpuFeatures::ProbeImpl(bool cross_compile) {
    // Wasm32 target — no JIT, no SIMD probing needed in V8
    // (Wasm SIMD is handled by the Wasm engine, not V8)
}
#endif
```

## Build Configuration (GN args or Emscripten compile flags)

```
Defines to set:
  -DV8_OS_POSIX=1
  -DV8_OS_LINUX=1           # Emscripten defines __linux__ already
  -DV8_TARGET_ARCH_IA32=1   # or define a new V8_TARGET_ARCH_WASM32
  -DV8_JITLESS_MODE=1
  -DV8_ENABLE_JITLESS=1
  -Dv8_enable_pointer_compression=0
  -Dv8_enable_sandbox=0
  -Dv8_enable_webassembly=0
  -Dv8_use_external_startup_data=0
  -Dv8_enable_i18n_support=0
  -DV8_TRAP_HANDLER_SUPPORTED=0

Emscripten flags:
  -pthread
  -sSHARED_MEMORY=1
  -sALLOW_MEMORY_GROWTH=1
  -sMAXIMUM_MEMORY=4GB
  -sERROR_ON_UNDEFINED_SYMBOLS=0
```

## d8 Build Approach

Do NOT use GN/Ninja. V8's build system doesn't know about Emscripten.
Instead, compile directly with em++:

```bash
# Step 1: Generate Torque builtins (native build, runs on host)
# Torque is a V8 DSL that generates C++ code
# Must be built natively first, then cross-compiled output is used
cd deps/v8
python3 tools/dev/gm.py x64.release torque
# This generates src/torque-generated/*.cc files

# Step 2: Compile V8 source files with Emscripten
em++ -O2 -std=c++20 \
    -DV8_JITLESS_MODE=1 \
    -Dv8_enable_sandbox=false \
    -Dv8_enable_webassembly=false \
    -Dv8_enable_pointer_compression=false \
    -DV8_TRAP_HANDLER_SUPPORTED=0 \
    -I src -I include -I . \
    src/d8/d8.cc \
    src/d8/d8-posix.cc \
    src/d8/d8-console.cc \
    src/d8/d8-platforms.cc \
    src/base/platform/platform-posix.cc \
    src/init/v8.cc \
    # ... (hundreds more source files)
    -o d8.js

# This will produce MANY errors. Each error reveals a platform
# incompatibility that needs one of the patches above.
```

## Expected Error Categories and Fixes

1. **Missing headers**: `<sys/prctl.h>` — stub or guard with `__EMSCRIPTEN__`
2. **Missing functions**: `memfd_create`, `mremap` — stub
3. **Signal types**: `SIGSEGV handler` — disable via `V8_TRAP_HANDLER_SUPPORTED=0`
4. **Architecture detection**: V8 doesn't know `__wasm32__` — use `V8_TARGET_ARCH_IA32` as closest match or define `V8_TARGET_ARCH_WASM32`
5. **JIT compiler sources**: These should be excluded by `v8_enable_jitless` but may have residual includes — guard with `#if !V8_JITLESS_MODE`
6. **Snapshot blob**: Use `--no-snapshot` initially, then generate snapshot after first successful build

## Files to Exclude from Build (not needed in jitless mode)

- `src/compiler/` — TurboFan JIT compiler (not used in jitless)
- `src/maglev/` — Maglev JIT compiler
- `src/baseline/` — Sparkplug baseline compiler
- `src/codegen/x64/` (or any native arch) — native code generation
- `src/wasm/` — WebAssembly support (we disabled it)
- `src/trap-handler/` — signal-based trap handling
- `src/diagnostics/perf-jit.cc` — perf integration
- `src/extensions/cputracemark-extension.cc` — Windows ETW

## Minimum Viable Source List for d8

Based on BUILD.gn analysis, the minimum source files needed:

1. `src/base/**` — ~50 files (platform, utils, atomics)
2. `src/init/**` — ~10 files (V8 startup)
3. `src/objects/**` — ~100 files (JS object model)
4. `src/heap/**` — ~40 files (garbage collector)
5. `src/execution/**` — ~20 files (execution context)
6. `src/interpreter/**` — ~30 files (Ignition bytecode interpreter)
7. `src/builtins/**` — ~50 files (built-in functions)
8. `src/runtime/**` — ~30 files (runtime support)
9. `src/api/**` — ~10 files (V8 public API)
10. `src/d8/**` — 8 files (d8 shell)
11. `src/torque-generated/**` — generated files

Total: ~350-400 C++ files. At ~10M total lines, this is a significant
compilation but Emscripten handles it (similar scale to the Linux kernel).

## Estimated Timeline

- Day 1: First compilation attempt, catalog errors
- Day 2-3: Apply patches for the error categories above
- Day 4-5: Fix linker errors (missing symbols, undefined references)
- Day 6-7: First successful link (d8.wasm exists)
- Day 8-10: Debug runtime initialization failures
- Week 2-3: V8 initializes, d8 runs `1+1`

## Syscall Requirements (from strace)

For `node -e "console.log('hello')"`, V8 makes:
- 61 mmap calls (all handled by our mmap shim)
- 48 mprotect calls (handled by mmap shim)
- 51 munmap calls (handled)
- 14 brk calls (Emscripten handles)
- 35 madvise calls (need stub — return 0)
- 63 rt_sigaction calls (no-op in Wasm)
- 7 clone3 calls (Emscripten pthreads)
- 92 futex calls (Emscripten Atomics)

The mmap shim we built handles the hard patterns:
- 134MB PROT_NONE heap cage reservation ✓
- 537MB sandbox reservation ✓
- MAP_FIXED over-allocate-then-trim ✓
- Guard pages (PROT_NONE) ✓
- Reserve-then-commit cycle ✓
