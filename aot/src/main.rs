// rv2wasm - RISC-V to WebAssembly AOT Compiler
//
// Compiles RISC-V ELF binaries to native WebAssembly for 5-20x speedup
// over interpreted execution.
//
// Usage:
//   rv2wasm input.elf -o output.wasm
//   rv2wasm --rootfs rootfs.tar --entry /bin/busybox -o bundle.wasm

use anyhow::{Context, Result};
use clap::Parser;
use std::path::PathBuf;

mod cfg;
mod disasm;
mod elf;
mod translate;
mod wasm_builder;

#[derive(Parser, Debug)]
#[command(name = "rv2wasm")]
#[command(about = "RISC-V to WebAssembly AOT compiler")]
#[command(version)]
struct Args {
    /// Input RISC-V ELF binary
    #[arg(required_unless_present = "rootfs")]
    input: Option<PathBuf>,

    /// Output Wasm file
    #[arg(short, long, default_value = "output.wasm")]
    output: PathBuf,

    /// Container rootfs tar (for container mode)
    #[arg(long)]
    rootfs: Option<PathBuf>,

    /// Entry point binary within rootfs
    #[arg(long, requires = "rootfs")]
    entry: Option<String>,

    /// Emit debug info (block addresses, instruction comments)
    #[arg(long)]
    debug: bool,

    /// Optimization level (0-3)
    #[arg(short = 'O', default_value = "2")]
    opt_level: u8,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    if args.verbose {
        eprintln!("rv2wasm - RISC-V to WebAssembly AOT Compiler");
        eprintln!("============================================");
    }

    // Load ELF binary
    let elf_data = if let Some(ref input) = args.input {
        if args.verbose {
            eprintln!("Loading ELF: {}", input.display());
        }
        std::fs::read(input).context("Failed to read input ELF")?
    } else if let Some(ref _rootfs) = args.rootfs {
        // TODO: Extract from tar
        anyhow::bail!("Rootfs mode not yet implemented");
    } else {
        anyhow::bail!("No input specified");
    };

    // Parse ELF
    let elf_info = elf::parse(&elf_data).context("Failed to parse ELF")?;

    if args.verbose {
        eprintln!("  Entry point: 0x{:x}", elf_info.entry);
        eprintln!("  Segments: {}", elf_info.segments.len());
        eprintln!(
            "  Type: {}",
            if elf_info.is_pie { "PIE" } else { "executable" }
        );
        if let Some(ref interp) = elf_info.interpreter {
            eprintln!("  Interpreter: {}", interp);
        }
    }

    // Extract code sections
    let code_sections = elf::extract_code_sections(&elf_data, &elf_info)?;

    if args.verbose {
        let total_bytes: usize = code_sections.iter().map(|s| s.data.len()).sum();
        eprintln!("  Code sections: {} ({} bytes)", code_sections.len(), total_bytes);
    }

    // Disassemble to instructions
    let mut all_instructions = Vec::new();
    for section in &code_sections {
        let instructions = disasm::disassemble(section)?;
        if args.verbose {
            eprintln!(
                "    0x{:08x}: {} instructions",
                section.vaddr,
                instructions.len()
            );
        }
        all_instructions.extend(instructions);
    }

    // Build control flow graph
    let cfg = cfg::build(&all_instructions, elf_info.entry)?;

    if args.verbose {
        eprintln!("  Basic blocks: {}", cfg.blocks.len());
        eprintln!("  Functions: {}", cfg.functions.len());
    }

    // Translate to Wasm
    let wasm_module = translate::translate(&cfg, &elf_info, args.opt_level, args.debug)?;

    if args.verbose {
        eprintln!("  Wasm functions: {}", wasm_module.function_count());
    }

    // Build final Wasm binary
    let wasm_bytes = wasm_builder::build(&wasm_module)?;

    if args.verbose {
        eprintln!("  Output size: {} bytes", wasm_bytes.len());
    }

    // Write output
    std::fs::write(&args.output, &wasm_bytes).context("Failed to write output")?;

    if args.verbose {
        eprintln!("Wrote: {}", args.output.display());
    }

    Ok(())
}
