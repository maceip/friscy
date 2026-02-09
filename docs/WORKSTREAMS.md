# friscy: Parallel Workstreams

## Goal

User shows up with a Docker image. We convert it and run it in the browser.
Stretch goal: snapshot the running filesystem and export back to a Docker image.

## Dependency Graph

```
              ┌──────────────┐
              │ WORKSTREAM A │ Native Runtime Validation
              │  (solo)      │ Can start immediately
              └──────┬───────┘
                     │ confirms syscalls/VFS/dynlink work
                     ▼
              ┌──────────────┐     ┌──────────────┐
              │ WORKSTREAM B │     │ WORKSTREAM C │
              │  Wasm Build  │     │  AOT Compiler│
              │  + Browser   │     │  (Rust, solo)│
              └──────┬───────┘     └──────┬───────┘
                     │                     │
                     │ friscy.wasm works   │ rv2wasm produces valid .wasm
                     ▼                     │
              ┌──────────────┐             │
              │ WORKSTREAM D │◄────────────┘
              │  Terminal +  │  AOT integrates into pack pipeline
              │  stdin/IO    │
              └──────┬───────┘
                     │ interactive shell works in browser
                     ▼
              ┌──────────────┐     ┌──────────────┐
              │ WORKSTREAM E │     │ WORKSTREAM F │
              │  Wizer       │     │  VFS Export  │
              │  Snapshots   │     │  (C++, solo) │
              └──────────────┘     └──────┬───────┘
                                          │ VFS can serialize to tar
                                          ▼
                                   ┌──────────────┐
                                   │ WORKSTREAM G │
                                   │  Docker      │
                                   │  Re-export   │
                                   └──────────────┘
```

