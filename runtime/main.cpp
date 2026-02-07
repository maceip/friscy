// main.cpp - friscy: Docker container runner via libriscv
//
// This runs RISC-V binaries extracted from Docker containers in userland
// emulation mode (no kernel boot, syscalls handled by host).
//
// Usage:
//   friscy <riscv64-elf-binary> [args...]
//   friscy --rootfs <rootfs.tar> <entry-binary> [args...]
//
// The binary can be:
//   - A standalone statically-linked RISC-V ELF
//   - A dynamically-linked binary (will load ld-musl-riscv64.so.1)
//   - An entry point from a container rootfs (with --rootfs)

#include <libriscv/machine.hpp>
#include "vfs.hpp"
#include "syscalls.hpp"
#include "network.hpp"
#include "elf_loader.hpp"

#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cstring>

using Machine = riscv::Machine<riscv::RISCV64>;

// Configuration
static constexpr uint64_t MAX_INSTRUCTIONS = 16'000'000'000ULL;  // 16 billion
static constexpr uint32_t HEAP_SYSCALLS_BASE = 480;
static constexpr uint32_t MEMORY_SYSCALLS_BASE = 485;

// Global VFS instance (needed for syscall handlers)
static vfs::VirtualFS g_vfs;

// Load a file into memory
static std::vector<uint8_t> load_file(const std::string& path) {
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) {
        throw std::runtime_error("Could not open: " + path);
    }
    auto size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::vector<uint8_t> data(size);
    file.read(reinterpret_cast<char*>(data.data()), size);
    return data;
}

// Load binary from VFS (for container mode)
static std::vector<uint8_t> load_from_vfs(const std::string& path) {
    int fd = g_vfs.open(path, 0);
    if (fd < 0) {
        throw std::runtime_error("VFS: Could not open: " + path);
    }

    vfs::Entry entry;
    if (!g_vfs.stat(path, entry)) {
        g_vfs.close(fd);
        throw std::runtime_error("VFS: Could not stat: " + path);
    }

    std::vector<uint8_t> data(entry.size);
    ssize_t n = g_vfs.read(fd, data.data(), data.size());
    g_vfs.close(fd);

    if (n < 0 || static_cast<size_t>(n) != entry.size) {
        throw std::runtime_error("VFS: Read error: " + path);
    }

    return data;
}

// Setup virtual /proc and /dev entries
static void setup_virtual_files() {
    // /dev/null
    g_vfs.add_virtual_file("/dev/null", std::vector<uint8_t>{});

    // /dev/urandom (reads will be handled by getrandom syscall)
    g_vfs.add_virtual_file("/dev/urandom", std::vector<uint8_t>{});
    g_vfs.add_virtual_file("/dev/random", std::vector<uint8_t>{});

    // /etc/passwd (minimal)
    g_vfs.add_virtual_file("/etc/passwd", "root:x:0:0:root:/root:/bin/sh\n");

    // /etc/group (minimal)
    g_vfs.add_virtual_file("/etc/group", "root:x:0:\n");

    // /etc/hosts
    g_vfs.add_virtual_file("/etc/hosts", "127.0.0.1 localhost\n");

    // /etc/resolv.conf
    g_vfs.add_virtual_file("/etc/resolv.conf", "nameserver 8.8.8.8\n");
}

// Print usage
static void usage(const char* argv0) {
    std::cerr << "friscy - Docker container runner via libriscv\n\n";
    std::cerr << "Usage:\n";
    std::cerr << "  " << argv0 << " <riscv64-elf-binary> [args...]\n";
    std::cerr << "  " << argv0 << " --rootfs <rootfs.tar> <entry-binary> [args...]\n";
    std::cerr << "\nExamples:\n";
    std::cerr << "  " << argv0 << " ./hello                    # Run standalone binary\n";
    std::cerr << "  " << argv0 << " --rootfs alpine.tar /bin/busybox ls -la\n";
    std::cerr << "  " << argv0 << " --rootfs myapp.tar /app/server --port 8080\n";
}

