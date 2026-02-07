// disasm.rs - RISC-V disassembler
//
// Decodes RISC-V RV64GC instructions into structured form for translation.

use crate::elf::CodeSection;
use anyhow::Result;

/// A decoded RISC-V instruction
#[derive(Debug, Clone)]
pub struct Instruction {
    /// Virtual address
    pub addr: u64,
    /// Raw instruction bytes (2 or 4 bytes)
    pub bytes: u32,
    /// Instruction length in bytes
    pub len: u8,
    /// Decoded opcode
    pub opcode: Opcode,
    /// Destination register (if any)
    pub rd: Option<u8>,
    /// Source register 1 (if any)
    pub rs1: Option<u8>,
    /// Source register 2 (if any)
    pub rs2: Option<u8>,
    /// Immediate value (if any)
    pub imm: Option<i64>,
}

/// RISC-V opcodes (RV64GC subset)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Opcode {
    // RV32I Base
    LUI,
    AUIPC,
    JAL,
    JALR,
    BEQ,
    BNE,
    BLT,
    BGE,
    BLTU,
    BGEU,
    LB,
    LH,
    LW,
    LBU,
    LHU,
    SB,
    SH,
    SW,
    ADDI,
    SLTI,
    SLTIU,
    XORI,
    ORI,
    ANDI,
    SLLI,
    SRLI,
    SRAI,
    ADD,
    SUB,
    SLL,
    SLT,
    SLTU,
    XOR,
    SRL,
    SRA,
    OR,
    AND,
    FENCE,
    ECALL,
    EBREAK,

    // RV64I
    LWU,
    LD,
    SD,
    ADDIW,
    SLLIW,
    SRLIW,
    SRAIW,
    ADDW,
    SUBW,
    SLLW,
    SRLW,
    SRAW,

    // RV32M (Multiply)
    MUL,
    MULH,
    MULHSU,
    MULHU,
    DIV,
    DIVU,
    REM,
    REMU,

    // RV64M
    MULW,
    DIVW,
    DIVUW,
    REMW,
    REMUW,

    // RV32A (Atomics)
    LR_W,
    SC_W,
    AMOSWAP_W,
    AMOADD_W,
    AMOXOR_W,
    AMOAND_W,
    AMOOR_W,
    AMOMIN_W,
    AMOMAX_W,
    AMOMINU_W,
    AMOMAXU_W,

    // RV64A
    LR_D,
    SC_D,
    AMOSWAP_D,
    AMOADD_D,
    AMOXOR_D,
    AMOAND_D,
    AMOOR_D,
    AMOMIN_D,
    AMOMAX_D,
    AMOMINU_D,
    AMOMAXU_D,

    // RV32F/RV32D (Floating point - stubs)
    FLW,
    FSW,
    FLD,
    FSD,
    FMADD_S,
    FMSUB_S,
    FNMSUB_S,
    FNMADD_S,
    FADD_S,
    FSUB_S,
    FMUL_S,
    FDIV_S,
    FSQRT_S,
    FMADD_D,
    FMSUB_D,
    FNMSUB_D,
    FNMADD_D,
    FADD_D,
    FSUB_D,
    FMUL_D,
    FDIV_D,
    FSQRT_D,

    // Compressed instructions (C extension)
    C_ADDI4SPN,
    C_LW,
    C_SW,
    C_NOP,
    C_ADDI,
    C_JAL,
    C_LI,
    C_ADDI16SP,
    C_LUI,
    C_SRLI,
    C_SRAI,
    C_ANDI,
    C_SUB,
    C_XOR,
    C_OR,
    C_AND,
    C_J,
    C_BEQZ,
    C_BNEZ,
    C_SLLI,
    C_LWSP,
    C_JR,
    C_MV,
    C_EBREAK,
    C_JALR,
    C_ADD,
    C_SWSP,
    C_LD,
    C_SD,
    C_LDSP,
    C_SDSP,
    C_ADDIW,
    C_SUBW,
    C_ADDW,

    // Unknown/unsupported
    Unknown,
}

