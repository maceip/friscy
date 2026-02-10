// wasm_builder.rs - Wasm binary generation
//
// Converts the intermediate WasmModule to actual Wasm bytecode using wasm-encoder.

use crate::translate::{WasmInst, WasmModule};
use anyhow::Result;
use std::collections::BTreeMap;
use wasm_encoder::{
    CodeSection, ConstExpr, ElementSection, Elements, EntityType, ExportKind, ExportSection,
    Function, FunctionSection, ImportSection, Instruction, MemorySection, MemoryType, Module,
    TableSection, TableType, TypeSection, ValType,
};

/// Build the final Wasm binary
pub fn build(module: &WasmModule) -> Result<Vec<u8>> {
    let mut wasm = Module::new();

    // ==========================================================================
    // Type section
    // ==========================================================================
    let mut types = TypeSection::new();

    // Type 0: Block function (param $m i32) (result i32)
    types.function(vec![ValType::I32], vec![ValType::I32]);

    // Type 1: Dispatch function (param $m i32, $pc i32) (result i32)
    types.function(vec![ValType::I32, ValType::I32], vec![ValType::I32]);

    // Type 2: Syscall handler (param $m i32, $pc i32) (result i32)
    types.function(vec![ValType::I32, ValType::I32], vec![ValType::I32]);

    wasm.section(&types);

    // ==========================================================================
    // Import section
    // ==========================================================================
    let mut imports = ImportSection::new();

    // Import memory from environment
    imports.import(
        "env",
        "memory",
        MemoryType {
            minimum: module.memory_pages as u64,
            maximum: Some((module.memory_pages * 4) as u64),
            memory64: false,
            shared: false,
        },
    );

    // Import syscall handler
    imports.import("env", "syscall", EntityType::Function(2));

    wasm.section(&imports);

    // ==========================================================================
    // Function section (declare function types)
    // ==========================================================================
    let mut functions = FunctionSection::new();

    // Dispatch function (index 1 after import)
    functions.function(1);

    // Block functions (type 0)
    for _ in &module.functions {
        functions.function(0);
    }

    wasm.section(&functions);

    // ==========================================================================
    // Table section (for indirect calls)
    // ==========================================================================
    let mut tables = TableSection::new();

    // Table for block dispatch
    tables.table(TableType {
        element_type: wasm_encoder::RefType::FUNCREF,
        minimum: module.functions.len() as u32,
        maximum: Some(module.functions.len() as u32),
    });

    wasm.section(&tables);

    // ==========================================================================
    // Memory section (if not imported)
    // ==========================================================================
    // Memory is imported, so skip this

    // ==========================================================================
    // Element section (populate function table for call_indirect)
    // ==========================================================================
    let mut elements = ElementSection::new();

    // Build function reference list: indices 2, 3, 4, ... (block functions)
    // Index 0 = imported syscall, Index 1 = dispatch, Index 2+ = block functions
    let func_indices: Vec<u32> = (0..module.functions.len())
        .map(|i| (i + 2) as u32)
        .collect();

    // Active element segment at table index 0, offset 0
    elements.active(
        Some(0),                           // table index
        &ConstExpr::i32_const(0),          // offset
        Elements::Functions(&func_indices),
    );

    wasm.section(&elements);

    // ==========================================================================
    // Export section
    // ==========================================================================
    let mut exports = ExportSection::new();

    // Export dispatch function
    exports.export("run", ExportKind::Func, 1);

    // Export individual block functions for debugging
    for (idx, func) in module.functions.iter().enumerate() {
        exports.export(&func.name, ExportKind::Func, (idx + 2) as u32);
    }

    wasm.section(&exports);

    // ==========================================================================
    // Code section
    // ==========================================================================
    let mut codes = CodeSection::new();

    // Build address-to-table-index mapping for dispatch
    // Table index = position in func_indices (0, 1, 2, ...)
    let addr_to_table_idx: BTreeMap<u64, u32> = module
        .functions
        .iter()
        .enumerate()
        .map(|(i, f)| (f.block_addr, i as u32))
        .collect();

    // Dispatch function
    let dispatch_func = build_dispatch_function(module, &addr_to_table_idx);
    codes.function(&dispatch_func);

    // Block functions
    for func in &module.functions {
        let wasm_func = build_block_function(func)?;
        codes.function(&wasm_func);
    }

    wasm.section(&codes);

    Ok(wasm.finish())
}

