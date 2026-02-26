# Plans & Roadmap

## Current Focus

- Keep cooperative fork/exec/wait regression gate green in runtime (`clone(flags=0x11)` external-command path).
- Fresh browser ladders are green on fixed runtime for Claude/Gemini/Codex checkpoint chains.
- Repair stale 3-demo ladder harness status detection (`scripts/run_golden_demo_checkpoint_ladders.mjs`) and rerun docs-site matrix on current UI contract.
- Continue performance work (AOT, JIT, worker-lane optimizations) with the runtime gate enforced.

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

## Tier 3 Checklist (Colored Workers + JIT Scope)

- [ ] Add colored worker lanes for `net`, `wait`, and `fs` (optional `crypto`).
- [ ] Define fixed opcode routing contract (`OP_NET_*`, `OP_WAIT_*`, `OP_FS_*`, `OP_CRYPTO_*`).
- [ ] Enforce bounded queues and per-lane backpressure.
- [ ] Keep deterministic fallback to single-worker path when any lane is unavailable.
- [ ] Add per-lane metrics (`queueDepth`, `latencyMs`, `errorRate`).
- [ ] Ensure no cross-lane mutable state without explicit message protocol.
- [ ] Reduce JIT scope to active demo/test path; disable/remove unused JIT branches.
- [ ] Keep feature flags for later re-enable of trimmed JIT paths.
- [ ] Verify lane isolation by fault-injecting one lane while others continue.
- [ ] Verify no latency regression for `time-to-prompt` and `claude mcp list` round-trip.
- [ ] Verify fallback integrity by running with colored workers disabled.
- [ ] Verify output/exit-code parity after JIT simplification.

## See Also

- [exec-plans/active/](exec-plans/active/) — detailed plans for in-flight work.
- [exec-plans/completed/](exec-plans/completed/) — archived plans.
- [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md) — known debt.
- [OPTIMIZATION-RAILS.md](OPTIMIZATION-RAILS.md) — Tier 1/2/3 gates and optimization verification rails.
- [ROADMAP.md](ROADMAP.md) — detailed implementation status.
- [ENDZIEL.md](ENDZIEL.md) — long-term optimization strategies.
