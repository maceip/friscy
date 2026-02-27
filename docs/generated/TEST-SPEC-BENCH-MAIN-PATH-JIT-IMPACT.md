# Benchmark Gate: #1 Main-Path JIT Activation Impact

## Goal

Prevent "green but useless" results by requiring both correctness and measurable impact.

## Harness

- Script: `tests/bench_main_path_jit_impact.sh`
- Underlying test: `tests/test_main_path_jit_activation.mjs`

## A/B Modes

- Legacy mode (control): `?example=alpine&legacyresume=1&jithot=1&jitawait=1`
- Enabled mode (candidate): `?example=alpine&jithot=1&jitawait=1`

## Required Gates

1. Semantic gate
- Enabled mode must execute resumable slices (`resumeCount` median > 0).

2. JIT activity gate
- Enabled mode must load compiler each run.
- Enabled mode must report activity score >= threshold each run.

3. Impact gate
- Candidate must improve completion-rate vs control, or
- if completion rates are equal, improve median elapsed time by configured threshold.

## Command

```bash
bash ./tests/bench_main_path_jit_impact.sh --runs 3
```

## Result artifact

- `tests/.perf/main_path_jit_impact.latest.json`