/// Build the main dispatch function with O(1) block lookup via call_indirect
fn build_dispatch_function(module: &WasmModule, addr_to_table_idx: &BTreeMap<u64, u32>) -> Function {
    // Locals: param 0 = $m (i32), param 1 = $start_pc (i32), local 2 = $pc (i32)
    let mut func = Function::new(vec![(1, ValType::I32)]); // 1 local for pc

    // Initialize $pc from parameter
    func.instruction(&Instruction::LocalGet(1));
    func.instruction(&Instruction::LocalSet(2));

    // Main dispatch loop
    func.instruction(&Instruction::Loop(wasm_encoder::BlockType::Empty));

    // Check for halt (-1)
    func.instruction(&Instruction::LocalGet(2));
    func.instruction(&Instruction::I32Const(-1));
    func.instruction(&Instruction::I32Eq);
    func.instruction(&Instruction::If(wasm_encoder::BlockType::Empty));
    func.instruction(&Instruction::I32Const(0));
    func.instruction(&Instruction::Return);
    func.instruction(&Instruction::End);

    // Check for syscall (high bit set = 0x80000000)
    func.instruction(&Instruction::LocalGet(2));
    func.instruction(&Instruction::I32Const(0x80000000u32 as i32));
    func.instruction(&Instruction::I32And);
    func.instruction(&Instruction::If(wasm_encoder::BlockType::Empty));
    func.instruction(&Instruction::LocalGet(0)); // $m
    func.instruction(&Instruction::LocalGet(2)); // $pc with flags
    func.instruction(&Instruction::Call(0)); // syscall handler (import index 0)
    func.instruction(&Instruction::LocalSet(2));
    func.instruction(&Instruction::Br(1)); // Continue loop
    func.instruction(&Instruction::End);

    // Dispatch to block via call_indirect
    // We need to convert PC address to table index
    // Strategy: Use computed index if addresses are dense, else if-else chain

    if module.functions.is_empty() {
        // No blocks - just return
        func.instruction(&Instruction::I32Const(0));
        func.instruction(&Instruction::Return);
    } else if can_use_dense_table(module) {
        // Dense table: (pc - base_addr) / 4 gives table index
        let base_addr = module.functions.first().map(|f| f.block_addr).unwrap_or(0);

        // Push $m for call_indirect param
        func.instruction(&Instruction::LocalGet(0));

        // Compute table index: (pc - base_addr) >> 2
        func.instruction(&Instruction::LocalGet(2)); // $pc
        func.instruction(&Instruction::I32Const(base_addr as i32));
        func.instruction(&Instruction::I32Sub);
        func.instruction(&Instruction::I32Const(2));
        func.instruction(&Instruction::I32ShrU);

        // call_indirect with type 0 (block function signature)
        func.instruction(&Instruction::CallIndirect {
            ty: 0,
            table: 0,
        });

        func.instruction(&Instruction::LocalSet(2));
    } else {
        // Sparse addresses: use br_table with block nesting
        // Generate a block per address with nested blocks for br_table targets
        emit_sparse_dispatch(&mut func, module, addr_to_table_idx);
    }

    func.instruction(&Instruction::Br(0)); // Continue loop
    func.instruction(&Instruction::End); // End loop

    func.instruction(&Instruction::I32Const(0));
    func.instruction(&Instruction::End);

    func
}

/// Check if block addresses are dense enough for (pc - base) / 4 indexing
fn can_use_dense_table(module: &WasmModule) -> bool {
    if module.functions.len() <= 1 {
        return true;
    }

    let addrs: Vec<u64> = module.functions.iter().map(|f| f.block_addr).collect();
    let min_addr = *addrs.iter().min().unwrap();
    let max_addr = *addrs.iter().max().unwrap();

    // Dense if span / 4 roughly equals number of blocks (allow 2x overhead)
    let span = (max_addr - min_addr) / 4 + 1;
    span <= (module.functions.len() as u64 * 2)
}

/// Emit sparse dispatch using br_table with dense index mapping, or if-else fallback
fn emit_sparse_dispatch(func: &mut Function, module: &WasmModule, addr_to_table_idx: &BTreeMap<u64, u32>) {
    let sorted_addrs: Vec<(u64, u32)> = addr_to_table_idx.iter().map(|(&a, &t)| (a, t)).collect();
    let n = sorted_addrs.len(); // number of real blocks

    if n == 0 {
        func.instruction(&Instruction::I32Const(-1));
        func.instruction(&Instruction::LocalSet(2));
        return;
    }

    let base_addr = sorted_addrs[0].0;
    let max_addr = sorted_addrs[n - 1].0;

    // Compute alignment (GCD of all offsets from base) for compact indexing
    let alignment = compute_addr_alignment(&sorted_addrs);
    let table_size = if max_addr == base_addr {
        1
    } else {
        ((max_addr - base_addr) / alignment + 1) as usize
    };

    // Use br_table for O(1) dispatch when table fits in memory
    if table_size <= 65536 {
        emit_br_table_dispatch(func, &sorted_addrs, base_addr, alignment, table_size, n);
    } else {
        // Fallback: if-else chain for extremely sparse address spaces
        emit_if_else_dispatch(func, &sorted_addrs);
    }
}

