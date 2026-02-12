# Plans & Roadmap

## Current Focus

- Complete the rv2wasm AOT compiler — the single highest-leverage task for
  reaching 80%+ native performance in the browser.
- Fill remaining AOT gaps: floating-point translation, atomics, br_table
  dispatch optimization.

## Near-term

- [ ] AOT: Implement br_table dispatch for O(1) basic-block lookup.
- [ ] AOT: Translate RV64F/D floating-point instructions to Wasm f32/f64 ops.
- [ ] AOT: Translate atomic instructions (lr.w/sc.w, amo*) to Wasm atomics.
- [ ] Integrate rv2wasm into `friscy-pack --aot` pipeline.
- [ ] Expand test suite with Alpine package install + Python stress test.

## Medium-term

- [ ] Wizer snapshots for instant startup (<500 ms cold start).
- [ ] VFS persistence via IndexedDB (survive page refresh).
- [ ] Multi-threading support (CLONE_THREAD + SharedArrayBuffer).
- [ ] WebGPU compute offload for SIMD-heavy workloads.

## Long-term

- [ ] Lazy binary translation (JIT-lite) for dynamic code.
- [ ] Memory-mapped guest address space for reduced overhead.
- [ ] Browser-native RISC-V support proposal (speculative).

## See Also

- [exec-plans/active/](exec-plans/active/) — detailed plans for in-flight work.
- [exec-plans/completed/](exec-plans/completed/) — archived plans.
- [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md) — known debt.
- [ROADMAP.md](ROADMAP.md) — detailed implementation status.
- [ENDZIEL.md](ENDZIEL.md) — long-term optimization strategies.
