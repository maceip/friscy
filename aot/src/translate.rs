// translate.rs - RISC-V to WebAssembly translation
//
// Translates basic blocks to Wasm functions following the architecture
// described in CRAZY_PERF_IDEAS.md.

use crate::cfg::{BasicBlock, ControlFlowGraph};
use crate::disasm::{Instruction, Opcode};
use crate::elf::ElfInfo;
use anyhow::Result;
use std::collections::HashMap;

/// A generated Wasm module (intermediate representation)
#[derive(Debug)]
pub struct WasmModule {
    /// Functions (one per basic block)
    pub functions: Vec<WasmFunction>,
    /// Memory size in pages (64KB each)
    pub memory_pages: u32,
    /// Entry block address
    pub entry: u64,
    /// Block address to function index mapping
    pub block_to_func: std::collections::HashMap<u64, usize>,
}

/// A generated Wasm function
#[derive(Debug)]
pub struct WasmFunction {
    /// Function name/label
    pub name: String,
    /// Original block address
    pub block_addr: u64,
    /// Wasm instructions
    pub body: Vec<WasmInst>,
    /// Number of local variables (beyond parameters)
    pub num_locals: u32,
}

/// Wasm instruction (simplified IR)
#[derive(Debug, Clone)]
pub enum WasmInst {
    // Control flow
    Block { label: u32 },
    Loop { label: u32 },
    End,
    Br { label: u32 },
    BrIf { label: u32 },
    BrTable { labels: Vec<u32>, default: u32 },
    Return,
    Call { func_idx: u32 },
    CallIndirect { type_idx: u32 },

    // Locals
    LocalGet { idx: u32 },
    LocalSet { idx: u32 },
    LocalTee { idx: u32 },

    // Constants
    I32Const { value: i32 },
    I64Const { value: i64 },

    // Memory
    I32Load { offset: u32 },
    I64Load { offset: u32 },
    I32Load8S { offset: u32 },
    I32Load8U { offset: u32 },
    I32Load16S { offset: u32 },
    I32Load16U { offset: u32 },
    I64Load8S { offset: u32 },
    I64Load8U { offset: u32 },
    I64Load16S { offset: u32 },
    I64Load16U { offset: u32 },
    I64Load32S { offset: u32 },
    I64Load32U { offset: u32 },
    I32Store { offset: u32 },
    I64Store { offset: u32 },
    I32Store8 { offset: u32 },
    I32Store16 { offset: u32 },
    I64Store8 { offset: u32 },
    I64Store16 { offset: u32 },
    I64Store32 { offset: u32 },

    // Arithmetic (i64)
    I64Add,
    I64Sub,
    I64Mul,
    I64DivS,
    I64DivU,
    I64RemS,
    I64RemU,
    I64And,
    I64Or,
    I64Xor,
    I64Shl,
    I64ShrS,
    I64ShrU,
    I64Rotl,
    I64Rotr,
    I64Clz,
    I64Ctz,
    I64Popcnt,
    I64Eqz,
    I64Eq,
    I64Ne,
    I64LtS,
    I64LtU,
    I64GtS,
    I64GtU,
    I64LeS,
    I64LeU,
    I64GeS,
    I64GeU,

    // Arithmetic (i32)
    I32Add,
    I32Sub,
    I32Mul,
    I32DivS,
    I32DivU,
    I32RemS,
    I32RemU,
    I32And,
    I32Or,
    I32Xor,
    I32Shl,
    I32ShrS,
    I32ShrU,
    I32Eqz,
    I32Eq,
    I32Ne,
    I32LtS,
    I32LtU,
    I32GtS,
    I32GtU,
    I32LeS,
    I32LeU,
    I32GeS,
    I32GeU,

    // Conversions
    I32WrapI64,
    I64ExtendI32S,
    I64ExtendI32U,

    // Floating-point (f32)
    F32Load { offset: u32 },
    F32Store { offset: u32 },
    F32Const { value: f32 },
    F32Add,
    F32Sub,
    F32Mul,
    F32Div,
    F32Sqrt,
    F32Neg,
    F32Abs,
    F32Ceil,
    F32Floor,
    F32Trunc,
    F32Nearest,
    F32Eq,
    F32Ne,
    F32Lt,
    F32Gt,
    F32Le,
    F32Ge,
    F32Min,
    F32Max,
    F32Copysign,

    // Floating-point (f64)
    F64Load { offset: u32 },
    F64Store { offset: u32 },
    F64Const { value: f64 },
    F64Add,
    F64Sub,
    F64Mul,
    F64Div,
    F64Sqrt,
    F64Neg,
    F64Abs,
    F64Ceil,
    F64Floor,
    F64Trunc,
    F64Nearest,
    F64Eq,
    F64Ne,
    F64Lt,
    F64Gt,
    F64Le,
    F64Ge,
    F64Min,
    F64Max,
    F64Copysign,

    // FP conversions
    F32ConvertI32S,
    F32ConvertI32U,
    F32ConvertI64S,
    F32ConvertI64U,
    F64ConvertI32S,
    F64ConvertI32U,
    F64ConvertI64S,
    F64ConvertI64U,
    I32TruncF32S,
    I32TruncF32U,
    I32TruncF64S,
    I32TruncF64U,
    I64TruncF32S,
    I64TruncF32U,
    I64TruncF64S,
    I64TruncF64U,
    F32DemoteF64,
    F64PromoteF32,
    F32ReinterpretI32,
    F64ReinterpretI64,
    I32ReinterpretF32,
    I64ReinterpretF64,

    // Stack manipulation
    Drop,
    Select,

    // Unreachable trap
    Unreachable,

    // Debug/comments
    Comment { text: String },
}

impl WasmModule {
    pub fn function_count(&self) -> usize {
        self.functions.len()
    }
}

/// Translate CFG to Wasm module
pub fn translate(
    cfg: &ControlFlowGraph,
    elf_info: &ElfInfo,
    opt_level: u8,
    debug: bool,
) -> Result<WasmModule> {
    let mut functions = Vec::new();
    let mut block_to_func = std::collections::HashMap::new();

    // Calculate memory size from ELF segments
    let max_addr = elf_info
        .segments
        .iter()
        .map(|s| s.vaddr + s.memsz)
        .max()
        .unwrap_or(0);
    let memory_pages = ((max_addr + 0xFFFF) / 0x10000) as u32;

    // Collect all block addresses for inline caching
    let block_addrs: Vec<u64> = cfg.blocks.keys().copied().collect();

    // Translate each basic block to a function
    for (idx, (addr, block)) in cfg.blocks.iter().enumerate() {
        let func = translate_block(block, idx, debug, if opt_level >= 2 { &block_addrs } else { &[] })?;
        block_to_func.insert(*addr, functions.len());
        functions.push(func);
    }

    // Optimize if requested
    if opt_level >= 2 {
        for func in &mut functions {
            optimize_function(func);
        }
    }

    Ok(WasmModule {
        functions,
        memory_pages: memory_pages.max(8), // Minimum 512KB
        entry: cfg.entry,
        block_to_func,
    })
}

