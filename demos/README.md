# friscy Demos

Three progressively complex demos of the RISC-V emulator running in the browser via WebAssembly.

All demos run the same emulator (`friscy.wasm`) in a Web Worker with SharedArrayBuffer for async I/O, and use a WebTransport proxy for network access.

## Quick Start (all demos)

```bash
# 1. Start proxy (required for networking)
cd proxy && ./friscy-proxy-linux --cert testdata/cert.pem --key testdata/key.pem --listen :4433

# 2. Start web server (from friscy-bundle/)
node friscy-bundle/serve.js 8081
```

## Demo Tiers

| Demo | What It Shows | URL |
|------|--------------|-----|
| **Small** | Single-shot Claude API call via `claude-fast.js` | `index.html?example=claude` |
| **Medium** | Streaming SSE agent REPL with 6 tools via `claude-repl.js` | `index.html?example=claude-demo` |
| **Large** | Full Claude Code UI skin + SWE-bench agent + e2e test | `claude-demo.html?example=claude-demo` |

### Small — claude-fast.js

Single HTTPS POST to `api.anthropic.com`, returns a haiku. Demonstrates: DNS resolution (c-ares), TLS handshake, V8 snapshot loading, WebTransport proxy bridging.

- ~370M instructions with V8 snapshot
- Set API key in `manifest.json` → `examples.claude.env`
- [Full README](small/README.md)

### Medium — claude-repl.js Streaming Agent

Interactive SWE-bench-style agent with streaming SSE, 6 tools (bash, read_file, write_file, search_files, list_dir, edit_file), multi-turn conversation, and an agent loop that executes tool calls inside emulated Alpine Linux.

- Streaming tokens arrive in real-time via SSE
- Up to 20 tool-use steps per prompt
- Sentinel protocol for host-emulator coordination
- [Full README](medium/README.md)

### Large — Claude Code Demo

The complete Claude Code experience. Everything from Medium, plus a pixel-perfect UI with welcome screen, slash commands, working animation, mode cycling, /login, /exit to shell, and a 21-check Puppeteer e2e test.

- `claude-demo.html` — dedicated full-screen Claude Code page
- API key masked input, Claude Code welcome box
- 21/21 Puppeteer e2e checks pass
- [Full README](large/README.md)

## File Organization

Each demo directory contains symlinks back to `friscy-bundle/` and `proxy/` — no files are duplicated. All three demos share the same emulator, rootfs, and proxy.

```
demos/
├── README.md          ← this file
├── small/             ← claude-fast.js single-shot API call
│   ├── README.md
│   └── (symlinks to friscy-bundle/ + proxy/)
├── medium/            ← claude-repl.js streaming SSE agent
│   ├── README.md
│   └── (symlinks to friscy-bundle/ + proxy/)
└── large/             ← full Claude Code UI + e2e test
    ├── README.md
    ├── test-claude-demo-e2e.cjs
    └── (symlinks to friscy-bundle/ + proxy/)
```
