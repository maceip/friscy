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
#include <libriscv/decoder_cache.hpp>
#include <libriscv/threaded_bytecodes.hpp>
#include "vfs.hpp"
#include "syscalls.hpp"
#include "network.hpp"
#include "vh_harness.hpp"
#include "elf_loader.hpp"
#include "checkpoint.hpp"

#include <iostream>
#ifndef __EMSCRIPTEN__
#include <unistd.h>
#endif

// Reuse dbg_fprintf from syscalls.hpp (defined when FRISCY_QUIET)
#ifndef dbg_fprintf
#ifdef FRISCY_QUIET
#define dbg_fprintf(...) ((void)0)
#else
#define dbg_fprintf fprintf
#endif
#endif
// Stream-based debug macros: compiler strips dead code in unreachable branch
#ifdef FRISCY_QUIET
#define dbg_cerr if(1) {} else std::cerr
#define dbg_cout if(1) {} else std::cout
#else
#define dbg_cerr std::cerr
#define dbg_cout std::cout
#endif
#include <fstream>
#include <vector>
#include <string>
#include <cstring>
#include <cstdlib>
#include <chrono>
#include <sstream>
#include <iomanip>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#include <signal.h>
#include <execinfo.h>
static void segfault_handler(int sig) {
    void* bt[32];
    int n = backtrace(bt, 32);
    dbg_fprintf(stderr, "\n=== SIGSEGV caught ===\n");
    backtrace_symbols_fd(bt, n, 2);
    _exit(139);
}
#endif

using Machine = riscv::Machine<riscv::RISCV64>;

// Configuration
static constexpr uint64_t MAX_INSTRUCTIONS = UINT64_MAX;  // no limit
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
enum : uint32_t {
    FRISCY_FAULT_NONE = 0,
    FRISCY_FAULT_MACHINE_EXCEPTION = 1,
    FRISCY_FAULT_EBREAK = 2,
};
static uint32_t g_last_fault_kind = FRISCY_FAULT_NONE;
static uint32_t g_last_fault_pc = 0;
static uint32_t g_last_fault_data = 0;

static inline uint32_t current_stop_reason_mask() {
    uint32_t mask = syscalls::STOP_REASON_NONE;
    if (syscalls::g_waiting_for_stdin)      mask |= syscalls::STOP_REASON_STDIN;
    if (syscalls::g_waiting_for_host_fetch) mask |= syscalls::STOP_REASON_HOST_FETCH;
    if (syscalls::fork_parent_waiting())    mask |= syscalls::STOP_REASON_WAIT_CHILD;
    return mask;
}

static inline void enforce_fork_state_invariant(const char* where) {
    if (syscalls::fork_child_exited() && !syscalls::fork_parent_context_restored()) {
        dbg_cerr << "[friscy] FATAL: ChildExited observed before parent restore (" << where << ")\n";
        __builtin_trap();
    }
}

static std::string format_callsite_symbol(const Machine& machine, uint64_t pc) {
    try {
        auto call = machine.memory.lookup(pc);
        if (call.name.empty() || call.name == "(null)") {
            return "(unknown)";
        }
        if (call.offset == 0) {
            return call.name;
        }
        return call.name + "+" + std::to_string((unsigned long long)call.offset);
    } catch (...) {
        return "(unknown)";
    }
}

static void dump_exec_bytes(Machine& machine, uint64_t pc, const char* tag) {
    uint8_t guest_bytes[16] = {};
    bool have_guest_bytes = false;
    try {
        machine.memory.memcpy_out(guest_bytes, pc, sizeof(guest_bytes));
        have_guest_bytes = true;
    } catch (...) {}

    auto& exec_seg = machine.memory.exec_segment_for(pc);
    const uint8_t* exec_ptr = nullptr;
    if (exec_seg && !exec_seg->empty() && exec_seg->is_within(pc, sizeof(guest_bytes))) {
        exec_ptr = exec_seg->exec_data(pc);
    }

    fprintf(stderr,
            "%s pc=0x%lx exec_base=0x%lx seg=[0x%lx,0x%lx) stale=%d have_guest=%d have_exec=%d\n",
            tag,
            (unsigned long)pc,
            (unsigned long)syscalls::g_exec_ctx.exec_base,
            (unsigned long)(exec_seg ? exec_seg->exec_begin() : 0),
            (unsigned long)(exec_seg ? exec_seg->exec_end() : 0),
            (int)(exec_seg ? exec_seg->is_stale() : 0),
            (int)have_guest_bytes,
            (int)(exec_ptr != nullptr));
    if (have_guest_bytes) {
        fprintf(stderr, "%s guest:", tag);
        for (size_t i = 0; i < sizeof(guest_bytes); i++) {
            fprintf(stderr, " %02x", guest_bytes[i]);
        }
        fprintf(stderr, "\n");
    }
    if (exec_ptr != nullptr) {
        fprintf(stderr, "%s exec :", tag);
        for (size_t i = 0; i < sizeof(guest_bytes); i++) {
            fprintf(stderr, " %02x", exec_ptr[i]);
        }
        fprintf(stderr, "\n");
    }
}

#ifdef __EMSCRIPTEN__
static Machine* g_machine = nullptr;
#ifdef __EMSCRIPTEN__
static std::vector<uint8_t> g_last_checkpoint_export;
static std::vector<uint8_t> g_live_checkpoint_export;
#endif