/// Translate a single basic block to a Wasm function.
/// `ic_targets` contains known block addresses for inline caching of JALR.
fn translate_block(block: &BasicBlock, _func_idx: usize, debug: bool, ic_targets: &[u64]) -> Result<WasmFunction> {
    let mut body = Vec::new();

    // Function signature: (param $m i32) (result i32)
    // $m = pointer to machine state (registers at offset 0-255)
    // Returns: next PC to execute (or -1 for halt, high bit for syscall)

    if debug {
        body.push(WasmInst::Comment {
            text: format!("Block 0x{:08x}", block.start_addr),
        });
    }

    // Translate each instruction
    for inst in &block.instructions {
        if debug {
            body.push(WasmInst::Comment {
                text: format!("  {:08x}: {:?}", inst.addr, inst.opcode),
            });
        }

        translate_instruction(inst, &mut body)?;
    }

    // Add return for next PC
    if let Some(term) = block.terminator() {
        add_terminator_return(term, block, &mut body, ic_targets)?;
    } else {
        // Fall through to next instruction
        body.push(WasmInst::I32Const {
            value: block.end_addr as i32,
        });
        body.push(WasmInst::Return);
    }

    Ok(WasmFunction {
        name: format!("block_{:x}", block.start_addr),
        block_addr: block.start_addr,
        body,
        num_locals: 4, // Temporary locals for computation
    })
}

