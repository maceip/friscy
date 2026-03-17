# EdgeJS + node-wasix32 Integration Strategy

## Problem Statement

We need **Claude Code**, **Codex CLI**, and **Gemini CLI** running in the browser.
These require: HTTP/HTTPS, TLS, crypto, streams, fs, TTY, and full ES2023.

Previous attempts:
- **LLRT/QuickJS**: Missing http/https/tls/worker_threads — apps won't run
- **node-wasix32**: Hit "fundamental architectural incompatibilities" — V8 JIT can't compile to Wasm
- **Raw V8+Node Emscripten port**: 4-6 week HIGH risk effort, never attempted

## New Approach: Fork EdgeJS

**EdgeJS** (github.com/aspect-build/aspect-edgejs, moved to wasmerio/edgejs) already:
- Compiles to WASIX (WebAssembly) with `EDGE_NAPI_PROVIDER=imports`
- Separates V8 from Node.js API layer via N-API boundary
- Implements ~46 Node.js built-in modules (fs, http, https, crypto, tls, streams, etc.)
- Has working WASIX build script (`wasix/build-wasix.sh`)

**Key insight**: In WASIX mode, V8 is NOT compiled to Wasm. The N-API functions
are imported from the host. In a browser, the host IS a JS engine — we get V8
for free.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  EdgeJS Node.js API Layer (.wasm)    │   │
│  │  - fs, http, crypto, streams, tls    │   │
│  │  - libuv event loop                  │   │
│  │  - ~53K lines C++ → Emscripten       │   │
│  └──────────┬──────────────┬────────────┘   │
│             │              │                 │
│      N-API imports    Syscalls (WALI)        │
│             │              │                 │
│  ┌──────────▼──────┐  ┌───▼──────────────┐  │
│  │ Browser JS       │  │ kasm LKL Kernel  │  │
│  │ Engine (V8/JSC)  │  │ (kernel.wasm)    │  │
│  │ - runs user JS   │  │ - VFS, pipes     │  │
│  │ - full JIT perf  │  │ - mmap-shim      │  │
│  └─────────────────┘  └──────────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ WebTransport Proxy → Real Internet   │   │
│  │ (api.anthropic.com, api.openai.com)  │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## What We Take From Each Project

### From EdgeJS (wasmerio/edgejs)
- **N-API architecture**: Clean V8 separation via `napi/` layer
- **Node.js built-in modules**: `lib/` directory (~46 modules)
- **CMake build system**: Adaptable to Emscripten target
- **WASIX build script**: Template for our Emscripten build
- **Runtime kernel**: Process/bootstrap/module-loader orchestration

### From node-wasix32 (Multi-V-VM/node-wasix32)
- **wasi-*.h shim headers** (~30+ files): Show exactly which POSIX APIs V8/Node need
  - `wasi-all-fixes.h` — master include with size constants, namespace re-exports
  - `wasi-v8-*.h` — V8 engine adaptations for 32-bit Wasm
  - `wasi-platform-fixes.h` — platform abstraction patches
  - `wasi-cppgc-stubs.h` — GC component stubs
  - `wasi-simdutf-compat.h` — SIMD text encoding compat
- **Build knowledge**: Their `common.gypi` shows `target_arch=wasm32`, `V8_USING_WASI_SHIMS=1`
- **Failure analysis**: V8 JIT is the blocker; interpreter-only (jitless) or host-provided engine is the answer

### From kasm (existing infrastructure)
- **LKL kernel.wasm**: Provides Linux syscalls (VFS, pipes, process)
- **mmap-shim**: V8 heap allocation in Wasm linear memory
- **WebTransport proxy**: Network I/O to real APIs
- **Emscripten build pipeline**: Proven for C/C++ → Wasm

## Implementation Plan

### Phase 1: Fork & Adapt EdgeJS (Week 1)
1. Add EdgeJS as git submodule at `kasm/programs/node/edgejs/`
2. Create `emscripten-toolchain.cmake` (replacing `wasix-toolchain.cmake`)
3. Set `EDGE_NAPI_PROVIDER=imports` (browser provides JS engine)
4. Integrate node-wasix32's wasi-*.h shims for any remaining POSIX gaps

### Phase 2: N-API Browser Bridge (Week 2)
1. Create `napi/browser/` — N-API implementation that calls browser JS
2. Map N-API functions to browser APIs:
   - `napi_create_function` → browser Function constructor
   - `napi_call_function` → direct JS invocation
   - `napi_get_value_string_utf8` → TextDecoder
3. Use Emscripten's `EM_JS` / `EM_ASM` for JS interop

### Phase 3: Syscall Integration (Week 3)
1. Route EdgeJS syscalls to kasm's LKL kernel
2. Wire libuv's I/O to JSPI (async) or LKL (sync)
3. Connect network I/O to WebTransport proxy

### Phase 4: Test Target Apps (Week 4)
1. `edgejs -e "console.log(1+1)"` → "2"
2. `edgejs -e "require('https').get(...)"` → HTTP response
3. `edgejs claude-code/cli.js --version` → version string
4. Full Claude Code / Codex / Gemini CLI interaction

## Why This Works

1. **No V8-to-Wasm compilation needed** — browser already has V8/JSC/SpiderMonkey
2. **EdgeJS already proved the N-API split** — WASIX build works with imported engine
3. **node-wasix32 mapped all the POSIX gaps** — we know exactly what to shim
4. **kasm provides the kernel layer** — syscalls, VFS, pipes already working
5. **Target apps are API clients** — they mostly need HTTP/TLS + TTY, not exotic Node features

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| EdgeJS modules incomplete for target apps | Medium | Identify gaps early, patch incrementally |
| N-API browser bridge too complex | Low | EdgeJS already abstracts this cleanly |
| Performance too slow | Low | Browser JIT handles JS; only syscall overhead |
| Binary size too large | Medium | Tree-shake unused modules, gzip, OPFS cache |

## Files to Create

```
kasm/programs/node/
├── edgejs/                          # Git submodule (fork of wasmerio/edgejs)
├── emscripten-toolchain.cmake       # Emscripten cross-compilation config
├── napi-browser-bridge.js           # N-API → browser JS engine bridge
├── wasi-shims/                      # Adapted from node-wasix32's wasi-*.h
│   ├── wasi-all-fixes.h
│   ├── wasi-platform-fixes.h
│   └── ...
├── build-emscripten.sh              # Main build script
└── Makefile                         # Updated with EdgeJS targets
```
