# Crazy Performance Ideas for friscy

## The Ultimate Goal

**Native-speed container execution in the browser.**

Current state: ~40% native speed (interpreted RISC-V)
WebVM: ~15% native speed (x86 JIT in Wasm)
Target: **>90% native speed**

---

## 🚀 Tier 1: Actually Possible (High Impact)

### 1. RISC-V → Wasm AOT Compilation

**The big one.** Instead of interpreting RISC-V at runtime, compile it directly to Wasm at build time.

```
Current:
  Container binary (RISC-V) → [libriscv interpreter] → slow execution

Proposed:
  Container binary (RISC-V) → [rv2wasm compiler] → Native Wasm → FAST
```

**Why this works for RISC-V but not x86:**
- RISC-V: 47 base instructions, fixed 32-bit width, clean design
- x86: 1500+ instructions, variable length (1-15 bytes), legacy chaos

**Implementation sketch:**
```rust
// rv2wasm compiler (Rust)
fn translate_instruction(inst: RiscvInst) -> Vec<WasmInst> {
    match inst.opcode() {
        ADD => vec![
            WasmInst::LocalGet(inst.rs1()),
            WasmInst::LocalGet(inst.rs2()),
            WasmInst::I64Add,
            WasmInst::LocalSet(inst.rd()),
        ],
        LW => vec![
            WasmInst::LocalGet(inst.rs1()),
            WasmInst::I32Const(inst.imm()),
            WasmInst::I32Add,
            WasmInst::I64Load,
            WasmInst::LocalSet(inst.rd()),
        ],
        // ... ~45 more instructions
    }
}
```

**Expected speedup: 5-20x** (from interpreted to native Wasm)

**Challenges:**
- Self-modifying code (rare in practice)
- Indirect jumps (function pointers) - need jump tables
- Syscalls - need trampolines back to host

#### Deep Dive: Build-Time AOT Architecture

