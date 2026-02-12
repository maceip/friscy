# ExecPlan: Workstream B — Emscripten/Wasm Build + Browser Execution

## Progress

- [x] Cross-compile runtime to Wasm via Emscripten (`harness.sh`)
- [x] Generate friscy.js + friscy.wasm build artifacts
- [x] Implement friscy-pack to bundle rootfs + runtime into static site
- [x] Serve bundle in browser and boot Alpine shell
- [x] Validate with Node.js test harness (`test_node.js`)
- [x] Wire xterm.js terminal for interactive stdin/stdout

## Surprises & Discoveries

- Emscripten's `-sPROXY_TO_PTHREAD` was needed for the main execution loop
  to avoid blocking the browser's UI thread.
- MEMFS vs custom VFS: Emscripten's MEMFS could not handle tar-backed
  loading efficiently — keeping our custom VFS was the right call.
- Service worker caching made cold starts feel near-instant on repeat visits.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01 | Use Emscripten over wasm-bindgen | Existing C++ codebase; Emscripten handles pthreads, FS, async |
| 2025-01 | Bundle as static HTML | No server dependency; works on GitHub Pages, S3, or file:// |
| 2025-02 | Add service-worker.js | Offline support and faster repeat loads |

## Outcomes & Retrospective

Browser execution works end-to-end.  `friscy-pack alpine:latest` produces
a working self-contained bundle.  Performance is ~40% native in interpreter
mode.  The xterm.js integration provides a smooth interactive terminal.
