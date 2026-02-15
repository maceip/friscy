# friscy Architecture

## Overview

friscy runs Docker containers in the browser by:
1. Cross-compiling the container to RISC-V 64-bit
2. Extracting the rootfs as a tar
3. Running the entrypoint in libriscv (userland RISC-V emulator)
4. Compiling the emulator to WebAssembly via Emscripten
5. JIT-compiling hot code regions to native Wasm at runtime

This is userland-only emulation — no kernel boot, syscalls handled by the host.

---

## Runtime Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Browser — Main Thread                                │
│                                                                          │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐    │
│  │  xterm.js    │  │ network_rpc      │  │ network_bridge.js      │    │
│  │  terminal    │  │ _host.js         │  │ (WebTransport → TCP)   │    │
│  └──────┬───────┘  └────────┬─────────┘  └────────────────────────┘    │
│         │                    │                                           │
│         │  stdin/stdout      │  Network RPC responses                    │
│         ▼                    ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                SharedArrayBuffer Communication                    │   │
│  │                                                                    │   │
│  │  control_sab (4KB)        stdout_sab (64KB)      net_sab (64KB)   │   │
│  │  ┌─────────────────┐     ┌──────────────────┐   ┌─────────────┐  │   │
│  │  │ [0] command      │     │ [0] write_head   │   │ [0] lock    │  │   │
│  │  │ [4] status       │     │ [4] read_tail    │   │ [4] op      │  │   │
│  │  │ [8] length       │     │ [8+] ring data   │   │ [8] fd      │  │   │
│  │  │ [12] fd          │     │     (65528 bytes) │   │ [64+] data  │  │   │
│  │  │ [16] result      │     └──────────────────┘   └─────────────┘  │   │
│  │  │ [20] exit_code   │                                              │   │
│  │  │ [24] cols/rows   │     Atomics.wait / Atomics.notify            │   │
│  │  │ [64+] payload    │                                              │   │
│  │  └─────────────────┘                                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────────┐
│                     Web Worker                                            │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                   friscy.wasm (Emscripten)                         │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐  │   │
│  │  │               libriscv RV64GC Interpreter Core               │  │   │
│  │  │                                                               │  │   │
│  │  │  Dispatch: threaded (computed goto → br_table in Wasm)       │  │   │
│  │  │  Memory:   31-bit flat arena (2GB), O(1) read/write          │  │   │
│  │  │  ISA:      RV64IMAFDC (integer, multiply, atomic, FP, comp)  │  │   │
│  │  │  Segments: up to 1024 execute segments (for V8 JIT regions)  │  │   │
│  │  └─────────────────────────────────────────────────────────────┘  │   │
│  │                                │                                    │   │
│  │  ┌─────────────────────────────▼───────────────────────────────┐  │   │
│  │  │              Syscall Layer (~80 handlers)                     │  │   │
│  │  │                                                               │  │   │
│  │  │  syscalls.hpp:  file I/O, mmap, mprotect, brk, clone,       │  │   │
│  │  │                 futex, signals, execve, fork, ioctl,          │  │   │
│  │  │                 epoll, pipe, eventfd, prctl, uname            │  │   │
│  │  │  network.hpp:   socket, bind, listen, accept4, connect,      │  │   │
│  │  │                 send, recv, getsockname, setsockopt,          │  │   │
│  │  │                 epoll_pwait (socket polling)                   │  │   │
│  │  │  vfs.hpp:       tar-backed VFS, /proc/self/*, /dev/tty,      │  │   │
│  │  │                 /dev/null, /dev/urandom emulation              │  │   │
│  │  │  elf_loader.hpp: ELF loading, dynamic linker, aux vector,    │  │   │
│  │  │                  execve with interpreter reload                │  │   │
│  │  └─────────────────────────────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │               rv2wasm_jit.wasm (Runtime JIT Compiler)              │   │
│  │                                                                     │   │
│  │  • Rust AOT compiler compiled to wasm32 (via wasm-bindgen)         │   │
│  │  • compile_region(code_ptr, code_len, base_addr) → Wasm bytes      │   │
│  │  • JIT'd modules share WebAssembly.Memory with interpreter         │   │
│  │  • Managed by jit_manager.js (hot-region detection, invalidation)  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │               worker.js (Orchestrator)                              │   │
│  │                                                                     │   │
│  │  • Loads Emscripten module + JIT compiler                           │   │
│  │  • Resume loop: check JIT map → call compiled func or interpreter   │   │
│  │  • stdin: Atomics.wait() blocks until main thread provides data     │   │
│  │  • stdout: ring buffer writes + Atomics.notify()                    │   │
│  │  • network: RPC via net_sab + Atomics.wait() for response           │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
                               │ WebTransport (HTTPS)
┌──────────────────────────────▼───────────────────────────────────────────┐
│                      Host Machine (Optional)                               │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                    Network Proxy (Go)                               │   │
│  │  • Accepts WebTransport connections                                 │   │
│  │  • Creates real TCP sockets on behalf of guest                      │   │
│  │  • Forwards data bidirectionally                                    │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Memory Model

### Flat Arena (31-bit)

```
Wasm Linear Memory (3-4 GB):
┌─────────────────────────────────────────────────────────────────┐
│ Emscripten heap (stack, malloc, C++ objects)                     │
│ ...                                                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │            RISC-V Guest Arena (2 GB)                         │ │
│ │                                                               │ │
│ │  0x00000000 ┬─────────────────────────────────┐              │ │
│ │             │ ELF segments (text, data, BSS)   │              │ │
│ │  0x00400000 ┤                                  │              │ │
│ │             │ Heap (brk / mmap)                │              │ │
│ │             │                                  │              │ │
│ │  0x18000000 │ Dynamic linker (ld-musl)         │              │ │
│ │             │                                  │              │ │
│ │  0x40000000+│ mmap'd regions (V8 code, etc.)   │              │ │
│ │             │                                  │              │ │
│ │  0x7FFFF000 │ Stack (grows down)               │              │ │
│ │  0x7FFFFFFF ┴─────────────────────────────────┘              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

Access: arena[guest_addr & 0x7FFFFFFF]  — single Wasm i32.load/i32.store
No TLB, no page table walk. Page faults handled via exception + retry.
```

### Register Layout (at arena offset 0)

```
Offset    Content
0x000     x0-x31: 32 integer registers × 8 bytes = 256 bytes
0x100     f0-f31: 32 float32 registers × 4 bytes = 128 bytes
0x180     f0-f31: 32 float64 registers × 8 bytes = 256 bytes
```

---

## JIT Tier

### Data Flow

```
                    ┌──────────────────┐
                    │  Interpreter     │
                    │  executes code   │
                    └────────┬─────────┘
                             │ PC exits to JS
                             ▼
                    ┌──────────────────┐
                    │  jit_manager.js  │
                    │  records PC hit  │
                    └────────┬─────────┘
                             │ hit count > threshold?
                     no      │      yes
                    ┌────────┴──────────┐
                    │                    │
                    ▼                    ▼
            ┌───────────────┐   ┌──────────────────┐
            │ friscy_resume │   │ rv2wasm_jit.wasm  │
            │ (interpreter) │   │ compile_region()  │
            └───────────────┘   └────────┬─────────┘
                                         │ Wasm bytes
                                         ▼
                                ┌──────────────────┐
                                │ WebAssembly       │
                                │ .instantiate()    │
                                │ (shared memory)   │
                                └────────┬─────────┘
                                         │
                                         ▼
                                ┌──────────────────┐
                                │ Direct call to    │
                                │ JIT'd function    │
                                │ → returns next PC │
                                └──────────────────┘
```

### Invalidation

When guest code calls `mprotect(PROT_WRITE)` on a page containing JIT'd code,
the syscall handler signals `jit_manager.js` to invalidate the corresponding
compiled functions. Uses a dirty-page set (1 entry per 4KB page).

---

## Worker Communication Protocol

### stdin (worker blocks for input)

1. Worker: `Atomics.store(control[0], CMD_STDIN_REQUEST)` + `Atomics.notify()`
2. Worker: `Atomics.wait(control[0], CMD_STDIN_REQUEST)` — **blocks**
3. Main: sees request, writes input bytes to `control[64+]`
4. Main: `Atomics.store(control[0], CMD_STDIN_READY)` + `Atomics.notify()`
5. Worker: wakes, reads bytes, resets to `CMD_IDLE`

### stdout (worker writes ring buffer)

1. Worker: writes bytes to `stdout_sab[8+]` ring buffer
2. Worker: updates `write_head` atomically, `Atomics.notify()`
3. Main: polls at 4ms, drains ring buffer → `term.write()`

### Network RPC (worker → main → network)

1. Worker: writes op/fd/args to `net_sab`, `Atomics.store(lock, 1)`
2. Worker: `Atomics.wait(lock, 1)` — **blocks**
3. Main: polls `net_sab`, dispatches to `FriscyNetworkBridge`
4. Main: writes result to `net_sab`, `Atomics.store(lock, 2)` + notify
5. Worker: wakes, reads result

---

## Build Configuration

| Flag | Value | Purpose |
|------|-------|---------|
| `RISCV_ENCOMPASSING_ARENA_BITS` | 31 | 2GB guest address space |
| `RISCV_FLAT_RW_ARENA` | ON | O(1) memory access (no page table) |
| `RISCV_THREADED` | ON | Computed goto dispatch |
| `RISCV_MAX_EXECUTE_SEGS` | 1024 | Support V8 JIT code regions |
| `-sSHARED_MEMORY=1` | Emscripten | Enable SharedArrayBuffer |
| `-matomics -mbulk-memory` | All TUs | Required for shared memory |
| `-fwasm-exceptions` | Compile+Link | Final-spec try_table/exnref |
| `INITIAL_MEMORY` | 3GB | 2GB arena + overhead |
| `MAXIMUM_MEMORY` | 4GB | wasm32 limit |

### What was removed

| Removed | Why |
|---------|-----|
| `-sJSPI` | Replaced by Atomics.wait in Worker |
| `-sJSPI_EXPORTS` | No longer needed |
| `emscripten_sleep(0)` | Worker blocks freely |
| `g_waiting_for_stdin` + `machine.stop()` | Atomics.wait replaces this pattern |

---

## Syscall Coverage

### Fully Implemented (~80 syscalls)

**File I/O**: openat, close, read, write, readv, writev, pread64, pwrite64,
lseek, fstat, newfstatat, readlinkat, faccessat, mkdirat, unlinkat, renameat2,
ftruncate, fcntl, ioctl, dup, dup3

**Memory**: mmap, munmap, mprotect, madvise, mremap (stub: -ENOMEM), brk (libriscv)

**Process**: clone, execve, fork, exit, exit_group, wait4, getpid, getppid,
gettid, set_tid_address, prctl, prlimit64

**Signals**: rt_sigaction, rt_sigprocmask, rt_sigreturn, kill, tgkill

**Time**: clock_gettime, clock_getres, gettimeofday, nanosleep

**Network**: socket, bind, listen, accept4, connect, sendto, recvfrom,
getsockname, getpeername, setsockopt, getsockopt, shutdown

**Epoll**: epoll_create1, epoll_ctl, epoll_pwait (with socket FD polling)

**Other**: pipe2, eventfd2, futex, getrandom, uname, getcwd, chdir, fchdir,
capget, getuid/geteuid/getgid/getegid, membarrier, sched_getaffinity

### Stub / No-op

| Syscall | Returns | Reason |
|---------|---------|--------|
| mremap | -ENOMEM | V8 page probe (2048 calls, all fail on real Linux too) |
| io_uring_setup | -ENOSYS | Node.js falls back to epoll |
| riscv_hwprobe | -ENOSYS | Hardware probe, not needed in emulation |
| clone3 | -ENOSYS | Regular clone works |

---

## Networking

### Native Mode

Direct host TCP sockets via `::socket()`, `::connect()`, `::send()`, `::recv()`.
Socket FDs start at 1000, epoll FDs at 2000 (no collision).
`read()`/`write()`/`writev()` on socket FDs delegate to `::recv()`/`::send()`.

### Browser Mode (WebTransport)

```
Guest socket syscall
    → network.hpp (C++ handler)
    → EM_ASM writes to net_sab
    → Atomics.wait blocks worker
    → Main thread polls net_sab
    → network_rpc_host.js dispatches
    → network_bridge.js → WebTransport → proxy → real TCP
    → Response flows back through same chain
```

---

## File Structure

```
runtime/
├── main.cpp          # 780 lines — entry point, simulate loop, exports
├── syscalls.hpp      # 3800 lines — all syscall handlers
├── network.hpp       # 450 lines — socket/epoll handlers
├── vfs.hpp           # 400 lines — tar-backed VFS
├── elf_loader.hpp    # 350 lines — ELF loading, dynamic linker
└── CMakeLists.txt    # 200 lines — build config

aot/src/
├── main.rs           # CLI entry point
├── elf.rs            # ELF parser (goblin)
├── disasm.rs         # RV64GC decoder (~240 opcodes)
├── cfg.rs            # Control flow graph
├── translate.rs      # 2400 lines — RV→Wasm IR
└── wasm_builder.rs   # Wasm emission (3 dispatch strategies)

friscy-bundle/
├── index.html        # 1060 lines — web shell, Worker spawn, SAB I/O
├── worker.js         # 445 lines — Worker entry, resume loop
├── jit_manager.js    # 293 lines — hot-region JIT
├── network_bridge.js # 658 lines — WebTransport bridge
├── network_rpc_host.js # 216 lines — network RPC handler
├── serve.js          # 88 lines — dev server (COOP/COEP)
└── service-worker.js # 115 lines — offline caching
```