impl Opcode {
    /// Is this a branch instruction?
    pub fn is_branch(&self) -> bool {
        matches!(
            self,
            Opcode::BEQ
                | Opcode::BNE
                | Opcode::BLT
                | Opcode::BGE
                | Opcode::BLTU
                | Opcode::BGEU
                | Opcode::C_BEQZ
                | Opcode::C_BNEZ
        )
    }

    /// Is this a jump instruction?
    pub fn is_jump(&self) -> bool {
        matches!(
            self,
            Opcode::JAL
                | Opcode::JALR
                | Opcode::C_J
                | Opcode::C_JAL
                | Opcode::C_JR
                | Opcode::C_JALR
        )
    }

    /// Is this a system call?
    pub fn is_syscall(&self) -> bool {
        matches!(self, Opcode::ECALL)
    }

    /// Is this a terminator (ends basic block)?
    pub fn is_terminator(&self) -> bool {
        self.is_branch() || self.is_jump() || self.is_syscall() || *self == Opcode::EBREAK
    }
}

/// Disassemble a code section into instructions
pub fn disassemble(section: &CodeSection) -> Result<Vec<Instruction>> {
    let mut instructions = Vec::new();
    let mut offset = 0;

    while offset < section.data.len() {
        let addr = section.vaddr + offset as u64;

        // Check for compressed instruction (16-bit)
        let first_byte = section.data[offset];
        let is_compressed = (first_byte & 0x03) != 0x03;

        if is_compressed {
            // 16-bit compressed instruction
            if offset + 2 > section.data.len() {
                break;
            }
            let bytes =
                (section.data[offset] as u32) | ((section.data[offset + 1] as u32) << 8);

            let inst = decode_compressed(addr, bytes);
            instructions.push(inst);
            offset += 2;
        } else {
            // 32-bit instruction
            if offset + 4 > section.data.len() {
                break;
            }
            let bytes = (section.data[offset] as u32)
                | ((section.data[offset + 1] as u32) << 8)
                | ((section.data[offset + 2] as u32) << 16)
                | ((section.data[offset + 3] as u32) << 24);

            let inst = decode_32bit(addr, bytes);
            instructions.push(inst);
            offset += 4;
        }
    }

    Ok(instructions)
}

