// elf_loader.hpp - ELF binary loader with dynamic linking support
//
// This handles loading dynamically-linked RISC-V binaries by:
// 1. Detecting PT_INTERP (dynamic linker path)
// 2. Loading the interpreter as the actual entry point
// 3. Setting up the auxiliary vector for the dynamic linker
//
// This allows running standard dynamically-linked containers without
// requiring --static compilation.

#pragma once

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <optional>
#include <stdexcept>
#include <libriscv/machine.hpp>

namespace elf {

// ELF64 header structures (RISC-V specific)
struct Elf64_Ehdr {
    uint8_t  e_ident[16];
    uint16_t e_type;
    uint16_t e_machine;
    uint32_t e_version;
    uint64_t e_entry;
    uint64_t e_phoff;
    uint64_t e_shoff;
    uint32_t e_flags;
    uint16_t e_ehsize;
    uint16_t e_phentsize;
    uint16_t e_phnum;
    uint16_t e_shentsize;
    uint16_t e_shnum;
    uint16_t e_shstrndx;
};

struct Elf64_Phdr {
    uint32_t p_type;
    uint32_t p_flags;
    uint64_t p_offset;
    uint64_t p_vaddr;
    uint64_t p_paddr;
    uint64_t p_filesz;
    uint64_t p_memsz;
    uint64_t p_align;
};

// ELF constants
constexpr uint32_t PT_NULL    = 0;
constexpr uint32_t PT_LOAD    = 1;
constexpr uint32_t PT_DYNAMIC = 2;
constexpr uint32_t PT_INTERP  = 3;
constexpr uint32_t PT_NOTE    = 4;
constexpr uint32_t PT_PHDR    = 6;

constexpr uint16_t ET_EXEC = 2;
constexpr uint16_t ET_DYN  = 3;

constexpr uint16_t EM_RISCV = 0xF3;

// Auxiliary vector types (for dynamic linker)
constexpr uint64_t AT_NULL         = 0;
constexpr uint64_t AT_IGNORE       = 1;
constexpr uint64_t AT_EXECFD       = 2;
constexpr uint64_t AT_PHDR         = 3;
constexpr uint64_t AT_PHENT        = 4;
constexpr uint64_t AT_PHNUM        = 5;
constexpr uint64_t AT_PAGESZ       = 6;
constexpr uint64_t AT_BASE         = 7;
constexpr uint64_t AT_FLAGS        = 8;
constexpr uint64_t AT_ENTRY        = 9;
constexpr uint64_t AT_NOTELF       = 10;
constexpr uint64_t AT_UID          = 11;
constexpr uint64_t AT_EUID         = 12;
constexpr uint64_t AT_GID          = 13;
constexpr uint64_t AT_EGID         = 14;
constexpr uint64_t AT_PLATFORM     = 15;
constexpr uint64_t AT_HWCAP        = 16;
constexpr uint64_t AT_CLKTCK       = 17;
constexpr uint64_t AT_SECURE       = 23;
constexpr uint64_t AT_BASE_PLATFORM = 24;
constexpr uint64_t AT_RANDOM       = 25;
constexpr uint64_t AT_HWCAP2       = 26;
constexpr uint64_t AT_EXECFN       = 31;

// RISC-V hardware capabilities
constexpr uint64_t RISCV_HWCAP_IMAFDC = 0x112D;  // I, M, A, F, D, C extensions

// Information about a loaded ELF
struct ElfInfo {
    uint64_t entry_point;      // e_entry
    uint64_t phdr_addr;        // Address of program headers in memory
    uint16_t phdr_size;        // Size of one program header
    uint16_t phdr_count;       // Number of program headers
    uint64_t base_addr;        // Load base (0 for ET_EXEC, varies for ET_DYN)
    bool is_dynamic;           // Has PT_INTERP
    std::string interpreter;   // Path to dynamic linker
    uint16_t type;             // ET_EXEC or ET_DYN
};

// Parse ELF header and program headers
inline ElfInfo parse_elf(const std::vector<uint8_t>& data) {
    if (data.size() < sizeof(Elf64_Ehdr)) {
        throw std::runtime_error("ELF too small");
    }

    const auto* ehdr = reinterpret_cast<const Elf64_Ehdr*>(data.data());

    // Validate magic
    if (ehdr->e_ident[0] != 0x7f || ehdr->e_ident[1] != 'E' ||
        ehdr->e_ident[2] != 'L' || ehdr->e_ident[3] != 'F') {
        throw std::runtime_error("Not an ELF file");
    }

    // Check 64-bit
    if (ehdr->e_ident[4] != 2) {
        throw std::runtime_error("Not a 64-bit ELF");
    }

    // Check RISC-V
    if (ehdr->e_machine != EM_RISCV) {
        throw std::runtime_error("Not a RISC-V ELF");
    }

    // Check type
    if (ehdr->e_type != ET_EXEC && ehdr->e_type != ET_DYN) {
        throw std::runtime_error("ELF is not executable or shared object");
    }

    ElfInfo info;
    info.entry_point = ehdr->e_entry;
    info.phdr_size = ehdr->e_phentsize;
    info.phdr_count = ehdr->e_phnum;
    info.type = ehdr->e_type;
    info.is_dynamic = false;
    info.base_addr = 0;

    // Find PT_PHDR and PT_INTERP
    uint64_t phdr_vaddr = 0;
    size_t phoff = ehdr->e_phoff;

    for (uint16_t i = 0; i < ehdr->e_phnum; i++) {
        if (phoff + sizeof(Elf64_Phdr) > data.size()) break;

        const auto* phdr = reinterpret_cast<const Elf64_Phdr*>(data.data() + phoff);

        if (phdr->p_type == PT_PHDR) {
            phdr_vaddr = phdr->p_vaddr;
        }
        else if (phdr->p_type == PT_INTERP) {
            info.is_dynamic = true;
            // Extract interpreter path
            if (phdr->p_offset + phdr->p_filesz <= data.size()) {
                info.interpreter = std::string(
                    reinterpret_cast<const char*>(data.data() + phdr->p_offset),
                    phdr->p_filesz
                );
                // Remove trailing null
                while (!info.interpreter.empty() && info.interpreter.back() == '\0') {
                    info.interpreter.pop_back();
                }
            }
        }

        phoff += ehdr->e_phentsize;
    }

    // If no PT_PHDR, calculate from first PT_LOAD
    if (phdr_vaddr == 0) {
        phoff = ehdr->e_phoff;
        for (uint16_t i = 0; i < ehdr->e_phnum; i++) {
            const auto* phdr = reinterpret_cast<const Elf64_Phdr*>(data.data() + phoff);
            if (phdr->p_type == PT_LOAD && phdr->p_offset == 0) {
                // Program headers are in this segment
                phdr_vaddr = phdr->p_vaddr + ehdr->e_phoff;
                break;
            }
            phoff += ehdr->e_phentsize;
        }
    }

    info.phdr_addr = phdr_vaddr;

    return info;
}

// Get the lowest and highest virtual addresses from PT_LOAD segments
inline std::pair<uint64_t, uint64_t> get_load_range(const std::vector<uint8_t>& data) {
    const auto* ehdr = reinterpret_cast<const Elf64_Ehdr*>(data.data());

    uint64_t lo = UINT64_MAX;
    uint64_t hi = 0;

    size_t phoff = ehdr->e_phoff;
    for (uint16_t i = 0; i < ehdr->e_phnum; i++) {
        const auto* phdr = reinterpret_cast<const Elf64_Phdr*>(data.data() + phoff);

        if (phdr->p_type == PT_LOAD) {
            uint64_t seg_lo = phdr->p_vaddr;
            uint64_t seg_hi = phdr->p_vaddr + phdr->p_memsz;

            if (seg_lo < lo) lo = seg_lo;
            if (seg_hi > hi) hi = seg_hi;
        }

        phoff += ehdr->e_phentsize;
    }

    return {lo, hi};
}

// Build auxiliary vector for dynamic linker
// Returns pairs of (type, value) that should be pushed to stack
inline std::vector<std::pair<uint64_t, uint64_t>> build_auxv(
    const ElfInfo& exec_info,      // Main executable info
    const ElfInfo& interp_info,    // Interpreter info (if dynamic)
    uint64_t interp_base,          // Base address where interpreter was loaded
    uint64_t random_addr,          // Address of 16 random bytes
    uint64_t execfn_addr           // Address of executable filename string
) {
    std::vector<std::pair<uint64_t, uint64_t>> auxv;

    // Program headers of the main executable
    auxv.push_back({AT_PHDR,  exec_info.phdr_addr});
    auxv.push_back({AT_PHENT, exec_info.phdr_size});
    auxv.push_back({AT_PHNUM, exec_info.phdr_count});

    // Page size
    auxv.push_back({AT_PAGESZ, 4096});

    // Interpreter base address (only if dynamic)
    if (exec_info.is_dynamic) {
        auxv.push_back({AT_BASE, interp_base});
    } else {
        auxv.push_back({AT_BASE, 0});
    }

    // Entry point of the main executable (not interpreter)
    auxv.push_back({AT_ENTRY, exec_info.entry_point});

    // User/group IDs
    auxv.push_back({AT_UID,  0});
    auxv.push_back({AT_EUID, 0});
    auxv.push_back({AT_GID,  0});
    auxv.push_back({AT_EGID, 0});

    // Clock ticks per second
    auxv.push_back({AT_CLKTCK, 100});

    // Security mode (not secure)
    auxv.push_back({AT_SECURE, 0});

    // Hardware capabilities (IMAFDC)
    auxv.push_back({AT_HWCAP, RISCV_HWCAP_IMAFDC});

    // Random bytes for stack canary, etc.
    auxv.push_back({AT_RANDOM, random_addr});

    // Executable filename
    auxv.push_back({AT_EXECFN, execfn_addr});

    // Platform string (pointer to "riscv64")
    // We'll need to allocate this on the stack too
    auxv.push_back({AT_PLATFORM, 0});  // Will be filled in by caller

    // Terminator
    auxv.push_back({AT_NULL, 0});

    return auxv;
}

}  // namespace elf

