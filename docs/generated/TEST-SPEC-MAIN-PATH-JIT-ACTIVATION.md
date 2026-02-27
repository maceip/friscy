# Test Spec: Main-Path JIT Activation (#1)

## Scope

Validate that timeslice stops re-enter the Worker resume loop (new behavior),
and that legacy mode reproduces the old early-exit behavior.

## Test workload

- Guest: `/bin/sh` in `rootfs.tar`
- Command:
  - `i=0; while [ $i -lt 200000 ]; do i=$((i+1)); done; echo done`
- Query:
  - Legacy baseline: `?example=alpine&nojit&legacyresume=1`
  - New behavior: `?example=alpine&nojit`

## Pass criteria

### Legacy baseline (`legacyresume=1`)

- Resume telemetry is emitted.
- `timesliceResumeEnabled = false`
- `resumeCount = 0`
- `stopTimeslice >= 1`
- No terminal `done` output.

### New behavior (default)

- Resume telemetry is emitted.
- `timesliceResumeEnabled = true`
- `resumeCount > 0`
- `timesliceResumeAttempts > 0`
- `stopTimeslice > 0`
- Terminal output contains `done`.

## Runner

```bash
node tests/test_main_path_jit_activation.mjs
```

Optional environment overrides:

- `FRISCY_TEST_ROOTFS_URL` (default `./rootfs.tar`)
- `FRISCY_TEST_CMD` (default loop command above)
- `FRISCY_TEST_TIMEOUT_MS` (default `120000`)
- `FRISCY_TEST_PORT` (default `8099`)
