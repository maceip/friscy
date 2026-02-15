# Architecture

This document describes the high-level architecture of friscy. If you want to
familiarize yourself with the code base, you are in the right place.

## Bird's Eye View

friscy takes a Docker container image (cross-compiled for RISC-V 64-bit),
extracts its root filesystem as a tar archive, and runs the entrypoint binary
inside a userland RISC-V emulator. There is no kernel — the ~80 Linux syscalls
that guest code invokes are handled by the host in C++. The emulator is compiled
to WebAssembly via Emscripten and runs inside a Web Worker in the browser.

The key insight is *userland-only emulation*. A container's root filesystem
already contains everything the program needs (libc, shared libraries, data
files). The host only needs to translate syscalls, not boot a kernel or manage
processes in the traditional sense. This keeps the Wasm binary small (~500KB)
and startup fast.

At runtime, a JIT tier identifies frequently-executed RISC-V code regions,
translates them to native Wasm using the same AOT compiler (compiled to wasm32
itself), and calls the resulting Wasm functions directly. JIT'd modules share
`WebAssembly.Memory` with the interpreter, so guest memory is always coherent.

## Code Map

This section describes the major modules. Pay attention to the **Architecture
Invariant** sections — they describe things that are deliberately absent or
constrained in the code. Use symbol search to find the named types and
functions; direct links would go stale.

### `runtime/main.cpp`

Entry point for both native and Emscripten builds. Contains the simulate loop,
CLI flag parsing, and Emscripten-exported C functions (`friscy_resume`,
`friscy_stopped`, `friscy_write_stdin`, `friscy_get_pc`, `friscy_set_pc`).

In Emscripten builds, `main()` runs the machine until it blocks on stdin, then
returns control to JavaScript. The Worker calls `friscy_resume()` repeatedly to
continue execution in chunks, checking for JIT'd code at each re-entry.

**Architecture Invariant:** the simulate loop never does I/O directly. All I/O
goes through syscall handlers or Emscripten's `EM_ASM` bridges. This keeps the
core loop portable between native and Wasm builds.

### `runtime/syscalls.hpp`

All ~80 Linux syscall handlers, registered via `machine.on_syscall(nr, handler)`.
Covers file I/O, memory management (mmap, mprotect, brk), process lifecycle
(clone, execve, fork, exit, wait4), signals, futex, epoll, pipe, eventfd, and
misc (uname, prctl, getrandom, ioctl).

The `execve` implementation is notable: it calls `m.stop()` to safely break out
of the dispatch loop, then the outer simulate loop in `main.cpp` detects the
execve flag, evicts execute segments, reloads the new ELF, and re-enters
`machine.simulate()`.

**Architecture Invariant:** syscall handlers never call `machine.simulate()` or
`machine.resume()` themselves. Execution control always returns to the outer
loop. This avoids re-entrant dispatch, which would corrupt libriscv's internal
state.

**Architecture Invariant:** socket FDs (1000+) and epoll FDs (2000+) live in
separate namespaces from VFS file descriptors (3+). The `net_is_socket_fd()`
bridge function routes `read`/`write`/`writev` to the correct subsystem.

### `runtime/network.hpp`

Socket syscall handlers: socket, bind, listen, accept4, connect, sendto,
recvfrom, getsockname, getpeername, setsockopt, getsockopt, shutdown, and
epoll_pwait (with socket-aware polling).

In native mode, these call POSIX socket functions directly. In Emscripten mode,
they use `EM_ASM` to write RPC requests to the network SharedArrayBuffer and
block on `Atomics.wait()` until the main thread responds.

### `runtime/vfs.hpp`

Tar-backed virtual filesystem. Loads the guest rootfs from a `.tar` file into
memory, providing read-write access with proper directory entries, symlink
resolution, and special file emulation (`/proc/self/exe`, `/dev/null`,
`/dev/urandom`, `/dev/tty`).

**Architecture Invariant:** the VFS is entirely in-memory. There is no
persistent storage across page loads (a known limitation). All mutations happen
on the in-memory copy of the tar contents.

### `runtime/elf_loader.hpp`

ELF loading, dynamic linker setup, and auxiliary vector construction. Handles
both statically and dynamically linked executables. For dynamic executables, it
loads `ld-musl-riscv64.so.1` as the interpreter and sets up the aux vector
(AT_PHDR, AT_ENTRY, AT_BASE, etc.).

