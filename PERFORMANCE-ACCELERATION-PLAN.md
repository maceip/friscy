# Performance Acceleration Evolution: Implementation Guide

## Overview

This document describes three performance acceleration techniques for fRISCy's
RISC-V → WebAssembly translation pipeline, ordered by implementation sequence.
Each section specifies exactly where to make changes, how to measure the impact,
and how to validate correctness with real-world programs that detect regressions
and prevent "cheating" (optimizations that appear fast but silently produce
wrong results).

**Implementation order:**

| Phase | Technique | Files Modified | Expected Impact | Risk |
|-------|-----------|---------------|-----------------|------|
| **1** | Peephole optimization | `aot/src/translate.rs` | 10-20% code size, 5-15% runtime | Very low |
| **2** | Wasm-internal JIT dispatch | `aot/src/wasm_builder.rs`, `friscy-bundle/jit_manager.js`, `friscy-bundle/worker.js` | 5-50x JIT throughput | Low |
| **3** | Register caching in locals | `aot/src/translate.rs` | 15-30% fewer Wasm instructions | Medium |

---

## Phase 1: Peephole Optimization

### 1.1 Problem Statement

The `optimize_function()` in `translate.rs:2478` is a stub:

```rust
fn optimize_function(func: &mut WasmFunction) {
    // For now, just remove Comment instructions in release mode
    func.body.retain(|inst| !matches!(inst, WasmInst::Comment { .. }));
}
```

Both AOT (`translate()` at line 264) and JIT (`translate_jit()` at line 2464)
call this function on every compiled block, paying the overhead for zero benefit.

Meanwhile, the translator generates extremely verbose Wasm. A typical RISC-V
`ADD x5, x6, x7` followed by `ADDI x8, x5, 4` produces:

```wasm
;; ADD x5, x6, x7
local.get 0       ;; $m pointer
local.get 0       ;; $m pointer (redundant — same value)
i64.load offset=48  ;; load x6
local.get 0       ;; $m pointer (redundant — same value)
i64.load offset=56  ;; load x7
i64.add
i64.store offset=40 ;; store x5

;; ADDI x8, x5, 4
local.get 0       ;; $m pointer
local.get 0       ;; $m pointer (redundant)
i64.load offset=40  ;; load x5 — JUST stored above
i64.const 4
i64.add
i64.store offset=64 ;; store x8
```

The x5 value was just stored to memory then immediately reloaded. The `$m`
pointer (`local.get 0`) is pushed 5 times when it could be pushed once and
tee'd.

### 1.2 Where to Change

**File: `aot/src/translate.rs`**

Replace the stub `optimize_function()` at line 2478 with a multi-pass peephole
optimizer that operates on the `Vec<WasmInst>` before it reaches `wasm_builder.rs`.

### 1.3 Patterns to Implement

Each pattern below is independent, testable, and provably correct. Implement
them incrementally — one pattern per commit.

#### Pattern 1: Store-Load Elimination

**Before:**
```
I64Store { offset: X }
LocalGet { idx: 0 }
I64Load { offset: X }
```

**After:**
```
LocalTee { idx: TEMP }   ;; keep value on stack AND store to temp local
I64Store { offset: X }
LocalGet { idx: TEMP }   ;; reload from local (free) instead of memory
```

**Implementation:** Scan `body` with a sliding window of size 3. When you see
`I64Store{X}, LocalGet{0}, I64Load{X}` with matching offsets, replace with the
tee pattern. Requires allocating a new `i64` temp local (increment
`func.num_locals`). The same pattern applies to `I32Store`/`I32Load`,
`F32Store`/`F32Load`, `F64Store`/`F64Load`.

**Why it's safe:** The store still happens. The reload comes from a local
instead of memory. Since no other instruction can alias the machine state
pointer between consecutive instructions in a basic block, the values are
identical.

**Detection test:** Count `I64Load` instructions in the output Wasm for a known
binary. After this optimization, the count should decrease by 15-30%. If it
doesn't change, the pattern isn't firing. If it decreases by >50%, something
is over-optimizing.

#### Pattern 2: Redundant `local.get 0` Elimination

Every translated instruction begins with `LocalGet { idx: 0 }` to get the `$m`
pointer. When two instructions execute back-to-back, there are consecutive
`LocalGet { idx: 0 }` pairs.

**Before:**
```
... i64.store offset=40   ;; end of instruction N
local.get 0               ;; start of instruction N+1 (for store address)
local.get 0               ;; start of instruction N+1 (for rs1 load base)
```

**After:**
```
... i64.store offset=40
local.get 0
local.tee TEMP
```
Then subsequent `local.get 0` in that instruction become `local.get TEMP`.

**Implementation:** Iterate through body. Whenever you see two or more
consecutive `LocalGet { idx: 0 }`, keep the first, replace the second with
`LocalTee { idx: TEMP }`, and replace the third (if present) with
`LocalGet { idx: TEMP }`.

**Why it's safe:** `$m` (parameter 0) never changes during block execution. All
loads of it produce the same value.

#### Pattern 3: Constant Folding

**Before:**
```
I64Const { value: A }
I64Const { value: B }
I64Add
```

**After:**
```
I64Const { value: A + B }
```

This fires for LUI + ADDI sequences (common in RISC-V for loading 32-bit
constants), where LUI sets upper bits and ADDI adds lower bits.

**Implementation:** Sliding window of 3. Match `I64Const, I64Const, <binop>`
and fold. Support: `I64Add`, `I64Sub`, `I64And`, `I64Or`, `I64Xor`,
`I64Shl`, `I64ShrS`, `I64ShrU`. Same for `I32Const` variants.

#### Pattern 4: Dead Store Elimination

If a register is written twice with no intervening read:

```
local.get 0; local.get 0; i64.load offset=48; local.get 0; i64.load offset=56;
i64.add; i64.store offset=40   ;; store to x5
local.get 0; i64.const 99; i64.store offset=40   ;; store to x5 again (overwrites)
```

The first store to offset 40 is dead. Remove the entire first instruction
sequence that writes to offset 40.

**Implementation:** This is harder because you need to track which store
offsets are live. Build a reverse scan: for each `I64Store { offset: X }`,
mark X as "last-stored". If you encounter another `I64Store { offset: X }`
before any `I64Load { offset: X }`, the earlier store is dead.

