// rv2wasm - RISC-V to WebAssembly AOT Compiler
//
// This library provides ahead-of-time compilation of RISC-V RV64GC binaries
// to WebAssembly for 5-20x speedup over interpreted execution.
//
// # Architecture
//
// The compiler works in several phases:
//
// 1. **ELF Parsing** (`elf.rs`): Load RISC-V ELF binary, extract code sections
// 2. **Disassembly** (`disasm.rs`): Decode RISC-V instructions to structured form
// 3. **CFG Construction** (`cfg.rs`): Build control flow graph, identify basic blocks
// 4. **Translation** (`translate.rs`): Convert RISC-V to Wasm IR
// 5. **Wasm Generation** (`wasm_builder.rs`): Emit final Wasm binary
//
// # Memory Model
//
// The generated Wasm uses:
// - Linear memory for guest RAM
// - First 256 bytes reserved for register file (x0-x31, each 8 bytes)
// - PC passed as function parameter, returned as result
// - Special return values signal syscalls (high bit set)
//
// # Syscall Handling
//
// When the guest executes ECALL, the block function returns with:
// - Bit 31 set (0x80000000)
// - Lower bits contain the PC
//
// The dispatch loop recognizes this and calls the imported syscall handler.

pub mod cfg;
pub mod disasm;
pub mod elf;
pub mod translate;
pub mod wasm_builder;

pub use cfg::{BasicBlock, ControlFlowGraph, Function};
pub use disasm::{Instruction, Opcode};
pub use elf::{CodeSection, ElfInfo, Segment};
pub use translate::{WasmFunction, WasmInst, WasmModule};

/// Compile a RISC-V ELF binary to WebAssembly
pub fn compile(elf_data: &[u8], opt_level: u8, debug: bool) -> anyhow::Result<Vec<u8>> {
    // Parse ELF
    let elf_info = elf::parse(elf_data)?;

    // Extract code sections
    let code_sections = elf::extract_code_sections(elf_data, &elf_info)?;

    // Disassemble
    let mut all_instructions = Vec::new();
    for section in &code_sections {
        let instructions = disasm::disassemble(section)?;
        all_instructions.extend(instructions);
    }

    // Build CFG
    let cfg = cfg::build(&all_instructions, elf_info.entry)?;

    // Translate to Wasm IR
    let wasm_module = translate::translate(&cfg, &elf_info, opt_level, debug)?;

    // Generate Wasm binary
    wasm_builder::build(&wasm_module)
}
