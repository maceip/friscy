# Golden Demo Matrix Report

Date: 2026-02-23
Command:

```bash
GOLDEN_BOOT_TIMEOUT_MS=90000 GOLDEN_CMD_TIMEOUT_MS=60000 node tests/test_golden_demo_matrix.mjs
```

## Result
- Summary: `pass=3/3`
- Alpine: PASS (`echo GD_ALPINE_OK`)
- Node.js: PASS (`node-stdin.ckpt` + stdin command `x` => `OK`)
- Go server: PASS (boot observed)

## Evidence Notes
1. Node checkpoint path now uses `docs_site/node-stdin.ckpt` generated from native runtime with `--export-checkpoint` at first stdin wait.
2. Prior `claude-repl.ckpt` is still present but not used by default in `golden_demo` because restore landed in epoll loops and did not provide deterministic stdin continuity.
3. `tests/test_golden_demo_matrix.mjs` now prints progress logs and failure `logsTail` snippets to avoid silent hangs.

## Remaining Gaps
1. Matrix currently validates Go server boot; request/response network assertion is still pending.
2. Legacy `docs_site` test matrix remains non-green and should be treated as secondary until the clean-room path is merged and promoted.
