# Design Philosophy

## Principles

1. **Userland emulation, not full-system.**  friscy runs Linux binaries by
   emulating RISC-V user-mode instructions and intercepting syscalls.  There
   is no kernel boot, no BIOS, no device model.  This is the CheerpX
   approach — the fastest path to running containers in the browser.

2. **RISC-V over x86.**  RISC-V's fixed-width, regular encoding maps cleanly
   to Wasm.  The AOT compiler (rv2wasm) can translate basic blocks 1:1 without
   the decoding complexity of variable-length x86.

3. **libriscv as the interpreter.**  We use libriscv for the interpret loop
   and memory model, adding our own syscall layer, VFS, dynamic linker, and
   network stack on top.  This keeps the emulation core battle-tested while
   we own the Linux compatibility surface.

4. **Emscripten for Wasm compilation.**  The C++ runtime cross-compiles to
   Wasm via Emscripten.  This gives us pthreads, MEMFS, async I/O, and mature
   toolchain support — no hand-rolled Wasm runtime.

5. **Docker as the input format.**  Users hand us a Docker image.  `friscy-pack`
   cross-compiles it to RISC-V, extracts the rootfs, and bundles it with the
   Wasm runtime into a self-contained HTML page.

## Architecture Decision Records

See [design-docs/index.md](design-docs/index.md) for the full ADR log.

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and component status
- [RELIABILITY.md](RELIABILITY.md) — syscall coverage guarantees
- [SECURITY.md](SECURITY.md) — sandbox model
