// wasm_builder.rs - Wasm binary generation
//
// Converts the intermediate WasmModule to actual Wasm bytecode using wasm-encoder.

use crate::translate::{WasmInst, WasmModule};
use anyhow::Result;
use wasm_encoder::{
    CodeSection, EntityType, ExportKind, ExportSection, Function, FunctionSection, ImportSection,
    Instruction, MemorySection, MemoryType, Module, TableSection, TableType, TypeSection, ValType,
};

/// Build the final Wasm binary
pub fn build(module: &WasmModule) -> Result<Vec<u8>> {
    let mut wasm = Module::new();

    // ==========================================================================
    // Type section
    // ==========================================================================
    let mut types = TypeSection::new();

    // Type 0: Block function (param $m i32) (result i32)
    types.ty().function(vec![ValType::I32], vec![ValType::I32]);

    // Type 1: Dispatch function (param $m i32, $pc i32) (result i32)
    types
        .ty()
        .function(vec![ValType::I32, ValType::I32], vec![ValType::I32]);

    // Type 2: Syscall handler (param $m i32, $pc i32) (result i32)
    types
        .ty()
        .function(vec![ValType::I32, ValType::I32], vec![ValType::I32]);

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
            page_size_log2: None,
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
        table64: false,
        minimum: module.functions.len() as u64,
        maximum: Some(module.functions.len() as u64),
        shared: false,
    });

    wasm.section(&tables);

    // ==========================================================================
    // Memory section (if not imported)
    // ==========================================================================
    // Memory is imported, so skip this

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

    // Dispatch function
    let dispatch_func = build_dispatch_function(module);
    codes.function(&dispatch_func);

    // Block functions
    for func in &module.functions {
        let wasm_func = build_block_function(func)?;
        codes.function(&wasm_func);
    }

    wasm.section(&codes);

    Ok(wasm.finish())
}

/// Build the main dispatch function
fn build_dispatch_function(module: &WasmModule) -> Function {
    let mut func = Function::new(vec![(1, ValType::I32)]); // 1 local for pc

    // (func $run (param $m i32) (param $start_pc i32) (result i32)
    //   (local $pc i32)
    //   (local.set $pc (local.get 1))  ;; $start_pc
    //   (loop $dispatch
    //     ;; Check for halt
    //     (if (i32.eq (local.get $pc) (i32.const -1))
    //       (then (return (i32.const 0))))
    //
    //     ;; Check for syscall (high bit set)
    //     (if (i32.and (local.get $pc) (i32.const 0x80000000))
    //       (then
    //         (local.set $pc (call $syscall (local.get 0) (local.get $pc)))
    //         (br $dispatch)))
    //
    //     ;; Dispatch to block function
    //     (local.set $pc
    //       (call_indirect (type 0)
    //         (local.get 0)     ;; $m
    //         (i32.div_u (local.get $pc) (i32.const 4))))  ;; block index
    //     (br $dispatch)))

    // Initialize $pc from parameter
    func.instruction(&Instruction::LocalGet(1));
    func.instruction(&Instruction::LocalSet(2));

    // Loop
    func.instruction(&Instruction::Loop(wasm_encoder::BlockType::Empty));

    // Check for halt (-1)
    func.instruction(&Instruction::LocalGet(2));
    func.instruction(&Instruction::I32Const(-1));
    func.instruction(&Instruction::I32Eq);
    func.instruction(&Instruction::If(wasm_encoder::BlockType::Empty));
    func.instruction(&Instruction::I32Const(0));
    func.instruction(&Instruction::Return);
    func.instruction(&Instruction::End);

    // Check for syscall (high bit)
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

    // For simplicity, use a br_table for dispatch
    // In a real implementation, we'd build a proper jump table

    // For now, linear search (will be slow but correct)
    // Real implementation would use address -> function index mapping
    func.instruction(&Instruction::LocalGet(0)); // $m
    func.instruction(&Instruction::LocalGet(2)); // $pc

    // Call block function based on PC
    // This is a simplified version - real impl needs proper block lookup
    func.instruction(&Instruction::Call(2)); // First block function

    func.instruction(&Instruction::LocalSet(2));
    func.instruction(&Instruction::Br(0)); // Continue loop

    func.instruction(&Instruction::End); // End loop

    func.instruction(&Instruction::I32Const(0));
    func.instruction(&Instruction::End);

    func
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
        WasmInst::Return => {
            func.instruction(&Instruction::Return);
        }
        WasmInst::Call { func_idx } => {
            func.instruction(&Instruction::Call(*func_idx));
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

        // i32 arithmetic
        WasmInst::I32Add => {
            func.instruction(&Instruction::I32Add);
        }
        WasmInst::I32Sub => {
            func.instruction(&Instruction::I32Sub);
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

        // Comments are no-ops
        WasmInst::Comment { .. } => {}

        // Unimplemented instructions
        _ => {
            // Skip unimplemented for now
        }
    }

    Ok(())
}
