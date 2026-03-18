# friscy: Deep Architecture Document

## The Goal

Run three production AI CLI applications — **Claude Code**, **Codex**, and **Gemini CLI** — at near-native performance inside a browser tab. No server-side compute. No Docker daemon. No kernel. The user opens a URL, types an API key, and gets the same tool they'd run locally.

Each application is a full Node.js process with tens of megabytes of JavaScript, a V8 engine, libuv event loop, TLS stack, and HTTP client. Making this work in a browser means solving three hard problems simultaneously: executing the CPU instructions, providing the operating system surface, and networking to the outside world — all without the 50ms-per-instruction overhead that would make the result unusable.

### The Three Apps

| App | Image | Rootfs | Key Env | What It Does |
|-----|-------|--------|---------|--------------|
| **Claude Code** | `friscy-claude-tui` | `claude-real.tar` | `ANTHROPIC_API_KEY` | Anthropic's AI coding agent — streaming SSE to `api.anthropic.com`, tool use, file edits |
| **Codex** | `friscy-codex` | `codex-real.tar` | `OPENAI_API_KEY` | OpenAI's Codex CLI — similar streaming agent architecture |
| **Gemini CLI** | `friscy-gemini-tui` | `gemini-real.tar` | `GEMINI_API_KEY`, `GOOGLE_API_KEY` | Google's Gemini CLI — Gemini API integration |

All three share the same emulator, the same syscall layer, and the same networking stack. They differ only in their rootfs tarball and environment variables. This is the key architectural bet: one runtime, three apps, zero per-app customization.

### Performance Targets

| Tier | Speed | How |
|------|-------|-----|
| **Tier 1** (current) | ~40% of native | libriscv threaded interpreter compiled to Wasm |
| **Tier 2** (in progress) | ~70–80% of native | rv2wasm JIT: hot RISC-V regions → native Wasm at runtime |
| **Tier 3** (planned) | >90% of native | Wasm-native compilation: Node.js/V8 compiled directly to Wasm, no ISA emulation |

Cold boot takes ~40 seconds in Wasm (340M RISC-V instructions). Checkpoint resume takes ~2.2 seconds. The checkpoint is 29MB gzipped.

---

## High-Level Architecture

There are two execution strategies, designed to converge on a single user experience:

### Strategy A: RISC-V Emulation (v1, shipping today)

Cross-compile the container to RISC-V 64-bit. Extract the rootfs as a tar. Run the entrypoint inside a userland RISC-V emulator (libriscv) compiled to WebAssembly via Emscripten. JIT-compile hot code regions to native Wasm at runtime.

```
Docker image (RISC-V)
    → tar extract rootfs
    → libriscv interpreter (C++ → Emscripten → friscy.wasm, 527KB)
    → ~80 syscall handlers in C++ (file I/O, mmap, networking, signals, etc.)
    → JIT: rv2wasm compiler (Rust → wasm32, 288KB) hot-patches RISC-V → Wasm
    → Web Worker + SharedArrayBuffer for blocking I/O
    → xterm.js terminal in main thread
    → WebTransport proxy for TCP networking
```

### Strategy B: Wasm-Native Compilation (v9, in development)

Compile Node.js, V8, bash, and coreutils directly from C/C++ source to Wasm via Emscripten. No ISA emulation at all. Use EdgeJS's N-API split so the browser's own JS engine (V8/JSC/SpiderMonkey) executes user JavaScript — no need to compile V8's JIT to Wasm.

```
Node.js C++ source
    → Emscripten → edgejs.wasm (~46 Node.js built-in modules)
    → N-API bridge connects Wasm runtime ↔ browser JS engine
    → wasi-shims (44 headers) patch POSIX gaps in Emscripten
    → LKL kernel compiled to Wasm for battle-tested syscall handling
    → mmap userspace shim (V8 needs the API, not the MMU)
    → Same WebTransport proxy, same terminal UI
```

