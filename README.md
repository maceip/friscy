```
▐▀▀▀▀▀▀▀▀▌
▐ fRISCy ▌
▐▄▄▄▄▄▄▄▄▌
```

**fast oci runtime for the browser**

friscy runs Docker containers in WebAssembly by:
1. Cross-compiling containers to RISC-V 64-bit
2. Running them in a userland RISC-V emulator (libriscv)
3. Compiling everything to WebAssembly via Emscripten

## Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| Interpreter (libriscv) | Complete | RV64GC, ~40% native speed |
| Syscall Emulation | ~50 syscalls | File, process, network, memory |
| Virtual Filesystem | Complete | Tar-backed, read-only |
| Dynamic Linker | Complete | ld-musl, aux vector |
| Networking | Complete | TCP/UDP via WebSocket proxy |
| **AOT Compiler** | 70% | RISC-V → Wasm, needs br_table |
| Wizer Snapshots | Not started | For instant startup |

## Directory Structure

```
friscy/
├── runtime/          # C++ interpreter (libriscv + syscalls)
│   ├── CMakeLists.txt
│   ├── main.cpp
│   ├── syscalls.hpp
│   ├── vfs.hpp
│   ├── network.hpp
│   └── elf_loader.hpp
│
├── aot/              # rv2wasm AOT compiler (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs, lib.rs
│       ├── elf.rs, disasm.rs
│       ├── cfg.rs, translate.rs
│       └── wasm_builder.rs
│
├── bridge/           # Browser JavaScript integration
│   └── network_bridge.js
│
├── proxy/            # Host-side network proxy (Go)
│   ├── main.go
│   └── go.mod
│
├── tools/            # CLI tools and build scripts
│   ├── friscy-pack   # Docker → browser bundle
│   ├── harness.sh    # Emscripten build (Docker)
│   └── setup_native_harness.sh
│
├── docs/             # Documentation
│   ├── ARCHITECTURE.md
│   ├── PERFORMANCE_ROADMAP.md
│   └── CRAZY_PERF_IDEAS.md
│
├── examples/         # Example Dockerfiles
├── tests/            # Test files
└── vendor/           # External deps (libriscv)
```

## Quick Start

### Build (Docker)

```bash
cd tools
./harness.sh                    # Development build
./harness.sh --production       # Production build (O3, LTO, SIMD)
```

### Build (Local)

```bash
cd tools
./setup_native_harness.sh       # Installs emsdk, builds
```

### Build AOT Compiler

```bash
cd aot
cargo build --release
./target/release/rv2wasm input.elf -o output.wasm
```

### Run a Container

```bash
# Get Alpine rootfs
docker create --platform linux/riscv64 alpine:latest
docker export <id> > alpine.tar

# Run in browser (after building)
node tests/test_node.js --rootfs alpine.tar /bin/busybox ls -la
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and data flow
- [Performance Roadmap](docs/ROADMAP.md) - Implementation status and TODOs
- [Optimization Ideas](docs/ENDZIEL.md) - Advanced performance strategies

## License

Apache 2.0