After `load_elf_segments`, a second pass copies PT_LOAD segment data directly
into the arena buffer. This is necessary because in arena mode, `read<T>` and
`write<T>` access the arena directly, but the page-based `memory.memcpy` writes
through Page objects which may have their own backing buffers.

**Architecture Invariant:** after every `execve`, `evict_execute_segments()` must
be called before loading the new binary. Without this, stale decoder entries
cause "Execution space protection fault" and "Max execute segments reached"
errors.

### `runtime/CMakeLists.txt`

Build configuration for both native and Emscripten. Key settings:

- 31-bit flat arena (`RISCV_ENCOMPASSING_ARENA_BITS=31`): 2GB guest address
  space with O(1) memory access via `arena[addr & 0x7FFFFFFF]`.
- Threaded dispatch (`RISCV_THREADED=ON`): computed goto in native, `br_table`
  in Wasm.
- 1024 execute segments (`RISCV_MAX_EXECUTE_SEGS=1024`): needed because V8 JIT
  creates many code regions.
- Shared memory (`-sSHARED_MEMORY=1 -matomics -mbulk-memory`): enables
  SharedArrayBuffer for Worker communication.
- Wasm exceptions (`-fwasm-exceptions`): final-spec `try_table`/`exnref`, not
  legacy `try`/`catch`.

**Architecture Invariant:** INITIAL_MEMORY is 3GB, MAXIMUM_MEMORY is 4GB (the
wasm32 limit). The 2GB arena plus Emscripten's own heap must fit within this.
The arena cannot be 32-bit (4GB) because there would be no room for Emscripten.

### `aot/`

The `rv2wasm` AOT compiler, written in Rust. Takes a RISC-V ELF binary and
produces a standalone Wasm module that, when given access to the machine's
linear memory, executes the RISC-V code natively as Wasm instructions.

- `elf.rs` — ELF parser using the `goblin` crate.
- `disasm.rs` — RV64GC instruction decoder. Defines the `Opcode` enum with ~240
  variants covering integer, multiply, atomic, floating-point, and compressed
  instructions.
- `cfg.rs` — builds a control flow graph from decoded instructions. Identifies
  basic blocks, branch targets, and function boundaries.
- `translate.rs` — the core translation pass. `emit_instruction()` matches each
  `Opcode` and emits `WasmInst` IR. ~2400 lines.
- `wasm_builder.rs` — converts `WasmInst` IR into final Wasm bytecode using the
  `wasm-encoder` crate. Supports three dispatch strategies: `call_indirect`,
  `br_table`, and flat linear.

**Architecture Invariant:** the AOT compiler and the JIT compiler share the same
translation logic. `aot-jit/` is a thin wasm-bindgen wrapper around the same
`translate` and `wasm_builder` modules.

### `aot-jit/`

The JIT tier: the `rv2wasm` compiler compiled to wasm32 via `wasm-pack`. Exports
a single function `compile_region(code_ptr, code_len, base_addr)` that takes raw
RISC-V machine code bytes and returns Wasm module bytes. Used by `jit_manager.js`
in the browser.

### `friscy-bundle/worker.js`

The Web Worker entry point. Loads the Emscripten module and the JIT compiler,
then runs the emulator in a loop:

1. Call `friscy_resume()` — interpreter runs until it blocks on stdin or exits.
2. On stdin block: write a request to the control SharedArrayBuffer, then
   `Atomics.wait()` until the main thread provides input data.
3. On exit: signal the main thread via the control SAB.
4. Before each `friscy_resume()`, check if the current PC has a JIT'd
   compilation. If so, call the compiled Wasm function directly.

**Architecture Invariant:** the Worker thread never touches the DOM. All terminal
output goes through the stdout ring buffer in SharedArrayBuffer. All network I/O
goes through the network RPC buffer. The main thread polls these at ~4ms
intervals.

### `friscy-bundle/index.html`

The web shell. Creates three SharedArrayBuffers (control 4KB, stdout 64KB,
network 64KB), spawns the Worker, and runs a polling loop that:

- Drains the stdout ring buffer into the xterm.js terminal.
- Checks for stdin requests and prompts the terminal for input.
- Checks for exit signals.
- Dispatches network RPC requests to `NetworkRPCHost`.

