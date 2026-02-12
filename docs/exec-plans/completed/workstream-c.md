# ExecPlan: Workstream C — AOT Compiler (rv2wasm)

## Progress

- [x] ELF parser with goblin crate
- [x] RV64GC disassembler — 80+ opcodes decoded
- [x] Control flow graph builder — basic block identification
- [x] Integer arithmetic translation (add, sub, addi, shifts, etc.)
- [x] Memory access translation (loads and stores)
- [x] Branch translation (beq, bne, blt, bge, etc.)
- [x] Jump handling with PC return for dispatch
- [x] Syscall handling (ecall → special return value)
- [x] Wasm module builder with wasm-encoder
- [ ] Floating-point translation (stubs emit Unreachable)
- [ ] Atomic instruction translation (simplified single-thread stubs)
- [ ] br_table dispatch optimization (currently linear scan)
- [ ] friscy-pack --aot integration

## Surprises & Discoveries

- RISC-V's regular encoding made disassembly straightforward — 1,033 LOC
  covers the entire RV64GC ISA.
- Wasm's structured control flow (blocks, loops, br) cannot directly
  represent arbitrary GOTOs — the dispatch loop pattern is necessary.
- Linear dispatch (if-else chain) is O(n) per block — br_table would
  make it O(1) but requires contiguous block indices.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01 | Rust for AOT compiler | Type safety for instruction encoding; wasm-encoder crate available |
| 2025-01 | Dispatch loop over relooper | Simpler implementation; br_table optimization deferred |
| 2025-02 | Stub FP instructions | Integer workloads are priority; FP can be added incrementally |

## Outcomes & Retrospective

AOT compiler is ~70% complete.  Integer workloads compile and run correctly.
The remaining 30% (FP, atomics, br_table, integration) is tracked in the
tech debt tracker.  The architecture is sound — translation is modular and
each instruction category can be added independently.