**Why two strategies?** Strategy A works today and proves the concept. Strategy B eliminates the per-instruction emulation tax entirely. They share the same user-facing layer (xterm.js, rootfs.tar, WebTransport networking) and the same manifest format, so the transition is invisible to users.

---

## The Interfaces

### Interface 1: Manifest (`manifest.json`)

The contract between the web shell and the runtime. Declares what to run.

```json
{
  "version": 1,
  "image": "matrix-run",
  "rootfs": "./claude-real.tar",
  "entrypoint": ["/bin/bash", "-i"],
  "env": ["PATH=/usr/local/sbin:...", "ANTHROPIC_API_KEY="],
  "examples": {
    "claude-tui": { "rootfs": "./claude-real.tar", "env": ["ANTHROPIC_API_KEY=PLACEHOLDER"] },
    "codex":     { "rootfs": "./codex-real.tar",   "env": ["OPENAI_API_KEY=PLACEHOLDER"] },
    "gemini-tui": { "rootfs": "./gemini-real.tar", "env": ["GEMINI_API_KEY=PLACEHOLDER", "GOOGLE_API_KEY=PLACEHOLDER"] }
  }
}
```

The web shell reads `?example=claude-tui` from the URL, looks up the manifest, and passes the rootfs URL + env to the Worker.

### Interface 2: SharedArrayBuffer Protocol

Three shared buffers coordinate the Worker (emulator) and main thread (UI + networking). No `postMessage` during execution — only atomic operations.

**Control SAB (4KB):**
```
Offset  Field           Purpose
[0]     command         CMD_IDLE / CMD_STDIN_REQUEST / CMD_STDIN_READY / CMD_EXIT
[4]     status          Stop reason flags
[8]     length          Payload byte count
[12]    fd              File descriptor for I/O
[16]    result          Syscall return value
[20]    exit_code       Process exit code
[24]    cols/rows       Terminal dimensions
[64+]   payload         stdin data bytes
```

**Stdout ring buffer (64KB):**
```
[0]     write_head      Atomic write pointer (Worker writes)
[4]     read_tail       Atomic read pointer (main thread reads)
[8+]    ring data       65,528 bytes of circular buffer
```

**Network RPC buffer (64KB):**
```
[0]     lock            0=idle, 1=request pending, 2=response ready
[4]     op              Socket operation code
[8]     fd              Socket file descriptor
[64+]   data            Request/response payload
```

**Protocol flows:**

*stdin (Worker blocks for input):*
1. Worker stores `CMD_STDIN_REQUEST`, notifies, then `Atomics.wait()` — blocks
2. Main thread sees request, writes input bytes to `[64+]`
3. Main thread stores `CMD_STDIN_READY`, notifies
4. Worker wakes, reads bytes, resets to `CMD_IDLE`

*stdout (Worker writes ring buffer):*
1. Worker writes bytes to ring buffer, updates `write_head` atomically
2. Main thread polls at 4ms, drains ring → `term.write()`

*Network RPC (Worker → main → TCP):*
1. Worker writes op/fd/args to `net_sab`, stores `lock=1`, `Atomics.wait()`
2. Main thread polls, dispatches to `FriscyNetworkBridge` → WebTransport → real TCP
3. Main thread writes result, stores `lock=2`, notifies
4. Worker wakes, reads result

### Interface 3: Emscripten Exports (C → JS)

The Worker calls these C functions exported from `friscy.wasm`:

```c
// Core execution
void     _friscy_resume();                    // Run until stdin block or exit
int      _friscy_stopped();                   // Check if machine halted
uint64_t _friscy_get_pc();                    // Current program counter
void     _friscy_set_pc(uint64_t pc);         // Set program counter

// I/O
void     _friscy_write_stdin(const char*, int); // Feed stdin bytes
int      _friscy_drain_process_events();      // Process pending events

// Checkpoint/restore
void*    _friscy_export_checkpoint();         // Serialize machine state
void     _friscy_save_live_checkpoint();      // Save to persistent storage
void*    _friscy_export_tar();                // Export VFS as tar

// JIT support
void     _friscy_evict_execute_segments();    // Clear stale JIT regions
void     _friscy_recover_fault();             // Recover from execution fault
```