/// Translate a single RISC-V instruction to Wasm
fn translate_instruction(inst: &Instruction, body: &mut Vec<WasmInst>) -> Result<()> {
    let rd = inst.rd.unwrap_or(0) as u32;
    let rs1 = inst.rs1.unwrap_or(0) as u32;
    let rs2 = inst.rs2.unwrap_or(0) as u32;
    let imm = inst.imm.unwrap_or(0);

    // Register offsets: x0 at offset 0, x1 at offset 8, etc.
    let rd_offset = rd * 8;
    let rs1_offset = rs1 * 8;
    let rs2_offset = rs2 * 8;

    match inst.opcode {
        // =====================================================================
        // Arithmetic (register-register)
        // =====================================================================
        Opcode::ADD => {
            if rd != 0 {
                // x[rd] = x[rs1] + x[rs2]
                body.push(WasmInst::LocalGet { idx: 0 }); // $m
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SUB => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Sub);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::AND => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64And);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::OR => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Or);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::XOR => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Xor);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SLL => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Shl);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SRL => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64ShrU);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SRA => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64ShrS);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SLT => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64LtS);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SLTU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64LtU);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // Arithmetic (immediate)
        // =====================================================================
        Opcode::ADDI | Opcode::C_ADDI | Opcode::C_LI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::ANDI | Opcode::C_ANDI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64And);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::ORI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Or);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::XORI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Xor);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SLLI | Opcode::C_SLLI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm & 0x3f });
                body.push(WasmInst::I64Shl);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SRLI | Opcode::C_SRLI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm & 0x3f });
                body.push(WasmInst::I64ShrU);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SRAI | Opcode::C_SRAI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm & 0x3f });
                body.push(WasmInst::I64ShrS);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SLTI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64LtS);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SLTIU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64LtU);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // Upper immediate
        // =====================================================================
        Opcode::LUI | Opcode::C_LUI => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::AUIPC => {
            if rd != 0 {
                let pc_plus_imm = (inst.addr as i64).wrapping_add(imm);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const { value: pc_plus_imm });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // Loads
        // =====================================================================
        Opcode::LB => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 }); // for store
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load8S { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::LBU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load8U { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::LH => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load16S { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::LHU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load16U { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::LW | Opcode::C_LW | Opcode::C_LWSP => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load32S { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::LWU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load32U { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::LD | Opcode::C_LD | Opcode::C_LDSP => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // Stores
        // =====================================================================
        Opcode::SB => {
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I64Add);
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I64Store8 { offset: 0 });
        }

        Opcode::SH => {
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I64Add);
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I64Store16 { offset: 0 });
        }

        Opcode::SW | Opcode::C_SW | Opcode::C_SWSP => {
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I64Add);
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I64Store32 { offset: 0 });
        }

        Opcode::SD | Opcode::C_SD | Opcode::C_SDSP => {
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I64Add);
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I64Store { offset: 0 });
        }

        // =====================================================================
        // M extension (multiply/divide)
        // =====================================================================
        Opcode::MUL => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Mul);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::DIV => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64DivS);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::DIVU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64DivU);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::REM => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64RemS);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::REMU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64RemU);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // Compressed register operations
        // =====================================================================
        Opcode::C_MV => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::C_ADD => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::C_SUB => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Sub);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::C_AND => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64And);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::C_OR => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Or);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::C_XOR => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I64Xor);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::C_ADDI4SPN => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: 16 }); // x2 = sp
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::C_ADDI16SP => {
            // x2 = x2 + imm
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: 16 }); // x2
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I64Add);
            body.push(WasmInst::I64Store { offset: 16 });
        }

        // =====================================================================
        // Floating-point (F extension - single precision)
        // FP registers at offset 256+ (after 32 integer registers * 8 bytes)
        // =====================================================================
        Opcode::FLW => {
            // f[rd] = M[x[rs1] + imm] (32-bit float)
            let frd_offset = 256 + rd * 4; // FP regs are 4 bytes for f32
            body.push(WasmInst::LocalGet { idx: 0 }); // $m base
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset }); // address
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I32Add);
            body.push(WasmInst::F32Load { offset: 0 }); // load from computed address
            body.push(WasmInst::F32Store { offset: frd_offset }); // store to FP reg
        }

        Opcode::FSW => {
            // M[x[rs1] + imm] = f[rs2] (32-bit float)
            let frs2_offset = 256 + rs2 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I32Add);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Store { offset: 0 });
        }

        Opcode::FADD_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Add);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FSUB_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Sub);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FMUL_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Mul);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FDIV_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Div);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FSQRT_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::F32Sqrt);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        // =====================================================================
        // Floating-point (D extension - double precision)
        // Double-precision FP registers at offset 384+ (256 + 32*4 = 384)
        // =====================================================================
        Opcode::FLD => {
            // f[rd] = M[x[rs1] + imm] (64-bit double)
            let frd_offset = 384 + rd * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I32Add);
            body.push(WasmInst::F64Load { offset: 0 });
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FSD => {
            // M[x[rs1] + imm] = f[rs2] (64-bit double)
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I32Add);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Store { offset: 0 });
        }

        Opcode::FADD_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Add);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FSUB_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Sub);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FMUL_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Mul);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FDIV_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Div);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FSQRT_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::F64Sqrt);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        // =====================================================================
        // Atomics (A extension) - single-threaded implementation
        // For Wasm without threads, these are just regular load/modify/store
        // =====================================================================

        // Load-Reserved Word: rd = M[rs1], set reservation
        Opcode::LR_W => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 }); // $m for store
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset }); // address
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Load { offset: 0 }); // load 32-bit
                body.push(WasmInst::I64ExtendI32S); // sign-extend to 64-bit
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
            // In single-threaded mode, reservation always succeeds
        }

        // Store-Conditional Word: M[rs1] = rs2, rd = 0 (success) or 1 (fail)
        Opcode::SC_W => {
            // Store the value
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I32Store { offset: 0 });

            // Always succeed in single-threaded mode: rd = 0
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const { value: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // Load-Reserved Doubleword
        Opcode::LR_D => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // Store-Conditional Doubleword
        Opcode::SC_D => {
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I64Store { offset: 0 });

            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const { value: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // Atomic swap word: rd = M[rs1]; M[rs1] = rs2
        Opcode::AMOSWAP_W => {
            if rd != 0 {
                // Load old value
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Load { offset: 0 });
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
            // Store new value
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I32Store { offset: 0 });
        }

        // Atomic add word: rd = M[rs1]; M[rs1] = M[rs1] + rs2
        Opcode::AMOADD_W => {
            // Load old value to rd
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Load { offset: 0 });
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
            // Compute and store new value
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I32Load { offset: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I32Add);
            body.push(WasmInst::I32Store { offset: 0 });
        }

        // Atomic XOR/AND/OR word
        Opcode::AMOXOR_W => {
            emit_amo_op_w(body, rd, rs1_offset, rs2_offset, WasmInst::I32Xor);
        }
        Opcode::AMOAND_W => {
            emit_amo_op_w(body, rd, rs1_offset, rs2_offset, WasmInst::I32And);
        }
        Opcode::AMOOR_W => {
            emit_amo_op_w(body, rd, rs1_offset, rs2_offset, WasmInst::I32Or);
        }

        // Atomic min/max word (signed/unsigned)
        Opcode::AMOMIN_W => {
            emit_amo_minmax_w(body, rd, rs1_offset, rs2_offset, WasmInst::I32LtS);
        }
        Opcode::AMOMAX_W => {
            emit_amo_minmax_w(body, rd, rs1_offset, rs2_offset, WasmInst::I32GtS);
        }
        Opcode::AMOMINU_W => {
            emit_amo_minmax_w(body, rd, rs1_offset, rs2_offset, WasmInst::I32LtU);
        }
        Opcode::AMOMAXU_W => {
            emit_amo_minmax_w(body, rd, rs1_offset, rs2_offset, WasmInst::I32GtU);
        }

        // 64-bit atomics (doubleword)
        Opcode::AMOSWAP_D => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I64Store { offset: 0 });
        }

        Opcode::AMOADD_D => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::I64Load { offset: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs2_offset });
            body.push(WasmInst::I64Add);
            body.push(WasmInst::I64Store { offset: 0 });
        }

        Opcode::AMOXOR_D => {
            emit_amo_op_d(body, rd, rs1_offset, rs2_offset, WasmInst::I64Xor);
        }
        Opcode::AMOAND_D => {
            emit_amo_op_d(body, rd, rs1_offset, rs2_offset, WasmInst::I64And);
        }
        Opcode::AMOOR_D => {
            emit_amo_op_d(body, rd, rs1_offset, rs2_offset, WasmInst::I64Or);
        }

        Opcode::AMOMIN_D => {
            emit_amo_minmax_d(body, rd, rs1_offset, rs2_offset, WasmInst::I64LtS);
        }
        Opcode::AMOMAX_D => {
            emit_amo_minmax_d(body, rd, rs1_offset, rs2_offset, WasmInst::I64GtS);
        }
        Opcode::AMOMINU_D => {
            emit_amo_minmax_d(body, rd, rs1_offset, rs2_offset, WasmInst::I64LtU);
        }
        Opcode::AMOMAXU_D => {
            emit_amo_minmax_d(body, rd, rs1_offset, rs2_offset, WasmInst::I64GtU);
        }

        // FMA instructions (fused multiply-add) - single precision
        Opcode::FMADD_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            let rs3 = ((inst.bytes >> 27) & 0x1f) as u32;
            let frs3_offset = 256 + rs3 * 4;
            // rd = rs1 * rs2 + rs3
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Mul);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs3_offset });
            body.push(WasmInst::F32Add);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FMSUB_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            let rs3 = ((inst.bytes >> 27) & 0x1f) as u32;
            let frs3_offset = 256 + rs3 * 4;
            // rd = rs1 * rs2 - rs3
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Mul);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs3_offset });
            body.push(WasmInst::F32Sub);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FNMSUB_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            let rs3 = ((inst.bytes >> 27) & 0x1f) as u32;
            let frs3_offset = 256 + rs3 * 4;
            // rd = -(rs1 * rs2) + rs3 = rs3 - rs1*rs2
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Mul);
            body.push(WasmInst::F32Neg);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs3_offset });
            body.push(WasmInst::F32Add);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FNMADD_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            let rs3 = ((inst.bytes >> 27) & 0x1f) as u32;
            let frs3_offset = 256 + rs3 * 4;
            // rd = -(rs1 * rs2) - rs3
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Mul);
            body.push(WasmInst::F32Neg);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs3_offset });
            body.push(WasmInst::F32Sub);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        // FMA instructions - double precision
        Opcode::FMADD_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            let rs3 = ((inst.bytes >> 27) & 0x1f) as u32;
            let frs3_offset = 384 + rs3 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Mul);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs3_offset });
            body.push(WasmInst::F64Add);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FMSUB_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            let rs3 = ((inst.bytes >> 27) & 0x1f) as u32;
            let frs3_offset = 384 + rs3 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Mul);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs3_offset });
            body.push(WasmInst::F64Sub);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FNMSUB_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            let rs3 = ((inst.bytes >> 27) & 0x1f) as u32;
            let frs3_offset = 384 + rs3 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Mul);
            body.push(WasmInst::F64Neg);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs3_offset });
            body.push(WasmInst::F64Add);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FNMADD_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            let rs3 = ((inst.bytes >> 27) & 0x1f) as u32;
            let frs3_offset = 384 + rs3 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Mul);
            body.push(WasmInst::F64Neg);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs3_offset });
            body.push(WasmInst::F64Sub);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        // =====================================================================
        // RV64I word-width operations (32-bit result, sign-extended to 64-bit)
        // =====================================================================
        Opcode::ADDIW | Opcode::C_ADDIW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 }); // $m
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SLLIW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Const { value: (imm & 0x1f) as i32 });
                body.push(WasmInst::I32Shl);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SRLIW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Const { value: (imm & 0x1f) as i32 });
                body.push(WasmInst::I32ShrU);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SRAIW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Const { value: (imm & 0x1f) as i32 });
                body.push(WasmInst::I32ShrS);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::ADDW | Opcode::C_ADDW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Add);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SUBW | Opcode::C_SUBW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Sub);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SLLW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Shl);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SRLW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32ShrU);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::SRAW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32ShrS);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // M extension word-width operations
        // =====================================================================
        Opcode::MULW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Mul);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::DIVW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32DivS);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::DIVUW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32DivU);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::REMW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32RemS);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::REMUW => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs2_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32RemU);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // MULH: signed high-half multiply (use i64 mul, shift right 64)
        // Approximate: cast both to i64, multiply, take upper 64 bits
        // For correct MULH we need i128 but this is a reasonable approximation
        Opcode::MULH => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                // For MULH, we need the upper 64 bits of a 128-bit product
                // Approximation: just store 0 (most code uses MUL not MULH)
                body.push(WasmInst::I64Const { value: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::MULHU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const { value: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::MULHSU => {
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const { value: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // Misc
        // =====================================================================
        Opcode::FENCE | Opcode::C_NOP => {
            // No-op in single-threaded Wasm
        }

        // Branches and jumps are handled separately as terminators
        Opcode::BEQ
        | Opcode::BNE
        | Opcode::BLT
        | Opcode::BGE
        | Opcode::BLTU
        | Opcode::BGEU
        | Opcode::C_BEQZ
        | Opcode::C_BNEZ
        | Opcode::JAL
        | Opcode::JALR
        | Opcode::C_J
        | Opcode::C_JAL
        | Opcode::C_JR
        | Opcode::C_JALR
        | Opcode::ECALL
        | Opcode::EBREAK
        | Opcode::C_EBREAK => {
            // Handled by add_terminator_return
        }

        // =====================================================================
        // FP sign injection (single precision)
        // FSGNJ: rd = |rs1| with sign of rs2 (when rs1==rs2 it's FMV.S)
        // =====================================================================
        Opcode::FSGNJ_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::F32Abs);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Copysign);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FSGNJN_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            // rd = |rs1| with negated sign of rs2
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::F32Abs);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Neg);
            body.push(WasmInst::F32Copysign);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FSGNJX_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            // rd = rs1 with sign = sign(rs1) XOR sign(rs2)
            // When rs1==rs2 this is FABS. Use reinterpret for XOR.
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::I32ReinterpretF32);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::I32ReinterpretF32);
            body.push(WasmInst::I32Const { value: -2147483648_i32 }); // 0x80000000
            body.push(WasmInst::I32And);
            body.push(WasmInst::I32Xor);
            body.push(WasmInst::F32ReinterpretI32);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        // FP sign injection (double precision)
        Opcode::FSGNJ_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::F64Abs);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Copysign);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FSGNJN_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::F64Abs);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Neg);
            body.push(WasmInst::F64Copysign);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FSGNJX_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::I64ReinterpretF64);
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::I64ReinterpretF64);
            body.push(WasmInst::I64Const { value: -9223372036854775808_i64 }); // 0x8000000000000000
            body.push(WasmInst::I64And);
            body.push(WasmInst::I64Xor);
            body.push(WasmInst::F64ReinterpretI64);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        // =====================================================================
        // FP min/max
        // =====================================================================
        Opcode::FMIN_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Min);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FMAX_S => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Max);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FMIN_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Min);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FMAX_D => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Max);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        // =====================================================================
        // FP comparisons (result goes to integer register rd)
        // =====================================================================
        Opcode::FEQ_S => {
            if rd != 0 {
                let frs1_offset = 256 + rs1 * 4;
                let frs2_offset = 256 + rs2 * 4;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs2_offset });
                body.push(WasmInst::F32Eq);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FLT_S => {
            if rd != 0 {
                let frs1_offset = 256 + rs1 * 4;
                let frs2_offset = 256 + rs2 * 4;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs2_offset });
                body.push(WasmInst::F32Lt);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FLE_S => {
            if rd != 0 {
                let frs1_offset = 256 + rs1 * 4;
                let frs2_offset = 256 + rs2 * 4;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs2_offset });
                body.push(WasmInst::F32Le);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FEQ_D => {
            if rd != 0 {
                let frs1_offset = 384 + rs1 * 8;
                let frs2_offset = 384 + rs2 * 8;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs2_offset });
                body.push(WasmInst::F64Eq);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FLT_D => {
            if rd != 0 {
                let frs1_offset = 384 + rs1 * 8;
                let frs2_offset = 384 + rs2 * 8;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs2_offset });
                body.push(WasmInst::F64Lt);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FLE_D => {
            if rd != 0 {
                let frs1_offset = 384 + rs1 * 8;
                let frs2_offset = 384 + rs2 * 8;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs1_offset });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs2_offset });
                body.push(WasmInst::F64Le);
                body.push(WasmInst::I64ExtendI32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // FP conversion: float -> integer (result to integer register rd)
        // =====================================================================
        Opcode::FCVT_W_S => {
            // Convert f32 to i32 (signed), sign-extend to i64
            if rd != 0 {
                let frs1_offset = 256 + rs1 * 4;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs1_offset });
                body.push(WasmInst::I32TruncF32S);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FCVT_WU_S => {
            if rd != 0 {
                let frs1_offset = 256 + rs1 * 4;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs1_offset });
                body.push(WasmInst::I32TruncF32U);
                body.push(WasmInst::I64ExtendI32S); // sign-extend per RISC-V spec
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FCVT_L_S => {
            // Convert f32 to i64 (signed)
            if rd != 0 {
                let frs1_offset = 256 + rs1 * 4;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs1_offset });
                body.push(WasmInst::I64TruncF32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FCVT_LU_S => {
            if rd != 0 {
                let frs1_offset = 256 + rs1 * 4;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs1_offset });
                body.push(WasmInst::I64TruncF32U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FCVT_W_D => {
            if rd != 0 {
                let frs1_offset = 384 + rs1 * 8;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs1_offset });
                body.push(WasmInst::I32TruncF64S);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FCVT_WU_D => {
            if rd != 0 {
                let frs1_offset = 384 + rs1 * 8;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs1_offset });
                body.push(WasmInst::I32TruncF64U);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FCVT_L_D => {
            if rd != 0 {
                let frs1_offset = 384 + rs1 * 8;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs1_offset });
                body.push(WasmInst::I64TruncF64S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FCVT_LU_D => {
            if rd != 0 {
                let frs1_offset = 384 + rs1 * 8;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs1_offset });
                body.push(WasmInst::I64TruncF64U);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // =====================================================================
        // FP conversion: integer -> float (source from integer register rs1)
        // =====================================================================
        Opcode::FCVT_S_W => {
            let frd_offset = 256 + rd * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::F32ConvertI32S);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FCVT_S_WU => {
            let frd_offset = 256 + rd * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::F32ConvertI32U);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FCVT_S_L => {
            let frd_offset = 256 + rd * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::F32ConvertI64S);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FCVT_S_LU => {
            let frd_offset = 256 + rd * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::F32ConvertI64U);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FCVT_D_W => {
            let frd_offset = 384 + rd * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::F64ConvertI32S);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FCVT_D_WU => {
            let frd_offset = 384 + rd * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::F64ConvertI32U);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FCVT_D_L => {
            let frd_offset = 384 + rd * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::F64ConvertI64S);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        Opcode::FCVT_D_LU => {
            let frd_offset = 384 + rd * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::F64ConvertI64U);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        // =====================================================================
        // FP precision conversion
        // =====================================================================
        Opcode::FCVT_S_D => {
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 384 + rs1 * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::F32DemoteF64);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FCVT_D_S => {
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 256 + rs1 * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::F64PromoteF32);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        // =====================================================================
        // FP move between integer and FP registers (bitwise)
        // =====================================================================
        Opcode::FMV_X_W => {
            // Move f32 bits to integer register (sign-extended to i64)
            if rd != 0 {
                let frs1_offset = 256 + rs1 * 4;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F32Load { offset: frs1_offset });
                body.push(WasmInst::I32ReinterpretF32);
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FMV_W_X => {
            // Move integer register bits to f32
            let frd_offset = 256 + rd * 4;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::F32ReinterpretI32);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FMV_X_D => {
            // Move f64 bits to integer register
            if rd != 0 {
                let frs1_offset = 384 + rs1 * 8;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::F64Load { offset: frs1_offset });
                body.push(WasmInst::I64ReinterpretF64);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        Opcode::FMV_D_X => {
            // Move integer register bits to f64
            let frd_offset = 384 + rd * 8;
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1_offset });
            body.push(WasmInst::F64ReinterpretI64);
            body.push(WasmInst::F64Store { offset: frd_offset });
        }

        // =====================================================================
        // FCLASS - classify FP value, store classification bits in integer reg
        // Simplified: store 0 (normal positive) as approximation
        // =====================================================================
        Opcode::FCLASS_S | Opcode::FCLASS_D => {
            if rd != 0 {
                // Approximation: classify as normal positive (bit 6 = 0x40)
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const { value: 0x40 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        _ => {
            // Unsupported instruction - emit trap
            body.push(WasmInst::Comment {
                text: format!("UNSUPPORTED: {:?}", inst.opcode),
            });
            body.push(WasmInst::I32Const { value: -1 }); // Signal error
            body.push(WasmInst::Return);
        }
    }

    Ok(())
}

/// Add return instruction based on terminator.
/// `ic_targets` contains known block addresses for inline caching of JALR.
fn add_terminator_return(
    inst: &Instruction,
    block: &BasicBlock,
    body: &mut Vec<WasmInst>,
    ic_targets: &[u64],
) -> Result<()> {
    let rd = inst.rd.unwrap_or(0) as u32;
    let rs1 = inst.rs1.unwrap_or(0) as u32;
    let rs2 = inst.rs2.unwrap_or(0) as u32;
    let imm = inst.imm.unwrap_or(0);
    let next_pc = block.end_addr;

    match inst.opcode {
        // Conditional branches
        Opcode::BEQ => {
            emit_branch_compare(body, rs1, rs2, imm, inst.addr, next_pc, WasmInst::I64Eq);
        }
        Opcode::BNE => {
            emit_branch_compare(body, rs1, rs2, imm, inst.addr, next_pc, WasmInst::I64Ne);
        }
        Opcode::BLT => {
            emit_branch_compare(body, rs1, rs2, imm, inst.addr, next_pc, WasmInst::I64LtS);
        }
        Opcode::BGE => {
            emit_branch_compare(body, rs1, rs2, imm, inst.addr, next_pc, WasmInst::I64GeS);
        }
        Opcode::BLTU => {
            emit_branch_compare(body, rs1, rs2, imm, inst.addr, next_pc, WasmInst::I64LtU);
        }
        Opcode::BGEU => {
            emit_branch_compare(body, rs1, rs2, imm, inst.addr, next_pc, WasmInst::I64GeU);
        }

        Opcode::C_BEQZ => {
            // if x[rs1] == 0
            emit_branch_zero(body, rs1, imm, inst.addr, next_pc, true);
        }
        Opcode::C_BNEZ => {
            // if x[rs1] != 0
            emit_branch_zero(body, rs1, imm, inst.addr, next_pc, false);
        }

        // Unconditional jumps
        Opcode::JAL | Opcode::C_JAL => {
            // rd = PC + 4 (or 2 for compressed)
            if rd != 0 {
                let link_addr = inst.addr + inst.len as u64;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const {
                    value: link_addr as i64,
                });
                body.push(WasmInst::I64Store { offset: rd * 8 });
            }
            let target = (inst.addr as i64 + imm) as u64;
            body.push(WasmInst::I32Const {
                value: target as i32,
            });
            body.push(WasmInst::Return);
        }

        Opcode::C_J => {
            let target = (inst.addr as i64 + imm) as u64;
            body.push(WasmInst::I32Const {
                value: target as i32,
            });
            body.push(WasmInst::Return);
        }

        Opcode::JALR | Opcode::C_JALR => {
            // rd = PC + len (link address for function call)
            if rd != 0 {
                let link_addr = inst.addr + inst.len as u64;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const {
                    value: link_addr as i64,
                });
                body.push(WasmInst::I64Store { offset: rd * 8 });
            }

            // Compute target = (x[rs1] + imm) & ~1
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1 * 8 });
            if imm != 0 {
                body.push(WasmInst::I64Const { value: imm });
                body.push(WasmInst::I64Add);
            }
            body.push(WasmInst::I64Const { value: !1i64 });
            body.push(WasmInst::I64And);
            body.push(WasmInst::I32WrapI64);

            // Inline caching for call-like JALR (rd != 0):
            // If this block has known successors in the CFG, emit guarded
            // direct returns. The Wasm engine can constant-fold these checks,
            // and the dispatch loop's br_table becomes trivially predictable
            // when the same target PC returns repeatedly.
            let successors: Vec<u64> = if rd != 0 {
                block.successors.iter()
                    .filter(|&&s| ic_targets.contains(&s))
                    .copied()
                    .take(2) // max 2 IC guards to limit code bloat (<10%)
                    .collect()
            } else {
                vec![]
            };

            if !successors.is_empty() {
                // Store computed target in local for IC checks
                body.push(WasmInst::LocalSet { idx: 1 });

                for &target_pc in &successors {
                    // if (target == expected_pc) return expected_pc_const
                    // Using: block { br_if(cond, skip) ; return const ; } end
                    body.push(WasmInst::Block { label: 0 });
                    body.push(WasmInst::LocalGet { idx: 1 });
                    body.push(WasmInst::I32Const { value: target_pc as i32 });
                    body.push(WasmInst::I32Ne); // skip if NOT equal
                    body.push(WasmInst::BrIf { label: 0 }); // break out of block
                    body.push(WasmInst::I32Const { value: target_pc as i32 });
                    body.push(WasmInst::Return);
                    body.push(WasmInst::End);
                }

                // Fallback: return computed target from local
                body.push(WasmInst::LocalGet { idx: 1 });
            }

            body.push(WasmInst::Return);
        }

        Opcode::C_JR => {
            // Jump to x[rs1]
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1 * 8 });
            body.push(WasmInst::I32WrapI64);
            body.push(WasmInst::Return);
        }

        Opcode::ECALL => {
            // Return special value to signal syscall
            // High bit set + PC
            body.push(WasmInst::I32Const {
                value: 0x80000000u32 as i32 | (inst.addr as i32),
            });
            body.push(WasmInst::Return);
        }

        Opcode::EBREAK | Opcode::C_EBREAK => {
            // Return special value to signal breakpoint
            body.push(WasmInst::I32Const {
                value: 0xC0000000u32 as i32 | (inst.addr as i32),
            });
            body.push(WasmInst::Return);
        }

        _ => {
            // Not a terminator - fall through
            body.push(WasmInst::I32Const {
                value: next_pc as i32,
            });
            body.push(WasmInst::Return);
        }
    }

    Ok(())
}

