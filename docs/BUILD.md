# Building friscy — 31-bit Arena Environment

How to reproduce the exact WebAssembly build environment used for friscy development and testing.

## Prerequisites

- Docker (for Emscripten SDK)
- Git
- Node.js 23+ (for running dev builds; 22 lacks exnref/JSPI support)

## Quick Start

```bash
git clone <repo-url> friscy-standalone
cd friscy-standalone
tools/harness.sh            # development build
tools/harness.sh --production  # production build (O3, LTO, SIMD, single-file)
```

This clones libriscv into `vendor/libriscv` (if not already present), then builds via Docker using `emscripten/emsdk:latest`.

Output: `runtime/build/friscy.js` + `runtime/build/friscy.wasm` (dev) or single `friscy.js` (production).

## Build Tuples

### Emscripten SDK

| Parameter | Value |
|-----------|-------|
| Docker image | `emscripten/emsdk:latest` |
| Verified version | 5.0.0 (`a7c5deabd7c88ba1c38ebe988112256775f944c6`) |

### RISC-V ISA Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| `RISCV_64I` | ON | 64-bit base integer ISA |
| `RISCV_EXT_A` | ON | Atomics |
| `RISCV_EXT_C` | ON | Compressed instructions (2-byte opcodes) |
| `RISCV_EXT_F` | ON | Single-precision FP |
| `RISCV_EXT_D` | ON | Double-precision FP |
| `RISCV_EXT_V` | OFF | Vector (not needed) |

This is **RV64GC** — the standard general-purpose profile.

### Memory / Arena Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| `RISCV_ENCOMPASSING_ARENA` | ON | Pre-allocate full guest address space |
| `RISCV_ENCOMPASSING_ARENA_BITS` | **31** | 2^31 = **2 GB** guest address space |
| `RISCV_FLAT_RW_ARENA` | ON | O(1) read/write via direct pointer arithmetic |
| `RISCV_MEMORY_TRAPS` | OFF | Disabled for performance |
| `INITIAL_MEMORY` | 3,221,225,472 | **3 GB** (2 GB arena + emscripten overhead) |
| `MAXIMUM_MEMORY` | 4,294,967,296 | **4 GB** (wasm32 ceiling) |
| `ALLOW_MEMORY_GROWTH` | ON | Grow from 3 GB up to 4 GB |
| `STACK_SIZE` | 1,048,576 | 1 MB Emscripten stack |
| `SHARED_MEMORY` | 1 | SharedArrayBuffer for Worker communication |
| `PTHREAD_POOL_SIZE` | 0 | No pthread workers (we manage our own) |

### Dispatch / Interpreter

| Parameter | Value | Notes |
|-----------|-------|-------|
| `RISCV_THREADED` | ON | Computed-goto dispatch (~30-40% faster than switch) |
| `RISCV_TAILCALL_DISPATCH` | OFF | `musttail` not supported in Wasm |
| `RISCV_BINARY_TRANSLATION` | OFF | No `dlopen` in Wasm; tested 7x slower anyway |
| `RISCV_MAX_EXECUTE_SEGS` | 1024 | Node.js dynamically links 16+ .so files |

### Compiler Flags (Emscripten)

**Compile flags (ALL translation units, including libriscv):**

```
-matomics -mbulk-memory
```

These are set globally in `CMAKE_CXX_FLAGS` / `CMAKE_C_FLAGS` and are required by `-sSHARED_MEMORY=1`.

**Compile flags (friscy target, dev build):**

```
-O2 -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0 -msimd128 -mbulk-memory
```

**Compile flags (friscy target, production):**

```
-O3 -flto -fno-rtti -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0 -msimd128 -mbulk-memory -mnontrapping-fptoint -DNDEBUG
```

**Link flags (shared between dev/production):**

```
-fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0 -sSUPPORT_LONGJMP=0
-sSHARED_MEMORY=1 -sPTHREAD_POOL_SIZE=0
-msimd128 -mbulk-memory
-sALLOW_TABLE_GROWTH -sINITIAL_MEMORY=3221225472 -sALLOW_MEMORY_GROWTH
-sMAXIMUM_MEMORY=4294967296 -sSTACK_SIZE=1048576
-sEXPORT_ES6=1 -sMODULARIZE=1
```

**Additional link flags (production only):**

```
-O3 -flto --closure=1 -sWASM_BIGINT -sENVIRONMENT=web,worker -sSINGLE_FILE
```

### Exported Functions

