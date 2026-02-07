# rv2wasm - RISC-V to WebAssembly AOT Compiler

Ahead-of-time compiler that translates RISC-V RV64GC binaries to WebAssembly
for 5-20x speedup over interpreted execution.

## Status: Work in Progress

### Implemented
- [x] ELF parsing (goblin crate)
- [x] RISC-V disassembler (80+ opcodes: RV64IMAFDC)
- [x] Control flow graph construction
- [x] Basic block identification
- [x] RISC-V → Wasm IR translation (core integer ops)
- [x] Wasm binary generation (wasm-encoder)

### In Progress
- [ ] Dispatch loop optimization (br_table)
- [ ] Floating-point instruction translation
- [ ] Atomics instruction translation
- [ ] End-to-end testing

### Future
- [ ] Integration with friscy-pack `--aot` flag
- [ ] Wizer snapshot support
- [ ] Dynamic library support

## Building

```bash
cd rv2wasm
cargo build --release
```

## Usage

```bash
# Compile a RISC-V binary to Wasm
rv2wasm input.elf -o output.wasm

# With debug info
rv2wasm input.elf -o output.wasm --debug --verbose

# From container rootfs (future)
rv2wasm --rootfs alpine.tar --entry /bin/busybox -o busybox.wasm
```

## Architecture

```
RISC-V ELF  →  ELF Parser  →  Disassembler  →  CFG Builder  →  Translator  →  Wasm Binary
   (.elf)      (goblin)      (RV64GC)         (basic blocks)   (RV→Wasm)      (wasm-encoder)
```

### Memory Layout

The generated Wasm uses:
- First 256 bytes: Register file (x0-x31, each 8 bytes)
- Rest: Guest RAM

### Function Signature

Each basic block compiles to:
```wat
(func $block_XXXX (param $m i32) (result i32)
  ;; $m = pointer to machine state
  ;; Returns: next PC to execute
  ;;   -1 = halt
  ;;   0x80000000 | pc = syscall at pc
)
```

### Syscall Handling

When ECALL executes:
1. Block returns `0x80000000 | pc`
2. Dispatch loop recognizes the high bit
3. Calls imported `syscall` handler
4. Handler processes and returns next PC
5. Dispatch continues

## Supported Instructions

### RV64I Base
ADD, SUB, AND, OR, XOR, SLL, SRL, SRA, SLT, SLTU,
ADDI, ANDI, ORI, XORI, SLLI, SRLI, SRAI, SLTI, SLTIU,
LUI, AUIPC, JAL, JALR,
BEQ, BNE, BLT, BGE, BLTU, BGEU,
LB, LH, LW, LD, LBU, LHU, LWU,
SB, SH, SW, SD,
FENCE, ECALL, EBREAK

### RV64M (Multiply)
MUL, MULH, MULHSU, MULHU, DIV, DIVU, REM, REMU,
MULW, DIVW, DIVUW, REMW, REMUW

### RV64A (Atomics)
LR.W, SC.W, AMOSWAP.W, AMOADD.W, AMOXOR.W, AMOAND.W, AMOOR.W,
AMOMIN.W, AMOMAX.W, AMOMINU.W, AMOMAXU.W,
LR.D, SC.D, AMOSWAP.D, AMOADD.D, AMOXOR.D, AMOAND.D, AMOOR.D,
AMOMIN.D, AMOMAX.D, AMOMINU.D, AMOMAXU.D

### RV64C (Compressed)
C.ADDI4SPN, C.LW, C.SW, C.NOP, C.ADDI, C.JAL, C.LI, C.ADDI16SP,
C.LUI, C.SRLI, C.SRAI, C.ANDI, C.SUB, C.XOR, C.OR, C.AND,
C.J, C.BEQZ, C.BNEZ, C.SLLI, C.LWSP, C.JR, C.MV, C.EBREAK,
C.JALR, C.ADD, C.SWSP, C.LD, C.SD, C.LDSP, C.SDSP, C.ADDIW,
C.SUBW, C.ADDW

### RV64F/D (Floating-point)
Stubs defined, translation pending.

## License

Part of the friscy project.