/// Compute the alignment (GCD) of block addresses for dense br_table indexing
fn compute_addr_alignment(addrs: &[(u64, u32)]) -> u64 {
    if addrs.len() <= 1 {
        return 2; // minimum RISC-V instruction alignment (C extension)
    }
    let base = addrs[0].0;
    let mut g = 0u64;
    for &(addr, _) in &addrs[1..] {
        g = gcd_u64(g, addr - base);
    }
    if g == 0 { 2 } else { g }
}

fn gcd_u64(a: u64, b: u64) -> u64 {
    if b == 0 { a } else { gcd_u64(b, a % b) }
}

/// Emit O(1) br_table dispatch with dense index mapping
///
/// Structure (n = number of real blocks):
///   block $outer          ;; all cases break here to reach loop continue
///    block $case_{n-1}
///     ...
///      block $case_0
///       block $default
///        ;; compute index = (pc - base) / alignment
///        br_table [targets...] default
///       end               ;; → DEFAULT handler
///       DEFAULT: pc = -1; br n  (exits $outer)
///      end                ;; → CASE 0 handler
///      CASE 0: call block_0; br (n-1)
///     end                 ;; → CASE 1 handler
///     ...
///    end                  ;; → CASE n-1 handler
///    CASE n-1: call block_{n-1}; br 0  (exits $outer)
///   end $outer            ;; falls through to loop continue
fn emit_br_table_dispatch(
    func: &mut Function,
    sorted_addrs: &[(u64, u32)],
    base_addr: u64,
    alignment: u64,
    table_size: usize,
    n: usize,
) {
    // Build address → case number mapping
    let mut addr_to_case: std::collections::HashMap<u64, usize> = std::collections::HashMap::new();
    for (case_num, &(addr, _)) in sorted_addrs.iter().enumerate() {
        addr_to_case.insert(addr, case_num);
    }

    // Emit block nesting: $outer + n case blocks + $default (outermost to innermost)
    func.instruction(&Instruction::Block(wasm_encoder::BlockType::Empty)); // $outer
    for _ in 0..n {
        func.instruction(&Instruction::Block(wasm_encoder::BlockType::Empty)); // $case_j
    }
    func.instruction(&Instruction::Block(wasm_encoder::BlockType::Empty)); // $default

    // Compute dense index: (pc - base_addr) / alignment
    func.instruction(&Instruction::LocalGet(2)); // $pc
    func.instruction(&Instruction::I32Const(base_addr as i32));
    func.instruction(&Instruction::I32Sub);
    let shift = alignment.trailing_zeros();
    if alignment.is_power_of_two() && shift > 0 {
        func.instruction(&Instruction::I32Const(shift as i32));
        func.instruction(&Instruction::I32ShrU);
    } else if alignment > 1 {
        func.instruction(&Instruction::I32Const(alignment as i32));
        func.instruction(&Instruction::I32DivU);
    }

    // Build br_table targets:
    //   From br_table position (inside $default + n case blocks + $outer):
    //     depth 0 → $default → DEFAULT handler
    //     depth (j+1) → $case_j → CASE j handler
    let mut targets: Vec<u32> = Vec::with_capacity(table_size);
    for i in 0..table_size {
        let addr = base_addr + (i as u64) * alignment;
        match addr_to_case.get(&addr) {
            Some(&case_num) => targets.push((case_num + 1) as u32),
            None => targets.push(0), // default
        }
    }

    func.instruction(&Instruction::BrTable(targets.into(), 0)); // default = depth 0

    // End $default block
    func.instruction(&Instruction::End);
    // DEFAULT handler: unknown PC, halt
    func.instruction(&Instruction::I32Const(-1));
    func.instruction(&Instruction::LocalSet(2));
    func.instruction(&Instruction::Br(n as u32)); // exit $outer

    // Emit case handlers (one per real block, in sorted address order)
    for (case_num, &(_addr, table_idx)) in sorted_addrs.iter().enumerate() {
        func.instruction(&Instruction::End); // end $case_{case_num}

        // Call block function via call_indirect
        func.instruction(&Instruction::LocalGet(0)); // $m
        func.instruction(&Instruction::I32Const(table_idx as i32));
        func.instruction(&Instruction::CallIndirect { ty: 0, table: 0 });
        func.instruction(&Instruction::LocalSet(2));

        // Break to $outer
        func.instruction(&Instruction::Br((n - 1 - case_num) as u32));
    }

    func.instruction(&Instruction::End); // end $outer
}

