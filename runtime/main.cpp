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
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#include <signal.h>
#include <execinfo.h>
static void segfault_handler(int sig) {
    void* bt[32];
    int n = backtrace(bt, 32);
    fprintf(stderr, "\n=== SIGSEGV caught ===\n");
    backtrace_symbols_fd(bt, n, 2);
    _exit(139);
}
#endif

using Machine = riscv::Machine<riscv::RISCV64>;

// Configuration
static constexpr uint64_t MAX_INSTRUCTIONS = 512'000'000'000ULL;  // 512 billion
static constexpr uint32_t HEAP_SYSCALLS_BASE = 480;
static constexpr uint32_t MEMORY_SYSCALLS_BASE = 485;

// Global VFS instance (needed for syscall handlers)
// Use pointer + lazy init so wizer_init can safely construct it
// before C++ static constructors have run.
static vfs::VirtualFS* g_vfs_ptr = nullptr;
static vfs::VirtualFS& g_vfs_ref() {
    if (!g_vfs_ptr) {
        g_vfs_ptr = new vfs::VirtualFS();
    }
    return *g_vfs_ptr;
}
#define g_vfs (g_vfs_ref())

// Forward declarations (needed by wizer_init)
static std::vector<uint8_t> load_file(const std::string& path);
static std::vector<uint8_t> load_from_vfs(const std::string& path);
static void setup_virtual_files();

// Global machine pointer for JS interop (stdin resume loop)
#ifdef __EMSCRIPTEN__
static Machine* g_machine = nullptr;

extern "C" {
// Returns 1 if machine is stopped waiting for stdin, 0 otherwise.
// Uses g_waiting_for_stdin flag (set by syscall handlers) to distinguish
// stdin-wait from program exit (both call machine.stop()).
EMSCRIPTEN_KEEPALIVE int friscy_stopped() {
    return syscalls::g_waiting_for_stdin ? 1 : 0;
}

// Resume execution. Returns 1 if machine stopped again (needs more stdin), 0 if done.
// Handles page protection faults by making the faulting page writable and
// retrying. This acts as a simple page fault handler for pages at the
// boundary between read-only code and writable data segments.
EMSCRIPTEN_KEEPALIVE int friscy_resume() {
    if (!g_machine) return 0;
    syscalls::g_waiting_for_stdin = false;
    static constexpr uint64_t YIELD_CHUNK = 2'000'000;
    for (int retries = 0; retries < 8; retries++) {
        try {
            while (true) {
                g_machine->resume<false>(YIELD_CHUNK);
                if (syscalls::g_waiting_for_stdin) break;
                if (!g_machine->instruction_limit_reached()) break;
                // No yield needed — Worker thread doesn't block UI
            }
            return friscy_stopped();
        } catch (const riscv::MachineException& e) {
            uint64_t fault_addr = e.data();
            std::cerr << "[resume] MachineException: " << e.what()
                      << " data=0x" << std::hex << fault_addr
                      << " pc=0x" << g_machine->cpu.pc() << std::dec << "\n";
            // If this looks like a page protection fault (data address != 0),
            // make the page writable and retry.
            if (fault_addr != 0 && retries < 7) {
                constexpr uint64_t PAGE_MASK = ~0xFFFULL;
                uint64_t page = fault_addr & PAGE_MASK;
                riscv::PageAttributes attr;
                attr.read = true;
                attr.write = true;
                attr.exec = true;
                g_machine->memory.set_page_attr(page, 4096, attr);
                continue;  // retry
            }
            // Give up — report to terminal
            EM_ASM({
                if (typeof Module._termWrite === 'function') {
                    Module._termWrite('\r\n\x1b[31m[friscy] Machine exception: ' +
                        UTF8ToString($0) + ' (data: 0x' + ($1).toString(16) +
                        ', pc: 0x' + ($2).toString(16) + ')\x1b[0m\r\n');
                }
            }, e.what(), (uint32_t)e.data(), (uint32_t)g_machine->cpu.pc());
            return 0;
        } catch (const std::exception& e) {
            EM_ASM({
                if (typeof Module._termWrite === 'function') {
                    Module._termWrite('\r\n\x1b[31m[friscy] Error: ' +
                        UTF8ToString($0) + '\x1b[0m\r\n');
                }
            }, e.what());
            return 0;
        }
    }
    return friscy_stopped();
}

EMSCRIPTEN_KEEPALIVE uint32_t friscy_get_pc() {
    return g_machine ? (uint32_t)g_machine->cpu.pc() : 0;
}

EMSCRIPTEN_KEEPALIVE void friscy_set_pc(uint32_t pc) {
    if (g_machine) g_machine->cpu.jump(pc);
}

EMSCRIPTEN_KEEPALIVE uint32_t friscy_get_state_ptr() {
    return g_machine ? (uint32_t)(uintptr_t)g_machine->memory.memory_arena_ptr() : 0;
}
}
#endif