int main(int argc, char** argv) {
    if (argc < 2) {
        usage(argv[0]);
        return 1;
    }

    std::string rootfs_path;
    std::string entry_path;
    std::vector<std::string> guest_args;
    bool container_mode = false;

    // Parse arguments
    int i = 1;
    while (i < argc) {
        if (strcmp(argv[i], "--rootfs") == 0) {
            if (i + 2 >= argc) {
                std::cerr << "Error: --rootfs requires <tarfile> and <entry-binary>\n";
                return 1;
            }
            container_mode = true;
            rootfs_path = argv[++i];
            entry_path = argv[++i];
        } else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            usage(argv[0]);
            return 0;
        } else if (argv[i][0] == '-' && !container_mode) {
            std::cerr << "Error: Unknown option: " << argv[i] << "\n";
            return 1;
        } else {
            if (!container_mode && entry_path.empty()) {
                entry_path = argv[i];
            }
            // Collect remaining args for the guest
            while (i < argc) {
                guest_args.push_back(argv[i++]);
            }
            break;
        }
        i++;
    }

    if (entry_path.empty()) {
        std::cerr << "Error: No entry binary specified\n";
        return 1;
    }

    try {
        std::vector<uint8_t> binary;

        if (container_mode) {
            std::cout << "[friscy] Loading rootfs: " << rootfs_path << "\n";

            // Load tar into VFS
            auto tar_data = load_file(rootfs_path);
            if (!g_vfs.load_tar(tar_data.data(), tar_data.size())) {
                std::cerr << "Error: Failed to parse rootfs tar\n";
                return 1;
            }

            // Setup virtual files
            setup_virtual_files();

            // Update /proc/self/exe
            g_vfs.add_virtual_file("/proc/self/exe", entry_path);

            std::cout << "[friscy] Entry point: " << entry_path << "\n";

            // Load binary from VFS
            binary = load_from_vfs(entry_path);

            std::cout << "[friscy] Binary size: " << binary.size() << " bytes\n";
        } else {
            // Standalone mode - load binary from host filesystem
            std::cout << "[friscy] Loading binary: " << entry_path << "\n";
            binary = load_file(entry_path);

            // Still set up minimal VFS for /proc, /dev
            setup_virtual_files();
        }

        // Verify it's a RISC-V ELF
        if (binary.size() < 64 ||
            binary[0] != 0x7f || binary[1] != 'E' || binary[2] != 'L' || binary[3] != 'F') {
            std::cerr << "Error: Not a valid ELF file\n";
            return 1;
        }

        // Check architecture (e_machine at offset 18-19, should be 0xF3 for RISC-V)
        uint16_t e_machine = binary[18] | (binary[19] << 8);
        if (e_machine != 0xF3) {
            std::cerr << "Error: Not a RISC-V binary (e_machine=" << e_machine << ")\n";
            return 1;
        }

        // Check class (64-bit)
        if (binary[4] != 2) {
            std::cerr << "Error: Not a 64-bit ELF (only RV64 supported)\n";
            return 1;
        }

        std::cout << "[friscy] Valid RV64 ELF detected\n";

        // Parse ELF to check for dynamic linking
        elf::ElfInfo exec_info = elf::parse_elf(binary);
        std::cout << "[friscy] ELF type: " << (exec_info.type == elf::ET_DYN ? "PIE/shared" : "executable") << "\n";

        std::vector<uint8_t> interp_binary;
        elf::ElfInfo interp_info;
        uint64_t interp_base = 0;
        bool use_dynamic_linker = false;

        if (exec_info.is_dynamic && container_mode) {
            std::cout << "[friscy] Dynamic binary detected\n";
            std::cout << "[friscy] Interpreter: " << exec_info.interpreter << "\n";

            // Load the dynamic linker from VFS
            try {
                interp_binary = load_from_vfs(exec_info.interpreter);
                interp_info = elf::parse_elf(interp_binary);
                use_dynamic_linker = true;
                std::cout << "[friscy] Loaded interpreter: " << interp_binary.size() << " bytes\n";
            } catch (const std::exception& e) {
                std::cerr << "[friscy] Warning: Could not load interpreter: " << e.what() << "\n";
                std::cerr << "[friscy] Trying to run as static binary...\n";
            }
        }

        // Create machine with main executable
        Machine machine{binary};

        // If dynamic, also load the interpreter at a high address
        if (use_dynamic_linker) {
            // Load interpreter at 0x40000000 (1GB mark)
            // This is above typical executable addresses but below stack
            interp_base = 0x40000000;

            std::cout << "[friscy] Loading interpreter at 0x" << std::hex << interp_base << std::dec << "\n";

            // Load interpreter segments
            dynlink::load_elf_segments(machine, interp_binary, interp_base);

            // Update interpreter entry point with base offset
            uint64_t interp_entry = interp_info.entry_point;
            if (interp_info.type == elf::ET_DYN) {
                // PIE interpreter - adjust entry point
                auto [lo, hi] = elf::get_load_range(interp_binary);
                interp_entry = interp_info.entry_point - lo + interp_base;
            }

            std::cout << "[friscy] Interpreter entry: 0x" << std::hex << interp_entry << std::dec << "\n";

            // We'll jump to interpreter's entry point instead of main binary's
            machine.cpu.jump(interp_entry);
        }

        // Set up Linux syscall emulation (provided by libriscv)
        machine.setup_linux_syscalls();

        // Set up heap and memory management
        const auto heap_area = machine.memory.mmap_allocate(64ULL << 20);  // 64MB heap
        machine.setup_native_heap(HEAP_SYSCALLS_BASE, heap_area, 64ULL << 20);
        machine.setup_native_memory(MEMORY_SYSCALLS_BASE);

        // Install our VFS-backed syscall handlers
        syscalls::install_syscalls(machine, g_vfs);

        // Install network syscall handlers (socket, connect, etc.)
        net::install_network_syscalls(machine);

        // Set up environment variables
        std::vector<std::string> env = {
            "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "HOME=/root",
            "USER=root",
            "TERM=xterm-256color",
            "LANG=C.UTF-8",
        };

        // Set up argv
        if (guest_args.empty()) {
            guest_args.push_back(entry_path);
        }

        // Set up program arguments and environment
        if (use_dynamic_linker) {
            // For dynamic linking, set up stack with aux vector
            std::cout << "[friscy] Setting up aux vector for dynamic linker\n";

            // Adjust exec_info.phdr_addr if it's relative
            // For PIE executables, phdr_addr is relative to load address
            elf::ElfInfo adjusted_exec_info = exec_info;
            if (exec_info.type == elf::ET_DYN) {
                // PIE executable - phdr_addr needs adjustment
                // libriscv loads PIE at a base address, need to find it
                // For now assume loaded at low address as specified in ELF
            }

            uint64_t sp = dynlink::setup_dynamic_stack(
                machine,
                adjusted_exec_info,
                interp_base,
                guest_args,
                env,
                0x7fff0000  // Stack top
            );

            // Set stack pointer
            machine.cpu.reg(riscv::REG_SP) = sp;

            std::cout << "[friscy] Stack pointer: 0x" << std::hex << sp << std::dec << "\n";
        } else {
            // Static binary - use libriscv's standard setup
            machine.setup_argv(guest_args, env);
        }

        // Route guest stdout/stderr to host
        machine.set_printer([](const auto&, const char* data, size_t len) {
            std::cout.write(data, len);
            std::cout.flush();
        });

        std::cout << "[friscy] Starting execution...\n";
        std::cout << "----------------------------------------\n";

        // Run!
        machine.simulate(MAX_INSTRUCTIONS);

        std::cout << "----------------------------------------\n";

        // Report results
        auto [instructions, _] = machine.get_counters();
        auto exit_code = machine.return_value();

        std::cout << "[friscy] Execution complete\n";
        std::cout << "[friscy] Instructions: " << instructions << "\n";
        std::cout << "[friscy] Exit code: " << exit_code << "\n";

        return static_cast<int>(exit_code);

    } catch (const riscv::MachineException& e) {
        std::cerr << "\n[friscy] Machine exception: " << e.what();
        if (e.data() != 0) {
            std::cerr << " (data: 0x" << std::hex << e.data() << std::dec << ")";
        }
        std::cerr << "\n";
        return 1;
    } catch (const std::exception& e) {
        std::cerr << "\n[friscy] Error: " << e.what() << "\n";
        return 1;
    }
}
