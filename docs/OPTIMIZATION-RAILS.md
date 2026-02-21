# Optimization Rails — Making Everything We Built Actually Usable

## Current State Audit

| Optimization | Built? | Active in bundle? | Active in demos? |
|---|---|---|---|
| Tail-call dispatch | YES | YES (friscy.wasm = build-tailcall) | YES |
| JIT (rv2wasm) | YES | YES (default on, ?nojit to disable) | YES |
| Flat arena (31-bit) | YES | YES (baked in) | YES |
| Host-fetch hypercall | YES | YES (worker.js handles it) | YES |
| Cooperative threading | YES | YES | YES |
| V8 snapshot blob | YES | NO | Only demos/small |
| LLRT bytecode precompile | NO | NO | NO |
| Wizer "ready-state" snap | PARTIAL | NO | NO |
| OPFS persistence | NO | NO | NO |
| Cross-device sync | NO | NO | NO |
| LLRT tab in main bundle | NO | NO | Only demos/medium manifest |

## What to Wire Up

### 1. Add LLRT tab to friscy-bundle
- Add `<button class="tab" data-example="llrt">LLRT</button>` to index.html
- Add llrt config to friscy-bundle/manifest.json
- LLRT boots in ~5M instructions (vs 200M+ for Node.js) — instant feel

### 2. LLRT bytecode precompilation
- Run `llrt compile claude-repl-llrt.js claude-repl-llrt.lrt` on host
- Bundle the .lrt file in the rootfs instead of .js
- Entry becomes: `["/usr/local/bin/llrt", "/usr/local/bin/claude-repl-llrt.lrt"]`
- Saves parsing time (QuickJS bytecode deserialization vs JS parsing)

### 3. Session/overlay persistence (OPFS)
- overlay.js auto-saves VFS delta every 5s to OPFS
- On reload: base rootfs + overlay = restored state
- Session ID in URL: `?session=abc123`

### 4. Manifest-driven optimization profiles
Each example in manifest.json can declare which optimizations to enable:
```json
{
  "claude-llrt": {
    "rootfs": "./llrt-rootfs.tar",
    "entrypoint": ["/usr/local/bin/llrt"],
    "optimizations": {
      "jit": true,
      "jitHotThreshold": 500,
      "persistence": true,
      "autoSaveInterval": 5000,
      "sync": true,
      "hypercalls": ["host_fetch", "host_spawn"]
    }
  }
}
```

### 5. Hypercall registry (extensible)
Instead of hardcoding syscall 500 in worker.js, create a hypercall dispatch table:
```
500 = host_fetch (done)
501 = host_fs_write (OPFS direct write)
502 = host_fs_read (OPFS direct read)
503 = host_spawn (spawn second worker)
504 = host_crypto (Web Crypto API)
505 = host_snapshot (freeze/restore state)
```

### 6. VectorHeart split: Tier 1 (non-JSPI) + Tier 2 (JSPI late activation)

Goal: keep boot/checkpoint paths deterministic and cross-host friendly, then
enable async offload later when runtime is stable.

- **Tier 1 (always-on, non-JSPI):**
  - sync-friendly ops only (`gettime`, small compute/crypto helpers, cheap transforms)
  - must work in native and browser hosts
  - used during early boot and checkpoint capture
- **Tier 2 (late, JSPI-enabled):**
  - Promise-backed async ops (`fetch`, async OPFS/network bridges)
  - enabled only after runtime reaches a known-ready state
  - failure to enable must not break Tier 1 execution

Implementation notes:
- Add a `vh_caps` capability bitmask handshake (`VH_CAP_SYNC`, `VH_CAP_ASYNC`).
- Keep one VectorHeart API surface; dispatch by capability and runtime mode.
- Make Tier 2 installer idempotent (`install_once`) with explicit fallback logging.
- Stamp checkpoint metadata with mode (`pre-tier2` vs `post-tier2`) to avoid
  loading incompatible state in the wrong activation path.

Verification gates:

- **Gate A: Tier 1 parity (native + browser)**
  - Run same workload in both hosts using only Tier 1 ops.
  - Pass if output + exit code match and no JSPI-specific paths are touched.

- **Gate B: Checkpoint stability at Tier 1 cut point**
  - Capture checkpoint before Tier 2 activation.
  - Load/resume in browser and native.
  - Pass if resume reaches prompt/stdin-wait deterministically.

- **Gate C: Late Tier 2 activation safety**
  - From a Tier 1 checkpoint, enable Tier 2 and run smoke workload.
  - Pass if activation is one-shot, no crashes, and fallback path remains valid.

- **Gate D: No-regression fallback**
  - Force Tier 2 off (`VH_CAP_ASYNC=0` or runtime flag) on the same build.
  - Pass if Tier 1-only run remains functional with expected behavior.

- **Gate E: User-visible acceptance**
  - Browser flow: load checkpoint -> execute `claude mcp list` -> observe output.
  - Pass if round-trip output is returned and session remains interactive.

### 7. Tier 3: Colored workers + unused JIT cleanup

Goal: isolate expensive subsystems into dedicated worker lanes and remove
runtime complexity we are not actively using.

- **Colored workers (dedicated lanes):**
  - `net` worker: socket/WebTransport/host-fetch bridge
  - `wait` worker: epoll/wait timing and wake orchestration
  - `fs` worker: OPFS/VFS persistence, tar/overlay IO
  - optional `crypto` worker for coarse cryptographic offloads
- **Router contract:**
  - fixed op-code routing (`OP_NET_*`, `OP_WAIT_*`, `OP_FS_*`, `OP_CRYPTO_*`)
  - bounded queues + backpressure per lane
  - deterministic fallback to main worker path when a lane is unavailable
- **Shared invariants:**
  - no cross-lane mutable state without explicit message protocol
  - strict timeout/error mapping per lane
  - per-lane metrics (`queueDepth`, `latencyMs`, `errorRate`)

JIT scope reduction (for features we do not use now):
- keep the active JIT path only (baseline behavior used in current demos/tests)
- disable or remove optional predictors/schedulers/HUD toggles not used in
  the current acceptance flow
- keep feature flags to re-enable later without code archaeology

Tier 3 verification gates:
- **Gate T3-A: Lane isolation**
  - fault one lane (for example `net`) and verify `wait/fs` lanes keep working.
- **Gate T3-B: Latency sanity**
  - no regression in `time-to-prompt` and `claude mcp list` round-trip.
- **Gate T3-C: Fallback integrity**
  - with colored workers disabled, behavior matches baseline.
- **Gate T3-D: JIT simplification safety**
  - removing unused JIT branches does not change output correctness or exit code.
