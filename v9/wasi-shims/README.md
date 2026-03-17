# WASI Shims for Emscripten

Adapted from [Multi-V-VM/node-wasix32](https://github.com/Multi-V-VM/node-wasix32).

The node-wasix32 project created 30+ header files to patch V8 and Node.js
POSIX assumptions when compiling to wasm32. While Emscripten provides its
own POSIX emulation layer, there are gaps specific to V8/Node internals
that these shims address.

## Source Headers (from node-wasix32)

Key files to port:

| Header | Purpose |
|--------|---------|
| `wasi-all-fixes.h` | Master include — size constants, namespace re-exports, std lib pre-includes |
| `wasi-v8-*.h` | V8 engine adaptations for 32-bit Wasm (multiple files) |
| `wasi-platform-fixes.h` | Platform abstraction patches |
| `wasi-cppgc-stubs.h` | GC component stubs for cppgc |
| `wasi-simdutf-compat.h` | SIMD text encoding compatibility |
| `wasi-system-compat.h` | System-level compatibility |
| `wasi-additional-fixes.h` | Catch-all fixes |

## How They Work

The node-wasix32 build uses `common.gypi` to force-include `wasi-all-fixes.h`
into every compilation unit:

```gyp
'conditions': [
  ['target_arch=="wasm32"', {
    'cflags': ['-include', '<(DEPTH)/wasi-all-fixes.h'],
    'cflags_cc': ['-include', '<(DEPTH)/wasi-all-fixes.h'],
    'defines': ['V8_USING_WASI_SHIMS=1'],
  }],
]
```

For our Emscripten build, we do the equivalent in CMake:

```cmake
if(CMAKE_SYSTEM_PROCESSOR STREQUAL "wasm32")
    add_compile_options(-include ${CMAKE_SOURCE_DIR}/wasi-shims/wasi-all-fixes.h)
    add_definitions(-DV8_USING_WASI_SHIMS=1)
endif()
```

## Key Patterns

1. **Size constants**: Define KB/MB/GB before V8 headers that expect them
2. **Namespace re-exports**: Bridge `v8::base::internal` → `v8::base` lookups
3. **cppgc stubs**: Stub out GC visitor/heap APIs not needed in browser mode
4. **Architecture guards**: Map wasm32 to existing 32-bit code paths (ia32)
5. **Missing syscalls**: Stub fork(), exec(), signal() that don't exist in Wasm

## Adaptation Notes for Emscripten

Emscripten already provides many things that WASIX doesn't:
- pthreads (via SharedArrayBuffer)
- Partial POSIX filesystem
- dlopen/dlsym stubs
- Signal handler stubs

So our shims will be a **subset** of node-wasix32's — only the V8/Node-specific
gaps that Emscripten's sysroot doesn't cover.
