# Benchmark Gate: #2 JIT Prewarm Impact

## Goal

Ensure prewarm optimization provides real benefit, not only internal state changes.

## Harness

- Script: `tests/bench_jit_prewarm_impact.sh`
- Underlying test: `tests/test_phase1_nodejs2.js`

## A/B Modes

- Prewarm OFF (control): `?noproxy&jithot=1&jitawait=1&nojitprewarm=1`
- Prewarm ON (candidate): `?noproxy&jithot=1&jitawait=1`

## Required Gates

1. Semantic gate
- Both modes must pass workload semantics and load JIT compiler.

2. Engagement gate
- Both modes must compile JIT regions (median >= 1) to avoid fake no-op timing.

3. Prewarm config gate
- Control mode must report zero prewarmed runs.
- Candidate mode must report prewarmed runs on all benchmark runs.

4. Impact gate
- Candidate must improve median first-compile latency by threshold.
- Candidate must not regress median elapsed time beyond allowed cap.

## Command

```bash
bash ./tests/bench_jit_prewarm_impact.sh --runs 3
```

## Result artifact

- `tests/.perf/jit_prewarm_impact.latest.json`