/// Decode a 32-bit RISC-V instruction
fn decode_32bit(addr: u64, bytes: u32) -> Instruction {
    let opcode_bits = bytes & 0x7f;
    let rd = ((bytes >> 7) & 0x1f) as u8;
    let funct3 = (bytes >> 12) & 0x7;
    let rs1 = ((bytes >> 15) & 0x1f) as u8;
    let rs2 = ((bytes >> 20) & 0x1f) as u8;
    let funct7 = (bytes >> 25) & 0x7f;

    // Decode based on opcode
    let (opcode, imm) = match opcode_bits {
        0x37 => {
            // LUI
            let imm = (bytes & 0xfffff000) as i32 as i64;
            (Opcode::LUI, Some(imm))
        }
        0x17 => {
            // AUIPC
            let imm = (bytes & 0xfffff000) as i32 as i64;
            (Opcode::AUIPC, Some(imm))
        }
        0x6f => {
            // JAL
            let imm = decode_j_imm(bytes);
            (Opcode::JAL, Some(imm))
        }
        0x67 => {
            // JALR
            let imm = (bytes as i32 >> 20) as i64;
            (Opcode::JALR, Some(imm))
        }
        0x63 => {
            // Branch
            let imm = decode_b_imm(bytes);
            let op = match funct3 {
                0 => Opcode::BEQ,
                1 => Opcode::BNE,
                4 => Opcode::BLT,
                5 => Opcode::BGE,
                6 => Opcode::BLTU,
                7 => Opcode::BGEU,
                _ => Opcode::Unknown,
            };
            (op, Some(imm))
        }
        0x03 => {
            // Load
            let imm = (bytes as i32 >> 20) as i64;
            let op = match funct3 {
                0 => Opcode::LB,
                1 => Opcode::LH,
                2 => Opcode::LW,
                3 => Opcode::LD,
                4 => Opcode::LBU,
                5 => Opcode::LHU,
                6 => Opcode::LWU,
                _ => Opcode::Unknown,
            };
            (op, Some(imm))
        }
        0x23 => {
            // Store
            let imm = decode_s_imm(bytes);
            let op = match funct3 {
                0 => Opcode::SB,
                1 => Opcode::SH,
                2 => Opcode::SW,
                3 => Opcode::SD,
                _ => Opcode::Unknown,
            };
            (op, Some(imm))
        }
        0x13 => {
            // OP-IMM
            let imm = (bytes as i32 >> 20) as i64;
            let op = match funct3 {
                0 => Opcode::ADDI,
                1 => Opcode::SLLI,
                2 => Opcode::SLTI,
                3 => Opcode::SLTIU,
                4 => Opcode::XORI,
                5 => {
                    if funct7 == 0x20 {
                        Opcode::SRAI
                    } else {
                        Opcode::SRLI
                    }
                }
                6 => Opcode::ORI,
                7 => Opcode::ANDI,
                _ => Opcode::Unknown,
            };
            (op, Some(imm))
        }
        0x1b => {
            // OP-IMM-32
            let imm = (bytes as i32 >> 20) as i64;
            let op = match funct3 {
                0 => Opcode::ADDIW,
                1 => Opcode::SLLIW,
                5 => {
                    if funct7 == 0x20 {
                        Opcode::SRAIW
                    } else {
                        Opcode::SRLIW
                    }
                }
                _ => Opcode::Unknown,
            };
            (op, Some(imm))
        }
        0x33 => {
            // OP
            let op = match (funct7, funct3) {
                (0x00, 0) => Opcode::ADD,
                (0x20, 0) => Opcode::SUB,
                (0x00, 1) => Opcode::SLL,
                (0x00, 2) => Opcode::SLT,
                (0x00, 3) => Opcode::SLTU,
                (0x00, 4) => Opcode::XOR,
                (0x00, 5) => Opcode::SRL,
                (0x20, 5) => Opcode::SRA,
                (0x00, 6) => Opcode::OR,
                (0x00, 7) => Opcode::AND,
                // M extension
                (0x01, 0) => Opcode::MUL,
                (0x01, 1) => Opcode::MULH,
                (0x01, 2) => Opcode::MULHSU,
                (0x01, 3) => Opcode::MULHU,
                (0x01, 4) => Opcode::DIV,
                (0x01, 5) => Opcode::DIVU,
                (0x01, 6) => Opcode::REM,
                (0x01, 7) => Opcode::REMU,
                _ => Opcode::Unknown,
            };
            (op, None)
        }
        0x3b => {
            // OP-32
            let op = match (funct7, funct3) {
                (0x00, 0) => Opcode::ADDW,
                (0x20, 0) => Opcode::SUBW,
                (0x00, 1) => Opcode::SLLW,
                (0x00, 5) => Opcode::SRLW,
                (0x20, 5) => Opcode::SRAW,
                // M extension
                (0x01, 0) => Opcode::MULW,
                (0x01, 4) => Opcode::DIVW,
                (0x01, 5) => Opcode::DIVUW,
                (0x01, 6) => Opcode::REMW,
                (0x01, 7) => Opcode::REMUW,
                _ => Opcode::Unknown,
            };
            (op, None)
        }
        0x0f => {
            // FENCE
            (Opcode::FENCE, None)
        }
        0x73 => {
            // SYSTEM
            let op = if bytes == 0x00000073 {
                Opcode::ECALL
            } else if bytes == 0x00100073 {
                Opcode::EBREAK
            } else {
                Opcode::Unknown
            };
            (op, None)
        }
        0x2f => {
            // AMO
            let funct5 = funct7 >> 2;
            let op = match (funct3, funct5) {
                (2, 0x02) => Opcode::LR_W,
                (2, 0x03) => Opcode::SC_W,
                (2, 0x01) => Opcode::AMOSWAP_W,
                (2, 0x00) => Opcode::AMOADD_W,
                (2, 0x04) => Opcode::AMOXOR_W,
                (2, 0x0c) => Opcode::AMOAND_W,
                (2, 0x08) => Opcode::AMOOR_W,
                (2, 0x10) => Opcode::AMOMIN_W,
                (2, 0x14) => Opcode::AMOMAX_W,
                (2, 0x18) => Opcode::AMOMINU_W,
                (2, 0x1c) => Opcode::AMOMAXU_W,
                (3, 0x02) => Opcode::LR_D,
                (3, 0x03) => Opcode::SC_D,
                (3, 0x01) => Opcode::AMOSWAP_D,
                (3, 0x00) => Opcode::AMOADD_D,
                (3, 0x04) => Opcode::AMOXOR_D,
                (3, 0x0c) => Opcode::AMOAND_D,
                (3, 0x08) => Opcode::AMOOR_D,
                (3, 0x10) => Opcode::AMOMIN_D,
                (3, 0x14) => Opcode::AMOMAX_D,
                (3, 0x18) => Opcode::AMOMINU_D,
                (3, 0x1c) => Opcode::AMOMAXU_D,
                _ => Opcode::Unknown,
            };
            (op, None)
        }
        _ => (Opcode::Unknown, None),
    };

    Instruction {
        addr,
        bytes,
        len: 4,
        opcode,
        rd: Some(rd),
        rs1: Some(rs1),
        rs2: Some(rs2),
        imm,
    }
}

