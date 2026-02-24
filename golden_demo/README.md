# golden_demo

Clean-room browser demo path (eject mode) that reuses runtime assets from `docs_site` but avoids service-worker cache behavior.

## Scope
- Boot and interact with Alpine and Node.js from browser.
- Support checkpoint injection via `?ckpt=<path>`.
- Keep demo harness and asset provenance explicit.
- Run optimization stack enabled by default (JIT/tiering/prewarm/predictor/trace knobs).

## Start
```bash
node golden_demo/serve.js 9095
# open http://127.0.0.1:9095/
```

## Harness
```bash
./golden_demo/harness.sh verify-assets
./golden_demo/harness.sh hash-assets
./golden_demo/harness.sh build-alpine-rootfs
./golden_demo/harness.sh build-nodejs-rootfs
./golden_demo/harness.sh build-goserver-rootfs
./golden_demo/harness.sh build-node-stdin-checkpoint
./golden_demo/harness.sh serve
```

## Asset Provenance (current)
- `docs_site/rootfs.tar` sha256 `659fc49c6ac9d4b18cc34675ad6e440bc3d494866edb993150c11c9c25e5db97`
- `docs_site/nodejs.tar` sha256 `7a82cd8c5c68185be4a6179dc0195831af581c02a0b8ff03cb2208f130e27082`
- `docs_site/goserver.tar` sha256 `cd98407864bcf8d596dffa1d8cd4094580e6d50e32a7768888dfd1c67787e8b9`
- `docs_site/alpine-bash.ckpt` sha256 `da70123549289c77c86b684fc0deb47b40e7fec87772f90bb5178c4b11a30c92`
- `docs_site/node-stdin.ckpt` sha256 `3204ff7b16fe056b491c437e2078f92ce89c29e0c8c4ad26cf66111621f05ce3`
- `docs_site/claude-repl.ckpt` sha256 `a2c213f95da7dcd333f9dc81c348ba705a0380078813a26c824f8c73f8cfd45d` (local/untracked)

## Node Checkpoint Pipeline
Native checkpoint build used by `golden_demo`:
```bash
./golden_demo/harness.sh build-node-stdin-checkpoint
```

This creates `docs_site/node-stdin.ckpt` from:
- rootfs: `docs_site/nodejs.tar`
- command: Node script that prints `READY`, waits on stdin, then prints `OK` on newline
- checkpoint capture point: first stdin wait (`--export-checkpoint`)

You can override at runtime with query param:
```text
?example=nodejs&ckpt=/docs_site/your.ckpt
```

## Optimization Controls (query params)
- Defaults are optimization-on. Disable with `?nojit`, `?notier`, `?noprewarm`, `?nomarkov`, `?notriplet`, `?notrace`.
- Tune with integer params: `jithot`, `jitopt`, `jitbudget`, `jitconcurrency`, `jitqmax`, `jitk`, `jitconf`, `jitedge`, `jittriplet`.

## Pipeline Rule
All optimization work must show user-perceived wins (time-to-prompt and command round-trip) on real browser demos before it is accepted.

## Current Matrix Gate
```bash
GOLDEN_BOOT_TIMEOUT_MS=90000 GOLDEN_CMD_TIMEOUT_MS=60000 node tests/test_golden_demo_matrix.mjs
```
Latest observed: `pass=3/3` (alpine, node checkpoint stdin, go server boot).

## Local Secret Handoff (not tracked)
- Local secret file: `.run-state/secrets.env`
- Loader helper: `.run-state/load_env.sh`

Example:
```bash
.run-state/load_env.sh env | rg ANTHROPIC_API_KEY
```

Do not commit secrets into repository-tracked files.
