# docs_site Asset and Demo Runbook

This file records the asset stack used by the browser demos and how to recreate it.

`time to boot can take user stdin`

## Demo Targets
- Alpine shell demo (`example=alpine`)
- Node.js demo (`example=nodejs`)
- Go echo demo (`example=server`)

## Current Asset Inventory
- `docs_site/friscy.js`
- `docs_site/friscy.wasm`
- `docs_site/worker.js`
- `docs_site/jit_manager.js`
- `docs_site/rootfs.tar`
- `docs_site/nodejs.tar`
- `docs_site/goserver.tar`
- `docs_site/alpine-bash.ckpt`
- `docs_site/node-stdin.ckpt`
- `docs_site/claude-repl.ckpt` (local/untracked)
- `/usr/local/bin/curl` and `/usr/local/bin/vhcurl` injected into demo rootfs assets (syscall-500 host-fetch client).

## Provenance Hashes (latest observed)
- `docs_site/rootfs.tar`: `3d0a6155ab29dec74692de8b284c70abb38edef5e6c9ab0bb29d61159357c369`
- `docs_site/nodejs.tar`: `e4140e19eb6605789ebb9e6173b9f4806d44e661f9733f5834472ec96c672bb8`
- `docs_site/goserver.tar`: `dd54b809074ef028f6ed5d7656242b1b83bbadda737f5820391deafa3e6abd47`
- `docs_site/alpine-bash.ckpt`: `da70123549289c77c86b684fc0deb47b40e7fec87772f90bb5178c4b11a30c92`
- `docs_site/node-stdin.ckpt`: `3204ff7b16fe056b491c437e2078f92ce89c29e0c8c4ad26cf66111621f05ce3` (native-generated stdin checkpoint)
- `docs_site/claude-repl.ckpt`: `a2c213f95da7dcd333f9dc81c348ba705a0380078813a26c824f8c73f8cfd45d`

## Rebuild Pipeline (command-level)
Use the eject-mode harness:

```bash
./golden_demo/harness.sh verify-assets
./golden_demo/harness.sh hash-assets
```

### Alpine rootfs
```bash
./golden_demo/harness.sh build-alpine-rootfs
```

### Node rootfs
```bash
./golden_demo/harness.sh build-nodejs-rootfs
```

### Go echo rootfs
```bash
./golden_demo/harness.sh build-goserver-rootfs
```

### Node stdin checkpoint (native, reproducible)
```bash
./golden_demo/harness.sh build-node-stdin-checkpoint
```

### Claude checkpoint export
```bash
# serve bundle first (separate terminal)
node docs_site/serve.js 9090

# export checkpoint via browser runtime
./golden_demo/harness.sh export-claude-checkpoint docs_site/claude-repl.ckpt 9090
```

## Verification Entry Points
- Clean-room server:
```bash
node golden_demo/serve.js 9095
```
- Strict matrix (progress logs + node continuity gate):
```bash
node tests/test_golden_demo_matrix.mjs
```

## Current Verification Reality
- `golden_demo` matrix is green (`pass=3/3`) with:
  - Alpine stdin command round-trip
  - Node stdin round-trip from `node-stdin.ckpt`
  - Go server boot
- Legacy `docs_site` matrix (`tests/test_docs_site_demo_matrix.mjs`) still shows regressions and is not the current release gate.

## Known Active Blockers (tracked in run journal)
- Legacy `docs_site` matrix is not green and still needs dedicated runtime parity work.
- Clean-room matrix does not yet validate Go request/response traffic (boot-only check today).
- WebTransport proxy handshake fails in headless Chromium in this environment (`Opening handshake failed`), so browser-network validation in CI/headless currently requires a fallback strategy.

## Rule for Further Optimization
Optimization changes are accepted only if they improve user-perceived metrics on real browser demos:
- time-to-prompt
- time-to-first-command
- continuity (command1 then command2 without crash)