// ============================================================================
// Wizer pre-initialization support (Workstream E)
// When built with -DFRISCY_WIZER, the wizer_init() function pre-loads the
// rootfs and entry binary so the Wasm snapshot starts with VFS populated.
// ============================================================================
#ifdef FRISCY_WIZER
static bool g_wizer_initialized = false;

extern "C" void wizer_init() {
    // Pre-initialize code paths and VFS structures.
    // Note: File I/O is not available during wizer pre-initialization
    // (tokio runtime conflict in wasmtime), so rootfs loading happens
    // at runtime via JavaScript. The value of this snapshot is:
    //   1. C++ static constructors are pre-run
    //   2. VFS data structures are initialized
    //   3. Virtual /dev and /proc entries are created
    //   4. Code paths are pre-warmed in the Wasm engine
    setup_virtual_files();
    g_wizer_initialized = true;
}
#endif

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

    // /dev/tty and /dev/console — controlling terminal
    // These are opened by ash/bash for job control. Reads/writes go through
    // the ioctl tty handling (TCGETS etc.), and read/write on these fds
    // redirect to stdin/stdout in the syscall handlers.
    g_vfs.add_virtual_file("/dev/tty", std::vector<uint8_t>{});
    g_vfs.add_virtual_file("/dev/console", std::vector<uint8_t>{});
    g_vfs.add_virtual_file("/dev/pts/0", std::vector<uint8_t>{});
    g_vfs.add_virtual_file("/dev/ptmx", std::vector<uint8_t>{});

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

    // Timezone data — needed by Node.js (abseil/cctz) to avoid abort()
    // Minimal TZif2 file for UTC: no transitions, one ttinfo (offset=0, "UTC")
    static const uint8_t utc_tzif[] = {
        // TZif v1 header (44 bytes)
        'T','Z','i','f','2',  0,0,0,0,0,0,0,0,0,0,   // magic + reserved
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,                // reserved (20 bytes total)
        0,0,0,0,  // tzh_ttisutcnt = 0
        0,0,0,0,  // tzh_ttisstdcnt = 0
        0,0,0,0,  // tzh_leapcnt = 0
        0,0,0,0,  // tzh_timecnt = 0
        0,0,0,1,  // tzh_typecnt = 1
        0,0,0,4,  // tzh_charcnt = 4
        // v1 data: 1 ttinfo (6 bytes): utoff=0, dst=0, idx=0
        0,0,0,0, 0, 0,
        // v1 designation: "UTC\0"
        'U','T','C',0,
        // TZif v2 header (44 bytes)
        'T','Z','i','f','2',  0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,  // tzh_ttisutcnt = 0
        0,0,0,0,  // tzh_ttisstdcnt = 0
        0,0,0,0,  // tzh_leapcnt = 0
        0,0,0,0,  // tzh_timecnt = 0
        0,0,0,1,  // tzh_typecnt = 1
        0,0,0,4,  // tzh_charcnt = 4
        // v2 data: 1 ttinfo (6 bytes)
        0,0,0,0, 0, 0,
        // v2 designation: "UTC\0"
        'U','T','C',0,
        // POSIX TZ string footer
        '\n','U','T','C','0','\n',
    };
    std::vector<uint8_t> utc_tz(utc_tzif, utc_tzif + sizeof(utc_tzif));
    g_vfs.add_virtual_file("/etc/localtime", utc_tz);
    g_vfs.add_virtual_file("/usr/share/zoneinfo/UTC", utc_tz);
    g_vfs.add_virtual_file("/usr/share/zoneinfo/Etc/UTC", utc_tz);

    // /proc/version_signature — Node.js reads this to detect WSL
    g_vfs.add_virtual_file("/proc/version_signature",
        "Linux version 6.8.0 (friscy@libriscv) (riscv64-linux-gnu-gcc)\n");

    // /proc/cpuinfo — V8 reads this to detect RISC-V ISA extensions.
    // Without it, V8 may abort thinking required features are missing.
    g_vfs.add_virtual_file("/proc/cpuinfo",
        "processor\t: 0\n"
        "hart\t\t: 0\n"
        "isa\t\t: rv64imafdc_zicsr_zifencei\n"
        "mmu\t\t: sv39\n"
        "uarch\t\t: friscy,libriscv\n"
        "\n");

    // /proc/self/maps — V8 reads this during cage setup
    g_vfs.add_virtual_file("/proc/self/maps", "");

    // /proc/sys/vm/overcommit_memory — V8 checks this
    g_vfs.add_virtual_file("/proc/sys/vm/overcommit_memory", "0\n");

    // /tmp directory and NODE_COMPILE_CACHE directory
    // Node.js will create cache files here; persist via --export-tar
    g_vfs.mkdir("/tmp", 0777);
    g_vfs.mkdir("/tmp/node-compile-cache", 0777);
}

