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

## Verifying the Build

After building, test with busybox:

```bash
# Create a rootfs (needs riscv64 Docker support)
tools/container_to_riscv.sh alpine:latest ./output

# Run in Node.js 23+
node --experimental-wasm-exnref runtime/test_node.js \
    --rootfs output/rootfs.tar /bin/busybox echo "hello world"
```

Expected: prints "hello world" and exits cleanly.

For the browser bundle:

```bash
cd friscy-bundle
node serve.js 9000
# Open http://localhost:9000
```

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