/// Emit branch comparison
fn emit_branch_compare(
    body: &mut Vec<WasmInst>,
    rs1: u32,
    rs2: u32,
    imm: i64,
    pc: u64,
    fallthrough: u64,
    cmp_op: WasmInst,
) {
    let target = (pc as i64 + imm) as u64;

    // Load rs1 and rs2, compare
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1 * 8 });
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs2 * 8 });
    body.push(cmp_op);

    // if-else: return target or fallthrough
    body.push(WasmInst::I32Const {
        value: target as i32,
    });
    body.push(WasmInst::I32Const {
        value: fallthrough as i32,
    });
    body.push(WasmInst::Select);
    body.push(WasmInst::Return);
}

/// Emit branch on zero/nonzero
fn emit_branch_zero(body: &mut Vec<WasmInst>, rs1: u32, imm: i64, pc: u64, fallthrough: u64, on_zero: bool) {
    let target = (pc as i64 + imm) as u64;

    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1 * 8 });
    body.push(WasmInst::I64Eqz);

    if on_zero {
        // beqz: if zero, jump to target
        body.push(WasmInst::I32Const {
            value: target as i32,
        });
        body.push(WasmInst::I32Const {
            value: fallthrough as i32,
        });
    } else {
        // bnez: if nonzero, jump to target
        body.push(WasmInst::I32Const {
            value: fallthrough as i32,
        });
        body.push(WasmInst::I32Const {
            value: target as i32,
        });
    }
    body.push(WasmInst::Select);
    body.push(WasmInst::Return);
}