/// Fallback: if-else chain dispatch for extremely sparse address spaces
fn emit_if_else_dispatch(func: &mut Function, sorted_addrs: &[(u64, u32)]) {
    for &(addr, table_idx) in sorted_addrs {
        func.instruction(&Instruction::LocalGet(2)); // $pc
        func.instruction(&Instruction::I32Const(addr as i32));
        func.instruction(&Instruction::I32Eq);
        func.instruction(&Instruction::If(wasm_encoder::BlockType::Empty));

        func.instruction(&Instruction::LocalGet(0)); // $m
        func.instruction(&Instruction::I32Const(table_idx as i32));
        func.instruction(&Instruction::CallIndirect { ty: 0, table: 0 });
        func.instruction(&Instruction::LocalSet(2));
        func.instruction(&Instruction::Br(1)); // break to loop continue

        func.instruction(&Instruction::End);
    }

    // Default: unknown PC, halt
    func.instruction(&Instruction::I32Const(-1));
    func.instruction(&Instruction::LocalSet(2));
}

/// Build a block function from our IR
fn build_block_function(func: &crate::translate::WasmFunction) -> Result<Function> {
    let mut wasm_func = Function::new(vec![(func.num_locals, ValType::I64)]);

    for inst in &func.body {
        emit_instruction(&mut wasm_func, inst)?;
    }

    wasm_func.instruction(&Instruction::End);

    Ok(wasm_func)
}

