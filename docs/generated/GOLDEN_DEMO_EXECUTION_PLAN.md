# Golden Demo Execution Plan (2026-02-23)

## Objective
Ship a reproducible browser demo path with explicit asset provenance and hard gates, centered on Node checkpoint functionality.

## Completed
1. Clean-room demo path created: `golden_demo/`.
2. Progress-visible Puppeteer matrix added: `tests/test_golden_demo_matrix.mjs`.
3. Node deterministic checkpoint pipeline established:
   - rootfs: `docs_site/nodejs.tar`
   - native export: `build-native/friscy --export-checkpoint docs_site/node-stdin.ckpt ...`
4. Matrix now green (`pass=3/3`) on Alpine, Node checkpoint stdin, Go server boot.
5. Provenance + harness docs updated in `docs_site/README.md` and `golden_demo/README.md`.

## Active Priorities
1. Promote `golden_demo` to release gate while legacy `docs_site` remains secondary.
2. Add Go server request/response network assertion (not just boot).
3. Add spec/bench gates for optimization items 3/4/5 with non-fake impact criteria.

## Guardrails
1. Any optimization must improve real browser metrics (time-to-prompt, time-to-first-command, continuity), not synthetic-only passes.
2. Every artifact in demo path must be rebuildable via `golden_demo/harness.sh`.
3. Journal and work queue are updated on each meaningful run/fix cycle.