/// Decode a 16-bit compressed instruction
fn decode_compressed(addr: u64, bytes: u32) -> Instruction {
    let quadrant = bytes & 0x3;
    let funct3 = (bytes >> 13) & 0x7;

    // Simplified compressed decoding - expand to full form
    let (opcode, rd, rs1, rs2, imm) = match (quadrant, funct3) {
        (0, 0) => {
            // C.ADDI4SPN
            let rd = ((bytes >> 2) & 0x7) as u8 + 8;
            let imm = decode_ciw_imm(bytes);
            (Opcode::C_ADDI4SPN, Some(rd), Some(2), None, Some(imm))
        }
        (0, 2) => {
            // C.LW
            let rd = ((bytes >> 2) & 0x7) as u8 + 8;
            let rs1 = ((bytes >> 7) & 0x7) as u8 + 8;
            let imm = decode_cl_imm_w(bytes);
            (Opcode::C_LW, Some(rd), Some(rs1), None, Some(imm))
        }
        (0, 3) => {
            // C.LD
            let rd = ((bytes >> 2) & 0x7) as u8 + 8;
            let rs1 = ((bytes >> 7) & 0x7) as u8 + 8;
            let imm = decode_cl_imm_d(bytes);
            (Opcode::C_LD, Some(rd), Some(rs1), None, Some(imm))
        }
        (0, 6) => {
            // C.SW
            let rs2 = ((bytes >> 2) & 0x7) as u8 + 8;
            let rs1 = ((bytes >> 7) & 0x7) as u8 + 8;
            let imm = decode_cl_imm_w(bytes);
            (Opcode::C_SW, None, Some(rs1), Some(rs2), Some(imm))
        }
        (0, 7) => {
            // C.SD
            let rs2 = ((bytes >> 2) & 0x7) as u8 + 8;
            let rs1 = ((bytes >> 7) & 0x7) as u8 + 8;
            let imm = decode_cl_imm_d(bytes);
            (Opcode::C_SD, None, Some(rs1), Some(rs2), Some(imm))
        }
        (1, 0) => {
            // C.NOP or C.ADDI
            let rd = ((bytes >> 7) & 0x1f) as u8;
            let imm = decode_ci_imm(bytes);
            if rd == 0 {
                (Opcode::C_NOP, None, None, None, None)
            } else {
                (Opcode::C_ADDI, Some(rd), Some(rd), None, Some(imm))
            }
        }
        (1, 1) => {
            // C.ADDIW
            let rd = ((bytes >> 7) & 0x1f) as u8;
            let imm = decode_ci_imm(bytes);
            (Opcode::C_ADDIW, Some(rd), Some(rd), None, Some(imm))
        }
        (1, 2) => {
            // C.LI
            let rd = ((bytes >> 7) & 0x1f) as u8;
            let imm = decode_ci_imm(bytes);
            (Opcode::C_LI, Some(rd), Some(0), None, Some(imm))
        }
        (1, 3) => {
            let rd = ((bytes >> 7) & 0x1f) as u8;
            if rd == 2 {
                // C.ADDI16SP
                let imm = decode_addi16sp_imm(bytes);
                (Opcode::C_ADDI16SP, Some(2), Some(2), None, Some(imm))
            } else {
                // C.LUI
                let imm = decode_ci_lui_imm(bytes);
                (Opcode::C_LUI, Some(rd), None, None, Some(imm))
            }
        }
        (1, 4) => {
            // C.SRLI, C.SRAI, C.ANDI, C.SUB, C.XOR, C.OR, C.AND
            let rd = ((bytes >> 7) & 0x7) as u8 + 8;
            let funct2 = (bytes >> 10) & 0x3;
            match funct2 {
                0 => {
                    let imm = decode_ci_shamt(bytes);
                    (Opcode::C_SRLI, Some(rd), Some(rd), None, Some(imm))
                }
                1 => {
                    let imm = decode_ci_shamt(bytes);
                    (Opcode::C_SRAI, Some(rd), Some(rd), None, Some(imm))
                }
                2 => {
                    let imm = decode_ci_imm(bytes);
                    (Opcode::C_ANDI, Some(rd), Some(rd), None, Some(imm))
                }
                3 => {
                    let rs2 = ((bytes >> 2) & 0x7) as u8 + 8;
                    let funct = (bytes >> 5) & 0x3;
                    let funct12 = (bytes >> 12) & 0x1;
                    let op = match (funct12, funct) {
                        (0, 0) => Opcode::C_SUB,
                        (0, 1) => Opcode::C_XOR,
                        (0, 2) => Opcode::C_OR,
                        (0, 3) => Opcode::C_AND,
                        (1, 0) => Opcode::C_SUBW,
                        (1, 1) => Opcode::C_ADDW,
                        _ => Opcode::Unknown,
                    };
                    (op, Some(rd), Some(rd), Some(rs2), None)
                }
                _ => (Opcode::Unknown, None, None, None, None),
            }
        }
        (1, 5) => {
            // C.J
            let imm = decode_cj_imm(bytes);
            (Opcode::C_J, Some(0), None, None, Some(imm))
        }
        (1, 6) => {
            // C.BEQZ
            let rs1 = ((bytes >> 7) & 0x7) as u8 + 8;
            let imm = decode_cb_imm(bytes);
            (Opcode::C_BEQZ, None, Some(rs1), Some(0), Some(imm))
        }
        (1, 7) => {
            // C.BNEZ
            let rs1 = ((bytes >> 7) & 0x7) as u8 + 8;
            let imm = decode_cb_imm(bytes);
            (Opcode::C_BNEZ, None, Some(rs1), Some(0), Some(imm))
        }
        (2, 0) => {
            // C.SLLI
            let rd = ((bytes >> 7) & 0x1f) as u8;
            let imm = decode_ci_shamt(bytes);
            (Opcode::C_SLLI, Some(rd), Some(rd), None, Some(imm))
        }
        (2, 2) => {
            // C.LWSP
            let rd = ((bytes >> 7) & 0x1f) as u8;
            let imm = decode_ci_lwsp_imm(bytes);
            (Opcode::C_LWSP, Some(rd), Some(2), None, Some(imm))
        }
        (2, 3) => {
            // C.LDSP
            let rd = ((bytes >> 7) & 0x1f) as u8;
            let imm = decode_ci_ldsp_imm(bytes);
            (Opcode::C_LDSP, Some(rd), Some(2), None, Some(imm))
        }
        (2, 4) => {
            let rs1 = ((bytes >> 7) & 0x1f) as u8;
            let rs2 = ((bytes >> 2) & 0x1f) as u8;
            let bit12 = (bytes >> 12) & 0x1;

            if bit12 == 0 {
                if rs2 == 0 {
                    // C.JR
                    (Opcode::C_JR, Some(0), Some(rs1), None, Some(0))
                } else {
                    // C.MV
                    (Opcode::C_MV, Some(rs1), Some(0), Some(rs2), None)
                }
            } else if rs2 == 0 {
                if rs1 == 0 {
                    // C.EBREAK
                    (Opcode::C_EBREAK, None, None, None, None)
                } else {
                    // C.JALR
                    (Opcode::C_JALR, Some(1), Some(rs1), None, Some(0))
                }
            } else {
                // C.ADD
                (Opcode::C_ADD, Some(rs1), Some(rs1), Some(rs2), None)
            }
        }
        (2, 6) => {
            // C.SWSP
            let rs2 = ((bytes >> 2) & 0x1f) as u8;
            let imm = decode_css_imm_w(bytes);
            (Opcode::C_SWSP, None, Some(2), Some(rs2), Some(imm))
        }
        (2, 7) => {
            // C.SDSP
            let rs2 = ((bytes >> 2) & 0x1f) as u8;
            let imm = decode_css_imm_d(bytes);
            (Opcode::C_SDSP, None, Some(2), Some(rs2), Some(imm))
        }
        _ => (Opcode::Unknown, None, None, None, None),
    };

    Instruction {
        addr,
        bytes,
        len: 2,
        opcode,
        rd,
        rs1,
        rs2,
        imm,
    }
}

