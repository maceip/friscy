# friscy

friscy runs Docker containers in the browser. It cross-compiles containers to
RISC-V 64-bit, emulates them in libriscv (userland only, no kernel), and
compiles the emulator to WebAssembly via Emscripten. Hot code paths are
JIT-compiled from RISC-V to native Wasm at runtime.

## Architecture

See `ARCHITECTURE.md` for the codemap, invariants, and system boundaries.

## Code layout

| Path | What lives there |
|------|------------------|
| `runtime/` | C++ emulator: libriscv integration, syscall handlers, VFS, ELF loader |
| `aot/` | Rust AOT compiler (`rv2wasm`): RISC-V ELF to standalone Wasm |
| `aot-jit/` | Rust JIT tier: `rv2wasm` compiled to wasm32 via wasm-bindgen |
| `friscy-bundle/` | Browser deployment: HTML shell, Worker, JIT manager, network bridge |
| `vendor/libriscv/` | RISC-V emulator library (upstream, with local patches) |
| `tools/` | Dockerfiles for guest rootfs images |
| `proxy/` | Go WebTransport-to-TCP network proxy |
| `tests/` | Integration tests (Node.js scripts) |
| `docs/` | All documentation beyond this file and ARCHITECTURE.md |

## docs/ structure

| Path | Contents |
|------|----------|
| `docs/DESIGN.md` | Design philosophy: userland emulation, libriscv, Emscripten |
| `docs/FRONTEND.md` | Browser UI, xterm.js, Worker communication |
| `docs/SECURITY.md` | Wasm sandbox model, network proxy trust boundaries |
| `docs/RELIABILITY.md` | Syscall coverage guarantees, crash handling, VFS durability |
| `docs/PLANS.md` | Roadmap, milestones, current focus |
| `docs/design-docs/` | Architecture Decision Records (ADR log) |
| `docs/exec-plans/` | Execution plans: `active/`, `completed/`, `tech-debt-tracker.md` |
| `docs/product-specs/` | Feature specs |
| `docs/references/` | Reference material (LLM-friendly docs, external specs) |
| `docs/generated/` | Auto-generated documentation |

## Build commands

```bash
# Emscripten (Docker) — produces friscy.wasm + friscy.js
docker run --rm -v $(pwd):/src emscripten/emsdk:latest bash -c \
  "cd /src && mkdir -p build-wasm && cd build-wasm && emcmake cmake ../runtime && emmake make -j\$(nproc)"
cp build-wasm/friscy.{js,wasm} friscy-bundle/

# Native
mkdir -p build-native && cd build-native && cmake ../runtime && make -j$(nproc)

# AOT compiler
cd aot && cargo build --release

# JIT tier (wasm32)
cd aot-jit && wasm-pack build --target web

# Guest rootfs
docker buildx build --platform linux/riscv64 -f tools/Dockerfile.claude -t friscy-claude . --load

# Serve web shell (requires COOP/COEP for SharedArrayBuffer)
node friscy-bundle/serve.js 9000
```

## Conventions

- Runtime C++ is header-only: `syscalls.hpp`, `network.hpp`, `vfs.hpp`, `elf_loader.hpp` are included from `main.cpp`.
- Emscripten flags: always use `-fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0` at both compile and link. Never use legacy exception handling.
- Shared memory: `-sSHARED_MEMORY=1 -matomics -mbulk-memory` on all translation units.
- AOT compiler uses `wasm-encoder 0.201.0` (API: `ty`/`table`, not `type_index`/`table_index`).
- Rust toolchain: `export PATH="$HOME/.cargo/bin:$PATH"` before cargo commands.