// ============================================================================
// Emscripten VFS tar export (Workstream F)
// JavaScript calls _friscy_export_tar to get the VFS as a tar blob.
// Caller must Module._free() the returned pointer after use.
// ============================================================================
#ifdef __EMSCRIPTEN__
extern "C" uint8_t* friscy_export_tar(uint32_t* out_size) {
    auto tar = g_vfs.save_tar();
    if (tar.empty()) {
        if (out_size) *out_size = 0;
        return nullptr;
    }
    uint8_t* buf = static_cast<uint8_t*>(malloc(tar.size()));
    if (!buf) {
        if (out_size) *out_size = 0;
        return nullptr;
    }
    memcpy(buf, tar.data(), tar.size());
    if (out_size) *out_size = static_cast<uint32_t>(tar.size());
    return buf;
}
#endif

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
#ifndef __EMSCRIPTEN__
    signal(SIGSEGV, segfault_handler);
#endif
    if (argc < 2) {
        usage(argv[0]);
        return 1;
    }

    std::string rootfs_path;
    std::string entry_path;
    std::string export_tar_path;
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
        } else if (strcmp(argv[i], "--export-tar") == 0) {
            if (i + 1 >= argc) {
                std::cerr << "Error: --export-tar requires <path>\n";
                return 1;
            }
            export_tar_path = argv[++i];
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

    static std::unique_ptr<Machine> machine_ptr;
    try {
        std::vector<uint8_t> binary;

#ifdef FRISCY_WIZER
        if (g_wizer_initialized) {
            // Wizer pre-initialization already loaded rootfs into VFS
            // and pre-loaded the entry binary — skip redundant I/O.
            binary = g_wizer_binary;
            entry_path = g_wizer_entry;
            container_mode = true;  // VFS is already loaded
            std::cout << "[friscy] Using wizer pre-initialized snapshot\n";
            std::cout << "[friscy] Entry point: " << entry_path << "\n";
            std::cout << "[friscy] Binary size: " << binary.size() << " bytes\n";
        } else
#endif
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
        // Use static unique_ptr so machine survives after main() returns,
        // allowing JS to call friscy_resume() for stdin polling.
        machine_ptr = std::make_unique<Machine>(binary);
        auto& machine = *machine_ptr;

        // If dynamic, also load the interpreter at a high address
        if (use_dynamic_linker) {
            // Load interpreter within the 2GB encompassing arena (2^31).
            // Place at 384MB mark, above heap/mmap but within arena.
            interp_base = 0x18000000;

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

            // Calculate the base address where libriscv loaded the main executable.
            // For PIE (ET_DYN), libriscv loads at DYLINK_BASE (0x40000).
            // We can derive the base adjustment from the machine's start address.
            if (exec_info.type == elf::ET_DYN) {
                uint64_t actual_entry = machine.memory.start_address();
                uint64_t exec_base = actual_entry - exec_info.entry_point;
                exec_info.phdr_addr += exec_base;
                exec_info.entry_point = actual_entry;
                std::cout << "[friscy] PIE base: 0x" << std::hex << exec_base << std::dec << "\n";

                // Save PIE base for execve: load_elf_segments needs the
                // address where the first segment starts (exec_base + lo)
                auto [lo, hi] = elf::get_load_range(binary);
                syscalls::g_exec_ctx.exec_base = exec_base + lo;
                // Find writable data segment range (skip code segments)
                auto [rw_lo, rw_hi] = elf::get_writable_range(binary);
                syscalls::g_exec_ctx.exec_rw_start = exec_base + rw_lo;
                syscalls::g_exec_ctx.exec_rw_end = exec_base + rw_hi;
            }

            // Advance mmap region past the interpreter to prevent overlap.
            // Without this, the bump allocator can return addresses in the
            // interpreter's .data/.bss segments, corrupting musl's internal
            // state (e.g., zeroing stderr's FILE struct causes PC=0x0 crash).
            auto [interp_lo, interp_hi] = elf::get_load_range(interp_binary);
            uint64_t interp_end_page = (interp_base + interp_hi + 0xFFF) & ~0xFFFULL;
            if (machine.memory.mmap_address() < interp_end_page) {
                std::cout << "[friscy] Advancing mmap past interpreter: 0x"
                          << std::hex << machine.memory.mmap_address()
                          << " -> 0x" << interp_end_page << std::dec << "\n";
                machine.memory.mmap_address() = interp_end_page;
            }

            // We'll jump to interpreter's entry point instead of main binary's
            machine.cpu.jump(interp_entry);
        }

        // Save execution context for execve support (clone+execve needs
        // to reload segments and set up a fresh stack for the new process)
        syscalls::g_exec_ctx.exec_binary = binary;
        syscalls::g_exec_ctx.exec_info = exec_info;  // Already adjusted for PIE
        if (use_dynamic_linker) {
            syscalls::g_exec_ctx.interp_binary = interp_binary;
            syscalls::g_exec_ctx.interp_base = interp_base;
            syscalls::g_exec_ctx.interp_entry = machine.cpu.pc();  // interp_entry
            syscalls::g_exec_ctx.dynamic = true;
            // Find interpreter's writable data segment range
            auto [irw_lo, irw_hi] = elf::get_writable_range(interp_binary);
            syscalls::g_exec_ctx.interp_rw_start = interp_base + irw_lo;
            syscalls::g_exec_ctx.interp_rw_end = interp_base + irw_hi;
        }

        // Set up Linux syscall emulation (provided by libriscv)
        machine.setup_linux_syscalls();

        // Set up heap and memory management
        const auto heap_area = machine.memory.mmap_allocate(64ULL << 20);  // 64MB heap
        machine.setup_native_heap(HEAP_SYSCALLS_BASE, heap_area, 64ULL << 20);
        syscalls::g_exec_ctx.heap_start = heap_area;
        syscalls::g_exec_ctx.heap_size = 64ULL << 20;
        std::cout << "[friscy] Heap area: 0x" << std::hex << heap_area << std::dec
                  << " (" << (64ULL << 20) / (1024*1024) << "MB)\n";
        machine.setup_native_memory(MEMORY_SYSCALLS_BASE);

        // Install our VFS-backed syscall handlers
        syscalls::install_syscalls(machine, g_vfs);

        // Install network syscall handlers (socket, connect, etc.)
        net::install_network_syscalls(machine);

        // Set up network bridge function pointers for syscalls.hpp
        // (avoids header include order issues between network.hpp and syscalls.hpp)
        syscalls::net_is_socket_fd = [](int fd) -> bool {
            return net::get_network_ctx().is_socket_fd(fd);
        };
#ifndef __EMSCRIPTEN__
        syscalls::net_get_native_fd = [](int fd) -> int {
            auto* sock = net::get_network_ctx().get_socket(fd);
            return (sock && sock->native_fd >= 0) ? sock->native_fd : -1;
        };
#endif

        // Set up environment variables
        std::vector<std::string> env = {
            "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "HOME=/root",
            "USER=root",
            "TERM=xterm-256color",
            "LANG=C.UTF-8",
            "HOSTNAME=friscy",
            "TZ=UTC",
            "NODE_OPTIONS=--jitless --max-old-space-size=256",
            "NODE_COMPILE_CACHE=/tmp/node-compile-cache",
        };
        syscalls::g_exec_ctx.env = env;

        // Set up argv — ensure entry_path is argv[0]
        if (guest_args.empty()) {
            guest_args.push_back(entry_path);
        } else if (guest_args[0] != entry_path) {
            guest_args.insert(guest_args.begin(), entry_path);
        }

        // Note: V8 JIT (--no-turbofan --no-maglev for Sparkplug-only) was tested
        // but is ~9x slower than --jitless in emulation. JIT compiles JS to RISC-V
        // native code, but that code still gets interpreted by libriscv — all
        // compilation overhead with zero execution benefit, plus decoder cache thrash.

        // Set up program arguments and environment
        if (use_dynamic_linker) {
            // For dynamic linking, set up stack with aux vector
            std::cout << "[friscy] Setting up aux vector for dynamic linker\n";

            // Use the machine's actual stack pointer (set by Machine constructor)
            uint64_t stack_top = machine.cpu.reg(riscv::REG_SP);
            syscalls::g_exec_ctx.original_stack_top = stack_top;
            std::cout << "[friscy] Machine stack top: 0x" << std::hex << stack_top << std::dec << "\n";

            uint64_t sp = dynlink::setup_dynamic_stack(
                machine,
                exec_info,
                interp_base,
                guest_args,
                env,
                stack_top
            );

            // Set stack pointer
            machine.cpu.reg(riscv::REG_SP) = sp;

            std::cout << "[friscy] Stack pointer: 0x" << std::hex << sp << std::dec << "\n";
        } else {
            // Static binary — still need aux vector (Go runtime reads AT_PAGESZ)
            uint64_t stack_top = machine.cpu.reg(riscv::REG_SP);
            syscalls::g_exec_ctx.original_stack_top = stack_top;

            uint64_t sp = dynlink::setup_dynamic_stack(
                machine,
                exec_info,
                0,  // no interpreter base
                guest_args,
                env,
                stack_top
            );
            machine.cpu.reg(riscv::REG_SP) = sp;
        }

        // Route guest stdout/stderr to host
#ifdef __EMSCRIPTEN__
        machine.set_printer([](const auto&, const char* data, size_t len) {
            EM_ASM({
                if (typeof Module._termWrite === 'function') {
                    // Use TextDecoder to handle potential partial UTF-8 sequences between chunks
                    if (!Module._decoder) Module._decoder = new TextDecoder();
                    // Copy to regular ArrayBuffer — TextDecoder rejects SharedArrayBuffer views
                    var buf = new Uint8Array($1);
                    buf.set(Module.HEAPU8.subarray($0, $0 + $1));
                    Module._termWrite(Module._decoder.decode(buf, {stream: true}));
                } else {
                    out(UTF8ToString($0, $1));
                }
            }, data, len);
        });
#else
        machine.set_printer([](const auto&, const char* data, size_t len) {
            std::cout.write(data, len);
            std::cout.flush();
        });
#endif

        // Debug: trace unhandled syscalls with name lookup
        Machine::on_unhandled_syscall = [](Machine& m, size_t nr) {
            static const std::unordered_map<size_t, const char*> names = {
                {17,"getcwd"},{19,"eventfd2"},{20,"epoll_create1"},{21,"epoll_ctl"},
                {22,"epoll_pwait"},{23,"dup"},{24,"dup3"},{25,"fcntl"},{29,"ioctl"},
                {32,"flock"},{34,"mkdirat"},{35,"unlinkat"},{36,"symlinkat"},
                {37,"linkat"},{38,"renameat"},{46,"ftruncate"},{48,"faccessat"},
                {49,"chdir"},{52,"fchmod"},{53,"fchmodat"},{54,"fchownat"},
                {55,"fchown"},{56,"openat"},{57,"close"},{59,"pipe2"},
                {61,"getdents64"},{62,"lseek"},{63,"read"},{64,"write"},
                {65,"readv"},{66,"writev"},{67,"pread64"},{68,"pwrite64"},
                {70,"pwritev"},{71,"sendfile"},{73,"ppoll"},{78,"readlinkat"},
                {79,"newfstatat"},{80,"fstat"},{82,"fsync"},{90,"capget"},
                {93,"exit"},{94,"exit_group"},{96,"set_tid_address"},
                {98,"futex"},{99,"set_robust_list"},{101,"nanosleep"},
                {113,"clock_gettime"},{114,"clock_getres"},{120,"sched_getscheduler"},
                {121,"sched_getparam"},{123,"sched_getaffinity"},{124,"sched_yield"},
                {129,"kill"},{130,"tkill"},{131,"tgkill"},{132,"sigaltstack"},
                {134,"sigaction"},{135,"sigprocmask"},{139,"rt_sigreturn"},
                {148,"getresuid"},{150,"getresgid"},{155,"getpgid"},
                {158,"getgroups"},{160,"uname"},{166,"umask"},{167,"prctl"},
                {172,"getpid"},{173,"getppid"},{174,"getuid"},{175,"geteuid"},
                {176,"getgid"},{177,"getegid"},{178,"gettid"},{179,"sysinfo"},
                {198,"socket"},{199,"socketpair"},{200,"bind"},{201,"listen"},
                {202,"accept"},{203,"connect"},{204,"getsockname"},
                {205,"getpeername"},{206,"sendto"},{207,"recvfrom"},
                {208,"setsockopt"},{209,"getsockopt"},{210,"shutdown"},
                {211,"sendmsg"},{212,"recvmsg"},{214,"brk"},{215,"munmap"},
                {216,"mremap"},{220,"clone"},{221,"execve"},{222,"mmap"},
                {226,"mprotect"},{233,"madvise"},{260,"wait4"},{261,"prlimit64"},
                {278,"getrandom"},{283,"membarrier"},{291,"statx"},
                {293,"rseq"},{425,"io_uring_setup"},{439,"faccessat2"},
            };
            auto it = names.find(nr);
            const char* name = it != names.end() ? it->second : "???";
            std::cerr << "[syscall] UNHANDLED #" << nr << " (" << name << ")"
                      << " a0=" << m.cpu.reg(10)
                      << " a1=" << m.cpu.reg(11) << "\n";
            m.set_result(-38);  // ENOSYS
        };

        std::cout << "[friscy] Starting execution...\n";
        std::cout << "----------------------------------------\n";

#ifdef __EMSCRIPTEN__
        g_machine = &machine;
#endif
        // Run! The machine may stop for several reasons:
        // 1. Program exit (natural end)
        // 2. Stdin wait (g_waiting_for_stdin — JS calls friscy_resume)
        // 3. execve (loads new binary, stops to break out of dispatch safely)
        // 4. Page fault (MachineException — retry after fixing permissions)
        for (int retries = 0; retries < 8; retries++) {
            try {
#ifdef __EMSCRIPTEN__
                // Chunked execution: simulate in chunks of YIELD_CHUNK instructions.
                // Worker thread runs freely without yielding (no UI thread blocking).
                // Use simulate<false>() to return normally on limit (not throw).
                static constexpr uint64_t YIELD_CHUNK = 2'000'000;
                while (true) {
                    // Use resume<false>() to accumulate instruction counter
                    // across chunks (simulate<false> resets counter to 0 each call)
                    machine.resume<false>(YIELD_CHUNK);
                    if (syscalls::g_waiting_for_stdin) break;
                    if (syscalls::g_execve_restart) break;
                    if (!machine.instruction_limit_reached()) break;
                    // No yield needed — Worker thread doesn't block UI
                }
                // execve: re-enter simulate with new binary
                if (syscalls::g_execve_restart) {
                    syscalls::g_execve_restart = false;
                    retries = -1;  // incremented to 0 by for loop
                    continue;
                }
#else
                machine.simulate(MAX_INSTRUCTIONS);
                // After execve, machine.stop() causes simulate to return
                // with m_max_counter=0. instruction_limit_reached() returns
                // false (it requires m_max_counter!=0). Use our own flag.
                if (syscalls::g_execve_restart) {
                    syscalls::g_execve_restart = false;
                    retries = 0;  // reset retries for new binary
                    continue;
                }
#endif
                std::cerr << "[friscy] simulate() returned normally, retries=" << retries << "\n";
                break;
            } catch (const riscv::MachineException& e) {
                uint64_t fault_addr = e.data();
                uint64_t crash_pc = machine.cpu.pc();
                std::cerr << "[friscy] MachineException: " << e.what()
                          << " data=0x" << std::hex << fault_addr
                          << " pc=0x" << crash_pc << std::dec
                          << " retry=" << retries << "\n";

                // Check if this is an instruction limit, not a page fault
                if (machine.instruction_limit_reached()) {
                    std::cerr << "[friscy] Instruction limit reached after "
                              << machine.get_counters().first << " instructions\n";
                    break;  // Exit cleanly instead of retrying
                }

                if (fault_addr != 0 && retries < 7) {
                    constexpr uint64_t PAGE_MASK = ~0xFFFULL;
                    uint64_t page = fault_addr & PAGE_MASK;
                    riscv::PageAttributes attr;
                    attr.read = true;
                    attr.write = true;
                    attr.exec = true;
                    machine.memory.set_page_attr(page, 4096, attr);
                    continue;
                }
#ifdef __EMSCRIPTEN__
                EM_ASM({
                    if (typeof Module._termWrite === 'function') {
                        Module._termWrite('\r\n\x1b[31m[friscy] Machine exception: ' +
                            UTF8ToString($0) + ' (data: 0x' + ($1).toString(16) +
                            ', pc: 0x' + ($2).toString(16) + ')\x1b[0m\r\n');
                    }
                }, e.what(), (uint32_t)e.data(), (uint32_t)machine.cpu.pc());
                std::cerr << "[friscy] Fatal exception, exiting with code 1\n";
                return 1;
#else
                throw;
#endif
            } catch (const std::exception& e) {
                std::cerr << "[friscy] std::exception: " << e.what()
                          << " pc=0x" << std::hex << machine.cpu.pc() << std::dec << "\n";
                return 1;
            }
        }

#ifdef __EMSCRIPTEN__
        if (syscalls::g_waiting_for_stdin) {
            // Machine stopped because stdin has no data.
            // Return to JS — the resume loop will call friscy_resume().
            return 0;
        }
#endif

        std::cout << "----------------------------------------\n";

        // Report results
        auto [instructions, _] = machine.get_counters();
        auto exit_code = machine.return_value();

        std::cout << "[friscy] Execution complete\n";
        std::cout << "[friscy] Instructions: " << instructions << "\n";
        std::cout << "[friscy] Exit code: " << exit_code << "\n";

        // Export VFS as tar if requested
        if (!export_tar_path.empty()) {
            std::cout << "[friscy] Exporting VFS to tar: " << export_tar_path << "\n";
            auto tar_data = g_vfs.save_tar();
            std::ofstream out(export_tar_path, std::ios::binary);
            if (!out) {
                std::cerr << "Error: Could not open export tar path: " << export_tar_path << "\n";
                return 1;
            }
            out.write(reinterpret_cast<const char*>(tar_data.data()), tar_data.size());
            std::cout << "[friscy] Exported " << tar_data.size() << " bytes\n";
        }

        return static_cast<int>(exit_code);

    } catch (const riscv::MachineException& e) {
        std::cerr << "\n[friscy] Machine exception: " << e.what();
        if (e.data() != 0) {
            std::cerr << " (data: 0x" << std::hex << e.data() << std::dec << ")";
        }
        auto crash_pc = machine_ptr->cpu.pc();
        std::cerr << "\n  PC=0x" << std::hex << crash_pc << std::dec << "\n";
        // Try to read the actual memory at PC
        try {
            uint32_t mem_at_pc = machine_ptr->memory.template read<uint32_t>(crash_pc);
            std::cerr << "  Memory at PC: 0x" << std::hex << mem_at_pc << std::dec << "\n";
        } catch (...) {
            std::cerr << "  Memory at PC: UNREADABLE (protection fault)\n";
        }
        // Print non-zero registers for context
        for (int r = 0; r < 32; r++) {
            if (machine_ptr->cpu.reg(r) != 0)
                std::cerr << "  x" << r << "=0x" << std::hex << machine_ptr->cpu.reg(r) << std::dec << "\n";
        }
        // Try to read strings from registers that might be string pointers
        for (int r : {6, 10, 11, 13}) {
            auto addr = machine_ptr->cpu.reg(r);
            if (addr > 0x10000 && addr < 0x1FFFFFFF) {
                try {
                    char buf[256] = {};
                    for (int i = 0; i < 255; i++) {
                        buf[i] = machine_ptr->memory.template read<char>(addr + i);
                        if (buf[i] == 0) break;
                        if (buf[i] < 32 && buf[i] != '\n' && buf[i] != '\t') { buf[i] = 0; break; }
                    }
                    if (buf[0]) std::cerr << "  x" << r << " string: \"" << buf << "\"\n";
                } catch (...) {}
            }
        }
        return 1;
    } catch (const std::exception& e) {
        std::cerr << "\n[friscy] Error: " << e.what() << "\n";
        return 1;
    }
}