// =============================================================================
// Dynamic Linker Support
//
// For dynamically linked binaries:
// 1. Load the main executable's ELF headers
// 2. Find PT_INTERP (e.g., /lib/ld-musl-riscv64.so.1)
// 3. Load the interpreter from VFS
// 4. Set up stack with aux vector
// 5. Jump to interpreter's entry point
//
// The interpreter (musl's ld.so) will:
// - Read aux vector to find main executable's headers
// - Load required shared libraries
// - Perform relocations
// - Jump to main executable's entry point
// =============================================================================

namespace dynlink {

using Machine = riscv::Machine<riscv::RISCV64>;

// Stack layout for dynamic linker (grows down):
//
// High addresses
// ┌──────────────────────────────┐
// │ Platform string "riscv64\0" │
// │ Random bytes (16)            │
// │ Executable name string       │
// │ Environment strings          │
// │ Argument strings             │
// ├──────────────────────────────┤
// │ NULL                         │  auxv terminator
// │ AT_NULL, 0                   │
// │ AT_PLATFORM, ptr             │
// │ AT_RANDOM, ptr               │
// │ ...                          │
// │ AT_PHDR, phdr_addr           │
// ├──────────────────────────────┤
// │ NULL                         │  envp terminator
// │ env[n] pointer               │
// │ ...                          │
// │ env[0] pointer               │
// ├──────────────────────────────┤
// │ NULL                         │  argv terminator
// │ argv[argc-1] pointer         │
// │ ...                          │
// │ argv[0] pointer              │
// ├──────────────────────────────┤
// │ argc                         │
// └──────────────────────────────┘ ← sp
// Low addresses

// Load an ELF file into memory at the specified base
// Returns the actual base address used (may differ for PIE)
inline uint64_t load_elf_segments(
    Machine& machine,
    const std::vector<uint8_t>& elf_data,
    uint64_t requested_base = 0
) {
    const auto* ehdr = reinterpret_cast<const elf::Elf64_Ehdr*>(elf_data.data());

    // For PIE/shared objects, we can load at any address
    // For ET_EXEC, we must load at the specified addresses
    uint64_t base_adjust = 0;
    if (ehdr->e_type == elf::ET_DYN && requested_base != 0) {
        // Find lowest vaddr to calculate adjustment
        auto [lo, hi] = elf::get_load_range(elf_data);
        base_adjust = requested_base - lo;
    }

    size_t phoff = ehdr->e_phoff;
    for (uint16_t i = 0; i < ehdr->e_phnum; i++) {
        const auto* phdr = reinterpret_cast<const elf::Elf64_Phdr*>(
            elf_data.data() + phoff);

        if (phdr->p_type == elf::PT_LOAD) {
            uint64_t vaddr = phdr->p_vaddr + base_adjust;
            uint64_t filesz = phdr->p_filesz;
            uint64_t memsz = phdr->p_memsz;

            // Copy file data
            if (filesz > 0) {
                machine.memory.memcpy(
                    vaddr,
                    elf_data.data() + phdr->p_offset,
                    filesz
                );
            }

            // Zero BSS (memsz > filesz)
            if (memsz > filesz) {
                machine.memory.memset(vaddr + filesz, 0, memsz - filesz);
            }
        }

        phoff += ehdr->e_phentsize;
    }

    return base_adjust;
}

// Set up the stack for the dynamic linker
// Returns the initial stack pointer
inline uint64_t setup_dynamic_stack(
    Machine& machine,
    const elf::ElfInfo& exec_info,
    uint64_t interp_base,
    const std::vector<std::string>& args,
    const std::vector<std::string>& env,
    uint64_t stack_top = 0x7fff0000
) {
    uint64_t sp = stack_top;

    // -------------------------------------------------------------------------
    // Phase 1: Write strings to stack
    // -------------------------------------------------------------------------

    // Platform string
    const char* platform = "riscv64";
    sp -= 8;
    sp &= ~7;  // Align
    uint64_t platform_addr = sp;
    machine.memory.memcpy(sp, platform, strlen(platform) + 1);

    // Random bytes (16 bytes for AT_RANDOM)
    sp -= 16;
    uint64_t random_addr = sp;
    // In production, use actual random bytes
    for (int i = 0; i < 16; i++) {
        machine.memory.template write<uint8_t>(sp + i, (uint8_t)(i * 17 + 42));
    }

    // Executable name
    std::string execfn = args.empty() ? "/bin/program" : args[0];
    sp -= execfn.size() + 1;
    sp &= ~7;
    uint64_t execfn_addr = sp;
    machine.memory.memcpy(sp, execfn.c_str(), execfn.size() + 1);

    // Environment strings
    std::vector<uint64_t> env_ptrs;
    for (const auto& e : env) {
        sp -= e.size() + 1;
        env_ptrs.push_back(sp);
        machine.memory.memcpy(sp, e.c_str(), e.size() + 1);
    }

    // Argument strings
    std::vector<uint64_t> arg_ptrs;
    for (const auto& a : args) {
        sp -= a.size() + 1;
        arg_ptrs.push_back(sp);
        machine.memory.memcpy(sp, a.c_str(), a.size() + 1);
    }

    // Align to 16 bytes
    sp &= ~15;

    // -------------------------------------------------------------------------
    // Phase 2: Build auxiliary vector
    // -------------------------------------------------------------------------

    std::vector<std::pair<uint64_t, uint64_t>> auxv;

    // Program headers of main executable
    auxv.push_back({elf::AT_PHDR,  exec_info.phdr_addr});
    auxv.push_back({elf::AT_PHENT, exec_info.phdr_size});
    auxv.push_back({elf::AT_PHNUM, exec_info.phdr_count});

    // Entry point of main executable
    auxv.push_back({elf::AT_ENTRY, exec_info.entry_point});

    // Interpreter base (where ld-musl was loaded)
    auxv.push_back({elf::AT_BASE, interp_base});

    // Page size
    auxv.push_back({elf::AT_PAGESZ, 4096});

    // User/group IDs
    auxv.push_back({elf::AT_UID,  0});
    auxv.push_back({elf::AT_EUID, 0});
    auxv.push_back({elf::AT_GID,  0});
    auxv.push_back({elf::AT_EGID, 0});

    // Hardware capabilities
    auxv.push_back({elf::AT_HWCAP, elf::RISCV_HWCAP_IMAFDC});

    // Clock ticks
    auxv.push_back({elf::AT_CLKTCK, 100});

    // Security
    auxv.push_back({elf::AT_SECURE, 0});

    // Random bytes pointer
    auxv.push_back({elf::AT_RANDOM, random_addr});

    // Executable filename
    auxv.push_back({elf::AT_EXECFN, execfn_addr});

    // Platform string
    auxv.push_back({elf::AT_PLATFORM, platform_addr});

    // Terminator
    auxv.push_back({elf::AT_NULL, 0});

    // -------------------------------------------------------------------------
    // Phase 3: Write auxv, envp, argv, argc to stack
    // -------------------------------------------------------------------------

    // Calculate how much space we need
    size_t auxv_size = auxv.size() * 16;  // Each entry is 2 x 8 bytes
    size_t envp_size = (env_ptrs.size() + 1) * 8;  // +1 for NULL
    size_t argv_size = (arg_ptrs.size() + 1) * 8;  // +1 for NULL
    size_t argc_size = 8;

    size_t total = auxv_size + envp_size + argv_size + argc_size;

    sp -= total;
    sp &= ~15;  // 16-byte align

    uint64_t write_ptr = sp;

    // argc
    machine.memory.template write<uint64_t>(write_ptr, arg_ptrs.size());
    write_ptr += 8;

    // argv pointers
    for (uint64_t ptr : arg_ptrs) {
        machine.memory.template write<uint64_t>(write_ptr, ptr);
        write_ptr += 8;
    }
    machine.memory.template write<uint64_t>(write_ptr, 0);  // NULL
    write_ptr += 8;

    // envp pointers
    for (uint64_t ptr : env_ptrs) {
        machine.memory.template write<uint64_t>(write_ptr, ptr);
        write_ptr += 8;
    }
    machine.memory.template write<uint64_t>(write_ptr, 0);  // NULL
    write_ptr += 8;

    // auxv
    for (const auto& [type, value] : auxv) {
        machine.memory.template write<uint64_t>(write_ptr, type);
        write_ptr += 8;
        machine.memory.template write<uint64_t>(write_ptr, value);
        write_ptr += 8;
    }

    return sp;
}

}  // namespace dynlink