**Why it's safe:** Within a basic block, stores to the machine state struct
are the only side effect. If a value is overwritten before being read, the
first write is provably dead. NOTE: Do NOT eliminate stores to offsets that
could be memory addresses (i.e., stores where the address is computed at
runtime, not a constant offset from `$m`). Only eliminate stores to known
register offsets (0-255 for integer regs, 256-383 for f32, 384-639 for f64).

### 1.4 Testing Phase 1

#### Unit Tests (Rust)

Add tests to `aot/src/translate.rs` in the existing `#[cfg(test)]` module (or
create a new `aot/src/peephole_tests.rs`):

```rust
#[test]
fn test_store_load_elimination() {
    let mut func = WasmFunction {
        name: "test".into(),
        block_addr: 0,
        body: vec![
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Const { value: 42 },
            WasmInst::I64Store { offset: 40 },  // store x5
            WasmInst::LocalGet { idx: 0 },
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Load { offset: 40 },   // reload x5 — should be eliminated
            WasmInst::I64Const { value: 4 },
            WasmInst::I64Add,
            WasmInst::I64Store { offset: 64 },
        ],
        num_locals: 4,
    };
    optimize_function(&mut func);
    // Should not contain I64Load { offset: 40 } anymore
    assert!(!func.body.iter().any(|i| matches!(i, WasmInst::I64Load { offset: 40 })));
}

#[test]
fn test_constant_folding() {
    let mut func = WasmFunction {
        name: "test".into(),
        block_addr: 0,
        body: vec![
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Const { value: 0x12345000 },
            WasmInst::I64Const { value: 0x678 },
            WasmInst::I64Add,
            WasmInst::I64Store { offset: 40 },
        ],
        num_locals: 4,
    };
    optimize_function(&mut func);
    // Should fold to single I64Const { value: 0x12345678 }
    assert!(func.body.iter().any(|i| matches!(i, WasmInst::I64Const { value: 0x12345678 })));
}
```

#### Browser Smoke (Node.js + Claude)

Phase 1 rollout requires a browser-level smoke run to ensure we still boot real
workloads that exercise the hot translation paths:

```bash
# Full smoke: Node.js boot + claude --version
bash ./tests/smoke_phase1_peephole.sh

# Quicker local loop (Node.js only)
bash ./tests/smoke_phase1_peephole.sh --skip-claude
```

#### Cheater-Detection: Deterministic Output Programs

These programs have specific, computable correct answers. If an optimization
silently drops a store or folds incorrectly, the output will be wrong.

**Test Program 1: Register dependency chain (catches dead-store over-elimination)**

```c
// test_regchain.c — every register write is read by the next instruction
// Compile: riscv64-linux-gnu-gcc -static -O1 -o test_regchain test_regchain.c
#include <stdio.h>
#include <stdint.h>

// Volatile to prevent the C compiler from optimizing away
volatile uint64_t sink;

int main() {
    uint64_t a = 1;
    uint64_t b = 2;
    uint64_t c = 3;

    // Chain: each result feeds the next computation
    // If any intermediate store is incorrectly eliminated, final result changes
    for (int i = 0; i < 1000; i++) {
        a = a + b;       // a depends on previous a and b
        b = b ^ c;       // b depends on previous b and c
        c = c + a;       // c depends on new a
        a = a * 3;       // a depends on new a
        b = b + c;       // b depends on new b and new c
        c = (c >> 1) | (a << 63); // c depends on new c and new a
    }

    // Deterministic result — compute reference offline
    // After 1000 iterations with these operations, the exact values are fixed
    sink = a;
    sink = b;
    sink = c;

    // Print a hash of the final state
    uint64_t hash = a ^ (b << 13) ^ (c >> 7) ^ (a + b + c);
    printf("REGCHAIN: %016lx\n", hash);

    // Known-good: precompute on real RISC-V hardware or QEMU
    // The test harness compares this output against the reference
    return 0;
}
```

**How to use:** Compile once on real hardware (or QEMU). Record the output hex
string. Then run through fRISCy (interpreter), fRISCy (JIT), and fRISCy (AOT).
All three must produce the identical hex string. If peephole optimization
introduces a bug, the JIT/AOT output will diverge from the interpreter output.

**Test Program 2: Aliased memory (catches incorrect store-load elimination
across memory)**

```c
// test_alias.c — detects if the optimizer incorrectly assumes
// register stores don't alias guest memory stores
#include <stdio.h>
#include <stdint.h>
#include <string.h>

int main() {
    // Allocate a buffer that overlaps with where the emulator stores
    // register values — this tests that memory stores through computed
    // addresses are not confused with register stores
    uint64_t buf[64];
    memset(buf, 0, sizeof(buf));

    // Write through pointer arithmetic (computed address, not register offset)
    for (int i = 0; i < 64; i++) {
        buf[i] = (uint64_t)i * 0xDEADBEEF + i;
    }

    // Read back and accumulate — if any store was dropped, sum changes
    uint64_t sum = 0;
    for (int i = 0; i < 64; i++) {
        sum += buf[i];
        sum ^= (sum << 3);
    }

    printf("ALIAS: %016lx\n", sum);
    return 0;
}
```

**Test Program 3: Floating-point precision (catches incorrect constant folding
for FP)**

```c
// test_fp_precise.c — floating-point operations are NOT safe to constant-fold
// at compile time because the emulator's FP rounding may differ from the host
#include <stdio.h>
#include <math.h>

int main() {
    // These operations must execute at runtime, not be folded
    volatile double a = 1.0;
    volatile double b = 3.0;
    double c = a / b;          // 0.333... — exact value depends on rounding
    double d = c * b;          // Should be very close to 1.0 but not exact
    double e = d - 1.0;        // Rounding error residual

    // Kahan summation — extremely sensitive to FP operation order
    double sum = 0.0;
    double comp = 0.0;
    for (int i = 1; i <= 10000; i++) {
        double term = 1.0 / (double)(i * i);
        double y = term - comp;
        double t = sum + y;
        comp = (t - sum) - y;
        sum = t;
    }

    // pi^2/6 ≈ 1.6449340668...
    printf("FP_PRECISE: %.15e %.15e\n", e, sum);
    return 0;
}
```

### 1.5 Measurement

**Metric 1: Wasm code size (bytes)**