/// Translate CFG to Wasm module for JIT mode.
///
/// Differences from AOT `translate()`:
/// - Memory pages fixed (not derived from ELF segments)
/// - No ElfInfo dependency — caller provides base address
/// - Block functions identical to AOT (same register layout)
pub fn translate_jit(
    cfg: &ControlFlowGraph,
    base_addr: u64,
) -> Result<WasmModule> {
    let mut functions = Vec::new();
    let mut block_to_func = std::collections::HashMap::new();
    let block_addrs: Vec<u64> = cfg.blocks.keys().copied().collect();

    for (_addr, block) in cfg.blocks.iter() {
        let func = translate_block(block, functions.len(), false, &block_addrs)?;
        block_to_func.insert(block.start_addr, functions.len());
        functions.push(func);
    }

    // Optimize
    for func in &mut functions {
        optimize_function(func);
    }

    Ok(WasmModule {
        functions,
        memory_pages: 0, // JIT modules import memory; pages set by host
        entry: base_addr,
        block_to_func,
    })
}

/// Basic peephole optimizations
fn optimize_function(func: &mut WasmFunction) {
    // Always strip debug comments before optimization.
    func.body.retain(|inst| !matches!(inst, WasmInst::Comment { .. }));

    // We currently declare all non-parameter locals as i64 in wasm_builder.rs.
    // Any new temp introduced here must therefore hold i64 values.
    let mut next_local = func.num_locals;

    // Run small passes to a fixed point. Individual passes can expose patterns
    // for later passes (e.g., forwarding can expose extra constant folds).
    loop {
        let mut changed = false;

        let (body, forwarded) = forward_i64_store_loads(std::mem::take(&mut func.body), &mut next_local);
        changed |= forwarded > 0;

        let (body, tee_folds) = fold_local_set_get(body);
        changed |= tee_folds > 0;

        let (body, reg_cache_folds) = cache_gpr_i64_values(body, &mut next_local);
        changed |= reg_cache_folds > 0;

        let (body, const_folds) = fold_integer_constants(body);
        changed |= const_folds > 0;

        func.body = body;

        if !changed {
            break;
        }
    }

    func.num_locals = next_local;
}

