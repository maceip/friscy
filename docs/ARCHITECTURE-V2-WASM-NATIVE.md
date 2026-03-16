# Architecture: Wasm-Native Linux with Dual-Backend Syscall Layer

## Context

friscy's RISC-V emulation approach hits a fundamental ceiling: ~3.4B emulated instructions for `claude --version`, with V8 running jitless through an ISA translation layer. No amount of JIT optimization eliminates the per-instruction emulation tax.

This plan describes a new project that:
1. Compiles programs (bash, Node.js/V8) from C/C++ source directly to Wasm — zero ISA emulation
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
- Block device → in-memory tar rootfs (same concept as friscy's VFS)
- Network → WebTransport bridge (reuse from friscy)
- Console → SharedArrayBuffer stdin/stdout ring buffer (reuse from friscy)
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
- DNS: hypercall to browser (same as friscy)
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

## What Gets Reused From friscy

| Component | friscy source | Reuse |
|---|---|---|
| WebTransport bridge | `network_bridge.js` | Direct — kernel's network backend |
| Network RPC | `network_rpc_host.js` | Direct |
| SAB stdin/stdout | `index.html`, `worker.js` | Direct — kernel's console backend |
| Terminal UI | `index.html` (xterm.js) | Direct |
| Go WebTransport proxy | proxy server | Direct |

Everything else (libriscv, rv2wasm, JIT manager, AOT compiler) is not used.

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
7. Performance: `claude --version` < 15s (vs ~40s friscy)
8. Same .wasm binaries produce identical results on browser and server backends

## Key References

- [WALI](https://github.com/arjunr2/WALI) — Syscall API spec + server-side runtime (MIT license)
- [WasmLinux](https://github.com/okuoku/wasmlinux-project) — LKL kernel compiled to Wasm (reference implementation)
- [LKL](https://github.com/lkl/linux) — Linux Kernel Library
- [Loupe](https://dl.acm.org/doi/10.1145/3617232.3624861) — Dynamic syscall scoping methodology
- [Browsix-Wasm](https://www.usenix.org/conference/atc19/presentation/jangda) — Wasm perf benchmarks, SAB syscall channel design
- [Wasm memory-control proposal](https://github.com/WebAssembly/memory-control) — Future native mmap support in Wasm
