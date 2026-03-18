# V1 Feature Decisions

## N-API Bridge Features
- [x] 1. Exception handling fix — IMPLEMENTED (commit 6cd8f37e)
- [ ] 2. JSPI async validation — DEFERRED
- [ ] 3. Handle scope hardening — DEFERRED

## Core Modules
- [x] 1. EventEmitter + Buffer + Streams — Foundation trio
- [x] 2. process object (env, cwd, stdio) — API keys, working directory, terminal I/O
- [x] 3. path + url + util — Already partially implemented, verify completeness

## Wasm Compilation Decisions

### 1. Shim strategy — CONSOLIDATE
Stop one-error-at-a-time. Restructure 44 fragmented headers into layered shims per subsystem (one base shim for types/constants, one per subsystem: fs, net, crypto, etc.) before continuing compilation work.

### 2. Module scope — WHITELIST ONLY
~12-15 modules Claude Code needs: fs, path, url, util, events, buffer, stream, crypto (subset), process, os (subset), net/tls (stubbed), child_process (stubbed). Stub remaining ~30 modules with "not available in WASM" throws. Cuts binary size and compilation surface dramatically.

### 3. Emscripten version — STAY ON 3.1.64
No upgrade mid-compilation. Get a working baseline first, then upgrade. JSPI deprecation is documented as known debt for Phase 2.

### 4. Build validation — RUNTIME INIT, NOT JUST ZERO ERRORS
Phase 1 exit criteria:
- Compiles to .wasm without errors
- Loads in browser/Node WASM host without trapping
- napi_create_string_utf8 + napi_get_value_string_utf8 round-trips
- Handle scope create/destroy succeeds

## Pending Questions
(Will update as more questions come in)
