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
