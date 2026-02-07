// cfg.rs - Control Flow Graph builder
//
// Constructs basic blocks and identifies functions from disassembled instructions.

use crate::disasm::{Instruction, Opcode};
use anyhow::Result;
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// A basic block of instructions
#[derive(Debug, Clone)]
pub struct BasicBlock {
    /// Start address
    pub start_addr: u64,
    /// End address (after last instruction)
    pub end_addr: u64,
    /// Instructions in this block
    pub instructions: Vec<Instruction>,
    /// Possible successor addresses
    pub successors: Vec<u64>,
    /// Is this a function entry point?
    pub is_function_entry: bool,
}

/// A function (collection of basic blocks)
#[derive(Debug, Clone)]
pub struct Function {
    /// Entry point address
    pub entry: u64,
    /// Name (from symbol table or generated)
    pub name: String,
    /// Block addresses belonging to this function
    pub blocks: Vec<u64>,
}

/// Control flow graph
#[derive(Debug)]
pub struct ControlFlowGraph {
    /// Basic blocks by start address
    pub blocks: BTreeMap<u64, BasicBlock>,
    /// Functions
    pub functions: Vec<Function>,
    /// Entry point
    pub entry: u64,
}

/// Build the control flow graph from disassembled instructions
pub fn build(instructions: &[Instruction], entry: u64) -> Result<ControlFlowGraph> {
    // Phase 1: Identify block boundaries
    let boundaries = find_block_boundaries(instructions, entry);

    // Phase 2: Create basic blocks
    let blocks = create_blocks(instructions, &boundaries);

    // Phase 3: Identify functions
    let functions = identify_functions(&blocks, entry);

    Ok(ControlFlowGraph {
        blocks,
        functions,
        entry,
    })
}

/// Find addresses that start new basic blocks
fn find_block_boundaries(instructions: &[Instruction], entry: u64) -> BTreeSet<u64> {
    let mut boundaries = BTreeSet::new();

    // Entry point is always a boundary
    boundaries.insert(entry);

    // First instruction is a boundary
    if let Some(first) = instructions.first() {
        boundaries.insert(first.addr);
    }

    for inst in instructions {
        // Terminators mark end of block, next instruction starts new block
        if inst.opcode.is_terminator() {
            let next_addr = inst.addr + inst.len as u64;
            boundaries.insert(next_addr);
        }

        // Branch/jump targets are block starts
        if inst.opcode.is_branch() || inst.opcode.is_jump() {
            if let Some(imm) = inst.imm {
                // Direct branches: target is PC + immediate
                let target = (inst.addr as i64 + imm) as u64;
                boundaries.insert(target);
            }
        }

        // JAL with rd=ra (x1) or x5 are function calls
        // The target is a function entry
        if inst.opcode == Opcode::JAL || inst.opcode == Opcode::C_JAL {
            if let Some(imm) = inst.imm {
                let target = (inst.addr as i64 + imm) as u64;
                boundaries.insert(target);
            }
        }
    }

    boundaries
}

/// Create basic blocks from instructions and boundaries
fn create_blocks(
    instructions: &[Instruction],
    boundaries: &BTreeSet<u64>,
) -> BTreeMap<u64, BasicBlock> {
    let mut blocks = BTreeMap::new();
    let mut current_block: Option<BasicBlock> = None;

    for inst in instructions {
        // Check if this starts a new block
        if boundaries.contains(&inst.addr) {
            // Finish previous block
            if let Some(block) = current_block.take() {
                blocks.insert(block.start_addr, block);
            }

            // Start new block
            current_block = Some(BasicBlock {
                start_addr: inst.addr,
                end_addr: inst.addr + inst.len as u64,
                instructions: vec![inst.clone()],
                successors: Vec::new(),
                is_function_entry: false,
            });
        } else if let Some(ref mut block) = current_block {
            // Add to current block
            block.instructions.push(inst.clone());
            block.end_addr = inst.addr + inst.len as u64;
        }

        // If this is a terminator, compute successors
        if inst.opcode.is_terminator() {
            if let Some(ref mut block) = current_block {
                block.successors = compute_successors(inst);
            }
        }
    }

    // Don't forget last block
    if let Some(block) = current_block {
        blocks.insert(block.start_addr, block);
    }

    // Add fall-through successors for non-terminating blocks
    let block_addrs: Vec<u64> = blocks.keys().copied().collect();
    for addr in &block_addrs {
        let block = blocks.get(addr).unwrap();
        if block.successors.is_empty() {
            // Fall through to next block
            let next_addr = block.end_addr;
            if blocks.contains_key(&next_addr) {
                let block = blocks.get_mut(addr).unwrap();
                block.successors.push(next_addr);
            }
        }
    }

    blocks
}

