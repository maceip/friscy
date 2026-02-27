# Test Spec: #2 Boot JIT Prewarm Reliability

## Objective

Validate short-term reliability hardening for boot-time JIT prewarm and compile scheduling:

- compile fallback path is `fast -> compat`,
- speculative prewarm failures do not inflate `compileFailures`,
- queue enqueues trigger compile processing immediately (without waiting scheduler tick).

## Scope

- Test target: `friscy-bundle/jit_manager.js`
- Harness: deterministic Node test with mocked JIT compiler exports and wasm memory
- Out of scope: browser end-to-end latency and workload-dependent hotness patterns

## Assertions

1. **Fallback compile path works**
   - Given `compile_region_fast` throws and `compile_region` succeeds,
   - Then region compile succeeds at `compat` tier,
   - And `compileFailures` remains unchanged.

2. **Speculative prewarm accounting is clean**
   - Given both fast and compat compile functions throw,
   - When calling `prewarmRegionAt(pc)`,
   - Then result is `false`,
   - And `compileFailures` does not increment.

3. **Queue drain is immediate**
   - Given a valid compile function,
   - When `queueCompileRequest(...)` is called,
   - Then a region is compiled shortly after enqueue (microtask/async path),
   - Without relying on interval scheduler cadence.

## Test Command

```bash
node tests/test_jit_prewarm_reliability.mjs
```

## Pass Criteria

Command exits `0` and prints:

- `[PASS] fallback: ...`
- `[PASS] prewarm: ...`
- `[PASS] queue: ...`
- `[PASS] #2 JIT prewarm reliability spec is green`