```bash
# Before optimization
cargo build --release
./target/release/rv2wasm test_regchain -o before.wasm
ls -la before.wasm   # record size

# After optimization
# (rebuild with peephole changes)
./target/release/rv2wasm test_regchain -o after.wasm
ls -la after.wasm

echo "Reduction: $(echo "scale=1; (1 - $(stat -c%s after.wasm) / $(stat -c%s before.wasm)) * 100" | bc)%"
```

**Target:** 10-20% reduction in `.wasm` file size.

**Metric 2: Wasm instruction count**

```bash
# Requires wabt (wasm-objdump)
wasm-objdump -d before.wasm | wc -l
wasm-objdump -d after.wasm | wc -l
```

**Metric 3: Pattern hit rate (add instrumentation to optimize_function)**

During development, add counters:

```rust
fn optimize_function(func: &mut WasmFunction) -> OptStats {
    let mut stats = OptStats::default();
    // ... each pattern increments stats.store_load_eliminated, etc.
    stats
}

#[derive(Default)]
struct OptStats {
    store_load_eliminated: u32,
    redundant_localget_eliminated: u32,
    constants_folded: u32,
    dead_stores_eliminated: u32,
}
```

Print stats in `--verbose` mode. This shows which patterns are actually firing
and at what rate. If a pattern never fires, it's not worth maintaining.

**Metric 4: Runtime (browser benchmark)**

Use the existing fRISCy browser shell to time a known workload:

```bash
# In the fRISCy browser console:
time busybox sha256sum /dev/urandom | head -c 1048576
# Compare wall-clock time before/after optimization
```

---

## Phase 2: Wasm-Internal JIT Dispatch

### 2.1 Problem Statement

The current JIT dispatch is catastrophically inefficient. Examining the
execution flow in `worker.js:228-271`:

```
1. JS: pc = friscy_get_pc()                           // JS→Wasm boundary
2. JS: result = jitManager.execute(pc, statePtr)       // JS Map.get() + JS→Wasm call
3.   Wasm: block function executes, returns next_pc    // Wasm→JS boundary
4. JS: friscy_set_pc(result.nextPC)                    // JS→Wasm boundary
5. JS: friscy_resume()                                 // JS→Wasm boundary (interpreter)
6.   Wasm: interpreter runs until next stop             // Wasm→JS boundary
7. → back to step 1
```

That's **6 JS↔Wasm boundary crossings per JIT block execution**, plus the
interpreter re-entering for every single block even when the next block is
also JIT-compiled.

The AOT path (`wasm_builder.rs:207-282`) solves this with an internal dispatch
loop using `br_table` / `call_indirect` that chains blocks entirely within
Wasm. The JIT path (`build_jit()` at line 160) explicitly skips this:

```rust
/// Build a JIT Wasm module — simpler than AOT:
/// - No dispatch function — JS manages block dispatch
```

### 2.2 Where to Change

Three files need coordinated changes:

#### File 1: `aot/src/wasm_builder.rs` — Add dispatch to JIT modules

The existing `build_jit()` (line 160) needs to be extended to include:

1. **A syscall import** (like AOT's `imports.import("env", "syscall", ...)`)
2. **A function table** (like AOT's `TableSection`)
3. **An element section** (to populate the table)
4. **A dispatch function** (reuse/adapt `build_dispatch_function()`)
5. **Export `"run"` instead of individual block functions**

The key change to `build_jit()`:

```rust
pub fn build_jit(module: &WasmModule) -> Result<Vec<u8>> {
    let mut wasm = Module::new();

    // Type section: 3 types (same as AOT)
    let mut types = TypeSection::new();
    types.function(vec![ValType::I32], vec![ValType::I32]);              // type 0: block
    types.function(vec![ValType::I32, ValType::I32], vec![ValType::I32]); // type 1: dispatch
    types.function(vec![ValType::I32, ValType::I32], vec![ValType::I32]); // type 2: syscall
    wasm.section(&types);

    // Import section: shared memory + syscall handler
    let mut imports = ImportSection::new();
    imports.import("env", "memory", MemoryType {
        minimum: 256,
        maximum: Some(65536),
        memory64: false,
        shared: true,
    });
    imports.import("env", "syscall", EntityType::Function(2));  // NEW
    wasm.section(&imports);

    // Function section: dispatch + block functions
    let mut functions = FunctionSection::new();
    functions.function(1);  // dispatch function (type 1)
    for _ in &module.functions {
        functions.function(0);
    }
    wasm.section(&functions);

    // Table section (NEW for JIT)
    let mut tables = TableSection::new();
    tables.table(TableType {
        element_type: wasm_encoder::RefType::FUNCREF,
        minimum: module.functions.len() as u32,
        maximum: Some(module.functions.len() as u32),
    });
    wasm.section(&tables);

    // Element section (NEW for JIT)
    let func_indices: Vec<u32> = (0..module.functions.len())
        .map(|i| (i + 2) as u32)  // +2 for syscall import + dispatch
        .collect();
    let mut elements = ElementSection::new();
    elements.active(Some(0), &ConstExpr::i32_const(0), Elements::Functions(&func_indices));
    wasm.section(&elements);

    // Export "run" (dispatch function) instead of individual blocks
    let mut exports = ExportSection::new();
    exports.export("run", ExportKind::Func, 1);
    wasm.section(&exports);

    // Code section: dispatch + blocks
    let addr_to_table_idx: BTreeMap<u64, u32> = module.functions.iter()
        .enumerate()
        .map(|(i, f)| (f.block_addr, i as u32))
        .collect();

    let mut codes = CodeSection::new();
    codes.function(&build_dispatch_function(module, &addr_to_table_idx));
    for func in &module.functions {
        codes.function(&build_block_function(func)?);
    }
    wasm.section(&codes);

    Ok(wasm.finish())
}
```

The dispatch function uses the **same `build_dispatch_function()`** that AOT
uses. No new dispatch logic needed. The only difference is:

- When dispatch encounters an unknown PC (not in this region's table), it
  returns the PC with a special marker (e.g., high bit clear, value != -1)
  so the JS side knows to fall back to the interpreter or check another
  region.

Add a new return convention for "unknown PC — not in this region":

```
Return value conventions:
  -1 (0xFFFFFFFF)           → halt
  0x80000000 | pc           → syscall at pc
  0x40000000 | pc           → unknown PC (region miss) — NEW
  anything else             → next PC (continue in this region's dispatch)
```

Modify `build_dispatch_function()` (or create a `build_jit_dispatch_function`)
so that when the `br_table` default case fires (unknown PC), it returns
`0x40000000 | pc` instead of `0` or `-1`.

#### File 2: `friscy-bundle/jit_manager.js` — Update `execute()` and `compileRegion()`

**`compileRegion()` changes (line 154):**

The import object must now provide a `syscall` handler:

```javascript
const importObject = {
    env: {
        memory: this.wasmMemory,
        syscall: (machineStatePtr, pc) => {
            // Handle syscall: extract syscall number from machine state,
            // invoke the emulator's syscall handler, return next PC
            // This requires a callback to the Emscripten module
            return this.handleSyscall(machineStatePtr, pc);
        },
    },
};
```

Instead of registering individual `block_XXXXXXXX` exports, register the
single `run` export keyed by the region's base address:

```javascript
// OLD: iterate instance.exports for block_* functions
// NEW: store the dispatch function for this region
this.compiledRegions.set(regionStart, {
    run: instance.exports.run,
    instance,
    regionStart,
    regionEnd: regionStart + this.regionSize,
});
```

**`execute()` changes (line 136):**

Instead of looking up individual block PCs, find the region containing the PC
and call its `run` function:

```javascript
execute(pc, machineStatePtr) {
    // Find region containing this PC
    const regionBase = (pc >>> 0) & ~(this.regionSize - 1);
    const region = this.compiledRegions.get(regionBase);
    if (!region) return null;

    // Call the Wasm dispatch loop — it chains blocks internally
    const result = region.run(machineStatePtr, pc);

    if (result === -1 || result === 0xFFFFFFFF) {
        return { nextPC: 0, isSyscall: false, isHalt: true };
    }
    if ((result & 0x80000000) !== 0) {
        return { nextPC: result & 0x7FFFFFFF, isSyscall: true, isHalt: false };
    }
    if ((result & 0x40000000) !== 0) {
        // Region miss — PC is outside this region
        // Return the real PC so JS can check another region or fall back
        return { nextPC: result & 0x3FFFFFFF, isSyscall: false, isHalt: false, regionMiss: true };
    }
    return { nextPC: result, isSyscall: false, isHalt: false };
}
```

#### File 3: `friscy-bundle/worker.js` — Update resume loop

The resume loop at line 228 needs to handle the new `regionMiss` case and
implement **region chaining**: if one region misses, try the next region before
falling back to the interpreter.

```javascript
function runResumeLoop() {
    const friscy_stopped = emModule._friscy_stopped;
    const friscy_resume = emModule._friscy_resume;
    const friscy_get_pc = emModule._friscy_get_pc;
    const friscy_set_pc = emModule._friscy_set_pc;
    const friscy_get_state_ptr = emModule._friscy_get_state_ptr;

    while (friscy_stopped()) {
        const stdinData = requestStdin(4096);
        if (stdinData.length > 0) {
            for (let i = 0; i < stdinData.length; i++) {
                emModule._stdinBuffer.push(stdinData[i]);
            }
        }

        // JIT execution with region chaining
        let handled = false;
        if (jitManager.jitCompiler) {
            let pc = friscy_get_pc();
            let statePtr = friscy_get_state_ptr();
            let chainCount = 0;
            const MAX_CHAIN = 16; // prevent infinite loops in JIT

            while (chainCount < MAX_CHAIN) {
                const jitResult = jitManager.execute(pc, statePtr);
                if (!jitResult) {
                    // No compiled region for this PC
                    jitManager.recordExecution(pc);
                    break;
                }

                if (jitResult.isHalt) return;

                if (jitResult.isSyscall) {
                    friscy_set_pc(jitResult.nextPC);
                    handled = true;
                    break;
                }

                if (jitResult.regionMiss) {
                    // Try chaining to another region
                    pc = jitResult.nextPC;
                    chainCount++;
                    continue;
                }

                // Normal completion — set PC and let interpreter continue
                friscy_set_pc(jitResult.nextPC);
                handled = true;
                break;
            }
        }

        const stillStopped = friscy_resume();
        if (!stillStopped) return;
    }
}
```

### 2.3 Testing Phase 2

#### Correctness: Single-block equivalence

The dispatch loop must produce identical results to the old per-block dispatch.
Test this with a program that exercises many block transitions:

**Test Program 4: Tight loop with many basic blocks (catches dispatch bugs)**

```c
// test_dispatch.c — generates many small basic blocks with known control flow
// The switch statement generates a br_table in Wasm; each case is a block
#include <stdio.h>

int main() {
    int state = 0;
    uint64_t acc = 0;

    // State machine: 8 states, 10000 transitions
    // If dispatch skips a block or delivers wrong next-PC, acc diverges
    for (int i = 0; i < 10000; i++) {
        switch (state) {
            case 0: acc += 1; state = 1; break;
            case 1: acc += 3; state = (acc & 1) ? 2 : 3; break;
            case 2: acc ^= 0xFF; state = 4; break;
            case 3: acc += 7; state = (acc > 1000) ? 5 : 0; break;
            case 4: acc = (acc << 1) | 1; state = 6; break;
            case 5: acc -= 13; state = 7; break;
            case 6: acc += acc >> 3; state = (acc & 3) ? 0 : 7; break;
            case 7: acc ^= acc >> 5; state = 0; break;
        }
    }

    printf("DISPATCH: %016lx %d\n", acc, state);
    return 0;
}
```

Run on QEMU and on fRISCy-interpreter to get the reference value. Then run
with JIT (old dispatch) and JIT (new dispatch). All four must match.

**Test Program 5: Syscall interleaving (catches syscall handling in dispatch)**

```c
// test_syscall_interleave.c — alternates computation and syscalls
// If the dispatch loop doesn't properly exit for syscalls, output corrupts
#include <stdio.h>

int main() {
    int checksum = 0;
    for (int i = 0; i < 100; i++) {
        // Computation (stays in JIT)
        checksum = checksum * 31 + i;
        checksum ^= (checksum >> 16);

        // Syscall (must exit dispatch, handle, re-enter)
        printf("%d ", checksum & 0xFF);
    }
    printf("\nCHECKSUM: %08x\n", checksum);
    return 0;
}
```

Compare byte-for-byte stdout between interpreter and JIT.

**Test Program 6: Cross-region jumps (catches region-miss handling)**

```c
// test_cross_region.c — functions spread across multiple 16KB regions
// If region chaining doesn't work, calls to far-away functions will fail
#include <stdio.h>
#include <string.h>

// Force functions into separate sections/regions with padding
__attribute__((noinline)) int func_a(int x) {
    static volatile char pad_a[8192]; // push func_b far away
    (void)pad_a;
    return x * 3 + 1;
}

__attribute__((noinline)) int func_b(int x) {
    static volatile char pad_b[8192];
    (void)pad_b;
    return x * 5 - 2;
}

__attribute__((noinline)) int func_c(int x) {
    return func_a(x) + func_b(x);
}

int main() {
    int result = 0;
    for (int i = 0; i < 1000; i++) {
        result = func_c(result);
        result &= 0xFFFF; // keep bounded
    }
    printf("CROSSREGION: %08x\n", result);
    return 0;
}
```

### 2.4 Measurement

**Metric 1: Blocks-per-exit ratio**

Add a counter to the JIT dispatch function that counts how many blocks execute
before returning to JS:

In `jit_manager.js`:
```javascript
execute(pc, machineStatePtr) {
    // ... existing code ...
    this.stats.dispatchCalls++;
    // After getting result:
    // The number of blocks executed is NOT directly visible to JS,
    // but we can infer it from the dispatch function's iteration count.
    // Better: add a counter to the dispatch Wasm that increments a global
    // on each block call, exported as a mutable global.
}
```

In `wasm_builder.rs`, add an exported mutable `i32` global to JIT modules
that the dispatch function increments on each `call_indirect`. JS reads this
after each `run()` call.

**Target:** Before: 1 block per JS call. After: 5-100+ blocks per JS call
(depends on workload).

**Metric 2: Wall-clock time for compute-bound workload**

```bash
# In fRISCy browser console:
# Run a pure-compute workload (no I/O):
time ./test_regchain    # from Phase 1 tests
```

**Target:** 5-50x improvement for tight loops. 2-5x improvement for mixed
code.

**Metric 3: JS↔Wasm boundary crossings**

Use browser DevTools Performance panel. Record a trace while running a
workload. Count `call` entries in the Wasm→JS direction.

**Before:** One boundary crossing per basic block (~1000s/sec for hot code).
**After:** One boundary crossing per region miss or syscall (~10-100/sec).

---

## Phase 3: Register Caching in Wasm Locals

### 3.1 Problem Statement

Every RISC-V instruction translates to a sequence that loads operands from
linear memory (the machine state struct at `$m + reg_offset`) and stores the
result back. For a block of N instructions touching K unique registers:

- **Current:** N×2 to N×3 loads + N stores = O(N) memory operations
- **With caching:** K loads (prologue) + N operations on locals + K stores (epilogue)
  = O(K) memory operations

For a typical basic block (8-12 instructions, 4-6 unique registers), this
eliminates 60-80% of memory traffic.

### 3.2 Where to Change

**File: `aot/src/translate.rs`**

Modify `translate_block()` (line 280) to:

1. **Pre-scan** the block's instructions to collect register usage
2. **Allocate** Wasm locals for frequently-used registers
3. **Emit prologue** (load live-in registers from memory to locals)
4. **Translate instructions** using locals instead of memory loads/stores
5. **Emit epilogue** (store modified registers back to memory)

#### Step 1: Register Usage Analysis

Add a new function before `translate_block()`:

```rust
/// Analyze which guest registers a basic block reads and writes.
/// Returns (reads_before_write, all_writes) sets.
struct RegUsage {
    /// Registers read before being written in this block (must be loaded in prologue)
    reads: HashSet<u8>,
    /// Registers written in this block (must be stored in epilogue)
    writes: HashSet<u8>,
    /// All registers referenced (for local allocation)
    all_used: HashSet<u8>,
}

fn analyze_register_usage(instructions: &[Instruction]) -> RegUsage {
    let mut reads = HashSet::new();
    let mut writes = HashSet::new();
    let mut written_so_far = HashSet::new();

    for inst in instructions {
        // Record reads of registers not yet written in this block
        if let Some(rs1) = inst.rs1 {
            if rs1 != 0 && !written_so_far.contains(&rs1) {
                reads.insert(rs1);
            }
        }
        if let Some(rs2) = inst.rs2 {
            if rs2 != 0 && !written_so_far.contains(&rs2) {
                reads.insert(rs2);
            }
        }

        // Record writes (skip x0 — hardwired zero)
        if let Some(rd) = inst.rd {
            if rd != 0 {
                writes.insert(rd);
                written_so_far.insert(rd);
            }
        }
    }

    let all_used: HashSet<u8> = reads.union(&writes).copied().collect();
    RegUsage { reads, writes, all_used }
}
```

#### Step 2: Local Allocation Map

Create a mapping from guest register number to Wasm local index:

```rust
/// Map guest registers to Wasm locals.
/// Local 0 = $m (parameter), locals 1..4 = existing temps
/// New register locals start at index 5.
fn allocate_register_locals(usage: &RegUsage) -> (HashMap<u8, u32>, u32) {
    let mut reg_to_local = HashMap::new();
    let mut next_local = 5u32; // after $m (0) and 4 temp locals

    // Sort for deterministic output
    let mut regs: Vec<u8> = usage.all_used.iter().copied().collect();
    regs.sort();

    for reg in regs {
        reg_to_local.insert(reg, next_local);
        next_local += 1;
    }

    let num_new_locals = next_local - 5;
    (reg_to_local, num_new_locals)
}
```

#### Step 3: Prologue and Epilogue

```rust
fn emit_prologue(body: &mut Vec<WasmInst>, usage: &RegUsage, reg_to_local: &HashMap<u8, u32>) {
    // Load registers that are read before being written
    for &reg in &usage.reads {
        let local_idx = reg_to_local[&reg];
        let offset = (reg as u32) * 8;
        body.push(WasmInst::LocalGet { idx: 0 });         // $m
        body.push(WasmInst::I64Load { offset });           // load from memory
        body.push(WasmInst::LocalSet { idx: local_idx });  // store to local
    }
}

fn emit_epilogue(body: &mut Vec<WasmInst>, usage: &RegUsage, reg_to_local: &HashMap<u8, u32>) {
    // Store all registers that were written
    for &reg in &usage.writes {
        let local_idx = reg_to_local[&reg];
        let offset = (reg as u32) * 8;
        body.push(WasmInst::LocalGet { idx: 0 });         // $m
        body.push(WasmInst::LocalGet { idx: local_idx });  // value from local
        body.push(WasmInst::I64Store { offset });          // write to memory
    }
}
```

#### Step 4: Modified Instruction Translation

Add an alternative `translate_instruction_cached()` that uses locals:

```rust
fn translate_instruction_cached(
    inst: &Instruction,
    body: &mut Vec<WasmInst>,
    reg_to_local: &HashMap<u8, u32>,
) -> Result<()> {
    let rd = inst.rd.unwrap_or(0);
    let rs1 = inst.rs1.unwrap_or(0);
    let rs2 = inst.rs2.unwrap_or(0);
    let imm = inst.imm.unwrap_or(0);

    match inst.opcode {
        Opcode::ADD => {
            if rd != 0 {
                // load rs1 from local (or 0 for x0)
                emit_reg_read(body, rs1, reg_to_local);
                emit_reg_read(body, rs2, reg_to_local);
                body.push(WasmInst::I64Add);
                emit_reg_write(body, rd, reg_to_local);
            }
        }
        // ... similar for all instructions
    }
    Ok(())
}

fn emit_reg_read(body: &mut Vec<WasmInst>, reg: u8, map: &HashMap<u8, u32>) {
    if reg == 0 {
        body.push(WasmInst::I64Const { value: 0 });
    } else {
        body.push(WasmInst::LocalGet { idx: map[&reg] });
    }
}

fn emit_reg_write(body: &mut Vec<WasmInst>, reg: u8, map: &HashMap<u8, u32>) {
    if reg != 0 {
        body.push(WasmInst::LocalSet { idx: map[&reg] });
    } else {
        body.push(WasmInst::Drop);
    }
}
```

With register caching, `ADD x5, x6, x7` becomes:

```wasm
;; OLD: 7 instructions (3 memory ops)
;; local.get 0; local.get 0; i64.load 48; local.get 0; i64.load 56; i64.add; i64.store 40

;; NEW: 3 instructions (0 memory ops)
local.get $x6     ;; from Wasm local (free)
local.get $x7     ;; from Wasm local (free)
i64.add
local.set $x5     ;; to Wasm local (free)
```

That's a **57% reduction in instruction count for every ALU operation**.

#### Step 5: Update `translate_block()` and `num_locals`

Modify `translate_block()` to call the analysis, allocate locals, emit
prologue/epilogue, and use the cached path:

```rust
fn translate_block(block: &BasicBlock, ...) -> Result<WasmFunction> {
    let usage = analyze_register_usage(&block.instructions);
    let (reg_to_local, num_reg_locals) = allocate_register_locals(&usage);

    let mut body = Vec::new();

    // Prologue: load live-in registers
    emit_prologue(&mut body, &usage, &reg_to_local);

    // Translate instructions using locals
    for inst in &block.instructions {
        translate_instruction_cached(inst, &mut body, &reg_to_local)?;
    }

    // Epilogue: store dirty registers
    // (inserted before the terminator — see below)

    // Terminator handling needs special care:
    // Branch conditions may read registers, so epilogue goes AFTER
    // the last non-terminator instruction but BEFORE the branch.
    // Actually, the terminator reads from locals too, so epilogue
    // must go before the return/branch that exits the block.

    // Add terminator
    if let Some(term) = block.terminator() {
        emit_epilogue(&mut body, &usage, &reg_to_local);
        add_terminator_return_cached(term, block, &mut body, &reg_to_local)?;
    } else {
        emit_epilogue(&mut body, &usage, &reg_to_local);
        body.push(WasmInst::I32Const { value: block.end_addr as i32 });
        body.push(WasmInst::Return);
    }

    Ok(WasmFunction {
        name: format!("block_{:x}", block.start_addr),
        block_addr: block.start_addr,
        body,
        num_locals: 4 + num_reg_locals, // 4 temps + register locals
    })
}
```

**Critical correctness concern:** For instructions that access guest memory
(LD, SD, LW, SW, etc.), the address register must be read from a local, but
the actual memory load/store goes to **Wasm linear memory** (guest RAM), NOT
to a register local. Only the *register file* (offsets 0-639 from `$m`) is
cached in locals. Guest memory accesses still go through `i64.load`/`i64.store`
with computed addresses.

### 3.3 Testing Phase 3

#### Unit Tests

```rust
#[test]
fn test_register_usage_analysis() {
    // ADD x5, x6, x7 — reads x6, x7; writes x5
    let insts = vec![Instruction {
        addr: 0x1000, bytes: 0, len: 4,
        opcode: Opcode::ADD,
        rd: Some(5), rs1: Some(6), rs2: Some(7), imm: None,
    }];
    let usage = analyze_register_usage(&insts);
    assert!(usage.reads.contains(&6));
    assert!(usage.reads.contains(&7));
    assert!(usage.writes.contains(&5));
    assert!(!usage.reads.contains(&5)); // x5 is written, not read-before-write
}

#[test]
fn test_register_usage_read_after_write() {
    // ADDI x5, x0, 42    — writes x5 (reads x0, but x0 is special)
    // ADD x6, x5, x5     — reads x5 (but x5 was written above, so NOT live-in)
    let insts = vec![
        Instruction {
            addr: 0x1000, bytes: 0, len: 4,
            opcode: Opcode::ADDI,
            rd: Some(5), rs1: Some(0), rs2: None, imm: Some(42),
        },
        Instruction {
            addr: 0x1004, bytes: 0, len: 4,
            opcode: Opcode::ADD,
            rd: Some(6), rs1: Some(5), rs2: Some(5), imm: None,
        },
    ];
    let usage = analyze_register_usage(&insts);
    assert!(!usage.reads.contains(&5)); // x5 written before read
    assert!(usage.writes.contains(&5));
    assert!(usage.writes.contains(&6));
}

#[test]
fn test_x0_never_cached() {
    // ADDI x0, x5, 1 — writes x0 (no-op), reads x5
    let insts = vec![Instruction {
        addr: 0x1000, bytes: 0, len: 4,
        opcode: Opcode::ADDI,
        rd: Some(0), rs1: Some(5), rs2: None, imm: Some(1),
    }];
    let usage = analyze_register_usage(&insts);
    assert!(!usage.writes.contains(&0)); // x0 never written
    assert!(!usage.all_used.contains(&0));
    assert!(usage.reads.contains(&5));
}
```

#### Cheater-Detection Programs

**Test Program 7: Prologue/epilogue correctness (catches missing stores)**

```c
// test_regspill.c — registers written in one block must be visible in the next
// If the epilogue misses a store, the next block reads stale data
#include <stdio.h>
#include <stdint.h>

// Prevent inlining so each function is a separate block
__attribute__((noinline)) uint64_t step1(uint64_t a) {
    return a * 7 + 13;
}

__attribute__((noinline)) uint64_t step2(uint64_t a, uint64_t b) {
    return a ^ b ^ (a >> 3);
}

__attribute__((noinline)) uint64_t step3(uint64_t a, uint64_t b, uint64_t c) {
    return (a + b) * c;
}

int main() {
    uint64_t x = 1, y = 2, z = 3;

    for (int i = 0; i < 10000; i++) {
        // Each function call crosses a block boundary
        // Registers must be correctly spilled/reloaded
        x = step1(x);
        y = step2(x, y);
        z = step3(x, y, z);
        x = x ^ z;
        y = y + x;
    }

    printf("REGSPILL: %016lx %016lx %016lx\n", x, y, z);
    return 0;
}
```

**Test Program 8: Callee-saved register convention (catches over-optimization
of unused registers)**

```c
// test_callee_saved.c — ensures callee-saved registers (s0-s11) survive calls
// A common bug: the optimizer decides s-registers aren't live-in because
// they're not used in the current block, but they're needed by the CALLER
#include <stdio.h>
#include <stdint.h>

// This function uses many registers — the compiler will use s-registers
__attribute__((noinline))
uint64_t heavy_compute(uint64_t a, uint64_t b, uint64_t c,
                        uint64_t d, uint64_t e, uint64_t f) {
    uint64_t r1 = a * b + c;
    uint64_t r2 = d ^ e ^ f;
    uint64_t r3 = r1 + r2;
    uint64_t r4 = r3 << 3;
    uint64_t r5 = r1 ^ r4;
    uint64_t r6 = r2 + r5;
    return r1 + r2 + r3 + r4 + r5 + r6;
}

int main() {
    uint64_t total = 0;
    for (int i = 0; i < 1000; i++) {
        // These values must survive the function call via callee-saved regs
        uint64_t saved1 = (uint64_t)i * 0x123;
        uint64_t saved2 = (uint64_t)i * 0x456;
        uint64_t saved3 = (uint64_t)i * 0x789;

        uint64_t result = heavy_compute(i, i+1, i+2, i+3, i+4, i+5);

        // If s-registers were clobbered, saved1/2/3 will be wrong
        total += result + saved1 + saved2 + saved3;
    }

    printf("CALLEE_SAVED: %016lx\n", total);
    return 0;
}
```

**Test Program 9: Memory-mapped I/O pattern (catches confusion between
register stores and memory stores)**

```c
// test_memreg.c — interleaves register operations with memory operations
// The optimizer must NOT cache memory loads in locals (only register loads)
#include <stdio.h>
#include <stdint.h>
#include <string.h>

int main() {
    uint64_t buf[32];
    memset(buf, 0, sizeof(buf));

    // Interleave register ops and memory ops
    uint64_t reg_a = 1, reg_b = 2;
    for (int i = 0; i < 1000; i++) {
        // Register operation
        reg_a = reg_a + reg_b;

        // Memory operation (must go through linear memory, not locals)
        buf[i & 31] = reg_a;

        // Register operation using value just stored to memory
        // (but loaded through register, not from buf — so this tests
        // that the register store happens before the memory store)
        reg_b = reg_a ^ buf[(i - 1) & 31];
    }

    // Accumulate from memory
    uint64_t sum = 0;
    for (int i = 0; i < 32; i++) {
        sum += buf[i];
    }

    printf("MEMREG: %016lx %016lx %016lx\n", reg_a, reg_b, sum);
    return 0;
}
```

### 3.4 Measurement

**Metric 1: Instructions per block**

Compare `wasm-objdump -d` output instruction count per function before and
after register caching.

**Before (ADD x5, x6, x7):**
```
local.get 0     ;; 1
local.get 0     ;; 2
i64.load 48     ;; 3
local.get 0     ;; 4
i64.load 56     ;; 5
i64.add         ;; 6
i64.store 40    ;; 7
```
7 instructions, 3 memory operations.

**After:**
```
local.get 6     ;; 1  (x6 from local)
local.get 7     ;; 2  (x7 from local)
i64.add         ;; 3
local.set 5     ;; 4  (x5 to local)
```
4 instructions, 0 memory operations (amortized; prologue/epilogue are O(K)
not O(N)).

**Metric 2: Memory operations per block**

Count `i64.load`/`i64.store` instructions with offsets 0-639 (register file
range) in the output Wasm. These are the operations being eliminated.

**Before:** ~3 per instruction × ~10 instructions = ~30 per block.
**After:** ~K loads in prologue + ~K stores in epilogue = ~10-12 per block.

**Target:** 50-75% reduction in register-file memory operations.

**Metric 3: Browser JIT compilation time**

Register caching produces fewer Wasm instructions, which means the browser's
JIT (V8 TurboFan / SpiderMonkey IonMonkey) compiles each module faster.

Measure with:
```javascript
const t0 = performance.now();
const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
const t1 = performance.now();
console.log(`Browser JIT compilation: ${(t1-t0).toFixed(1)}ms`);
```

---

## Comprehensive Validation Framework

### The Golden Rule: Triple-Compare

Every test program must be executed in three modes and produce identical output:

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  QEMU/Host  │    │   fRISCy     │    │   fRISCy     │
│  (reference) │    │ (interpreter)│    │  (JIT/AOT)   │
└──────┬──────┘    └──────┬───────┘    └──────┬───────┘
       │                  │                   │
       ▼                  ▼                   ▼
   output_ref         output_interp       output_jit
       │                  │                   │
       └──────────────────┴───────────────────┘
                          │
                    ALL MUST MATCH
```

If `output_jit != output_interp`, the optimization introduced a bug.
If `output_interp != output_ref`, the interpreter has a bug (unrelated to
our changes).

### Test Harness Script

```bash
#!/bin/bash
# test_perf_correctness.sh — validates all acceleration phases
set -euo pipefail

TESTS=(
    test_regchain
    test_alias
    test_fp_precise
    test_dispatch
    test_syscall_interleave
    test_cross_region
    test_regspill
    test_callee_saved
    test_memreg
)

PASS=0
FAIL=0

for test in "${TESTS[@]}"; do
    echo -n "Testing ${test}... "

    # Get reference output from QEMU
    ref_output=$(qemu-riscv64 "./${test}" 2>/dev/null)

    # Get fRISCy interpreter output
    interp_output=$(node friscy-run.js "./${test}" --no-jit 2>/dev/null)

    # Get fRISCy JIT output
    jit_output=$(node friscy-run.js "./${test}" --jit 2>/dev/null)

    # Get fRISCy AOT output (if available)
    if [[ -f "${test}.wasm" ]]; then
        aot_output=$(node friscy-run.js "${test}.wasm" --aot 2>/dev/null)
    else
        aot_output="$ref_output"  # skip AOT comparison
    fi

    if [[ "$ref_output" == "$interp_output" ]] &&
       [[ "$ref_output" == "$jit_output" ]] &&
       [[ "$ref_output" == "$aot_output" ]]; then
        echo "PASS"
        ((PASS++))
    else
        echo "FAIL"
        ((FAIL++))
        [[ "$ref_output" != "$interp_output" ]] && echo "  INTERP differs: expected '$ref_output', got '$interp_output'"
        [[ "$ref_output" != "$jit_output" ]]    && echo "  JIT differs: expected '$ref_output', got '$jit_output'"
        [[ "$ref_output" != "$aot_output" ]]    && echo "  AOT differs: expected '$ref_output', got '$aot_output'"
    fi
done

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed out of ${#TESTS[@]}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

### Performance Regression Tests

In addition to correctness, we need to ensure each phase actually improves
performance and doesn't regress:

```bash
#!/bin/bash
# bench_phases.sh — measure performance at each phase
set -euo pipefail

BENCH_BINARY="test_regchain"  # pure-compute, no I/O
ITERATIONS=5

echo "=== Performance Benchmark ==="
echo "Binary: ${BENCH_BINARY}"
echo "Iterations: ${ITERATIONS}"
echo ""

run_bench() {
    local label="$1"
    local cmd="$2"
    local total=0

    for i in $(seq 1 $ITERATIONS); do
        start_ms=$(date +%s%N)
        eval "$cmd" >/dev/null 2>&1
        end_ms=$(date +%s%N)
        elapsed=$(( (end_ms - start_ms) / 1000000 ))
        total=$((total + elapsed))
    done

    avg=$((total / ITERATIONS))
    echo "${label}: ${avg}ms (avg of ${ITERATIONS} runs)"
}

# Baseline: interpreter only
run_bench "Interpreter" "node friscy-run.js ${BENCH_BINARY} --no-jit"

# Phase 1: with peephole optimization
run_bench "Interp+Peephole(AOT)" "node friscy-run.js ${BENCH_BINARY}.peephole.wasm --aot"

# Phase 2: with JIT dispatch
run_bench "JIT+Dispatch" "node friscy-run.js ${BENCH_BINARY} --jit --dispatch"

# Phase 3: with register caching
run_bench "JIT+Dispatch+RegCache" "node friscy-run.js ${BENCH_BINARY} --jit --dispatch --regcache"

# All phases combined
run_bench "All Optimizations" "node friscy-run.js ${BENCH_BINARY} --jit --all-opts"
```

### Anti-Cheating: Structural Validation

Beyond output correctness, validate that optimizations are structurally sound:

**1. Wasm validation (every generated module must be valid):**
```bash
wasm-validate output.wasm || echo "INVALID WASM — optimization broke structure"
```

**2. Instruction count sanity bounds:**
```bash
# Peephole should reduce instructions, not increase them
BEFORE=$(wasm-objdump -d before.wasm | grep -c '^\s')
AFTER=$(wasm-objdump -d after.wasm | grep -c '^\s')
if [[ $AFTER -gt $BEFORE ]]; then
    echo "SUSPICIOUS: optimization INCREASED instruction count"
fi
```

**3. No unreachable instructions introduced:**
```bash
UNREACHABLE=$(wasm-objdump -d after.wasm | grep -c 'unreachable' || true)
if [[ $UNREACHABLE -gt 0 ]]; then
    echo "WARNING: $UNREACHABLE unreachable instructions (stubbed translations?)"
fi
```

**4. Block function count preserved:**
```bash
BLOCKS_BEFORE=$(wasm-objdump -x before.wasm | grep -c 'block_')
BLOCKS_AFTER=$(wasm-objdump -x after.wasm | grep -c 'block_')
if [[ $BLOCKS_BEFORE -ne $BLOCKS_AFTER ]]; then
    echo "SUSPICIOUS: optimization changed number of block functions"
fi
```

**5. Deterministic output (same input always produces same Wasm):**
```bash
./rv2wasm test_binary -o out1.wasm
./rv2wasm test_binary -o out2.wasm
diff out1.wasm out2.wasm || echo "NON-DETERMINISTIC: same input, different output"
```

---

## Summary: Expected Cumulative Impact

```
                    Code Size    JIT Throughput    Wasm Instrs/Block
                    ─────────    ──────────────    ──────────────────
Baseline            100%         1 block/exit      ~70 per block
Phase 1 (Peephole)  80-90%       1 block/exit      ~55 per block
Phase 2 (Dispatch)  80-90%       5-100 blocks/exit  ~55 per block
Phase 3 (RegCache)  60-70%       5-100 blocks/exit  ~25 per block
                    ─────────    ──────────────    ──────────────────
Combined            ~65%         ~50x dispatch      ~65% fewer instrs
```

Wall-clock improvement estimate for compute-bound RISC-V code:

- **Phase 1 alone:** 5-15% runtime improvement
- **Phase 1 + Phase 2:** 3-10x improvement (dispatch dominates for hot loops)
- **All three phases:** 5-20x improvement over unoptimized JIT