The idea: **at `friscy-pack` time, compile RISC-V → Wasm directly**. No interpreter ships to browser.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        friscy-pack Pipeline                                  │
│                                                                              │
│   Input: Docker image                                                        │
│     │                                                                        │
│     ▼                                                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  1. Extract RISC-V ELF binaries from rootfs                         │   │
│   │     /bin/busybox, /usr/bin/python3, /lib/*.so                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│     │                                                                        │
│     ▼                                                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  2. Disassemble to basic blocks                                      │   │
│   │                                                                      │   │
│   │     0x1000: addi  x1, x0, 5      ┐                                  │   │
│   │     0x1004: addi  x2, x0, 10     │ Block A                          │   │
│   │     0x1008: add   x3, x1, x2     │                                  │   │
│   │     0x100c: beq   x3, x0, 0x1020 ┘ (branch = block boundary)        │   │
│   │     0x1010: mul   x4, x1, x2     ┐                                  │   │
│   │     0x1014: j     0x1024         ┘ Block B                          │   │
│   │     0x1020: sub   x4, x1, x2     ─ Block C                          │   │
│   │     0x1024: ...                  ─ Block D                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│     │                                                                        │
│     ▼                                                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  3. Translate each block to Wasm                                     │   │
│   │                                                                      │   │
│   │  (func $block_1000 (param $m i32) (result i32)                      │   │
│   │    ;; x1 = 5                                                         │   │
│   │    (i64.store offset=8 (local.get $m) (i64.const 5))                │   │
│   │    ;; x2 = 10                                                        │   │
│   │    (i64.store offset=16 (local.get $m) (i64.const 10))              │   │
│   │    ;; x3 = x1 + x2                                                   │   │
│   │    (i64.store offset=24 (local.get $m)                              │   │
│   │      (i64.add                                                        │   │
│   │        (i64.load offset=8 (local.get $m))                           │   │
│   │        (i64.load offset=16 (local.get $m))))                        │   │
│   │    ;; if x3 == 0, goto 0x1020, else fall through to 0x1010          │   │
│   │    (if (i64.eqz (i64.load offset=24 (local.get $m)))                │   │
│   │      (then (return (i32.const 0x1020)))                             │   │
│   │      (else (return (i32.const 0x1010)))))                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│     │                                                                        │
│     ▼                                                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  4. Generate dispatch table                                          │   │
│   │                                                                      │   │
│   │  (func $run (param $m i32) (param $start_pc i32)                    │   │
│   │    (local $pc i32)                                                   │   │
│   │    (local.set $pc (local.get $start_pc))                            │   │
│   │    (loop $dispatch                                                   │   │
│   │      (local.set $pc                                                  │   │
│   │        (call_indirect (type $block_t)                               │   │
│   │          (local.get $m)                                              │   │
│   │          (i32.div_u (local.get $pc) (i32.const 4))))                │   │
│   │      (br_if $dispatch                                                │   │
│   │        (i32.ne (local.get $pc) (i32.const -1)))))                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│     │                                                                        │
│     ▼                                                                        │
│   Output: app.wasm (native-speed execution!)                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Translation Rules (RISC-V → Wasm)

```
RISC-V                          Wasm
────────────────────────────────────────────────────────────────────────
add  rd, rs1, rs2      →   i64.store offset=rd*8 (local.get $m)
                              (i64.add
                                (i64.load offset=rs1*8 (local.get $m))
                                (i64.load offset=rs2*8 (local.get $m)))

addi rd, rs1, imm      →   i64.store offset=rd*8 (local.get $m)
                              (i64.add
                                (i64.load offset=rs1*8 (local.get $m))
                                (i64.const imm))

lw   rd, offset(rs1)   →   i64.store offset=rd*8 (local.get $m)
                              (i64.load32_s
                                (i32.add
                                  (i32.wrap_i64 (i64.load offset=rs1*8 ...))
                                  (i32.const offset)))

sw   rs2, offset(rs1)  →   i64.store
                              (i32.add ...)
                              (i64.load offset=rs2*8 ...)

beq  rs1, rs2, target  →   if (i64.eq (i64.load rs1) (i64.load rs2))
                              (return (i32.const target))
                            else
                              (return (i32.const next_pc))

ecall                  →   return (i32.or
                              (i32.const 0x80000000)  ;; syscall flag
                              (i32.const pc))         ;; for handler
```

#### Handling the Hard Parts

**1. Indirect Jumps (jalr, function pointers)**
```
jalr rd, rs1, offset   →   ;; rd = pc + 4
                           i64.store offset=rd*8 (local.get $m)
                             (i64.const (pc + 4))
                           ;; return target address for dispatch
                           return (i32.wrap_i64
                             (i64.add
                               (i64.load offset=rs1*8 (local.get $m))
                               (i64.const offset)))
```
The dispatch loop handles jumping to the right block.

**2. Syscalls (ecall)**
```
ecall                  →   ;; Return special value to signal syscall
                           return (i32.const 0xFFFFFFFF)
```
The dispatch loop checks for this and calls the syscall handler.

**3. Memory Access**
Guest memory lives in a Wasm linear memory. Load/store translate directly:
```
lw rd, 0(rs1)          →   i64.load32_s
                             (i32.wrap_i64
                               (i64.load offset=rs1*8 (local.get $m)))
```

**4. Dynamic Linking**
Two options:
- **Eager**: Compile all .so files at build time, link into one Wasm module
- **Lazy**: Keep interpreter for dynamically loaded code, AOT for main binary

#### Tool Architecture

```
rv2wasm/
├── src/
│   ├── main.rs              # CLI: rv2wasm input.elf -o output.wasm
│   ├── elf.rs               # ELF parser
│   ├── disasm.rs            # RISC-V disassembler
│   ├── cfg.rs               # Control flow graph builder
│   ├── translate.rs         # RISC-V → Wasm translation
│   ├── wasm_builder.rs      # Wasm module construction
│   └── optimize.rs          # Peephole optimizations
├── Cargo.toml
└── tests/
    ├── basic_ops.rs
    ├── branches.rs
    └── syscalls.rs
```

**Why Rust?**
- `goblin` crate for ELF parsing
- `wasmparser`/`wasm-encoder` for Wasm
- Fast compilation
- Can compile to Wasm itself (run rv2wasm in browser!)

#### Performance Comparison

| Approach | Instruction Cost | Dispatch Cost | Memory Access |
|----------|------------------|---------------|---------------|
| Interpreter | ~20 Wasm ops | switch + br_table | bounds check |
| Runtime JIT | ~5 Wasm ops | call_indirect | direct |
| **Build-time AOT** | **~3 Wasm ops** | **inline/call** | **direct** |

The AOT approach is **5-10x faster** than interpretation because:
1. No decode step (instruction bits → operation)
2. No dispatch overhead (already in the right function)
3. Browser JIT can inline across blocks
4. Register allocation can use Wasm locals

#### Example: Fibonacci

```c
// C source
int fib(int n) {
    if (n <= 1) return n;
    return fib(n-1) + fib(n-2);
}
```

```asm
# RISC-V assembly
fib:
    addi sp, sp, -16
    sw   ra, 12(sp)
    sw   s0, 8(sp)
    mv   s0, a0
    li   a5, 1
    ble  a0, a5, .L1
    addi a0, a0, -1
    call fib
    mv   a5, a0
    addi a0, s0, -2
    call fib
    add  a0, a0, a5
.L1:
    lw   ra, 12(sp)
    lw   s0, 8(sp)
    addi sp, sp, 16
    ret
```

```wat
;; AOT-compiled Wasm (simplified)
(func $fib (param $m i32) (param $n i64) (result i64)
  (if (result i64) (i64.le_s (local.get $n) (i64.const 1))
    (then (local.get $n))
    (else
      (i64.add
        (call $fib (local.get $m) (i64.sub (local.get $n) (i64.const 1)))
        (call $fib (local.get $m) (i64.sub (local.get $n) (i64.const 2)))))))
```

The browser JIT sees clean Wasm and optimizes it like native code!

---

### 2. Wasm Tail Calls (BLOCKED - Browser Limitation)

The interpreter's main loop:
```cpp
while (true) {
    auto inst = fetch();
    switch (inst.opcode) {
        case ADD: execute_add(inst); break;  // Each case = indirect jump
        case SUB: execute_sub(inst); break;
        // ...
    }
}
```

With tail calls, we could use **threaded dispatch**:
```cpp
// Each handler jumps directly to the next, no switch overhead
[[musttail]] return handlers[next_opcode](machine);
```

**STATUS: BLOCKED** ❌

Emscripten's `-mtail-call` flag doesn't work with 64-bit function tables
(WASM_BIGINT). The browser's Wasm implementation can't handle tail calls
with i64 table entries yet. This is a V8/SpiderMonkey limitation.

**Workaround:** Use computed goto in C++ (which libriscv already does) -
Emscripten compiles this to a switch + br_table, which is decent but not
as fast as true tail calls.

**Expected speedup: 0%** (blocked), would be 20-40% if it worked

---

### 3. Wasm SIMD for Memory Operations ✅ ENABLED

Bulk memory copies and fills are common (memcpy, memset, string ops).

```cpp
// Current: byte-by-byte
for (int i = 0; i < len; i++) dst[i] = src[i];

// With SIMD: 16 bytes at a time
v128_t* vdst = (v128_t*)dst;
v128_t* vsrc = (v128_t*)src;
for (int i = 0; i < len/16; i++) vdst[i] = vsrc[i];
```

**Emscripten flags:** `-msimd128 -mbulk-memory`

**STATUS: ENABLED** ✅ (added to CMakeLists.txt for both dev and production builds)

**Expected speedup: 2-4x** for memory-heavy workloads

---

### 4. Dynamic Wasm Module Generation (CheerpX-style)

**Important clarification:** We're NOT JIT-compiling RISC-V to RISC-V.
We're *translating* RISC-V to Wasm, then the browser JIT compiles Wasm to native.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    What "Hot JIT" means for friscy                    │
│                                                                       │
│   RISC-V binary        →  Our translator   →  Wasm bytecode          │
│   (guest code)            (at runtime)        (generated)             │
│                                                    ↓                  │
│                                              Browser JIT              │
│                                              (V8/SpiderMonkey)        │
│                                                    ↓                  │
│                                              Native x86/ARM           │
│                                              (what actually runs)     │
│                                                                       │
│   The RISC-V guest never knows - it thinks it's being interpreted.   │
│   But hot paths are actually running as native code via Wasm.        │
└──────────────────────────────────────────────────────────────────────┘
```

The key insight from CheerpX/similar projects: **generate separate Wasm modules for hot code paths at runtime**.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Hot Path Wasm Generation                          │
│                                                                      │
│   Interpreter runs, profiles execution                              │
│        │                                                             │
│        ▼                                                             │
│   Block at 0x1000 executed 10,000 times                             │
│        │                                                             │
│        ▼                                                             │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  Generate dedicated Wasm module for this block:              │   │
│   │                                                              │   │
│   │  (module                                                     │   │
│   │    (func $block_1000 (param $regs i32) (result i32)         │   │
│   │      ;; Compiled RISC-V instructions                        │   │
│   │      local.get $regs                                         │   │
│   │      i64.load offset=8   ;; x1                              │   │
│   │      local.get $regs                                         │   │
│   │      i64.load offset=16  ;; x2                              │   │
│   │      i64.add                                                 │   │
│   │      local.get $regs                                         │   │
│   │      i64.store offset=24 ;; x3 = x1 + x2                    │   │
│   │      ...                                                     │   │
│   │      i32.const 0x1020  ;; return next PC                    │   │
│   │    )                                                         │   │
│   │    (export "run" (func $block_1000))                        │   │
│   │  )                                                           │   │
│   └─────────────────────────────────────────────────────────────┘   │
│        │                                                             │
│        ▼                                                             │
│   WebAssembly.compile() + instantiate()                             │
│        │                                                             │
│        ▼                                                             │
│   Cache: compiledBlocks[0x1000] = instance.exports.run              │
│        │                                                             │
│        ▼                                                             │
│   Future executions: direct Wasm call, no interpretation!           │
└─────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```javascript
class HotPathCompiler {
  constructor(memory) {
    this.memory = memory;
    this.executionCounts = new Map();
    this.compiledBlocks = new Map();
    this.COMPILE_THRESHOLD = 1000;
  }

  // Called by interpreter on each block entry
  async maybeCompile(blockAddr, blockBytes) {
    const count = (this.executionCounts.get(blockAddr) || 0) + 1;
    this.executionCounts.set(blockAddr, count);

    if (count === this.COMPILE_THRESHOLD) {
      // Generate Wasm for this block
      const wasmBytes = this.translateBlock(blockAddr, blockBytes);

      // Compile to native code (browser JIT takes over)
      const module = await WebAssembly.compile(wasmBytes);
      const instance = await WebAssembly.instantiate(module, {
        env: { memory: this.memory }
      });

      this.compiledBlocks.set(blockAddr, instance.exports.run);
      console.log(`Compiled hot block at 0x${blockAddr.toString(16)}`);
    }
  }

  // Check if we have a compiled version
  getCompiled(blockAddr) {
    return this.compiledBlocks.get(blockAddr);
  }

  // Translate RISC-V block to Wasm bytes
  translateBlock(addr, bytes) {
    const wat = [];
    wat.push('(module');
    wat.push('  (import "env" "memory" (memory 1))');
    wat.push('  (func $run (param $regs i32) (result i32)');

    // Decode and translate each instruction
    for (let i = 0; i < bytes.length; i += 4) {
      const inst = bytes[i] | (bytes[i+1] << 8) |
                   (bytes[i+2] << 16) | (bytes[i+3] << 24);
      wat.push(...this.translateInstruction(inst, addr + i));
    }

    wat.push('  )');
    wat.push('  (export "run" (func $run))');
    wat.push(')');

    return this.watToWasm(wat.join('\n'));
  }
}
```

**Why this is powerful:**
1. **Browser JIT optimizes each module** - V8/SpiderMonkey can inline, optimize
2. **Separate compilation** - hot paths don't affect cold code
3. **Incremental** - compile only what's needed
4. **Cache-friendly** - small focused Wasm modules

**Expected speedup: 5-15x** for hot loops

---

### 5. Lazy Binary Translation (JIT-lite)

Instead of full AOT, translate hot code paths on first execution:

```
1. Start with interpreter
2. Count executions per basic block
3. When block hits threshold (e.g., 1000x):
   - Translate that block to Wasm
   - Cache the compiled function
   - Replace interpreter call with direct Wasm call
```

This is what V8/SpiderMonkey do, but we can do it at the RISC-V level.

**Implementation:**
```javascript
// In browser, we can compile Wasm at runtime!
const wasmBytes = translateBlockToWasm(riscvBlock);
const module = await WebAssembly.compile(wasmBytes);
const instance = await WebAssembly.instantiate(module, imports);
compiledBlocks[blockAddr] = instance.exports.run;
```

**Expected speedup: 3-10x** for hot loops

---

### 5. Memory-Mapped Guest Address Space

Current: Guest memory access goes through bounds checking
```cpp
uint64_t load(uint64_t addr) {
    if (addr >= memory_size) trap();  // Overhead!
    return memory[addr];
}
```

Proposed: Use Wasm memory directly as guest memory
```cpp
// Guest address = Wasm linear memory offset
// No bounds check needed - Wasm runtime does it for free
uint64_t load(uint64_t addr) {
    return *(uint64_t*)(wasm_memory + addr);
}
```

**Expected speedup: 10-30%** (removes per-access overhead)

---

## 🔥 Tier 2: Experimental (Requires New Browser Features)

### 6. Wasm Threads + SharedArrayBuffer

True multi-core guest execution:

```
┌─────────────────────────────────────────────┐
│              Main Thread                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ vCPU 0  │  │ vCPU 1  │  │ vCPU 2  │     │
│  │ Worker  │  │ Worker  │  │ Worker  │     │
│  └────┬────┘  └────┬────┘  └────┬────┘     │
│       │            │            │           │
│       └────────────┴────────────┘           │
│                    │                         │
│          SharedArrayBuffer                   │
│          (Guest Memory)                      │
└─────────────────────────────────────────────┘
```

**Expected speedup: Nx** for multi-threaded workloads (N = core count)

**Challenge:** Cross-origin isolation headers required

---

### 7. WebGPU Compute Shaders

For embarrassingly parallel workloads (ML inference, image processing):

```javascript
// Offload RISC-V vector operations to GPU
const computeShader = `
  @compute @workgroup_size(256)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Process 256 elements in parallel
    output[id.x] = input_a[id.x] + input_b[id.x];
  }
`;
```

**Expected speedup: 10-100x** for GPU-friendly workloads

---

### 8. Wasm GC for Runtime Structures

Use Wasm GC (garbage-collected references) for interpreter state:

```wat
;; Current: everything in linear memory, manual management
;; Proposed: use Wasm GC structs
(type $Machine (struct
  (field $pc i64)
  (field $regs (array i64 32))
  (field $memory (ref $Memory))
))
```

**Benefit:** Better optimization by Wasm engine, less memory overhead

---

## 🌌 Tier 3: Science Fiction (Doesn't Exist Yet)

### 9. Browser-Native RISC-V Support

What if browsers just... supported RISC-V natively?

```html
<script type="application/riscv64" src="app.rv64"></script>
```

The browser would JIT-compile RISC-V directly, like it does for Wasm.

**Why this could happen:**
- RISC-V is open standard, no licensing
- Simpler than x86, comparable to ARM
- Growing ecosystem (Android, Linux)

**Expected speedup: 10-50x** (native execution)

---

### 10. Capability Hardware in Browser

Future CPUs with hardware capability enforcement (CHERI) could allow:
- Safe direct memory access without bounds checks
- Hardware-enforced sandbox boundaries
- Zero-overhead memory safety

**Expected speedup: Removes all sandboxing overhead**

---

### 11. Persistent Compiled Code Cache

Browser stores compiled Wasm across sessions:

```
First visit:
  RISC-V binary → AOT compile → Wasm → V8 JIT → Machine code
  Cache: [RISC-V hash] → [Optimized machine code]

Second visit:
  RISC-V binary → Cache hit → Instant execution
```

**Expected speedup: Instant startup** (no compilation)

---

## Performance Comparison (Projected)

| Approach | % of Native | vs WebVM |
|----------|-------------|----------|
| Current (interpreted) | ~40% | 2.7x faster |
| + Tail calls + SIMD | ~55% | 3.7x faster |
| + Lazy JIT | ~70% | 4.7x faster |
| + Full AOT | ~85% | 5.7x faster |
| + Native RISC-V (fantasy) | ~95% | 6.3x faster |

---

## What Should We Build First?

### Immediate (This Week)
1. **Enable `-mtail-call`** in Emscripten build
2. **Enable `-msimd128`** for SIMD
3. **Profile hot paths** with browser DevTools

### Short-term (This Month)
4. **Memory-mapped guest space** - remove bounds checks
5. **Inline hot syscalls** - avoid function call overhead

### Medium-term (This Quarter)
6. **Lazy basic block JIT** - compile hot code to Wasm
7. **Multi-threading** - WebWorker per vCPU

### Long-term (This Year)
8. **Full AOT compiler** - rv2wasm tool
9. **WebGPU integration** - for compute workloads

---

## The Killer Insight

**RISC-V's simplicity is the ultimate performance hack.**

x86 JIT in browser (WebVM approach):
```
x86 binary → decode variable-length → handle 1500 opcodes →
generate Wasm → browser JIT → machine code
```

RISC-V AOT (friscy future):
```
RISC-V binary → decode fixed-width → handle 47 opcodes →
generate Wasm (at build time) → browser JIT → machine code
```

The complexity difference is ~30x, which translates directly to:
- Smaller runtime
- Faster startup
- Better optimization opportunities
- Simpler maintenance

**We chose the right ISA.** 🎯