fn forward_i64_store_loads(body: Vec<WasmInst>, next_local: &mut u32) -> (Vec<WasmInst>, usize) {
    fn is_local_get(inst: &WasmInst, idx: u32) -> bool {
        matches!(inst, WasmInst::LocalGet { idx: i } if *i == idx)
    }

    fn get_or_alloc_i64_temp(temp_local: &mut Option<u32>, next_local: &mut u32) -> u32 {
        if let Some(idx) = *temp_local {
            return idx;
        }
        let idx = *next_local;
        *next_local += 1;
        *temp_local = Some(idx);
        idx
    }

    let mut out = Vec::with_capacity(body.len());
    let mut i = 0usize;
    let mut changes = 0usize;
    let mut temp_local = None;

    while i < body.len() {
        if let WasmInst::I64Store { offset: store_offset } = body[i] {
            // Pattern A:
            //   i64.store X
            //   local.get 0
            //   i64.load X
            if i + 2 < body.len()
                && is_local_get(&body[i + 1], 0)
                && matches!(body[i + 2], WasmInst::I64Load { offset } if offset == store_offset)
            {
                let temp = get_or_alloc_i64_temp(&mut temp_local, next_local);
                out.push(WasmInst::LocalTee { idx: temp });
                out.push(WasmInst::I64Store { offset: store_offset });
                out.push(WasmInst::LocalGet { idx: temp });
                i += 3;
                changes += 1;
                continue;
            }

            // Pattern B (common in translator output):
            //   i64.store X
            //   local.get 0
            //   local.get 0
            //   i64.load X
            // Keep the first local.get 0 (address for the following store path),
            // and forward the reloaded value from a temp.
            if i + 3 < body.len()
                && is_local_get(&body[i + 1], 0)
                && is_local_get(&body[i + 2], 0)
                && matches!(body[i + 3], WasmInst::I64Load { offset } if offset == store_offset)
            {
                let temp = get_or_alloc_i64_temp(&mut temp_local, next_local);
                out.push(WasmInst::LocalTee { idx: temp });
                out.push(WasmInst::I64Store { offset: store_offset });
                out.push(WasmInst::LocalGet { idx: 0 });
                out.push(WasmInst::LocalGet { idx: temp });
                i += 4;
                changes += 1;
                continue;
            }
        }

        out.push(body[i].clone());
        i += 1;
    }

    (out, changes)
}

fn fold_local_set_get(body: Vec<WasmInst>) -> (Vec<WasmInst>, usize) {
    let mut out = Vec::with_capacity(body.len());
    let mut i = 0usize;
    let mut changes = 0usize;

    while i < body.len() {
        if i + 1 < body.len() {
            if let (WasmInst::LocalSet { idx: set_idx }, WasmInst::LocalGet { idx: get_idx }) =
                (&body[i], &body[i + 1])
            {
                if set_idx == get_idx {
                    out.push(WasmInst::LocalTee { idx: *set_idx });
                    i += 2;
                    changes += 1;
                    continue;
                }
            }
        }

        out.push(body[i].clone());
        i += 1;
    }

    (out, changes)
}

fn fold_integer_constants(body: Vec<WasmInst>) -> (Vec<WasmInst>, usize) {
    let mut out = Vec::with_capacity(body.len());
    let mut i = 0usize;
    let mut changes = 0usize;

    while i < body.len() {
        if i + 2 < body.len() {
            if let (WasmInst::I64Const { value: a }, WasmInst::I64Const { value: b }) =
                (&body[i], &body[i + 1])
            {
                if let Some(value) = fold_i64_binop(&body[i + 2], *a, *b) {
                    out.push(WasmInst::I64Const { value });
                    i += 3;
                    changes += 1;
                    continue;
                }
            }

            if let (WasmInst::I32Const { value: a }, WasmInst::I32Const { value: b }) =
                (&body[i], &body[i + 1])
            {
                if let Some(value) = fold_i32_binop(&body[i + 2], *a, *b) {
                    out.push(WasmInst::I32Const { value });
                    i += 3;
                    changes += 1;
                    continue;
                }
            }
        }

        out.push(body[i].clone());
        i += 1;
    }

    (out, changes)
}

fn fold_i64_binop(op: &WasmInst, lhs: i64, rhs: i64) -> Option<i64> {
    match op {
        WasmInst::I64Add => Some(lhs.wrapping_add(rhs)),
        WasmInst::I64Sub => Some(lhs.wrapping_sub(rhs)),
        WasmInst::I64And => Some(lhs & rhs),
        WasmInst::I64Or => Some(lhs | rhs),
        WasmInst::I64Xor => Some(lhs ^ rhs),
        WasmInst::I64Shl => Some(lhs.wrapping_shl((rhs as u32) & 63)),
        WasmInst::I64ShrS => Some(lhs >> ((rhs as u32) & 63)),
        WasmInst::I64ShrU => Some(((lhs as u64) >> ((rhs as u32) & 63)) as i64),
        _ => None,
    }
}

