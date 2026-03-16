# Architecture: Wasm-Native Linux with Dual-Backend Syscall Layer

## Context

Running large Node.js applications (Claude, Codex, Gemini CLI — each ~20MB of JavaScript) in a browser requires a Linux-compatible environment that doesn't pay a per-instruction emulation tax. ISA emulation approaches (RISC-V, x86) hit a fundamental ceiling because every guest CPU instruction must be decoded and translated, costing billions of emulation events for real workloads.

This is a greenfield project that eliminates ISA emulation entirely:
1. Compiles programs (bash, Node.js/V8) from C/C++ source directly to Wasm — zero CPU emulation
2. Runs a real Linux kernel (LKL) compiled to Wasm in the browser for battle-tested syscall handling
3. Implements userspace mmap/munmap/mprotect shim (the kernel can't do virtual memory in Wasm, but V8 needs the mmap API)
4. Uses WALI's syscall API spec as the interface, enabling a second server-side backend where syscalls pass through to a real Linux kernel
5. A middleware layer selects the backend; programs and users see identical behavior either way

**Priority**: Browser backend (LKL + mmap shim) is the focus. Server backend (WALI passthrough) is designed for but implemented later.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User-facing layer                     │
│   xterm.js terminal  ·  rootfs.tar  ·  same .wasm binaries  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Syscall Middleware                         │
│                                                              │
│   - WALI-spec syscall API (same numbers, same semantics)     │
│   - Backend selection at launch (browser or server)          │
│   - Programs don't know which backend they're on             │
│                                                              │
│   ┌─────────────────────┐    ┌────────────────────────────┐ │
│   │  Browser Backend     │    │  Server Backend (future)   │ │
│   │  (PRIMARY FOCUS)     │    │                            │ │
│   │                      │    │  WALI passthrough to       │ │
│   │  LKL kernel.wasm     │    │  real Linux kernel         │ │
│   │  + mmap userspace    │    │                            │ │
│   │    shim              │    │  Real fork/COW, real FS,   │ │
│   │                      │    │  real sockets              │ │
│   │  VFS: in-memory tar  │    │                            │ │
│   │  Net: WebTransport   │    │  Existing WALI runtime     │ │
│   │  fork: vfork+exec    │    │  (github.com/arjunr2/WALI)│ │
│   │    or mem copy        │    │                            │ │
│   └─────────────────────┘    └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Wasm Programs                             │
│                                                              │
│   bash.wasm (busybox)     ~2MB     compiled from C source    │
│   node.wasm (V8 jitless)  ~50-80MB compiled from C++ source │
│                                                              │
│   All compiled with Emscripten/clang → wasm32/wasm64         │
│   All linked against musl libc                               │
│   All make syscalls via WALI API                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Browser Backend (Primary Focus)

### Component 1: LKL Kernel compiled to Wasm

Compile the Linux kernel via [LKL (Linux Kernel Library)](https://github.com/lkl/linux) to Wasm. LKL turns the kernel into a linkable library with syscall entry points as function exports. [WasmLinux](https://github.com/okuoku/wasmlinux-project) has already demonstrated this is possible.

**What the kernel handles** (battle-tested, 30+ years of edge cases):
- VFS: open, read, write, close, stat, readdir, symlinks, mount points
- Pipes: pipe2, read/write blocking semantics, FIFO buffering
- Process lifecycle: exit, wait4, getpid, getppid, process table
- Signals: rt_sigaction, rt_sigprocmask, signal delivery
- Scheduling: process state, blocking/waking
- TTY/terminal: ioctl, termios
- Misc: uname, clock_gettime, getrandom, futex

**What the kernel does NOT handle** (NOMMU limitations):
- mmap/munmap/mprotect → userspace shim (see Component 2)
- fork with COW → vfork+exec or explicit memory copy
- Demand paging → not needed (Wasm linear memory is always committed)

**Kernel I/O backends** (bridge kernel to browser APIs):
- Block device → in-memory tar rootfs
- Network → WebTransport bridge to external proxy
- Console → SharedArrayBuffer stdin/stdout ring buffer
- Random → browser crypto.getRandomValues()
- Clock → performance.now()

### Component 2: Userspace mmap/munmap/mprotect Shim

V8 needs the mmap API but not the MMU. V8 calls like `mmap(NULL, size, PROT_READ|PROT_WRITE, MAP_ANONYMOUS|MAP_PRIVATE, -1, 0)` are really just "give me N bytes of zeroed memory."

**Implementation**:
- Intercept mmap/munmap/mprotect syscalls before they reach the LKL kernel
- mmap(MAP_ANONYMOUS) → bump/slab allocator in Wasm linear memory
- mmap(MAP_FIXED, addr) → return the requested address region (we control the address space)
- munmap → free the region (mark as available for reallocation)
- mprotect → software permission tracking (no hardware enforcement in Wasm, but track read/write/exec flags; V8 uses guard pages for stack overflow detection which needs alternative handling)
- mmap(fd, offset) → copy file contents from VFS into allocated region
- mremap → allocate new region, memory.copy old contents, free old

**Memory layout** (within Wasm linear memory):
```
0x00000000 ┌──────────────────────┐
           │ Emscripten heap      │ (kernel + runtime data structures)
           │ (managed by sbrk)    │
0x10000000 ├──────────────────────┤
           │ mmap arena           │ (userspace mmap shim manages this region)
           │ V8 pointer cage      │
           │ V8 heap regions      │
           │ JIT code (jitless=   │
           │   N/A, but other     │
           │   mmap users)        │
           │ Shared libs          │
0x80000000 ├──────────────────────┤
           │ Stack(s)             │
           └──────────────────────┘

Total: up to 4GB (wasm32) or unlimited (memory64)
Target: memory64 for V8's address space needs
Fallback: v8_enable_pointer_compression on wasm32
```

**V8-specific mmap patterns to handle**:
1. Large anonymous mappings for V8's heap cage (~2-4GB reservation) → reserve address range, commit on first write
2. Guard pages (mprotect PROT_NONE) → software trap on access (bounds check before each access in guarded regions, or catch Wasm trap)
3. Code pages (mprotect PROT_EXEC) → N/A in jitless mode
4. Small anonymous mappings for internal data → straightforward allocator

### Component 3: Process Model

Each "process" runs as a separate Web Worker with its own Wasm instance.

**exec():**
1. Syscall middleware receives execve(path, argv, envp)
2. Middleware resolves path → .wasm module (from cache, OPFS, or rootfs)
3. `WebAssembly.instantiate(module, { syscall_imports })` in target Worker
4. New instance starts at `_start()` with argc/argv/envp on stack
5. FD table inherited from parent process

**fork() / vfork():**
1. Parent Worker calls fork syscall
2. Middleware spawns new Worker
3. Copy parent's Wasm linear memory to child (SIMD bulk `memory.copy`, ~10-50ms)
4. Child resumes from fork return point (return 0)
5. Parent either blocks (vfork) or continues (fork)
6. For the common fork+exec pattern: optimize by skipping the memory copy (posix_spawn fast path)

**pipe():**
1. Kernel creates pipe (real LKL pipe implementation)
2. Kernel-managed buffer with blocking read/write semantics
3. Cross-Worker pipe I/O goes through kernel (which runs on its own Worker or main thread)

**Blocking:**
- Per-Worker Atomics.wait() for blocking syscalls (read, wait4, etc.)
- JSPI for Node.js internal async I/O (libuv event loop)
- Main thread never blocks (kernel polls or uses Atomics.waitAsync)

### Component 4: Syscall Middleware

The layer that sits between Wasm programs and the backend. Implements the WALI syscall API.

```
Program calls: musl __syscall(NR_openat, dirfd, path, flags, mode)
         │
         ▼
Middleware (linked into each program's Wasm instance):
  1. Is this a mmap/munmap/mprotect call?
     → Yes: handle in userspace shim (Component 2)
     → No: continue
  2. Pack syscall args into SharedArrayBuffer
  3. Atomics.notify kernel Worker
  4. Atomics.wait for response
  5. Return result to program

Kernel Worker receives syscall:
  1. Unpack args from SharedArrayBuffer
  2. Call LKL kernel entry point (in browser mode)
     OR forward to server (in server mode)
  3. Pack result into SharedArrayBuffer
  4. Atomics.notify program Worker
```

**The WALI spec defines the syscall numbers and semantics.** Both backends implement the same interface. Programs compiled against this API work on either backend without modification.

---

## Compiling Programs to Wasm

### Busybox (bash, coreutils)
- Source: busybox C source
- Toolchain: Emscripten or clang --target=wasm32-wasi + WALI
- Difficulty: Low — busybox already supports NOMMU cross-compilation
- Output: busybox.wasm (~1-2MB)
- Applets: sh, echo, cat, ls, env, grep, sed, head, tail, mkdir, rm, cp, mv, chmod, pwd, test, printf, tr, wc, id, uname, sleep, kill, true, false

### Node.js + V8
- Source: Node.js v20 LTS C++ source
- Toolchain: Emscripten
- V8 flags: `--jitless`, `v8_enable_pointer_compression=true` (or memory64), `icu_small=true`
- libuv: JSPI-based async I/O (suspend Wasm on Promise, resume on resolve)
- OpenSSL: BoringSSL or Emscripten's port
- DNS: hypercall to browser
- Difficulty: High — V8 Torque builtins need C++ fallback stubs
- Output: node.wasm (~50-80MB, gzips to ~10-15MB)
- The mmap shim (Component 2) is critical for V8 — without it V8 cannot initialize

---

## Server Backend (Future, Designed For Now)

The middleware selects backend at launch. In server mode:
- Syscalls pass through to real Linux kernel via WALI runtime (MIT-licensed, [github.com/arjunr2/WALI](https://github.com/arjunr2/WALI))
- Same .wasm binaries run on Wasmtime/WAMR with WALI extensions
- Real fork/COW, real filesystem, real sockets
- Terminal streams to browser via WebSocket
- No LKL, no mmap shim needed — real kernel does everything

**The middleware API is identical in both modes.** This is enforced by using WALI's syscall spec as the contract. A program that works in browser mode works in server mode and vice versa.

### Middleware Design Decisions

**Live migration between backends**: Target feature. A session starts in browser mode (offline-first), and when a server becomes available, migrates mid-session to server-side passthrough for full performance/compatibility. This requires serializing process state (Wasm linear memory, FD table, kernel state) and resuming on the other side. This is a key selling point longer term and should be designed for from the start, even if implemented later.

**Rootfs consistency**: Both backends should use the same rootfs.tar, at least initially. Security and customer validation concerns require that the environment is identical regardless of backend. Whether the server backend can optionally use its own filesystem is a future decision that needs more thought.

**Startup model**: Offline-first with server acceleration. Browser backend is the default and must work standalone. Server backend is an optional accelerator when available. The reverse (server-first with browser fallback) is also useful and the middleware should support both modes, but offline-first is the priority for MVP.

---

## Project Structure

```
project-root/
├── docs/
│   └── ARCHITECTURE.md              # this file
│
├── kernel/                           # LKL kernel compiled to Wasm
│   ├── lkl/                         # LKL source (git submodule of github.com/lkl/linux)
│   ├── backends/                    # Kernel I/O backends for browser
│   │   ├── block.c                  # In-memory tar block device
│   │   ├── console.c               # SAB-based stdin/stdout
│   │   ├── net.c                    # WebTransport network backend
│   │   └── random.c                # crypto.getRandomValues() bridge
│   ├── CMakeLists.txt               # Build: LKL → Wasm (via wasm2c + Emscripten or direct)
│   └── kernel.wasm                  # Output
│
├── mmap-shim/                        # Userspace mmap/munmap/mprotect
│   ├── mmap.c                       # Allocator in Wasm linear memory
│   ├── mmap.h                       # API
│   └── tests/                       # mmap test suite (standalone, no kernel needed)
│
├── middleware/                       # Syscall dispatch + backend selection
│   ├── syscall.h                    # WALI-spec syscall interface (C header)
│   ├── syscall_browser.c           # Browser backend: route to LKL kernel + mmap shim
│   ├── syscall_server.c            # Server backend: WALI passthrough (future)
│   ├── process.js                   # Process manager: Worker lifecycle, exec(), fork()
│   ├── fd_table.js                  # File descriptor table (inherited across fork/exec)
│   └── loader.js                    # Backend detection + initialization
│
├── programs/                         # Wasm-compiled userspace programs
│   ├── busybox/
│   │   ├── busybox/                 # Busybox source (git submodule)
│   │   ├── config                   # Busybox .config (NOMMU, selected applets)
│   │   ├── Makefile                 # Build: busybox → busybox.wasm
│   │   └── busybox.wasm             # Output
│   └── node/
│       ├── node/                    # Node.js source (git submodule, v20 LTS)
│       ├── v8_patches/              # V8 patches for Wasm target (jitless, builtins)
│       ├── libuv_jspi.c             # libuv port using JSPI for async
│       ├── Makefile                 # Build: node → node.wasm
│       └── node.wasm                # Output (~50-80MB)
│
├── runtime/                          # Browser runtime (JS/TS)
│   ├── index.html                   # Entry point, xterm.js terminal
│   ├── kernel_worker.js             # Worker running LKL kernel.wasm
│   ├── process_worker.js            # Worker template for user processes
│   ├── sab_protocol.js             # SharedArrayBuffer layout + helpers
│   ├── network_bridge.js           # WebTransport → kernel network backend
│   └── opfs_cache.js               # OPFS-based .wasm module cache
│
├── rootfs/                           # Root filesystem
│   ├── Makefile                     # Build: assemble rootfs.tar from programs/ outputs
│   ├── overlay/                     # Static files: /etc/passwd, /etc/hostname, etc.
│   └── rootfs.tar                   # Output
│
├── proxy/                            # WebTransport → TCP proxy (Go)
│   ├── main.go
│   └── Dockerfile
│
├── tests/
│   ├── test_echo.js                 # echo hello | cat
│   ├── test_node_hello.js           # node -e "console.log(1+1)"
│   ├── test_mmap.js                 # mmap shim correctness
│   ├── test_pipe.js                 # pipe between processes
│   ├── test_exec.js                 # bash exec node
│   └── test_e2e.js                  # Full pipeline: bash → node → claude
│
├── Makefile                          # Top-level: build kernel, programs, rootfs, bundle
├── package.json                      # Dev server, test runner
└── .github/
    └── workflows/
        └── ci.yml                   # Build + test on push
```

### Getting Started (Bootstrap)

```bash
# 1. Create the repo
mkdir <project-name> && cd <project-name>
git init

# 2. Copy this architecture doc
mkdir docs
cp ARCHITECTURE.md docs/

# 3. Add LKL as a submodule
git submodule add https://github.com/lkl/linux.git kernel/lkl

# 4. Add busybox as a submodule
git submodule add https://github.com/mirror/busybox.git programs/busybox/busybox

# 5. Add Node.js as a submodule (v20 LTS branch)
git submodule add -b v20.x https://github.com/nodejs/node.git programs/node/node

# 6. Install Emscripten (needed for all Wasm compilation)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh
cd ..

# 7. Scaffold the project
mkdir -p kernel/backends mmap-shim/tests middleware programs runtime rootfs/overlay proxy tests

# 8. Start with Phase 1: get LKL kernel compiling to Wasm
# Reference: https://github.com/okuoku/wasmlinux-project
```

### Build Order

1. **kernel.wasm** — LKL compiled to Wasm (Phase 1)
2. **busybox.wasm** — busybox compiled to Wasm, linked against middleware syscall shim (Phase 2)
3. **mmap shim** — standalone tests first, then integrated (Phase 3)
4. **node.wasm** — Node.js compiled to Wasm, depends on mmap shim (Phase 4)
5. **rootfs.tar** — assembled from busybox.wasm + node.wasm + overlay files
6. **runtime bundle** — HTML + JS + kernel.wasm + rootfs.tar (Phase 5)

---

## Implementation Phases

### Phase 1: LKL Kernel to Wasm (3-4 weeks)
1. Fork LKL, configure for Wasm target (follow WasmLinux's approach)
2. Compile LKL to Wasm via clang → wasm → wasm2c → Emscripten (WasmLinux pipeline) or direct Emscripten if possible
3. Implement kernel I/O backends: in-memory block device, console via SAB, random via crypto API
4. Test: kernel boots, mounts rootfs, handles basic syscalls (open, read, write, close, stat)
5. **Milestone**: LKL kernel running in browser, handling file I/O syscalls

### Phase 2: Busybox + Syscall Middleware (2-3 weeks)
1. Compile busybox to Wasm with WALI-spec syscall interface
2. Build the syscall middleware (dispatch layer between programs and kernel)
3. Implement Worker-per-process model with SAB syscall channel
4. Wire up exec() to load .wasm modules
5. Wire up pipe() through LKL kernel
6. **Milestone**: `echo hello | cat` works in browser

### Phase 3: mmap Userspace Shim (3-4 weeks)
1. Implement mmap(MAP_ANONYMOUS) as bump/slab allocator in Wasm linear memory
2. Implement munmap (free regions)
3. Implement mprotect (software permission tracking)
4. Implement mmap(MAP_FIXED) for V8's address space reservation
5. Handle V8's guard page pattern (PROT_NONE regions)
6. Test with small C programs that use mmap before attempting V8
7. **Milestone**: mmap-heavy test programs work correctly

### Phase 4: Node.js/V8 to Wasm (4-6 weeks)
1. Fork Node.js v20, configure Emscripten build (jitless V8, pointer compression or memory64, small ICU)
2. Stub/port libuv for JSPI-based async
3. Build node.wasm, test against mmap shim
4. Iterate on mmap shim for V8-specific patterns (heap cage, guard pages)
5. Wire networking through kernel → WebTransport bridge
6. **Milestone**: `node -e "console.log(1+1)"` works in browser

### Phase 5: Full Pipeline (2-3 weeks)
1. exec() from bash.wasm to node.wasm
2. Package Claude CLI JS into rootfs
3. Test: `bash -c "node claude.js 'write a haiku'"`
4. Cache compiled .wasm modules in OPFS
5. Streaming compilation for node.wasm
6. **Milestone**: Claude CLI runs end-to-end in browser

### Phase 6: Server Backend + Middleware (future)
1. Integrate WALI runtime as server-side backend
2. Build middleware backend selection (detect environment, pick backend)
3. WebSocket terminal bridge for server mode
4. Verify same .wasm binaries work on both backends
5. **Milestone**: Same binaries, same UX, browser or server

---

## Verification

1. `echo hello | cat` → "hello" (busybox + kernel pipes)
2. `ls /` → rootfs directory listing (kernel VFS)
3. `node -e "console.log(1+1)"` → "2" (V8 + mmap shim)
4. `node -e "require('fs').readdirSync('/')"` → rootfs listing (Node.js fs → kernel VFS)
5. `node -e "fetch('https://httpbin.org/get')"` → HTTP response (kernel net → WebTransport)
6. `bash -c "node claude.js 'write a haiku'"` → haiku output (full pipeline)
7. Performance: `claude --version` < 15s
8. Same .wasm binaries produce identical results on browser and server backends

## Required & Targeted Wasm/Browser Features

These are the modern browser capabilities this architecture depends on or benefits from. Browsix (2017) didn't have any of them — they're the reason this design is viable now.

### Required (must have)

| Feature | What it enables | Browser support |
|---|---|---|
| **SharedArrayBuffer** | Syscall channel between program Workers and kernel Worker. Atomics.wait/notify for blocking. | All major browsers with COOP/COEP headers |
| **Atomics.wait / Atomics.notify** | Blocking syscalls in Workers without spinning | All major browsers |
| **Bulk memory operations** (`memory.copy`, `memory.fill`) | Fast fork() via memory copy, memset for mmap zeroing | All major browsers |
| **WebAssembly.compileStreaming** | Stream-compile node.wasm (~50-80MB) while downloading, not after | All major browsers |
| **Web Workers** | One Worker per process — process isolation model | All major browsers |

### Strongly recommended (use if available, degrade gracefully)

| Feature | What it enables | Browser support |
|---|---|---|
| **memory64** | >4GB address space for V8's pointer cage. Without it, must use `v8_enable_pointer_compression` and stay under 4GB. | Chrome 133+, Firefox 134+, Safari 18.2+ |
| **JSPI** (JS Promise Integration) | Node.js libuv async I/O: Wasm suspends on Promise, resumes on resolve. Without it, must use Asyncify (10-30% overhead). | Chrome 126+, Firefox behind flag |
| **Wasm SIMD** (`v128` ops) | Accelerate memory copies for fork(), bulk data operations, crypto | All major browsers |
| **Wasm tail calls** (`return_call`) | Efficient dispatch loops in LKL kernel and V8 Ignition interpreter | Chrome 112+, Firefox 121+, Safari 18+ |
| **Wasm exception handling** (`try_table`, `exnref`) | LKL kernel uses setjmp/longjmp internally; Wasm exceptions avoid costly JS boundary crossing for these | Chrome 127+, Firefox 129+, Safari 18+ |
| **Atomics.waitAsync** | Kernel on main thread can await Worker results without blocking the UI thread | All major browsers |
| **OPFS** (Origin Private File System) | Cache compiled .wasm modules and rootfs for instant second-load. Persistent VFS storage. | All major browsers |

### Future (watch and adopt when available)

| Feature | What it enables | Status |
|---|---|---|
| **memory-control proposal** (`memory.map`, `memory.unmap`, `memory.protect`, `memory.discard`) | Native mmap semantics in Wasm — would replace the userspace mmap shim entirely | [Phase 1 proposal](https://github.com/WebAssembly/memory-control) |
| **Wasm threads proposal** (shared-everything) | True shared-memory threads within a single Wasm instance — would enable pthreads without separate Workers | Active development |
| **Wasm GC** | Could help with managed-language interop if we ever target non-C/C++ programs | Shipping in Chrome/Firefox |
| **Component Model** | Clean inter-module linking — could replace manual dynamic linking of .wasm "shared libraries" | Active development |
| **WasmFX** (typed continuations / effect handlers) | Elegant stack switching for coroutines, green threads, signal delivery | Early proposal |

### Compile flags (Emscripten)

All .wasm binaries (kernel, busybox, node) should be compiled with:
```
-msimd128                    # SIMD for fast memory ops
-mtail-call                  # tail calls for dispatch loops
-mbulk-memory                # memory.copy / memory.fill
-matomics                    # atomic ops for SAB coordination
-fwasm-exceptions            # native Wasm exceptions (not JS)
-sWASM_LEGACY_EXCEPTIONS=0   # no legacy exception mode
-sSHARED_MEMORY=1            # enable SharedArrayBuffer
-sALLOW_MEMORY_GROWTH=1      # dynamic memory growth
```

For memory64 targets, add:
```
-sMEMORY64=1                 # 64-bit memory indexing
```

### Required HTTP headers

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```
These enable SharedArrayBuffer. Without them, the entire architecture doesn't work.

---

## Repos to Pull From (as of March 2026)

### Directly use (submodule or fork)

| Repo | What | Why | Status |
|---|---|---|---|
| [arjunr2/WALI](https://github.com/arjunr2/WALI) | Syscall API spec + WAMR-based runtime | Defines the syscall interface contract. ~150 host functions mapping 1-to-1 to Linux syscalls. MIT license. 108 stars. Has a Rust target upstream (`wasm32-wali-linux-musl` in rustc). | Active — 33 commits as of Jan 2026, EuroSys 2025 paper |
| [arjunr2/wali-musl](https://github.com/arjunr2/wali-musl) | musl libc patched for WALI | musl with syscall entry points wired to WALI imports. Use this as the libc for all compiled programs. | Active — companion to WALI |
| [lkl/linux](https://github.com/lkl/linux) | Linux Kernel Library | The kernel compiled as a linkable library. `arch/lkl` is the architecture port. API is Linux syscall interface. Use as the kernel for the browser backend. | Active — lkl-docker updated Feb 2026 |
| [mirror/busybox](https://github.com/mirror/busybox) | BusyBox source | Already supports NOMMU cross-compilation. Provides sh + coreutils. | Actively maintained upstream |
| [nodejs/node](https://github.com/nodejs/node) | Node.js source (v20 LTS) | Fork v20.x branch, configure for Emscripten build with jitless V8. | Actively maintained upstream |

### Use as reference implementation (study, adapt, don't submodule)

| Repo | What | Learn from it |
|---|---|---|
| [joelseverin/linux-wasm](https://github.com/joelseverin/linux-wasm) | Full Linux kernel as Wasm arch target | **Best reference for kernel-to-Wasm.** Adds Wasm as a proper `arch/` in the kernel. Each process = Web Worker. Creative solution for scheduling (spin up a "CPU" per task, never preempt). Includes patched LLVM, musl, BusyBox build scripts. Has a [live demo](https://joelseverin.github.io/linux-wasm/). Boots in <1s. Announced Nov 2025, covered by [Phoronix](https://www.phoronix.com/news/Linux-Kernel-WebAssembly) and [LWN](https://lwn.net/Articles/1044787/). |
| [okuoku/wasmlinux-project](https://github.com/okuoku/wasmlinux-project) | LKL kernel + musl + BusyBox → Wasm | **Best reference for LKL-to-Wasm specifically.** Uses pipeline: clang → wasm → wasm2c → Emscripten (needed for setjmp/longjmp). Has companion repos for [musl](https://github.com/okuoku/wasmlinux-musl) and [BusyBox](https://github.com/okuoku/wasmlinux-busybox) ports. Early PoC, 75 stars. [Live demo](https://wasmlinux-demo.pages.dev/). |
| [k8188219/busybox_wasm](https://github.com/k8188219/busybox_wasm) | BusyBox compiled to Wasm via Emscripten | Build script reference for BusyBox → Wasm. Based on BusyBox v1.32.0. Currently no `sh`/`ash` (we'd need to add that). Shows which Emscripten flags work. |
| [3p3r/busybox-wasm](https://github.com/3p3r/busybox-wasm) | BusyBox Wasm build scripts | Alternative build approach — not a full fork of BusyBox, just a build script overlay. Easier to upgrade BusyBox versions. |
| [plasma-umass/browsix](https://github.com/plasma-umass/browsix) | Unix in the browser (2017) | **Process model reference.** TypeScript kernel, Worker-per-process, fork via memory copy, pipe via kernel-mediated buffer. Abandoned but architecture is proven (ASPLOS 2017 paper). ~1.5K stars. |

### Specs and proposals to track

| Repo | What | Relevance |
|---|---|---|
| [WebAssembly/memory-control](https://github.com/WebAssembly/memory-control) | memory.map, memory.unmap, memory.protect, memory.discard | Would replace the userspace mmap shim entirely when it ships |
| [WebAssembly/threads](https://github.com/WebAssembly/threads) | Shared-everything threads proposal | Would enable pthreads within a single Wasm instance (no Worker overhead) |
| [aspect-build/aspect-cli](https://github.com/aspect-build) | Bazel build rules for JS/Wasm | Build tooling reference (not directly related to runtime) |

### Decision: joelseverin/linux-wasm vs okuoku/wasmlinux-project

Both port the Linux kernel to Wasm. Key differences:

| | joelseverin/linux-wasm | okuoku/wasmlinux-project |
|---|---|---|
| Approach | Wasm as a proper `arch/` in the kernel | LKL (kernel as library) |
| Scheduling | 1 Web Worker per task (creative, scales) | Single-threaded runner |
| Build pipeline | LLVM patches + direct Wasm | clang → wasm → wasm2c → Emscripten |
| Maturity | PoC, boots + runs shell, crashes eventually | PoC, boots + runs BusyBox |
| setjmp/longjmp | Uses LLVM patches | Uses wasm2c + Emscripten workaround |
| Community | LWN coverage, HN discussion, growing | Smaller, author-driven |

**Recommendation**: Start with **okuoku/wasmlinux-project** (LKL approach) because LKL's library model maps better to our architecture — the kernel is a callable library, not a standalone OS. Study **joelseverin/linux-wasm** for the Worker-per-process scheduling model and LLVM patches. If LKL's limitations become blocking, consider switching to joelseverin's approach.

---

## Papers & References

- [WALI: Empowering WebAssembly with Thin Kernel Interfaces](https://dl.acm.org/doi/10.1145/3689031.3717470) — EuroSys 2025
- [Browsix-Wasm / Not So Fast](https://www.usenix.org/conference/atc19/presentation/jangda) — ATC 2019. Wasm perf benchmarks, SAB syscall channel
- [Loupe](https://dl.acm.org/doi/10.1145/3617232.3624861) — ASPLOS 2024. Dynamic syscall scoping
- [Browsix](https://browsix.org/powers2017-browsix.pdf) — ASPLOS 2017. Unix process model in browser
- [Wasm memory-control proposal](https://github.com/WebAssembly/memory-control) — Future native mmap