// Immediate decoders

fn decode_j_imm(inst: u32) -> i64 {
    let imm20 = (inst >> 31) & 0x1;
    let imm10_1 = (inst >> 21) & 0x3ff;
    let imm11 = (inst >> 20) & 0x1;
    let imm19_12 = (inst >> 12) & 0xff;

    let imm = (imm20 << 20) | (imm19_12 << 12) | (imm11 << 11) | (imm10_1 << 1);
    // Sign extend from 21 bits
    ((imm as i32) << 11 >> 11) as i64
}

fn decode_b_imm(inst: u32) -> i64 {
    let imm12 = (inst >> 31) & 0x1;
    let imm10_5 = (inst >> 25) & 0x3f;
    let imm4_1 = (inst >> 8) & 0xf;
    let imm11 = (inst >> 7) & 0x1;

    let imm = (imm12 << 12) | (imm11 << 11) | (imm10_5 << 5) | (imm4_1 << 1);
    // Sign extend from 13 bits
    ((imm as i32) << 19 >> 19) as i64
}

fn decode_s_imm(inst: u32) -> i64 {
    let imm11_5 = (inst >> 25) & 0x7f;
    let imm4_0 = (inst >> 7) & 0x1f;
    let imm = (imm11_5 << 5) | imm4_0;
    // Sign extend from 12 bits
    ((imm as i32) << 20 >> 20) as i64
}