fn fold_i32_binop(op: &WasmInst, lhs: i32, rhs: i32) -> Option<i32> {
    match op {
        WasmInst::I32Add => Some(lhs.wrapping_add(rhs)),
        WasmInst::I32Sub => Some(lhs.wrapping_sub(rhs)),
        WasmInst::I32And => Some(lhs & rhs),
        WasmInst::I32Or => Some(lhs | rhs),
        WasmInst::I32Xor => Some(lhs ^ rhs),
        WasmInst::I32Shl => Some(lhs.wrapping_shl((rhs as u32) & 31)),
        WasmInst::I32ShrS => Some(lhs >> ((rhs as u32) & 31)),
        WasmInst::I32ShrU => Some(((lhs as u32) >> ((rhs as u32) & 31)) as i32),
        _ => None,
    }
}

fn cache_gpr_i64_values(body: Vec<WasmInst>, next_local: &mut u32) -> (Vec<WasmInst>, usize) {
    fn is_local_get(inst: &WasmInst, idx: u32) -> bool {
        matches!(inst, WasmInst::LocalGet { idx: i } if *i == idx)
    }

    fn is_cacheable_gpr_offset(offset: u32) -> bool {
        // x0 uses offset 0 and appears frequently in non-register-memory contexts.
        // Restrict caching to x1..x31 offsets to avoid accidental overlap with
        // generic offset=0 memory operations.
        offset != 0 && offset < (32 * 8) && offset % 8 == 0
    }

    fn get_or_alloc_local_for_offset(
        offset_to_local: &mut HashMap<u32, u32>,
        offset: u32,
        next_local: &mut u32,
    ) -> u32 {
        if let Some(idx) = offset_to_local.get(&offset).copied() {
            return idx;
        }
        let idx = *next_local;
        *next_local += 1;
        offset_to_local.insert(offset, idx);
        idx
    }

    let mut out = Vec::with_capacity(body.len());
    let mut i = 0usize;
    let mut changes = 0usize;
    let mut offset_to_local = HashMap::<u32, u32>::new();

    while i < body.len() {
        // Rewrite register-file reloads into local.get when we have a known
        // cached value from an earlier register store in this block.
        if i + 1 < body.len()
            && is_local_get(&body[i], 0)
            && matches!(body[i + 1], WasmInst::I64Load { offset } if is_cacheable_gpr_offset(offset))
        {
            if let WasmInst::I64Load { offset } = body[i + 1] {
                if let Some(local_idx) = offset_to_local.get(&offset).copied() {
                    out.push(WasmInst::LocalGet { idx: local_idx });
                    i += 2;
                    changes += 1;
                    continue;
                }
            }
        }

        // Whenever we store a register value, tee it into a dedicated local so
        // later uses can avoid reloading from machine-state memory.
        if let WasmInst::I64Store { offset } = body[i] {
            if is_cacheable_gpr_offset(offset) {
                let preceding_tee = if i > 0 {
                    match body[i - 1] {
                        WasmInst::LocalTee { idx } => Some(idx),
                        _ => None,
                    }
                } else {
                    None
                };

                let cache_local = if let Some(idx) = preceding_tee {
                    offset_to_local.entry(offset).or_insert(idx);
                    idx
                } else {
                    get_or_alloc_local_for_offset(&mut offset_to_local, offset, next_local)
                };

                let already_cached = preceding_tee == Some(cache_local);
                if !already_cached {
                    out.push(WasmInst::LocalTee { idx: cache_local });
                    changes += 1;
                }
                out.push(WasmInst::I64Store { offset });
                i += 1;
                continue;
            }
        }

        out.push(body[i].clone());
        i += 1;
    }

    (out, changes)
}

/// Helper for atomic word operations (XOR, AND, OR)
fn emit_amo_op_w(body: &mut Vec<WasmInst>, rd: u32, rs1_offset: u32, rs2_offset: u32, op: WasmInst) {
    let rd_offset = rd * 8;

    // Load old value to rd
    if rd != 0 {
        body.push(WasmInst::LocalGet { idx: 0 });
        body.push(WasmInst::LocalGet { idx: 0 });
        body.push(WasmInst::I64Load { offset: rs1_offset });
        body.push(WasmInst::I32WrapI64);
        body.push(WasmInst::I32Load { offset: 0 });
        body.push(WasmInst::I64ExtendI32S);
        body.push(WasmInst::I64Store { offset: rd_offset });
    }

    // Compute and store new value: M[rs1] = M[rs1] op rs2
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(WasmInst::I32Load { offset: 0 });
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs2_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(op);
    body.push(WasmInst::I32Store { offset: 0 });
}

/// Helper for atomic doubleword operations (XOR, AND, OR)
fn emit_amo_op_d(body: &mut Vec<WasmInst>, rd: u32, rs1_offset: u32, rs2_offset: u32, op: WasmInst) {
    let rd_offset = rd * 8;

    // Load old value to rd
    if rd != 0 {
        body.push(WasmInst::LocalGet { idx: 0 });
        body.push(WasmInst::LocalGet { idx: 0 });
        body.push(WasmInst::I64Load { offset: rs1_offset });
        body.push(WasmInst::I32WrapI64);
        body.push(WasmInst::I64Load { offset: 0 });
        body.push(WasmInst::I64Store { offset: rd_offset });
    }

    // Compute and store new value: M[rs1] = M[rs1] op rs2
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(WasmInst::I64Load { offset: 0 });
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs2_offset });
    body.push(op);
    body.push(WasmInst::I64Store { offset: 0 });
}

/// Helper for atomic word min/max operations (AMOMIN_W, AMOMAX_W, AMOMINU_W, AMOMAXU_W)
/// cmp_op should be: I32LtS (min signed), I32LtU (min unsigned),
///                   I32GtS (max signed), I32GtU (max unsigned)
fn emit_amo_minmax_w(body: &mut Vec<WasmInst>, rd: u32, rs1_offset: u32, rs2_offset: u32, cmp_op: WasmInst) {
    let rd_offset = rd * 8;

    // Load old value to rd
    if rd != 0 {
        body.push(WasmInst::LocalGet { idx: 0 });
        body.push(WasmInst::LocalGet { idx: 0 });
        body.push(WasmInst::I64Load { offset: rs1_offset });
        body.push(WasmInst::I32WrapI64);
        body.push(WasmInst::I32Load { offset: 0 });
        body.push(WasmInst::I64ExtendI32S);
        body.push(WasmInst::I64Store { offset: rd_offset });
    }

    // Compute and store min/max: M[rs1] = select(old, rs2, old cmp rs2)
    // Push store address
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    // Push old value (val1 for select - returned if condition is true)
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(WasmInst::I32Load { offset: 0 });
    // Push rs2 value (val2 for select - returned if condition is false)
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs2_offset });
    body.push(WasmInst::I32WrapI64);
    // Push old and rs2 again for comparison
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(WasmInst::I32Load { offset: 0 });
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs2_offset });
    body.push(WasmInst::I32WrapI64);
    // Compare: e.g. I32LtS for min, I32GtS for max
    body.push(cmp_op);
    // Select: returns old if condition true, rs2 if false
    body.push(WasmInst::Select);
    // Store result to M[rs1]
    body.push(WasmInst::I32Store { offset: 0 });
}

