# Run Journal

## 2026-02-23
- Journal initialized.

- Added Golden Demo execution plan (docs/generated/GOLDEN_DEMO_EXECUTION_PLAN.md).

- Added eject-mode golden demo files (golden_demo/*) and harness Dockerfiles (tools/Dockerfile.golden-*).
- Wired golden_demo optimization knobs into worker init (enabled-by-default, query-param fallbacks).
- Created on-disk work queue (docs/generated/GOLDEN_DEMO_WORK_QUEUE.md and .run-state copy).
- Added strict golden demo matrix test with progress logs and node continuity gate (tests/test_golden_demo_matrix.mjs).
- Debug run: golden_demo boot now executes worker/runtime; found alpine checkpoint incompatibility (checkpoint: bad magic). Disabled default alpine checkpoint in golden_demo manifest for reliability.
- Added docs_site/README.md with asset provenance, rebuild commands, required boot note, and known blockers.
- Updated on-disk work queue status after docs_site runbook and matrix additions.
- Added local secret handoff files (.run-state/secrets.env + .run-state/load_env.sh), kept out of git.
- Completed local secret handoff pattern and documented it in golden_demo README.
- Recorded short-timeout golden matrix result (pass=1/3) in docs/generated/GOLDEN_DEMO_MATRIX_REPORT.md.
- Improved matrix harness to fail fast when demo status exits/errors during command phase.
- Baseline check: `tests/test_docs_site_demo_matrix.mjs` still failed (`pass=1/3`), confirming regressions were real in legacy path.
- Fast recovery patch: switched clean-room Alpine to `/bin/sh -i` and Node rootfs to `docs_site/nodejs.tar`; result moved to `pass=2/3` (Node no longer hard-crashed).
- Forensics: `claude-repl.ckpt` restored into epoll wait loops and did not provide deterministic stdin continuity for Node demo.
- Built deterministic Node checkpoint in native runtime:
  - command: `build-native/friscy --rootfs docs_site/nodejs.tar --export-checkpoint docs_site/node-stdin.ckpt /usr/bin/node --jitless -e '<stdin probe script>'`
  - runtime: ~3.95s
  - output checkpoint: `docs_site/node-stdin.ckpt` sha256 `3204ff7b16fe056b491c437e2078f92ce89c29e0c8c4ad26cf66111621f05ce3`
- Wired `golden_demo` Node example to `node-stdin.ckpt` and updated matrix node gate to verify stdin round-trip (`x` -> `OK`).
- Achieved strict matrix green:
  - command: `GOLDEN_BOOT_TIMEOUT_MS=90000 GOLDEN_CMD_TIMEOUT_MS=60000 node tests/test_golden_demo_matrix.mjs`
  - summary: `pass=3/3`
- Updated harness and docs:
  - new command `./golden_demo/harness.sh build-node-stdin-checkpoint`
  - updated provenance in `golden_demo/README.md`, `docs_site/README.md`
  - refreshed generated execution plan/work queue/matrix report docs.

## 2026-02-23T16:36:14.033Z Node crypto + deep checkpoints
- bootMs=3105
- requireCryptoMs=1207
- shaCommandMs=202
- fsCommandMs=201
- deep1: docs_site/node-repl-crypto-deep1.ckpt bytes=82136108 sha256=7e30236b677f68b07cac3816e05d915774d6501681ded288dbfb62c6049fd816
- deep2: docs_site/node-repl-crypto-deep2.ckpt bytes=82136108 sha256=11b149c4e8927caf64883d115bac2660e52d3ced7f4d5ffa1a8631dd8475c746

## 2026-02-23T16:37Z Export/continuity fixes
- Fixed live checkpoint export in `docs_site/worker.js` by treating Emscripten pointers as unsigned (`dataPtr >>> 0`) for checkpoint/tar exports.
- Added resume-loop control command `CMD_EXPORT_CHECKPOINT` so live export can be triggered while machine is parked at stdin wait.
- Added browser helper `window.__goldenExportLiveCheckpoint()` in `golden_demo/app.js`.
- Added local upload endpoint `POST /__upload_checkpoint/<name>.ckpt` in `golden_demo/serve.js` for direct browser-to-disk checkpoint writes.
- Captured deeper checkpoints from browser Node REPL session after SHA and after filesystem op:
  - `docs_site/node-repl-crypto-deep1.ckpt` sha256 `7e30236b677f68b07cac3816e05d915774d6501681ded288dbfb62c6049fd816`
  - `docs_site/node-repl-crypto-deep2.ckpt` sha256 `11b149c4e8927caf64883d115bac2660e52d3ced7f4d5ffa1a8631dd8475c746`
- Verified continuity from `node-repl-crypto-deep2.ckpt`: boot succeeded and SHA command returned expected hash.

## 2026-02-23T16:38Z Alpine dev-tool rootfs
- Added `tools/Dockerfile.golden-alpine-dev` (includes bash, git, gnupg/gpg, nano, curl, wget, jq, tmux, screen, vim, and supporting CLI tools).
- Rebuilt `docs_site/rootfs.tar` from `friscy-golden-alpine-dev`.
- Verified binaries in tar: `/usr/bin/git`, `/usr/bin/nano`, `/usr/bin/gpg`, `/usr/bin/jq`, `/usr/bin/curl`, `/usr/bin/wget`, `/usr/bin/tmux`, `/usr/bin/screen`, `/usr/bin/vim`.
- Current `docs_site/rootfs.tar` sha256: `8b2cc39e257bd3da4ae19f6e84df174318e082439a2760927c3c004bdef42750`.

## 2026-02-23T16:40Z User-directed execution commitment
- Repeated back and committed to execute the full work package requested by user.
- Work package includes:
  - Rootfs provenance detail for Alpine/Node/Go.
  - 3-demo checkpoint continuity ladders with interactive verification, browser checkpointing, and no-crash validation.
  - Networking architecture review (legacy WebTransport proxy vs VectorHeart host-fetch hypercall).
  - Prefer optimized hypercall networking on all demos where feasible.
  - Re-run checkpoint ladders with `fetch/wget/curl https://stare.network` at checkpoint stages.
  - Optional Demo #4: Node + Claude CLI large-js optimization, `claude mcp list`, then haiku/limerick checkpoint chain with timings.
- Acceptance criteria: concrete pass/fail gates, timings, hashes, and reproducible commands.

## 2026-02-23T16:44:29.558Z 3-demo checkpoint continuity ladders
- alpine: FAIL (live checkpoint export timeout)
- nodejs: PASS
- server: FAIL (Attempted to use detached Frame 'DD377CF59DBFC3E880DCA9243FC44230'.)

## 2026-02-23T16:50:26.790Z Alpine checkpoint ladder
- FAIL (live checkpoint export timeout)

## 2026-02-23T16:53:35.640Z Alpine checkpoint ladder
- FAIL (alpine git action failed: exit:1)

## 2026-02-23T17:04:39.916Z 3-demo checkpoint continuity ladders
- nodejs: PASS

## 2026-02-23T17:05:24.406Z 3-demo checkpoint continuity ladders
- server: FAIL (Protocol error (Runtime.callFunctionOn): Target closed)

## 2026-02-23T17:07:28.600Z 3-demo checkpoint continuity ladders
- server: FAIL (live checkpoint export timeout)

## 2026-02-23T17:09:53.690Z 3-demo checkpoint continuity ladders
- server: FAIL (boot failed for server: status=exit:1 boot=boot: running friscy-goserver (network on))

## 2026-02-23T17:10:48.672Z 3-demo checkpoint continuity ladders
- server: FAIL (live checkpoint export timeout)

## 2026-02-23T17:16:00.049Z Alpine checkpoint ladder
- FAIL (alpine git action timeout)

## 2026-02-23T17:19:18.717Z Alpine checkpoint ladder
- FAIL (alpine git action timeout)

## 2026-02-23T17:25:34.678Z Alpine checkpoint ladder
- PASS

## 2026-02-23T17:25:48.340Z 3-demo checkpoint continuity ladders
- server: PASS

## 2026-02-23T17:27:45.573Z 3-demo checkpoint continuity ladders
- nodejs: PASS

## 2026-02-23T17:28:23.090Z 3-demo checkpoint continuity ladders
- alpine: PASS
- nodejs: PASS
- server: PASS

## 2026-02-23T17:31Z Demo pass checkpoint ladders (consolidated)
- Ran `node scripts/run_golden_demo_checkpoint_ladders.mjs` on latest runtime build.
- Result: `pass=3/3` for `alpine`, `nodejs`, `server`.
- Alpine action (git op): `git --git-dir=/var/gitdemo cat-file --batch-check` probe returns `missing`.
- Node action: SHA256 crypto command returns expected hash.
- Server action: running-state continuity with checkpoint replay.
- Stage checkpoints:
  - `docs_site/alpine-stage1.ckpt` sha256 `532edc831c8d9c10ae1e9cae468914872ada7df7c01c6f1b942f0e9c2f0bd01e`
  - `docs_site/alpine-stage2.ckpt` sha256 `23a9ae7f4b4146fae3d56f0acfae1ecd42984850708a0ff04255e89d21b53046`
  - `docs_site/nodejs-stage1.ckpt` sha256 `8830f23e4476a6ab777f8d01857aab07217ff8e46bf19149795323e8eada60a5`
  - `docs_site/nodejs-stage2.ckpt` sha256 `a388b97ed4d52e7dd595abc30c0fe2ba1db8e189aab90bde09c1d222ebbde4a9`
  - `docs_site/server-stage1.ckpt` sha256 `ad155599063fa0532a88b80083533d1b87e8cf33d97b9844e43b2174e37e8258`
  - `docs_site/server-stage2.ckpt` sha256 `f2bbd775acb3b7c44c9134ad51ff8040a848892d7ed1ae14a3ce9aa8d09fa90a`

## 2026-02-23T17:53:50.724Z 3-demo checkpoint continuity ladders
- nodejs: PASS

## 2026-02-23T17:54:37.394Z 3-demo checkpoint continuity ladders
- nodejs: PASS

## 2026-02-23T17:54:37Z Network + continuity hardening
- Enabled  for  and  in .
- Added fast-fail network bridge behavior in :
  - Uses main-thread  +  on .
  - Falls back to stub bridge returning  when WebTransport handshake fails, preventing socket-hang stalls.
  - Added  query support to force clean boots.
- Added network diagnostics in  to avoid silent hangs and surface lane failures.
- Implemented broader proxy protocol support in  and :
  - Added bind/listen/accept/hasData/hasPendingAccept/shutdown plumbing.
  - Added event parsing for MsgConnected/MsgData/MsgAccept/MsgClosed.
- Added host-fetch guest tooling:
  -  (syscall 500 client), compiled and injected as  +  into:
    - 
    - 
    - 
- Added  prototype command loop and injected binary  into .
  - Result: not adopted as default entrypoint due fork/exec limitations in current emulator path.
- Re-validated node checkpoint continuity gate:
  - [nodejs] boot0: navigating
[nodejs] boot0: 2608ms
[nodejs] action0: 201ms
[nodejs] export1: 9038ms
[nodejs] boot1: navigating
[nodejs] boot1: 2351ms
[nodejs] action1: 202ms
[nodejs] export2: 9035ms
[nodejs] boot2: navigating
[nodejs] boot2: 2327ms
[nodejs] action2: 202ms
[result:nodejs] {"example":"nodejs","ok":true,"error":null,"timings":{"boot0Ms":2608,"action0Ms":201,"export1Ms":9038,"boot1Ms":2351,"action1Ms":202,"export2Ms":9035,"boot2Ms":2327,"action2Ms":202},"checkpoints":{"stage1":{"path":"docs_site/nodejs-stage1.ckpt","bytes":82136108,"sha256":"5b299feb37aefbf526c0af3b57de364a08efee89f5bf966b4122714bc7ba44b9"},"stage2":{"path":"docs_site/nodejs-stage2.ckpt","bytes":82201660,"sha256":"a388b97ed4d52e7dd595abc30c0fe2ba1db8e189aab90bde09c1d222ebbde4a9"}},"termTail":"\r\n[net] bridge unavailable: Opening handshake failed.\r\n[friscy] Loading rootfs: /rootfs.tar\n[friscy] Entry point: /usr/bin/node\n[friscy] Binary size: 48783560 bytes\n[friscy] Valid RV64 ELF detected\n[friscy] ELF type: PIE/shared\n[friscy] Dynamic binary detected\n[friscy] Interpreter: /lib/ld-musl-riscv64.so.1\n[friscy] Loaded interpreter: 613016 bytes\n[friscy-debug] Constructing Machine (binary bytes=48783560)\n[friscy-debug] Machine constructed (pc=0x2f2622)\n[friscy] Loading interpreter at 0x18000000\n[friscy] Interpreter entry: 0x18056900\n[friscy] PIE base: 0x40000\n[friscy] Advancing mmap past interpreter: 0x3ff2000 -> 0x18098000\n[friscy] Heap area: 0x18098000 (256MB)\n[friscy] VectorHeart Stage 2 startup: enabled\n[friscy] Setting up aux vector for dynamic linker\n[friscy] Machine stack top: 0x3ff1000\n[friscy] Stack pointer: 0x3ff0aa0\nevalmachine.<anonymous>:1\nconst crypto = require('crypto');\n^\n\nSyntaxError: Identifier 'crypto' has already been declared\n    at Script.runInContext (node:vm:149:12)\n    at Object.runInContext (node:vm:301:6)\n    at [eval]:1:441\n    at runScriptInThisContext (node:internal/vm:219:10)\n    at node:internal/process/execution:451:12\n    at [eval]-wrapper:6:24\n    at runScriptInContext (node:internal/process/execution:449:60)\n    at evalFunction (node:internal/process/execution:92:30)\n    at evalScript (node:internal/process/execution:104:3)\n    at node:internal/main/eval_string:71:3\n> '31a978a76555747c85c9a240624de85ca063df982c1791c349726f1de55c32cd'\n> "}
{
  "at": "2026-02-23T17:54:37.394Z",
  "baseUrl": "http://127.0.0.1:9095/",
  "bootTimeoutMs": 240000,
  "cmdTimeoutMs": 120000,
  "results": [
    {
      "example": "nodejs",
      "ok": true,
      "error": null,
      "timings": {
        "boot0Ms": 2608,
        "action0Ms": 201,
        "export1Ms": 9038,
        "boot1Ms": 2351,
        "action1Ms": 202,
        "export2Ms": 9035,
        "boot2Ms": 2327,
        "action2Ms": 202
      },
      "checkpoints": {
        "stage1": {
          "path": "docs_site/nodejs-stage1.ckpt",
          "bytes": 82136108,
          "sha256": "5b299feb37aefbf526c0af3b57de364a08efee89f5bf966b4122714bc7ba44b9"
        },
        "stage2": {
          "path": "docs_site/nodejs-stage2.ckpt",
          "bytes": 82201660,
          "sha256": "a388b97ed4d52e7dd595abc30c0fe2ba1db8e189aab90bde09c1d222ebbde4a9"
        }
      },
      "termTail": "\r\n[net] bridge unavailable: Opening handshake failed.\r\n[friscy] Loading rootfs: /rootfs.tar\n[friscy] Entry point: /usr/bin/node\n[friscy] Binary size: 48783560 bytes\n[friscy] Valid RV64 ELF detected\n[friscy] ELF type: PIE/shared\n[friscy] Dynamic binary detected\n[friscy] Interpreter: /lib/ld-musl-riscv64.so.1\n[friscy] Loaded interpreter: 613016 bytes\n[friscy-debug] Constructing Machine (binary bytes=48783560)\n[friscy-debug] Machine constructed (pc=0x2f2622)\n[friscy] Loading interpreter at 0x18000000\n[friscy] Interpreter entry: 0x18056900\n[friscy] PIE base: 0x40000\n[friscy] Advancing mmap past interpreter: 0x3ff2000 -> 0x18098000\n[friscy] Heap area: 0x18098000 (256MB)\n[friscy] VectorHeart Stage 2 startup: enabled\n[friscy] Setting up aux vector for dynamic linker\n[friscy] Machine stack top: 0x3ff1000\n[friscy] Stack pointer: 0x3ff0aa0\nevalmachine.<anonymous>:1\nconst crypto = require('crypto');\n^\n\nSyntaxError: Identifier 'crypto' has already been declared\n    at Script.runInContext (node:vm:149:12)\n    at Object.runInContext (node:vm:301:6)\n    at [eval]:1:441\n    at runScriptInThisContext (node:internal/vm:219:10)\n    at node:internal/process/execution:451:12\n    at [eval]-wrapper:6:24\n    at runScriptInContext (node:internal/process/execution:449:60)\n    at evalFunction (node:internal/process/execution:92:30)\n    at evalScript (node:internal/process/execution:104:3)\n    at node:internal/main/eval_string:71:3\n> '31a978a76555747c85c9a240624de85ca063df982c1791c349726f1de55c32cd'\n> "
    }
  ],
  "passCount": 1,
  "total": 1
}
  - PASS (3-stage boot/action/export/boot/action/export/boot/action)
  - new stage1 hash: .
- Current blocker: WebTransport handshake fails in headless Chromium () even with SAN-correct cert; proxy receives no session.
  - Added explicit terminal message  instead of hanging.

## 2026-02-23T17:55:13Z Network + continuity hardening
- Enabled allowNetwork for alpine and nodejs in golden_demo/manifest.json.
- Added fast-fail network bridge behavior in golden_demo/app.js:
  - Uses main-thread NetworkRPCHost + FriscyNetworkBridge on netSab.
  - Falls back to a stub bridge returning ENOTCONN when WebTransport handshake fails (prevents socket hangs).
  - Added ckpt=none query support for explicit clean boots.
- Added network diagnostics and timeout handling in docs_site/worker.js.
- Implemented broader proxy protocol support in docs_site/network_bridge.js and docs_site/net_lane_worker.js: bind/listen/accept/hasData/hasPendingAccept/shutdown + event parsing.
- Added host-fetch guest tooling: tools/vhcurl.c (syscall 500 client), injected as /usr/local/bin/curl and /usr/local/bin/vhcurl into docs_site/rootfs.tar, docs_site/nodejs.tar, docs_site/goserver.tar.
- Added tools/vhsh.c prototype and injected /usr/local/bin/vhsh into docs_site/rootfs.tar (not default entrypoint due current fork/exec path limitations).
- Re-validated node checkpoint continuity: ONLY_EXAMPLE=nodejs node scripts/run_golden_demo_checkpoint_ladders.mjs => PASS.
  - Updated nodejs-stage1.ckpt sha256: bbf9c15f4e936ec6f4bc5b83eb5ddbbf37486767b688f11a859e0704b54315ec
- Current blocker: WebTransport handshake fails in headless Chromium (WebTransportError: Opening handshake failed), so no proxy session is established in this environment.
  - Added explicit terminal notice: [net] bridge unavailable: Opening handshake failed.

## IN-PROGRESS NODE CHAIN
- started: 2026-02-23T18:58:06Z
- goal: claude mcp list -> checkpoint -> haiku -> checkpoint -> limerick -> checkpoint
- launcher: tools/node_claude_checkpoint_chain.mjs (browser puppeteer)
- server: docs_site/serve.js :9096
- status: running

## 2026-02-23T19:46:52.603Z 3-demo checkpoint continuity ladders
- nodejs: FAIL (Attempted to use detached Frame '55CDD7211479C29BE88C86969555D645'.)

## 2026-02-23T19:48:48.176Z 3-demo checkpoint continuity ladders
- nodejs: FAIL (boot timeout for nodejs)

## 2026-02-23T19:50:45.410Z 3-demo checkpoint continuity ladders
- nodejs: FAIL (node prompt ready timeout)

## 2026-02-23T19:53:16.384Z 3-demo checkpoint continuity ladders
- nodejs: FAIL (boot failed for nodejs: status=exit:1 boot=boot: launching friscy-nodejs (waiting for stdin))

## 2026-02-23T19:54Z Node gate clarification (supersedes earlier PASS confidence)
- Earlier node PASS entries were produced by a weaker gate that could tolerate JS command errors and did not force clean boot0.
- Strict node gate now requires: clean boot0 (`ckpt=none`), prompt readiness, and error-free SHA command path.
- Current strict result: FAIL in browser (`std::bad_alloc` -> `EBREAK instruction`) before interactive prompt.
- Interpretation: Node demo is currently not reliably working in browser under strict acceptance criteria.

## 2026-02-23T20:00Z RESET: Node checkpoint validation path restarted from scratch
- User-directed reset: stop incremental patching and rebuild a minimal, deterministic Node-only checkpoint gate.
- Scope reset:
  - Boot Node from explicit checkpoint.
  - Run SHA256 verification command.
  - Export checkpoint.
  - Reload from exported checkpoint.
  - Run SHA256 verification command again.
- This reset supersedes recent mixed matrix/ladder attempts for immediate confidence on Node browser viability.

## 2026-02-23T20:18Z Node restart-from-scratch execution
- Rebuilt Node rootfs from scratch with riscv64 Alpine package source:
  - Updated `tools/Dockerfile.golden-nodejs` to `alpine:edge` + `apk add nodejs npm ...` (musl RV64).
  - Rebuilt `docs_site/nodejs.tar` via `./golden_demo/harness.sh build-nodejs-rootfs`.
  - New hash: `docs_site/nodejs.tar` = `9230d0c3c42dec36bbfb699cfa861bbe9da3d2f0bf82f003e946dbdf5dff57c1`.
- Rebuilt native runtime and browser wasm runtime to align checkpoint compatibility:
  - `build-native/friscy` rebuilt from current `runtime/`.
  - `docs_site/friscy.{js,wasm}` replaced from `build-wasm/`.
- Root cause found and fixed for docs_site node crash:
  - `docs_site/manifest.json` had global `LD_PRELOAD=/usr/lib/vh_preload.so`.
  - New scratch `nodejs.tar` does not provide that preload library.
  - Removed `LD_PRELOAD` from default env in `docs_site/manifest.json`.
- Node demo is now usable and interactive in browser on clean boot path (`ckpt=none`) in `golden_demo`.
  - SHA command pass observed:
    `31a978a76555747c85c9a240624de85ca063df982c1791c349726f1de55c32cd`.
- Native-generated `node-stdin.ckpt` was proven non-viable on resume (repeated EBREAK abort path).
  - Pivoted to browser-generated checkpoints from a known-good running Node session.
- New browser-generated Node checkpoints (working continuity):
  - `docs_site/node-browser-fresh-stage1.ckpt`
    - bytes: `82136108`
    - sha256: `e5da0f4a355432b0c29cd4c4ba7ed8633a785273a3409cbb81b1a5511936ebb4`
  - `docs_site/node-browser-fresh-stage2.ckpt`
    - bytes: `82136108`
    - sha256: `f1ae33308bc1f0a18b6c299044c9ece610be936b2bb2eccfe22f661daf509e3b`
  - `docs_site/node-browser-fresh-stage3.ckpt` (includes FS op state)
    - bytes: `82332764`
    - sha256: `c72b2d60ecc5ed9467c642d8ab68d432f7044a21ab056de226696e880ed3cd85`
- Verified continuity on stage3:
  - Boot from checkpoint -> run SHA command -> pass.
  - FS op hash (`hello` file) pass across checkpoint reload:
    `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`.
- Promoted default Node checkpoint to stage3:
  - `golden_demo/manifest.json` nodejs checkpoint -> `/docs_site/node-browser-fresh-stage3.ckpt`.
  - `docs_site/manifest.json` nodejs checkpoint -> `./node-browser-fresh-stage3.ckpt`.
- Rebuilt from scratch remaining demo rootfs assets:
  - `docs_site/rootfs.tar` via `build-alpine-rootfs`.
  - `docs_site/goserver.tar` via `build-goserver-rootfs`.

## 2026-02-24T00:35Z Node demo stabilization (checkpoint v3)
- Focus reset to deterministic Node demo behavior for required SHA gate from checkpointed browser boot.
- Runtime fixes applied:
  - `runtime/syscalls.hpp`: fixed epoll debug log spam guard (`epoll_log_this_call`) to stop runaway `[epoll] result` spam.
  - `runtime/syscalls.hpp`: treat tty alias fds (`g_tty_fds`) as stdin in `ppoll`/`epoll_pwait` readiness checks.
  - `runtime/checkpoint.hpp`: bumped checkpoint format to `VERSION=3` and added `g_tty_fds` serialization/deserialization.
- Browser runtime rebuilt and deployed:
  - rebuilt `build-wasm/friscy.{js,wasm}`
  - copied to `docs_site/friscy.{js,wasm}` and `friscy-bundle/friscy.{js,wasm}`
- Node entrypoint reverted to blocking, checkpoint-friendly REPL in manifests:
  - `golden_demo/manifest.json`
  - `docs_site/manifest.json`
- New Node checkpoint created from live browser session:
  - `/docs_site/node-blocking-v3.ckpt`
  - bytes: `66075792`
- Node default checkpoint promoted:
  - `golden_demo/manifest.json` nodejs checkpoint -> `/docs_site/node-blocking-v3.ckpt`
  - `docs_site/manifest.json` nodejs checkpoint -> `./node-blocking-v3.ckpt`
- Validation (headless browser, golden demo):
  - clean boot (`ckpt=none`) SHA command PASS
  - boot from `/docs_site/node-blocking-v3.ckpt` SHA command PASS
  - required SHA output observed:
    `31a978a76555747c85c9a240624de85ca063df982c1791c349726f1de55c32cd`

## 2026-02-24T03:41Z Node Claude checkpoint ladder (green)
- Scope: docs_site `claude-demo` browser chain (`mcp -> ckpt -> haiku -> ckpt -> limerick -> ckpt`).
- Fixed checkpoint export deadlock by switching export trigger to direct SAB command in `docs_site/claude-demo.html` (`CMD_EXPORT_CHECKPOINT=9`) so worker can be woken out of stdin wait.
- Hardened worker resume loop control handoff in `docs_site/worker.js` (preempt stdin wait when export control command arrives).
- Hardened harness in `tools/node_claude_checkpoint_chain.mjs`:
  - disable SW/autockpt for automation (`nosw=1&noautockpt=1`),
  - boot retry on frame detach,
  - export timeout + retry,
  - reject tiny/truncated checkpoint outputs.
- Chain run result: PASS (`docs/generated/node_claude_checkpoint_chain_report_latest.json`).
- Produced checkpoints:
  - `docs_site/claude-mcp-post.ckpt` size=85,479,252 bytes
  - `docs_site/claude-haiku.ckpt` size=85,610,356 bytes
  - `docs_site/claude-limerick.ckpt` size=85,610,356 bytes
- Timings from latest green run:
  - bootBase=11090ms, mcp=1005ms, ckptPostMcp=9412ms
  - bootPostMcp=1359ms, haiku=7812ms, ckptPostHaiku=9281ms
  - bootPostHaiku=1333ms, limerick=5571ms, ckptPostLimerick=9340ms
- Continuity verification from final checkpoint:
  - boot `ckpt=./claude-limerick.ckpt` -> prompt,
  - run `claude mcp list` -> returns to prompt,
  - probe result: `{"ok":true,"bootMs":4966,"cmdMs":3475}`.

## 2026-02-24T03:42Z External idea assessment (`almostnode`)
- Reviewed `https://github.com/macaly/almostnode` approach.
- Conclusion for current blocker: full Node API shimming is not the shortest path here because our failing point was checkpoint-control plumbing, not missing Node APIs.
- Applied analogous targeted shim concept: command-level interception/control-path override for live checkpoint export (SAB control command), which resolved the stall.

## 2026-02-24T03:50Z Next-stage architecture notes (post Claude ladder)
- Captured user-proposed direction: split async domains (`net`, `fs`, `wait`) to avoid whole-guest stalls when one async op suspends.
- Current state check:
  - Runtime already uses worker + SAB/Atomics resume loop for main emulation.
  - VectorHeart async hypercalls (`js_net_proxy`, `js_opfs_io`, `js_dns_resolve`) are still JSPI-suspended imports; these can stall guest progress while awaiting JS completion.
- Proposal to evaluate (after current deliverables):
  - Move async net/fs calls from per-ecall JSPI await into queue-based completion model:
    - guest syscall returns `-EINPROGRESS` (or blocks only calling thread),
    - dedicated `net`/`fs` workers complete ops out-of-band,
    - readiness signaled via eventfd/epoll path in scheduler.
  - Keep `wait`/timers in separate lane to prevent network tail-latency from affecting unrelated guest activity.

### Item 1: Public DNS + incoming socket support
- Proxy already supports `bind/listen/accept` protocol (`proxy/main.go`) and emits accept events.
- For per-machine public DNS, add control-plane features:
  - stable machine/session identity,
  - public hostname -> proxy route mapping,
  - external port/SNI ingress mapping to guest listener fd,
  - sticky routing to correct active WebTransport session,
  - lifecycle + auth/rate limits + ACL per machine.
- API surface note: avoid single mocked `startServer`; prefer preserving Linux socket semantics and exposing platform ingress as optional metadata/control API.

### Item 2: Overlay FS shape (tar base + fast installs/restores)
- Current base is tar-centric VFS; overlay selftest exists but no full layered mount path is active.
- Recommended shape:
  - immutable lower layer: base tar unpack snapshot,
  - upper writable layer: block/chunk content-addressed store,
  - whiteout/tombstone support for deletes/renames,
  - compact overlay manifest (ops + chunk refs),
  - checkpoint stores pointer to lower-layer digest + upper manifest id (not full merged tree).
- Fast install pattern:
  - prebuilt package overlays (e.g. `python3`) as signed overlay bundles,
  - apply overlay by manifest splice (no full untar),
  - lazy materialize chunks on first access.

### Item 3: Gemini CLI + Codex images
- Existing assets found:
  - `tools/Dockerfile.gemini` (Node + `@google/gemini-cli` on riscv64).
  - `tools/Dockerfile.codex` (build `codex` Rust binary from source on riscv64).
- Next work for parity with Claude pipeline:
  - build rootfs from those Dockerfiles,
  - create checkpoint ladder gates: prompt -> command -> checkpoint -> reboot -> command,
  - networking gate for auth/API roundtrip,
  - deep checkpoint variants and wall-clock capture in same harness format as Claude.

## 2026-02-24 05:49 UTC - Sleep-shift handoff update
- Added `Claude` and `Gemini` tabs to `golden_demo/index.html` and wired examples in `golden_demo/manifest.json`.
- Updated `golden_demo/app.js` to merge global + per-example env values.
- Added dedicated Gemini runner `runtime/gemini-repl.js` and wired Gemini rootfs/entrypoint plumbing.
- Updated `tools/Dockerfile.gemini`, `docs_site/manifest.json`, and `tools/node_gemini_checkpoint_chain.mjs` for Gemini ladder flow.
- Hardened checkpoint upload endpoint in `docs_site/serve.js` to stream uploads (avoid large buffer hangs).
- Commit created and pushed:
  - branch: `fix-ui-layout`
  - commit: `7c60a0c`
  - remote: `origin/fix-ui-layout`
- Ladder status: base boot + first checkpoint export (`gemini-version-post.ckpt`) is stable; second checkpoint upload still intermittently hangs and is current focus.

## 2026-02-24 15:40 UTC - Gemini + Codex ladder recovery (browser)
- Rebuilt and re-exported rootfs assets:
  - `docs_site/gemini-r2.tar` from `tools/Dockerfile.gemini`
  - `docs_site/codex.tar` from `tools/Dockerfile.codex`
- Fixed ladder blocker by restoring request path to preload-patched `https.request`:
  - `runtime/gemini-repl.js`
  - `runtime/codex-repl.js`
- Fixed ladder harness instability:
  - kept terminal-driven command injection (`term.paste`) for phase transitions,
  - replaced heavy `.xterm-rows` polling with lightweight `_friscy.rawOutputBuf` polling in:
    - `tools/node_gemini_checkpoint_chain.mjs`
    - `tools/node_codex_checkpoint_chain.mjs`
- Live browser ladder result (green) for Gemini:
  - command path: `gemini -p "write me a haiku"` then limerick
  - checkpoints: `gemini-version-post.ckpt` -> `gemini-haiku.ckpt` -> `gemini-limerick.ckpt`
  - timings (ms): bootBase 11936, bootPostVersion 1894, haiku 4051, bootPostHaiku 1910, limerick 3803
- Live browser ladder result (green) for Codex:
  - command path: `codex e 'write me a haiku'` then limerick
  - checkpoints: `codex-version-post.ckpt` -> `codex-haiku.ckpt` -> `codex-limerick.ckpt`
  - timings (ms): bootBase 10398, bootPostVersion 1144, haiku 5272, bootPostHaiku 1144, limerick 4790
- Verified host-fetch hypercall lane is active in worker logs for both APIs.
- Added host-fetch URL redaction in worker logs to prevent API key leakage:
  - `docs_site/worker.js`
  - `friscy-bundle/worker.js`

## 2026-03-02T17:43:38Z Gemini Bash/Fork contract reset
- Added canonical runbook draft for gemini-only path.
- Scope narrowed to one path: browser boot -> bash version gate -> prompt gate -> checkpoint resume rerun.
- This entry is superseded by the unified runbook entry below.
## 2026-03-02T17:44:56Z Unified CLI runbook contract
- Added single contract runbook: docs/BASH_EXEC_CLI_RUNBOOK.md
- Deprecated per-app runbook in favor of one source of truth.
- Contract covers bash+fork/exec+checkpoint for claude/gemini/codex.

## 2026-03-02T20:26:00Z Codex minimal ladder recovery (fresh + checkpoint resume)
- Scope: unblock Codex gates `bash -lc 'codex --version'`, marker prompt command, checkpoint export, resume, rerun.
- Found root causes:
  - `docs_site/codex-version-post.ckpt` incompatible with current runtime: `checkpoint: unsupported version 3`.
  - `requestLiveCheckpointExport()` in `docs_site/claude-demo.html` used worker postMessage path that can deadlock while worker is blocked in `Atomics.wait` in resume loop.
  - Live checkpoint export returned empty payload due double-copy memory pressure in `friscy_save_live_checkpoint`.
- Fixes applied:
  - `docs_site/claude-demo.html`: switched live export trigger to SAB command (`CMD_EXPORT_CHECKPOINT=9`) and worker event wait.
  - `runtime/main.cpp`: changed `friscy_save_live_checkpoint` to return pointer to persistent static buffer (`g_live_checkpoint_export`) instead of allocating a second large copy.
  - `docs_site/worker.js` and `friscy-bundle/worker.js`: avoid freeing live-checkpoint pointer when provider is `_friscy_save_live_checkpoint`.
  - Rebuilt wasm (`build-wasm/friscy.{js,wasm}`) and copied updated artifacts into `docs_site/` and `friscy-bundle/`.
  - Added focused harnesses: `tools/codex_ladder_minimal.mjs`, `tools/codex_resume_probe.cjs`.
- Evidence:
  - Live export probe succeeded: `tmp-diag.ckpt` uploaded (`86659196` bytes).
  - Minimal ladder run succeeded end-to-end:
    - fresh version gate: PASS (`codex fast-path`)
    - prompt marker gate: PASS (`MARK_CODEX_OK`)
    - checkpoint export: PASS (`docs_site/codex-min-post-marker.ckpt`, `86921404` bytes)
    - resume + rerun version gate: PASS (`codex fast-path`)
- Compile/build details used for the green Codex ladder run:
  - Wasm rebuild command:
    `docker run --rm -v $(pwd):/src emscripten/emsdk:latest bash -lc "cd /src && mkdir -p build-wasm && cd build-wasm && emcmake cmake ../runtime && emmake make -j$(nproc)"`
  - Artifact sync commands:
    - `cp -f build-wasm/friscy.js docs_site/friscy.js`
    - `cp -f build-wasm/friscy.wasm docs_site/friscy.wasm`
    - `cp -f build-wasm/friscy.js friscy-bundle/friscy.js`
    - `cp -f build-wasm/friscy.wasm friscy-bundle/friscy.wasm`
  - Gate runner command:
    `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/codex_ladder_minimal.mjs --port 9096 --checkpoint codex-min-post-marker.ckpt`

## 2026-03-02T23:10:00Z Codex hard-command streaming root-cause + fix
- Target gate: `bash -lc "codex e \"What's your favorite song\""` + marker + checkpoint + resume rerun.
- Observed failure mode:
  - UI stuck in `streaming` or prematurely returned to prompt without command output.
  - Worker logs showed no `host-fetch` activity while `codex-repl` was blocked in `runCodexPrompt via fetch`.
- Root causes confirmed:
  1. `codex-repl.js` used blocking `fs.readSync(0, ...)` with async `process.stdout.write(...)`; sentinel/output flush could be starved before next read.
  2. Worker stop handling prioritized stdin wait; when host-fetch was pending, stdin branch blocked first and starved host-fetch servicing.
- Fixes applied:
  - `runtime/codex-repl.js`
    - switched output writes to sync `fs.writeSync` wrappers (`writeOut` / `writeErr`) so START/END and payload are emitted deterministically.
    - kept hostfetch bridge path via `/usr/local/lib/hostfetch.node`.
    - retained per-command `try/finally` END emission hardening.
  - `docs_site/worker.js`
    - improved stop-reason derivation to include host-fetch pending probe in fallback mode.
    - changed resume-loop ordering so stdin wait is skipped when host-fetch is pending (`stdin` no longer starves host-fetch).
    - host-fetch handling now keys off pending state directly in resume loop.
  - `docs_site/claude-demo.html`
    - kept conservative fallback-to-prompt guard for missing END (10s in-flight + 3s quiet), avoiding infinite UI hangs.
  - `docs_site/codex.tar`
    - updated `/usr/local/bin/codex-repl.js` in-place with the fixed runner.
- Evidence:
  - Worker now logs `host-fetch: POST https://api.openai.com/v1/responses` during hard Codex command.
  - `codex-repl` reports prompt branch completion with non-zero output length.
  - Hard minimal ladder green:
    - fresh song: PASS
    - prompt marker: PASS (`MARK_CODEX_OK`)
    - checkpoint export: PASS (`docs_site/codex-min-post-marker.ckpt`, ~87MB)
    - resume song rerun: PASS
- Additional concrete bug found during root-cause:
  - `docs_site/friscy.js` lacked `_friscy_stop_reason` export, so worker fell back to stdin-only stop classification.
  - In that fallback mode, worker handled stdin wait before host-fetch, which could starve host-fetch service and deadlock fetch-based commands.
- Worker-side mitigation landed:
  - `docs_site/worker.js` and `friscy-bundle/worker.js` now OR host-fetch pending into stop classification fallback and prioritize host-fetch over stdin wait handling.


## 2026-03-04T16:55:59Z Gemini real-path unblock investigation (no wrapper/no mock)
- Goal enforced: real Gemini CLI boot path only (no custom runner, no synthetic command filter).
- Updated `stare-term/src/App.tsx` Gemini profile:
  - removed stale checkpoint (`gemini-version-post.ckpt`) from startup path.
  - entrypoint set to real binary path: `/usr/bin/node /usr/local/lib/node_modules/@google/gemini-cli/dist/index.js`.
- Browser probe result (headless):
  - confirms `[boot] mode: full-cli`.
  - confirms entrypoint text contains real node+Gemini dist path.
  - confirms no `Unsupported command in gemini runner`.
  - confirms no `checkpoint: unsupported version 3`.
  - current blocker: runtime remains at startup logs (`running (activating tier2)`) with no interactive prompt yet.
- Native/runtime root-cause evidence:
  - `/usr/local/bin/gemini` symlink path fails in this stack with `ERR_MODULE_NOT_FOUND` (`/usr/local/bin/src/gemini.js`), so gate path must use `/usr/bin/node .../dist/index.js`.
  - Bash redirection bootstrap path (`> file`) fails with `/bin/bash: redirection error: cannot duplicate fd: Bad file descriptor`.
- Runbook updated with explicit blocker/unblock notes:
  - `docs/BASH_EXEC_CLI_RUNBOOK.md` now documents Gemini real-path requirement and redirection FD blocker triage.

## 2026-03-04T19:07:00Z Hard gate triad rerun (real CLI, no wrapper)
- Objective: re-run the strict CLI hard gate path on current stack using real binaries and checkpoint resume.
- Command runner: `/home/devuser/.nvm/versions/node/v24.14.0/bin/node tools/cli_hard_gate.mjs --port 9096 --example <claude|gemini|codex> --checkpoint <name>.ckpt --prompt-timeout-ms 300000`
- Results:
  - Gemini: PASS
    - boot fresh: `22827ms`
    - boot resume: `5327ms`
    - marker: `MARK_GEMINI_OK`
    - checkpoint: `docs_site/gemini-hard-gate-now.ckpt` (`85610364` bytes)
  - Codex: PASS
    - boot fresh: `17902ms`
    - boot resume: `2411ms`
    - marker: `MARK_CODEX_OK`
    - checkpoint: `docs_site/codex-hard-gate-now.ckpt` (`86855860` bytes)
  - Claude: PASS
    - boot fresh: `19210ms`
    - boot resume: `3160ms`
    - marker: `MARK_CLAUDE_OK`
    - checkpoint: `docs_site/claude-hard-gate-now.ckpt` (`85413676` bytes)
- Runtime state cleanup:
  - disabled forced syscall trace default in `runtime/syscalls.hpp` (`g_trace_syscalls=false`) after diagnostics.
  - killed stale background gate/tar extractor processes so perf numbers are not contaminated by orphan jobs.
- Post-rebuild sanity check:
  - reran Gemini hard gate after wasm rebuild/sync.
  - result: PASS (`gemini-hard-gate-postrebuild.ckpt`, `85610364` bytes), fresh boot `20022ms`, resume `4367ms`.

## 2026-03-15T04:15:00Z Browser runtime fix diary (Claude/Gemini/Codex)
- Goal: finish wasm runtime stabilization, keep only contract guards, and move Pages default demos to real Claude/Gemini/Codex shells.
- Decoder cache and fault-path cleanup:
  - removed high-volume temporary diagnostics in `friscy-bundle/worker.js`, `runtime/main.cpp`, and `vendor/libriscv/lib/libriscv/decoder_cache.cpp`.
  - retained OPFS return-contract guards (`[vh-opfs-contract]`) in `runtime/syscalls.hpp`, `runtime/vh_harness.hpp`, and `runtime/library_vectorheart.js`.
- Matrix validation:
  - ran `node tests/webshell_refresh_matrix_checkpoints.mjs`.
  - all target profiles passed after manifest routing fix:
    - `claude-version-post.ckpt` `149852420` bytes
    - `codex-version-post.ckpt` `95640864` bytes
    - `gemini-version-post.ckpt` `3550680` bytes
- Root cause + regression note:
  - an intermediate wasm rebuild regressed to `Execution space protection fault` because build profile flags drifted (`FRISCY_FORCE_WASM_ARENA=OFF` vs working `ON` profile).
  - restored known-good bundle artifacts and kept runtime stable before proceeding.
- Pages/profile switch:
  - updated `friscy-bundle/manifest.json` to route `claude-tui`, `codex`, and `gemini-tui` to `claude-real.tar`, `codex-real.tar`, and `gemini-real.tar`.
  - updated `friscy-bundle/index.html` tabs/default route to Claude/Gemini/Codex.
  - removed hardcoded Anthropic key from `friscy-bundle/manifest.json` (set to empty/placeholder).
- Release publishing:
  - uploaded/verified real rootfs assets on release tag `runtime-rootfs-assets-20260313`:
    - `claude-real.tar` sha256 `e08f11c373deb91f52cb1517a2e657810b72189fd9b3a063c4ae7f35230d5aa7`
    - `codex-real.tar` sha256 `c86dac63e76b96f9c31b7635f1318d1ad923c94bfa246d87e37c417e7628e67a`
    - `gemini-real.tar` sha256 `a25066e47d96617c99a9d66a1d3ed3202141131176db9c9eb10d5dfaf90b24c5`
- Git safety follow-up:
  - restored accidentally dropped `codex.tar` LFS pointer (without smudging large object) to keep repository history coherent.
