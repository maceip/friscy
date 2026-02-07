// elf.rs - ELF binary parsing for RISC-V executables
//
// Uses goblin for parsing, extracts code sections and metadata.

use anyhow::{Context, Result};
use goblin::elf::{Elf, program_header};

/// Information about a loaded ELF
#[derive(Debug, Clone)]
pub struct ElfInfo {
    pub entry: u64,
    pub is_pie: bool,
    pub interpreter: Option<String>,
    pub segments: Vec<Segment>,
    pub phdr_vaddr: u64,
    pub phdr_count: u16,
}

/// A loadable segment
#[derive(Debug, Clone)]
pub struct Segment {
    pub vaddr: u64,
    pub memsz: u64,
    pub filesz: u64,
    pub offset: u64,
    pub flags: u32,
}

/// A code section to disassemble
#[derive(Debug, Clone)]
pub struct CodeSection {
    pub vaddr: u64,
    pub data: Vec<u8>,
    pub name: String,
}

/// Parse ELF and extract metadata
pub fn parse(data: &[u8]) -> Result<ElfInfo> {
    let elf = Elf::parse(data).context("Invalid ELF format")?;

    // Verify RISC-V architecture
    if elf.header.e_machine != goblin::elf::header::EM_RISCV {
        anyhow::bail!(
            "Not a RISC-V binary (e_machine=0x{:x})",
            elf.header.e_machine
        );
    }

    // Check 64-bit
    if !elf.is_64 {
        anyhow::bail!("Only 64-bit RISC-V (RV64) is supported");
    }

    // Is it PIE?
    let is_pie = elf.header.e_type == goblin::elf::header::ET_DYN;

    // Get interpreter (for dynamic binaries)
    let interpreter = elf.interpreter.map(|s| s.to_string());

    // Extract segments
    let segments = elf
        .program_headers
        .iter()
        .filter(|ph| ph.p_type == program_header::PT_LOAD)
        .map(|ph| Segment {
            vaddr: ph.p_vaddr,
            memsz: ph.p_memsz,
            filesz: ph.p_filesz,
            offset: ph.p_offset,
            flags: ph.p_flags,
        })
        .collect();

    // Find program headers virtual address
    let phdr_vaddr = elf
        .program_headers
        .iter()
        .find(|ph| ph.p_type == program_header::PT_PHDR)
        .map(|ph| ph.p_vaddr)
        .unwrap_or(0);

    Ok(ElfInfo {
        entry: elf.entry,
        is_pie,
        interpreter,
        segments,
        phdr_vaddr,
        phdr_count: elf.header.e_phnum,
    })
}

/// Extract executable code sections from ELF
pub fn extract_code_sections(data: &[u8], info: &ElfInfo) -> Result<Vec<CodeSection>> {
    let elf = Elf::parse(data).context("Invalid ELF format")?;
    let mut sections = Vec::new();

    // Find executable segments
    for seg in &info.segments {
        // PF_X = 0x1 (executable)
        if seg.flags & 0x1 != 0 && seg.filesz > 0 {
            let start = seg.offset as usize;
            let end = start + seg.filesz as usize;

            if end <= data.len() {
                sections.push(CodeSection {
                    vaddr: seg.vaddr,
                    data: data[start..end].to_vec(),
                    name: format!("seg_0x{:x}", seg.vaddr),
                });
            }
        }
    }

    // Also check section headers for .text
    for section in &elf.section_headers {
        if let Some(name) = elf.shdr_strtab.get_at(section.sh_name) {
            if name == ".text" {
                let start = section.sh_offset as usize;
                let end = start + section.sh_size as usize;

                if end <= data.len() {
                    // Avoid duplicates
                    let already_have = sections
                        .iter()
                        .any(|s| s.vaddr == section.sh_addr);

                    if !already_have {
                        sections.push(CodeSection {
                            vaddr: section.sh_addr,
                            data: data[start..end].to_vec(),
                            name: name.to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(sections)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_elf_magic() {
        // Invalid ELF
        let bad = vec![0x00; 64];
        assert!(parse(&bad).is_err());
    }
}