/// Compute successor addresses for a terminator instruction
fn compute_successors(inst: &Instruction) -> Vec<u64> {
    let mut successors = Vec::new();
    let next_addr = inst.addr + inst.len as u64;

    match inst.opcode {
        // Conditional branches: target + fallthrough
        Opcode::BEQ
        | Opcode::BNE
        | Opcode::BLT
        | Opcode::BGE
        | Opcode::BLTU
        | Opcode::BGEU
        | Opcode::C_BEQZ
        | Opcode::C_BNEZ => {
            if let Some(imm) = inst.imm {
                let target = (inst.addr as i64 + imm) as u64;
                successors.push(target);
            }
            successors.push(next_addr);
        }

        // Unconditional direct jumps
        Opcode::JAL | Opcode::C_J | Opcode::C_JAL => {
            if let Some(imm) = inst.imm {
                let target = (inst.addr as i64 + imm) as u64;

                // JAL with rd != 0 is a call - continues after
                let rd = inst.rd.unwrap_or(0);
                if rd != 0 {
                    successors.push(next_addr);
                }
                successors.push(target);
            }
        }

        // Indirect jumps - can't know target statically
        Opcode::JALR | Opcode::C_JR | Opcode::C_JALR => {
            // rd != 0 means it's a call, will return
            let rd = inst.rd.unwrap_or(0);
            if rd != 0 {
                successors.push(next_addr);
            }
            // For JALR with rs1=ra and rd=0, it's a return - no known successor
            // We'll mark these specially during translation
        }

        // ECALL/EBREAK - typically returns to next instruction
        Opcode::ECALL | Opcode::EBREAK | Opcode::C_EBREAK => {
            successors.push(next_addr);
        }

        _ => {
            // Not a terminator
            successors.push(next_addr);
        }
    }

    successors
}

/// Identify functions from the CFG
fn identify_functions(blocks: &BTreeMap<u64, BasicBlock>, entry: u64) -> Vec<Function> {
    let mut functions = Vec::new();
    let mut seen = BTreeSet::new();

    // Find function entry points (called via JAL/JALR)
    let mut call_targets = BTreeSet::new();
    call_targets.insert(entry);

    for block in blocks.values() {
        for inst in &block.instructions {
            if inst.opcode == Opcode::JAL || inst.opcode == Opcode::C_JAL {
                if let Some(imm) = inst.imm {
                    let target = (inst.addr as i64 + imm) as u64;
                    call_targets.insert(target);
                }
            }
        }
    }

    // Create functions from call targets
    for &entry_addr in &call_targets {
        if seen.contains(&entry_addr) {
            continue;
        }
        if !blocks.contains_key(&entry_addr) {
            continue;
        }

        // Collect all reachable blocks
        let mut func_blocks = Vec::new();
        let mut worklist = vec![entry_addr];
        let mut visited = BTreeSet::new();

        while let Some(addr) = worklist.pop() {
            if visited.contains(&addr) {
                continue;
            }
            visited.insert(addr);

            if let Some(block) = blocks.get(&addr) {
                func_blocks.push(addr);

                for &succ in &block.successors {
                    // Don't cross into other functions
                    if !call_targets.contains(&succ) || succ == entry_addr {
                        worklist.push(succ);
                    }
                }
            }
        }

        seen.extend(&visited);

        functions.push(Function {
            entry: entry_addr,
            name: format!("func_{:x}", entry_addr),
            blocks: func_blocks,
        });
    }

    functions
}

impl BasicBlock {
    /// Get the last instruction (terminator if present)
    pub fn terminator(&self) -> Option<&Instruction> {
        self.instructions.last()
    }

    /// Is this a return block?
    pub fn is_return(&self) -> bool {
        if let Some(term) = self.terminator() {
            // JALR with rs1=ra (x1) and rd=x0 is a return
            if term.opcode == Opcode::JALR || term.opcode == Opcode::C_JR {
                let rs1 = term.rs1.unwrap_or(0);
                let rd = term.rd.unwrap_or(0);
                return rs1 == 1 && rd == 0;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_cfg() {
        let cfg = build(&[], 0x1000).unwrap();
        assert!(cfg.blocks.is_empty());
    }
}