extern "C" {
// Returns 1 if machine is stopped waiting for stdin, 0 otherwise.
// Uses g_waiting_for_stdin flag (set by syscall handlers) to distinguish
// stdin-wait from program exit (both call machine.stop()).
EMSCRIPTEN_KEEPALIVE int friscy_stopped() {
    return (syscalls::g_waiting_for_stdin || syscalls::g_waiting_for_host_fetch || syscalls::fork_parent_waiting()) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE uint32_t friscy_get_last_fault_kind() {
    return g_last_fault_kind;
}
EMSCRIPTEN_KEEPALIVE uint32_t friscy_get_last_fault_pc() {
    return g_last_fault_pc;
}
EMSCRIPTEN_KEEPALIVE uint32_t friscy_get_last_fault_data() {
    return g_last_fault_data;
}
EMSCRIPTEN_KEEPALIVE void friscy_clear_last_fault() {
    g_last_fault_kind = FRISCY_FAULT_NONE;
    g_last_fault_pc = 0;
    g_last_fault_data = 0;
}

// Called from JS when a protection fault escapes C++ try/catch (WASM tail-call
// dispatch can prevent catch from firing). Evicts stale execute segments and
// fixes page permissions at the current PC so the next resume succeeds.
EMSCRIPTEN_KEEPALIVE int friscy_recover_fault() {
    if (!g_machine) return 0;
    g_machine->memory.evict_execute_segments();
    uint64_t pc = g_machine->cpu.pc();
    if (pc != 0) {
        riscv::PageAttributes attr;
        attr.read = true;
        attr.write = true;
        attr.exec = true;
        g_machine->memory.set_page_attr(pc & ~0xFFFULL, 4096, attr);
    }
    friscy_clear_last_fault();
    return 1; // recoverable
}

// Recover browser-side runs that escape through a wrapped host exception
// before the normal MachineException path can evict stale execute segments.
EMSCRIPTEN_KEEPALIVE int friscy_evict_execute_segments() {
    if (!g_machine) return 0;
    g_machine->memory.evict_execute_segments();
    uint64_t pc = g_machine->cpu.pc();
    if (pc != 0) {
        riscv::PageAttributes attr;
        attr.read = true;
        attr.write = true;
        attr.exec = true;
        g_machine->memory.set_page_attr(pc & ~0xFFFULL, 4096, attr);
    }
    friscy_clear_last_fault();
    return 1;
}

// Resume execution. Returns 1 if machine stopped again (needs more stdin), 0 if done.
// Handles page protection faults by making the faulting page writable and
// retrying. This acts as a simple page fault handler for pages at the
// boundary between read-only code and writable data segments.
EMSCRIPTEN_KEEPALIVE int friscy_resume() {
    if (!g_machine) return 0;
    friscy_clear_last_fault();
    syscalls::g_waiting_for_stdin = false;
    syscalls::g_waiting_for_host_fetch = false;
    static constexpr uint64_t YIELD_CHUNK = 2'000'000;
    static int resume_log_count = 0;
    for (int retries = 0; retries < 8; retries++) {
        enforce_fork_state_invariant("friscy_resume-loop");
        try {
            while (true) {
                enforce_fork_state_invariant("friscy_resume-step");
                g_machine->resume<false>(YIELD_CHUNK);
                if (syscalls::g_waiting_for_stdin) break;
                if (syscalls::g_waiting_for_host_fetch) break;
                if (syscalls::fork_parent_waiting()) break;
                if (syscalls::g_execve_restart) break;
                if (syscalls::fork_child_exited()) break;
                if (!g_machine->instruction_limit_reached()) break;
            }
            if (syscalls::fork_child_exited()) {
                syscalls::fork_parent_restore(*g_machine);
                retries = -1;
                continue;
            }
            if (syscalls::g_execve_restart) {
                syscalls::g_execve_restart = false;
                retries = -1;
                continue;
            }
            resume_log_count++;
            if (resume_log_count <= 10 || resume_log_count % 500 == 0) {
                auto [instr, _] = g_machine->get_counters();
                dbg_fprintf(stderr, "[resume] #%d instructions=%lu stopped=%d\n",
                        resume_log_count, (unsigned long)instr, friscy_stopped());
            }
            return friscy_stopped();
        } catch (const riscv::MachineException& e) {
            uint64_t fault_addr = e.data();
            const std::string what = e.what();
            const bool is_ebreak = what.find("EBREAK") != std::string::npos;
            const bool is_sigill = what.find("SIGILL") != std::string::npos || what.find("Illegal instruction") != std::string::npos;
            g_last_fault_kind = FRISCY_FAULT_MACHINE_EXCEPTION;
            g_last_fault_pc = (uint32_t)g_machine->cpu.pc();
            g_last_fault_data = (uint32_t)fault_addr;
            dbg_cerr << "[resume] MachineException: " << e.what()
                      << " data=0x" << std::hex << fault_addr
                      << " pc=0x" << g_machine->cpu.pc() << std::dec << "\n";
            if (is_ebreak || is_sigill) {
                auto ra = g_machine->cpu.reg(riscv::REG_RA);
                auto fault_symbol = format_callsite_symbol(*g_machine, g_machine->cpu.pc());
                auto ra_symbol = format_callsite_symbol(*g_machine, ra);
                if (is_sigill) {
                    dbg_cerr << "[resume] SIGILL ("
                              << fault_symbol << ") at pc=0x" << std::hex
                              << g_machine->cpu.pc() << std::dec
                              << " RA=0x" << std::hex << ra << " ("
                              << ra_symbol << std::dec << ")\n";
                    g_last_fault_kind = FRISCY_FAULT_MACHINE_EXCEPTION;
                    return 1;
                }
                dbg_cerr << "[resume] EBREAK ("
                          << fault_symbol << ") at pc=0x" << std::hex
                          << g_machine->cpu.pc() << std::dec
                          << " RA suggests " << ra_symbol << "\n";
            }
            // EBREAK from abort()/__stack_chk_fail: skip by returning from
            // the current function (set PC = RA). Common after fork child cleanup.
            if (is_ebreak) {
                g_last_fault_kind = FRISCY_FAULT_EBREAK;
                if (syscalls::g_fork_active()) {
                    dbg_cerr << "[resume] EBREAK in fork child — forcing child exit\n";
                    // Dump last 32 syscalls for debugging
                    dbg_cerr << "[syscall-ring] last 32 syscalls before crash:\n";
                    for (int j = 0; j < 32; j++) {
                        int idx = (riscv::g_syscall_ring_idx - 32 + j + 1024) % 32;
                        auto& e = riscv::g_syscall_ring[idx];
                        if (e.pc != 0)
                            dbg_cerr << "  [" << j << "] sys#" << e.sysnum
                                      << " a0=0x" << std::hex << e.a0
                                      << " a1=0x" << e.a1
                                      << " a2=0x" << e.a2
                                      << " => " << std::dec << e.result
                                      << " pc=0x" << std::hex << e.pc << std::dec << "\n";
                    }
                    syscalls::g_fork().exit_status = 127;
                    syscalls::g_process_model.push_event(
                        syscalls::ProcessEventKind::Exit,
                        syscalls::g_fork().child_pid, syscalls::g_fork().parent_pid,
                        syscalls::g_fork().child_pgid, 127);
                    syscalls::g_process_model.mark_exited(syscalls::g_fork().child_pid, 127);
                    syscalls::fork_mark_child_exited(*g_machine);
                    g_machine->stop();
                    continue;
                }
                if (friscy_stopped()) {
                    dbg_cerr << "[resume] EBREAK after stop: treating as completed run\n";
                    return 0;
                }
                uint64_t ra = g_machine->cpu.reg(riscv::REG_RA);
                dbg_cerr << "[resume] EBREAK: branch-entered, PC=0x"
                          << std::hex << g_machine->cpu.pc()
                          << " RA=0x" << ra
                          << " SP=0x" << g_machine->cpu.reg(riscv::REG_SP)
                          << std::dec << "\n";
                g_machine->cpu.jump(ra);
                continue;
            }
            // Protection fault: either data page or execution page.
            // Evict stale execute segments to force re-scan, then fix page attrs.
            if (retries < 7) {
                g_machine->memory.evict_execute_segments();
                if (fault_addr != 0) {
                    constexpr uint64_t PAGE_MASK = ~0xFFFULL;
                    uint64_t page = fault_addr & PAGE_MASK;
                    riscv::PageAttributes attr;
                    attr.read = true;
                    attr.write = true;
                    attr.exec = true;
                    g_machine->memory.set_page_attr(page, 4096, attr);
                } else {
                    // Execution fault at current PC — fix the PC's page
                    uint64_t pc = g_machine->cpu.pc();
                    riscv::PageAttributes attr;
                    attr.read = true;
                    attr.write = true;
                    attr.exec = true;
                    g_machine->memory.set_page_attr(pc & ~0xFFFULL, 4096, attr);
                }
                g_last_fault_kind = FRISCY_FAULT_NONE;
                g_last_fault_pc = 0;
                g_last_fault_data = 0;
                continue;  // retry
            }
            // Give up — report to terminal
            if (syscalls::g_fork_active()) {
                dbg_cerr << "[resume] MachineException in fork child (retries exhausted) — forcing child exit\n";
                syscalls::g_fork().exit_status = 127;
                syscalls::g_process_model.push_event(
                    syscalls::ProcessEventKind::Exit,
                    syscalls::g_fork().child_pid, syscalls::g_fork().parent_pid,
                    syscalls::g_fork().child_pgid, 127);
                syscalls::g_process_model.mark_exited(syscalls::g_fork().child_pid, 127);
                syscalls::fork_mark_child_exited(*g_machine);
                g_machine->stop();
                continue;
            }
            EM_ASM({
                if (typeof Module._termWrite === 'function') {
                    Module._termWrite('\r\n\x1b[31m[friscy] Machine exception: ' +
                        UTF8ToString(Number($0)) + ' (data: 0x' + ($1).toString(16) +
                        ', pc: 0x' + ($2).toString(16) + ')\x1b[0m\r\n');
                }
            }, e.what(), (uint32_t)e.data(), (uint32_t)g_machine->cpu.pc());
            return 0;
        } catch (const std::exception& e) {
            if (syscalls::g_fork_active()) {
                dbg_cerr << "[resume] std::exception in fork child — forcing child exit: " << e.what() << "\n";
                syscalls::g_fork().exit_status = 127;
                syscalls::g_process_model.push_event(
                    syscalls::ProcessEventKind::Exit,
                    syscalls::g_fork().child_pid, syscalls::g_fork().parent_pid,
                    syscalls::g_fork().child_pgid, 127);
                syscalls::g_process_model.mark_exited(syscalls::g_fork().child_pid, 127);
                syscalls::fork_mark_child_exited(*g_machine);
                g_machine->stop();
                continue;
            }
            EM_ASM({
                if (typeof Module._termWrite === 'function') {
                    Module._termWrite('\r\n\x1b[31m[friscy] Error: ' +
                        UTF8ToString(Number($0)) + '\x1b[0m\r\n');
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

// Host fetch hypercall exports
EMSCRIPTEN_KEEPALIVE int friscy_host_fetch_pending() {
    return syscalls::g_waiting_for_host_fetch ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE const char* friscy_get_fetch_request() {
    return syscalls::g_host_fetch_request.c_str();
}

EMSCRIPTEN_KEEPALIVE int friscy_get_fetch_request_len() {
    return (int)syscalls::g_host_fetch_request.size();
}

EMSCRIPTEN_KEEPALIVE void friscy_set_fetch_response(const char* data, int len) {
    syscalls::g_host_fetch_response.assign(data, len);
    syscalls::g_host_fetch_response_ready = true;
}

EMSCRIPTEN_KEEPALIVE uint32_t friscy_drain_process_events(uint32_t out_ptr, uint32_t max_events) {
    auto* out = reinterpret_cast<syscalls::ProcessEvent*>((uintptr_t)out_ptr);
    return syscalls::g_process_model.drain_events(out, max_events);
}

// Phase 2: stop-reason bitmask for worker.js yield dispatch
EMSCRIPTEN_KEEPALIVE uint32_t friscy_stop_reason() {
    return current_stop_reason_mask();
}

// Phase 2: host delivers child exit notification to unblock wait4
EMSCRIPTEN_KEEPALIVE void friscy_notify_child_exit(int32_t pid, int32_t status) {
    if (pid > 0) {
        syscalls::g_process_model.mark_exited(pid, status);
    }
    // Clear wait-blocked flag: either matching pid or unconditional if pid==0
    if (pid == 0 || syscalls::g_wait_blocked_pid == pid) {
        if (g_machine && syscalls::g_fork_active() && syscalls::fork_parent_waiting()) {
            syscalls::fork_set_state(*g_machine, syscalls::ProcessState::ParentSaved,
                    "notify", "child exit unblocks wait");
        }
        syscalls::g_wait_blocked_pid = 0;
    }
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
static std::vector<uint8_t> g_wizer_binary;
static std::string g_wizer_entry;

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

    // Several guest images install Node at /usr/bin/node only, but existing
    // repro commands and shebangs frequently invoke /bin/node. Add a guest-side
    // compatibility symlink when the image exposes the real binary but not the alias.
    if (!g_vfs.resolve("/bin/node") && g_vfs.resolve("/usr/bin/node")) {
        (void)g_vfs.mkdir("/bin", 0755);
        (void)g_vfs.symlink("/usr/bin/node", "/bin/node");
    }

    // /etc/passwd and /etc/group — keep root, and on native runs also expose
    // the current host user so login shells see the same identity branch as
    // qemu-user/native processes.
    std::string passwd = "root:x:0:0:root:/root:/bin/sh\n";
    std::string group = "root:x:0:\n";
#ifndef __EMSCRIPTEN__
    {
        const uid_t uid = ::getuid();
        const gid_t gid = ::getgid();
        const char* user_env = std::getenv("USER");
        const char* home_env = std::getenv("HOME");
        const std::string user = (user_env && *user_env) ? user_env : "user";
        const std::string home = (home_env && *home_env) ? home_env : ("/home/" + user);
        if (uid != 0) {
            passwd += user + ":x:" + std::to_string(uid) + ":" + std::to_string(gid)
                + ":" + user + ":" + home + ":/bin/sh\n";
        }
        if (gid != 0) {
            group += user + ":x:" + std::to_string(gid) + ":\n";
        }
    }
#endif
    g_vfs.add_virtual_file("/etc/passwd", passwd);
    g_vfs.add_virtual_file("/etc/group", group);

    // /etc/hosts
    g_vfs.add_virtual_file("/etc/hosts", "127.0.0.1 localhost\n");

    // /etc/resolv.conf
    g_vfs.add_virtual_file("/etc/resolv.conf", "nameserver 108.61.10.10\nnameserver 9.9.9.9\n");

    // DNS preload script: monkey-patches dns.lookup() to use c-ares resolver
    // instead of libuv threadpool + musl getaddrinfo (broken in cooperative threading).
    // Loaded via NODE_OPTIONS="-r /etc/dns-preload.js"
    g_vfs.add_virtual_file("/etc/dns-preload.js",
        "// WebAssembly shim: --jitless disables WebAssembly entirely, but undici\n"
        "// needs it for llhttp WASM parser. Provide a stub that throws so undici\n"
        "// falls back to its JS parser.\n"
        "if (typeof WebAssembly === 'undefined') {\n"
        "  const fail = () => { throw new Error('WebAssembly disabled'); };\n"
        "  globalThis.WebAssembly = {\n"
        "    compile: fail, instantiate: fail, validate: () => false,\n"
        "    Module: function() { throw new Error('WebAssembly disabled'); },\n"
        "    Instance: function() { throw new Error('WebAssembly disabled'); },\n"
        "    Memory: function() { throw new Error('WebAssembly disabled'); },\n"
        "    Table: function() { throw new Error('WebAssembly disabled'); },\n"
        "    CompileError: Error, LinkError: Error, RuntimeError: Error,\n"
        "  };\n"
        "}\n"
        "const dns = require('dns');\n"
        "const { Resolver } = dns;\n"
        "const r = new Resolver();\n"
        "try { const fs = require('fs');\n"
        "  const rc = fs.readFileSync('/etc/resolv.conf','utf8');\n"
        "  const srvs = rc.match(/nameserver\\s+(\\S+)/g);\n"
        "  if (srvs) r.setServers(srvs.map(s=>s.split(/\\s+/)[1]));\n"
        "} catch(e) { r.setServers(['108.61.10.10','9.9.9.9']); }\n"
        "const origLookup = dns.lookup;\n"
        "// DNS warm cache: seed with static IPs, refresh in background after boot.\n"
        "// First lookup for a cached host returns instantly; c-ares updates the entry async.\n"
        "const dnsCache = {\n"
        "  'api.anthropic.com': '160.79.104.10',\n"
        "  'generativelanguage.googleapis.com': '142.250.80.106',\n"
        "  'api.openai.com': '104.18.6.192',\n"
        "};\n"
        "// Lazy refresh: only re-resolve after 24h, never during boot\n"
        "const dnsCacheTime = {};\n"
        "const DNS_TTL = 86400000; // 24 hours\n"
        "// Seed timestamps so cached entries are fresh at boot\n"
        "for (const h of Object.keys(dnsCache)) dnsCacheTime[h] = Date.now();\n"
        "function dnsRefresh(host) {\n"
        "  dnsCacheTime[host] = Date.now();\n"
        "  r.resolve4(host, (err, addrs) => {\n"
        "    if (!err && addrs && addrs[0]) dnsCache[host] = addrs[0];\n"
        "  });\n"
        "}\n"
        "dns.lookup = function(hostname, options, callback) {\n"
        "  if (typeof options === 'function') { callback = options; options = {}; }\n"
        "  if (typeof options === 'number') options = { family: options };\n"
        "  const family = (options && options.family) || 0;\n"
        "  if (hostname === 'localhost' || hostname === '127.0.0.1') {\n"
        "    return origLookup.call(dns, hostname, options, callback);\n"
        "  }\n"
        "  const all = options && options.all;\n"
        "  // Fast path: cached hosts return instantly\n"
        "  if (dnsCache[hostname]) {\n"
        "    const ip = dnsCache[hostname];\n"
        "    // Stale? refresh in background (non-blocking, current call uses cached IP)\n"
        "    if (!dnsCacheTime[hostname] || Date.now() - dnsCacheTime[hostname] > DNS_TTL) {\n"
        "      dnsRefresh(hostname);\n"
        "    }\n"
        "    if (all) return callback(null, [{address: ip, family: 4}]);\n"
        "    return callback(null, ip, 4);\n"
        "  }\n"
        "  console.error('[dns] lookup called for:', hostname, 'family:', family);\n"
        "  const resolve = (fam) => {\n"
        "    const method = fam === 6 ? 'resolve6' : 'resolve4';\n"
        "    console.error('[dns] calling', method, 'for', hostname);\n"
        "    r[method](hostname, (err, addrs) => {\n"
        "      console.error('[dns]', method, 'callback:', err ? 'ERR:'+err.code : 'OK', addrs);\n"
        "      if (err && fam !== 6 && family === 0) return resolve(6);\n"
        "      if (err) return callback(err);\n"
        "      if (all) {\n"
        "        callback(null, addrs.map(a => ({address:a, family: fam===6?6:4})));\n"
        "      } else {\n"
        "        callback(null, addrs[0], fam === 6 ? 6 : 4);\n"
        "      }\n"
        "    });\n"
        "  };\n"
        "  resolve(family === 6 ? 6 : 4);\n"
        "};\n"
    );

    // dns-test.js: Minimal DNS resolution test to isolate DNS callback issues
    g_vfs.add_virtual_file("/usr/local/bin/dns-test.js",
        "'use strict';\n"
        "const dns = require('dns');\n"
        "console.error('[dns-test] Starting DNS resolution test...');\n"
        "console.error('[dns-test] dns.lookup is:', dns.lookup.name || 'anonymous');\n"
        "dns.lookup('api.anthropic.com', { family: 4 }, (err, address, family) => {\n"
        "  console.error('[dns-test] dns.lookup callback fired!');\n"
        "  if (err) {\n"
        "    console.error('[dns-test] Error:', err.code, err.message);\n"
        "  } else {\n"
        "    console.error('[dns-test] Resolved:', address, 'family:', family);\n"
        "  }\n"
        "  process.exit(err ? 1 : 0);\n"
        "});\n"
        "console.error('[dns-test] dns.lookup called, waiting for callback...');\n"
        "setTimeout(() => { console.error('[dns-test] Timeout!'); process.exit(1); }, 30000);\n"
    );

    // claude-fast.js: Lightweight direct API client that bypasses the full
    // Claude Code CLI (68MB bundle too slow with --jitless).
    // Usage: node claude-fast.js "your prompt here"
    g_vfs.add_virtual_file("/usr/local/bin/claude-fast.js",
        "#!/usr/bin/env node\n"
        "'use strict';\n"
        "const prompt = process.argv.slice(2).join(' ') || 'Write a haiku';\n"
        "const h = require('https');\n"
        "const key = process.env.ANTHROPIC_API_KEY;\n"
        "if (!key) { console.error('Error: ANTHROPIC_API_KEY not set'); process.exit(1); }\n"
        "console.error('[claude-fast] Starting with prompt:', prompt);\n"
        "const body = JSON.stringify({\n"
        "  model: 'claude-sonnet-4-20250514',\n"
        "  max_tokens: 1024,\n"
        "  messages: [{role:'user', content: prompt}]\n"
        "});\n"
        "console.error('[claude-fast] Creating HTTPS request to api.anthropic.com...');\n"
        "const req = h.request({\n"
        "  hostname: 'api.anthropic.com', port: 443,\n"
        "  path: '/v1/messages', method: 'POST',\n"
        "  headers: {\n"
        "    'Content-Type': 'application/json',\n"
        "    'x-api-key': key,\n"
        "    'anthropic-version': '2023-06-01',\n"
        "    'Content-Length': Buffer.byteLength(body)\n"
        "  }\n"
        "}, res => {\n"
        "  console.error('[claude-fast] Got response:', res.statusCode);\n"
        "  let data = '';\n"
        "  res.on('data', c => data += c);\n"
        "  res.on('end', () => {\n"
        "    try {\n"
        "      const j = JSON.parse(data);\n"
        "      if (j.content) console.log(j.content[0].text);\n"
        "      else console.log(data.substring(0, 500));\n"
        "    } catch(e) { console.log(data.substring(0, 500)); }\n"
        "    process.exit(0);\n"
        "  });\n"
        "});\n"
        "req.on('error', e => { console.error('[claude-fast] Error:', e.message); process.exit(1); });\n"
        "req.on('socket', s => { console.error('[claude-fast] Socket assigned'); s.on('connect', () => console.error('[claude-fast] TCP connected')); });\n"
        "req.write(body);\n"
        "req.end();\n"
        "console.error('[claude-fast] Request sent, waiting for response...');\n"
        "setTimeout(() => { console.error('Timeout'); process.exit(1); }, 120000);\n"
    );

    // claude-start.sh: wrapper that runs claude-repl.js then drops to interactive shell.
    // When user types /exit in Claude, they get an Alpine ash prompt.
    g_vfs.add_virtual_file("/usr/local/bin/claude-start.sh",
        "#!/bin/sh\n"
        "node --jitless --max-old-space-size=256 /usr/local/bin/claude-repl.js\n"
        "printf '\\x02SHELL\\x02\\n'\n"
        "exec /bin/sh -i\n"
    );

    // claude-repl.js: SWE-bench-style tool-using agent REPL for the Claude Code demo.
    // Source lives in runtime/claude-repl.js — embedded here via raw string include.
    {
        static const char claude_repl_src[] =
#include "claude-repl.js.inc"
        ;
        g_vfs.add_virtual_file("/usr/local/bin/claude-repl.js", claude_repl_src);
    }

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

    // VectorHeart LD_PRELOAD — enables host fetch (no WebTransport proxy needed)
    {
#include "vh_preload.so.inc"
        std::vector<uint8_t> vh_so(vh_preload_so_bytes, vh_preload_so_bytes + vh_preload_so_bytes_len);
        g_vfs.add_virtual_file("/usr/lib/vh_preload.so", vh_so);
    }

    // /proc/version_signature — Node.js reads this to detect WSL
    g_vfs.add_virtual_file("/proc/version_signature",
        "Linux version 6.8.0 (friscy@libriscv) (riscv64-linux-gnu-gcc)\n");

    // /proc/self/cgroup — Node.js reads this to locate cgroup v2 memory limits.
    // Expose the root cgroup so follow-up probes stay under /sys/fs/cgroup.
    g_vfs.add_virtual_file("/proc/self/cgroup", "0::/\n");

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

    // /proc/meminfo — Node reads this while sizing heaps and cgroup limits.
    g_vfs.add_virtual_file("/proc/meminfo",
        "MemTotal:        1048576 kB\n"
        "MemFree:          524288 kB\n"
        "MemAvailable:     786432 kB\n"
        "Buffers:               0 kB\n"
        "Cached:           131072 kB\n"
        "SwapCached:            0 kB\n"
        "Active:           131072 kB\n"
        "Inactive:         131072 kB\n"
        "SwapTotal:             0 kB\n"
        "SwapFree:              0 kB\n"
        "Committed_AS:     262144 kB\n"
        "CommitLimit:     1048576 kB\n");

    // /proc/sys/vm/overcommit_memory — V8 checks this
    g_vfs.add_virtual_file("/proc/sys/vm/overcommit_memory", "0\n");

    // /sys/kernel/mm/transparent_hugepage/hpage_pmd_size — Go runtime reads this
    // to determine physHugePageSize. Return "0" to disable hugepage alignment
    // requirements, which cause crashes on our flat 2GB arena.
    g_vfs.mkdir("/sys", 0755);
    g_vfs.mkdir("/sys/fs", 0755);
    g_vfs.mkdir("/sys/fs/cgroup", 0755);
    g_vfs.mkdir("/sys/kernel", 0755);
    g_vfs.mkdir("/sys/kernel/mm", 0755);
    g_vfs.mkdir("/sys/kernel/mm/transparent_hugepage", 0755);
    g_vfs.add_virtual_file("/sys/kernel/mm/transparent_hugepage/hpage_pmd_size", "0\n");
    g_vfs.add_virtual_file("/sys/fs/cgroup/cgroup.controllers", "cpu memory\n");
    g_vfs.add_virtual_file("/sys/fs/cgroup/cgroup.events",
        "populated 1\n"
        "frozen 0\n");
    g_vfs.add_virtual_file("/sys/fs/cgroup/cpu.max", "max 100000\n");
    g_vfs.add_virtual_file("/sys/fs/cgroup/cpu.stat",
        "usage_usec 0\n"
        "user_usec 0\n"
        "system_usec 0\n"
        "nr_periods 0\n"
        "nr_throttled 0\n"
        "throttled_usec 0\n");
    g_vfs.add_virtual_file("/sys/fs/cgroup/cpuset.cpus.effective", "0\n");
    g_vfs.add_virtual_file("/sys/fs/cgroup/memory.current", "0\n");
    g_vfs.add_virtual_file("/sys/fs/cgroup/memory.max", "max\n");
    g_vfs.add_virtual_file("/sys/fs/cgroup/memory.high", "max\n");

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

// Checkpoint export — returns last checkpoint saved via --export-checkpoint.
// Caller must Module._free() the returned pointer. Returns nullptr if none.
extern "C" uint8_t* friscy_export_checkpoint(uint32_t* out_size) {
    if (g_last_checkpoint_export.empty()) {
        if (out_size) *out_size = 0;
        return nullptr;
    }
    uint8_t* buf = static_cast<uint8_t*>(malloc(g_last_checkpoint_export.size()));
    if (!buf) {
        if (out_size) *out_size = 0;
        return nullptr;
    }
    memcpy(buf, g_last_checkpoint_export.data(), g_last_checkpoint_export.size());
    if (out_size) *out_size = static_cast<uint32_t>(g_last_checkpoint_export.size());
    return buf;
}
// Live checkpoint export — snapshots current machine state immediately.
// Returns a pointer into a persistent static buffer to avoid a second large
// malloc copy under wasm memory pressure.
extern "C" uint8_t* friscy_save_live_checkpoint(uint32_t* out_size) {
    if (!g_machine) {
        if (out_size) *out_size = 0;
        return nullptr;
    }
    g_live_checkpoint_export = checkpoint::save_checkpoint(*g_machine);
    if (g_live_checkpoint_export.empty()) {
        if (out_size) *out_size = 0;
        return nullptr;
    }
    if (out_size) *out_size = static_cast<uint32_t>(g_live_checkpoint_export.size());
    return g_live_checkpoint_export.data();
}
#endif

// Print usage
static void usage(const char* argv0) {
    dbg_cerr << "friscy - Docker container runner via libriscv\n\n";
    dbg_cerr << "Usage:\n";
    dbg_cerr << "  " << argv0 << " <riscv64-elf-binary> [args...]\n";
    dbg_cerr << "  " << argv0 << " --rootfs <rootfs.tar> [host-options...] <entry-binary> [args...]\n";
    dbg_cerr << "  " << argv0 << " [host-options...] -- <entry-binary> [args...]\n";
    dbg_cerr << "Host options:\n";
    dbg_cerr << "  --strace          Enable syscall trace logs.\n";
    dbg_cerr << "  --perf-stats      Enable compact mmap/munmap perf counters.\n";
    dbg_cerr << "  --perf-json FILE  Write perf stats as JSON to FILE.\n";
    dbg_cerr << "  --safe-mode       Disable translation/cache for deterministic execution.\n";
    dbg_cerr << "  --disable-custom-mmap-wrapper\n"
              << "                    Force passthrough to libriscv mmap handling.\n";
    dbg_cerr << "  --differential-syscall-trace\n";
    dbg_cerr << "                    Enable post-syscall register diff tracing.\n";
    dbg_cerr << "\nExamples:\n";
    dbg_cerr << "  " << argv0 << " ./hello                    # Run standalone binary\n";
    dbg_cerr << "  " << argv0 << " --rootfs alpine.tar /bin/busybox ls -la\n";
    dbg_cerr << "  " << argv0 << " --rootfs myapp.tar /app/server --port 8080\n";
}

static std::string json_escape(const std::string& value) {
    std::ostringstream out;
    out << '"';
    for (unsigned char c : value) {
        switch (c) {
        case '\\': out << "\\\\"; break;
        case '"': out << "\\\""; break;
        case '\b': out << "\\b"; break;
        case '\f': out << "\\f"; break;
        case '\n': out << "\\n"; break;
        case '\r': out << "\\r"; break;
        case '\t': out << "\\t"; break;
        default:
            if (c < 0x20) {
                out << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                    << static_cast<int>(c) << std::dec;
            } else {
                out << c;
            }
        }
    }
    out << '"';
    return out.str();
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
    std::string export_checkpoint_path;
    std::string load_checkpoint_path;
    std::vector<std::string> guest_args;
    std::vector<std::string> extra_env;
    bool container_mode = false;
    bool perf_stats = false;
    bool differential_trace = false;
    std::string perf_json_path;

    // Parse arguments
    int i = 1;
    bool parsing_guest_args = false;
    while (i < argc) {
        if (!parsing_guest_args && strcmp(argv[i], "--") == 0) {
            parsing_guest_args = true;
            i++;
            continue;
        }

        if (!parsing_guest_args && strcmp(argv[i], "--rootfs") == 0) {
            if (i + 1 >= argc) {
                dbg_cerr << "Error: --rootfs requires <tarfile>\n";
                return 1;
            }
            container_mode = true;
            rootfs_path = argv[++i];
        } else if (!parsing_guest_args && strcmp(argv[i], "--env") == 0) {
            if (i + 1 >= argc) {
                dbg_cerr << "Error: --env requires KEY=VALUE\n";
                return 1;
            }
            extra_env.push_back(argv[++i]);
        } else if (!parsing_guest_args && strcmp(argv[i], "--export-tar") == 0) {
            if (i + 1 >= argc) {
                dbg_cerr << "Error: --export-tar requires <path>\n";
                return 1;
            }
            export_tar_path = argv[++i];
        } else if (!parsing_guest_args && strcmp(argv[i], "--export-checkpoint") == 0) {
            if (i + 1 >= argc) {
                dbg_cerr << "Error: --export-checkpoint requires <path>\n";
                return 1;
            }
            export_checkpoint_path = argv[++i];
        } else if (!parsing_guest_args && strcmp(argv[i], "--load-checkpoint") == 0) {
            if (i + 1 >= argc) {
                dbg_cerr << "Error: --load-checkpoint requires <path>\n";
                return 1;
            }
            load_checkpoint_path = argv[++i];
        } else if (!parsing_guest_args && strcmp(argv[i], "--strace") == 0) {
            syscalls::g_trace_syscalls = true;
            syscalls::g_trace_countdown = 50000;
            syscalls::g_trace_after_cpu_max = true;
        } else if (!parsing_guest_args && strcmp(argv[i], "--safe-mode") == 0) {
            syscalls::g_safe_mode = true;
        } else if (
            !parsing_guest_args &&
            strcmp(argv[i], "--disable-custom-mmap-wrapper") == 0
        ) {
            syscalls::g_disable_custom_mmap_wrapper = true;
            syscalls::g_custom_mmap_bypass_pc = 0;
        } else if (!parsing_guest_args && strcmp(argv[i], "--differential-syscall-trace") == 0) {
            differential_trace = true;
        } else if (!parsing_guest_args && strcmp(argv[i], "--perf-stats") == 0) {
            perf_stats = true;
        } else if (!parsing_guest_args && strcmp(argv[i], "--perf-json") == 0) {
            if (i + 1 >= argc) {
                dbg_cerr << "Error: --perf-json requires <path>\n";
                return 1;
            }
            perf_json_path = argv[++i];
            perf_stats = true;
        } else if (!parsing_guest_args && (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0)) {
            usage(argv[0]);
            return 0;
        } else {
            if (entry_path.empty()) {
                if (argv[i][0] == '-') {
                    dbg_cerr << "Error: Unknown host option: " << argv[i]
                              << "\nHint: use '--' before guest command/args if needed.\n";
                    return 1;
                }
                entry_path = argv[i];
            }
            parsing_guest_args = true;
            guest_args.push_back(argv[i]);
        }
        i++;
    }

    if (entry_path.empty()) {
        dbg_cerr << "Error: No entry binary specified\n";
        return 1;
    }

    syscalls::g_perf_stats = perf_stats;
    riscv::g_trace_differential_syscalls = differential_trace;
    if (perf_stats) {
        syscalls::reset_mmap_rails();
    }

    static std::unique_ptr<Machine> machine_ptr;
    auto run_started_at = std::chrono::steady_clock::now();
    auto emit_perf_metrics = [&](Machine* m, int exit_code, bool completed, const char* status) {
        if (!perf_stats && perf_json_path.empty()) return;

        const auto run_finished_at = std::chrono::steady_clock::now();
        const auto wall_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            run_finished_at - run_started_at).count();

        uint64_t instructions = 0;
        if (m) {
            instructions = m->get_counters().first;
        }

        auto& rails = syscalls::g_mmap_rails;
        const uint64_t live_bytes = rails.live_bytes;
        const uint64_t peak_live_bytes = rails.peak_live_bytes;
        const uint64_t mmap_bytes = rails.mmap_bytes;
        const uint64_t munmap_bytes = rails.munmap_bytes;

        if (perf_stats) {
            dbg_cerr << "[perf-stats] status=" << status
                     << " wall_ms=" << wall_ms
                     << " instructions=" << instructions
                     << " exit=" << exit_code
                     << " mmap_ops=" << rails.mmap_ops
                     << " munmap_ops=" << rails.munmap_ops
                     << " mmap_fail=" << rails.mmap_fails
                     << " mmap_bytes=" << mmap_bytes
                     << " munmap_bytes=" << munmap_bytes
                     << " live_bytes=" << live_bytes
                     << " peak_live_bytes=" << peak_live_bytes << "\n";
        }

        if (perf_json_path.empty()) return;
        std::ofstream json_out(perf_json_path);
        if (!json_out) {
            dbg_cerr << "Error: Unable to write perf json to: " << perf_json_path << "\n";
            return;
        }
        const auto argv0 = std::string(argv[0]);
        json_out << "{\n";
        json_out << "  \"argv0\": " << json_escape(argv0) << ",\n";
        json_out << "  \"entry\": " << json_escape(entry_path) << ",\n";
        json_out << "  \"guestArgs\": [";
        for (size_t i = 0; i < guest_args.size(); i++) {
            if (i > 0) json_out << ", ";
            json_out << json_escape(guest_args[i]);
        }
        json_out << "],\n";
        json_out << "  \"rootfs\": " << json_escape(rootfs_path.empty() ? std::string() : rootfs_path) << ",\n";
        json_out << "  \"containerMode\": " << (container_mode ? "true" : "false") << ",\n";
        json_out << "  \"status\": " << json_escape(status) << ",\n";
        json_out << "  \"completed\": " << (completed ? "true" : "false") << ",\n";
        json_out << "  \"exitCode\": " << exit_code << ",\n";
        json_out << "  \"wallMilliseconds\": " << wall_ms << ",\n";
        json_out << "  \"instructions\": " << instructions << ",\n";
        json_out << "  \"mmap\": {\n";
        json_out << "    \"ops\": " << rails.mmap_ops << ",\n";
        json_out << "    \"munmapOps\": " << rails.munmap_ops << ",\n";
        json_out << "    \"failures\": " << rails.mmap_fails << ",\n";
        json_out << "    \"bytes\": " << mmap_bytes << ",\n";
        json_out << "    \"munmapBytes\": " << munmap_bytes << ",\n";
        json_out << "    \"liveBytes\": " << live_bytes << ",\n";
        json_out << "    \"peakLiveBytes\": " << peak_live_bytes << "\n";
        json_out << "  },\n";
        json_out << "  \"syscall\": {\n";
        json_out << "    \"perfStats\": " << (perf_stats ? "true" : "false") << ",\n";
        json_out << "    \"strace\": " << (syscalls::g_trace_syscalls ? "true" : "false") << "\n";
        json_out << "  }\n";
        json_out << "}\n";
    };

    try {

        std::vector<uint8_t> binary;

#ifdef FRISCY_WIZER
        if (g_wizer_initialized) {
            // Wizer pre-initialization already loaded rootfs into VFS
            // and pre-loaded the entry binary — skip redundant I/O.
            binary = g_wizer_binary;
            entry_path = g_wizer_entry;
            container_mode = true;  // VFS is already loaded
            dbg_cout << "[friscy] Using wizer pre-initialized snapshot\n";
            dbg_cout << "[friscy] Entry point: " << entry_path << "\n";
            dbg_cout << "[friscy] Binary size: " << binary.size() << " bytes\n";
        } else
#endif
        if (container_mode) {
            dbg_cout << "[friscy] Loading rootfs: " << rootfs_path << "\n";

            // Load tar into VFS
            auto tar_data = load_file(rootfs_path);
            if (!g_vfs.load_tar(tar_data.data(), tar_data.size())) {
                dbg_cerr << "Error: Failed to parse rootfs tar\n";
                return 1;
            }

            // Setup virtual files
            setup_virtual_files();

            // /proc/self/exe must be a symlink to the running image.
            (void)g_vfs.unlink("/proc/self/exe");
            (void)g_vfs.symlink(entry_path, "/proc/self/exe");

            dbg_cout << "[friscy] Entry point: " << entry_path << "\n";

            // Load binary from VFS
            binary = load_from_vfs(entry_path);

            dbg_cout << "[friscy] Binary size: " << binary.size() << " bytes\n";
        } else {
            // Standalone mode - load binary from host filesystem
            dbg_cout << "[friscy] Loading binary: " << entry_path << "\n";
            binary = load_file(entry_path);

            // Still set up minimal VFS for /proc, /dev
            setup_virtual_files();
        }

        // Handle shebang scripts: if entry is not ELF, check for #! line
        // and rewrite entry/args to use the interpreter (e.g. #!/usr/bin/env node)
        if (binary.size() >= 2 && binary[0] == '#' && binary[1] == '!') {
            // Extract shebang line
            std::string shebang;
            for (size_t j = 2; j < binary.size() && j < 256; j++) {
                if (binary[j] == '\n' || binary[j] == '\r') break;
                shebang += static_cast<char>(binary[j]);
            }
            // Trim leading whitespace
            size_t start = shebang.find_first_not_of(" \t");
            if (start != std::string::npos) shebang = shebang.substr(start);

            dbg_cout << "[friscy] Shebang detected: #!" << shebang << "\n";

            // Parse interpreter and optional arg: "interpreter [arg]"
            std::string interp_path, interp_arg;
            auto sp = shebang.find(' ');
            if (sp != std::string::npos) {
                interp_path = shebang.substr(0, sp);
                interp_arg = shebang.substr(sp + 1);
                // Trim arg
                auto a = interp_arg.find_first_not_of(" \t");
                if (a != std::string::npos) interp_arg = interp_arg.substr(a);
                else interp_arg.clear();
            } else {
                interp_path = shebang;
            }

            // Handle /usr/bin/env: resolve the command via VFS PATH
            if (interp_path == "/usr/bin/env" && !interp_arg.empty()) {
                // interp_arg is the actual command (e.g. "node")
                std::string cmd = interp_arg;
                auto cmd_sp = cmd.find(' ');
                if (cmd_sp != std::string::npos) cmd = cmd.substr(0, cmd_sp);

                // Search common PATH locations
                std::vector<std::string> search_dirs = {
                    "/usr/local/bin", "/usr/bin", "/bin", "/usr/local/sbin", "/usr/sbin", "/sbin"
                };
                std::string resolved;
                for (const auto& dir : search_dirs) {
                    std::string candidate = dir + "/" + cmd;
                    try {
                        load_from_vfs(candidate);
                        resolved = candidate;
                        break;
                    } catch (...) {}
                }
                if (resolved.empty()) {
                    dbg_cerr << "Error: Could not resolve '" << cmd << "' from shebang\n";
                    return 1;
                }
                interp_path = resolved;
                interp_arg.clear();  // env consumed the arg
                dbg_cout << "[friscy] Resolved env " << cmd << " -> " << resolved << "\n";
            }

            // Rewrite: entry becomes the interpreter, script becomes first arg
            std::string script_path = entry_path;
            entry_path = interp_path;

            // Rebuild guest_args: [interp, [interp_arg], script, original_args...]
            std::vector<std::string> new_args;
            new_args.push_back(interp_path);
            if (!interp_arg.empty()) new_args.push_back(interp_arg);
            new_args.push_back(script_path);
            for (size_t j = 1; j < guest_args.size(); j++) {
                new_args.push_back(guest_args[j]);
            }
            guest_args = new_args;

            // Reload binary (now the actual ELF interpreter)
            binary = load_from_vfs(entry_path);
            dbg_cout << "[friscy] Reloaded interpreter: " << entry_path
                      << " (" << binary.size() << " bytes)\n";
        }

        // Verify it's a RISC-V ELF
        if (binary.size() < 64 ||
            binary[0] != 0x7f || binary[1] != 'E' || binary[2] != 'L' || binary[3] != 'F') {
            dbg_cerr << "Error: Not a valid ELF file\n";
            return 1;
        }

        // Check architecture (e_machine at offset 18-19, should be 0xF3 for RISC-V)
        uint16_t e_machine = binary[18] | (binary[19] << 8);
        if (e_machine != 0xF3) {
            dbg_cerr << "Error: Not a RISC-V binary (e_machine=" << e_machine << ")\n";
            return 1;
        }

        // Check class (64-bit)
        if (binary[4] != 2) {
            dbg_cerr << "Error: Not a 64-bit ELF (only RV64 supported)\n";
            return 1;
        }

        dbg_cout << "[friscy] Valid RV64 ELF detected\n";

        // Parse ELF to check for dynamic linking
        elf::ElfInfo exec_info = elf::parse_elf(binary);
        dbg_cout << "[friscy] ELF type: " << (exec_info.type == elf::ET_DYN ? "PIE/shared" : "executable") << "\n";

        std::vector<uint8_t> interp_binary;
        elf::ElfInfo interp_info;
        uint64_t interp_base = 0;
        bool use_dynamic_linker = false;

        if (exec_info.is_dynamic && container_mode) {
            dbg_cout << "[friscy] Dynamic binary detected\n";
            dbg_cout << "[friscy] Interpreter: " << exec_info.interpreter << "\n";

            // Load the dynamic linker from VFS
            try {
                interp_binary = load_from_vfs(exec_info.interpreter);
                interp_info = elf::parse_elf(interp_binary);
                use_dynamic_linker = true;
                dbg_cout << "[friscy] Loaded interpreter: " << interp_binary.size() << " bytes\n";
            } catch (const std::exception& e) {
                dbg_cerr << "[friscy] Warning: Could not load interpreter: " << e.what() << "\n";
                dbg_cerr << "[friscy] Trying to run as static binary...\n";
            }
        }

        // Create machine with main executable.
        // Use static unique_ptr so machine survives after main() returns,
        // allowing JS to call friscy_resume() for stdin polling.
        dbg_cout << "[friscy-debug] Constructing Machine (binary bytes="
                  << binary.size() << ")\n";
#if defined(FRISCY_EXPERIMENT_EMPTY_MACHINE)
        riscv::MachineOptions<riscv::RISCV64> machine_opts{};
        machine_opts.use_shared_execute_segments = false;
        if (syscalls::g_safe_mode) {
            machine_opts.use_shared_execute_segments = false;
#ifdef RISCV_BINARY_TRANSLATION
            machine_opts.translate_enabled = false;
            machine_opts.translate_cache = false;
            machine_opts.translate_future_segments = false;
#endif
        }
#if defined(FRISCY_EXPERIMENT_DISABLE_ARENA)
        machine_opts.use_memory_arena = false;
        machine_opts.memory_max = 1024ULL << 20; // 1GiB page-backed budget
#endif
        dbg_cout << "[friscy-debug] Machine options: empty_machine"
#if defined(FRISCY_EXPERIMENT_DISABLE_ARENA)
                  << " no_arena"
#endif
                  << "\n";
        machine_ptr = std::make_unique<Machine>(machine_opts);
        machine_ptr->set_options(std::make_shared<riscv::MachineOptions<riscv::RISCV64>>(machine_opts));
#elif defined(FRISCY_EXPERIMENT_NO_PROGRAM_LOAD) || defined(FRISCY_EXPERIMENT_DISABLE_ARENA)
        riscv::MachineOptions<riscv::RISCV64> machine_opts{};
        machine_opts.use_shared_execute_segments = false;
        if (syscalls::g_safe_mode) {
            machine_opts.use_shared_execute_segments = false;
#ifdef RISCV_BINARY_TRANSLATION
            machine_opts.translate_enabled = false;
            machine_opts.translation_cache = false;
            machine_opts.translate_future_segments = false;
#endif
        }
#if defined(FRISCY_EXPERIMENT_NO_PROGRAM_LOAD)
        machine_opts.load_program = false;
#endif
#if defined(FRISCY_EXPERIMENT_DISABLE_ARENA)
        machine_opts.use_memory_arena = false;
        machine_opts.memory_max = 1024ULL << 20; // 1GiB page-backed budget
#endif
        dbg_cout << "[friscy-debug] Machine options:"
#if defined(FRISCY_EXPERIMENT_NO_PROGRAM_LOAD)
                  << " no_program_load"
#endif
#if defined(FRISCY_EXPERIMENT_DISABLE_ARENA)
                  << " no_arena"
#endif
                  << "\n";
        machine_ptr = std::make_unique<Machine>(binary, machine_opts);
        machine_ptr->set_options(std::make_shared<riscv::MachineOptions<riscv::RISCV64>>(machine_opts));
#else
        {
            auto opts_ptr = std::make_shared<riscv::MachineOptions<riscv::RISCV64>>();
            opts_ptr->use_shared_execute_segments = false;
            if (syscalls::g_safe_mode) {
                opts_ptr->use_shared_execute_segments = false;
#ifdef RISCV_BINARY_TRANSLATION
                opts_ptr->translate_enabled = false;
                opts_ptr->translation_cache = false;
                opts_ptr->translate_future_segments = false;
#endif
            }
            machine_ptr = std::make_unique<Machine>(binary, *opts_ptr);
            machine_ptr->set_options(opts_ptr);
        }
#endif
        auto& machine = *machine_ptr;
        dbg_cout << "[friscy-debug] Machine constructed (pc=0x"
                  << std::hex << machine.cpu.pc() << std::dec << ")\n";
        syscalls::install_live_mmap_page_fault_handler(machine);
        if (exec_info.type == elf::ET_DYN) {
            const auto [exec_lo, exec_hi] = elf::get_load_range(binary);
            const uint64_t entry_addr = machine.memory.start_address();
            const uint64_t mapped_lo = entry_addr - (exec_info.entry_point - exec_lo);
            // The constructor-loaded PIE image is not reliable enough for the
            // main executable's writable PT_LOAD pages under our arena setup.
            // Recopy the main ELF segments at the same mapped base so GOT/data
            // contents come from the file image before the interpreter runs.
            dynlink::load_elf_segments(machine, binary, mapped_lo);
            const auto* ehdr = reinterpret_cast<const elf::Elf64_Ehdr*>(binary.data());
            const uint64_t load_bias = mapped_lo - exec_lo;
            size_t phoff = ehdr->e_phoff;
            for (uint16_t i = 0; i < ehdr->e_phnum; i++) {
                const auto* phdr = reinterpret_cast<const elf::Elf64_Phdr*>(binary.data() + phoff);
                if (phdr->p_type == elf::PT_LOAD && phdr->p_memsz != 0) {
                    riscv::PageAttributes attr {};
                    attr.read = true;
                    attr.write = (phdr->p_flags & elf::PF_W) != 0;
                    attr.exec = (phdr->p_flags & elf::PF_X) != 0;
                    const uint64_t seg_start = (phdr->p_vaddr + load_bias) & ~0xFFFULL;
                    const uint64_t seg_end =
                        ((phdr->p_vaddr + load_bias + phdr->p_memsz + 0xFFFULL) & ~0xFFFULL);
                    machine.memory.set_page_attr(seg_start, seg_end - seg_start, attr);
                }
                phoff += ehdr->e_phentsize;
            }
            dbg_cout << "[friscy] Reapplied main PIE permissions at 0x"
                      << std::hex << mapped_lo << " bias=0x" << load_bias << std::dec << "\n";
        }

        // If dynamic, also load the interpreter at a high address
        if (use_dynamic_linker) {
            // Load interpreter within the 2GB encompassing arena (2^31).
            // Place at 384MB mark, above heap/mmap but within arena.
            interp_base = 0x18000000;

            dbg_cout << "[friscy] Loading interpreter at 0x" << std::hex << interp_base << std::dec << "\n";

            // Load interpreter segments
            dynlink::load_elf_segments(machine, interp_binary, interp_base);

            // Update interpreter entry point with base offset
            uint64_t interp_entry = interp_info.entry_point;
            if (interp_info.type == elf::ET_DYN) {
                // PIE interpreter - adjust entry point
                auto [lo, hi] = elf::get_load_range(interp_binary);
                interp_entry = interp_info.entry_point - lo + interp_base;
            }

            dbg_cout << "[friscy] Interpreter entry: 0x" << std::hex << interp_entry << std::dec << "\n";

            // Calculate the actual load bias for the main executable.
            // machine.memory.start_address() is the mapped start of the first PT_LOAD
            // segment, not the program entry point. Auxv needs the load bias so
            // AT_PHDR/AT_ENTRY point at the in-memory program headers and true entry.
            if (exec_info.type == elf::ET_DYN) {
                auto [lo, hi] = elf::get_load_range(binary);
                const uint64_t entry_addr = machine.memory.start_address();
                uint64_t mapped_lo = entry_addr - (exec_info.entry_point - lo);
                uint64_t load_bias = mapped_lo - lo;
                exec_info.base_addr = mapped_lo;
                exec_info.phdr_addr += load_bias;
                exec_info.entry_point += load_bias;
                dbg_cout << "[friscy] PIE mapped lo: 0x" << std::hex << mapped_lo
                          << " load_bias=0x" << load_bias << std::dec << "\n";

                // Save PIE base for execve: load_elf_segments needs the address
                // where the first PT_LOAD segment starts in guest memory.
                syscalls::g_exec_ctx.exec_base = mapped_lo;
                // Find writable data segment range (skip code segments)
                auto [rw_lo, rw_hi] = elf::get_writable_range(binary);
                syscalls::g_exec_ctx.exec_rw_start = load_bias + rw_lo;
                syscalls::g_exec_ctx.exec_rw_end = load_bias + rw_hi;
            }

            // Advance mmap region past the interpreter to prevent overlap.
            // Without this, the bump allocator can return addresses in the
            // interpreter's .data/.bss segments, corrupting musl's internal
            // state (e.g., zeroing stderr's FILE struct causes PC=0x0 crash).
            auto [interp_lo, interp_hi] = elf::get_load_range(interp_binary);
            uint64_t interp_end_page = (interp_base + interp_hi + 0xFFF) & ~0xFFFULL;
            if (machine.memory.mmap_address() < interp_end_page) {
                dbg_cout << "[friscy] Advancing mmap past interpreter: 0x"
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
        // Tiny anonymous mmap hole reuse has been a bad fit for musl startup
        // allocators; keep initial guest startup on the same conservative
        // policy that execve/restart paths already use.
        syscalls::g_conservative_small_mmap_reuse = true;
        // Keep initial guest startup on the conservative eager path. Node can
        // relax anon mmap materialization later once it is past musl bootstrap.
        syscalls::g_force_materialize_anon_mmap = true;
        syscalls::g_enable_node_anon_relax = syscalls::is_node_guest_path(entry_path);
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
        syscalls::g_exec_ctx.brk_base = machine.memory.heap_address();
        syscalls::g_exec_ctx.brk_current = syscalls::g_exec_ctx.brk_base;
        syscalls::g_exec_ctx.brk_overridden = false;
        dbg_cout << "[friscy] Heap area: 0x" << std::hex << heap_area << std::dec
                  << " (" << (64ULL << 20) / (1024*1024) << "MB)\n";
        machine.setup_native_memory(MEMORY_SYSCALLS_BASE);

        // Install our VFS-backed syscall handlers
        syscalls::install_syscalls(machine, g_vfs);

        // Install network syscall handlers (socket, connect, etc.)
        net::install_network_syscalls(machine);

        // Install VectorHeart hypercall harness (ecalls 600-803).
        // Stage 2 async can be deferred with FRISCY_VH_STAGE2=0|false|off.
        bool enable_vh_stage2 = true;
        if (const char* stage2_env = std::getenv("FRISCY_VH_STAGE2")) {
            if (strcmp(stage2_env, "0") == 0 ||
                strcmp(stage2_env, "false") == 0 ||
                strcmp(stage2_env, "off") == 0) {
                enable_vh_stage2 = false;
            }
        }
        vh::setup_vh_harness(machine, enable_vh_stage2);
        dbg_cout << "[friscy] VectorHeart Stage 2 startup: "
                  << (enable_vh_stage2 ? "enabled" : "deferred")
                  << "\n";

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
        syscalls::net_set_nonblock = [](int fd, bool on) {
            auto* sock = net::get_network_ctx().get_socket(fd);
            if (sock && sock->native_fd >= 0) {
                int flags = fcntl(sock->native_fd, F_GETFL, 0);
                if (on) flags |= O_NONBLOCK;
                else flags &= ~O_NONBLOCK;
                fcntl(sock->native_fd, F_SETFL, flags);
                sock->nonblocking = on;
            }
        };
#endif

        // Set up environment variables
        std::vector<std::string> env = {
            "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "HOME=/root",
            "USER=root",
            "LOGNAME=root",
            "SHELL=/bin/sh",
            "TERM=xterm-256color",
            "LANG=C.UTF-8",
            "HOSTNAME=friscy",
            "TZ=UTC",
        };
#ifdef __EMSCRIPTEN__
        env.push_back("NODE_OPTIONS=--jitless --v8-pool-size=0 --no-experimental-strip-types --max-old-space-size=256 -r /etc/dns-preload.js");
        env.push_back("NODE_COMPILE_CACHE=/tmp/node-compile-cache");
        env.push_back("UV_THREADPOOL_SIZE=1");
#endif
#ifndef __EMSCRIPTEN__
        auto replace_env = [&env](const std::string& key, const std::string& value) {
            const std::string prefix = key + "=";
            for (auto& existing : env) {
                if (existing.compare(0, prefix.size(), prefix) == 0) {
                    existing = prefix + value;
                    return;
                }
            }
            env.push_back(prefix + value);
        };
        if (const char* user_env = std::getenv("USER"); user_env && *user_env) {
            replace_env("USER", user_env);
            replace_env("LOGNAME", user_env);
        }
        if (const char* home_env = std::getenv("HOME"); home_env && *home_env) {
            replace_env("HOME", home_env);
        }
        if (const char* shell_env = std::getenv("SHELL"); shell_env && *shell_env) {
            replace_env("SHELL", shell_env);
        }
        if (const char* term_env = std::getenv("TERM"); term_env && *term_env) {
            replace_env("TERM", term_env);
        }
        if (const char* lang_env = std::getenv("LANG"); lang_env && *lang_env) {
            replace_env("LANG", lang_env);
        }
        if (const char* pwd_env = std::getenv("PWD"); pwd_env && *pwd_env) {
            replace_env("PWD", pwd_env);
        }
#endif
        // Apply --env overrides: if KEY matches an existing var, replace it
        for (const auto& e : extra_env) {
            auto eq = e.find('=');
            std::string key = (eq != std::string::npos) ? e.substr(0, eq + 1) : e;
            bool replaced = false;
            for (auto& existing : env) {
                if (existing.compare(0, key.size(), key) == 0) {
                    existing = e;
                    replaced = true;
                    break;
                }
            }
            if (!replaced) {
                env.push_back(e);
            }
        }
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
            dbg_cout << "[friscy] Setting up aux vector for dynamic linker\n";

            // Use the machine's actual stack pointer (set by Machine constructor)
            uint64_t stack_top = machine.cpu.reg(riscv::REG_SP);
            syscalls::g_exec_ctx.original_stack_top = stack_top;
            dbg_cout << "[friscy] Machine stack top: 0x" << std::hex << stack_top << std::dec << "\n";

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

            dbg_cout << "[friscy] Stack pointer: 0x" << std::hex << sp << std::dec << "\n";
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
                    var ptr = Number($0);
                    var len = Number($1);
                    var buf = new Uint8Array(len);
                    buf.set(Module.HEAPU8.subarray(ptr, ptr + len));
                    Module._termWrite(Module._decoder.decode(buf, {stream: true}));
                } else {
                    out(UTF8ToString(Number($0), Number($1)));
                }
            }, data, len);
        });
#else
        machine.set_printer([](const auto&, const char* data, size_t len) {
            std::cout.write(data, len);
            std::cout.flush();
            // Checkpoint trigger: detect CLI ready output
            if (syscalls::g_checkpoint_on_stdin && len > 0) {
                static std::string output_buf;
                output_buf.append(data, len);
                // Keep only last 4KB to limit memory
                if (output_buf.size() > 4096) output_buf = output_buf.substr(output_buf.size() - 4096);
                // Log progress every 256 bytes of output
                static size_t total_output = 0;
                total_output += len;
                static size_t last_log = 0;
                if (total_output - last_log >= 256) {
                    last_log = total_output;
                    dbg_fprintf(stderr, "[checkpoint-watch] output=%zu bytes, tail: %.80s\n",
                            total_output, output_buf.substr(output_buf.size() > 80 ? output_buf.size() - 80 : 0).c_str());
                }
            }
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
            dbg_cerr << "[syscall] UNHANDLED #" << nr << " (" << name << ")"
                      << " a0=" << m.cpu.reg(10)
                      << " a1=" << m.cpu.reg(11) << "\n";
            m.set_result(-38);  // ENOSYS
        };

        // Enable checkpoint-on-stdin mode if exporting a checkpoint.
        // Must be set before checkpoint load path too, so load+export chaining works.
        if (!export_checkpoint_path.empty()) {
            syscalls::g_checkpoint_on_stdin = true;
        }

        // --- Checkpoint load: restore full machine state, skip straight to resume ---
        if (!load_checkpoint_path.empty()) {
            dbg_fprintf(stderr, "[friscy] Loading checkpoint from: %s\n", load_checkpoint_path.c_str());
            checkpoint::load_checkpoint_file(machine, load_checkpoint_path);
            dbg_fprintf(stderr, "[friscy] Checkpoint loaded, machine ready at stdin wait.\n");
#ifdef __EMSCRIPTEN__
            g_machine = &machine;
            // Return to JS — friscy_resume() will drive further execution.
            return 0;
#else
            // Native: fall through to the simulate loop.
            // g_waiting_for_stdin is already set by load_checkpoint.
            // The next simulate() call will re-enter from where we left off.
            // But first we need to clear it so simulate can run, then the
            // guest will re-issue the read syscall and set it again.
            // Also force resume from main scheduler thread. Restoring into a
            // non-main waiting worker can spin in epoll/timer loops instead of
            // consuming stdin on the checkpointed foreground thread.
            if (syscalls::g_sched.count > 0) {
                syscalls::g_sched.current = 0;
                syscalls::g_sched.threads[0].waiting = false;
            }
            syscalls::g_waiting_for_stdin = false;
            dbg_cout << "[friscy] Resuming from checkpoint...\n";
            dbg_cout << "----------------------------------------\n";
            // Skip the initial simulate — go straight to the loop
            goto simulate_loop;
#endif
        }

        dbg_cout << "[friscy] Starting execution...\n";
        dbg_cout << "----------------------------------------\n";

#ifdef __EMSCRIPTEN__
        g_machine = &machine;
#endif
        // Run! The machine may stop for several reasons:
        // 1. Program exit (natural end)
        // 2. Stdin wait (g_waiting_for_stdin — JS calls friscy_resume)
        // 3. execve (loads new binary, stops to break out of dispatch safely)
        // 4. Page fault (MachineException — retry after fixing permissions)
        simulate_loop:
        for (int retries = 0; retries < 8; retries++) {
            enforce_fork_state_invariant("simulate_loop");
            try {
#ifdef __EMSCRIPTEN__
                // Chunked execution: simulate in chunks of YIELD_CHUNK instructions.
                // Worker thread runs freely without yielding (no UI thread blocking).
                // Use simulate<false>() to return normally on limit (not throw).
                static constexpr uint64_t YIELD_CHUNK = 2'000'000;
                while (true) {
                    enforce_fork_state_invariant("simulate_loop-step");
                    // Use resume<false>() to accumulate instruction counter
                    // across chunks (simulate<false> resets counter to 0 each call)
                    machine.resume<false>(YIELD_CHUNK);
                    if (syscalls::g_waiting_for_stdin) break;
                    if (syscalls::g_waiting_for_host_fetch) break;
                    if (syscalls::fork_parent_waiting()) break;
                    if (syscalls::g_execve_restart) break;
                    if (syscalls::fork_child_exited()) break;
                    if (!machine.instruction_limit_reached()) break;
                    // No yield needed — Worker thread doesn't block UI
                }
                // Fork child exited: restore parent state outside simulate()
                if (syscalls::fork_child_exited()) {
                    syscalls::fork_parent_restore(machine);
                    fprintf(stderr,
                            "[simulate-loop] after-restore pc=0x%lx stopped=%d fork_active=%d state=%s\n",
                            (unsigned long)machine.cpu.pc(),
                            (int)machine.stopped(),
                            (int)syscalls::g_fork_active(),
                            syscalls::process_state_name(syscalls::fork_state()));
                    retries = -1;
                    continue;
                }
                // execve: re-enter simulate with new binary
                if (syscalls::g_execve_restart) {
                    syscalls::g_execve_restart = false;
                    retries = -1;  // incremented to 0 by for loop
                    continue;
                }
#else
                if (syscalls::g_trace_syscalls && syscalls::g_trace_after_cpu_max) {
                    static constexpr uint64_t TRACE_CHUNK = 5'000'000;
                    while (true) {
                        if (syscalls::g_single_step_budget > 0) {
                            const uint64_t pc = machine.cpu.pc();
                            const uint64_t ra = machine.cpu.reg(riscv::REG_RA);
                            const uint64_t sp = machine.cpu.reg(riscv::REG_SP);
                            const uint64_t a0 = machine.cpu.reg(10);
                            const uint64_t a5 = machine.cpu.reg(15);
                            static bool logged_exec_bytes = false;
                            if (!logged_exec_bytes
                                && ((pc >= 0x5d5000 && pc < 0x5f0000)
                                    || (pc >= 0x440000 && pc < 0x450000))) {
                                logged_exec_bytes = true;
                                dump_exec_bytes(machine, pc, "[single-step-bytes]");
                            }
                            if (pc == 0x5e2b24 || pc == 0x5e2b54 || pc == 0x5e2b7c) {
                                fprintf(stderr,
                                        "[single-step-stack] pc=0x%lx sp=0x%lx ra=0x%lx\n",
                                        (unsigned long)pc,
                                        (unsigned long)sp,
                                        (unsigned long)ra);
                                for (int i = 0; i < 6; i++) {
                                    uint64_t addr = sp + 56 + i * 8;
                                    uint64_t val = 0;
                                    try {
                                        val = machine.memory.read<uint64_t>(addr);
                                    } catch (...) {}
                                    fprintf(stderr,
                                            "[single-step-stack] [0x%lx]=0x%lx\n",
                                            (unsigned long)addr,
                                            (unsigned long)val);
                                }
                            }
                            std::string instr_text;
                            try {
                                instr_text = machine.cpu.current_instruction_to_string();
                            } catch (const std::exception& e) {
                                instr_text = std::string("<decode-error: ") + e.what() + ">";
                            }
                            fprintf(stderr,
                                    "[single-step] budget=%d pc=0x%lx ra=0x%lx sp=0x%lx a0=0x%lx a5=0x%lx %s\n",
                                    syscalls::g_single_step_budget,
                                    (unsigned long)pc,
                                    (unsigned long)ra,
                                    (unsigned long)sp,
                                    (unsigned long)a0,
                                    (unsigned long)a5,
                                    instr_text.c_str());
                            machine.cpu.step_one();
                            syscalls::g_single_step_budget--;
                            if (syscalls::fork_child_exited()
                                || syscalls::fork_parent_waiting() || syscalls::g_execve_restart
                                || syscalls::g_waiting_for_stdin || syscalls::g_waiting_for_host_fetch
                                || (machine.stopped() && !machine.instruction_limit_reached())) {
                                break;
                            }
                            continue;
                        }
                        machine.resume<false>(TRACE_CHUNK);
                        if (syscalls::fork_child_exited()
                            || syscalls::fork_parent_waiting() || syscalls::g_execve_restart
                            || syscalls::g_waiting_for_stdin || syscalls::g_waiting_for_host_fetch
                            || (machine.stopped() && !machine.instruction_limit_reached()
                                && syscalls::g_single_step_budget <= 0)) {
                            break;
                        }
                        if (!machine.instruction_limit_reached()) break;
                        const auto [instrs, _] = machine.get_counters();
                        fprintf(stderr,
                                "[trace-chunk] pc=0x%lx instr=%llu stopped=%d fork=%d execve_restart=%d\n",
                                (unsigned long)machine.cpu.pc(),
                                (unsigned long long)instrs,
                                (int)machine.stopped(),
                                (int)syscalls::g_fork_active(),
                                (int)syscalls::g_execve_restart);
                    }
                } else {
                    machine.simulate(MAX_INSTRUCTIONS);
                }
                {
                    const auto [instrs, _] = machine.get_counters();
                    fprintf(stderr,
                            "[simulate-native] returned pc=0x%lx stopped=%d limit=%d stdin=%d host_fetch=%d fork_active=%d fork_child_exited=%d fork_parent_waiting=%d execve_restart=%d instr=%llu\n",
                            (unsigned long)machine.cpu.pc(),
                            (int)machine.stopped(),
                            (int)machine.instruction_limit_reached(),
                            (int)syscalls::g_waiting_for_stdin,
                            (int)syscalls::g_waiting_for_host_fetch,
                            (int)syscalls::g_fork_active(),
                            (int)syscalls::fork_child_exited(),
                            (int)syscalls::fork_parent_waiting(),
                            (int)syscalls::g_execve_restart,
                            (unsigned long long)instrs);
                }
                if (syscalls::g_single_step_resume
                    && machine.stopped()
                    && !machine.instruction_limit_reached()) {
                    if (syscalls::g_single_step_budget <= 0) {
                        syscalls::g_single_step_resume = false;
                    }
                    retries = -1;
                    continue;
                }
                if (syscalls::g_fork_active() || syscalls::fork_child_exited()
                    || syscalls::fork_parent_waiting() || syscalls::g_execve_restart) {
                    fprintf(stderr,
                            "[simulate-loop] returned pc=0x%lx stopped=%d fork_active=%d state=%s execve_restart=%d\n",
                            (unsigned long)machine.cpu.pc(),
                            (int)machine.stopped(),
                            (int)syscalls::g_fork_active(),
                            syscalls::process_state_name(syscalls::fork_state()),
                            (int)syscalls::g_execve_restart);
                }
                // Checkpoint export: save state when machine first waits for stdin
                if (syscalls::g_waiting_for_stdin && !export_checkpoint_path.empty()) {
                    dbg_fprintf(stderr, "[friscy] Saving checkpoint at stdin wait point...\n");
                    auto [instr, _] = machine.get_counters();
                    dbg_fprintf(stderr, "[friscy] Instructions executed: %lu\n", (unsigned long)instr);
                    auto data = checkpoint::save_checkpoint(machine);
#ifdef __EMSCRIPTEN__
                    g_last_checkpoint_export = data;
#endif
                    checkpoint::save_checkpoint_file(data, export_checkpoint_path);
                    dbg_fprintf(stderr, "[friscy] Checkpoint saved, exiting.\n");
                    emit_perf_metrics(&machine, 0, false, "checkpoint-saved");
                    return 0;
                }
                // Fork child exited: restore parent state outside simulate()
                if (syscalls::fork_child_exited()) {
                    syscalls::fork_parent_restore(machine);
                    retries = -1;
                    continue;
                }
                // After execve, machine.stop() causes simulate to return
                // with m_max_counter=0. instruction_limit_reached() returns
                // false (it requires m_max_counter!=0). Use our own flag.
                if (syscalls::g_execve_restart) {
                    syscalls::g_execve_restart = false;
                    retries = 0;  // reset retries for new binary
                    continue;
                }
                // Host fetch hypercall: guest called syscall 500, machine stopped.
                // Perform the HTTP request on the host side using curl, then resume.
                if (syscalls::g_waiting_for_host_fetch) {
                    syscalls::g_waiting_for_host_fetch = false;
                    dbg_cerr << "[host-fetch] Request: " << syscalls::g_host_fetch_request.substr(0, 200) << "\n";
                    // Parse URL from JSON request
                    auto& req = syscalls::g_host_fetch_request;
                    std::string url;
                    auto url_pos = req.find("\"url\"");
                    if (url_pos != std::string::npos) {
                        auto colon = req.find(':', url_pos + 4);
                        auto quote1 = req.find('"', colon + 1);
                        auto quote2 = req.find('"', quote1 + 1);
                        if (quote1 != std::string::npos && quote2 != std::string::npos)
                            url = req.substr(quote1 + 1, quote2 - quote1 - 1);
                    }
                    // Extract method and headers from request JSON
                    std::string method = "GET";
                    auto method_pos = req.find("\"method\"");
                    if (method_pos != std::string::npos) {
                        auto colon = req.find(':', method_pos + 7);
                        auto q1 = req.find('"', colon + 1);
                        auto q2 = req.find('"', q1 + 1);
                        if (q1 != std::string::npos && q2 != std::string::npos)
                            method = req.substr(q1 + 1, q2 - q1 - 1);
                    }
                    // Build curl command
                    std::string cmd = "curl -s -S -L -w '\\n__HTTP_STATUS__%{http_code}' -X " + method;
                    // Extract body for POST/PUT
                    auto body_pos = req.find("\"body\"");
                    if (body_pos != std::string::npos) {
                        auto colon = req.find(':', body_pos + 5);
                        auto q1 = req.find('"', colon + 1);
                        if (q1 != std::string::npos) {
                            // Find matching end quote (handle escaped quotes)
                            size_t q2 = q1 + 1;
                            while (q2 < req.size() && !(req[q2] == '"' && req[q2-1] != '\\')) q2++;
                            std::string body = req.substr(q1 + 1, q2 - q1 - 1);
                            // Write body to temp file to avoid shell escaping issues
                            FILE* tmp = fopen("/tmp/friscy_fetch_body.json", "w");
                            if (tmp) { fwrite(body.data(), 1, body.size(), tmp); fclose(tmp); }
                            cmd += " -d @/tmp/friscy_fetch_body.json";
                        }
                    }
                    // Extract headers
                    auto hdrs_pos = req.find("\"headers\"");
                    if (hdrs_pos != std::string::npos) {
                        // Simple extraction of key-value header pairs
                        auto brace = req.find('{', hdrs_pos);
                        auto end_brace = req.find('}', brace + 1);
                        if (brace != std::string::npos && end_brace != std::string::npos) {
                            std::string hdrs = req.substr(brace + 1, end_brace - brace - 1);
                            // Parse "key":"value" pairs
                            size_t pos = 0;
                            while (pos < hdrs.size()) {
                                auto kq1 = hdrs.find('"', pos);
                                if (kq1 == std::string::npos) break;
                                auto kq2 = hdrs.find('"', kq1 + 1);
                                if (kq2 == std::string::npos) break;
                                auto vq1 = hdrs.find('"', kq2 + 1);
                                if (vq1 == std::string::npos) break;
                                auto vq2 = hdrs.find('"', vq1 + 1);
                                if (vq2 == std::string::npos) break;
                                std::string key = hdrs.substr(kq1 + 1, kq2 - kq1 - 1);
                                std::string val = hdrs.substr(vq1 + 1, vq2 - vq1 - 1);
                                cmd += " -H '" + key + ": " + val + "'";
                                pos = vq2 + 1;
                            }
                        }
                    }
                    cmd += " '" + url + "' 2>/tmp/friscy_fetch_err.txt";
                    dbg_cerr << "[host-fetch] curl: " << cmd.substr(0, 300) << "\n";
                    // Execute curl
                    FILE* pipe = popen(cmd.c_str(), "r");
                    std::string response_body;
                    if (pipe) {
                        char buf[4096];
                        while (fgets(buf, sizeof(buf), pipe))
                            response_body += buf;
                        pclose(pipe);
                    }
                    // Extract HTTP status from curl output
                    int http_status = 200;
                    auto status_marker = response_body.rfind("__HTTP_STATUS__");
                    if (status_marker != std::string::npos) {
                        http_status = std::stoi(response_body.substr(status_marker + 15));
                        response_body = response_body.substr(0, status_marker);
                    }
                    // Build JSON response matching what claude-repl-llrt.js expects
                    // Escape the body for JSON
                    std::string escaped;
                    for (char c : response_body) {
                        if (c == '"') escaped += "\\\"";
                        else if (c == '\\') escaped += "\\\\";
                        else if (c == '\n') escaped += "\\n";
                        else if (c == '\r') escaped += "\\r";
                        else if (c == '\t') escaped += "\\t";
                        else if ((unsigned char)c < 0x20) {
                            char hex[8]; snprintf(hex, sizeof(hex), "\\u%04x", (unsigned char)c);
                            escaped += hex;
                        } else escaped += c;
                    }
                    std::string json_resp = "{\"status\":" + std::to_string(http_status)
                        + ",\"statusText\":\"OK\""
                        + ",\"headers\":{}"
                        + ",\"body\":\"" + escaped + "\"}";
                    syscalls::g_host_fetch_response = json_resp;
                    syscalls::g_host_fetch_response_ready = true;
                    dbg_cerr << "[host-fetch] Response: status=" << http_status
                              << " body_len=" << response_body.size() << "\n";
                    retries = 0;
                    continue;  // Resume machine execution
                }
                if (machine.stopped() && !machine.instruction_limit_reached()
                    && syscalls::g_single_step_budget <= 0) {
                    syscalls::g_trace_after_cpu_max = false;
                }
#endif
                {
                    static int normal_return_budget = 32;
                    if (normal_return_budget-- > 0) {
                        fprintf(stderr,
                                "[simulate-return] retries=%d instructions=%llu exit_code=%lu pc=0x%lx stopped=%d stdin_wait=%d host_fetch=%d limit=%d fork=%d execve_restart=%d stop_mask=0x%x\n",
                                retries,
                                (unsigned long long)machine.instruction_counter(),
                                (unsigned long)machine.return_value(),
                                (unsigned long)machine.cpu.pc(),
                                (int)machine.stopped(),
                                (int)syscalls::g_waiting_for_stdin,
                                (int)syscalls::g_waiting_for_host_fetch,
                                (int)machine.instruction_limit_reached(),
                                (int)syscalls::g_fork_active(),
                                (int)syscalls::g_execve_restart,
                                current_stop_reason_mask());
                    }
                }
                dbg_cerr << "[friscy] simulate() returned normally, retries=" << retries
                          << " instructions=" << machine.instruction_counter()
                          << " exit_code=" << machine.return_value()
                          << " pc=0x" << std::hex << machine.cpu.pc() << std::dec
                          << " stopped=" << machine.stopped()
                          << " stdin_wait=" << syscalls::g_waiting_for_stdin
                          << " limit_reached=" << machine.instruction_limit_reached()
                          << "\n";
                break;
            } catch (const riscv::MachineException& e) {
                uint64_t fault_addr = e.data();
                uint64_t crash_pc = machine.cpu.pc();
                const std::string what = e.what();
                {
                    static int machine_exception_budget = 32;
                    if (machine_exception_budget-- > 0) {
                        fprintf(stderr,
                                "[machine-exception] what=%s data=0x%lx pc=0x%lx ra=0x%lx sp=0x%lx a0=0x%lx a7=%ld stopped=%d stop_mask=0x%x\n",
                                what.c_str(),
                                (unsigned long)fault_addr,
                                (unsigned long)crash_pc,
                                (unsigned long)machine.cpu.reg(riscv::REG_RA),
                                (unsigned long)machine.cpu.reg(riscv::REG_SP),
                                (unsigned long)machine.cpu.reg(10),
                                (long)machine.cpu.reg(17),
                                (int)machine.stopped(),
                                current_stop_reason_mask());
                        try {
                            const auto pc_info = machine.memory.get_page_info(crash_pc);
                            fprintf(stderr, "[machine-exception] pc-page %s\n", pc_info.c_str());
                        } catch (...) {}
                        try {
                            const auto ra_info = machine.memory.get_page_info(machine.cpu.reg(riscv::REG_RA));
                            fprintf(stderr, "[machine-exception] ra-page %s\n", ra_info.c_str());
                        } catch (...) {}
                        auto dump_stack_words = [&machine](const char* label, uint64_t base, int count) {
                            fprintf(stderr, "[machine-exception] %s:", label);
                            for (int i = 0; i < count; i++) {
                                const uint64_t addr = base + uint64_t(i) * 8;
                                uint64_t val = 0;
                                try {
                                    val = machine.memory.read<uint64_t>(addr);
                                    fprintf(stderr, " [0x%lx]=0x%lx",
                                            (unsigned long)addr,
                                            (unsigned long)val);
                                } catch (...) {
                                    fprintf(stderr, " [0x%lx]=<fault>", (unsigned long)addr);
                                    break;
                                }
                            }
                            fprintf(stderr, "\n");
                        };
                        const uint64_t sp = machine.cpu.reg(riscv::REG_SP);
                        if (sp >= 0x1000) {
                            const uint64_t window_base = (sp >= 0x20) ? (sp - 0x20) : 0;
                            dump_stack_words("sp-window", window_base, 12);
                        }
                        uint64_t fp = machine.cpu.reg(8);
                        if (fp >= 0x1000) {
                            fprintf(stderr, "[machine-exception] fp-chain:");
                            for (int i = 0; i < 8 && fp >= 0x1000; i++) {
                                try {
                                    const uint64_t saved_fp = machine.memory.read<uint64_t>(fp - 16);
                                    const uint64_t saved_ra = machine.memory.read<uint64_t>(fp - 8);
                                    fprintf(stderr, " {fp=0x%lx ra=0x%lx next=0x%lx}",
                                            (unsigned long)fp,
                                            (unsigned long)saved_ra,
                                            (unsigned long)saved_fp);
                                    if (saved_fp == 0 || saved_fp == fp) break;
                                    fp = saved_fp;
                                } catch (...) {
                                    fprintf(stderr, " {fp=0x%lx <fault>}", (unsigned long)fp);
                                    break;
                                }
                            }
                            fprintf(stderr, "\n");
                        }
                        if (crash_pc < 0x100000 || machine.cpu.reg(riscv::REG_RA) < 0x100000) {
                            constexpr uint64_t got_base = 0xc82f0;
                            fprintf(stderr, "[machine-exception] got-window:");
                            for (int i = 0; i < 8; i++) {
                                uint64_t val = 0;
                                try {
                                    val = machine.memory.read<uint64_t>(got_base + i * 8);
                                } catch (...) {}
                                fprintf(stderr, " [0x%lx]=0x%lx",
                                        (unsigned long)(got_base + i * 8),
                                        (unsigned long)val);
                            }
                            fprintf(stderr, "\n");
                        }
                        dump_exec_bytes(machine, crash_pc, "[machine-exception-bytes]");
                    }
                }
                const bool is_ebreak = what.find("EBREAK") != std::string::npos;
                const bool is_sigill = what.find("SIGILL") != std::string::npos || what.find("Illegal instruction") != std::string::npos;
                g_last_fault_kind = FRISCY_FAULT_MACHINE_EXCEPTION;
                g_last_fault_pc = (uint32_t)crash_pc;
                g_last_fault_data = (uint32_t)fault_addr;
                dbg_cerr << "[friscy] MachineException: " << e.what()
                          << " data=0x" << std::hex << fault_addr
                          << " pc=0x" << crash_pc << std::dec
                          << " retry=" << retries << "\n";

                // Check if this is an instruction limit, not a page fault
                if (machine.instruction_limit_reached()) {
                    dbg_cerr << "[friscy] Instruction limit reached after "
                              << machine.get_counters().first << " instructions\n";
                    break;  // Exit cleanly instead of retrying
                }

                // EBREAK from abort()/__stack_chk_fail: skip by returning from
                // the current function (set PC = RA). This is safe in single-threaded
                // emulation where futex force-unlock may trigger false positives.
                if (is_ebreak || is_sigill) {
                    auto ra = machine.cpu.reg(riscv::REG_RA);
                    auto fault_symbol = format_callsite_symbol(machine, crash_pc);
                    auto ra_symbol = format_callsite_symbol(machine, ra);
                    if (is_sigill) {
                        dbg_cerr << "[friscy] SIGILL: " << fault_symbol
                                  << " (pc=0x" << std::hex << crash_pc << std::dec
                                  << ") RA=0x" << std::hex << ra << " (" << ra_symbol << std::dec << ")\n";
                        throw;
                    }
                    dbg_cerr << "[friscy] EBREAK: " << fault_symbol
                              << " (pc=0x" << std::hex << crash_pc << std::dec
                              << "), RA suggests " << ra_symbol << "\n";
                }
                if (is_ebreak) {
                    g_last_fault_kind = FRISCY_FAULT_EBREAK;
                    // Diagnostic: check actual memory at the reported PC
                    {   static bool once = true;
                        if (once) {
                            dbg_fprintf(stderr, "[bc-ids] SYSCALL=%d SYSTEM=%d STOP=%d\n",
                                    riscv::RV32I_BC_SYSCALL, riscv::RV32I_BC_SYSTEM, riscv::RV32I_BC_STOP);
                            once = false;
                        }
                        uint64_t epc = machine.cpu.pc();
                        uint32_t mem_instr = 0;
                        try { machine.memory.memcpy_out(&mem_instr, epc, 4); } catch (...) {}
                        auto& seg = machine.cpu.current_execute_segment();
                        auto* dcache = seg.decoder_cache();
                        // SHIFT is 1 for compressed, 2 for non-compressed
                        constexpr unsigned SHIFT = 1; // compressed enabled
                        auto& dentry = dcache[epc >> SHIFT];
                        dbg_fprintf(stderr, "[EBREAK-diag] pc=0x%lx mem=0x%08x decoder_bc=%d decoder_instr=0x%08x"
                                " seg=[0x%lx,0x%lx) a7=%ld(0x%lx)\n",
                                (long)epc, mem_instr, dentry.get_bytecode(), dentry.instr,
                                (long)seg.exec_begin(), (long)seg.exec_end(),
                                (long)machine.cpu.reg(17), (long)machine.cpu.reg(17));
                    }
                    if (syscalls::g_fork_active()) {
                        // Treat EBREAK in fork child as child crash → exit(127)
                        dbg_cerr << "[friscy] EBREAK in fork child (pc=0x"
                                  << std::hex << machine.cpu.pc() << std::dec
                                  << ") — forcing child exit\n";
                        syscalls::g_fork().exit_status = 127;
                        syscalls::g_process_model.push_event(
                            syscalls::ProcessEventKind::Exit,
                            syscalls::g_fork().child_pid, syscalls::g_fork().parent_pid,
                            syscalls::g_fork().child_pgid, 127);
                        syscalls::g_process_model.mark_exited(syscalls::g_fork().child_pid, 127);
                    syscalls::fork_mark_child_exited(machine);
                    machine.stop();
                    // Don't retry — go to fork_parent_restore
                    retries = -1;
                    continue;
                    }
                    if (machine.stopped()) {
                        dbg_cerr << "[friscy] EBREAK after stop: treating as graceful completion\n";
                        break;
                    }
                    uint64_t ra = machine.cpu.reg(riscv::REG_RA);  // x1 = return address
                    dbg_cerr << "[friscy] EBREAK (abort): branch-entered, PC=0x"
                              << std::hex << machine.cpu.pc()
                              << " RA=0x" << ra
                              << " SP=0x" << machine.cpu.reg(riscv::REG_SP)
                              << std::dec << "\n";
                    machine.cpu.jump(ra);
                    continue;
                }

                if (retries < 7) {
                    machine.memory.evict_execute_segments();
                    const auto* pc_region = syscalls::live_mmap_find(crash_pc);
                    if (pc_region != nullptr && pc_region->attr.exec) {
                        const uint64_t pc_page = crash_pc & ~0xFFFULL;
                        machine.memory.set_page_attr(pc_page, 4096, pc_region->attr);
                    }
                    if (fault_addr != 0) {
                        constexpr uint64_t PAGE_MASK = ~0xFFFULL;
                        uint64_t page = fault_addr & PAGE_MASK;
                        riscv::PageAttributes attr;
                        attr.read = true;
                        attr.write = true;
                        attr.exec = true;
                        machine.memory.set_page_attr(page, 4096, attr);
                    } else {
                        uint64_t pc = machine.cpu.pc();
                        riscv::PageAttributes attr;
                        attr.read = true;
                        attr.write = true;
                        attr.exec = true;
                        machine.memory.set_page_attr(pc & ~0xFFFULL, 4096, attr);
                    }
                    g_last_fault_kind = FRISCY_FAULT_NONE;
                    g_last_fault_pc = 0;
                    g_last_fault_data = 0;
                    continue;
                }
#ifdef __EMSCRIPTEN__
                EM_ASM({
                    if (typeof Module._termWrite === 'function') {
                        Module._termWrite('\r\n\x1b[31m[friscy] Machine exception: ' +
                            UTF8ToString(Number($0)) + ' (data: 0x' + ($1).toString(16) +
                            ', pc: 0x' + ($2).toString(16) + ')\x1b[0m\r\n');
                    }
                }, e.what(), (uint32_t)e.data(), (uint32_t)machine.cpu.pc());
                dbg_cerr << "[friscy] Fatal exception, exiting with code 1\n";
                return 1;
#else
                throw;
#endif
            } catch (const std::exception& e) {
                dbg_cerr << "[friscy] std::exception: " << e.what()
                          << " pc=0x" << std::hex << machine.cpu.pc() << std::dec << "\n";
                return 1;
            }
        }

#ifdef __EMSCRIPTEN__
        if (syscalls::g_waiting_for_stdin || syscalls::g_waiting_for_host_fetch) {
            // Machine stopped for stdin or host fetch.
            // Return to JS — the resume loop will call friscy_resume().
            return 0;
        }
#endif

        dbg_cout << "----------------------------------------\n";

        // Report results
        auto [instructions, _] = machine.get_counters();
        auto exit_code = machine.return_value();

        dbg_cout << "[friscy] Execution complete\n";
        dbg_cout << "[friscy] Instructions: " << instructions << "\n";
        dbg_cout << "[friscy] Exit code: " << exit_code << "\n";

        // Export VFS as tar if requested
        if (!export_tar_path.empty()) {
            dbg_cout << "[friscy] Exporting VFS to tar: " << export_tar_path << "\n";
            auto tar_data = g_vfs.save_tar();
            std::ofstream out(export_tar_path, std::ios::binary);
            if (!out) {
                dbg_cerr << "Error: Could not open export tar path: " << export_tar_path << "\n";
                emit_perf_metrics(&machine, 1, false, "tar-export-failed");
                return 1;
            }
            out.write(reinterpret_cast<const char*>(tar_data.data()), tar_data.size());
            dbg_cout << "[friscy] Exported " << tar_data.size() << " bytes\n";
        }

        emit_perf_metrics(&machine, static_cast<int>(exit_code), true, "completed");
        return static_cast<int>(exit_code);

    } catch (const riscv::MachineException& e) {
        const std::string what = e.what();
        const bool is_ebreak = what.find("EBREAK") != std::string::npos;
        const bool is_sigill = what.find("SIGILL") != std::string::npos || what.find("Illegal instruction") != std::string::npos;
        dbg_cerr << "\n[friscy] Machine exception: " << e.what();
        if (!machine_ptr) {
            dbg_cerr << "\n[friscy] Machine not initialized (construction failed)\n";
            return 1;
        }
        if (e.data() != 0) {
            dbg_cerr << " (data: 0x" << std::hex << e.data() << std::dec << ")";
        }
        auto crash_pc = machine_ptr->cpu.pc();
        dbg_cerr << "\n  PC=0x" << std::hex << crash_pc << std::dec << "\n";
        if (is_ebreak || is_sigill) {
            auto ra = machine_ptr->cpu.reg(riscv::REG_RA);
            dbg_cerr << "  Symbolized: " << (is_ebreak ? "EBREAK" : "SIGILL")
                     << " @ " << format_callsite_symbol(*machine_ptr, crash_pc)
                     << " RA=" << std::hex << ra << " ("
                     << format_callsite_symbol(*machine_ptr, ra) << std::dec << ")\n";
        }
        // Try to read the actual memory at PC
        try {
            uint32_t mem_at_pc = machine_ptr->memory.template read<uint32_t>(crash_pc);
            dbg_cerr << "  Memory at PC: 0x" << std::hex << mem_at_pc << std::dec << "\n";
        } catch (...) {
            dbg_cerr << "  Memory at PC: UNREADABLE (protection fault)\n";
        }
        // Print non-zero registers for context
        for (int r = 0; r < 32; r++) {
            if (machine_ptr->cpu.reg(r) != 0)
                dbg_cerr << "  x" << r << "=0x" << std::hex << machine_ptr->cpu.reg(r) << std::dec << "\n";
        }
        if (machine_ptr) {
            emit_perf_metrics(machine_ptr.get(), 1, false, "machine-exception");
        } else if (!perf_json_path.empty() || perf_stats) {
            // Minimal fallback to avoid silent loss when machine construction failed.
            std::ofstream json_out(perf_json_path);
            if (json_out) {
                json_out << "{\"status\":\"machine-exception\",\"completed\":false,\"exitCode\":1}\n";
            }
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
                    if (buf[0]) dbg_cerr << "  x" << r << " string: \"" << buf << "\"\n";
                } catch (...) {}
            }
        }
        return 1;
    } catch (const std::exception& e) {
        dbg_cerr << "\n[friscy] Error: " << e.what() << "\n";
        if (machine_ptr) {
            emit_perf_metrics(machine_ptr.get(), 1, false, "std-exception");
        } else if (!perf_json_path.empty() || perf_stats) {
            std::ofstream json_out(perf_json_path);
            if (json_out) {
                json_out << "{\"status\":\"std-exception\",\"completed\":false,\"exitCode\":1}\n";
            }
        }
        return 1;
    }
}
