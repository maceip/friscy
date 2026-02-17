# Small Demo: claude-fast.js — Single-Shot API Call

RISC-V emulator running Node.js in the browser via WebAssembly, making a real Claude API call over HTTPS through a WebTransport proxy. Boots Alpine Linux, resolves DNS via c-ares, connects to `api.anthropic.com`, and prints a haiku.

**Git checkpoint:** `d620442` / `bd46660`

## Files

### Emulator (all symlinked from friscy-bundle/)

| File | Size | Description |
|------|------|-------------|
| `index.html` | 106K | Web shell with tabs, xterm.js terminal, Worker + SharedArrayBuffer |
| `friscy.wasm` | 527K | Emscripten-compiled RISC-V emulator |
| `friscy.js` | 124K | Emscripten JS glue |
| `worker.js` | 25K | Web Worker — runs emulator off main thread |
| `service-worker.js` | 5K | Injects COOP/COEP headers for SharedArrayBuffer |
| `manifest.json` | 2K | Example configs (rootfs, entrypoint, env, API key) |
| `network_bridge.js` | 20K | WebTransport client — bridges emulator TCP to proxy |
| `network_rpc_host.js` | 7K | Main-thread RPC handler for worker network requests |
| `serve.js` | 3K | Local dev HTTP server with CORS + cross-origin isolation |
| `jit_manager.js` | 40K | AOT JIT compiler manager |
| `rv2wasm_jit.js` | 8K | JIT compiler JS bindings |
| `rv2wasm_jit_bg.wasm` | 288K | JIT compiler Wasm module |
| `claude-slim-snap.tar` | 104M | Rootfs: Alpine + Node.js + claude-fast.js + V8 snapshot |

### Proxy

| File | Description |
|------|-------------|
| `proxy/friscy-proxy-linux` | Pre-built WebTransport proxy binary (Go, 13M) |
| `proxy/main.go` | Proxy source code |
| `proxy/testdata/cert.pem` | Self-signed TLS cert |
| `proxy/testdata/key.pem` | TLS private key |

## How to Run

### 1. Start the WebTransport proxy

```bash
cd proxy
./friscy-proxy-linux \
  --cert testdata/cert.pem \
  --key testdata/key.pem \
  --listen :4433
```

### 2. Set your API key in manifest.json

Edit `manifest.json`, find the `"claude"` example, replace `YOUR_API_KEY_HERE`:

```json
"env": ["ANTHROPIC_API_KEY=sk-ant-..."]
```

### 3. Start the web server

```bash
node serve.js 8081
```

### 4. Open in browser

```
http://localhost:8081/index.html?example=claude
```

Click the **Claude** tab if not already selected.

## What Happens

1. Service worker registers, page reloads with COOP/COEP headers
2. `claude-slim-snap.tar` (104MB) downloads — Alpine Linux + Node.js + claude-fast.js
3. Web Worker loads `friscy.wasm` (RISC-V emulator)
4. Emulator boots Node.js with V8 snapshot (~370M instructions)
5. `claude-fast.js` runs: DNS lookup → TLS handshake → HTTPS POST to `api.anthropic.com`
6. Claude API returns a haiku, printed to the xterm.js terminal
7. Process exits with code 0

## Expected Output

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

## Architecture

```
Browser (main thread)          Web Worker
┌─────────────────┐         ┌──────────────────┐
│ xterm.js        │  SAB    │ friscy.wasm      │
│ ring buffer poll│◄───────►│ RISC-V emulator  │
│ (4ms interval)  │         │   └─ Node.js     │
│                 │         │     └─ claude-fast│
│ network_bridge  │  RPC    │     └─ https.req  │
│ (WebTransport)  │◄───────►│     └─ DNS/TLS   │
└────────┬────────┘         └──────────────────┘
         │ WebTransport
         ▼
┌─────────────────┐
│ friscy-proxy    │
│ (Go, port 4433) │
│ TCP passthrough │
└─────────────────┘
```

## Performance

~370M instructions with V8 snapshot, ~480M without. API call completes in ~111 resume cycles in browser.