### Interface 4: Syscall API (~80 handlers)

Guest RISC-V code invokes `ecall` (environment call). The handler reads arguments from guest registers, performs the operation, and writes the result back. Handlers **never** call `machine.simulate()` — execution control always returns to the outer loop.

**File I/O:** openat, close, read, write, readv, writev, pread64, pwrite64, lseek, fstat, newfstatat, readlinkat, faccessat, mkdirat, unlinkat, renameat2, ftruncate, fcntl, ioctl, dup, dup3

**Memory:** mmap, munmap, mprotect, madvise, mremap, brk

**Process:** clone, execve, fork, exit, exit_group, wait4, getpid, getppid, gettid, set_tid_address, prctl, prlimit64

**Signals:** rt_sigaction, rt_sigprocmask, rt_sigreturn, kill, tgkill

**Time:** clock_gettime, clock_getres, gettimeofday, nanosleep

**Networking:** socket, bind, listen, accept4, connect, sendto, recvfrom, getsockname, getpeername, setsockopt, getsockopt, shutdown

**Blocking I/O:** epoll_create1, epoll_ctl, epoll_pwait, pipe2, eventfd2, futex

**Misc:** getrandom, uname, getcwd, chdir, fchdir, capget, getuid/geteuid/getgid/getegid, membarrier, sched_getaffinity

**FD namespace separation:** File FDs start at 3. Socket FDs start at 1000. Epoll FDs start at 2000. `read()`/`write()` on a socket FD routes to `::recv()`/`::send()` via `net_is_socket_fd()`.

### Interface 5: N-API Bridge (v9 only)

The bridge between EdgeJS's C++ runtime (compiled to Wasm) and the browser's native JS engine. This is what eliminates the need to compile V8 to Wasm.

```
EdgeJS Wasm runtime
    → calls napi_create_function(), napi_call_function(), etc.
    → napi-bridge/index.js marshals across Wasm ↔ JS boundary
    → browser's own V8/JSC/SpiderMonkey executes user JavaScript
    → results flow back through N-API
```

The bridge maintains a handle table mapping `napi_value` integers to JS objects, handles type marshaling (strings, numbers, buffers, arrays, objects), and provides the full N-API surface that Node.js addons expect.

### Interface 6: WASI-Shims (v9 only)

44 header files in `v9/wasi-shims/` that patch POSIX gaps when compiling V8 and Node.js to Emscripten/Wasm. Force-included into every translation unit via CMake `-include wasi-all-fixes.h`.

Key shims:
- `wasi-v8-internals.h` — V8's `Internals` class adapted for 32-bit Wasm pointers
- `wasi-v8-api-stubs.h` / `wasi-v8-api-additions.h` — Missing V8 API methods
- `wasi-namespace-fixes.h` — C++ namespace mapping differences
- `wasi-cppgc-stubs.h` — GC subsystem stubs (not needed in jitless mode)
- `wasi-platform-fixes.h` — Platform abstraction layer
- `wasi-bytecodes-builtins-list.h` — Full bytecode-to-builtin mapping (542 lines, 194 single + 160 wide handlers)
- `wasi-wasm32-arch-fixes.h` — 32-bit architecture adaptations

---

## The Low-Level Plumbing

### Memory Model

