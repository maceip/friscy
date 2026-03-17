# v9 — EdgeJS Browser Runtime

Browser-native Node.js runtime based on [EdgeJS](https://github.com/wasmerio/edgejs),
compiled to WebAssembly via Emscripten.

**Goal**: Run Claude Code, Codex CLI, and Gemini CLI in the browser.

## Module Structure

```
v9/
├── edgejs-src/              # EdgeJS upstream source (git submodule)
├── napi-bridge/             # N-API → browser JS engine bridge
│   └── index.js             # Handle table, type marshaling, function calls
├── wasi-shims/              # POSIX gap shims (from node-wasix32 research)
├── emscripten-toolchain.cmake  # CMake toolchain for Emscripten target
├── build-emscripten.sh      # Main build script
├── build/                   # Build output directory
└── tests/                   # Integration tests
```

## How It Works

EdgeJS separates the JS engine from Node.js APIs via N-API:

1. **EdgeJS C++ runtime** compiles to `.wasm` via Emscripten
   - Includes: fs, http, https, crypto, tls, streams, net, path, url, etc.
   - libuv event loop, module loader, process management
2. **N-API bridge** (`napi-bridge/`) connects Wasm ↔ browser JS engine
   - Browser's V8/JSC/SpiderMonkey executes user JavaScript
   - No need to compile V8 to Wasm — we get JIT performance for free
3. **wasi-shims** patch remaining POSIX gaps that Emscripten doesn't cover

## Setup

```bash
# 1. Clone EdgeJS source
git clone https://github.com/wasmerio/edgejs.git edgejs-src/

# 2. Ensure Emscripten is available
source $EMSDK/emsdk_env.sh

# 3. Build
./build-emscripten.sh

# 4. Test
cd tests && node test-basic.js
```

## Architecture

```
┌──────────────────────────────────────────┐
│              Browser Tab                  │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │     EdgeJS Runtime (.wasm)          │ │
│  │     ~46 Node.js built-in modules    │ │
│  │     libuv, OpenSSL, nghttp2, etc.   │ │
│  └──────────┬────────────┬─────────────┘ │
│        N-API │            │ Syscalls      │
│             ▼            ▼               │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │ Browser JS   │  │ Emscripten       │  │
│  │ Engine       │  │ Syscall Layer    │  │
│  │ (V8/JSC)     │  │ + JSPI async     │  │
│  └──────────────┘  └──────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │ WebTransport Proxy → Internet       │ │
│  │ (api.anthropic.com, api.openai.com) │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

## Prior Art

- **EdgeJS** (wasmerio): N-API split, WASIX build, ~46 Node modules
- **node-wasix32** (Multi-V-VM): 30+ wasi-*.h shims mapping V8/Node POSIX gaps
- **kasm** (this repo): WebTransport proxy, Emscripten build pipeline
