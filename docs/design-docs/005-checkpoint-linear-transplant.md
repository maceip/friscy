# ADR 005: Checkpoint as Linear Memory Transplant

## Context

The **linear memory transplant** technique achieves fast Wasm boot by pre-filling `WebAssembly.Memory` with a saved state blob before instantiating the emulator. The module then skips cold boot and resumes execution directly. Reference: `docs/references/lineartransplant.md`.

friscy needs to skip ~20 seconds (340M RISC-V instructions) of Node.js + Claude REPL boot when loading in the browser. A raw memory transplant is not feasible because:

1. Emscripten allocates linear memory; we cannot supply our own at instantiation.
2. The state includes CPU registers, exec context, epoll, eventfd, and page attributes — not just guest RAM.
3. The 2GB arena is sparse (~4% non-zero); a contiguous dump would be wasteful.

## Decision

Implement a **parsed checkpoint format** that is restored into the already-instantiated machine after `main()` starts:

- Binary format: header + CPU + memory layout + exec context + scheduler + epoll + eventfd + sparse arena chunks.
- Load path: `--load-checkpoint /path` flag → `load_checkpoint()` parses and restores before entering the simulate loop.
- Save path: `--export-checkpoint /path` → `save_checkpoint()` serializes at "idle waiting for stdin".

Same user-visible outcome as a raw transplant: boot overhead skipped, execution resumes from saved PC.

## Consequences

- **Pro**: Works with Emscripten; restores full machine state; sparse format keeps checkpoint size reasonable (~82MB for REPL).
- **Pro**: Verified in alpha test suite (Node.js Wasm + browser Puppeteer).
- **Con**: Must maintain format compatibility when adding new state (epoll, eventfd, etc.); bugs (e.g. exec page perms) require fixes in restore logic.