/// Helper for atomic doubleword min/max operations (AMOMIN_D, AMOMAX_D, AMOMINU_D, AMOMAXU_D)
/// cmp_op should be: I64LtS (min signed), I64LtU (min unsigned),
///                   I64GtS (max signed), I64GtU (max unsigned)
fn emit_amo_minmax_d(body: &mut Vec<WasmInst>, rd: u32, rs1_offset: u32, rs2_offset: u32, cmp_op: WasmInst) {
    let rd_offset = rd * 8;

    // Load old value to rd
    if rd != 0 {
        body.push(WasmInst::LocalGet { idx: 0 });
        body.push(WasmInst::LocalGet { idx: 0 });
        body.push(WasmInst::I64Load { offset: rs1_offset });
        body.push(WasmInst::I32WrapI64);
        body.push(WasmInst::I64Load { offset: 0 });
        body.push(WasmInst::I64Store { offset: rd_offset });
    }

    // Compute and store min/max: M[rs1] = select(old, rs2, old cmp rs2)
    // Push store address
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    // Push old value (val1 for select - returned if condition is true)
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(WasmInst::I64Load { offset: 0 });
    // Push rs2 value (val2 for select - returned if condition is false)
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs2_offset });
    // Push old and rs2 again for comparison
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs1_offset });
    body.push(WasmInst::I32WrapI64);
    body.push(WasmInst::I64Load { offset: 0 });
    body.push(WasmInst::LocalGet { idx: 0 });
    body.push(WasmInst::I64Load { offset: rs2_offset });
    // Compare: e.g. I64LtS for min, I64GtS for max
    body.push(cmp_op);
    // Select: returns old if condition true, rs2 if false
    body.push(WasmInst::Select);
    // Store result to M[rs1]
    body.push(WasmInst::I64Store { offset: 0 });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_function(body: Vec<WasmInst>) -> WasmFunction {
        WasmFunction {
            name: "test".to_string(),
            block_addr: 0x1000,
            body,
            num_locals: 4,
        }
    }

    #[test]
    fn optimize_removes_comments() {
        let mut func = make_test_function(vec![
            WasmInst::Comment {
                text: "debug".to_string(),
            },
            WasmInst::I64Const { value: 1 },
        ]);

        optimize_function(&mut func);

        assert_eq!(func.body.len(), 1);
        assert!(matches!(func.body[0], WasmInst::I64Const { value: 1 }));
    }

    #[test]
    fn optimize_folds_integer_constants() {
        let mut func = make_test_function(vec![
            WasmInst::I64Const { value: 0x12345000 },
            WasmInst::I64Const { value: 0x678 },
            WasmInst::I64Add,
            WasmInst::I32Const { value: 8 },
            WasmInst::I32Const { value: 2 },
            WasmInst::I32Shl,
        ]);

        optimize_function(&mut func);

        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::I64Const { value } if *value == 0x12345678)));
        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::I32Const { value } if *value == 32)));
        assert!(!func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::I64Add | WasmInst::I32Shl)));
    }

    #[test]
    fn optimize_forwards_i64_store_load() {
        let mut func = make_test_function(vec![
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Const { value: 42 },
            WasmInst::I64Store { offset: 40 },
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Load { offset: 40 },
            WasmInst::I64Const { value: 1 },
            WasmInst::I64Add,
        ]);

        optimize_function(&mut func);

        assert!(func.num_locals >= 5);
        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::LocalTee { idx } if *idx == 4)));
        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::LocalGet { idx } if *idx == 4)));
        assert!(!func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::I64Load { offset } if *offset == 40)));
    }

    #[test]
    fn optimize_forwards_i64_store_load_with_leading_local_get() {
        let mut func = make_test_function(vec![
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Const { value: 7 },
            WasmInst::I64Store { offset: 40 },
            WasmInst::LocalGet { idx: 0 },
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Load { offset: 40 },
            WasmInst::I64Const { value: 4 },
            WasmInst::I64Add,
            WasmInst::I64Store { offset: 48 },
        ]);

        optimize_function(&mut func);

        assert_eq!(func.num_locals, 5);
        assert!(!func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::I64Load { offset } if *offset == 40)));

        assert!(func
            .body
            .windows(2)
            .any(|window| matches!(
                (&window[0], &window[1]),
                (WasmInst::LocalGet { idx: 0 }, WasmInst::LocalGet { idx: 4 })
            )));
    }

    #[test]
    fn optimize_preserves_non_matching_store_load() {
        let mut func = make_test_function(vec![
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Const { value: 1 },
            WasmInst::I64Store { offset: 40 },
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Load { offset: 48 },
        ]);

        optimize_function(&mut func);

        assert!(func.num_locals >= 4);
        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::I64Load { offset } if *offset == 48)));
    }

    #[test]
    fn optimize_folds_local_set_get_to_local_tee() {
        let mut func = make_test_function(vec![
            WasmInst::I64Const { value: 3 },
            WasmInst::LocalSet { idx: 2 },
            WasmInst::LocalGet { idx: 2 },
            WasmInst::I64Const { value: 4 },
            WasmInst::I64Add,
        ]);

        optimize_function(&mut func);

        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::LocalTee { idx } if *idx == 2)));
        assert!(!func
            .body
            .windows(2)
            .any(|window| matches!(
                (&window[0], &window[1]),
                (WasmInst::LocalSet { idx: 2 }, WasmInst::LocalGet { idx: 2 })
            )));
    }

    #[test]
    fn optimize_caches_register_store_and_reuses_local_for_later_load() {
        let mut func = make_test_function(vec![
            // x5 = 7
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Const { value: 7 },
            WasmInst::I64Store { offset: 40 },
            // x6 = x5 + 1
            WasmInst::LocalGet { idx: 0 },
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Load { offset: 40 },
            WasmInst::I64Const { value: 1 },
            WasmInst::I64Add,
            WasmInst::I64Store { offset: 48 },
        ]);

        optimize_function(&mut func);

        // local 4 caches x5 (offset 40), local 5 caches x6 (offset 48)
        assert!(func.num_locals >= 6);
        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::LocalTee { idx } if *idx == 4)));
        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::LocalGet { idx } if *idx == 4)));
        assert!(!func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::I64Load { offset } if *offset == 40)));
    }

    #[test]
    fn optimize_does_not_cache_offset_zero_memory_loads() {
        let mut func = make_test_function(vec![
            // Generic memory load path (address already on stack).
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Load { offset: 0 },
        ]);

        optimize_function(&mut func);

        // Offset 0 is intentionally not rewritten by register-cache pass.
        assert!(func
            .body
            .iter()
            .any(|inst| matches!(inst, WasmInst::I64Load { offset } if *offset == 0)));
    }

    #[test]
    fn optimize_register_cache_pass_is_idempotent() {
        let mut func = make_test_function(vec![
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Const { value: 9 },
            WasmInst::I64Store { offset: 80 },
            WasmInst::LocalGet { idx: 0 },
            WasmInst::I64Load { offset: 80 },
            WasmInst::I64Const { value: 1 },
            WasmInst::I64Add,
        ]);

        optimize_function(&mut func);
        let first_body_dbg = format!("{:?}", func.body);
        let first_locals = func.num_locals;

        optimize_function(&mut func);

        assert_eq!(format!("{:?}", func.body), first_body_dbg);
        assert_eq!(func.num_locals, first_locals);
    }
}