fn decode_ci_imm(inst: u32) -> i64 {
    let imm5 = (inst >> 12) & 0x1;
    let imm4_0 = (inst >> 2) & 0x1f;
    let imm = (imm5 << 5) | imm4_0;
    // Sign extend from 6 bits
    ((imm as i32) << 26 >> 26) as i64
}

fn decode_ci_shamt(inst: u32) -> i64 {
    let shamt5 = (inst >> 12) & 0x1;
    let shamt4_0 = (inst >> 2) & 0x1f;
    ((shamt5 << 5) | shamt4_0) as i64
}

fn decode_ci_lui_imm(inst: u32) -> i64 {
    let imm17 = (inst >> 12) & 0x1;
    let imm16_12 = (inst >> 2) & 0x1f;
    let imm = (imm17 << 17) | (imm16_12 << 12);
    // Sign extend from 18 bits
    ((imm as i32) << 14 >> 14) as i64
}

fn decode_ci_lwsp_imm(inst: u32) -> i64 {
    let imm5 = (inst >> 12) & 0x1;
    let imm4_2 = (inst >> 4) & 0x7;
    let imm7_6 = (inst >> 2) & 0x3;
    ((imm5 << 5) | (imm4_2 << 2) | (imm7_6 << 6)) as i64
}

fn decode_ci_ldsp_imm(inst: u32) -> i64 {
    let imm5 = (inst >> 12) & 0x1;
    let imm4_3 = (inst >> 5) & 0x3;
    let imm8_6 = (inst >> 2) & 0x7;
    ((imm5 << 5) | (imm4_3 << 3) | (imm8_6 << 6)) as i64
}

