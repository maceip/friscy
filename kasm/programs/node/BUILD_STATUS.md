# Node.js Emscripten Build Status

## Project: Kasm - Wasm-Native Linux
## Component: Node.js Browser Port (Phase 4)

---

## Executive Summary

This is a **high-risk, pioneering effort** to compile Node.js to WebAssembly for browser execution.
As of March 2026, no known working implementation exists anywhere - this would be the first.

**Status**: Infrastructure created, actual build NOT YET STARTED due to complexity.

---

## Investigation Results

### Web Search Findings
- **No existing Node.js emscripten port found** on GitHub or web
- Node.js has WASI support for running WASM inside Node.js (reverse of our goal)
- No browser-native Node.js runtime exists

### Technical Feasibility Assessment

#### ✅ Feasible Components
1. **Basic JavaScript execution**: V8 jitless mode works
2. **Pthreads**: SharedArrayBuffer + Atomics are stable
3. **Async I/O**: JSPI (JavaScript Promise Integration) is shipping in Chrome 126+
4. **Memory allocation**: mimalloc + custom mmap shim (in progress)
5. **Build system**: Emscripten supports C++20, Node.js uses gyp

#### ⚠️ Major Challenges
1. **V8 JITless + WASM = Incompatible**
   - V8's WebAssembly support requires JIT compiler (Liftoff)
   - JITless mode disables all JIT, including WASM
   - **Impact**: Node.js would run JS but not execute `.wasm` files
   - **Workaround**: Microsoft Edge's DrumBrake (WASM interpreter)

2. **libuv Platform Abstraction**
   - epoll/kqueue/IOCP don't exist in browser
   - Must replace with: File System Access API, fetch, WebSocket
   - **Complexity**: HIGH - affects entire Node.js runtime

3. **Binary Size**
   - Estimated: 50-80MB raw, ~10-15MB gzipped
   - V8 alone: ~30MB compiled
   - Loading time concern for first visit

4. **Native Addons (node-gyp modules)**
   - Native C++ addons won't work
   - Would need WASM recompilation of all dependencies

#### ❌ Blockers
1. **V8 Sandbox**: Not compatible with Emscripten's memory model
   - Must disable: `v8_enable_sandbox=0`

2. **Signal Handling**: Not supported in Wasm
   - SIGINT, SIGTERM, SIGUSR1 all need stubs

3. **Fork/Exec**: No true process model in Wasm
   - Use Workarounds: Worker spawn + memory copy

---

## Build Infrastructure Created

### Files Added
```
programs/node/
├── Makefile              # Main build orchestration
├── libuv_jspi.c          # JSPI-based async I/O adapter
├── v8_patches/
│   └── README.md         # V8 patch documentation
└── BUILD_STATUS.md       # This file
```

### Emscripten Flags Configured
- **Core**: `-msimd128 -mbulk-memory -matomics -mtail-call`
- **Memory**: `-sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB -sMALLOC=mimalloc`
- **Threading**: `-pthread -sPTHREAD_POOL_SIZE=navigator.hardwareConcurrency`
- **Async I/O**: `-sJSPI=1` (not Asyncify - more efficient)
- **Exceptions**: `-fwasm-exceptions` (native Wasm, not JS)

### V8 Configuration
- **JITless mode**: `--jitless` (interpreter only)
- **Pointer compression**: Enabled (critical for 32-bit Wasm)
- **Sandbox**: Disabled (incompatible)
- **External startup data**: Disabled

---

## Next Steps

### Phase 4A: V8 Standalone Build (Week 1-2)
Before attempting full Node.js, build V8 alone:

```bash
cd programs/node/node/deps/v8
gn gen out/wasm --args='
    target_cpu="wasm32"
    v8_enable_jitless=true
    v8_enable_pointer_compression=true
    v8_enable_sandbox=false
    is_debug=false
'
ninja -C out/wasm d8  # Build V8 shell only
```

Success criteria: `d8` runs `console.log("hello")` in browser.

### Phase 4B: libuv Porting (Week 2-3)
1. Replace epoll with JS-based event loop
2. File I/O via File System Access API
3. Network via fetch + WebTransport
4. Use JSPI for all async operations

### Phase 4C: Node.js Integration (Week 4-6)
1. Build Node.js with patched libuv
2. Link against project's mmap-shim
3. Integrate with LKL kernel syscall layer
4. Test: `node -e "console.log(1+1)"`

---

## Recommended Build Command

```bash
cd /home/devuser/kasm/programs/node

# Full build (will likely fail on first attempts - needs iteration)
make all

# Or step by step:
make check-emsdk   # Verify environment
make patch-v8      # Create V8 patches
make patch-libuv   # Create libuv adapter
make configure     # Run Node.js configure
make build         # Compile (expected to need debugging)
```

---

## Architecture Integration

### How This Connects to Kasm

```
User code: node script.js
         │
         ▼
┌─────────────────────┐
│ Node.js Wasm        │ <- THIS BUILD
│ - V8 jitless        │
│ - Patched libuv     │
│ - WALI syscalls     │
└─────────┬───────────┘
          │ Syscall interface (WALI)
          ▼
┌─────────────────────┐
│ Middleware Layer    │
│ (syscall dispatch)  │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌───────┐   ┌─────────┐
│ LKL   │   │ Server  │
│Kernel │   │ Backend │
│(Wasm) │   │ (WALI)  │
└───────┘   └─────────┘
```

---

## References

### Key Documentation
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - Full system design
- [V8 JITless Mode](https://v8.dev/blog/jitless)
- [Emscripten Pthreads](https://emscripten.org/docs/porting/pthreads.html)
- [JSPI Documentation](https://developer.chrome.com/docs/webassembly/jspi)
- [WasmLinux Project](https://github.com/okuoku/wasmlinux-project) - LKL to Wasm reference

### Related Projects
- [Browsix](https://github.com/plasma-umass/browsix) - TypeScript kernel (2017)
- [joelseverin/linux-wasm](https://github.com/joelseverin/linux-wasm) - Linux as Wasm arch
- [WALI](https://github.com/arjunr2/WALI) - Wasm Linux syscall interface

---

## Conclusion

This task is **technically challenging but theoretically possible**. The build infrastructure is now in place. The next step is iterative development to resolve build errors and platform incompatibilities.

**Estimated time to working build**: 4-6 weeks (matches ARCHITECTURE.md Phase 4 estimate)

**Risk level**: HIGH - pioneering work with unknown failure modes

**Recommended**: Start with V8 standalone build first, then integrate into Node.js.
