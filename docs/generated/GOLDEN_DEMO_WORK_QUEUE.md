# Golden Demo Work Queue

## 2026-02-23 (Eject Mode)

- [x] Create clean-room `golden_demo/` folder and isolated server.
- [x] Add minimal browser runtime path using `docs_site` worker/runtime assets.
- [x] Add harness commands for asset verification/hashing/build/export.
- [x] Add Dockerfiles for Node.js and Go server rootfs regeneration.
- [x] Add asset provenance documentation.
- [x] Enable optimization stack knobs by default with fallback flags.
- [x] Add strict browser verification matrix for `golden_demo` with progress logs.
- [x] Add checkpoint continuity gate to matrix.
- [x] Resolve Alpine prompt/command round-trip in clean-room path.
- [x] Replace unstable Node path with deterministic native-generated stdin checkpoint (`node-stdin.ckpt`).
- [x] Achieve green matrix (`pass=3/3`) for Alpine + Node checkpoint + Go boot.
- [x] Write docs_site asset provenance README with regeneration instructions.
- [x] Create local secret handoff pattern (`.run-state/secrets.env`) and env wiring docs.
- [x] Add explicit network failure visibility in golden demo (no silent hangs on net lane/proxy init failures).
- [x] Inject syscall-500 host-fetch `curl` utility into demo rootfs assets (`rootfs.tar`, `nodejs.tar`, `goserver.tar`).
- [ ] Add explicit Go server request/response network assertion in matrix.
- [ ] Resolve WebTransport handshake path in browser validation environment (currently fails in headless Chromium with opening handshake error).
- [ ] Package final merge-ready change summary and residual risks.

## 2026-02-24 (Node checkpoint stabilization)

- [x] Stop relying on stale Node checkpoints; rebuild runtime and regenerate live checkpoint.
- [x] Fix `sys_epoll_pwait` log guard regression that flooded output and masked hangs.
- [x] Add tty alias readiness handling in `ppoll`/`epoll_pwait` for stdin-like fds.
- [x] Extend checkpoint format to include `g_tty_fds` (`checkpoint VERSION=3`).
- [x] Rebuild and redeploy browser runtime (`docs_site/friscy.{js,wasm}`).
- [x] Regenerate Node checkpoint: `/docs_site/node-blocking-v3.ckpt`.
- [x] Promote Node default checkpoint in manifests to `node-blocking-v3.ckpt`.
- [x] Validate required Node SHA command from checkpointed boot in browser.
- [ ] Add explicit CLI gate script for Node checkpoint (`sha` step) into `tests/` and wire into matrix.
- [ ] Restore/verify async-network Node path for `https`/Claude flows without regressing checkpoint stability.
- [x] Stabilize docs_site Claude checkpoint ladder harness (`mcp -> haiku -> limerick`) with deterministic progress and hard timeouts.
- [x] Fix browser live-checkpoint export path by using SAB control command wake-up instead of message-only trigger.
- [x] Produce and verify latest Node Claude ladder checkpoints:
  - `docs_site/claude-mcp-post.ckpt`
  - `docs_site/claude-haiku.ckpt`
  - `docs_site/claude-limerick.ckpt`
- [x] Validate continuity by booting from `claude-limerick.ckpt` and executing `claude mcp list`.

## 2026-02-24 (Next-stage items requested)
- [ ] Evaluate de-JSPI async architecture: dedicated `net`/`fs`/`wait` lanes with queue + completion signaling (avoid whole-guest suspend on single fetch).
- [ ] Design control-plane for per-machine public DNS ingress:
  - hostname/session mapping,
  - inbound route -> guest listener fd,
  - sticky session routing,
  - auth/rate-limit/ACL model.
- [ ] Define overlay-FS implementation plan over tar lower layer:
  - immutable lower digest,
  - writable upper chunk store,
  - whiteouts,
  - overlay manifest + lazy chunk materialization,
  - checkpoint pointer model.
- [x] Bring `gemini-cli` image through same checkpoint ladder as Claude (`tools/Dockerfile.gemini`).
- [x] Bring `codex` image through same checkpoint ladder as Claude (`tools/Dockerfile.codex`).