### `friscy-bundle/jit_manager.js`

Hot-region detection and JIT compilation orchestration. Maintains a hit counter
per PC. When a PC exceeds the threshold (50 executions), it reads the
corresponding RISC-V machine code from `WebAssembly.Memory`, passes it to
`rv2wasm_jit.wasm` for compilation, instantiates the result (sharing memory with
the interpreter), and caches the compiled function.

Invalidation: when `mprotect(PROT_WRITE)` is called on a page containing JIT'd
code, the corresponding compiled functions are evicted from the cache.

### `friscy-bundle/network_bridge.js`

WebTransport bridge for TCP networking. Connects to the Go network proxy via
WebTransport, creates bidirectional streams for each guest socket, and forwards
data between the guest and real TCP endpoints.

### `friscy-bundle/network_rpc_host.js`

Main-thread handler for network RPC requests from the Worker. Polls the network
SharedArrayBuffer at ~4ms, dispatches operations (socket, connect, bind, listen,
accept, send, recv, close, etc.) to `FriscyNetworkBridge`, and writes results
back.

### `vendor/libriscv/`

The upstream libriscv emulator library with local patches. Key local
modifications:

- `memory.cpp`: uses `malloc+memset` instead of `new PageData[]` under
  `__EMSCRIPTEN__` to avoid signed overflow in `operator new[]` for 2GB+
  allocations.
- Arena mode bypasses page-level protections for reads/writes (direct arena
  access), but page metadata is still maintained for `mprotect` semantics.

## System Boundaries

### Worker ↔ Main Thread (SharedArrayBuffer)

Three shared buffers with atomic coordination. The Worker blocks freely on
`Atomics.wait()`; the main thread never blocks (it polls at 4ms). This boundary
is the only communication channel — no `postMessage` is used during execution
(only for initial setup).

### Syscall Layer ↔ libriscv

Syscall handlers are registered callbacks. They receive the machine reference,
read arguments from guest registers, perform the operation, and write results
back via `machine.set_result()`. They must never call `machine.simulate()`.

### Guest ↔ Host Memory

The 31-bit arena is the boundary. Guest code sees addresses 0x0–0x7FFFFFFF.
Host code accesses `arena[addr & 0x7FFFFFFF]`. No TLB, no page table walk.
Page faults are handled via C++ exception + retry.

### Browser ↔ Network (WebTransport)

The network proxy is an untrusted intermediary. The browser connects to it via
WebTransport (HTTPS). The proxy creates real TCP sockets on behalf of the guest.
See `docs/SECURITY.md` for trust model.

## Cross-Cutting Concerns

### Exception Handling

Emscripten must use final-spec Wasm exceptions (`-fwasm-exceptions`), not legacy.
This is non-negotiable: the Wizer snapshot tool (wasmtime-based) only supports
final-spec exceptions. Legacy exception mode (`-sLEGACY_EXCEPTIONS`) produces
`try`/`catch` opcodes that wasmtime rejects.

Asyncify (`-sASYNCIFY`) is incompatible with `-fwasm-exceptions` (Binaryen
crashes). This is why we use the Worker+SharedArrayBuffer architecture instead
of Asyncify or JSPI for async I/O.

### Memory Allocation in Wasm

C++ `operator new[]` for sizes above 2GB fails under Emscripten/wasm32 due to
signed integer overflow in the array size calculation. Raw `malloc()` of the same
size works fine. All large allocations in libriscv use `malloc+memset` under
`__EMSCRIPTEN__`.

### Execve Lifecycle

Execve is the most complex syscall. The sequence is: (1) `m.stop()` breaks the
dispatch loop, (2) outer loop detects execve flag, (3) `evict_execute_segments()`
clears stale decoder state, (4) `load_elf_segments()` loads the new binary and
copies PT_LOAD data to the arena, (5) `machine.simulate()` re-enters dispatch.
Getting any step wrong causes segfaults or "protection fault" errors.

### Arena ↔ Page Duality

libriscv maintains both a flat arena buffer and a page table. In arena mode,
`read<T>`/`write<T>` go directly to the arena. But `memory.memcpy` and the page
fault handler write through Page objects, which may have their own backing
buffers. After loading ELF segments, data must be copied to both the page
backing store AND the arena. Forgetting either causes silent data corruption.