**What can run in parallel right now:**
- A, C, and F can all start immediately with zero dependencies on each other
- B can start as soon as Docker + emsdk are available (no dependency on A, but A's findings inform B)
- D starts after B produces a working browser build
- E starts after B produces a working browser build
- G starts after F produces a working tar serializer

---

## WORKSTREAM A: Native Runtime Validation

**Owner**: Someone with a Linux box and `riscv64-linux-gnu-gcc` installed.

**Purpose**: Prove the C++ runtime (libriscv + syscalls + VFS + dynamic linker) actually works with real container rootfs archives, *before* fighting Emscripten.

### Prerequisites

```bash
# Ubuntu/Debian
sudo apt-get install -y build-essential cmake git \
    riscv64-linux-gnu-gcc riscv64-linux-gnu-g++ \
    qemu-user-static docker.io jq

# Verify
riscv64-linux-gnu-gcc --version   # Must exist
docker --version                  # Must exist
cmake --version                   # >= 3.16
```

### Step 1: Build the native runtime

```bash
cd /home/user/friscy

# Clone libriscv if not present
[ -d vendor/libriscv ] || git clone --depth=1 https://github.com/libriscv/libriscv.git vendor/libriscv

cd runtime
mkdir -p build-native && cd build-native

cmake .. \
    -DCMAKE_BUILD_TYPE=Debug \
    -DCMAKE_CXX_FLAGS="-fexceptions"

make -j$(nproc) VERBOSE=1
```

**Success**: Binary at `runtime/build-native/friscy`. Run `./friscy --help` and see usage text.
**Failure**: If cmake can't find libriscv, check `vendor/libriscv/CMakeLists.txt` exists. If linker errors about `riscv::Machine`, the libriscv API may have changed upstream.

### Step 2: Test with a static RISC-V binary

```bash
# Create a test program
cat > /tmp/test_hello.c << 'EOF'
#include <stdio.h>
int main() {
    printf("Hello from friscy!\n");
    printf("Writing a file...\n");
    FILE* f = fopen("/tmp/test.txt", "w");
    if (f) {
        fprintf(f, "file contents\n");
        fclose(f);
        printf("File written successfully\n");
    } else {
        printf("FAIL: could not create file\n");
        return 1;
    }
    // Read it back
    f = fopen("/tmp/test.txt", "r");
    if (f) {
        char buf[64];
        fgets(buf, sizeof(buf), f);
        fclose(f);
        printf("Read back: %s", buf);
    }
    return 0;
}
EOF

riscv64-linux-gnu-gcc -static -O2 -o /tmp/test_hello /tmp/test_hello.c
./friscy /tmp/test_hello
```

**Expected output**:
```
Hello from friscy!
Writing a file...
File written successfully
Read back: file contents
```

**What this validates**: Basic syscalls (write, openat, read, close, exit), VFS file creation, VFS read-back.

### Step 3: Test with Alpine rootfs

```bash
# Get a real Alpine rootfs
docker create --platform linux/riscv64 --name friscy-alpine alpine:latest /bin/true
docker export friscy-alpine > /tmp/alpine.tar
docker rm friscy-alpine

# Test basic commands
./friscy --rootfs /tmp/alpine.tar /bin/busybox echo "hello world"
./friscy --rootfs /tmp/alpine.tar /bin/busybox ls -la /
./friscy --rootfs /tmp/alpine.tar /bin/busybox cat /etc/os-release
./friscy --rootfs /tmp/alpine.tar /bin/busybox mkdir -p /tmp/testdir
./friscy --rootfs /tmp/alpine.tar /bin/busybox sh -c "echo test > /tmp/file && cat /tmp/file"
```

**Expected**: Each command produces output matching what you'd see in a real Alpine container.

**Likely failures and fixes**:
- "Error: Failed to load ELF" → The binary is dynamically linked. Check that `ld-musl-riscv64-lp64d.so.1` is in the tar. Print debug info in `main.cpp` around line 190 where it checks `exec_info.interpreter`.
- "Unhandled syscall NNN" → A new syscall is needed. Add a handler in `runtime/syscalls.hpp`. Check the syscall number against the RISC-V Linux ABI table.
- Segfault or "Protection fault" → Memory mapping issue. Check the dynamic linker load address (0x40000000) doesn't collide with the program's segments.

### Step 4: Test dynamic linking explicitly

```bash
# Check if busybox is dynamic
file /tmp/alpine-extract/bin/busybox
# Should show: "ELF 64-bit LSB pie executable, UCB RISC-V, ..."
# If it says "dynamically linked", the dynamic linker must work.

# Verbose test - add debug prints
# In runtime/main.cpp around line 190, temporarily add:
#   std::cerr << "[DEBUG] Interpreter: " << exec_info.interpreter << "\n";
#   std::cerr << "[DEBUG] Entry: 0x" << std::hex << exec_info.entry << "\n";
```

**What this validates**: PT_INTERP detection, interpreter loading at 0x40000000, auxiliary vector setup, musl dynamic linker execution.

### Step 5: Test Python (stress test)

```bash
docker create --platform linux/riscv64 --name friscy-python python:3.11-alpine /bin/true
docker export friscy-python > /tmp/python.tar
docker rm friscy-python

./friscy --rootfs /tmp/python.tar /usr/local/bin/python3 -c "print('hello from python')"
./friscy --rootfs /tmp/python.tar /usr/local/bin/python3 -c "import os; print(os.listdir('/'))"
```

**Likely failures**: Python uses many syscalls (mmap with specific flags, futex, clone, getrandom, etc.). Each failure prints "Unhandled syscall NNN" to stderr. Cross-reference with `/usr/include/asm-generic/unistd.h` to identify which syscall and add a handler.

### Validation Criteria for Workstream A

- [ ] `./friscy /tmp/test_hello` prints expected output, exits 0
- [ ] `./friscy --rootfs alpine.tar /bin/busybox ls -la /` shows directory listing
- [ ] `./friscy --rootfs alpine.tar /bin/busybox sh -c "echo hi > /tmp/x && cat /tmp/x"` prints "hi"
- [ ] No "Unhandled syscall" warnings in stderr for the above
- [ ] Dynamic linking works (busybox in Alpine is dynamically linked against musl)

---

## WORKSTREAM B: Emscripten/Wasm Build + Browser Execution

**Owner**: Someone with Docker installed.

**Purpose**: Get friscy.wasm compiled and running in a browser with a real rootfs.

### Prerequisites

```bash
docker --version    # Must exist, daemon running
# ~2GB disk for emscripten image + build artifacts
```

### Step 1: Build friscy.wasm

```bash
cd /home/user/friscy

# Clone libriscv if not present
[ -d vendor/libriscv ] || git clone --depth=1 https://github.com/libriscv/libriscv.git vendor/libriscv

# Development build (faster, separate .wasm file, assertions on)
./tools/harness.sh

# Production build (slower, single .js file with embedded wasm, minified)
./tools/harness.sh --production
```

**Success (dev)**: Files at `runtime/build/friscy.js` (~1.2MB) and `runtime/build/friscy.wasm` (~1.8MB).
**Success (prod)**: File at `runtime/build/friscy.js` (~2-3MB, wasm embedded).
**Failure**: Docker pull fails → check network. cmake fails → check `vendor/libriscv` exists. Emscripten errors → check the pinned version is `3.1.50`.

```bash
# Verify outputs
ls -lh runtime/build/friscy.*
# friscy.js should be > 500KB
# friscy.wasm should be > 1MB (dev build only)
```

### Step 2: Run friscy-pack

```bash
cd /home/user/friscy

# Pack Alpine for the browser
./tools/friscy-pack alpine:latest --output /tmp/friscy-bundle

# Check the bundle
ls -lh /tmp/friscy-bundle/
# Expected files:
#   index.html      (~4KB)
#   manifest.json   (~200B)
#   rootfs.tar      (~3-7MB for Alpine)
#   friscy.js       (~1.2MB dev, ~2-3MB prod)
#   friscy.wasm     (~1.8MB dev only)

cat /tmp/friscy-bundle/manifest.json
# Should show:
# {
#   "version": 1,
#   "image": "alpine:latest",
#   "entrypoint": "/bin/sh",
#   ...
# }
```

### Step 3: Serve and test in browser

```bash
cd /tmp/friscy-bundle
python3 -m http.server 8080
# Open http://localhost:8080 in Chrome (NOT Firefox - WASM SIMD support varies)
```

**Expected in browser**:
1. Page loads with "friscy container" header
2. Status shows "Loading rootfs..."
3. xterm.js terminal appears
4. Terminal shows "Loading alpine:latest..."
5. Terminal shows rootfs size
6. Terminal shows "Starting: /bin/sh"

**Likely failures and how to debug**:

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Module is not defined" | ES6 import failed | Check browser console. friscy.js must be served with `Content-Type: application/javascript`. Some dev servers don't do this. Use `python3 -m http.server`. |
| "SharedArrayBuffer is not defined" | Missing COOP/COEP headers | Not needed for friscy (no threads). If it appears, the harness.sh flags are wrong. |
| "out of memory" | 512MB initial allocation too large | Check browser. Chrome on desktop handles this. Mobile may not. Try reducing `RISCV_ENCOMPASSING_ARENA_BITS` to 28 (256MB). |
| "RuntimeError: unreachable" | Wasm trap | Open DevTools → Sources → enable "Pause on exceptions". The stack trace will show which C++ function trapped. Usually a missing syscall or memory access violation. |
| Terminal shows nothing after "Starting" | stdout not wired to xterm | The `print` callback in Module config must work. Check `Module.print` is called. Add `console.log` to the print callback. |
| "Error: Failed to parse rootfs tar" | rootfs.tar not written to Emscripten FS | Check that `Module.FS.writeFile('/rootfs.tar', rootfsData)` executes before `Module.callMain()`. The FS method must be available (it's in `EXPORTED_RUNTIME_METHODS`). |

### Step 4: Test with Node.js (faster iteration than browser)

```bash
cd /home/user/friscy/runtime/build

# Get Alpine rootfs
docker create --platform linux/riscv64 --name friscy-test alpine:latest /bin/true
docker export friscy-test > /tmp/alpine.tar
docker rm friscy-test

# Run in Node.js
node --experimental-wasm-simd ../../tests/test_node.js --rootfs /tmp/alpine.tar /bin/busybox echo hello
```

**Expected**: Prints "hello" and exits.
**This is faster than browser testing** for iterating on syscall bugs.

### Validation Criteria for Workstream B

- [ ] `./tools/harness.sh` completes without errors
- [ ] `runtime/build/friscy.js` exists and is > 500KB
- [ ] `./tools/friscy-pack alpine:latest --output /tmp/bundle` produces a complete bundle
- [ ] `node tests/test_node.js --rootfs alpine.tar /bin/busybox echo hello` prints "hello"
- [ ] Opening `index.html` in Chrome shows xterm.js terminal with container output
- [ ] No `RuntimeError: unreachable` in browser console

---

## WORKSTREAM C: AOT Compiler (rv2wasm)

**Owner**: Someone who writes Rust. Fully independent of A/B.

**Purpose**: Complete the RISC-V → WebAssembly ahead-of-time compiler for 5-20x performance.

### Prerequisites

```bash
rustc --version     # >= 1.56 (edition 2021)
cargo --version
# Optional but strongly recommended:
riscv64-linux-gnu-gcc --version    # For creating test binaries
wabt                                # For wasm-validate
```

### Current State

The compiler pipeline is: ELF → disassemble → CFG → translate → Wasm binary.
Everything compiles and the basic flow works for integer arithmetic. Three gaps remain.

### Gap 1: br_table Dispatch (Medium, ~200 LOC)

**File**: `aot/src/wasm_builder.rs`, starting around line 90.

**Problem**: The dispatch function currently maps PC values to Wasm function calls linearly. It should use `br_table` for O(1) lookup.

**Current code** (simplified):
```rust
// build_dispatch_function() currently emits:
//   if (pc == 0x10000) call $block_0
//   if (pc == 0x10004) call $block_1
//   ...
// This is O(n) in number of blocks.
```

**What to implement**:
```rust
// 1. Compute base_addr = minimum PC across all blocks
// 2. Compute table_size = (max_pc - base_addr) / 4 + 1
// 3. Build mapping: table_index = (pc - base_addr) / 4
// 4. Emit:
//    local.get $pc
//    i64.const base_addr
//    i64.sub
//    i64.const 4
//    i64.div_u
//    i32.wrap_i64
//    br_table [block_0, block_1, ..., block_n] default_block
```

**How to validate**:
```bash
cd /home/user/friscy/aot

# Create a test binary with a loop (many basic blocks, exercises dispatch)
cat > /tmp/test_loop.c << 'EOF'
int main() {
    int sum = 0;
    for (int i = 0; i < 100; i++) {
        sum += i;
        if (sum > 50) sum -= 10;
    }
    return sum;
}
EOF

riscv64-linux-gnu-gcc -static -O2 -o /tmp/test_loop /tmp/test_loop.c

# Compile to wasm
cargo run --release -- /tmp/test_loop -o /tmp/test_loop.wasm --verbose --debug

# Check output
wasm-validate /tmp/test_loop.wasm    # Must pass
wasm-objdump -d /tmp/test_loop.wasm | grep br_table  # Must find br_table instruction

# Count functions vs blocks (should be close to 1:1, not 1 giant function)
wasm-objdump -x /tmp/test_loop.wasm | grep "Function\[" | wc -l
```

**Done when**: `wasm-validate` passes AND `br_table` appears in the disassembly AND the dispatch function is not a chain of if-else.

### Gap 2: Floating-Point Translation (Medium, ~150 LOC)

**File**: `aot/src/translate.rs`, around line 1272-1306.

**Problem**: FP instructions (FADD.S, FSUB.S, FMUL.S, FDIV.S, FLW, FSW, and double-precision equivalents) are decoded in `disasm.rs` but `translate.rs` emits a stub/panic for them.

**Current code in translate.rs:**
```rust
// Around line 1272-1306, FMA instructions:
Opcode::FMADD_S | Opcode::FMSUB_S | Opcode::FNMSUB_S | Opcode::FNMADD_S |
Opcode::FMADD_D | Opcode::FMSUB_D | Opcode::FNMSUB_D | Opcode::FNMADD_D => {
    // TODO: Need to decode rs3 from instruction bits
    body.push(WasmInst::Unreachable);
}
```

**What to implement**:

RISC-V FP registers (f0-f31) need storage. Two options:
1. **Separate memory region**: Store FP regs at byte offset 256-511 in linear memory (after integer regs at 0-255). Each FP reg is 8 bytes (holds both f32 and f64).
2. **Reinterpret int regs**: Not recommended (different register files in RISC-V).

For each FP opcode, the translation is direct:
```rust
Opcode::FADD_S => {
    // Load f[rs1] as f32
    body.push(WasmInst::F32Load { offset: fp_reg_offset(rs1) });
    // Load f[rs2] as f32
    body.push(WasmInst::F32Load { offset: fp_reg_offset(rs2) });
    // f32.add
    body.push(WasmInst::F32Add);
    // Store to f[rd]
    body.push(WasmInst::F32Store { offset: fp_reg_offset(rd) });
}
```

FMA (fused multiply-add) has no direct Wasm equivalent. Decompose:
```rust
Opcode::FMADD_S => {
    // f[rd] = f[rs1] * f[rs2] + f[rs3]
    // Decode rs3 from bits [31:27] of the raw instruction
    let rs3 = (raw_inst >> 27) & 0x1f;
    body.push(WasmInst::F32Load { offset: fp_reg_offset(rs1) });
    body.push(WasmInst::F32Load { offset: fp_reg_offset(rs2) });
    body.push(WasmInst::F32Mul);
    body.push(WasmInst::F32Load { offset: fp_reg_offset(rs3) });
    body.push(WasmInst::F32Add);
    body.push(WasmInst::F32Store { offset: fp_reg_offset(rd) });
}
```

**How to validate**:
```bash
# Create a floating-point test
cat > /tmp/test_fp.c << 'EOF'
#include <stdio.h>
int main() {
    float a = 3.14f;
    float b = 2.72f;
    float c = a * b + 1.0f;
    double d = 1.23456789;
    double e = d * d;
    // Use volatile to prevent constant folding
    volatile float vc = c;
    volatile double ve = e;
    printf("float: %f\n", (double)vc);
    printf("double: %f\n", ve);
    return (vc > 9.0f && ve > 1.5) ? 0 : 1;
}
EOF

riscv64-linux-gnu-gcc -static -O2 -o /tmp/test_fp /tmp/test_fp.c

# Disassemble to see what FP instructions are used
riscv64-linux-gnu-objdump -d /tmp/test_fp | grep -E 'flw|fsw|fadd|fmul|fld|fsd' | head -20

# Compile with rv2wasm
cargo run --release -- /tmp/test_fp -o /tmp/test_fp.wasm --verbose

# Validate
wasm-validate /tmp/test_fp.wasm
# Must NOT contain "unreachable" in place of FP ops:
wasm-objdump -d /tmp/test_fp.wasm | grep unreachable | wc -l   # Should be 0 for FP-only code
```

**Done when**: A static RISC-V binary using float/double operations compiles to valid Wasm without `unreachable` stubs replacing FP instructions.

### Gap 3: Atomic Instruction Translation (Low, ~80 LOC)

**File**: `aot/src/translate.rs`, around line 1190-1269.

**Problem**: AMOMIN, AMOMAX, AMOMINU, AMOMAXU currently just do a plain swap. LR/SC (load-reserved / store-conditional) need at minimum a single-threaded fallback.

**What to implement (single-threaded fallback)**:
```rust
Opcode::LR_D => {
    // Load value from memory at address in rs1
    // Store address in a "reservation" global
    body.push(WasmInst::I64Load { offset: 0 });  // load from [rs1]
    body.push(WasmInst::GlobalSet { index: RESERVATION_ADDR_GLOBAL });
    body.push(WasmInst::I64Store { offset: rd_offset });
}

Opcode::SC_D => {
    // Check if reservation is still valid (single-threaded: always valid)
    // Store rs2 to [rs1], set rd = 0 (success)
    body.push(WasmInst::I64Store { offset: 0 });  // store rs2 to [rs1]
    body.push(WasmInst::I64Const(0));              // success
    body.push(WasmInst::I64Store { offset: rd_offset });
}

Opcode::AMOMIN_D => {
    // Load current value from [rs1]
    // Compare with rs2
    // Store minimum
    // Return old value in rd
}
```

**How to validate**:
```bash
cat > /tmp/test_atomic.c << 'EOF'
#include <stdatomic.h>
#include <stdio.h>
int main() {
    atomic_int x = 0;
    atomic_fetch_add(&x, 5);
    atomic_fetch_add(&x, 3);
    int val = atomic_load(&x);
    printf("atomic result: %d\n", val);
    return (val == 8) ? 0 : 1;
}
EOF

riscv64-linux-gnu-gcc -static -O2 -o /tmp/test_atomic /tmp/test_atomic.c
cargo run --release -- /tmp/test_atomic -o /tmp/test_atomic.wasm --verbose
wasm-validate /tmp/test_atomic.wasm
```

### Gap 4: Integration with friscy-pack

**File**: `tools/friscy-pack`, lines 148-197.

The shell code already exists but has never been tested. After gaps 1-3 are fixed:

```bash
# Build rv2wasm
cd /home/user/friscy/aot && cargo build --release

# Run friscy-pack with --aot
cd /home/user/friscy
./tools/friscy-pack alpine:latest --output /tmp/aot-bundle --aot

# Check AOT output
ls -lh /tmp/aot-bundle/aot/
# Should contain .wasm files for each RISC-V binary found in the rootfs
```

### Validation Criteria for Workstream C

- [ ] `cargo build --release` succeeds in `aot/`
- [ ] `rv2wasm /tmp/test_loop -o out.wasm` produces valid Wasm with `br_table`
- [ ] `rv2wasm /tmp/test_fp -o out.wasm` handles float/double without `unreachable`
- [ ] `rv2wasm /tmp/test_atomic -o out.wasm` handles atomics without panic
- [ ] `wasm-validate` passes on all three test outputs
- [ ] `tests/test_rv2wasm.sh` passes end-to-end
- [ ] `friscy-pack alpine:latest --aot` produces AOT-compiled binaries in bundle

---

## WORKSTREAM D: Interactive Terminal (stdin/stdout/tty)

**Owner**: Someone comfortable with both JavaScript and C++ Emscripten glue.

**Depends on**: Workstream B (working browser build).

**Purpose**: Make the browser terminal interactive -- type commands, get output, run a shell.

### The Problem

The current `index.html` template (generated by `friscy-pack`) has three issues:

1. **stdin is buffered but never consumed**: `term.onData()` pushes to `inputBuffer`, but nothing reads from it. The guest's `read(0, ...)` syscall (stdin) returns EOF or blocks forever.

2. **stdout goes to `console.log`**: The `print` callback in Module config writes to `term.writeln()`, but `machine.set_printer()` in `main.cpp` (line 297) writes to `std::cout`, which Emscripten routes to `Module.print`. This chain works for line-buffered output but not for raw terminal output (e.g., shell prompts without newlines).

3. **No terminal mode (raw/cooked)**: The `ioctl` syscall handler doesn't support `TCGETS`/`TCSETS` (terminal attribute get/set) or `TIOCGWINSZ` (window size). Shells like `sh` call these on startup.

### Step 1: Wire stdin in Emscripten

**File**: `runtime/syscalls.hpp` (the `sys_read` handler for fd 0).

Currently, reading from fd 0 likely goes through libriscv's default stdin handler. We need to override it for Emscripten builds:

```cpp
#ifdef __EMSCRIPTEN__
#include <emscripten.h>

// In the sys_read handler, when fd == 0:
if (fd == 0) {
    // Call into JavaScript to get input
    int bytes_read = EM_ASM_INT({
        // Check if inputBuffer has data
        if (typeof Module._stdinBuffer === 'undefined') Module._stdinBuffer = [];
        if (Module._stdinBuffer.length === 0) return 0;  // No data available

        var count = Math.min($1, Module._stdinBuffer.length);
        for (var i = 0; i < count; i++) {
            Module.HEAPU8[$0 + i] = Module._stdinBuffer[i];
        }
        Module._stdinBuffer.splice(0, count);
        return count;
    }, guest_buf_ptr, count);

    machine.set_result(bytes_read);
    return;
}
#endif
```

**In the HTML template**, connect xterm.js to `Module._stdinBuffer`:
```javascript
term.onData((data) => {
    if (!Module._stdinBuffer) Module._stdinBuffer = [];
    for (let i = 0; i < data.length; i++) {
        Module._stdinBuffer.push(data.charCodeAt(i));
    }
});
```

### Step 2: Handle raw stdout (no newline buffering)

**File**: `runtime/main.cpp`, around line 297 where `machine.set_printer()` is called.

```cpp
#ifdef __EMSCRIPTEN__
machine.set_printer([](const auto&, const char* data, size_t len) {
    // Write directly to JS, bypassing cout line buffering
    EM_ASM({
        var text = UTF8ToString($0, $1);
        if (typeof Module._termWrite === 'function') {
            Module._termWrite(text);
        }
    }, data, len);
});
#endif
```

**In the HTML template**:
```javascript
Module._termWrite = (text) => term.write(text);  // write, NOT writeln
```

### Step 3: Add terminal ioctl support

**File**: `runtime/syscalls.hpp`, in the `sys_ioctl` handler.

```cpp
case 0x5401: // TCGETS - get terminal attributes
{
    // Return a plausible termios struct
    // struct termios { tcflag_t c_iflag, c_oflag, c_cflag, c_lflag; cc_t c_cc[20]; }
    struct termios t = {};
    t.c_iflag = 0;           // Raw input
    t.c_oflag = 0;           // Raw output
    t.c_cflag = 0x00bf;      // CS8 | CREAD | CLOCAL
    t.c_lflag = 0;           // No echo, no canonical
    machine.copy_to_guest(arg_addr, &t, sizeof(t));
    machine.set_result(0);
    return;
}
case 0x5413: // TIOCGWINSZ - get window size
{
    struct winsize ws = { 24, 80, 0, 0 };  // 24 rows, 80 cols
    machine.copy_to_guest(arg_addr, &ws, sizeof(ws));
    machine.set_result(0);
    return;
}
```

### How to Validate

**Test 1: Echo test (simplest)**
```bash
# In Node.js (feed stdin via pipe)
echo "hello" | node tests/test_node.js --rootfs /tmp/alpine.tar /bin/busybox cat
# Expected: prints "hello"
```

**Test 2: Interactive shell in browser**
1. Build with workstream B's output
2. Open in Chrome
3. Type `ls` and press Enter
4. Should see directory listing
5. Type `echo hello > /tmp/x && cat /tmp/x`
6. Should see "hello"

**Test 3: Terminal escape sequences**
```bash
# If shell prompt appears as "/ # " with cursor, terminal is working
# If prompt appears garbled or not at all, check TCGETS/TIOCGWINSZ
```

### Validation Criteria for Workstream D

- [ ] Typing in xterm.js terminal sends characters to guest stdin
- [ ] Guest stdout (including partial lines without `\n`) appears in terminal
- [ ] `/bin/sh` prompt appears when running Alpine with entrypoint `/bin/sh`
- [ ] `ls`, `echo`, `cat` work interactively
- [ ] Terminal size query (`TIOCGWINSZ`) returns 24x80

---

## WORKSTREAM E: Wizer Snapshots

**Owner**: Someone comfortable with Emscripten and the Wizer tool.

**Depends on**: Workstream B (working Wasm build).

**Purpose**: Pre-initialize the Wasm module with VFS + ELF state so browser startup skips parsing.

### Step 1: Implement wizer_init()

**File**: `runtime/main.cpp`

```cpp
#ifdef FRISCY_WIZER
#include <cstdlib>

static VirtualFS g_vfs_wizer;
static std::vector<uint8_t> g_binary_data;
static bool g_wizer_initialized = false;

extern "C" void wizer_init() {
    // Read rootfs from environment or embedded data
    const char* rootfs_path = getenv("FRISCY_ROOTFS");
    if (!rootfs_path) rootfs_path = "/rootfs.tar";

    auto tar_data = load_file(rootfs_path);
    if (!g_vfs_wizer.load_tar(tar_data.data(), tar_data.size())) {
        fprintf(stderr, "wizer_init: Failed to load rootfs\n");
        return;
    }

    // Read entry binary
    const char* entry = getenv("FRISCY_ENTRY");
    if (!entry) entry = "/bin/sh";
    g_binary_data = g_vfs_wizer.read_file(entry);

    setup_virtual_files(g_vfs_wizer);
    g_wizer_initialized = true;
}
#endif
```

### Step 2: Build with Wizer support

```bash
./tools/harness.sh --wizer
# Output: runtime/build/friscy.js + runtime/build/friscy.wasm
```

### Step 3: Run Wizer

```bash
# Install wizer
cargo install wizer --all-features

# Prepare rootfs
docker create --platform linux/riscv64 --name friscy-wizer alpine:latest /bin/true
docker export friscy-wizer > /tmp/alpine.tar
docker rm friscy-wizer

# Create snapshot
FRISCY_ROOTFS=/tmp/alpine.tar FRISCY_ENTRY=/bin/sh \
    wizer runtime/build/friscy.wasm \
    --allow-wasi \
    --wasm-bulk-memory true \
    --init-func wizer_init \
    -o runtime/build/friscy-snapshot.wasm
```

### How to Validate

```bash
# Compare sizes
ls -lh runtime/build/friscy.wasm runtime/build/friscy-snapshot.wasm
# Snapshot should be LARGER (contains pre-initialized state)

# Compare startup time in Node.js
time node tests/test_node.js --rootfs /tmp/alpine.tar /bin/busybox echo hello
# vs
time node tests/test_node.js /bin/busybox echo hello   # using snapshot (no --rootfs needed)

# Snapshot should be 2-5x faster on the callMain() step
```

### Validation Criteria for Workstream E

- [ ] `wizer_init()` function compiles and links with `FRISCY_WIZER=ON`
- [ ] Wizer tool produces a snapshot .wasm without errors
- [ ] Snapshot .wasm runs the container without needing `--rootfs` flag
- [ ] Browser startup with snapshot is measurably faster (use `performance.now()`)

---

## WORKSTREAM F: VFS Tar Serialization (Export Foundation)

**Owner**: Someone who writes C++. Fully independent of A-E.

**Purpose**: Add the ability to serialize the in-memory VFS back to a POSIX tar archive. This is the foundation for the Docker re-export stretch goal.

### The Data Structures (already exist)

In `runtime/vfs.hpp`:
```cpp
struct Entry {
    std::string name;
    FileType type;           // Regular, Directory, Symlink, CharDev, etc.
    uint32_t mode;           // 0755, 0644, etc.
    uint32_t uid, gid;
    uint64_t size;
    uint64_t mtime;
    std::string link_target; // For symlinks
    std::vector<uint8_t> content;
    std::unordered_map<std::string, std::shared_ptr<Entry>> children;
};
```

The VFS already parses tar archives via `load_tar()` (lines 88-205 of `vfs.hpp`). We need the inverse.

### Step 1: Implement save_tar()

**File**: `runtime/vfs.hpp`, add as a new method on `VirtualFS`.

```cpp
// Returns the serialized tar as a byte vector
std::vector<uint8_t> save_tar() const {
    std::vector<uint8_t> output;
    // Walk the tree depth-first, emit tar headers + content for each entry
    save_tar_recursive(output, root_, "");
    // Emit two 512-byte zero blocks (tar end marker)
    output.resize(output.size() + 1024, 0);
    return output;
}

private:
void save_tar_recursive(std::vector<uint8_t>& out,
                         const std::shared_ptr<Entry>& entry,
                         const std::string& path) const {
    // Skip root (empty name)
    if (!path.empty()) {
        emit_tar_header(out, path, *entry);
        if (entry->type == FileType::Regular && !entry->content.empty()) {
            // Emit content
            out.insert(out.end(), entry->content.begin(), entry->content.end());
            // Pad to 512-byte boundary
            size_t remainder = entry->content.size() % 512;
            if (remainder > 0) {
                out.resize(out.size() + (512 - remainder), 0);
            }
        }
    }

    if (entry->type == FileType::Directory) {
        for (const auto& [name, child] : entry->children) {
            std::string child_path = path.empty() ? name : path + "/" + name;
            // Directories get trailing slash
            if (child->type == FileType::Directory) {
                child_path += "/";
            }
            save_tar_recursive(out, child, child_path);
        }
    }
}

void emit_tar_header(std::vector<uint8_t>& out,
                      const std::string& path,
                      const Entry& entry) const {
    // 512-byte tar header
    std::vector<uint8_t> header(512, 0);

    // Handle long names (> 100 chars) with ././@LongLink
    if (path.size() > 100) {
        emit_long_name_header(out, path);
    }

    // Name field (0-99)
    std::string name = path.substr(0, 100);
    std::memcpy(header.data(), name.c_str(), name.size());

    // Mode (100-107)
    snprintf((char*)header.data() + 100, 8, "%07o", entry.mode & 07777);

    // UID (108-115)
    snprintf((char*)header.data() + 108, 8, "%07o", entry.uid);

    // GID (116-123)
    snprintf((char*)header.data() + 116, 8, "%07o", entry.gid);

    // Size (124-135) - only for regular files
    uint64_t size = (entry.type == FileType::Regular) ? entry.content.size() : 0;
    snprintf((char*)header.data() + 124, 12, "%011lo", (unsigned long)size);

    // Mtime (136-147)
    snprintf((char*)header.data() + 136, 12, "%011lo", (unsigned long)entry.mtime);

    // Type flag (156)
    switch (entry.type) {
        case FileType::Regular:   header[156] = '0'; break;
        case FileType::Directory: header[156] = '5'; break;
        case FileType::Symlink:   header[156] = '2'; break;
        case FileType::CharDev:   header[156] = '3'; break;
        case FileType::BlockDev:  header[156] = '4'; break;
        case FileType::Fifo:      header[156] = '6'; break;
        default:                  header[156] = '0'; break;
    }

    // Link target (157-256) for symlinks
    if (entry.type == FileType::Symlink) {
        std::memcpy(header.data() + 157, entry.link_target.c_str(),
                     std::min(entry.link_target.size(), (size_t)100));
    }

    // UStar magic (257-261)
    std::memcpy(header.data() + 257, "ustar", 5);
    header[262] = '0'; header[263] = '0'; // version

    // Prefix (345-499) for paths > 100 chars
    if (path.size() > 100 && path.size() <= 255) {
        size_t split = path.rfind('/', 100);
        if (split != std::string::npos) {
            std::memcpy(header.data() + 345, path.c_str(), split);
            std::memcpy(header.data(), path.c_str() + split + 1, path.size() - split - 1);
        }
    }

    // Checksum (148-155) - must be computed LAST
    // Fill checksum field with spaces first
    std::memset(header.data() + 148, ' ', 8);
    uint32_t checksum = 0;
    for (int i = 0; i < 512; i++) {
        checksum += header[i];
    }
    snprintf((char*)header.data() + 148, 7, "%06o", checksum);
    header[155] = '\0';

    out.insert(out.end(), header.begin(), header.end());
}
```

### Step 2: Expose to Emscripten

**File**: `runtime/main.cpp`

```cpp
#ifdef __EMSCRIPTEN__
extern "C" {
    // Called from JavaScript to get the serialized tar
    uint8_t* friscy_export_tar(uint32_t* out_size) {
        auto tar = g_vfs.save_tar();
        *out_size = tar.size();
        uint8_t* buf = (uint8_t*)malloc(tar.size());
        memcpy(buf, tar.data(), tar.size());
        return buf;
    }
}
#endif
```

Add to CMakeLists.txt exported functions:
```cmake
-sEXPORTED_FUNCTIONS=['_main','_malloc','_free','_friscy_export_tar']
```

### How to Validate (Native, No Emscripten Needed)

```bash
# 1. Build native runtime with save_tar() added
cd runtime/build-native && cmake .. -DCMAKE_BUILD_TYPE=Debug && make -j

# 2. Write a test program that:
#    - Loads a tar
#    - Modifies VFS (create files, dirs, symlinks)
#    - Calls save_tar()
#    - Writes result to disk
#    - Extracts with system tar and verifies contents
```

Create a test:
```bash
cat > /tmp/test_export.cpp << 'CPPEOF'
// This is a standalone test, not part of friscy build
// Link against vfs.hpp directly or test via friscy CLI extension

#include <fstream>
#include <iostream>
// ... (include vfs.hpp or compile as part of friscy with a --export flag)
CPPEOF
```

**Simpler validation approach** -- add a `--export` flag to the friscy CLI:
```bash
# Run container, modify filesystem, export
./friscy --rootfs /tmp/alpine.tar \
         /bin/busybox sh -c "echo 'new file' > /created.txt && mkdir /newdir"
# ^ This runs and exits. But currently VFS state is lost.

# Better: add --export-tar flag to main.cpp that saves after execution
./friscy --rootfs /tmp/alpine.tar --export-tar /tmp/modified.tar \
         /bin/busybox sh -c "echo 'new file' > /created.txt"

# Verify the export
mkdir /tmp/verify && tar -xf /tmp/modified.tar -C /tmp/verify
cat /tmp/verify/created.txt    # Should show "new file"
ls /tmp/verify/bin/            # Should show original Alpine binaries
```

### Validation Criteria for Workstream F

- [ ] `save_tar()` compiles and links
- [ ] Round-trip test: `load_tar(data)` then `save_tar()` produces a tar that `tar -t` can list
- [ ] Modified files appear in exported tar
- [ ] Newly created files appear in exported tar
- [ ] Symlinks are preserved in exported tar
- [ ] Directories have correct permissions in exported tar
- [ ] Tar checksum is valid (no warnings from `tar -xf`)

---

## WORKSTREAM G: Docker Image Re-Export (Stretch Goal)

**Owner**: Someone comfortable with OCI image spec and JavaScript.

**Depends on**: Workstream F (VFS → tar serialization).

**Purpose**: Export the running container's filesystem as a Docker-importable image.

### Option 1: Minimal (Download tar, user runs `docker import`)

This is the simplest path and requires only workstream F's `save_tar()` plus a JS download button.

**In index.html**:
```javascript
document.getElementById('export-btn').addEventListener('click', () => {
    // Call into Wasm to get tar
    const sizePtr = Module._malloc(4);
    const dataPtr = Module._friscy_export_tar(sizePtr);
    const size = Module.HEAPU32[sizePtr >> 2];
    const tarData = new Uint8Array(Module.HEAPU8.buffer, dataPtr, size);

    // Download as file
    const blob = new Blob([tarData], { type: 'application/x-tar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'container-export.tar';
    a.click();
    URL.revokeObjectURL(url);

    Module._free(dataPtr);
    Module._free(sizePtr);
});
```

User then runs:
```bash
docker import container-export.tar myimage:exported
docker run -it myimage:exported /bin/sh
```

### Option 2: Full OCI Image Bundle (More Work)

Generate a proper OCI image that includes the original image's config (entrypoint, env, workdir) plus the modified filesystem as a new layer.

**Structure needed**:
```
oci-bundle/
├── oci-layout          # {"imageLayoutVersion": "1.0.0"}
├── index.json          # References the manifest
├── blobs/
│   └── sha256/
│       ├── <manifest>  # Image manifest JSON
│       ├── <config>    # Image config JSON (entrypoint, env, etc.)
│       └── <layer>     # Gzipped tar of filesystem
```

This requires:
1. Computing SHA-256 of the layer tar (JavaScript `crypto.subtle.digest`)
2. Gzipping the tar (JavaScript `CompressionStream` API or pako library)
3. Building the manifest and config JSONs
4. Packaging as a tar-of-tars

**How to validate**:
```bash
# After downloading oci-bundle.tar from browser:
skopeo copy oci-archive:oci-bundle.tar docker-daemon:myimage:exported
docker run -it myimage:exported /bin/sh

# Verify modified files exist
docker run myimage:exported cat /created.txt   # Should show content from browser session
```

### Validation Criteria for Workstream G

**Option 1 (minimal)**:
- [ ] "Export" button in browser triggers tar download
- [ ] `docker import container-export.tar test:exported` succeeds
- [ ] `docker run test:exported cat /created.txt` shows file created in browser session
- [ ] `docker run test:exported ls /bin/` shows original Alpine binaries

**Option 2 (full OCI)**:
- [ ] OCI bundle passes `skopeo inspect oci-archive:bundle.tar`
- [ ] Import via `skopeo copy` succeeds
- [ ] Entrypoint, env vars, workdir preserved from original image
- [ ] New layer contains only the diff (modified + created files)

---

## Parallelism Summary

| Workstream | Can Start Now | Blocked By | Owner Skills | Estimated Size |
|------------|--------------|------------|--------------|----------------|
| **A**: Native validation | Yes | Nothing | C++, Linux, Docker | Small (testing) |
| **B**: Wasm build + browser | Yes | Nothing (Docker) | Docker, JS, browser devtools | Medium |
| **C**: AOT compiler | Yes | Nothing (Rust) | Rust, Wasm spec knowledge | Large (3 gaps) |
| **D**: Interactive terminal | No | B | JS + C++ Emscripten | Medium |
| **E**: Wizer snapshots | No | B | C++ Emscripten, Wizer | Small-Medium |
| **F**: VFS tar export | Yes | Nothing (C++) | C++, tar format | Medium |
| **G**: Docker re-export | No | F | JS, OCI spec | Small (opt 1) / Medium (opt 2) |

**Maximum parallelism**: A + B + C + F all running simultaneously on day 1.

**Critical path**: B → D (interactive terminal is the user experience). If B works, everything else is polish/performance.
