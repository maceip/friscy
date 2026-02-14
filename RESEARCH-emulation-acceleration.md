# Emulation Acceleration Research: Techniques Applicable to fRISCy

## 1. Current Architecture Summary

fRISCy is a RISC-V 64-bit (RV64GC) emulator that runs Docker containers in WebAssembly in the browser. It uses a **three-tier execution pipeline**:

| Tier | Component | Speed | Startup |
|------|-----------|-------|---------|
| **Interpreter** | libriscv (C++ threaded dispatch → Wasm `br_table`) | ~40% native | Instant |
| **JIT (Tier 1)** | rv2wasm_jit — hot-region compiler (16KB regions after 50 page hits) | ~2-5x interpreter | 50-200ms/region |
| **AOT (Tier 2)** | rv2wasm — full binary ahead-of-time compiler (RISC-V → Wasm) | ~5-20x interpreter | Offline |

### Current Pipeline Bottlenecks

1. **JIT compilation latency**: 50-200ms per 16KB region; compiled asynchronously but blocks that specific code until ready.
2. **Interpreter throughput**: ~40% native via threaded dispatch (`br_table`). Each RISC-V instruction costs ~100 Wasm cycles.
3. **Indirect branch dispatch in JIT**: compiled blocks return next-PC, requiring a JS-level dispatch loop (`compiledBlocks.get(pc)`) — O(1) but with JS↔Wasm boundary crossing overhead.
4. **JIT granularity**: fixed 16KB regions compiled from page base address; no trace-based or profile-guided hot-path selection.
5. **No optimization passes in JIT tier**: the JIT compiler produces unoptimized Wasm (optimization is only at `opt_level >= 2` in AOT).
6. **Code invalidation**: page-granularity dirty tracking; entire page's blocks invalidated on any write.

---

## 2. Relevant Papers (2024-2026)

### 2.1 Tiered JIT Compilation