```
_main _malloc _free _friscy_export_tar _friscy_stopped
_friscy_resume _friscy_get_pc _friscy_set_pc _friscy_get_state_ptr
```

Plus `_wizer_init` when building with `--wizer`.

## Critical libriscv Patches

The vendored `vendor/libriscv/` contains patches required for Emscripten/wasm32 compatibility. These are already applied in the repo — no action needed for a clean clone. Key patches:

### 1. Arena Allocation (`memory.cpp`)

`new PageData[N]` overflows in wasm32's `operator new[]` when N > 2GB due to signed integer overflow in the size calculation. Fix: use `malloc()` + `memset()` under `#ifdef __EMSCRIPTEN__`.

**Without this patch, any arena >= 31 bits crashes with OOB in the Machine constructor.**

### 2. Arena/Page Mismatch (`elf_loader.hpp` in runtime)

In `encompassing_Nbit_arena` mode, `read<T>`/`write<T>` access the arena buffer directly, but `memory.memcpy` writes through Page objects which have their own data buffers. Fix: after `load_elf_segments`, also `memcpy` each PT_LOAD segment directly into the arena buffer.

### 3. mmap Performance (`syscalls.hpp` in runtime)

- `set_page_attr()` is O(n^2) in arena mode — skip it (arena bypasses page protections)
- `memory.memset()` triggers O(n^2) page faults — use direct `std::memset(arena + addr, 0, len)`
- Go runtime reserves 512MB+ PROT_NONE regions — reject hint addresses beyond arena with ENOMEM

### 4. Execute Segment Eviction

After `execve`, must call `m.memory.evict_execute_segments()` before loading the new binary, otherwise stale decoder entries cause "Execution space protection fault".

### 5. Dispatch Optimizations

Cross-segment branches return base bytecode instead of INVALID to avoid unnecessary segment switches.

## Full Setup: Proxy + Webshell + 31-bit Arena

This section walks through the complete setup from a clean clone to running containers in the browser with network access.

### Step 1: Build the Wasm Runtime

```bash
git clone <repo-url> friscy-standalone
cd friscy-standalone

# Development build (fast compile, assertions enabled)
tools/harness.sh

# Copy artifacts to the webshell bundle
cp runtime/build/friscy.js runtime/build/friscy.wasm friscy-bundle/
```

### Step 2: Create a Rootfs

You need a riscv64 Docker image exported as a tar. The `container_to_riscv.sh` script handles this:

```bash
# Alpine (basic shell, ~8MB)
tools/container_to_riscv.sh alpine:latest ./output
cp output/rootfs.tar friscy-bundle/rootfs.tar

# Node.js (for running JS workloads, ~70MB)
docker buildx build --platform linux/riscv64 \
    -f tools/Dockerfile.nodejs -t friscy-node-rv64 . --load
docker create --name tmp friscy-node-rv64
docker export tmp > friscy-bundle/nodejs.tar
docker rm tmp

# Claude Code (Node.js + Claude CLI, ~180MB)
docker buildx build --platform linux/riscv64 \
    -f tools/Dockerfile.claude -t friscy-claude . --load
docker create --name tmp friscy-claude
docker export tmp > friscy-bundle/claude.tar
docker rm tmp
```

### Step 3: Build and Run the Network Proxy

The proxy bridges WebTransport (browser) to real TCP/UDP sockets. Required for any guest workload that needs network access (Claude API calls, Go HTTP server, wget, curl, etc.).

```bash
cd proxy

# Install Go dependencies
go mod tidy

# Generate TLS certificates (required by WebTransport / HTTP/3)
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout key.pem -out cert.pem -days 365 -nodes \
    -subj "/CN=localhost"

# Build
go build -o friscy-proxy main.go

# Run
./friscy-proxy \
    -listen :4433 \
    -cert cert.pem \
    -key key.pem \
    -allow-private-destinations   # needed for localhost testing
```

The proxy listens on `https://localhost:4433/connect` for WebTransport connections.

**Proxy flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `-listen` | `:4433` | WebTransport listen address |
| `-cert` | `cert.pem` | TLS certificate |
| `-key` | `key.pem` | TLS private key |
| `-api-listen` | (off) | Optional Docker pull API (e.g. `:4434`) |
| `-max-sessions` | `3` | Max concurrent sessions per IP |
| `-max-conns` | `100` | Max daily connections per IP |
| `-origins` | (all) | Comma-separated allowed origins |
| `-allow-private-destinations` | false | Allow connections to 127.0.0.1/10.x/etc |

