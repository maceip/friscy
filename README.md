<div align="center">
<table border="0" style="border-collapse: collapse; border-style: hidden;">
  <tr>
    <td align="left" valign="bottom" style="border: none; padding-right: 30px;">
<pre>
▐▀▀▀▀▀▀▀▌
▐ fRISCy ⸎&nbsp;&nbsp; <strong>fast risc-v runtime for the browser</strong>
▐▄▄▄▄▄▄▄▌
</pre>
      <br>
      <strong>        friscy runs docker containers in WebAssembly</strong>
      <br><br>
      <ul align="left" style="margin-top: 0;">
        <li>Cross-compile containers to RISC-V 64-bit</li>
        <li>Run them in a userland RISC-V emulator (libriscv)</li>
        <li>JIT-compile hot code regions to native Wasm at runtime</li>
        <li>Interactive web shell with xterm.js + networking</li>
      </ul>
    </td>
    <td valign="bottom" style="border: none;">
      <img width="238" height="313" alt="fh" src="https://github.com/user-attachments/assets/aa87c5bc-18ec-470e-8ee8-8a013609bb18" />
    </td>
  </tr>
</table>
</div>

<p align="center">
  <a href="https://maceip.github.io/friscy/"><strong>Live Demo</strong></a>
</p>
<br>

## Milestone: Claude Code in the Browser

friscy can boot Claude Code (`@anthropic-ai/claude-code` 2.1.39) inside a RISC-V
emulator running in WebAssembly. The guest environment is Alpine Linux (edge, riscv64)
with Node.js 24 running in `--jitless` mode.

```
claude --version  →  2.1.39 (Claude Code)    # 3.4 billion RISC-V instructions
```

## Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| Interpreter (libriscv) | Complete | RV64GC, threaded dispatch, ~40% native speed |
| Syscall Emulation | Complete | ~80 syscalls: file, process, network, memory, signals, epoll |
| Virtual Filesystem | Complete | Tar-backed, read-write, symlinks, /proc, /dev emulation |
| Dynamic Linker | Complete | ld-musl, aux vector, execve with interpreter reload |
| Networking | Complete | TCP via WebTransport proxy, epoll, accept4 |
| AOT Compiler (rv2wasm) | Complete | RISC-V → Wasm, FP, br_table dispatch, friscy-pack |
| JIT Tier | Complete | rv2wasm compiled to wasm32, runtime hot-region compilation |
| Worker + SAB | Complete | Emulator in Web Worker, Atomics.wait/notify I/O |
| Wizer Snapshots | Complete | VFS tar export, pre-initialization |
| Web Shell | Complete | xterm.js, clipboard, terminal resize, progress UI |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Main Thread)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  xterm.js    │  │ network_rpc  │  │  jit_manager.js          │  │
│  │  terminal    │  │ _host.js     │  │  (hot region detection)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘  │
│         │ stdin/stdout     │ WebTransport                            │
│         ▼                  ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              SharedArrayBuffer (4KB + 64KB + 64KB)           │   │
│  │   control SAB │ stdout ring buffer │ network RPC buffer      │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────┘
                               │ Atomics.wait / Atomics.notify