#### "Accelerate RISC-V Instruction Set Simulation by Tiered JIT Compilation" (ACM VMIL '24)
- **Link**: [ACM DL](https://dl.acm.org/doi/pdf/10.1145/3689490.3690399)
- **Key idea**: Two JIT tiers (T1C and T2C) for RISC-V simulation. T1C quickly generates host code from a linear IR of decoded instructions; T2C applies deeper optimizations to hot traces.
- **Applicability to fRISCy**: Our current JIT is effectively a single-tier (equivalent to their T1C). We could add a T2C tier that re-optimizes the hottest compiled regions with constant propagation, dead store elimination, and register promotion — all of which our `translate.rs` already partially supports at `opt_level >= 2` but never invokes in JIT mode.
- **Concrete action**: Enable `optimize_function()` for JIT-compiled blocks that exceed a second heat threshold (e.g., 500 page hits after initial compilation).

#### "A Lightweight Method for Generating Multi-Tier JIT Compilation VM in a Meta-Tracing Compiler Framework" (ECOOP 2025)
- **Link**: [arXiv:2504.17460](https://arxiv.org/abs/2504.17460)
- **Key idea**: Embed directives into interpreter definitions to automatically generate a lightweight tier-1 compiler from an existing heavyweight backend. 15% warmup improvement with only 5% peak regression.
- **Applicability to fRISCy**: Rather than building a separate T1 compiler, we could generate a "threaded code" tier by template-expanding common RISC-V instruction sequences directly into Wasm snippets — bypassing the full disasm→CFG→translate→encode pipeline for initial compilation, then promoting to the full pipeline for hot code.
- **Concrete action**: Create a template-based fast-path compiler that maps common instruction patterns (e.g., `LD + ADD + SD`, `ADDI + BNE loop`) to pre-built Wasm byte sequences, cutting compilation time by 5-10x for the first tier.

#### "Two-level Just-in-Time Compilation with One Interpreter and One Engine" (PEPM '22)
- **Link**: [arXiv:2201.09268](https://arxiv.org/abs/2201.09268)
- **Key idea**: Adaptive RPython — baseline JIT (threaded code) + tracing JIT, both generated from a single interpreter definition. Baseline JIT ran 1.77x faster than interpretation.
- **Applicability to fRISCy**: Validates the approach of generating a lightweight first tier from interpreter specifications. Our libriscv interpreter's instruction handlers could serve as the "specification" from which to auto-generate Wasm code templates.

### 2.2 Learned / Rule-Based Translation

#### "JavART: A Lightweight Rule-Based JIT Compiler using Translation Rules Extracted from a Learning Approach" (OOPSLA 2025)
- **Link**: [ACM DL](https://dl.acm.org/doi/10.1145/3720418)
- **Key idea**: Automatically learn translation rules offline from guest/host binaries compiled from the same source. Rules drive a lightweight JIT that compiles 5.5x faster than a traditional first-tier JIT with code that runs 6% faster. Average 1.23x speedup over interpreter + two-tier JIT.
- **Applicability to fRISCy**: We could learn RISC-V → Wasm translation rules from pairs of (riscv64-gcc output, clang-wasm output) compiled from the same C sources (e.g., musl libc, busybox, node.js). These rules would create a pattern-matching fast-path in our JIT that handles the most common instruction sequences with pre-optimized Wasm output.
- **Concrete action**: Build a training pipeline: compile N programs with both `riscv64-linux-gnu-gcc` and `clang --target=wasm32`; align instruction sequences; extract rewrite rules. Use rules as lookup table in `translate_block()`.

#### "A System-Level Dynamic Binary Translator using Automatically-Learned Translation Rules" (CGO 2024)
- **Link**: [arXiv:2402.09688](https://arxiv.org/abs/2402.09688)
- **Key idea**: Learn rules from matched guest/host binaries; verify via symbolic execution; apply in QEMU. 1.36x speedup when all optimizations applied. 48.83% of guest CPU state maintenance operations eliminated.
- **Applicability to fRISCy**: The guest CPU state elimination technique is directly relevant — our JIT-compiled blocks currently read/write all 32 registers to/from linear memory on every block entry/exit. Learned rules could identify which registers are actually live across block boundaries and eliminate redundant loads/stores.

### 2.3 Indirect Branch Optimization

#### "Tiaozhuan: A General and Efficient Indirect Branch Optimization for Binary Translation" (ACM TACO, March 2025)
- **Link**: [ACM DL](https://dl.acm.org/doi/10.1145/3703355)
- **Key idea**: Two techniques — **Full Address Mapping (FAM)** uses array-based direct indexing from guest PC to host code (replacing hash table lookup), and **Exception-Assisted Branch Elimination (EABE)** uses hardware exceptions for correctness checks instead of branch instructions. Reduces indirect branch overhead from 6.0% to 1.8% of total instruction inflation, with up to 19.4% speedup.
- **Applicability to fRISCy**: Our `jit_manager.js` uses `compiledBlocks.get(pc)` — a JavaScript Map lookup on every JIT dispatch. FAM's approach maps directly: we could use a **typed array indexed by (pc >> 2)** as a direct-mapped function table, eliminating the Map lookup entirely. For a 2GB arena with 4-byte instruction alignment, this needs a 512M-entry table — too large. But for the active code regions (typically < 16MB), a bounded array with offset works.
- **Concrete action**: Replace `compiledBlocks` Map with a `Uint32Array` of Wasm table indices, indexed by `(pc - code_base) >> 1` (since RV64C has 2-byte alignment). Use `call_indirect` through a Wasm funcref table for O(1) dispatch without JS boundary crossing.

### 2.4 Static Binary Translation

#### "Biotite: A High-Performance Static Binary Translator using Source-Level Information" (CC 2025)
- **Link**: [ACM DL](https://dl.acm.org/doi/10.1145/3708493.3712693)
- **GitHub**: [shioya-lab-public/biotite](https://github.com/shioya-lab-public/biotite)
- **Key idea**: Lifts statically-linked RV64GC Linux binaries to LLVM IR using source-level information (symbol tables, debug info) to resolve indirect jumps. Handles arbitrary indirect control flow correctly in static translation.
- **Applicability to fRISCy**: Our AOT compiler (`rv2wasm`) struggles with indirect jumps (JALR/C_JR) because targets are unknown statically. Biotite's technique of using symbol table information to enumerate possible jump targets could dramatically improve our AOT output — instead of returning to the dispatch loop on every JALR, we could inline-cache the most likely targets or use a switch table for known function pointers.
- **Concrete action**: In `cfg.rs`, when building the CFG, use ELF symbol table to identify function entry points. For JALR instructions, generate a Wasm `br_table` over known function addresses as an inline dispatch, falling back to the general dispatch only for truly unknown targets.

### 2.5 Fast Compilation Backends

#### "TPDE: A Fast Adaptable Compiler Back-End Framework" (CGO 2026)
- **Link**: [arXiv:2505.22610](https://arxiv.org/abs/2505.22610)
- **Key idea**: Single-pass compiler backend that combines instruction selection, register allocation, and encoding in one pass. Compiles LLVM IR 8-24x faster than LLVM -O0 with equivalent runtime performance. Specifically demonstrated for WebAssembly JIT contexts.
- **Applicability to fRISCy**: Our JIT pipeline (disasm → CFG → translate → wasm_builder) is multi-pass. TPDE's single-pass approach could be adapted for our Wasm output: instead of building a full CFG and translating to a WasmInst IR before encoding, we could emit Wasm bytecodes directly during a single linear scan of RISC-V instructions. This would dramatically reduce JIT compilation latency.
- **Concrete action**: Create an alternative "fast JIT" path that performs single-pass RISC-V → Wasm translation: scan instructions linearly, emit Wasm opcodes directly into a byte buffer, use a greedy approach for local variable allocation (mapping RISC-V registers to Wasm locals on first use).

#### "Whose Baseline Compiler Is It Anyway?" (arXiv:2305.13241)
- **Link**: [arXiv:2305.13241](https://arxiv.org/abs/2305.13241)
- **Key idea**: Design principles for maximally fast baseline (Wasm) compilers. Single-pass, forward-only code generation with stack-based register allocation.
- **Applicability to fRISCy**: Validates the single-pass approach for Wasm codegen. Key insight: for JIT baseline compilation, the overhead of building an IR and running optimization passes is often greater than the runtime benefit of the optimizations — especially for code that will be recompiled at a higher tier anyway.

### 2.6 WebAssembly Runtime & Performance Research

#### "Wasure: A Modular Toolkit for Comprehensive WebAssembly Benchmarking" (ICPE 2026)
- **Link**: [arXiv:2602.05488](https://arxiv.org/abs/2602.05488)
- **Key idea**: Systematic benchmarking across Wasm runtimes. AOT compilation plus instance warming substantially reduces startup latency. JIT-compiled Wasm achieves near-native performance.
- **Applicability to fRISCy**: Confirms that AOT Wasm modules should be pre-warmed (pre-instantiated) for best performance. We should pre-instantiate AOT modules on worker startup rather than lazily.

#### "Serverless Everywhere: WebAssembly Workflows Across Browser, Edge, and Cloud" (arXiv:2512.04089, Nov 2025)
- **Link**: [arXiv:2512.04089](https://arxiv.org/abs/2512.04089)
- **Key idea**: Systematic comparison showing AOT compilation dramatically reduces Wasm startup. For in-memory workloads, browser Wasm is competitive with edge/cloud due to zero-copy data exchange.
- **Applicability to fRISCy**: Our SharedArrayBuffer-based memory sharing between interpreter and JIT modules is already optimal per this research. Focus optimization effort on compilation speed rather than data transfer.

#### "WAMI: Compilation to WebAssembly through MLIR" (arXiv:2506.16048, 2025)
- **Link**: [arXiv:2506.16048](https://arxiv.org/abs/2506.16048)
- **Key idea**: Skip LLVM IR entirely and go from a domain-specific IR directly to Wasm binary. LLVM optimizations may not help when the Wasm runtime applies its own optimizations.
- **Applicability to fRISCy**: Confirms our approach of generating Wasm directly from RISC-V rather than going through LLVM. However, we should be aware that the browser's Wasm JIT (V8/SpiderMonkey) will apply its own optimizations — so our JIT output doesn't need to be heavily optimized, it just needs to be structurally clean enough for the browser JIT to optimize effectively.

### 2.7 Peephole & Superoptimization

#### "Performance Improvements via Peephole Optimization in Dynamic Binary Translation" (MDPI Electronics, April 2024)
- **Link**: [MDPI](https://www.mdpi.com/2079-9292/13/9/1608)
- **Key idea**: Apply peephole optimization patterns to translated code, exploiting target architecture features that the basic translation misses.
- **Applicability to fRISCy**: Our translator generates verbose Wasm (e.g., `local.get 0; i64.const 8; i64.add; local.set 0` for `ADDI x0, x0, 8`). Peephole patterns could merge sequences like load-compute-store into more efficient Wasm sequences, or exploit Wasm's stack machine nature to avoid unnecessary local.get/local.set pairs.
- **Concrete action**: Add a peephole optimization pass in `translate.rs` that operates on the WasmInst vector before encoding. Target patterns: redundant local.get after local.set of same variable; constant folding of consecutive i64.const + i64.add; merging sequential memory accesses.

#### "Binary Translation Using Peephole Superoptimizers" (Bansal & Aiken)
- **Link**: [Semantic Scholar](https://www.semanticscholar.org/paper/Binary-Translation-Using-Peephole-Superoptimizers-Bansal-Aiken/09a890d0ec90d80207cd6414c719f065a929a07d)
- **Key idea**: Use superoptimization to find optimal instruction sequences for common translation patterns. Near-optimal mapping from 31-register source ISA to smaller host register file.
- **Applicability to fRISCy**: Wasm has unlimited locals (analogous to registers), so register pressure isn't the issue — but superoptimization could find shorter Wasm instruction sequences for common RISC-V idioms. A lookup table of {RISC-V pattern → optimal Wasm sequence} would benefit both JIT and AOT.

### 2.8 Advanced Optimizations in Hybrid Pipelines

#### "Advanced Optimizations in Modern Compilers: JIT, AOT and Hybrid Pipelines" (ResearchGate, 2026)
- **Link**: [ResearchGate](https://www.researchgate.net/publication/399489615)
- **Key idea**: Hybrid compilers combine static and dynamic optimizations. Key techniques: profile-guided optimization (PGO), speculative optimization with deoptimization, on-stack replacement (OSR) between tiers.
- **Applicability to fRISCy**: We currently have no mechanism for on-stack replacement — the interpreter and JIT operate as separate systems with handoff only at block boundaries. Implementing lightweight OSR (at loop back-edges) would allow transitioning from interpreter to JIT mid-execution of a hot loop, rather than waiting for the entire region to be compiled.

---

## 3. Prioritized Acceleration Opportunities

Based on the research above and analysis of fRISCy's current architecture, here are the highest-impact improvements ranked by estimated effort/impact ratio:

### Priority 1: Eliminate JS↔Wasm Dispatch Overhead (Tiaozhuan-inspired)

**Current**: JIT-compiled blocks return next-PC to JavaScript, which does a `Map.get()` lookup and calls back into Wasm.

**Proposed**: Generate a Wasm-native dispatch loop that chains compiled blocks together via `call_indirect` on a funcref table. The dispatch stays entirely within Wasm, only exiting to JS for syscalls or cache misses.

**Expected impact**: 2-5x reduction in JIT dispatch overhead (eliminates ~10-20 JS↔Wasm boundary crossings per block execution).

**Relevant papers**: Tiaozhuan (TACO 2025), "Accelerate RISC-V ISS by Tiered JIT" (VMIL '24)

### Priority 2: Single-Pass Fast JIT Tier (TPDE-inspired)

**Current**: JIT compilation takes 4 passes: disasm → CFG build → IR translation → Wasm encoding.

**Proposed**: Add a "T0" fast-JIT that does single-pass linear translation: scan RISC-V bytes, emit Wasm bytecodes directly. No CFG, no IR, no optimization. Produces correct but unoptimized Wasm in ~5-10ms per region (vs. current 50-200ms). Promote to full JIT (T1) after additional heat threshold.

**Expected impact**: 10-20x faster initial compilation, meaning JIT benefits kick in 10-20x sooner.

**Relevant papers**: TPDE (CGO 2026), "Whose Baseline Compiler" (arXiv:2305.13241), Multi-Tier JIT (ECOOP 2025)

### Priority 3: Trace-Based Hot Path Compilation

**Current**: JIT compiles fixed 16KB regions starting at page boundaries — many cold instructions are compiled unnecessarily.

**Proposed**: Instead of region-based compilation, trace hot execution paths: record sequences of PCs during interpretation, identify hot traces (loops, frequently-called functions), compile only those traces. This is the approach used by TraceMonkey, LuaJIT, and the VMIL '24 RISC-V paper.

**Expected impact**: 3-5x reduction in compiled code size, better instruction cache utilization, enables trace-specific optimizations (e.g., speculative inlining across basic blocks).

**Relevant papers**: "Accelerate RISC-V ISS by Tiered JIT" (VMIL '24), "Threaded Code Generation with Meta-Tracing JIT" (arXiv:2106.12496)

### Priority 4: Learned Translation Rules for Common Libraries

**Current**: Every RISC-V instruction is individually translated to Wasm IR.

**Proposed**: Offline, compile musl libc, busybox, and Node.js core functions with both riscv64-gcc and clang-wasm. Extract matched instruction-sequence pairs. At JIT time, pattern-match against the rule database and emit pre-optimized Wasm for recognized sequences.

**Expected impact**: 1.2-1.4x speedup for code from standard libraries (which is a large fraction of total execution), plus faster compilation for matched patterns.

**Relevant papers**: JavART (OOPSLA 2025), "System-Level DBT with Learned Rules" (CGO 2024)

### Priority 5: Peephole Optimization of Wasm Output

**Current**: Translation produces correct but verbose Wasm (many redundant local.get/set, unnecessary sign extensions, etc.).

**Proposed**: Add a lightweight peephole pass over the WasmInst vector before encoding. Target patterns:
- `local.set N; local.get N` → `local.tee N`
- `i64.const X; i64.const Y; i64.add` → `i64.const (X+Y)`
- `i64.extend32_s` after already-32-bit values → remove
- Sequential loads/stores to adjacent addresses → potential bulk operations

**Expected impact**: 10-30% reduction in Wasm code size, 5-15% runtime improvement (less work for browser JIT).

**Relevant papers**: "Peephole Optimization in DBT" (MDPI 2024), "Binary Translation Using Peephole Superoptimizers" (Bansal & Aiken)

### Priority 6: Symbol-Guided Indirect Branch Resolution (Biotite-inspired)

**Current**: JALR/C_JR instructions in AOT mode cause a return to the dispatch function (expensive).

**Proposed**: Use ELF symbol tables and relocation info to identify function pointer targets. For PLT-style indirect calls, enumerate possible targets and generate Wasm `br_table` for inline dispatch. For virtual dispatch (vtable), use inline caching with one expected target + fallback.

**Expected impact**: 5-20% improvement in AOT-compiled code with many indirect calls (common in dynamically-linked code).

**Relevant papers**: Biotite (CC 2025), Tiaozhuan (TACO 2025)

### Priority 7: Guest Register Liveness Analysis

**Current**: JIT blocks load all 32 registers at entry and store all at exit (to/from Wasm linear memory).

**Proposed**: Perform liveness analysis on the basic block to determine which registers are actually read (need loading) and which are actually written (need storing). Only load/store live registers. For leaf functions, many registers (especially callee-saved) are never touched.

**Expected impact**: 30-50% reduction in memory traffic per block, 10-20% overall speedup for JIT code.

**Relevant papers**: "System-Level DBT with Learned Rules" (CGO 2024), "Register Allocation of DBT Based on Priority" (Zhejiang Univ.)

---

## 4. Recommended Implementation Roadmap

```
Phase 1 (Quick Wins):
  ├── P5: Peephole optimization pass in translate.rs
  ├── P7: Register liveness analysis in translate_block()
  └── P1: Wasm-internal dispatch loop (modify wasm_builder.rs build_jit)

Phase 2 (Medium Effort):
  ├── P2: Single-pass fast JIT tier (new fast_translate.rs)
  └── P3: Trace recording in interpreter + trace-based compilation

Phase 3 (Research-Heavy):
  ├── P4: Learned translation rules pipeline
  └── P6: Symbol-guided indirect branch resolution in AOT
```

---

## 5. Sources

- [Accelerate RISC-V ISS by Tiered JIT Compilation (VMIL '24)](https://dl.acm.org/doi/pdf/10.1145/3689490.3690399)
- [Multi-Tier JIT in Meta-Tracing Frameworks (ECOOP 2025)](https://arxiv.org/abs/2504.17460)
- [Two-level JIT Compilation (PEPM '22)](https://arxiv.org/abs/2201.09268)
- [JavART: Rule-Based JIT Compiler (OOPSLA 2025)](https://dl.acm.org/doi/10.1145/3720418)
- [System-Level DBT with Learned Translation Rules (CGO 2024)](https://arxiv.org/abs/2402.09688)
- [Tiaozhuan: Indirect Branch Optimization for BT (TACO 2025)](https://dl.acm.org/doi/10.1145/3703355)
- [Biotite: Static Binary Translator with Source-Level Info (CC 2025)](https://dl.acm.org/doi/10.1145/3708493.3712693)
- [TPDE: Fast Adaptable Compiler Backend (CGO 2026)](https://arxiv.org/abs/2505.22610)
- [Whose Baseline Compiler Is It Anyway? (arXiv 2023)](https://arxiv.org/abs/2305.13241)
- [Wasure: WebAssembly Benchmarking (ICPE 2026)](https://arxiv.org/abs/2602.05488)
- [Serverless Everywhere: Wasm Workflows (arXiv 2025)](https://arxiv.org/abs/2512.04089)
- [WAMI: Compilation to Wasm through MLIR (arXiv 2025)](https://arxiv.org/abs/2506.16048)
- [Peephole Optimization in DBT (MDPI 2024)](https://www.mdpi.com/2079-9292/13/9/1608)
- [Advanced Optimizations: JIT, AOT and Hybrid Pipelines (2026)](https://www.researchgate.net/publication/399489615)
- [Partial Evaluation, Whole-Program Compilation (arXiv 2024)](https://arxiv.org/abs/2411.10559)
- [Not So Fast: WebAssembly vs. Native Code (arXiv 2019)](https://ar5iv.labs.arxiv.org/html/1901.09056)
- [libriscv: RISC-V Binary Translation (2024)](https://fwsgonzo.medium.com/libriscv-risc-v-binary-translation-part-2-deb3589375ad)
