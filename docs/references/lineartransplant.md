# Linear Memory Transplant — Reference and friscy Implementation

This document captures the linear memory transplant technique and how friscy's checkpoint system implements it.

## Reference: Raw Memory Transplant (lineartransplant)

The canonical technique for fast Wasm boot via state injection:

1. Read a saved state blob from disk (e.g. 28MB)
2. Create `WebAssembly.Memory` with enough pages to hold the blob
3. Write the blob into the memory's buffer: `view.set(stateBuffer)`
4. Instantiate the Wasm module with `memory` in the imports
5. Start execution — the module sees pre-filled state, skips cold boot

```javascript
// Simplified from lineartransplant reference
const memory = new WebAssembly.Memory({ initial: 512, maximum: 512 });
new Uint8Array(memory.buffer).set(stateBuffer);
const { instance } = await WebAssembly.instantiate(wasmBuffer, { env: { memory } });
instance.exports.start_emulation();
```

This works when the state format is a **raw memory dump** that maps 1:1 to the Wasm linear memory layout. The emulator (or engine) expects its memory at fixed offsets.

## friscy's Checkpoint: Extended Transplant

friscy cannot use the pure approach because:

1. **Emscripten owns memory** — the Emscripten runtime allocates and manages linear memory; we cannot pre-create and pass our own before instantiation.
2. **State is not just memory** — we must restore CPU registers, exec context, epoll instances, eventfd counters, page attributes, and sparse arena chunks. A raw dump would miss these.
3. **Sparse arena** — we save only non-zero 64KB chunks (~4% density for REPL), not a contiguous blob.

friscy's `checkpoint.hpp` implements a **parsed restore** after the module is already instantiated:

1. `callMain([... '--load-checkpoint', '/checkpoint.ckpt', ...])` runs `main()` which detects the flag and calls `load_checkpoint()` before entering the simulate loop.
2. `load_checkpoint()` parses the binary format (header, CPU, exec context, epoll, eventfd, sparse chunks) and writes into the existing machine/arena.
3. Execution resumes from the saved PC — equivalent to the transplant "skip cold boot" effect.

### Binary Format (FRISCYCK v2)

| Section  | Contents |
|----------|----------|
| Header   | Magic "FRISCYCK", version, flags |
| CPU      | PC, FCSR, x0–x31, f0–f31 |
| Memory   | mmap_addr, brk_base, brk_current |
| Exec     | exec_base, heap_start, exec segments, etc. |
| Sched    | Thread scheduler, next_pid, epoll_fd |
| Epoll    | Instances with interests |
| Eventfd  | Counter values |
| Arena    | Sparse chunks [addr, len, data...] |

### Replicated Findings (alpha_test.md)

The alpha test suite verifies:

- **Node.js Wasm**: `callMain` with checkpoint returns in ~2.2s; `friscy_resume()` loop runs 5 cycles in ~9ms; `_friscy_stopped()` returns true as expected.
- **Browser**: Page + worker boot, rootfs load, checkpoint load (85MB), resume loop active, REPL output (network bridge fails without proxy — expected).

Same outcome as the raw transplant: **boot overhead skipped, execution resumes from saved state**.