┌──────────────────────────────▼──────────────────────────────────────┐
│                        Web Worker                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    friscy.wasm (Emscripten)                   │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │              libriscv RV64GC Core                     │    │    │
│  │  │  • Threaded dispatch (computed goto → br_table)      │    │    │
│  │  │  • 2GB flat arena (31-bit, O(1) memory access)       │    │    │
│  │  │  • 1024 execute segments                             │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  Syscall Layer (~80 syscalls)                        │    │    │
│  │  │  • syscalls.hpp: file, process, memory, signals      │    │    │
│  │  │  • network.hpp: socket, epoll, accept4               │    │    │
│  │  │  • vfs.hpp: tar-backed filesystem                    │    │    │
│  │  │  • elf_loader.hpp: dynamic linking, execve           │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  rv2wasm_jit.wasm (runtime JIT compiler)                     │    │
│  │  • Compiles hot RISC-V regions → native Wasm at runtime      │    │
│  │  • Shares WebAssembly.Memory with interpreter                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
friscy-standalone/
├── runtime/              # C++ emulator (libriscv + syscalls)
│   ├── CMakeLists.txt    # Emscripten + native build config
│   ├── main.cpp          # Entry point, simulate loop, exports
│   ├── syscalls.hpp      # ~80 Linux syscall handlers
│   ├── network.hpp       # Socket, epoll, accept4 handlers
│   ├── vfs.hpp           # Virtual filesystem (tar-backed)
│   └── elf_loader.hpp    # ELF loading, dynamic linker, execve
│
├── aot/                  # rv2wasm AOT compiler (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs       # CLI: rv2wasm input.elf -o output.wasm
│       ├── elf.rs        # ELF parser (goblin)
│       ├── disasm.rs     # RV64GC decoder (~240 opcodes)
│       ├── cfg.rs        # Control flow graph builder
│       ├── translate.rs  # RISC-V → WasmInst IR translation
│       └── wasm_builder.rs # WasmInst → wasm-encoder bytecode
│
├── aot-jit/              # JIT tier (rv2wasm → wasm32 via wasm-bindgen)
│   ├── Cargo.toml
│   └── src/lib.rs        # compile_region() export
│
├── friscy-bundle/        # Browser deployment bundle
│   ├── index.html        # Web shell (xterm.js, Worker spawn, SAB I/O)
│   ├── worker.js         # Web Worker entry (loads Emscripten, resume loop)
│   ├── jit_manager.js    # Hot-region detection, compile, dispatch
│   ├── network_bridge.js # WebTransport TCP bridge
│   ├── network_rpc_host.js # Main-thread network RPC handler
│   ├── serve.js          # Dev server with COOP/COEP headers
│   ├── service-worker.js # Offline caching
│   ├── manifest.json     # Image config (entrypoint, env, AOT list)
│   ├── friscy.js         # Emscripten JS glue
│   ├── friscy.wasm       # Emscripten Wasm module (507KB)
│   ├── rv2wasm_jit.js    # JIT compiler JS glue
│   ├── rv2wasm_jit_bg.wasm # JIT compiler Wasm (214KB)
│   └── rootfs.tar        # Container rootfs (179MB for Claude image)
│
├── tools/                # Build tools
│   └── Dockerfile.claude # Alpine edge + Node.js + Claude Code
│
├── proxy/                # WebTransport network proxy
│   ├── cert.pem / key.pem
│   └── (Go proxy server)
│
├── tests/                # Test files
│   ├── test_phase1_*.js  # Worker+SAB integration tests
│   ├── test_echo_server* # Go echo server tests
│   └── echo_server/      # Go test server source
│
├── vendor/libriscv/      # libriscv emulator library
├── docs/                 # Documentation
└── AGENTS.md             # Knowledge base index
```

## Quick Start

### Serve the Web Shell

```bash
node friscy-bundle/serve.js 9000
# Open https://localhost:9000 in Chrome
```

Requires COOP/COEP headers for SharedArrayBuffer (serve.js handles this).

### Build Emscripten (Docker)

```bash
docker run --rm -v $(pwd):/src emscripten/emsdk:latest bash -c "
  cd /src && mkdir -p build-wasm && cd build-wasm
  emcmake cmake ../runtime
  emmake make -j\$(nproc)
"
cp build-wasm/friscy.{js,wasm} friscy-bundle/
```

### Build Native

```bash
mkdir -p build-native && cd build-native
cmake ../runtime && make -j$(nproc)
./friscy --rootfs ../friscy-bundle/rootfs.tar /bin/sh
```

### Build Claude Rootfs

```bash
docker buildx build --platform linux/riscv64 -f tools/Dockerfile.claude -t friscy-claude . --load
docker create --name tmp friscy-claude && docker export tmp > friscy-bundle/rootfs.tar && docker rm tmp
```

### Build AOT Compiler

```bash
cd aot && cargo build --release
./target/release/rv2wasm input.elf -o output.wasm
```

## Key Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Arena size | 31-bit (2GB) | Node.js/V8 needs ~1.15GB for pointer cage |
| Initial memory | 3GB | 2GB arena + Emscripten overhead |
| Maximum memory | 4GB | wasm32 limit |
| Execute segments | 1024 | V8 JIT generates many code regions |
| Shared memory | Enabled | Worker + SharedArrayBuffer |
| Exception handling | Wasm exceptions | `-fwasm-exceptions` (not legacy) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and data flow
- [Workstreams](docs/WORKSTREAMS.md) - A-G workstream organization
- [Roadmap](docs/ROADMAP.md) - Implementation status and TODOs
- [Endziel](docs/ENDZIEL.md) - Performance tier targets

## License

Apache 2.0