```
Wasm Linear Memory (3–4 GB):
┌──────────────────────────────────────────────────────────────┐
│ Emscripten heap (stack, malloc, C++ objects, libriscv state) │
│ ...                                                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │           RISC-V Guest Arena (2 GB, 31-bit)              │ │
│ │                                                          │ │
│ │  0x00000000 ┬──────────────────────────────┐             │ │
│ │             │ ELF segments (text, data, BSS)│             │ │
│ │  0x00400000 ┤                               │             │ │
│ │             │ Heap (brk / mmap)             │             │ │
│ │  0x18000000 │ Dynamic linker (ld-musl)      │             │ │
│ │  0x40000000+│ mmap'd regions (V8 data)      │             │ │
│ │  0x7FFFF000 │ Stack (grows down)            │             │ │
│ │  0x7FFFFFFF ┴──────────────────────────────┘             │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

Access: arena[guest_addr & 0x7FFFFFFF]  →  single Wasm i32.load / i32.store
No TLB. No page table walk. Page faults via C++ exception + retry.
```

**Why 31 bits, not 32?** The arena lives inside Emscripten's 4GB wasm32 address space. A 4GB arena would leave no room for the Emscripten heap, C++ objects, or the libriscv emulator itself. 2GB is the sweet spot: large enough for V8's pointer cage, small enough to coexist.

**Arena ↔ Page duality:** libriscv maintains both a flat arena and a page table. `read<T>`/`write<T>` go directly to the arena (fast path). But `memory.memcpy` and the page fault handler write through `Page` objects. After loading ELF segments, data must be copied to **both** the page backing store and the arena — forgetting either causes silent data corruption.

### Instruction Dispatch

libriscv uses **threaded dispatch** — each instruction handler tail-calls the next, eliminating the loop overhead of a switch statement.

**Native build:** `[[musttail]] return handlers[next_opcode](machine);` → computed goto

**Emscripten build:** `return_call` Wasm instruction via `-mtail-call`. The browser's Wasm engine sees a chain of tail calls and can optimize the dispatch into a tight loop.