fn decode_css_imm_w(inst: u32) -> i64 {
    let imm5_2 = (inst >> 9) & 0xf;
    let imm7_6 = (inst >> 7) & 0x3;
    ((imm5_2 << 2) | (imm7_6 << 6)) as i64
}

fn decode_css_imm_d(inst: u32) -> i64 {
    let imm5_3 = (inst >> 10) & 0x7;
    let imm8_6 = (inst >> 7) & 0x7;
    ((imm5_3 << 3) | (imm8_6 << 6)) as i64
}

fn decode_ciw_imm(inst: u32) -> i64 {
    let imm5_4 = (inst >> 11) & 0x3;
    let imm9_6 = (inst >> 7) & 0xf;
    let imm2 = (inst >> 6) & 0x1;
    let imm3 = (inst >> 5) & 0x1;
    ((imm5_4 << 4) | (imm9_6 << 6) | (imm2 << 2) | (imm3 << 3)) as i64
}

fn decode_cl_imm_w(inst: u32) -> i64 {
    let imm5_3 = (inst >> 10) & 0x7;
    let imm2 = (inst >> 6) & 0x1;
    let imm6 = (inst >> 5) & 0x1;
    ((imm5_3 << 3) | (imm2 << 2) | (imm6 << 6)) as i64
}

fn decode_cl_imm_d(inst: u32) -> i64 {
    let imm5_3 = (inst >> 10) & 0x7;
    let imm7_6 = (inst >> 5) & 0x3;
    ((imm5_3 << 3) | (imm7_6 << 6)) as i64
}

fn decode_cb_imm(inst: u32) -> i64 {
    let imm8 = (inst >> 12) & 0x1;
    let imm4_3 = (inst >> 10) & 0x3;
    let imm7_6 = (inst >> 5) & 0x3;
    let imm2_1 = (inst >> 3) & 0x3;
    let imm5 = (inst >> 2) & 0x1;
    let imm = (imm8 << 8) | (imm4_3 << 3) | (imm7_6 << 6) | (imm2_1 << 1) | (imm5 << 5);
    // Sign extend from 9 bits
    ((imm as i32) << 23 >> 23) as i64
}

fn decode_cj_imm(inst: u32) -> i64 {
    let imm11 = (inst >> 12) & 0x1;
    let imm4 = (inst >> 11) & 0x1;
    let imm9_8 = (inst >> 9) & 0x3;
    let imm10 = (inst >> 8) & 0x1;
    let imm6 = (inst >> 7) & 0x1;
    let imm7 = (inst >> 6) & 0x1;
    let imm3_1 = (inst >> 3) & 0x7;
    let imm5 = (inst >> 2) & 0x1;

    let imm = (imm11 << 11)
        | (imm10 << 10)
        | (imm9_8 << 8)
        | (imm7 << 7)
        | (imm6 << 6)
        | (imm5 << 5)
        | (imm4 << 4)
        | (imm3_1 << 1);
    // Sign extend from 12 bits
    ((imm as i32) << 20 >> 20) as i64
}

fn decode_addi16sp_imm(inst: u32) -> i64 {
    let imm9 = (inst >> 12) & 0x1;
    let imm4 = (inst >> 6) & 0x1;
    let imm6 = (inst >> 5) & 0x1;
    let imm8_7 = (inst >> 3) & 0x3;
    let imm5 = (inst >> 2) & 0x1;

    let imm = (imm9 << 9) | (imm8_7 << 7) | (imm6 << 6) | (imm5 << 5) | (imm4 << 4);
    // Sign extend from 10 bits
    ((imm as i32) << 22 >> 22) as i64
}