**Production deployment:** Use a real TLS certificate (Let's Encrypt) or put the proxy behind Caddy:

```
# Caddyfile example
proxy.example.com {
    reverse_proxy localhost:4433
}
```

### Step 4: Start the Dev Server

```bash
cd friscy-bundle
node serve.js 8080
```

The dev server serves the webshell with required headers:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

These headers are mandatory — without them, `SharedArrayBuffer` is unavailable and the Worker architecture won't work.

### Step 5: Open the Browser

Navigate to `http://localhost:8080`. The webshell will:

1. Load `friscy.js` + `friscy.wasm` (Emscripten runtime)
2. Spawn a Web Worker for non-blocking emulation
3. Download the rootfs tar for the selected tab (Alpine, Node.js, Go Server)
4. Connect to the proxy via WebTransport at the URL shown in the bottom status bar
5. Boot the guest Linux environment in xterm.js

**URL parameters for proxy connection:**

```
http://localhost:8080?proxy=https://localhost:4433/connect
```

For self-signed certs, the browser needs the certificate hash:

```
http://localhost:8080?proxy=https://localhost:4433/connect&proxycert=HASH
```

Get the cert hash with:

```bash
openssl x509 -in proxy/cert.pem -outform der | openssl dgst -sha256 -binary | base64
```

### Network Architecture

```
Browser (main thread)                    Proxy Server
┌──────────────────┐                     ┌──────────────┐
│  xterm.js UI     │                     │  Go HTTP/3   │
│  network_bridge  │◄──WebTransport──►│  (quic-go)   │
│  network_rpc_host│                     │              │
└────────┬─────────┘                     │  TCP/UDP     │
         │ SharedArrayBuffer             │  tunneling   │
┌────────┴─────────┐                     └──────┬───────┘
│  Web Worker      │                            │
│  friscy.wasm     │                     ┌──────┴───────┐
│  (RISC-V emu)    │                     │ Real network │
│  socket syscalls │                     │ (Anthropic   │
└──────────────────┘                     │  API, etc.)  │
                                         └──────────────┘
```

Guest socket syscalls (connect, send, recv) are intercepted by the runtime's syscall handlers, forwarded via SharedArrayBuffer to the main thread's network bridge, tunneled over WebTransport to the proxy, which makes real TCP/UDP connections.

## Verifying the Build

After building, test with busybox:

```bash
# Run in Node.js 23+
node --experimental-wasm-exnref tests/test_node.js \
    --rootfs friscy-bundle/rootfs.tar /bin/busybox echo "hello world"
```

Expected: prints "hello world" and exits cleanly.

Test Claude Code version (no network needed):

```bash
node --experimental-wasm-exnref tests/test_node.js \
    --rootfs friscy-bundle/claude.tar /bin/sh -c 'claude --version'
```

Expected: prints Claude Code version string, ~4 billion instructions.

## Why 31 Bits?

| Arena Size | Guest RAM | Works? | Notes |
|-----------|-----------|--------|-------|
| 28-bit | 256 MB | Yes | Too small for Node.js/Go |
| 29-bit | 512 MB | Yes | Marginal for Node.js |
| 30-bit | 1 GB | Yes | Node.js works, Go tight |
| **31-bit** | **2 GB** | **Yes** | **Node.js + Go + Claude Code** |
| 32-bit | 4 GB | No | Exceeds wasm32 address space |

Node.js V8 requires ~1.15 GB for its pointer cage + code spaces. Go's runtime reserves large virtual memory regions. 31-bit (2 GB) is the sweet spot — maximum guest space within wasm32 limits.

## Troubleshooting

**OOB crash in Machine constructor**: The `malloc` patch in `memory.cpp` is missing. Ensure you're using the vendored libriscv, not a fresh upstream clone.

**"Max execute segments reached"**: Increase `RISCV_MAX_EXECUTE_SEGS` or ensure `evict_execute_segments()` is called on execve.

**Legacy exception handling errors (try/catch instead of try_table)**: You're using an old emsdk. Must use `emscripten/emsdk:latest` (5.0.0+) for final-spec `try_table`/`exnref`.

**SharedArrayBuffer not available**: The server must send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. The dev server (`serve.js`) does this automatically.

**Node.js 22 doesn't work**: Node 22 lacks exnref and JSPI support. Use Node 23+ (`--experimental-wasm-exnref` flag needed on 22, but JSPI is still missing).
