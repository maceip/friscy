// rv2wasm-jit: Runtime RISC-V to WebAssembly compiler
//
// This crate wraps the rv2wasm AOT compiler for use as a JIT compiler
// inside a WebAssembly environment. It compiles to wasm32-unknown-unknown
// via wasm-bindgen, allowing the browser to compile RISC-V code regions
// to Wasm at runtime.

use wasm_bindgen::prelude::*;

/// Compile a region of RISC-V machine code to a WebAssembly module.
///
/// Takes raw RISC-V bytes and their virtual address, returns a Wasm module
/// binary that can be instantiated with `WebAssembly.instantiate()`.
///
/// The returned Wasm module imports shared memory from "env"/"memory" and
/// exports block functions that read/write registers via linear memory.
#[wasm_bindgen]
pub fn compile_region(code: &[u8], base_addr: u32) -> Result<Vec<u8>, JsValue> {
    compile_region_inner(code, base_addr)
        .map_err(|e| JsValue::from_str(&format!("{:#}", e)))
}

fn compile_region_inner(code: &[u8], base_addr: u32) -> anyhow::Result<Vec<u8>> {
    use rv2wasm::{disasm, cfg, translate, wasm_builder};

    // Create a CodeSection from the raw bytes
    let section = rv2wasm::CodeSection {
        vaddr: base_addr as u64,
        data: code.to_vec(),
        name: format!("jit_0x{:08x}", base_addr),
    };

    // Disassemble
    let instructions = disasm::disassemble(&section)?;
    if instructions.is_empty() {
        anyhow::bail!("No instructions decoded in region 0x{:08x}", base_addr);
    }

    // Build CFG
    let entry = instructions[0].addr;
    let cfg = cfg::build(&instructions, entry)?;

    // Translate to Wasm IR (JIT mode: shared memory import)
    let wasm_module = translate::translate_jit(&cfg, base_addr as u64)?;

    // Generate Wasm binary
    wasm_builder::build_jit(&wasm_module)
}

/// Get version string
#[wasm_bindgen]
pub fn version() -> String {
    format!("rv2wasm-jit {}", env!("CARGO_PKG_VERSION"))
}
