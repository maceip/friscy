// translate.rs - RISC-V to WebAssembly translation
//
// Translates basic blocks to Wasm functions following the architecture
// described in CRAZY_PERF_IDEAS.md.

use crate::cfg::{BasicBlock, ControlFlowGraph};
use crate::disasm::{Instruction, Opcode};
use crate::elf::ElfInfo;
use anyhow::Result;

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

    // Translate each basic block to a function
    for (idx, (addr, block)) in cfg.blocks.iter().enumerate() {
        let func = translate_block(block, idx, debug)?;
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

/// Translate a single basic block to a Wasm function
fn translate_block(block: &BasicBlock, func_idx: usize, debug: bool) -> Result<WasmFunction> {
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
        add_terminator_return(term, block, &mut body)?;
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

        // Atomic min/max word (signed/unsigned) - stub for now
        Opcode::AMOMIN_W | Opcode::AMOMAX_W | Opcode::AMOMINU_W | Opcode::AMOMAXU_W => {
            body.push(WasmInst::Comment {
                text: format!("AMO min/max stub: {:?}", inst.opcode),
            });
            // For now, just do a swap
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I32Load { offset: 0 });
                body.push(WasmInst::I64ExtendI32S);
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
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

        Opcode::AMOMIN_D | Opcode::AMOMAX_D | Opcode::AMOMINU_D | Opcode::AMOMAXU_D => {
            body.push(WasmInst::Comment {
                text: format!("AMO min/max-D stub: {:?}", inst.opcode),
            });
            if rd != 0 {
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Load { offset: rs1_offset });
                body.push(WasmInst::I32WrapI64);
                body.push(WasmInst::I64Load { offset: 0 });
                body.push(WasmInst::I64Store { offset: rd_offset });
            }
        }

        // FMA instructions (fused multiply-add)
        Opcode::FMADD_S | Opcode::FMSUB_S | Opcode::FNMADD_S | Opcode::FNMSUB_S => {
            // Fused multiply-add: rd = rs1 * rs2 +/- rs3
            // Wasm doesn't have FMA, so we decompose into mul + add
            let frd_offset = 256 + rd * 4;
            let frs1_offset = 256 + rs1 * 4;
            let frs2_offset = 256 + rs2 * 4;
            // rs3 is encoded in the instruction - for now just use rs2
            body.push(WasmInst::Comment {
                text: format!("FMA stub: {:?}", inst.opcode),
            });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F32Load { offset: frs2_offset });
            body.push(WasmInst::F32Mul);
            body.push(WasmInst::F32Store { offset: frd_offset });
        }

        Opcode::FMADD_D | Opcode::FMSUB_D | Opcode::FNMADD_D | Opcode::FNMSUB_D => {
            // Double-precision FMA stub
            let frd_offset = 384 + rd * 8;
            let frs1_offset = 384 + rs1 * 8;
            let frs2_offset = 384 + rs2 * 8;
            body.push(WasmInst::Comment {
                text: format!("FMA-D stub: {:?}", inst.opcode),
            });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs1_offset });
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::F64Load { offset: frs2_offset });
            body.push(WasmInst::F64Mul);
            body.push(WasmInst::F64Store { offset: frd_offset });
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

/// Add return instruction based on terminator
fn add_terminator_return(
    inst: &Instruction,
    block: &BasicBlock,
    body: &mut Vec<WasmInst>,
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
            // rd = PC + len
            if rd != 0 {
                let link_addr = inst.addr + inst.len as u64;
                body.push(WasmInst::LocalGet { idx: 0 });
                body.push(WasmInst::I64Const {
                    value: link_addr as i64,
                });
                body.push(WasmInst::I64Store { offset: rd * 8 });
            }
            // Jump to (x[rs1] + imm) & ~1
            body.push(WasmInst::LocalGet { idx: 0 });
            body.push(WasmInst::I64Load { offset: rs1 * 8 });
            body.push(WasmInst::I64Const { value: imm });
            body.push(WasmInst::I64Add);
            body.push(WasmInst::I64Const { value: !1i64 });
            body.push(WasmInst::I64And);
            body.push(WasmInst::I32WrapI64);
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

/// Basic peephole optimizations
fn optimize_function(func: &mut WasmFunction) {
    // Remove consecutive LocalGet of same index
    // Remove dead stores
    // etc.

    // For now, just remove Comment instructions in release mode
    func.body.retain(|inst| !matches!(inst, WasmInst::Comment { .. }));
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