Each decoded instruction is cached in an **execute segment**. Up to 4096 segments are supported (V8's JIT generates many code regions when running in non-jitless mode; the emulated V8 inside the guest can still create data regions that need tracking).

**Instruction set:** RV64GC — 64-bit integer, multiply/divide, atomic, single-precision float, double-precision float, compressed (16-bit) instructions. ~240 opcodes total.

### The JIT Tier (rv2wasm)

The same Rust AOT compiler compiled to wasm32 via `wasm-pack`, running inside the browser as `rv2wasm_jit.wasm` (288KB).

**Hot-region detection (`jit_manager.js`):**
1. Every time the interpreter exits to JS (stdin block, max instructions, etc.), record the PC
2. Maintain a hit counter per PC
3. When a PC exceeds the threshold (50 executions), read the corresponding RISC-V machine code from `WebAssembly.Memory`
4. Pass the bytes to `rv2wasm_jit.wasm` → `compile_region(code_ptr, code_len, base_addr)`
5. Get back Wasm module bytes
6. `WebAssembly.instantiate()` with **shared memory** (the compiled module reads/writes the same linear memory as the interpreter)
7. Cache the compiled function: `compiledBlocks[pc] = instance.exports.run`
8. On subsequent entries at that PC, call the compiled function directly instead of resuming the interpreter

**Translation rules (simplified):**
```
RISC-V                    →  Wasm
add  rd, rs1, rs2         →  i64.store rd*8 (i64.add (i64.load rs1*8) (i64.load rs2*8))
lw   rd, off(rs1)         →  i64.store rd*8 (i64.load32_s (i32.add (i32.wrap rs1) (i32.const off)))
beq  rs1, rs2, target     →  if (i64.eq rs1 rs2) (return target) (return next_pc)
ecall                     →  return 0xFFFFFFFF  (signals syscall to dispatch loop)
jalr rd, rs1, off         →  store return address in rd, return computed target
```

**Invalidation:** When guest code calls `mprotect(PROT_WRITE)` on a page containing JIT'd code, the syscall handler evicts the corresponding compiled functions from the cache. Uses a dirty-page set (1 entry per 4KB page).

**Dispatch strategies:** The wasm_builder supports three modes — `call_indirect` (function table), `br_table` (branch table), and flat linear (inline). The JIT uses `call_indirect` for flexibility; the AOT tool can use any of the three.

### Virtual Filesystem (VFS)

Tar-backed, entirely in-memory. No persistence across page loads.

- Loads the rootfs `.tar` into memory at startup
- Supports read-write mutations on the in-memory copy
- Special file emulation: `/proc/self/exe`, `/dev/null`, `/dev/zero`, `/dev/urandom`, `/dev/tty`, `/dev/random`
- Full POSIX symlink resolution
- Directory listing via `readdir`

Typical rootfs: Alpine Linux base + musl libc + Node.js + the CLI app. Claude's rootfs is ~104MB uncompressed.

### ELF Loader

Handles both statically and dynamically linked RISC-V executables.

1. Parse ELF headers (PT_LOAD segments, PT_INTERP for dynamic linker)
2. For dynamic executables: load `ld-musl-riscv64.so.1` as the interpreter
3. Copy PT_LOAD segment data into both the arena buffer and page backing stores
4. Construct auxiliary vector: AT_PHDR, AT_ENTRY, AT_BASE, AT_EXECFN, AT_UID, AT_GID, etc.
5. Register execute segments with libriscv's decoder cache

**execve lifecycle** (the most complex syscall):
1. `m.stop()` breaks the dispatch loop
2. Outer loop detects the execve flag
3. `evict_execute_segments()` clears all stale decoder entries
4. `load_elf_segments()` loads the new binary
5. Copy PT_LOAD data to both arena and page backing stores
6. `machine.simulate()` re-enters dispatch at the new entry point

### Networking

**Native mode:** Direct POSIX sockets. `socket()` → `connect()` → `send()`/`recv()`.

**Browser mode:** Multi-hop RPC through SharedArrayBuffer to WebTransport to a Go proxy to real TCP.

```
Guest socket syscall (C++ handler in network.hpp)
    → EM_ASM writes op/fd/args to net_sab
    → Atomics.wait() blocks the Worker
    → Main thread polls net_sab at 4ms
    → network_rpc_host.js dispatches to network_bridge.js
    → WebTransport (HTTPS) to Go proxy server
    → Go proxy creates real TCP socket, forwards data
    → Response flows back through the same chain
    → Worker wakes, reads result from net_sab
```

The Go proxy is an untrusted intermediary. The browser connects via HTTPS (WebTransport). The proxy creates real TCP sockets to `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, etc.

### Exception Handling

**Emscripten uses final-spec Wasm exceptions** (`-fwasm-exceptions`): `try_table` / `exnref` opcodes, not the legacy `try` / `catch`. This is non-negotiable — the Wizer snapshot tool (wasmtime-based) only supports final-spec exceptions.

**Asyncify is incompatible** with `-fwasm-exceptions` (Binaryen crashes). This is why we use Worker + SharedArrayBuffer + `Atomics.wait()` for blocking I/O, instead of Asyncify or JSPI.

### Checkpoint/Restore

Wizer pre-snapshots the machine state after cold boot completes (Node.js loaded, V8 initialized, all modules parsed). The snapshot captures:
- All 2GB of guest arena memory
- 32 integer registers + 32 float registers
- Program counter, stack pointer
- VFS state (modified files)
- FD table

Checkpoint size: ~29MB gzipped (82MB raw). Resume time: ~2.2 seconds in Wasm (vs ~40 seconds for cold boot).

### Build System

**Runtime build (`runtime/CMakeLists.txt`):**

| Flag | Value | Purpose |
|------|-------|---------|
| `RISCV_64I` | ON | 64-bit ISA base |
| `RISCV_EXT_A/C/F/D` | ON | Atomic, Compressed, Float, Double extensions |
| `RISCV_ENCOMPASSING_ARENA_BITS` | 31 | 2GB guest address space |
| `RISCV_FLAT_RW_ARENA` | ON | O(1) memory access |
| `RISCV_TAILCALL_DISPATCH` | ON | musttail → Wasm return_call |
| `RISCV_MAX_EXECUTE_SEGS` | 4096 | V8 JIT code regions |
| `RISCV_MEMORY_TRAPS` | OFF | No per-access overhead |
| `-sSHARED_MEMORY=1` | link | SharedArrayBuffer support |
| `-fwasm-exceptions` | compile+link | Final-spec try_table/exnref |
| `-msimd128 -mbulk-memory` | compile | Fast memory operations |
| `-mtail-call` | compile+link | Wasm tail call proposal |
| `INITIAL_MEMORY` | 3GB | 2GB arena + Emscripten heap |
| `MAXIMUM_MEMORY` | 4GB | wasm32 limit |

**AOT compiler (`aot/Cargo.toml`):** Rust. `goblin` for ELF, `riscv-decode` for instruction decoding, `wasm-encoder` for Wasm output.

**JIT compiler (`aot-jit/Cargo.toml`):** Same Rust compiler, compiled to wasm32 via `wasm-pack` + `wasm-bindgen`.

**v9 EdgeJS build (`v9/Makefile`):** Emscripten SDK → `emcmake cmake` with `emscripten-toolchain.cmake` → EdgeJS + 44 wasi-shim headers → `edgejs.wasm`.

---

## File Map

```
friscy/
├── runtime/
│   ├── main.cpp              # Entry point, simulate loop, Emscripten exports
│   ├── syscalls.hpp          # ~80 Linux syscall handlers
│   ├── network.hpp           # Socket/epoll handlers
│   ├── vfs.hpp               # Tar-backed virtual filesystem
│   ├── elf_loader.hpp        # ELF loading, dynamic linker, aux vector
│   ├── library_vectorheart.js # JSPI-native hypercall library
│   └── CMakeLists.txt        # Build config (arena, dispatch, Emscripten flags)
│
├── aot/src/                  # rv2wasm AOT compiler (Rust)
│   ├── main.rs               # CLI entry
│   ├── elf.rs                # ELF parser (goblin)
│   ├── disasm.rs             # RV64GC decoder (~240 opcodes)
│   ├── cfg.rs                # Control flow graph builder
│   ├── translate.rs          # RISC-V → Wasm IR translation (~2400 lines)
│   └── wasm_builder.rs       # Wasm emission (3 dispatch strategies)
│
├── aot-jit/                  # JIT tier (same compiler → wasm32 via wasm-pack)
│
├── v9/                       # EdgeJS browser runtime (Wasm-native Node.js)
│   ├── edgejs-src/           # EdgeJS upstream (~46 Node.js modules)
│   ├── wasi-shims/           # 44 header files patching POSIX gaps
│   │   ├── wasi-all-fixes.h  # Master include
│   │   ├── wasi-v8-*.h       # V8 engine adaptations
│   │   ├── wasi-bytecodes-builtins-list.h  # 542-line bytecode mapping
│   │   └── wasi-shims-index.h              # Include index
│   ├── napi-bridge/          # N-API ↔ browser JS engine bridge
│   ├── emscripten-toolchain.cmake
│   └── build-emscripten.sh
│
├── friscy-bundle/            # Deployment bundle
│   ├── friscy.wasm           # RISC-V emulator (527KB)
│   ├── friscy.js             # Emscripten glue (145KB)
│   ├── rv2wasm_jit_bg.wasm   # JIT compiler (288KB)
│   ├── rv2wasm_jit.js        # JIT bindings (8KB)
│   ├── worker.js             # Web Worker entry (445 lines)
│   ├── jit_manager.js        # Hot-region detection (293 lines)
│   ├── network_bridge.js     # WebTransport bridge (658 lines)
│   ├── network_rpc_host.js   # Network RPC handler (216 lines)
│   ├── index.html            # Web shell + xterm.js (1060 lines)
│   ├── manifest.json         # Runtime config
│   └── *.tar / *.ckpt        # Rootfs images and checkpoints
│
├── proxy/                    # Go network proxy (WebTransport → TCP)
├── vendor/libriscv/          # Upstream RISC-V emulator (patched)
└── docs/                     # Architecture, build, roadmap docs
```

---

## Design Decisions and Trade-offs

**1. Userland-only emulation, no kernel.**
Keeps the Wasm binary at 527KB and startup under 2 seconds (from checkpoint). A full kernel would add 10–30MB and seconds of boot time. The cost: we maintain ~80 syscall handlers instead of getting them for free.

**2. 31-bit arena (2GB), not 32-bit (4GB).**
V8's pointer cage needs ~2GB. But a 4GB arena would consume the entire wasm32 address space, leaving nothing for Emscripten's heap. 31 bits is the maximum that fits.

**3. Tail-call dispatch, not switch/br_table.**
~20% faster than a switch statement in Wasm. Each instruction handler tail-calls the next via `return_call`, which the browser's Wasm engine can optimize into a tight loop.

**4. SharedArrayBuffer + Atomics, not Asyncify.**
Asyncify is incompatible with Wasm exceptions (Binaryen crashes). JSPI works but adds overhead. Worker + `Atomics.wait()` is the most reliable approach for blocking I/O.

**5. Final-spec Wasm exceptions, not legacy.**
The Wizer snapshot tool (wasmtime-based) rejects legacy `try`/`catch` opcodes. Final-spec `try_table`/`exnref` is the only option that works with both Emscripten and Wizer.

**6. Separate socket FD namespace (1000+).**
Prevents collisions between VFS file descriptors and socket descriptors. Simplifies routing in `read()`/`write()` — check if FD >= 1000, and if so, route to the network subsystem.

**7. EdgeJS N-API split for v9.**
Compiling V8's JIT to Wasm is theoretically possible but would produce a 50–80MB module and run at a fraction of native speed. The N-API split lets the browser's own V8 handle JavaScript execution at full native speed, while only the Node.js C++ APIs (fs, http, crypto, etc.) are compiled to Wasm.

**8. RISC-V, not x86.**
47 base instructions, fixed 32-bit width, clean design vs. x86's 1500+ variable-length instructions. The AOT/JIT compiler is ~2400 lines of Rust instead of the 50,000+ lines CheerpX needs for x86. The complexity reduction translates directly to smaller runtime, faster compilation, and fewer bugs.

---

## Data Flow: End-to-End Request

When the user types a prompt in Claude Code running in the browser:

```
1. Keystroke → xterm.js → main thread writes to control SAB [64+]
2. Main thread: Atomics.store(CMD_STDIN_READY), Atomics.notify()
3. Worker wakes from Atomics.wait()
4. Worker: friscy_write_stdin(bytes) → guest reads from /dev/tty fd
5. Node.js guest code processes input → prepares HTTPS request
6. Guest: socket() → connect(api.anthropic.com:443) → write(HTTP request)
   Each syscall: C++ handler → EM_ASM → net_sab → Atomics.wait()
   → main thread → network_rpc_host → network_bridge → WebTransport
   → Go proxy → real TCP to api.anthropic.com
7. Response streams back: Go proxy → WebTransport → network_bridge
   → net_sab → Worker wakes → C++ recv() handler → guest read()
8. Guest Node.js processes SSE chunks → writes to stdout fd
9. stdout syscall handler: writes to stdout_sab ring buffer
10. Main thread: polls at 4ms → drains ring → term.write() → pixels on screen
```

Total added latency per network round-trip: ~10–20ms (WebTransport + proxy overhead). For streaming SSE responses, this is imperceptible — the API's token generation time dominates.
