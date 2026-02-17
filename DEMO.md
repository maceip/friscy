# friscy Web Demo

Live demo: RISC-V emulator running Node.js in the browser, making a real Claude API call over HTTPS.

**What it does:** Boots Alpine Linux (RISC-V) in a WebAssembly emulator, runs `claude-fast.js` inside Node.js (with V8 snapshot), resolves DNS via c-ares, connects to `api.anthropic.com` through a WebTransport proxy, and prints a haiku.

## Files Required

### Emulator (friscy-bundle/)

| File | Size | Description |
|------|------|-------------|
| `index.html` | 106K | Main web shell with tabs, xterm.js terminal, Worker + SAB setup |
| `friscy.wasm` | 527K | Emscripten-compiled RISC-V emulator (LFS) |
| `friscy.js` | 124K | Emscripten JS glue |
| `worker.js` | 25K | Web Worker entry point — runs emulator off main thread |
| `service-worker.js` | 5K | Injects COOP/COEP headers for SharedArrayBuffer |
| `manifest.json` | 2K | Example configs (rootfs, entrypoint, env, API key) |
| `network_bridge.js` | 20K | WebTransport client — bridges emulator TCP to proxy |
| `network_rpc_host.js` | 7K | Main-thread RPC handler for worker network requests |
| `serve.js` | 3K | Local dev HTTP server with CORS + cross-origin isolation |
| `jit_manager.js` | 40K | Optional AOT JIT compiler manager |
| `rv2wasm_jit.js` | 8K | JIT compiler JS bindings |
| `rv2wasm_jit_bg.wasm` | 288K | JIT compiler Wasm module (LFS) |
| `claude-slim-snap.tar` | 104M | Rootfs: Alpine + Node.js + claude-fast.js + V8 snapshot (LFS) |

### Icons (friscy-bundle/)

| File | Description |
|------|-------------|
| `alpine-icon.svg` | Alpine tab icon |
| `nodejs-icon.svg` | Node.js tab icon |
| `go-icon.svg` | Go Server tab icon |
| `riscv-logo.jpg` | Header logo |

### Proxy (proxy/)

| File | Size | Description |
|------|------|-------------|
| `friscy-proxy-linux` | 13M | Pre-built WebTransport proxy binary (Go) |
| `main.go` | — | Proxy source code |
| `testdata/cert.pem` | — | Self-signed TLS cert for local proxy |
| `testdata/key.pem` | — | TLS private key |

## How to Run

### 1. Start the WebTransport proxy

The proxy bridges TCP connections from the browser emulator to the internet (DNS, HTTPS).

```bash
cd proxy
./friscy-proxy-linux \
  --cert testdata/cert.pem \
  --key testdata/key.pem \
  --listen :4433
```

This listens on `https://localhost:4433/connect` for WebTransport connections.

### 2. Start the web server

```bash
node friscy-bundle/serve.js 8080
```

This serves `friscy-bundle/` with CORS headers and cross-origin isolation (COOP/COEP) enabled.

### 3. Open in browser

```
http://localhost:8080/index.html?example=claude
```

Click the **Claude** tab if not already selected.

### What happens

1. Service worker registers, page reloads for COOP/COEP headers
2. `claude-slim-snap.tar` (104MB) downloads — contains Alpine Linux + Node.js + claude-fast.js
3. Web Worker loads `friscy.wasm` (RISC-V emulator)
4. Emulator boots Node.js with V8 snapshot (~370M instructions)
5. `claude-fast.js` runs: DNS lookup → TLS handshake → HTTPS POST to `api.anthropic.com`
6. Claude API returns a haiku, printed to the xterm.js terminal
7. Process exits with code 0

### Expected output

```
[claude-fast] Starting with prompt: Write a haiku about RISC-V emulation running in WebAssembly
[claude-fast] Creating HTTPS request to api.anthropic.com...
[dns] lookup called for: api.anthropic.com family: 0
[dns] resolve4 callback: OK [ '160.79.104.10' ]
[claude-fast] TCP connected
[claude-fast] Got response: 200

<haiku text>

Process exited (code 0)
```

## Configuration

The API key and model are set in `manifest.json` under `examples.claude.env`:

```json
"env": ["ANTHROPIC_API_KEY=sk-ant-..."]
```

The prompt is the last argument in the entrypoint:

```json
"entrypoint": ["/usr/bin/node", "--jitless", "--snapshot-blob", "/tmp/snapshot-fast.blob", "--", "Write a haiku about RISC-V emulation running in WebAssembly"]
```

## Proxy alternatives

- **Local proxy:** `https://localhost:4433/connect` (auto-detected when serving from localhost)
- **Remote proxy:** `?proxy=https://your-server:4433/connect`
- **No proxy:** `?noproxy` (networking disabled — emulator still boots but API call fails)

## Git checkpoint

Commit `d620442` — all files needed for this demo are committed (large files via git LFS).