/// Emit a single instruction
fn emit_instruction(func: &mut Function, inst: &WasmInst) -> Result<()> {
    match inst {
        // Control flow
        WasmInst::Block { label: _ } => {
            func.instruction(&Instruction::Block(wasm_encoder::BlockType::Empty));
        }
        WasmInst::Loop { label: _ } => {
            func.instruction(&Instruction::Loop(wasm_encoder::BlockType::Empty));
        }
        WasmInst::End => {
            func.instruction(&Instruction::End);
        }
        WasmInst::Br { label } => {
            func.instruction(&Instruction::Br(*label));
        }
        WasmInst::BrIf { label } => {
            func.instruction(&Instruction::BrIf(*label));
        }
        WasmInst::BrTable { labels, default } => {
            func.instruction(&Instruction::BrTable(labels.clone().into(), *default));
        }
        WasmInst::Return => {
            func.instruction(&Instruction::Return);
        }
        WasmInst::Call { func_idx } => {
            func.instruction(&Instruction::Call(*func_idx));
        }
        WasmInst::CallIndirect { type_idx } => {
            func.instruction(&Instruction::CallIndirect {
                ty: *type_idx,
                table: 0,
            });
        }

        // Locals
        WasmInst::LocalGet { idx } => {
            func.instruction(&Instruction::LocalGet(*idx));
        }
        WasmInst::LocalSet { idx } => {
            func.instruction(&Instruction::LocalSet(*idx));
        }
        WasmInst::LocalTee { idx } => {
            func.instruction(&Instruction::LocalTee(*idx));
        }

        // Constants
        WasmInst::I32Const { value } => {
            func.instruction(&Instruction::I32Const(*value));
        }
        WasmInst::I64Const { value } => {
            func.instruction(&Instruction::I64Const(*value));
        }

        // Memory loads
        WasmInst::I32Load { offset } => {
            func.instruction(&Instruction::I32Load(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 2,
                memory_index: 0,
            }));
        }
        WasmInst::I64Load { offset } => {
            func.instruction(&Instruction::I64Load(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 3,
                memory_index: 0,
            }));
        }
        WasmInst::I64Load8S { offset } => {
            func.instruction(&Instruction::I64Load8S(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 0,
                memory_index: 0,
            }));
        }
        WasmInst::I64Load8U { offset } => {
            func.instruction(&Instruction::I64Load8U(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 0,
                memory_index: 0,
            }));
        }
        WasmInst::I64Load16S { offset } => {
            func.instruction(&Instruction::I64Load16S(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 1,
                memory_index: 0,
            }));
        }
        WasmInst::I64Load16U { offset } => {
            func.instruction(&Instruction::I64Load16U(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 1,
                memory_index: 0,
            }));
        }
        WasmInst::I64Load32S { offset } => {
            func.instruction(&Instruction::I64Load32S(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 2,
                memory_index: 0,
            }));
        }
        WasmInst::I64Load32U { offset } => {
            func.instruction(&Instruction::I64Load32U(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 2,
                memory_index: 0,
            }));
        }

        // Memory stores
        WasmInst::I32Store { offset } => {
            func.instruction(&Instruction::I32Store(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 2,
                memory_index: 0,
            }));
        }
        WasmInst::I64Store { offset } => {
            func.instruction(&Instruction::I64Store(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 3,
                memory_index: 0,
            }));
        }
        WasmInst::I64Store8 { offset } => {
            func.instruction(&Instruction::I64Store8(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 0,
                memory_index: 0,
            }));
        }
        WasmInst::I64Store16 { offset } => {
            func.instruction(&Instruction::I64Store16(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 1,
                memory_index: 0,
            }));
        }
        WasmInst::I64Store32 { offset } => {
            func.instruction(&Instruction::I64Store32(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 2,
                memory_index: 0,
            }));
        }

        // i64 arithmetic
        WasmInst::I64Add => {
            func.instruction(&Instruction::I64Add);
        }
        WasmInst::I64Sub => {
            func.instruction(&Instruction::I64Sub);
        }
        WasmInst::I64Mul => {
            func.instruction(&Instruction::I64Mul);
        }
        WasmInst::I64DivS => {
            func.instruction(&Instruction::I64DivS);
        }
        WasmInst::I64DivU => {
            func.instruction(&Instruction::I64DivU);
        }
        WasmInst::I64RemS => {
            func.instruction(&Instruction::I64RemS);
        }
        WasmInst::I64RemU => {
            func.instruction(&Instruction::I64RemU);
        }
        WasmInst::I64And => {
            func.instruction(&Instruction::I64And);
        }
        WasmInst::I64Or => {
            func.instruction(&Instruction::I64Or);
        }
        WasmInst::I64Xor => {
            func.instruction(&Instruction::I64Xor);
        }
        WasmInst::I64Shl => {
            func.instruction(&Instruction::I64Shl);
        }
        WasmInst::I64ShrS => {
            func.instruction(&Instruction::I64ShrS);
        }
        WasmInst::I64ShrU => {
            func.instruction(&Instruction::I64ShrU);
        }
        WasmInst::I64Eqz => {
            func.instruction(&Instruction::I64Eqz);
        }
        WasmInst::I64Eq => {
            func.instruction(&Instruction::I64Eq);
        }
        WasmInst::I64Ne => {
            func.instruction(&Instruction::I64Ne);
        }
        WasmInst::I64LtS => {
            func.instruction(&Instruction::I64LtS);
        }
        WasmInst::I64LtU => {
            func.instruction(&Instruction::I64LtU);
        }
        WasmInst::I64GtS => {
            func.instruction(&Instruction::I64GtS);
        }
        WasmInst::I64GtU => {
            func.instruction(&Instruction::I64GtU);
        }
        WasmInst::I64LeS => {
            func.instruction(&Instruction::I64LeS);
        }
        WasmInst::I64LeU => {
            func.instruction(&Instruction::I64LeU);
        }
        WasmInst::I64GeS => {
            func.instruction(&Instruction::I64GeS);
        }
        WasmInst::I64GeU => {
            func.instruction(&Instruction::I64GeU);
        }

        // i32 loads
        WasmInst::I32Load8S { offset } => {
            func.instruction(&Instruction::I32Load8S(wasm_encoder::MemArg {
                offset: *offset as u64, align: 0, memory_index: 0,
            }));
        }
        WasmInst::I32Load8U { offset } => {
            func.instruction(&Instruction::I32Load8U(wasm_encoder::MemArg {
                offset: *offset as u64, align: 0, memory_index: 0,
            }));
        }
        WasmInst::I32Load16S { offset } => {
            func.instruction(&Instruction::I32Load16S(wasm_encoder::MemArg {
                offset: *offset as u64, align: 1, memory_index: 0,
            }));
        }
        WasmInst::I32Load16U { offset } => {
            func.instruction(&Instruction::I32Load16U(wasm_encoder::MemArg {
                offset: *offset as u64, align: 1, memory_index: 0,
            }));
        }
        // i32 stores
        WasmInst::I32Store8 { offset } => {
            func.instruction(&Instruction::I32Store8(wasm_encoder::MemArg {
                offset: *offset as u64, align: 0, memory_index: 0,
            }));
        }
        WasmInst::I32Store16 { offset } => {
            func.instruction(&Instruction::I32Store16(wasm_encoder::MemArg {
                offset: *offset as u64, align: 1, memory_index: 0,
            }));
        }

        // i32 arithmetic
        WasmInst::I32Add => {
            func.instruction(&Instruction::I32Add);
        }
        WasmInst::I32Sub => {
            func.instruction(&Instruction::I32Sub);
        }
        WasmInst::I32Mul => {
            func.instruction(&Instruction::I32Mul);
        }
        WasmInst::I32DivS => {
            func.instruction(&Instruction::I32DivS);
        }
        WasmInst::I32DivU => {
            func.instruction(&Instruction::I32DivU);
        }
        WasmInst::I32RemS => {
            func.instruction(&Instruction::I32RemS);
        }
        WasmInst::I32RemU => {
            func.instruction(&Instruction::I32RemU);
        }
        WasmInst::I32And => {
            func.instruction(&Instruction::I32And);
        }
        WasmInst::I32Or => {
            func.instruction(&Instruction::I32Or);
        }
        WasmInst::I32Xor => {
            func.instruction(&Instruction::I32Xor);
        }
        WasmInst::I32Shl => {
            func.instruction(&Instruction::I32Shl);
        }
        WasmInst::I32ShrS => {
            func.instruction(&Instruction::I32ShrS);
        }
        WasmInst::I32ShrU => {
            func.instruction(&Instruction::I32ShrU);
        }
        WasmInst::I32Eqz => {
            func.instruction(&Instruction::I32Eqz);
        }
        WasmInst::I32Eq => {
            func.instruction(&Instruction::I32Eq);
        }
        WasmInst::I32Ne => {
            func.instruction(&Instruction::I32Ne);
        }
        WasmInst::I32LtS => {
            func.instruction(&Instruction::I32LtS);
        }
        WasmInst::I32LtU => {
            func.instruction(&Instruction::I32LtU);
        }
        WasmInst::I32GtS => {
            func.instruction(&Instruction::I32GtS);
        }
        WasmInst::I32GtU => {
            func.instruction(&Instruction::I32GtU);
        }
        WasmInst::I32LeS => {
            func.instruction(&Instruction::I32LeS);
        }
        WasmInst::I32LeU => {
            func.instruction(&Instruction::I32LeU);
        }
        WasmInst::I32GeS => {
            func.instruction(&Instruction::I32GeS);
        }
        WasmInst::I32GeU => {
            func.instruction(&Instruction::I32GeU);
        }

        // Conversions
        WasmInst::I32WrapI64 => {
            func.instruction(&Instruction::I32WrapI64);
        }
        WasmInst::I64ExtendI32S => {
            func.instruction(&Instruction::I64ExtendI32S);
        }
        WasmInst::I64ExtendI32U => {
            func.instruction(&Instruction::I64ExtendI32U);
        }

        // Stack
        WasmInst::Drop => {
            func.instruction(&Instruction::Drop);
        }
        WasmInst::Select => {
            func.instruction(&Instruction::Select);
        }

        // Floating-point (f32)
        WasmInst::F32Load { offset } => {
            func.instruction(&Instruction::F32Load(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 2,
                memory_index: 0,
            }));
        }
        WasmInst::F32Store { offset } => {
            func.instruction(&Instruction::F32Store(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 2,
                memory_index: 0,
            }));
        }
        WasmInst::F32Const { value } => {
            func.instruction(&Instruction::F32Const(*value));
        }
        WasmInst::F32Add => {
            func.instruction(&Instruction::F32Add);
        }
        WasmInst::F32Sub => {
            func.instruction(&Instruction::F32Sub);
        }
        WasmInst::F32Mul => {
            func.instruction(&Instruction::F32Mul);
        }
        WasmInst::F32Div => {
            func.instruction(&Instruction::F32Div);
        }
        WasmInst::F32Sqrt => {
            func.instruction(&Instruction::F32Sqrt);
        }
        WasmInst::F32Neg => {
            func.instruction(&Instruction::F32Neg);
        }
        WasmInst::F32Abs => {
            func.instruction(&Instruction::F32Abs);
        }
        WasmInst::F32Ceil => {
            func.instruction(&Instruction::F32Ceil);
        }
        WasmInst::F32Floor => {
            func.instruction(&Instruction::F32Floor);
        }
        WasmInst::F32Trunc => {
            func.instruction(&Instruction::F32Trunc);
        }
        WasmInst::F32Nearest => {
            func.instruction(&Instruction::F32Nearest);
        }
        WasmInst::F32Eq => {
            func.instruction(&Instruction::F32Eq);
        }
        WasmInst::F32Ne => {
            func.instruction(&Instruction::F32Ne);
        }
        WasmInst::F32Lt => {
            func.instruction(&Instruction::F32Lt);
        }
        WasmInst::F32Gt => {
            func.instruction(&Instruction::F32Gt);
        }
        WasmInst::F32Le => {
            func.instruction(&Instruction::F32Le);
        }
        WasmInst::F32Ge => {
            func.instruction(&Instruction::F32Ge);
        }
        WasmInst::F32Min => {
            func.instruction(&Instruction::F32Min);
        }
        WasmInst::F32Max => {
            func.instruction(&Instruction::F32Max);
        }
        WasmInst::F32Copysign => {
            func.instruction(&Instruction::F32Copysign);
        }

        // Floating-point (f64)
        WasmInst::F64Load { offset } => {
            func.instruction(&Instruction::F64Load(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 3,
                memory_index: 0,
            }));
        }
        WasmInst::F64Store { offset } => {
            func.instruction(&Instruction::F64Store(wasm_encoder::MemArg {
                offset: *offset as u64,
                align: 3,
                memory_index: 0,
            }));
        }
        WasmInst::F64Const { value } => {
            func.instruction(&Instruction::F64Const(*value));
        }
        WasmInst::F64Add => {
            func.instruction(&Instruction::F64Add);
        }
        WasmInst::F64Sub => {
            func.instruction(&Instruction::F64Sub);
        }
        WasmInst::F64Mul => {
            func.instruction(&Instruction::F64Mul);
        }
        WasmInst::F64Div => {
            func.instruction(&Instruction::F64Div);
        }
        WasmInst::F64Sqrt => {
            func.instruction(&Instruction::F64Sqrt);
        }
        WasmInst::F64Neg => {
            func.instruction(&Instruction::F64Neg);
        }
        WasmInst::F64Abs => {
            func.instruction(&Instruction::F64Abs);
        }
        WasmInst::F64Ceil => {
            func.instruction(&Instruction::F64Ceil);
        }
        WasmInst::F64Floor => {
            func.instruction(&Instruction::F64Floor);
        }
        WasmInst::F64Trunc => {
            func.instruction(&Instruction::F64Trunc);
        }
        WasmInst::F64Nearest => {
            func.instruction(&Instruction::F64Nearest);
        }
        WasmInst::F64Eq => {
            func.instruction(&Instruction::F64Eq);
        }
        WasmInst::F64Ne => {
            func.instruction(&Instruction::F64Ne);
        }
        WasmInst::F64Lt => {
            func.instruction(&Instruction::F64Lt);
        }
        WasmInst::F64Gt => {
            func.instruction(&Instruction::F64Gt);
        }
        WasmInst::F64Le => {
            func.instruction(&Instruction::F64Le);
        }
        WasmInst::F64Ge => {
            func.instruction(&Instruction::F64Ge);
        }
        WasmInst::F64Min => {
            func.instruction(&Instruction::F64Min);
        }
        WasmInst::F64Max => {
            func.instruction(&Instruction::F64Max);
        }
        WasmInst::F64Copysign => {
            func.instruction(&Instruction::F64Copysign);
        }

        // FP conversions
        WasmInst::F32ConvertI32S => {
            func.instruction(&Instruction::F32ConvertI32S);
        }
        WasmInst::F32ConvertI32U => {
            func.instruction(&Instruction::F32ConvertI32U);
        }
        WasmInst::F32ConvertI64S => {
            func.instruction(&Instruction::F32ConvertI64S);
        }
        WasmInst::F32ConvertI64U => {
            func.instruction(&Instruction::F32ConvertI64U);
        }
        WasmInst::F64ConvertI32S => {
            func.instruction(&Instruction::F64ConvertI32S);
        }
        WasmInst::F64ConvertI32U => {
            func.instruction(&Instruction::F64ConvertI32U);
        }
        WasmInst::F64ConvertI64S => {
            func.instruction(&Instruction::F64ConvertI64S);
        }
        WasmInst::F64ConvertI64U => {
            func.instruction(&Instruction::F64ConvertI64U);
        }
        WasmInst::I32TruncF32S => {
            func.instruction(&Instruction::I32TruncF32S);
        }
        WasmInst::I32TruncF32U => {
            func.instruction(&Instruction::I32TruncF32U);
        }
        WasmInst::I32TruncF64S => {
            func.instruction(&Instruction::I32TruncF64S);
        }
        WasmInst::I32TruncF64U => {
            func.instruction(&Instruction::I32TruncF64U);
        }
        WasmInst::I64TruncF32S => {
            func.instruction(&Instruction::I64TruncF32S);
        }
        WasmInst::I64TruncF32U => {
            func.instruction(&Instruction::I64TruncF32U);
        }
        WasmInst::I64TruncF64S => {
            func.instruction(&Instruction::I64TruncF64S);
        }
        WasmInst::I64TruncF64U => {
            func.instruction(&Instruction::I64TruncF64U);
        }
        WasmInst::F32DemoteF64 => {
            func.instruction(&Instruction::F32DemoteF64);
        }
        WasmInst::F64PromoteF32 => {
            func.instruction(&Instruction::F64PromoteF32);
        }
        WasmInst::F32ReinterpretI32 => {
            func.instruction(&Instruction::F32ReinterpretI32);
        }
        WasmInst::F64ReinterpretI64 => {
            func.instruction(&Instruction::F64ReinterpretI64);
        }
        WasmInst::I32ReinterpretF32 => {
            func.instruction(&Instruction::I32ReinterpretF32);
        }
        WasmInst::I64ReinterpretF64 => {
            func.instruction(&Instruction::I64ReinterpretF64);
        }

        // i64 extended ops
        WasmInst::I64Rotl => {
            func.instruction(&Instruction::I64Rotl);
        }
        WasmInst::I64Rotr => {
            func.instruction(&Instruction::I64Rotr);
        }
        WasmInst::I64Clz => {
            func.instruction(&Instruction::I64Clz);
        }
        WasmInst::I64Ctz => {
            func.instruction(&Instruction::I64Ctz);
        }
        WasmInst::I64Popcnt => {
            func.instruction(&Instruction::I64Popcnt);
        }

        // Unreachable
        WasmInst::Unreachable => {
            func.instruction(&Instruction::Unreachable);
        }

        // Comments are no-ops
        WasmInst::Comment { .. } => {}
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::translate::{WasmFunction, WasmModule};

    /// Helper: create a minimal WasmModule with block functions at the given addresses
    fn make_module(addrs: &[u64]) -> WasmModule {
        let mut functions = Vec::new();
        let mut block_to_func = std::collections::HashMap::new();
        for (i, &addr) in addrs.iter().enumerate() {
            block_to_func.insert(addr, i);
            functions.push(WasmFunction {
                name: format!("block_{:x}", addr),
                block_addr: addr,
                body: vec![
                    // return next_pc = addr + 4 (as i32 via i64 wrap)
                    WasmInst::I32Const { value: -1 }, // halt after this block
                ],
                num_locals: 0,
            });
        }
        WasmModule {
            functions,
            memory_pages: 8,
            entry: addrs.first().copied().unwrap_or(0),
            block_to_func,
        }
    }

    #[test]
    fn test_build_empty_module() {
        let module = make_module(&[]);
        let bytes = build(&module).unwrap();
        // Should start with Wasm magic "\0asm"
        assert_eq!(&bytes[0..4], b"\0asm");
    }

    #[test]
    fn test_build_single_block() {
        let module = make_module(&[0x1000]);
        let bytes = build(&module).unwrap();
        assert_eq!(&bytes[0..4], b"\0asm");
        assert!(bytes.len() > 8); // non-trivial output
    }

    #[test]
    fn test_build_dense_blocks() {
        // Dense addresses: 0x1000, 0x1004, 0x1008, 0x100c
        let module = make_module(&[0x1000, 0x1004, 0x1008, 0x100c]);
        let bytes = build(&module).unwrap();
        assert_eq!(&bytes[0..4], b"\0asm");
    }

    #[test]
    fn test_build_sparse_blocks_br_table() {
        // Sparse addresses that trigger br_table dispatch (not dense enough for simple indexing)
        // Spread out far enough that can_use_dense_table returns false
        let addrs: Vec<u64> = (0..20).map(|i| 0x10000 + i * 0x100).collect();
        let module = make_module(&addrs);
        // Verify it's actually sparse (not dense)
        assert!(!can_use_dense_table(&module));
        let bytes = build(&module).unwrap();
        assert_eq!(&bytes[0..4], b"\0asm");
        assert!(bytes.len() > 100);
    }

    #[test]
    fn test_build_sparse_blocks_mixed_alignment() {
        // Addresses with mixed 2-byte and 4-byte offsets (simulating C extension mixing)
        let addrs = vec![0x1000, 0x1002, 0x1006, 0x1008, 0x100e, 0x1010,
                         0x1014, 0x1018, 0x101a, 0x101e, 0x1020, 0x1024,
                         0x1028, 0x102a, 0x102e, 0x1030, 0x1034, 0x1038];
        let module = make_module(&addrs);
        let bytes = build(&module).unwrap();
        assert_eq!(&bytes[0..4], b"\0asm");
    }

    #[test]
    fn test_compute_addr_alignment_power_of_two() {
        let addrs = vec![(0x1000u64, 0u32), (0x1004, 1), (0x1008, 2), (0x100c, 3)];
        assert_eq!(compute_addr_alignment(&addrs), 4);
    }

    #[test]
    fn test_compute_addr_alignment_two_byte() {
        let addrs = vec![(0x1000u64, 0u32), (0x1002, 1), (0x1006, 2)];
        assert_eq!(compute_addr_alignment(&addrs), 2);
    }

    #[test]
    fn test_compute_addr_alignment_single() {
        let addrs = vec![(0x1000u64, 0u32)];
        assert_eq!(compute_addr_alignment(&addrs), 2); // minimum C-ext alignment
    }
}
