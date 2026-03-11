// syscalls.hpp - Linux syscall emulation for RISC-V 64-bit
// Implements the minimum viable syscall set for container workloads
//
// Uses libriscv's userdata mechanism to pass VFS to syscall handlers.
#pragma once

// Kill all debug logging — every fprintf/cerr costs CPU even to /dev/null
#ifdef FRISCY_QUIET
#define dbg_fprintf(...) ((void)0)
#else
#define dbg_fprintf fprintf
#endif

#include <libriscv/machine.hpp>
#include "vfs.hpp"
#include "elf_loader.hpp"
#include <array>
#include <algorithm>
#include <ctime>
#include <cstring>
#include <random>
#include <cstdlib>
#include <iostream>
#include <map>
#include <set>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
// VectorHeart JSPI import — implemented in library_vectorheart.js
extern "C" long js_opfs_io(int fd, void* buf, size_t len, int op, long off);
#else
#include <sys/socket.h>
#include <poll.h>
#include <unistd.h>
#endif

namespace syscalls {

using Machine = riscv::Machine<riscv::RISCV64>;

// Flag: true when machine stopped because stdin has no data.
// Used by JS resume loop to distinguish stdin-wait from program exit.
inline bool g_waiting_for_stdin = false;

// Flag: safe-mode disables selected custom runtime behaviour that may hide
// accelerator bugs.
inline bool g_safe_mode = false;

// Flag: when true, native mode stops on first stdin read instead of blocking.
// Used by --export-checkpoint to capture state at the stdin-wait point.
inline bool g_checkpoint_on_stdin = false;
// Counter: number of consecutive idle epoll_pwait calls (no events returned).
// When this exceeds a threshold, the system is idle and we can checkpoint.
inline int g_idle_epoll_count = 0;
static constexpr int IDLE_EPOLL_THRESHOLD = 3;  // stop after 3 consecutive idle polls

// Host fetch hypercall (syscall 500): guest does ecall with a7=500,
// machine stops, Worker performs fetch, writes response, resumes.
inline bool g_waiting_for_host_fetch = false;
inline bool g_host_fetch_response_ready = false;
inline std::string g_host_fetch_request;
inline std::string g_host_fetch_response;

// Flag: true when machine stopped due to execve loading a new binary.
// The dispatch loop must re-enter simulate() with the new binary.
inline bool g_execve_restart = false;
// Debug flag: when tracing direct Node startup, switch to chunked execution
// after the cgroup cpu.max probe completes so we can sample the post-probe PC
// without perturbing earlier loader behavior.
inline bool g_trace_after_cpu_max = false;
inline int g_single_step_budget = 0;
inline bool g_single_step_resume = false;

// Fork lifecycle state model (durable over implicit lifecycle flags).
enum class ProcessState : uint8_t {
    ParentSaved = 0,    // Parent context checkpointed before child execution.
    ChildRunning,       // Child execution is active.
    ChildExeced,        // Child execve loaded a new image.
    ChildExited,        // Child completed and restore is pending.
    ParentRestored,     // Parent restored from child frame.
    ParentWaiting,      // Parent blocked in wait4().
    ChildReaped,        // Parent reaped child exit status.
    Failed,             // State-machine invariant break.
};

inline const char* process_state_name(ProcessState state) {
    switch (state) {
        case ProcessState::ParentSaved: return "ParentSaved";
        case ProcessState::ChildRunning: return "ChildRunning";
        case ProcessState::ChildExeced: return "ChildExeced";
        case ProcessState::ChildExited: return "ChildExited";
        case ProcessState::ParentRestored: return "ParentRestored";
        case ProcessState::ParentWaiting: return "ParentWaiting";
        case ProcessState::ChildReaped: return "ChildReaped";
        case ProcessState::Failed: return "Failed";
    }
    return "Unknown";
}

struct ForkLifecycle {
    ProcessState state = ProcessState::ParentSaved;
    bool parent_context_restored = false;
};

inline ForkLifecycle g_fork_lifecycle = {ProcessState::ParentSaved, false};
struct ForkState;
inline bool g_fork_active();
inline int32_t fork_child_pid();

inline uint64_t fork_regs_hash(const Machine& m) {
    uint64_t h = 1469598103934665603ULL;
    for (int i = 0; i < 32; i++) {
        h ^= m.cpu.reg(i);
        h *= 1099511628211ULL;
    }
    return h;
}

inline bool process_state_transition_allowed(ProcessState from, ProcessState to) {
    if (from == to) return true;
    switch (from) {
        case ProcessState::ParentSaved:
            return to == ProcessState::ChildRunning
                || to == ProcessState::ChildReaped
                || to == ProcessState::Failed;
        case ProcessState::ChildRunning:
            return to == ProcessState::ChildExeced
                || to == ProcessState::ChildExited
                || to == ProcessState::ParentWaiting
                || to == ProcessState::ParentSaved
                || to == ProcessState::Failed;
        case ProcessState::ChildExeced:
            return to == ProcessState::ChildExited || to == ProcessState::Failed;
        case ProcessState::ChildExited:
            return to == ProcessState::ParentRestored || to == ProcessState::Failed;
        case ProcessState::ParentRestored:
            return to == ProcessState::ParentWaiting
                || to == ProcessState::ChildReaped
                || to == ProcessState::ParentSaved
                || to == ProcessState::Failed;
        case ProcessState::ParentWaiting:
            return to == ProcessState::ChildExited
                || to == ProcessState::ChildReaped
                || to == ProcessState::ParentSaved
                || to == ProcessState::Failed;
        case ProcessState::ChildReaped:
            return to == ProcessState::ParentSaved
                || to == ProcessState::ChildReaped
                || to == ProcessState::Failed;
        case ProcessState::Failed:
            return to == ProcessState::Failed;
    }
    return false;
}

inline void expect_transition(ProcessState from, ProcessState to, const char* event, const char* reason) {
    if (process_state_transition_allowed(from, to)) return;
    dbg_fprintf(stderr,
            "[fork-lifecycle] FATAL invalid transition from=%s to=%s event=%s reason=%s\n",
            process_state_name(from),
            process_state_name(to),
            event ? event : "?(event)",
            reason ? reason : "?(reason)");
    __builtin_trap();
}

// ============================================================================
// Phase 2: wait/yield/resume for child processes
// ============================================================================
// When parent calls wait4() and child hasn't exited yet, the machine yields
// back to the host (m.stop()) with ProcessState::ParentWaiting.  The host
// detects this via friscy_stop_reason() bitmask and can either:
//   a) let the vfork child run to completion then resume (single-worker), or
//   b) (Phase 3) resume a child worker, wait for its Exit event, then resume.
// When the child exits, host calls friscy_notify_child_exit(pid, status), then
// resumes the machine.  The rewound wait4 syscall re-executes and finds the
// child Exited → returns normally.
inline pid_t g_wait_blocked_pid = 0;

// Fork lifecycle state for the current vfork frame (top of g_fork_stack).
// Parent/child synchronization is now expressed as explicit state transitions.
inline ForkLifecycle& fork_lifecycle() {
    return g_fork_lifecycle;
}
inline ForkLifecycle& fork_lifecycle(Machine&) {
    return g_fork_lifecycle;
}

inline void fork_set_state(Machine& m, ProcessState to, const char* event, const char* reason = "state transition") {
    auto& lc = fork_lifecycle(m);
    expect_transition(lc.state, to, event, reason);
    const ProcessState from = lc.state;
    if (from == to) return;
    lc.state = to;
    lc.parent_context_restored = (to == ProcessState::ParentRestored);
    const uint64_t pc = m.cpu.pc();
    const uint64_t a0 = m.cpu.reg(riscv::REG_ARG0);
    const uint64_t sp = m.cpu.reg(riscv::REG_SP);
    const uint64_t ra = m.cpu.reg(riscv::REG_RA);
    const uint64_t reg_hash = fork_regs_hash(m);
    const int32_t child_pid = fork_child_pid();
    dbg_fprintf(stderr,
            "[fork-lifecycle] event=%s reason=%s from=%s to=%s pc=0x%lx a0=0x%lx sp=0x%lx ra=0x%lx reg_hash=0x%lx child_pid=%d\n",
            event ? event : "?(event)",
            reason ? reason : "?(reason)",
            process_state_name(from),
            process_state_name(to),
            (long)pc,
            (long)a0,
            (long)sp,
            (long)ra,
            (long)reg_hash,
            child_pid);
}

inline const char* fork_state_name() { return process_state_name(fork_lifecycle().state); }

inline bool fork_parent_context_restored() {
    return fork_lifecycle().parent_context_restored;
}

// Stop-reason bitmask — returned by friscy_stop_reason() export.
// Worker.js inspects this to decide how to handle each yield.
static constexpr uint32_t STOP_REASON_NONE       = 0;
static constexpr uint32_t STOP_REASON_STDIN       = 1u << 0;
static constexpr uint32_t STOP_REASON_HOST_FETCH  = 1u << 1;
static constexpr uint32_t STOP_REASON_TIMESLICE   = 1u << 2;
static constexpr uint32_t STOP_REASON_WAIT_CHILD  = 1u << 3;
static constexpr uint32_t STOP_REASON_FORK_RESTORE = 1u << 4;

// Global mmap bump pointer — must be file-scope so fork_parent_restore can
// reset it. See sys_mmap for usage.
inline uint64_t g_mmap_bump = 0;
inline bool g_conservative_small_mmap_reuse = false;
inline bool g_force_materialize_anon_mmap = false;

struct LiveMmapRegion {
    uint64_t addr = 0;
    uint64_t size = 0;
    riscv::PageAttributes attr {};
    bool lazy = false;
    bool anonymous = false;
};
inline std::map<uint64_t, LiveMmapRegion> g_live_mmap_regions;
inline bool g_lazy_mmap_page_tables_enabled = false;
inline typename riscv::Memory<riscv::RISCV64>::page_fault_cb_t g_prev_page_fault_handler;
inline bool g_live_mmap_page_fault_handler_installed = false;

inline riscv::PageAttributes normalize_live_mmap_attr(riscv::PageAttributes attr) {
    attr.is_cow = false;
    attr.non_owning = false;
    attr.dont_fork = false;
    attr.user_defined = 0;
    attr.cacheable = true;
    return attr;
}

inline riscv::PageAttributes mmap_attr_from_prot(int prot) {
    riscv::PageAttributes attr;
    attr.read = (prot & 1) != 0;
    attr.write = (prot & 2) != 0;
    attr.exec = (prot & 4) != 0;
    return normalize_live_mmap_attr(attr);
}

inline riscv::PageAttributes merge_live_mmap_attr(
    riscv::PageAttributes a, const riscv::PageAttributes& b
) {
    a.read = a.read || b.read;
    a.write = a.write || b.write;
    a.exec = a.exec || b.exec;
    return normalize_live_mmap_attr(a);
}

inline bool same_live_mmap_attr(const riscv::PageAttributes& a, const riscv::PageAttributes& b) {
    return a.read == b.read && a.write == b.write && a.exec == b.exec;
}

inline void coalesce_live_mmap_regions() {
    if (g_live_mmap_regions.empty()) return;
    for (auto it = g_live_mmap_regions.begin(); it != g_live_mmap_regions.end();) {
        auto next = std::next(it);
        if (next != g_live_mmap_regions.end()
            && it->second.addr + it->second.size == next->second.addr
            && it->second.lazy == next->second.lazy
            && it->second.anonymous == next->second.anonymous
            && same_live_mmap_attr(it->second.attr, next->second.attr)) {
            it->second.size += next->second.size;
            g_live_mmap_regions.erase(next);
            continue;
        }
        ++it;
    }
}

inline void live_mmap_unmap(uint64_t addr, uint64_t size) {
    if (size == 0) return;
    const uint64_t end = addr + size;
    auto it = g_live_mmap_regions.lower_bound(addr);
    if (it != g_live_mmap_regions.begin()) --it;
    while (it != g_live_mmap_regions.end()) {
        const LiveMmapRegion cur = it->second;
        const uint64_t cur_end = cur.addr + cur.size;
        if (cur_end <= addr) {
            ++it;
            continue;
        }
        if (cur.addr >= end) break;
        auto erase_it = it++;
        g_live_mmap_regions.erase(erase_it);
        if (cur.addr < addr) {
            g_live_mmap_regions.emplace(cur.addr, LiveMmapRegion {
                .addr = cur.addr,
                .size = addr - cur.addr,
                .attr = cur.attr,
                .lazy = cur.lazy,
                .anonymous = cur.anonymous,
            });
        }
        if (cur_end > end) {
            g_live_mmap_regions.emplace(end, LiveMmapRegion {
                .addr = end,
                .size = cur_end - end,
                .attr = cur.attr,
                .lazy = cur.lazy,
                .anonymous = cur.anonymous,
            });
            break;
        }
    }
}

inline void live_mmap_map(
    uint64_t addr, uint64_t size, riscv::PageAttributes attr, bool lazy = false, bool anonymous = false
) {
    if (size == 0) return;
    live_mmap_unmap(addr, size);
    g_live_mmap_regions[addr] = LiveMmapRegion {
        .addr = addr,
        .size = size,
        .attr = normalize_live_mmap_attr(attr),
        .lazy = lazy,
        .anonymous = anonymous,
    };
    coalesce_live_mmap_regions();
}

inline const LiveMmapRegion* live_mmap_find(uint64_t addr) {
    auto it = g_live_mmap_regions.upper_bound(addr);
    if (it == g_live_mmap_regions.begin()) return nullptr;
    --it;
    const auto& region = it->second;
    if (addr >= region.addr && addr < region.addr + region.size) {
        return &region;
    }
    return nullptr;
}

inline void enable_lazy_mmap_page_tables(Machine& m) {
    if (g_lazy_mmap_page_tables_enabled) return;
    g_lazy_mmap_page_tables_enabled = true;
    // In arena mode, restrict the fast path so mmap-region accesses go
    // through the page fault handler for lazy materialization.
    if (m.memory.uses_flat_memory_arena()) {
        m.memory.set_memory_arena_fast_path_end(m.memory.mmap_start());
    }
    // In non-arena (page-backed) mode, lazy materialization now works via
    // the page fault handler which creates pages with the live region's
    // attributes (including exec permission).
}

inline void reset_lazy_mmap_page_tables(Machine& m) {
    g_lazy_mmap_page_tables_enabled = false;
    if (m.memory.uses_flat_memory_arena()) {
        m.memory.restore_memory_arena_fast_path();
    }
}

inline void install_live_mmap_page_fault_handler(Machine& m) {
    if (g_live_mmap_page_fault_handler_installed) return;
    g_prev_page_fault_handler = m.memory.set_page_fault_handler(
        [] (auto& mem, const auto pageno, bool init) -> riscv::Page& {
            const uint64_t addr = uint64_t(pageno) * riscv::Page::size();
            if (g_lazy_mmap_page_tables_enabled && addr >= mem.mmap_start()) {
                const auto* region = live_mmap_find(addr);
                if (region != nullptr && region->lazy && region->anonymous) {
                    if (mem.uses_flat_memory_arena()
                        && addr < mem.memory_arena_size()) {
                        auto* arena = static_cast<riscv::PageData*>(mem.memory_arena_ptr());
                        if (arena != nullptr) {
                            // Arena mode: materialize page backed by existing arena data.
                            // Lazy anonymous mappings are already zero-filled when mapped.
                            // At first touch the arena may now contain live stack / heap
                            // data from direct arena writes, so materializing the page must
                            // preserve the existing bytes instead of blanking the whole page.
                            return mem.allocate_page(pageno, region->attr, &arena[pageno]);
                        }
                    }
                    // Page-backed (non-arena) mode: create a new zeroed page with
                    // the region's attributes (including exec). Without this,
                    // lazy mmap pages are never materialized and execution faults
                    // with "Execution space protection fault" because get_exec_pageno
                    // can't find the page in m_pages.
                    auto& page = g_prev_page_fault_handler(mem, pageno, init);
                    page.attr.apply_regular_attributes(region->attr);
                    return page;
                }
            }
            return g_prev_page_fault_handler(mem, pageno, init);
        });
    g_live_mmap_page_fault_handler_installed = true;
}

inline void set_materialized_page_attrs_for_range(
    Machine& m, uint64_t addr, uint64_t size, riscv::PageAttributes attr
) {
    if (size == 0) return;
    const uint64_t first = addr >> 12;
    const uint64_t last = (addr + size - 1) >> 12;
    for (auto& [pageno, page] : m.memory.pages()) {
        if (pageno < first || pageno > last) continue;
        const bool old_exec = page.attr.exec;
        const bool is_cow = page.attr.is_cow;
        page.attr.apply_regular_attributes(attr);
        if (is_cow || (attr.write && page.is_cow_page())) {
            page.attr.is_cow = true;
            page.attr.write = false;
        }
        if (old_exec != page.attr.exec) {
            m.memory.mark_execute_segments_stale(pageno * 4096ULL, 4096);
        }
        m.memory.invalidate_cache(pageno, &page);
    }
}

inline void free_materialized_pages_for_range(Machine& m, uint64_t addr, uint64_t size) {
    if (size == 0) return;
    const uint64_t first = addr >> 12;
    const uint64_t last = (addr + size - 1) >> 12;
    std::vector<uint64_t> victims;
    victims.reserve(64);
    for (const auto& [pageno, page] : m.memory.pages()) {
        (void)page;
        if (pageno >= first && pageno <= last) {
            victims.push_back(pageno);
        }
    }
    for (const uint64_t pageno : victims) {
        m.memory.free_pageno(pageno);
    }
}

inline bool should_materialize_anon_mmap(
    Machine& m, uint64_t addr, uint64_t size, const riscv::PageAttributes& attr
) {
    if (!m.memory.uses_flat_memory_arena()) return true;
    if (addr >= m.memory.memory_arena_size()) return true;
    if (size > m.memory.memory_arena_size() - addr) return true;
    // Large guests like node trip musl allocator traps when anonymous RW
    // mappings stay lazy. Keep the custom mmap wrapper, but eagerly back anon
    // mappings once a large executable is active.
    if (g_force_materialize_anon_mmap) return true;
    // Anonymous executable mappings need concrete page entries before the CPU
    // can fetch from them. Non-executable mappings can be materialized lazily
    // on first touch once the mmap arena is routed through the page table.
    return attr.exec;
}

inline bool is_node_guest_path(std::string_view path) {
    if (path.empty()) return false;
    if (path == "node") return true;
    auto slash = path.rfind('/');
    const auto base = (slash == std::string_view::npos) ? path : path.substr(slash + 1);
    return base == "node";
}

inline bool g_enable_node_anon_relax = false;

// Safe-mode bypass for custom mmap handling.
inline bool g_disable_custom_mmap_wrapper = false;
inline uint64_t g_custom_mmap_bypass_pc = 0;

// Syscall tracing (disabled by default to reduce log noise)
inline bool g_trace_syscalls = false;
inline int g_trace_countdown = 800;
inline bool g_perf_stats = false;

// Lightweight mmap/munmap churn rails.
// Goal: identify high-frequency alloc/free loops without requiring full strace.
struct MmapRails {
    uint64_t mmap_ops = 0;
    uint64_t munmap_ops = 0;
    uint64_t mmap_fails = 0;
    uint64_t mmap_bytes = 0;
    uint64_t munmap_bytes = 0;
    uint64_t live_bytes = 0;
    uint64_t peak_live_bytes = 0;
    std::unordered_map<uint64_t, uint64_t> mmap_pc_hits;
    std::unordered_map<uint64_t, uint64_t> munmap_pc_hits;
    std::unordered_map<uint64_t, uint64_t> mmap_ra_hits;
    std::unordered_map<uint64_t, uint64_t> munmap_ra_hits;
};
inline MmapRails g_mmap_rails;
inline int g_mmap_boundary_dump_budget = 0;
inline uint64_t g_mmap_boundary_target_call = 0;
inline bool g_mmap_boundary_watch_all_calls = false;
inline bool g_mmap_boundary_panic_on_drift = false;
inline uint64_t g_mmap_boundary_call_id = 0;
inline bool g_mmap_boundary_budget_inited = false;
inline bool g_mmap_boundary_pc_decode_dumped = false;
inline bool g_mmap_boundary_target_seen = false;
inline uint64_t g_mmap_boundary_entry_a7 = 0;
inline uint64_t g_mmap_boundary_entry_ra = 0;
inline uint64_t g_mmap_boundary_entry_sp = 0;
inline bool g_mmap_boundary_target_drifts = false;

static inline void init_mmap_boundary_budget() {
    if (g_mmap_boundary_budget_inited) return;
    g_mmap_boundary_budget_inited = true;
    if (const char* env = std::getenv("FRISCY_MMAP_BOUNDARY_DUMPS")) {
        const long requested = std::strtol(env, nullptr, 10);
        if (requested > 0)
            g_mmap_boundary_dump_budget = (requested > 64) ? 64 : (int)requested;
    }
    if (const char* env = std::getenv("FRISCY_MMAP_BOUNDARY_TARGET_CALL")) {
        const long requested = std::strtol(env, nullptr, 10);
        if (requested > 0)
            g_mmap_boundary_target_call = (uint64_t)requested;
        else
            g_mmap_boundary_target_call = 0;
    }
    g_mmap_boundary_watch_all_calls = (g_mmap_boundary_target_call == 0);
    if (const char* env = std::getenv("FRISCY_MMAP_BOUNDARY_PANIC")) {
        const long requested = std::strtol(env, nullptr, 10);
        g_mmap_boundary_panic_on_drift = requested != 0;
    }
}

static inline constexpr uint64_t kMmapBoundaryPc = 0x18035938ULL;
static inline uint64_t begin_mmap_boundary_probe(Machine& m) {
    init_mmap_boundary_budget();
    if (m.cpu.pc() != kMmapBoundaryPc || g_mmap_boundary_dump_budget <= 0)
        return 0;
    g_mmap_boundary_dump_budget--;
    return ++g_mmap_boundary_call_id;
}

static inline void dump_hex_window(Machine& m, uint64_t start, uint64_t len, const char* label) {
    fprintf(stderr, "[mmap-boundary] %s 0x%lx-0x%lx: ", label, (long)start, (long)(start + len));
    for (uint64_t off = 0; off < len; off++) {
        uint64_t addr = start + off;
        unsigned byte_val = 0xEE;
        try {
            byte_val = static_cast<unsigned>(m.memory.template read<uint8_t>(addr));
        } catch (...) {
            byte_val = 0xEE;
        }
        fprintf(stderr, "%02x%s", byte_val, (off + 1 < len) ? " " : "\n");
    }
}

static inline void dump_stack_window(Machine& m, uint64_t sp) {
    constexpr uint64_t stack_bytes = 128;
    const uint64_t start = sp > 64 ? sp - 64 : 0;
    fprintf(stderr, "[mmap-boundary] stack a7=0x%lx ra=0x%lx sp=0x%lx\n",
            (long)m.cpu.reg(17), (long)m.cpu.reg(1), (long)sp);
    dump_hex_window(m, start, stack_bytes, "sp window");
}

static inline void dump_mmap_boundary_phase(Machine& m, uint64_t call_id, const char* phase) {
    if (call_id == 0)
        return;

    const uint64_t pc = m.cpu.pc();
    fprintf(stderr, "[mmap-boundary] phase=%s call=%lu pc=0x%lx a0=0x%lx a1=0x%lx a2=0x%lx a3=0x%lx a4=0x%lx a5=0x%lx a6=0x%lx a7=0x%lx ra=0x%lx sp=0x%lx result=0x%lx\n",
            phase,
            (unsigned long)call_id,
            (long)pc,
            (long)m.cpu.reg(10), (long)m.cpu.reg(11), (long)m.cpu.reg(12), (long)m.cpu.reg(13),
            (long)m.cpu.reg(14), (long)m.cpu.reg(15), (long)m.cpu.reg(16), (long)m.cpu.reg(17),
            (long)m.cpu.reg(1), (long)m.cpu.reg(2),
            (long)m.cpu.reg(10));
    try {
        auto& seg = m.cpu.current_execute_segment();
        fprintf(stderr, "[mmap-boundary] current seg=0x%lx-0x%lx translated=%d\n",
                (long)seg.exec_begin(), (long)seg.exec_end(),
                (int)seg.is_binary_translated());
        if (pc >= seg.exec_begin() && pc + 4 <= seg.exec_end()) {
            auto* instr_ptr = seg.exec_data(pc);
            uint32_t inst = 0;
            if (instr_ptr) {
                std::memcpy(&inst, instr_ptr, sizeof(inst));
                fprintf(stderr, "[mmap-boundary] decode bytes around pc raw=0x%08x\n", (unsigned)inst);
            }
        }
    } catch (...) {
        fprintf(stderr, "[mmap-boundary] seg decode unavailable\n");
    }

    dump_hex_window(m, pc > 16 ? pc - 16 : 0, 64, "pc window");
    dump_stack_window(m, m.cpu.reg(2));
    fprintf(stderr, "[mmap-boundary] ---- end ----\n");
}

static inline void dump_mmap_boundary_decode_once(Machine& m, const char* phase) {
    if (g_mmap_boundary_pc_decode_dumped) return;
    g_mmap_boundary_pc_decode_dumped = true;
    const uint64_t pc = m.cpu.pc();
    fprintf(stderr, "[mmap-boundary] decode-one-shot phase=%s pc=0x%lx\n", phase, (long)pc);
    try {
        auto& seg = m.cpu.current_execute_segment();
        const uint64_t start = (pc >= 24) ? pc - 24 : 0;
        const uint64_t end = pc + 24;
        fprintf(stderr, "[mmap-boundary] decode seg=0x%lx-0x%lx\n", (long)seg.exec_begin(), (long)seg.exec_end());
        for (uint64_t addr = start; addr < end; addr += 4) {
            if (!(addr >= seg.exec_begin() && addr + 4 <= seg.exec_end())) {
                fprintf(stderr, "[mmap-boundary] decode[%lx]=--\n", (long)addr);
                continue;
            }
            auto* instr_ptr = seg.exec_data(addr);
            uint32_t inst = 0;
            if (instr_ptr) {
                std::memcpy(&inst, instr_ptr, sizeof(inst));
                fprintf(stderr, "[mmap-boundary] decode[%lx]=0x%08x\n", (long)addr, (unsigned)inst);
            } else {
                fprintf(stderr, "[mmap-boundary] decode[%lx]=null\n", (long)addr);
            }
        }
    } catch (...) {
        fprintf(stderr, "[mmap-boundary] decode-one-shot unavailable\n");
    }
    constexpr uint64_t got_base = 0xc82f0;
    fprintf(stderr, "[mmap-boundary] got-window phase=%s", phase);
    for (int i = 0; i < 8; i++) {
        uint64_t val = 0;
        try {
            val = m.memory.template read<uint64_t>(got_base + i * 8);
        } catch (...) {}
        fprintf(stderr, " [0x%lx]=0x%lx",
                (unsigned long)(got_base + i * 8),
                (unsigned long)val);
    }
    fprintf(stderr, "\n");
}

static inline void check_mmap_boundary_drift(Machine& m, uint64_t call_id, const char* phase) {
    if (call_id == 0)
        return;
    const bool watched = (g_mmap_boundary_watch_all_calls || call_id == g_mmap_boundary_target_call);
    if (!watched)
        return;

    if (std::strcmp(phase, "entry") == 0 || !g_mmap_boundary_target_seen) {
        g_mmap_boundary_target_seen = true;
        g_mmap_boundary_entry_a7 = m.cpu.reg(17);
        g_mmap_boundary_entry_ra = m.cpu.reg(1);
        g_mmap_boundary_entry_sp = m.cpu.reg(2);
        g_mmap_boundary_target_drifts = false;
        fprintf(stderr, "[mmap-boundary] watch-call=%lu entry-snapshot a7=0x%lx ra=0x%lx sp=0x%lx\n",
                (unsigned long)call_id, (long)g_mmap_boundary_entry_a7, (long)g_mmap_boundary_entry_ra, (long)g_mmap_boundary_entry_sp);
        return;
    }

    if (!g_mmap_boundary_target_seen) return;

    const bool drift = (m.cpu.reg(17) != g_mmap_boundary_entry_a7) ||
        (m.cpu.reg(1) != g_mmap_boundary_entry_ra) ||
        (m.cpu.reg(2) != g_mmap_boundary_entry_sp);
    if (!drift || g_mmap_boundary_target_drifts) return;

    g_mmap_boundary_target_drifts = true;
    fprintf(stderr, "[mmap-boundary] panic-watch call=%lu phase=%s a7=0x%lx->0x%lx ra=0x%lx->0x%lx sp=0x%lx->0x%lx\n",
            (unsigned long)call_id, phase,
            (long)g_mmap_boundary_entry_a7, (long)m.cpu.reg(17),
            (long)g_mmap_boundary_entry_ra, (long)m.cpu.reg(1),
            (long)g_mmap_boundary_entry_sp, (long)m.cpu.reg(2));
    if (g_mmap_boundary_panic_on_drift) {
        std::abort();
    }
}

static inline bool rails_heavy_enabled() {
    return g_trace_syscalls || g_perf_stats;
}

static inline void reset_mmap_rails() {
    g_mmap_rails = MmapRails{};
}

static inline std::pair<uint64_t, uint64_t> rails_top_pc(
    const std::unordered_map<uint64_t, uint64_t>& hits) {
    uint64_t best_pc = 0;
    uint64_t best_count = 0;
    for (const auto& kv : hits) {
        if (kv.second > best_count) {
            best_pc = kv.first;
            best_count = kv.second;
        }
    }
    return {best_pc, best_count};
}

static inline void rails_emit_mmap_summary(const char* reason) {
    if (!rails_heavy_enabled()) return;
    auto [top_mmap_pc, top_mmap_count] = rails_top_pc(g_mmap_rails.mmap_pc_hits);
    auto [top_munmap_pc, top_munmap_count] = rails_top_pc(g_mmap_rails.munmap_pc_hits);
    auto [top_mmap_ra, top_mmap_ra_count] = rails_top_pc(g_mmap_rails.mmap_ra_hits);
    auto [top_munmap_ra, top_munmap_ra_count] = rails_top_pc(g_mmap_rails.munmap_ra_hits);
    fprintf(stderr,
            "[mmap-rails] %s mmap_ops=%lu munmap_ops=%lu mmap_fail=%lu live=%luMB peak=%luMB "
            "mmap_bytes=%luMB munmap_bytes=%luMB top_mmap_pc=0x%lx(%lu) top_munmap_pc=0x%lx(%lu) "
            "top_mmap_ra=0x%lx(%lu) top_munmap_ra=0x%lx(%lu)\n",
            reason,
            (unsigned long)g_mmap_rails.mmap_ops,
            (unsigned long)g_mmap_rails.munmap_ops,
            (unsigned long)g_mmap_rails.mmap_fails,
            (unsigned long)(g_mmap_rails.live_bytes >> 20),
            (unsigned long)(g_mmap_rails.peak_live_bytes >> 20),
            (unsigned long)(g_mmap_rails.mmap_bytes >> 20),
            (unsigned long)(g_mmap_rails.munmap_bytes >> 20),
            (unsigned long)top_mmap_pc, (unsigned long)top_mmap_count,
            (unsigned long)top_munmap_pc, (unsigned long)top_munmap_count,
            (unsigned long)top_mmap_ra, (unsigned long)top_mmap_ra_count,
            (unsigned long)top_munmap_ra, (unsigned long)top_munmap_ra_count);
}

static inline void rails_note_mmap(uint64_t pc, uint64_t ra, uint64_t bytes) {
    g_mmap_rails.mmap_ops++;
    g_mmap_rails.mmap_bytes += bytes;
    g_mmap_rails.live_bytes += bytes;
    g_mmap_rails.peak_live_bytes = std::max(g_mmap_rails.peak_live_bytes, g_mmap_rails.live_bytes);
    if (rails_heavy_enabled()) {
        g_mmap_rails.mmap_pc_hits[pc]++;
        g_mmap_rails.mmap_ra_hits[ra]++;
        const uint64_t ops = g_mmap_rails.mmap_ops + g_mmap_rails.munmap_ops;
        if ((ops % 512) == 0) {
            rails_emit_mmap_summary("periodic");
        }
    }
}

static inline void rails_note_mmap_fail(uint64_t pc) {
    g_mmap_rails.mmap_fails++;
    if (rails_heavy_enabled()) {
        g_mmap_rails.mmap_pc_hits[pc]++;
        const uint64_t ops = g_mmap_rails.mmap_ops + g_mmap_rails.munmap_ops + g_mmap_rails.mmap_fails;
        if ((ops % 256) == 0) {
            rails_emit_mmap_summary("mmap-fail");
        }
    }
}

static inline void rails_note_munmap(uint64_t pc, uint64_t ra, uint64_t bytes) {
    g_mmap_rails.munmap_ops++;
    g_mmap_rails.munmap_bytes += bytes;
    g_mmap_rails.live_bytes = (g_mmap_rails.live_bytes > bytes) ? (g_mmap_rails.live_bytes - bytes) : 0;
    if (rails_heavy_enabled()) {
        g_mmap_rails.munmap_pc_hits[pc]++;
        g_mmap_rails.munmap_ra_hits[ra]++;
        const uint64_t ops = g_mmap_rails.mmap_ops + g_mmap_rails.munmap_ops;
        if ((ops % 512) == 0) {
            rails_emit_mmap_summary("periodic");
        }
    }
}

static inline uint64_t arena_limit() {
    return (1ULL << riscv::encompassing_Nbit_arena);
}

static inline void sync_mmap_bump(Machine& m) {
    uint64_t cur_mmap_addr = m.memory.mmap_address();
    if (g_mmap_bump == 0 || g_mmap_bump < cur_mmap_addr) {
        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[mmap-sync] g_mmap_bump=0x%lx -> mmap_address=0x%lx\n",
                (long)g_mmap_bump, (long)cur_mmap_addr);
        g_mmap_bump = cur_mmap_addr;
    }
}

static inline void publish_mmap_bump(Machine& m) {
    if (g_mmap_bump > m.memory.mmap_address()) {
        m.memory.mmap_address() = g_mmap_bump;
    }
}

static inline void invalidate_reuse_cache(Machine& m, uint64_t addr, uint64_t len) {
    if (len == 0) return;
    if (addr + len <= m.memory.mmap_start()) return;
    const uint64_t clipped_addr = std::max<uint64_t>(addr, m.memory.mmap_start());
    const uint64_t clipped_end = addr + len;
    if (clipped_end > clipped_addr) {
        m.memory.mmap_cache().invalidate(clipped_addr, clipped_end - clipped_addr);
    }
}

static inline bool mmap_reuse_cache_eligible(uint64_t len) {
    // After a guest execve, musl/Node churn many short-lived 4K/8K anonymous
    // mappings during loader and allocator setup. Recycling those holes
    // aggressively diverges from Linux's more monotonic mmap layout and has
    // been observed to trip musl allocator consistency checks. Keep arena-top
    // shrinkage, but only recycle larger holes through the free-list once the
    // conservative post-execve mode is enabled.
    if (!g_conservative_small_mmap_reuse) {
        return true;
    }
    constexpr uint64_t MIN_REUSABLE_MMAP = 1ULL << 20; // 1 MiB
    return len >= MIN_REUSABLE_MMAP;
}

static inline bool keep_monotonic_small_anon_unmap(uint64_t addr, uint64_t len) {
    if (!g_conservative_small_mmap_reuse || len == 0) {
        return false;
    }
    constexpr uint64_t MIN_REUSABLE_MMAP = 1ULL << 20; // 1 MiB
    if (len >= MIN_REUSABLE_MMAP) {
        return false;
    }
    const auto* region = live_mmap_find(addr);
    if (region == nullptr || !region->anonymous) {
        return false;
    }
    const uint64_t region_end = region->addr + region->size;
    const uint64_t unmap_end = addr + len;
    return addr >= region->addr && unmap_end <= region_end;
}

struct AnonMapResult {
    uint64_t addr = 0;
    uint64_t aligned_len = 0;
    int error = 0;
    bool from_reuse_cache = false;
    bool ignored_hint = false;
};

static inline AnonMapResult alloc_anon_mapping(Machine& m, uint64_t addr_hint, uint64_t length, int flags) {
    constexpr int MAP_FIXED = 0x10;
    AnonMapResult out {};

    if (length == 0) {
        out.error = -22;
        return out;
    }

    sync_mmap_bump(m);

    const uint64_t limit = arena_limit();
    out.aligned_len = (length + 4095) & ~4095ULL;

    if (flags & MAP_FIXED) {
        if (addr_hint + out.aligned_len > limit) {
            out.error = -12;
            return out;
        }
        invalidate_reuse_cache(m, addr_hint, out.aligned_len);
        out.addr = addr_hint;
        g_mmap_bump = std::max(g_mmap_bump, addr_hint + out.aligned_len);
        publish_mmap_bump(m);
        return out;
    }

    if (addr_hint != 0 && addr_hint >= limit) {
        out.ignored_hint = true;
        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[mmap-hint-ignore] hint=0x%lx -> allocator, len=0x%lx\n",
                (long)addr_hint, (long)length);
        addr_hint = 0;
    }

    if (mmap_reuse_cache_eligible(out.aligned_len)) {
        auto reused = m.memory.mmap_cache().find(out.aligned_len);
        if (!reused.empty()) {
            out.addr = reused.addr;
            out.from_reuse_cache = true;
            return out;
        }
    }

    if (g_mmap_bump + out.aligned_len > limit) {
        if (out.aligned_len >= (64ULL << 20) && (limit > g_mmap_bump + (4ULL << 20))) {
            const uint64_t clamped = (limit - g_mmap_bump) & ~4095ULL;
            out.aligned_len = clamped;
        } else {
            out.error = -12;
            return out;
        }
    }

    out.addr = g_mmap_bump;
    g_mmap_bump += out.aligned_len;
    publish_mmap_bump(m);
    return out;
}

static inline uint64_t munmap_return_ra(Machine& m) {
    uint64_t munmap_ra = m.cpu.reg(1);
    if (m.cpu.pc() == 0x18035a8aULL) {
        try {
            munmap_ra = m.memory.template read<uint64_t>(m.cpu.reg(2) + 24);
        } catch (...) {}
    }
    return munmap_ra;
}

static inline void custom_unmap_range(Machine& m, uint64_t addr, uint64_t aligned_len, uint64_t pc, uint64_t ra) {
    const bool keep_monotonic = keep_monotonic_small_anon_unmap(addr, aligned_len);
    if (addr >= m.memory.mmap_start() && aligned_len > 0) {
        if (!keep_monotonic && g_mmap_bump != 0 && addr + aligned_len == g_mmap_bump) {
            g_mmap_bump = addr;
            if (m.memory.mmap_address() > g_mmap_bump) {
                m.memory.mmap_address() = g_mmap_bump;
            }
        } else if (!keep_monotonic && mmap_reuse_cache_eligible(aligned_len)) {
            m.memory.mmap_cache().insert(addr, aligned_len);
        }
    }
    rails_note_munmap(pc, ra, aligned_len);
}

// Perform the actual fork parent restore. Must be called OUTSIDE simulate()
// so that the next simulate() call starts with fresh decoder cache pointers.
void fork_parent_restore(Machine& m);

// Arena-aware memory copy helpers for fork save/restore.
// In encompassing arena mode, guest reads/writes go directly to the arena
// buffer, bypassing the page table. But Memory::memcpy/memcpy_out go through
// the page table, which can silently fail if pages are CoW (reading/writing
// to copied-out pages instead of the arena). These helpers access the arena
// directly when available.
inline void arena_memcpy_out(Machine& m, void* dst, uint64_t src, size_t len) {
    if constexpr (riscv::encompassing_Nbit_arena > 0) {
        auto* arena = (const uint8_t*)m.memory.memory_arena_ptr();
        if (arena && src + len <= m.memory.memory_arena_size()) {
            std::memcpy(dst, arena + src, len);
            return;
        }
        dbg_fprintf(stderr, "[arena_memcpy_out] FALLBACK: src=0x%lx len=0x%lx arena_size=0x%lx\n",
                (long)src, (long)len, (long)m.memory.memory_arena_size());
    }
    m.memory.memcpy_out(dst, src, len);
}
inline void arena_memcpy_in(Machine& m, uint64_t dst, const void* src, size_t len) {
    if constexpr (riscv::encompassing_Nbit_arena > 0) {
        auto* arena = (uint8_t*)m.memory.memory_arena_ptr();
        if (arena && dst + len <= m.memory.memory_arena_size()) {
            std::memcpy(arena + dst, src, len);
            return;
        }
    }
    m.memory.memcpy(dst, src, len);
}

#define TRACE_SC(name, ...) do { \
    if (g_trace_syscalls && g_trace_countdown-- > 0) \
        dbg_fprintf(stderr, "[TRACE] " name " pc=0x%lx\n", __VA_ARGS__, (long)m.cpu.pc()); \
} while(0)

// Network bridge function pointers (set by main.cpp after network.hpp is included).
// Avoids including network.hpp here (which would cause macro clashes with fcntl.h).
inline bool (*net_is_socket_fd)(int fd) = nullptr;
inline int  (*net_get_native_fd)(int fd) = nullptr;  // returns native fd or -1
inline void (*net_set_nonblock)(int fd, bool on) = nullptr;  // set O_NONBLOCK on native socket

// eventfd tracking: maps VFS fd → counter (0 means empty/not signaled)
inline std::unordered_map<int, uint64_t> g_eventfd_counters;
inline std::unordered_set<int> g_vh_fds;

// Epoll instance (forward declaration — used by eventfd write to wake sleeping threads)
struct EpollInterest {
    uint32_t events;
    uint64_t data;
};
struct EpollInstance {
    std::unordered_map<int, EpollInterest> interests;
};
inline std::unordered_map<int, EpollInstance> g_epoll_instances;
inline int g_next_epoll_fd = 2000;

// Linux itimerspec layout (two timespec64s = 32 bytes)
struct linux_itimerspec {
    int64_t interval_sec;
    int64_t interval_nsec;
    int64_t value_sec;
    int64_t value_nsec;
};

// timerfd tracking: maps VFS fd → expiration info
struct TimerFdState {
    uint64_t interval_ns;    // periodic interval (0 = one-shot)
    uint64_t expire_ns;      // next expiration time (monotonic ns, 0 = disarmed)
    uint64_t expirations;    // number of expirations since last read
};
inline std::unordered_map<int, TimerFdState> g_timerfd_states;

// Helper: current monotonic time in nanoseconds
inline uint64_t monotonic_ns() {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + (uint64_t)ts.tv_nsec;
}

// Helper: check and accumulate timerfd expirations
inline void timerfd_tick(int fd) {
    auto it = g_timerfd_states.find(fd);
    if (it == g_timerfd_states.end()) return;
    auto& st = it->second;
    if (st.expire_ns == 0) return;  // disarmed
    uint64_t now = monotonic_ns();
    if (now >= st.expire_ns) {
        if (st.interval_ns > 0) {
            // Count how many intervals have elapsed
            uint64_t elapsed = now - st.expire_ns;
            uint64_t n = 1 + elapsed / st.interval_ns;
            st.expirations += n;
            st.expire_ns += n * st.interval_ns;
        } else {
            st.expirations++;
            st.expire_ns = 0;  // one-shot: disarm
        }
    }
}

// Process model scaffolding for transition to host-orchestrated process semantics.
// Phase 0/1 goals:
// - explicit pid/ppid/pgid fields
// - explicit lifecycle state
// - deterministic identity for identity syscalls (getpid/getppid)
enum class ProcessEventKind : uint32_t {
    Spawn = 1,
    Exit = 2,
    WaitWakeup = 3,
    WaitBlocked = 4,  // Phase 2: parent yielded on wait4, child still running
};

struct ProcessEvent {
    uint32_t kind = 0;
    pid_t pid = 0;
    pid_t ppid = 0;
    pid_t pgid = 0;
    int32_t exit_status = 0;
};

enum class TaskState : uint8_t {
    Running = 0,
    Exited  = 1,
    Reaped  = 2,
};

struct ProcessInfo {
    pid_t pid  = 0;
    pid_t ppid = 0;
    pid_t pgid = 0;
    TaskState state = TaskState::Reaped;
    int32_t exit_status = 0;
};

struct ProcessModel {
    static constexpr size_t MAX_PROCS = 256;
    static constexpr size_t MAX_EVENTS = 64;
    std::array<ProcessInfo, MAX_PROCS> table{};
    int count = 0;
    pid_t current_pid = 1;
    pid_t current_ppid = 0;
    pid_t current_pgid = 1;
    pid_t next_pid = 100;
    bool initialized = false;
    std::array<ProcessEvent, MAX_EVENTS> event_ring{};
    int event_head = 0;
    int event_count = 0;

    void init() {
        if (initialized) return;
        table[0] = {1, 0, 1, TaskState::Running, 0};
        count = 1;
        next_pid = 100;
        initialized = true;
    }

    ProcessInfo* find(pid_t pid) {
        init();
        for (int i = 0; i < count; i++) {
            if (table[i].pid == pid) return &table[i];
        }
        return nullptr;
    }

    pid_t allocate_pid() {
        init();
        if (count >= (int)MAX_PROCS) {
            gc_reaped();
            if (count >= (int)MAX_PROCS) return -1;
        }
        return next_pid++;
    }

    bool register_process(pid_t pid, pid_t ppid, pid_t pgid) {
        init();
        if (count >= (int)MAX_PROCS) return false;
        table[count++] = {pid, ppid, pgid, TaskState::Running, 0};
        return true;
    }

    bool has_exited_child(pid_t ppid) {
        init();
        for (int i = 0; i < count; i++) {
            if (table[i].ppid == ppid && table[i].state == TaskState::Exited) {
                return true;
            }
        }
        return false;
    }

    // Find any waitable child of parent: exited first, then running.
    // wait_pid: -1 = any child, >0 = specific pid.
    ProcessInfo* find_waitable_child(pid_t ppid, pid_t wait_pid) {
        init();
        // First pass: exited children (prefer these for immediate reap)
        for (int i = 0; i < count; i++) {
            if (table[i].ppid == ppid && table[i].state == TaskState::Exited) {
                if (wait_pid <= 0 || table[i].pid == wait_pid)
                    return &table[i];
            }
        }
        // Second pass: running children (caller will block or WNOHANG)
        for (int i = 0; i < count; i++) {
            if (table[i].ppid == ppid && table[i].state == TaskState::Running) {
                if (wait_pid <= 0 || table[i].pid == wait_pid)
                    return &table[i];
            }
        }
        return nullptr;
    }

    pid_t spawn_child(pid_t ppid, pid_t pgid) {
        pid_t pid = allocate_pid();
        if (pid < 0) return -1;
        if (!register_process(pid, ppid, pgid)) return -1;
        return pid;
    }

    void set_current(pid_t pid) {
        init();
        auto* p = find(pid);
        if (!p) return;
        current_pid = pid;
        current_ppid = p->ppid;
        current_pgid = p->pgid;
    }

    bool mark_reaped(pid_t pid, int32_t status = 0) {
        init();
        auto* p = find(pid);
        if (!p) return false;
        p->state = TaskState::Reaped;
        p->exit_status = status;
        return true;
    }

    void mark_exited(pid_t pid, int32_t status) {
        init();
        auto* p = find(pid);
        if (!p) return;
        p->state = TaskState::Exited;
        p->exit_status = status;
    }

    bool push_event(ProcessEventKind kind, pid_t pid, pid_t ppid, pid_t pgid, int32_t exit_status) {
        if (event_count >= (int)MAX_EVENTS) {
            event_head = (event_head + 1) % (int)MAX_EVENTS;
            event_count--;
        }
        const int idx = (event_head + event_count) % (int)MAX_EVENTS;
        event_ring[idx] = {
            static_cast<uint32_t>(kind),
            pid,
            ppid,
            pgid,
            exit_status,
        };
        event_count++;
#ifdef __EMSCRIPTEN__
        EM_ASM({
            if (typeof Module._friscyEmitProcessEvent === 'function') {
                Module._friscyEmitProcessEvent(($0)|0, ($1)|0, ($2)|0, ($3)|0, ($4)|0);
            }
        }, static_cast<int>(kind), static_cast<int>(pid), static_cast<int>(ppid),
           static_cast<int>(pgid), static_cast<int>(exit_status));
#endif
        return true;
    }

    uint32_t drain_events(ProcessEvent* out, uint32_t max_events) {
        if (!out || max_events == 0) return 0;
        uint32_t n = std::min<uint32_t>(max_events, static_cast<uint32_t>(event_count));
        for (uint32_t i = 0; i < n; i++) {
            out[i] = event_ring[event_head];
            event_head = (event_head + 1) % (int)MAX_EVENTS;
            event_count--;
        }
        return n;
    }

    int pending_events() const {
        return event_count;
    }

    // Garbage-collect reaped process slots so the table doesn't fill up.
    // Called from allocate_pid when the table is full.
    void gc_reaped() {
        int dst = 0;
        for (int i = 0; i < count; i++) {
        if (table[i].state != TaskState::Reaped) {
                if (dst != i) table[dst] = table[i];
                dst++;
            }
        }
        count = dst;
    }

    // Check whether a pid exists and is not Reaped (for kill() validation).
    bool pid_exists(pid_t pid) {
        init();
        auto* p = find(pid);
        return p && p->state != TaskState::Reaped;
    }
};

inline ProcessModel g_process_model = {};

// Execution context saved from initial load — used by execve to
// reload binary segments and set up a fresh stack.
struct ExecContext {
    std::vector<uint8_t> exec_binary;    // Original main executable
    std::vector<uint8_t> interp_binary;  // Original interpreter (ld-musl)
    elf::ElfInfo exec_info;              // Adjusted ELF info (with PIE base)
    uint64_t exec_base = 0;             // PIE base for main executable
    uint64_t exec_rw_start = 0;         // First writable segment of main binary
    uint64_t exec_rw_end = 0;           // End of writable segments of main binary
    uint64_t interp_base = 0;           // Where interpreter was loaded
    uint64_t interp_rw_start = 0;       // First writable segment of interpreter
    uint64_t interp_rw_end = 0;         // End of writable segments of interpreter
    uint64_t interp_entry = 0;          // Interpreter entry point
    uint64_t original_stack_top = 0;    // Stack top from initial setup
    uint64_t heap_start = 0;            // Start of brk heap area
    uint64_t heap_size = 0;             // Size of brk heap area
    uint64_t brk_base = 0;             // Current binary's break base (end of BSS, page-aligned)
    uint64_t brk_current = 0;          // Current break pointer
    bool brk_overridden = false;       // True after execve sets up new brk
    std::vector<std::string> env;        // Environment variables
    bool dynamic = false;                // Using dynamic linker?
};

// Transitional process state for the old in-VM fork path.
// On clone()/clone3() (fork variant): save parent registers and return 0.
// Child execution currently uses g_fork restoration semantics while process ids
// and lifecycle are moved toward explicit model tracking (g_process_model).
// On exit_group()/exit() in child: restore parent registers and return child PID.
// On wait4(): still assumes the child exits before parent continues in this phase.
struct ForkState {
    uint64_t regs[32];  // Saved parent registers (x0-x31)
    uint64_t pc;        // Saved parent PC (the ecall instruction)
    int exit_status;    // Child's exit code
    pid_t child_pid;    // PID assigned to child
    bool in_child;      // True while "child" is running
    bool child_reaped;  // True after wait4 has reaped the child
    pid_t parent_pid;   // Parent process id captured on fork
    pid_t parent_pgid;  // Parent pgid captured on fork
    pid_t child_pgid;   // Child pgid for this fork child
    // Memory snapshots: saved at clone, restored when child exits.
    // With FLAT_RW_ARENA, all arena memory is contiguous so we can
    // save large ranges without worrying about unmapped pages.
    //   1. Data+BRK: exec_rw_start to brk_current (data/BSS + active brk)
    //   2. Interpreter data/BSS (ld-musl state)
    //   3. Stack (return addresses, locals)
    //   4. mmap'd pages: heap_start+heap_size to mmap pointer
    //      (TLS, malloc'd data — musl uses mmap not brk for malloc)
    struct MemRegion {
        std::vector<uint8_t> data;
        uint64_t addr;
        uint64_t size;
    };
    struct MmapRegion {
        std::vector<uint8_t> data;
        uint64_t addr = 0;
        uint64_t size = 0;
        riscv::PageAttributes attr {};
    };
    MemRegion exec_data;     // data/BSS + BRK region
    MemRegion interp_data;
    MemRegion stack_data;
    std::vector<MmapRegion> mmap_regions; // live guest mmap allocations only
    // VFS fd table snapshot: full clone of open file/dir handles.
    // Restored after child exits so child's close/dup2/open changes
    // are undone while preserving pipe buffer data.
    vfs::VirtualFS::FdSnapshot fd_snapshot;
    std::unordered_map<int, int> saved_cloexec_flags;
    std::unordered_map<int, int> saved_status_flags;
    std::set<int> saved_tty_fds;
    // Thread scheduler snapshot: saved as raw bytes to avoid ordering
    // dependency on ThreadScheduler definition. execve in fork child
    // resets g_sched; must restore parent's thread state on child exit.
    alignas(16) uint8_t saved_sched[8192];  // enough for ThreadScheduler (~5KB)
    uint64_t saved_mmap_address = 0;
    bool saved_conservative_small_mmap_reuse = false;
    bool saved_force_materialize_anon_mmap = false;
    ExecContext saved_exec_ctx;
    bool has_exec_ctx = false;
    bool child_did_execve = false;
};
inline std::vector<ForkState> g_fork_stack;
inline pid_t g_next_pid = 100;

// Access current fork state (top of stack)
inline ForkState& g_fork() {
    return g_fork_stack.back();
}
inline bool g_fork_active() {
    return !g_fork_stack.empty();
}
inline int32_t fork_child_pid() {
    return g_fork_active() ? static_cast<int32_t>(g_fork().child_pid) : 0;
}
inline ProcessState fork_state() {
    return fork_lifecycle().state;
}
inline bool fork_parent_waiting() { return fork_state() == ProcessState::ParentWaiting; }
inline bool fork_child_running() { return fork_state() == ProcessState::ChildRunning; }
inline bool fork_child_exited() { return fork_state() == ProcessState::ChildExited; }
inline bool fork_child_reaped() { return fork_state() == ProcessState::ChildReaped; }
inline bool fork_parent_restoring() { return fork_state() == ProcessState::ParentRestored; }
inline bool fork_parent_saved() { return fork_state() == ProcessState::ParentSaved; }
inline void fork_mark_child_running(Machine& m) {
    fork_set_state(m, ProcessState::ChildRunning, "fork", "child running");
}
inline void fork_mark_parent_waiting(Machine& m) {
    fork_set_state(m, ProcessState::ParentWaiting, "wait4", "parent waiting");
}
inline void fork_mark_child_exited(Machine& m) {
    fork_set_state(m, ProcessState::ChildExited, "exit", "child exit");
}
inline void fork_mark_child_execd(Machine& m) {
    fork_set_state(m, ProcessState::ChildExeced, "execve", "child execed");
}
inline void fork_mark_child_reaped(Machine& m) {
    fork_set_state(m, ProcessState::ChildReaped, "wait4", "child reaped");
}
inline void fork_mark_parent_restored(Machine& m) {
    fork_set_state(m, ProcessState::ParentRestored, "restore", "parent restored");
}

// Terminal (tty) state — stored per-fd for stdin/stdout/stderr.
// Makes isatty(0) return true, enables raw mode for interactive shells.
struct TermiosState {
    uint32_t c_iflag = 0x0500;  // ICRNL | IXON
    uint32_t c_oflag = 0x0005;  // OPOST | ONLCR
    uint32_t c_cflag = 0x00bf;  // CS8 | CREAD | CLOCAL
    uint32_t c_lflag = 0x8a3b;  // ECHO|ICANON|ISIG|IEXTEN|ECHOCTL|ECHOKE|ECHOE
    uint8_t  c_line  = 0;
    uint8_t  c_cc[19] = {};     // control characters
    uint32_t c_ispeed = 38400;
    uint32_t c_ospeed = 38400;

    bool is_raw() const {
        // Raw mode: ICANON and ECHO are off
        return (c_lflag & 0x0002) == 0;  // ICANON = 0x0002
    }

    void serialize(uint8_t buf[44]) const {
        std::memcpy(buf + 0,  &c_iflag, 4);
        std::memcpy(buf + 4,  &c_oflag, 4);
        std::memcpy(buf + 8,  &c_cflag, 4);
        std::memcpy(buf + 12, &c_lflag, 4);
        buf[16] = c_line;
        std::memcpy(buf + 17, c_cc, 19);
        std::memcpy(buf + 36, &c_ispeed, 4);
        std::memcpy(buf + 40, &c_ospeed, 4);
    }

    void deserialize(const uint8_t buf[44]) {
        std::memcpy(&c_iflag, buf + 0,  4);
        std::memcpy(&c_oflag, buf + 4,  4);
        std::memcpy(&c_cflag, buf + 8,  4);
        std::memcpy(&c_lflag, buf + 12, 4);
        c_line = buf[16];
        std::memcpy(c_cc, buf + 17, 19);
        std::memcpy(&c_ispeed, buf + 36, 4);
        std::memcpy(&c_ospeed, buf + 40, 4);
    }
};
// Shared termios for the tty (fd 0/1/2 all refer to the same terminal)
inline TermiosState g_termios;
// Track which fds are tty fds. In the browser we always present a terminal,
// but in native batch runs stdio should only be tty-backed when the host fds
// really are terminals.
inline std::set<int> g_tty_fds = [] {
    std::set<int> tty_fds;
#ifdef __EMSCRIPTEN__
    tty_fds.insert(0);
    tty_fds.insert(1);
    tty_fds.insert(2);
#else
    if (::isatty(STDIN_FILENO)) tty_fds.insert(0);
    if (::isatty(STDOUT_FILENO)) tty_fds.insert(1);
    if (::isatty(STDERR_FILENO)) tty_fds.insert(2);
#endif
    return tty_fds;
}();
// fcntl per-fd state
// - F_GETFD / F_SETFD -> g_fd_cloexec_flags (FD_CLOEXEC bit)
// - F_GETFL / F_SETFL -> g_fd_status_flags (O_* status flags)
inline std::unordered_map<int, int> g_fd_cloexec_flags;
inline std::unordered_map<int, int> g_fd_status_flags;
inline bool g_stdio_open[3] = {true, true, true};

// Cooperative thread scheduler for CLONE_THREAD.
// When clone creates a thread, we save the parent's state and let the child
// run. When the child calls futex_wait (it's idle), we switch back to the
// parent. This handles V8's pattern: create thread → main waits on futex →
// thread does work → thread wakes main.
struct VThread {
    uint64_t regs[32];
    uint64_t pc;
    int tid;
    bool active;      // Thread exists
    bool waiting;     // Blocked on futex_wait
    uint64_t futex_addr;  // Address being waited on (if waiting)
    int32_t futex_val;    // Expected value (if waiting)
    uint64_t clear_child_tid;  // CLONE_CHILD_CLEARTID address (written 0 + futex wake on exit)
    uint64_t syscall_budget;   // Syscalls remaining before forced yield
};
constexpr int MAX_VTHREADS = 16;
constexpr uint64_t THREAD_QUANTUM_MAIN = 200000;  // Main thread gets long slices
constexpr uint64_t THREAD_QUANTUM_BG   = 10000;   // Background threads yield quickly
struct ThreadScheduler {
    VThread threads[MAX_VTHREADS];
    int current = 0;      // Index of currently running thread
    int count = 0;         // Number of active threads

    void init(int main_tid) {
        threads[0].tid = main_tid;
        threads[0].active = true;
        threads[0].waiting = false;
        threads[0].clear_child_tid = 0;
        threads[0].syscall_budget = THREAD_QUANTUM_MAIN;
        current = 0;
        count = 1;
    }

    int add_thread(int tid) {
        for (int i = 0; i < MAX_VTHREADS; i++) {
            if (!threads[i].active) {
                threads[i].tid = tid;
                threads[i].active = true;
                threads[i].waiting = false;
                threads[i].clear_child_tid = 0;
                threads[i].syscall_budget = THREAD_QUANTUM_BG;
                count++;
                return i;
            }
        }
        return -1;  // No slots
    }

    // Find next runnable thread — prefer main thread (index 0)
    int next_runnable(int skip = -1) {
        // Priority: always check main thread first (it does the real work)
        if (0 != skip && threads[0].active && !threads[0].waiting) {
            return 0;
        }
        for (int i = 1; i < MAX_VTHREADS; i++) {
            if (i != skip && threads[i].active && !threads[i].waiting) {
                return i;
            }
        }
        return -1;
    }

    // Wake threads waiting on a given futex address
    int wake(uint64_t addr, int max_wake) {
        int woken = 0;
        for (int i = 0; i < MAX_VTHREADS && woken < max_wake; i++) {
            if (threads[i].active && threads[i].waiting && threads[i].futex_addr == addr) {
                threads[i].waiting = false;
                woken++;
            }
        }
        return woken;
    }

    void remove_thread(int tid) {
        for (int i = 0; i < MAX_VTHREADS; i++) {
            if (threads[i].active && threads[i].tid == tid) {
                threads[i].active = false;
                threads[i].waiting = false;
                count--;
                return;
            }
        }
    }
};
inline ThreadScheduler g_sched;

// Save machine state into a VThread slot
inline void save_thread(Machine& m, VThread& t) {
    for (int i = 0; i < 32; i++) t.regs[i] = m.cpu.reg(i);
    t.pc = m.cpu.pc();
}

// Restore machine state from a VThread slot
inline void restore_thread(Machine& m, VThread& t) {
    for (int i = 0; i < 32; i++) m.cpu.reg(i) = t.regs[i];
    m.cpu.jump(t.pc);
}

// Switch from current thread to target thread
inline bool switch_to_thread(Machine& m, int target_idx) {
    if (target_idx < 0 || target_idx == g_sched.current) return false;
    auto& cur = g_sched.threads[g_sched.current];
    auto& tgt = g_sched.threads[target_idx];
    save_thread(m, cur);
    restore_thread(m, tgt);

    g_sched.current = target_idx;
    // Reset target's budget — main thread gets longer slices
    tgt.syscall_budget = (target_idx == 0) ? THREAD_QUANTUM_MAIN : THREAD_QUANTUM_BG;
    return true;
}

// Preemptive yield: called from hot-path syscalls (clock_gettime, etc.).
// Decrements current thread's budget; when exhausted, switches to next runnable.
inline void maybe_preempt(Machine& m) {
    (void)m;
    // Opportunistic syscall-tail preemption is currently unsafe for musl's
    // pthread startup path: switching the active vthread before the dispatcher
    // finishes the syscall return sequence can corrupt the resumed control flow.
    // Keep scheduling cooperative at explicit blocking points for now.
    return;
    if (g_sched.count <= 1) return;
    auto& cur = g_sched.threads[g_sched.current];
    if (cur.syscall_budget > 0) {
        cur.syscall_budget--;
        return;
    }
    // Budget exhausted — find another runnable thread
    int next = g_sched.next_runnable(g_sched.current);
    if (next >= 0) {
        static int preempt_count = 0;
        if (++preempt_count <= 20)
            dbg_fprintf(stderr, "[preempt] t%d -> t%d (quantum exhausted)\n",
                    g_sched.current, next);
        switch_to_thread(m, next);
    } else {
        // No other runnable thread, reset our budget
        cur.syscall_budget = (g_sched.current == 0) ? THREAD_QUANTUM_MAIN : THREAD_QUANTUM_BG;
    }
}

inline ExecContext g_exec_ctx;

// RISC-V 64-bit syscall numbers (from Linux kernel)
namespace nr {
    constexpr int getcwd        = 17;
    constexpr int dup           = 23;
    constexpr int dup3          = 24;
    constexpr int fcntl         = 25;
    constexpr int ioctl         = 29;
    constexpr int mkdirat       = 34;
    constexpr int unlinkat      = 35;
    constexpr int symlinkat     = 36;
    constexpr int linkat        = 37;
    constexpr int renameat      = 38;
    constexpr int renameat2     = 276;
    constexpr int ftruncate     = 46;
    constexpr int faccessat     = 48;
    constexpr int chdir         = 49;
    constexpr int openat        = 56;
    constexpr int close         = 57;
    constexpr int pipe2         = 59;
    constexpr int getdents64    = 61;
    constexpr int lseek         = 62;
    constexpr int read          = 63;
    constexpr int write         = 64;
    constexpr int readv         = 65;
    constexpr int writev        = 66;
    constexpr int pread64       = 67;
    constexpr int pwrite64      = 68;
    constexpr int sendfile      = 71;
    constexpr int pselect6      = 72;
    constexpr int ppoll         = 73;
    constexpr int readlinkat    = 78;
    constexpr int newfstatat    = 79;
    constexpr int fstat         = 80;
    constexpr int exit          = 93;
    constexpr int exit_group    = 94;
    constexpr int set_tid_address = 96;
    constexpr int set_robust_list = 99;
    constexpr int clock_gettime = 113;
    constexpr int sigaction     = 134;
    constexpr int sigprocmask   = 135;
    constexpr int getpid        = 172;
    constexpr int getppid       = 173;
    constexpr int getuid        = 174;
    constexpr int geteuid       = 175;
    constexpr int getgid        = 176;
    constexpr int getegid       = 177;
    constexpr int gettid        = 178;
    constexpr int sysinfo       = 179;
    constexpr int brk           = 214;
    constexpr int munmap        = 215;
    constexpr int clone         = 220;
    constexpr int execve        = 221;
    constexpr int mmap          = 222;
    constexpr int mprotect      = 226;
    constexpr int wait4         = 260;
    constexpr int prlimit64     = 261;
    constexpr int eventfd2      = 19;
    constexpr int epoll_create1 = 20;
    constexpr int epoll_ctl     = 21;
    constexpr int epoll_pwait   = 22;
    constexpr int capget        = 90;
    constexpr int futex         = 98;
    constexpr int nanosleep     = 101;
    constexpr int sched_getscheduler = 120;
    constexpr int sched_getparam     = 121;
    constexpr int sched_getaffinity  = 123;
    constexpr int uname         = 160;
    constexpr int getrlimit     = 163;
    constexpr int prctl         = 167;
    constexpr int mremap        = 216;
    constexpr int madvise       = 233;
    constexpr int getrandom     = 278;
    constexpr int flock         = 32;
    constexpr int fchmod        = 52;
    constexpr int fchmodat      = 53;
    constexpr int fchownat      = 54;
    constexpr int pwritev       = 70;
    constexpr int fsync         = 82;
    constexpr int sched_yield   = 124;
    constexpr int kill          = 129;
    constexpr int tkill         = 130;
    constexpr int tgkill        = 131;
    constexpr int sigaltstack   = 132;
    constexpr int rt_sigreturn  = 139;
    constexpr int getresuid     = 148;
    constexpr int getresgid     = 150;
    constexpr int setpgid       = 154;
    constexpr int getpgid       = 155;
    constexpr int setsid        = 157;
    constexpr int getgroups     = 158;
    constexpr int umask         = 166;
    constexpr int socketpair    = 199;
    constexpr int sendmsg       = 211;
    constexpr int clock_getres  = 114;
    constexpr int recvmsg       = 212;
    constexpr int membarrier    = 283;
    constexpr int statx         = 291;
    constexpr int close_range   = 436;
    constexpr int openat2       = 437;
    constexpr int rseq          = 293;
    constexpr int io_uring_setup = 425;
    constexpr int clone3        = 435;
    constexpr int faccessat2    = 439;
    constexpr int timerfd_create = 85;
    constexpr int timerfd_settime = 86;
    constexpr int timerfd_gettime = 87;
    constexpr int timer_create   = 107;
    constexpr int timer_gettime  = 108;
    constexpr int timer_getoverrun = 109;
    constexpr int timer_settime  = 110;
    constexpr int timer_delete   = 111;
    constexpr int rt_sigsuspend  = 133;
    constexpr int sendto         = 206;
    constexpr int recvfrom       = 207;
    constexpr int sendmmsg       = 269;
    constexpr int io_uring_enter = 426;
    constexpr int statfs         = 43;
    constexpr int fstatfs        = 44;
    constexpr int getxattr       = 8;
    constexpr int lgetxattr      = 9;
    constexpr int fgetxattr      = 10;
    constexpr int listxattr      = 11;
    constexpr int llistxattr     = 12;
    constexpr int flistxattr     = 13;
    constexpr int setfsuid       = 151;
    constexpr int setfsgid       = 152;
    constexpr int getsockopt     = 209;
    constexpr int riscv_hwprobe  = 258;
}

// Linux stat64 structure for RISC-V 64
struct linux_stat64 {
    uint64_t st_dev;
    uint64_t st_ino;
    uint32_t st_mode;
    uint32_t st_nlink;
    uint32_t st_uid;
    uint32_t st_gid;
    uint64_t st_rdev;
    uint64_t __pad1;
    int64_t  st_size;
    int32_t  st_blksize;
    int32_t  __pad2;
    int64_t  st_blocks;
    int64_t  st_atime_sec;
    int64_t  st_atime_nsec;
    int64_t  st_mtime_sec;
    int64_t  st_mtime_nsec;
    int64_t  st_ctime_sec;
    int64_t  st_ctime_nsec;
    int32_t  __unused[2];
};

// Linux timespec
struct linux_timespec {
    int64_t tv_sec;
    int64_t tv_nsec;
};

// AT_* constants
constexpr int AT_FDCWD = -100;
constexpr int AT_EMPTY_PATH = 0x1000;
constexpr int AT_SYMLINK_NOFOLLOW = 0x100;

// O_* flags
constexpr int O_RDONLY = 0;
constexpr int O_WRONLY = 1;
constexpr int O_RDWR = 2;
constexpr int O_CREAT = 0100;
constexpr int O_EXCL = 0200;
constexpr int O_TRUNC = 01000;
constexpr int O_APPEND = 02000;
constexpr int O_NONBLOCK = 04000;
constexpr int O_DIRECTORY = 0200000;
constexpr int O_CLOEXEC = 02000000;

// Error codes (negated for syscall return values)
namespace err {
    constexpr int64_t NOENT = -2;
    constexpr int64_t NXIO = -6;
    constexpr int64_t BADF = -9;
    constexpr int64_t ACCES = -13;
    constexpr int64_t EXIST = -17;
    constexpr int64_t NOTDIR = -20;
    constexpr int64_t ISDIR = -21;
    constexpr int64_t INVAL = -22;
    constexpr int64_t NOTTY = -25;
    constexpr int64_t NOSYS = -38;
    constexpr int64_t NOTSUP = -95;
}

// Context passed via machine userdata
struct SyscallContext {
    vfs::VirtualFS* fs;
    std::mt19937 rng;

    SyscallContext(vfs::VirtualFS* vfs) : fs(vfs) {
        std::random_device rd;
        rng.seed(rd());
    }
};

// Helper to get context from machine
inline SyscallContext* get_ctx(Machine& m) {
    return m.template get_userdata<SyscallContext>();
}

// Helper to check if fd is managed by VectorHeart/JSPI
inline bool is_vh_fd(int fd) {
    return g_vh_fds.count(fd) > 0;
}

// Helper to get VFS from machine
inline vfs::VirtualFS& get_fs(Machine& m) {
    return *get_ctx(m)->fs;
}

// Syscall handlers (static functions, no captures)
namespace handlers {

// Forward declaration — sys_exit has the fork parent restore logic
static void sys_exit(Machine& m);

// exit_group — terminate all threads and stop the machine
static void sys_exit_group(Machine& m) {
    int exit_code = m.template sysarg<int>(0);
    if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[exit_group] code=%d from thread t%d (tid=%d)\n",
            exit_code, g_sched.current,
            g_sched.count > 0 ? g_sched.threads[g_sched.current].tid : -1);

    // If we're in a fork child, delegate to sys_exit which has the
    // parent restore logic (restores registers, memory, jumps back).
    if (g_fork_active()) {
        sys_exit(m);
        return;
    }

    // Kill all cooperative threads
    for (int i = 0; i < MAX_VTHREADS; i++) {
        g_sched.threads[i].active = false;
        g_sched.threads[i].waiting = false;
    }
    g_sched.count = 0;

    m.stop();
    m.set_result(exit_code);
}

static void sys_exit(Machine& m) {
    // Fork child exit must be handled before cooperative thread teardown.
    // Otherwise a fork child running on a non-main scheduler slot can be
    // consumed by the thread-exit path, skipping process-model exit/wakeup.
    if (g_fork_active()) {
        goto fork_child_exit;
    }

    // If a cooperative thread is exiting (not the main thread or a fork child),
    // remove it from the scheduler and switch to another thread.
    if (g_sched.count > 1 && g_sched.current != 0) {
        int exiting = g_sched.current;
        auto& t = g_sched.threads[exiting];
        int exit_code = m.template sysarg<int>(0);
        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[exit] thread tid=%d exit_code=%d, switching\n", t.tid, exit_code);

        // CLONE_CHILD_CLEARTID: write 0 to clear_child_tid and futex_wake it
        // This is how pthread_join detects thread completion.
        if (t.clear_child_tid != 0) {
            m.memory.template write<int32_t>(t.clear_child_tid, 0);
            g_sched.wake(t.clear_child_tid, 1);
            if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[exit] cleared child_tid at 0x%lx\n", (long)t.clear_child_tid);
        }

        // Remove this thread
        t.active = false;
        t.waiting = false;
        g_sched.count--;

        // Switch to main thread (index 0) or any runnable thread
        int next = g_sched.next_runnable(exiting);
        if (next >= 0) {
            restore_thread(m, g_sched.threads[next]);
            g_sched.current = next;
            return;
        }
        // No other threads — fall through to actual exit
    }

    if (g_fork_active() && g_fork().in_child) {
fork_child_exit:
        // "Child" is exiting — record exit status and stop machine.
        // The actual parent restore happens OUTSIDE simulate() via
        // fork_parent_restore(), because evicting execute segments inside
        // simulate() leaves its local decoder cache pointers dangling.
        g_fork().exit_status = m.template sysarg<int>(0);
        fork_mark_child_exited(m);
        dbg_fprintf(stderr,
                "[fork-exit] child_pid=%d parent_pid=%d status=%d pc=0x%lx sp=0x%lx execve=%d\n",
                g_fork().child_pid,
                g_fork().parent_pid,
                g_fork().exit_status,
                (long)m.cpu.pc(),
                (long)m.cpu.reg(riscv::REG_SP),
                (int)g_fork().child_did_execve);
        g_process_model.push_event(
            ProcessEventKind::Exit,
            g_fork().child_pid,
            g_fork().parent_pid,
            g_fork().child_pgid,
            g_fork().exit_status);
        g_process_model.mark_exited(g_fork().child_pid, g_fork().exit_status);
        m.stop();
        fprintf(stderr,
                "[fork-exit] stop requested stopped=%d state=%s current_pid=%d\n",
                (int)m.stopped(),
                process_state_name(fork_state()),
                (int)g_process_model.current_pid);
        return;
    }
    int exit_code = m.template sysarg<int>(0);
    if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[exit] main thread exit code=%d\n", exit_code);
    m.stop();
    m.set_result(exit_code);
}

} // namespace handlers

// Perform fork parent restore. Called OUTSIDE simulate() after the child
// exits and the machine stops. This ensures the decoder cache is properly
// invalidated — evicting execute segments inside simulate() leaves its
// local decoder pointers dangling (use-after-free on decoder cache).
inline void fork_parent_restore(Machine& m) {
    if (!g_fork_active()) {
        dbg_fprintf(stderr, "[fork-restore] no active fork state\n");
        return;
    }
    if (fork_state() != ProcessState::ChildExited) {
        expect_transition(fork_state(), ProcessState::ParentRestored, "restore", "restore parent context without child exit");
    }
    fork_set_state(m, ProcessState::ParentRestored, "restore", "restore parent context");
    fprintf(stderr,
            "[fork-restore] begin child_pid=%d parent_pid=%d exit_status=%d child_reaped=%d child_execve=%d current_pid=%d wait_child=%d wait_pid=%d state=%s\n",
            g_fork().child_pid,
            g_fork().parent_pid,
            g_fork().exit_status,
            (int)g_fork().child_reaped,
            (int)g_fork().child_did_execve,
            (int)g_process_model.current_pid,
            (int)fork_parent_waiting(),
            (int)g_wait_blocked_pid,
            process_state_name(fork_state()));
    g_fork().in_child = false;

    // Reload parent executable/interpreter text segments
    if (g_fork().has_exec_ctx) {
        const auto& parent_ctx = g_fork().saved_exec_ctx;
        try {
            m.memory.evict_execute_segments();
            // Only reload text if the child did execve (loaded a different binary).
            // For fork-without-exec (subshell), text is unchanged — skip to avoid
            // re-zeroing BSS pages that the data restore will overwrite anyway.
            if (g_fork().child_did_execve) {
                if (!parent_ctx.exec_binary.empty()) {
                    uint64_t load_base = 0;
                    if (parent_ctx.exec_info.type == elf::ET_DYN) {
                        auto [plo, phi] = elf::get_load_range(parent_ctx.exec_binary);
                        (void)phi;
                        load_base = (parent_ctx.exec_base >= plo)
                            ? (parent_ctx.exec_base - plo)
                            : parent_ctx.exec_base;
                    }
                    dynlink::load_elf_segments(m, parent_ctx.exec_binary, load_base);
                }
                if (!parent_ctx.interp_binary.empty() && parent_ctx.interp_base != 0) {
                    dynlink::load_elf_segments(m, parent_ctx.interp_binary, parent_ctx.interp_base);
                }
            }
        } catch (const std::exception& e) {
            dbg_fprintf(stderr, "[fork] parent segment reload failed: %s\n", e.what());
        }
    }

    // Fix page permissions BEFORE restoring memory
    auto fix_perms = [&](uint64_t addr, uint64_t size) {
        if (addr > 0 && size > 0) {
            riscv::PageAttributes attr;
            attr.read = true;
            attr.write = true;
            attr.exec = true;
            m.memory.set_page_attr(addr, size, attr);
        }
    };
    fix_perms(g_fork().exec_data.addr, g_fork().exec_data.size);
    fix_perms(g_fork().interp_data.addr, g_fork().interp_data.size);
    fix_perms(g_fork().stack_data.addr, g_fork().stack_data.size);

    // Restore parent memory using arena-aware copy (see arena_memcpy_in).
    auto restore = [&](ForkState::MemRegion& r, const char* name) {
        if (!r.data.empty()) {
            arena_memcpy_in(m, r.addr, r.data.data(), r.size);
            r.data.clear();
            r.data.shrink_to_fit();
        }
    };
    size_t mmap_restore_bytes = 0;
    for (const auto& region : g_fork().mmap_regions) mmap_restore_bytes += region.size;
    fprintf(stderr, "[fork-restore] exec=[0x%lx+0x%lx] interp=[0x%lx+0x%lx] "
            "stack=[0x%lx+0x%lx] mmap_regions=%zu mmap_bytes=0x%zx\n",
            (long)g_fork().exec_data.addr, (long)g_fork().exec_data.size,
            (long)g_fork().interp_data.addr, (long)g_fork().interp_data.size,
            (long)g_fork().stack_data.addr, (long)g_fork().stack_data.size,
            g_fork().mmap_regions.size(), mmap_restore_bytes);
    restore(g_fork().exec_data, "exec");
    restore(g_fork().interp_data, "interp");
    restore(g_fork().stack_data, "stack");
    if (!g_live_mmap_regions.empty()) {
        // After a child execve, the arena contains large child-only mappings
        // that no longer belong to the restored parent. In encompassing-arena
        // mode, aggressively zeroing and PROT_NONE'ing every child region here
        // can fault mid-restore and is not required for correctness: the
        // parent's saved mmap regions are restored explicitly below, the mmap
        // frontier is reset, and fresh anonymous mappings are zero-filled on
        // allocation. Drop the child live-map view and let the parent snapshot
        // become authoritative.
        g_live_mmap_regions.clear();
    }
    for (auto& region : g_fork().mmap_regions) {
        if (region.size == 0) continue;
        riscv::PageAttributes rwx;
        rwx.read = true;
        rwx.write = true;
        rwx.exec = true;
        m.memory.set_page_attr(region.addr, region.size, rwx);
        if (!region.data.empty()) {
            arena_memcpy_in(m, region.addr, region.data.data(), region.size);
            region.data.clear();
            region.data.shrink_to_fit();
        }
        m.memory.set_page_attr(region.addr, region.size, region.attr);
        live_mmap_map(region.addr, region.size, region.attr);
    }
    g_fork().mmap_regions.clear();

    // Restore VFS fd table from snapshot. This undoes the child's
    // close/dup2/open while preserving pipe buffer data (shared_ptr<Entry>).
    get_fs(m).restore_fds(g_fork().fd_snapshot);
    g_fd_cloexec_flags = std::move(g_fork().saved_cloexec_flags);
    g_fd_status_flags = std::move(g_fork().saved_status_flags);
    g_tty_fds = std::move(g_fork().saved_tty_fds);

    // Restore cooperative thread scheduler state
    std::memcpy(&g_sched, g_fork().saved_sched, sizeof(g_sched));

    // Restore parent memory layout metadata
    if (g_fork().saved_mmap_address > 0) {
        m.memory.mmap_address() = g_fork().saved_mmap_address;
        // Reset mmap bump pointer to match — child may have advanced it
        g_mmap_bump = g_fork().saved_mmap_address;
    }
    g_conservative_small_mmap_reuse = g_fork().saved_conservative_small_mmap_reuse;
    g_force_materialize_anon_mmap = g_fork().saved_force_materialize_anon_mmap;
    // Clear stale mmap free-list entries from child's execution
    m.memory.mmap_cache() = {};
    if (g_fork().has_exec_ctx) {
        g_exec_ctx = g_fork().saved_exec_ctx;
        g_fork().has_exec_ctx = false;
    }

    // Restore parent registers
    for (int i = 1; i < 32; i++) {
        m.cpu.reg(i) = g_fork().regs[i];
    }
    g_process_model.set_current(g_fork().parent_pid);
    m.cpu.jump(g_fork().pc);
    m.set_result(g_fork().child_pid);
    fprintf(stderr,
            "[fork-restore] resume parent_pid=%d child_pid=%d pc=0x%lx a0=%ld sp=0x%lx current_pid=%d mmap=0x%lx brk=0x%lx\n",
            g_fork().parent_pid,
            g_fork().child_pid,
            (long)g_fork().pc,
            (long)m.cpu.reg(10),
            (long)m.cpu.reg(riscv::REG_SP),
            (int)g_process_model.current_pid,
            (long)m.memory.mmap_address(),
            (long)g_exec_ctx.brk_current);

    // Pop this fork frame — parent is now the active context
    g_fork_stack.pop_back();
}

namespace handlers {

static void dump_guest_qwords(Machine& m, const char* label, uint64_t base, int count);

// Signal mask and action state — needed early by sys_execve
inline uint64_t g_signal_mask[2] = {0, 0};
inline uint8_t g_sigactions[64][40] = {};

// POSIX timer state — needed early by sys_execve
struct PosixTimerState {
    int clockid;
    int signo;
    uint64_t interval_ns;
    uint64_t expire_ns;
    uint64_t overruns;
};
inline std::unordered_map<int, PosixTimerState> g_posix_timers;
inline int g_next_timer_id = 1;

// clone — cooperative vfork emulation for single-process emulator.
// Saves parent state, returns 0 (child context). When child calls
// exit/exit_group, parent state is restored with child PID as return.
static void sys_clone(Machine& m) {
    uint64_t flags = m.sysarg(0);
    auto ensure_sched_bootstrap = []() -> int {
        const int main_tid = (g_sched.count > 0)
            ? g_sched.threads[g_sched.current].tid
            : static_cast<int>(g_process_model.current_pid);
        if (g_sched.count == 0) {
            g_sched.init(main_tid);
        }
        if (g_next_pid <= main_tid) {
            g_next_pid = main_tid + 1;
        }
        return main_tid;
    };

    // Check if this is thread creation (CLONE_VM | CLONE_THREAD)
    // vs fork (flags == SIGCHLD or CLONE_VFORK | CLONE_VM | SIGCHLD)
    constexpr uint64_t F_CLONE_VM     = 0x00000100;
    constexpr uint64_t F_CLONE_THREAD = 0x00010000;
    constexpr uint64_t F_CLONE_VFORK  = 0x00004000;

    // Plain fork (SIGCHLD only) falls through to cooperative vfork path below.
    // Previously this was a fast-path that created a fake dead child, but that
    // prevented bash fork+exec from working (child never ran, never called execve).

    if ((flags & F_CLONE_THREAD) || ((flags & F_CLONE_VM) && !(flags & F_CLONE_VFORK))) {
        // Thread creation with cooperative scheduling.
        // Save parent state, enqueue a child thread, and keep executing in
        // the parent. pthread_create expects clone() to return the child TID
        // in the parent immediately; running the child inline here makes the
        // parent believe the thread exists while we are actually executing on
        // the child's stack, which quickly derails startup.
        constexpr uint64_t F_CLONE_PARENT_SETTID  = 0x00100000;
        constexpr uint64_t F_CLONE_CHILD_CLEARTID = 0x00200000;
        constexpr uint64_t F_CLONE_SETTLS         = 0x00080000;

        ensure_sched_bootstrap();
        int tid = g_next_pid++;
        auto child_stack = m.sysarg(1);

        // Write TID to parent_tidptr if requested
        if (flags & F_CLONE_PARENT_SETTID) {
            auto parent_tidptr = m.sysarg(2);
            if (parent_tidptr != 0) {
                m.memory.template write<int32_t>(parent_tidptr, tid);
            }
        }

        // Add child thread slot
        int child_idx = g_sched.add_thread(tid);
        if (child_idx < 0) {
            // No thread slots — fall back to fake thread
            if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[clone] thread slots full, faking tid=%d\n", tid);
            m.set_result(tid);
            return;
        }

        // Save parent state: registers are at the point of the ecall.
        int parent_idx = g_sched.current;
        save_thread(m, g_sched.threads[parent_idx]);
        g_sched.threads[parent_idx].regs[10] = (uint64_t)tid;

        // Seed the child with a copy of the parent's post-syscall state, then
        // adjust the thread-specific registers.
        auto& child = g_sched.threads[child_idx];
        std::memcpy(child.regs, g_sched.threads[parent_idx].regs, sizeof(child.regs));
        child.pc = g_sched.threads[parent_idx].pc;
        child.regs[riscv::REG_SP] = child_stack;
        child.regs[10] = 0;  // Child sees clone() return 0.
        if (flags & F_CLONE_SETTLS) {
            auto tls = m.sysarg(3);
            child.regs[4] = tls;  // tp register = x4
        }

        // Handle CLONE_CHILD_CLEARTID: store address to clear+wake on thread exit
        if (flags & F_CLONE_CHILD_CLEARTID) {
            auto child_tidptr = m.sysarg(4);
            child.clear_child_tid = child_tidptr;
        }

        static int thread_count = 0;
        if (++thread_count <= 10) {
            if (g_trace_syscalls && g_trace_countdown-- > 0) {
                const uint64_t tls = (flags & F_CLONE_SETTLS) ? m.sysarg(3) : 0;
                dbg_fprintf(stderr,
                        "[clone] thread #%d cooperative tid=%d flags=0x%lx stack=0x%lx parent_tidptr=0x%lx tls=0x%lx child_tidptr=0x%lx\n",
                        thread_count, tid, (long)flags, (long)child_stack,
                        (long)m.sysarg(2), (long)tls, (long)m.sysarg(4));
                dump_guest_qwords(m, "[clone] child-stack:", child_stack, 6);
                if (tls >= 0x20) {
                    dump_guest_qwords(m, "[clone] tls-window:", tls - 0x20, 8);
                }
            }
        }

        // Continue in the parent; the cooperative scheduler will run the child
        // when the parent blocks or yields.
        m.set_result(tid);
        return;
    }

    auto child_stack = m.sysarg(1);
    if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[clone] fork flags=0x%lx child_stack=0x%lx\n",
            (long)flags, (long)child_stack);

    // Push a new fork frame (supports nested forks for pipes)
    g_fork_stack.emplace_back();

    // Save parent registers
    for (int i = 0; i < 32; i++) {
        g_fork().regs[i] = m.cpu.reg(i);
    }
    g_process_model.init();
    g_fork().pc = m.cpu.pc() + 4;  // Advance past the ecall instruction
    g_fork().parent_pid = g_process_model.current_pid;
    g_fork().parent_pgid = g_process_model.current_pgid;
    g_fork().child_pid = g_process_model.allocate_pid();
    if (g_fork().child_pid < 0) {
        g_fork_stack.pop_back();
        m.set_result(-12);  // -ENOMEM
        return;
    }
    g_fork().child_pgid = g_fork().child_pid;
    if (!g_process_model.register_process(g_fork().child_pid, g_fork().parent_pid, g_fork().child_pgid)) {
        g_fork_stack.pop_back();
        m.set_result(-12);  // -ENOMEM
        return;
    }
    g_process_model.push_event(ProcessEventKind::Spawn, g_fork().child_pid, g_fork().parent_pid, g_fork().child_pgid, 0);
    g_fork().exit_status = 0;

    // Set child's stack pointer if provided (non-zero).
    // musl's __clone stores the child function pointer and arg
    // on the child stack before calling clone(). The child's code
    // loads these from SP after clone returns 0.
    if (child_stack != 0) {
        m.cpu.reg(riscv::REG_SP) = child_stack;
    }

    // Save parent memory BEFORE setting in_child.
    // If memcpy_out throws (e.g. protection fault on RELRO pages),
    // the exception propagates to the retry loop. On retry, the ecall
    // re-enters this handler. With in_child still false, we retry the
    // save (now with the faulting page made RWX by the retry handler).
    //
    // Memory layout (for PIE at 0x40000):
    //   exec_rw_start..exec_rw_end : data/BSS (globals, GOT, .bss)
    //   exec_rw_end..heap_start   : BRK region (musl small allocs)
    //   heap_start..+heap_size    : native heap (from mmap_allocate)
    //   heap_start+heap_size..mmap: guest mmap (TLS, libc malloc pages)
    //
    // Region 1: main binary writable segments + BRK heap.
    // Covers data/BSS/GOT (exec_rw_start..exec_rw_end) and the BRK
    // region (exec_rw_end..heap_start) where musl puts small allocs
    // (shell variables like $PWD live here).
    {
        uint64_t brk_end = (g_exec_ctx.brk_current > 0)
                         ? g_exec_ctx.brk_current
                         : g_exec_ctx.exec_rw_end;
        if (brk_end < g_exec_ctx.exec_rw_end) brk_end = g_exec_ctx.exec_rw_end;
        uint64_t save_start = g_exec_ctx.exec_rw_start;
        uint64_t save_end = brk_end;
        if (save_start > 0 && save_end > save_start) {
            // BRK pages may not have read attrs yet — make them readable.
            riscv::PageAttributes attr;
            attr.read = true; attr.write = true; attr.exec = true;
            m.memory.set_page_attr(save_start, save_end - save_start, attr);

            auto& r = g_fork().exec_data;
            r.addr = save_start;
            r.size = save_end - save_start;
            r.data.resize(r.size);
            arena_memcpy_out(m, r.data.data(), r.addr, r.size);
        }
    }

    // Region 2: interpreter writable segments + TLS/pthread overhead.
    // musl's TLS and pthread struct live at/above the thread pointer (tp),
    // which is typically near the end of the BSS. The pthread struct can
    // extend BEYOND interp_rw_end. Add extra pages to capture it.
    if (g_exec_ctx.interp_rw_start > 0 && g_exec_ctx.interp_rw_end > g_exec_ctx.interp_rw_start) {
        auto& r = g_fork().interp_data;
        r.addr = g_exec_ctx.interp_rw_start;
        // Extend to heap_start to capture TLS/pthread struct and any other
        // data between BSS end and the native heap
        uint64_t interp_save_end = g_exec_ctx.heap_start;
        if (interp_save_end <= g_exec_ctx.interp_rw_end)
            interp_save_end = (g_exec_ctx.interp_rw_end + 0x1000) & ~0xFFFULL;
        r.size = interp_save_end - r.addr;
        r.data.resize(r.size);
        arena_memcpy_out(m, r.data.data(), r.addr, r.size);
    }

    // Region 3: stack (SP to stack top)
    {
        uint64_t sp = m.cpu.reg(riscv::REG_SP);
        uint64_t stack_top = g_exec_ctx.original_stack_top;
        auto& r = g_fork().stack_data;
        r.addr = sp;
        r.size = stack_top - sp;
        r.data.resize(r.size);
        arena_memcpy_out(m, r.data.data(), r.addr, r.size);
    }

    // Region 4: save only live mmap mappings, not the entire mmap frontier.
    {
        size_t mmap_snapshot_bytes = 0;
        for (const auto& [addr, region] : g_live_mmap_regions) {
            (void)addr;
            auto& saved = g_fork().mmap_regions.emplace_back();
            saved.addr = region.addr;
            saved.size = region.size;
            saved.attr = region.attr;
            saved.data.resize(saved.size);
            arena_memcpy_out(m, saved.data.data(), saved.addr, saved.size);
            mmap_snapshot_bytes += saved.size;
        }
        fprintf(stderr, "[fork-save] regions: exec=[0x%lx,0x%lx) interp=[0x%lx,0x%lx) "
                "stack=[0x%lx,0x%lx) mmap_regions=%zu mmap_bytes=0x%zx mmap_addr=0x%lx\n",
                (long)g_fork().exec_data.addr, (long)(g_fork().exec_data.addr + g_fork().exec_data.size),
                (long)g_fork().interp_data.addr, (long)(g_fork().interp_data.addr + g_fork().interp_data.size),
                (long)g_fork().stack_data.addr, (long)(g_fork().stack_data.addr + g_fork().stack_data.size),
                g_fork().mmap_regions.size(), mmap_snapshot_bytes, (long)m.memory.mmap_address());
    }

    // Save VFS fd table and per-fd flags so child's changes can be undone
    g_fork().fd_snapshot = get_fs(m).snapshot_fds();
    g_fork().saved_cloexec_flags = g_fd_cloexec_flags;
    g_fork().saved_status_flags = g_fd_status_flags;
    g_fork().saved_tty_fds = g_tty_fds;

    // Save cooperative thread scheduler state. The fork child's execve
    // resets g_sched, and we need to restore the parent's thread state
    // when the child exits.
    static_assert(sizeof(ForkState::saved_sched) >= sizeof(g_sched));
    std::memcpy(g_fork().saved_sched, &g_sched, sizeof(g_sched));
    g_fork().saved_mmap_address = m.memory.mmap_address();
    g_fork().saved_conservative_small_mmap_reuse = g_conservative_small_mmap_reuse;
    g_fork().saved_force_materialize_anon_mmap = g_force_materialize_anon_mmap;
    g_fork().saved_exec_ctx = g_exec_ctx;
    g_fork().has_exec_ctx = true;

    // Only set in_child AFTER all saves succeed.
    // This way if memcpy_out throws, the retry will re-enter clone
    // with in_child still false, allowing the save to be retried.
    g_process_model.set_current(g_fork().child_pid);
    g_fork().in_child = true;
    fork_mark_child_running(m);
    g_fork().child_reaped = false;

    // Return 0 = "you are the child"
    m.set_result(0);
}

// clone3 — newer clone syscall that takes a struct clone_args pointer.
// glibc 2.34+ uses this for pthread_create instead of clone().
// struct clone_args layout (from linux/sched.h):
//   offset  0: u64 flags
//   offset  8: u64 pidfd
//   offset 16: u64 child_tid  (CLONE_CHILD_SETTID / CLONE_CHILD_CLEARTID)
//   offset 24: u64 parent_tid (CLONE_PARENT_SETTID)
//   offset 32: u64 exit_signal
//   offset 40: u64 stack      (bottom of stack)
//   offset 48: u64 stack_size
//   offset 56: u64 tls        (CLONE_SETTLS)
// We parse the struct and delegate to the same thread/fork logic as sys_clone.
static void sys_clone3(Machine& m) {
    auto cl_args_addr = m.sysarg(0);
    auto cl_args_size = m.sysarg(1);
    (void)cl_args_size;

    // Read clone_args fields from guest memory
    uint64_t flags       = m.memory.template read<uint64_t>(cl_args_addr + 0);
    uint64_t child_tid   = m.memory.template read<uint64_t>(cl_args_addr + 16);
    uint64_t parent_tid  = m.memory.template read<uint64_t>(cl_args_addr + 24);
    uint64_t exit_signal = m.memory.template read<uint64_t>(cl_args_addr + 32);
    uint64_t stack       = m.memory.template read<uint64_t>(cl_args_addr + 40);
    uint64_t stack_size  = m.memory.template read<uint64_t>(cl_args_addr + 48);
    uint64_t tls         = m.memory.template read<uint64_t>(cl_args_addr + 56);

    // Combine exit_signal into flags (clone3 separates them, clone packs them)
    (void)exit_signal;

    constexpr uint64_t F_CLONE_VM              = 0x00000100;
    constexpr uint64_t F_CLONE_THREAD          = 0x00010000;
    constexpr uint64_t F_CLONE_VFORK           = 0x00004000;
    constexpr uint64_t F_CLONE_PARENT_SETTID   = 0x00100000;
    constexpr uint64_t F_CLONE_CHILD_CLEARTID  = 0x00200000;
    constexpr uint64_t F_CLONE_SETTLS          = 0x00080000;
    auto ensure_sched_bootstrap = []() -> int {
        const int main_tid = (g_sched.count > 0)
            ? g_sched.threads[g_sched.current].tid
            : static_cast<int>(g_process_model.current_pid);
        if (g_sched.count == 0) {
            g_sched.init(main_tid);
        }
        if (g_next_pid <= main_tid) {
            g_next_pid = main_tid + 1;
        }
        return main_tid;
    };

    if ((flags & F_CLONE_THREAD) || ((flags & F_CLONE_VM) && !(flags & F_CLONE_VFORK))) {
        // Thread creation — same semantics as sys_clone thread path.
        ensure_sched_bootstrap();
        int tid = g_next_pid++;
        // clone3 stack = bottom of stack region, stack_size = size
        // Child SP = stack + stack_size (top of stack, grows down)
        uint64_t child_sp = stack + stack_size;

        if (flags & F_CLONE_PARENT_SETTID) {
            if (parent_tid != 0) {
                m.memory.template write<int32_t>(parent_tid, tid);
            }
        }

        if (g_sched.count == 0) {
            g_sched.init(g_next_pid - 2);
        }

        int child_idx = g_sched.add_thread(tid);
        if (child_idx < 0) {
            dbg_fprintf(stderr, "[clone3] thread slots full, faking tid=%d\n", tid);
            m.set_result(tid);
            return;
        }

        int parent_idx = g_sched.current;
        save_thread(m, g_sched.threads[parent_idx]);
        g_sched.threads[parent_idx].regs[10] = (uint64_t)tid;

        auto& child = g_sched.threads[child_idx];
        std::memcpy(child.regs, g_sched.threads[parent_idx].regs, sizeof(child.regs));
        child.pc = g_sched.threads[parent_idx].pc;
        child.regs[riscv::REG_SP] = child_sp;
        child.regs[10] = 0;
        if (flags & F_CLONE_SETTLS) {
            child.regs[4] = tls;  // tp register = x4
        }

        if (flags & F_CLONE_CHILD_CLEARTID) {
            child.clear_child_tid = child_tid;
        }

        static int clone3_thread_count = 0;
        if (++clone3_thread_count <= 10)
            dbg_fprintf(stderr, "[clone3] thread #%d cooperative, tid=%d stack=0x%lx+0x%lx\n",
                    clone3_thread_count, tid, (long)stack, (long)stack_size);
        m.set_result(tid);
        return;
    }

    // Fork path — push fork frame (supports nested forks for pipes)
    g_fork_stack.emplace_back();

    dbg_fprintf(stderr, "[clone3] fork flags=0x%lx stack=0x%lx+0x%lx\n",
            (long)flags, (long)stack, (long)stack_size);

    // Save parent registers BEFORE changing SP
    for (int i = 0; i < 32; i++) {
        g_fork().regs[i] = m.cpu.reg(i);
    }
    g_process_model.init();
    g_fork().pc = m.cpu.pc();
    g_fork().parent_pid = g_process_model.current_pid;
    g_fork().parent_pgid = g_process_model.current_pgid;
    g_fork().child_pid = g_process_model.allocate_pid();
    if (g_fork().child_pid < 0) {
        g_fork_stack.pop_back();
        m.set_result(-12);  // -ENOMEM
        return;
    }
    g_fork().child_pgid = g_fork().child_pid;
    if (!g_process_model.register_process(g_fork().child_pid, g_fork().parent_pid, g_fork().child_pgid)) {
        g_fork_stack.pop_back();
        m.set_result(-12);  // -ENOMEM
        return;
    }
    g_process_model.push_event(ProcessEventKind::Spawn, g_fork().child_pid, g_fork().parent_pid, g_fork().child_pgid, 0);
    g_fork().exit_status = 0;

    // Save parent memory regions BEFORE changing SP (stack save needs parent SP)
    {
        uint64_t save_start = g_exec_ctx.exec_rw_start;
        uint64_t brk_end = (g_exec_ctx.brk_current > 0)
                         ? g_exec_ctx.brk_current
                         : g_exec_ctx.exec_rw_end;
        if (brk_end < g_exec_ctx.exec_rw_end) brk_end = g_exec_ctx.exec_rw_end;
        uint64_t save_end = brk_end;
        if (save_start > 0 && save_end > save_start) {
            riscv::PageAttributes attr;
            attr.read = true; attr.write = true; attr.exec = true;
            m.memory.set_page_attr(save_start, save_end - save_start, attr);
            auto& r = g_fork().exec_data;
            r.addr = save_start;
            r.size = save_end - save_start;
            r.data.resize(r.size);
            arena_memcpy_out(m, r.data.data(), r.addr, r.size);
        }
    }
    if (g_exec_ctx.interp_rw_start > 0 && g_exec_ctx.interp_rw_end > g_exec_ctx.interp_rw_start) {
        auto& r = g_fork().interp_data;
        r.addr = g_exec_ctx.interp_rw_start;
        uint64_t interp_save_end = g_exec_ctx.heap_start;
        if (interp_save_end <= g_exec_ctx.interp_rw_end)
            interp_save_end = (g_exec_ctx.interp_rw_end + 0x1000) & ~0xFFFULL;
        r.size = interp_save_end - r.addr;
        r.data.resize(r.size);
        arena_memcpy_out(m, r.data.data(), r.addr, r.size);
    }
    {
        uint64_t sp = m.cpu.reg(riscv::REG_SP);
        uint64_t stack_top = g_exec_ctx.original_stack_top;
        auto& r = g_fork().stack_data;
        r.addr = sp;
        r.size = stack_top - sp;
        r.data.resize(r.size);
        arena_memcpy_out(m, r.data.data(), r.addr, r.size);
    }
    {
        for (const auto& [addr, region] : g_live_mmap_regions) {
            (void)addr;
            auto& saved = g_fork().mmap_regions.emplace_back();
            saved.addr = region.addr;
            saved.size = region.size;
            saved.attr = region.attr;
            saved.data.resize(saved.size);
            arena_memcpy_out(m, saved.data.data(), saved.addr, saved.size);
        }
    }
    g_fork().fd_snapshot = get_fs(m).snapshot_fds();
    g_fork().saved_cloexec_flags = g_fd_cloexec_flags;
    g_fork().saved_status_flags = g_fd_status_flags;
    g_fork().saved_tty_fds = g_tty_fds;
    static_assert(sizeof(ForkState::saved_sched) >= sizeof(g_sched));
    std::memcpy(g_fork().saved_sched, &g_sched, sizeof(g_sched));
    g_fork().saved_mmap_address = m.memory.mmap_address();
    g_fork().saved_conservative_small_mmap_reuse = g_conservative_small_mmap_reuse;
    g_fork().saved_force_materialize_anon_mmap = g_force_materialize_anon_mmap;
    g_fork().saved_exec_ctx = g_exec_ctx;
    g_fork().has_exec_ctx = true;

    g_fork().in_child = true;
    fork_mark_child_running(m);
    g_fork().child_reaped = false;

    // Set child stack AFTER saving parent state
    if (stack != 0 && stack_size != 0) {
        m.cpu.reg(riscv::REG_SP) = stack + stack_size;
    }
    g_process_model.set_current(g_fork().child_pid);

    m.set_result(0);
}

// wait4 — Phase 2: yield-to-host when child is still running.
//
// Behavior matches Linux semantics:
//   - WNOHANG + child running → return 0
//   - child exited → write wstatus, reap, return child pid
//   - no children → return -ECHILD
//   - child running (blocking) → rewind PC, yield to host via m.stop()
//
// The host JS resume loop sees STOP_REASON_WAIT_CHILD and either:
//   a) runs the vfork child to completion then resumes, or
//   b) (Phase 3) waits for Exit event from child worker then resumes.
// On resume the ecall re-executes, finds the child Exited, and returns.
static void sys_wait4(Machine& m) {
    const auto wait_pid = m.template sysarg<int>(0);
    const auto options = m.template sysarg<int>(2);
    constexpr int WAIT4_WNOHANG = 1;
    const pid_t parent = g_process_model.current_pid;
    dbg_fprintf(stderr,
            "[wait4] parent=%d wait_pid=%d options=0x%x fork_depth=%zu wait_child=%d blocked_pid=%d\n",
            (int)parent,
            (int)wait_pid,
            options,
            g_fork_stack.size(),
            (int)fork_parent_waiting(),
            (int)g_wait_blocked_pid);

    // Search process table for a waitable child.
    auto* child = g_process_model.find_waitable_child(parent, wait_pid);
    if (!child) {
        dbg_fprintf(stderr, "[wait4] no child for parent=%d wait_pid=%d\n", (int)parent, (int)wait_pid);
        m.set_result(-10);  // -ECHILD
        return;
    }

    // Child still running.
    if (child->state == TaskState::Running) {
        dbg_fprintf(stderr, "[wait4] child running pid=%d status=%d wnohang=%d\n",
                (int)child->pid, child->exit_status, (options & WAIT4_WNOHANG) ? 1 : 0);
        if (options & WAIT4_WNOHANG) {
            m.set_result(0);
            return;
        }
        // Phase 2: yield to host instead of returning bogus -EAGAIN.
        // Rewind PC past the ecall so it re-executes on resume.
        fork_mark_parent_waiting(m);
        g_wait_blocked_pid = child->pid;
        g_process_model.push_event(
            ProcessEventKind::WaitBlocked,
            child->pid, parent,
            child->pgid, 0);
        m.cpu.increment_pc(-4);  // rewind past ecall
        m.stop();
        return;
    }

    // Child exited — reap it.
    pid_t reaped_pid = child->pid;
    int32_t exit_status = child->exit_status;
    dbg_fprintf(stderr, "[wait4] reaping pid=%d status=%d\n", (int)reaped_pid, exit_status);
    auto wstatus_addr = m.sysarg(1);
    if (wstatus_addr != 0) {
        int32_t wstatus = (exit_status & 0xff) << 8;
        m.memory.template write<int32_t>(wstatus_addr, wstatus);
    }
    g_process_model.push_event(
        ProcessEventKind::WaitWakeup,
        reaped_pid, parent,
        child->pgid, exit_status);
    g_process_model.mark_reaped(reaped_pid, exit_status);
    // Update fork stack if this was a vfork child
    for (auto& f : g_fork_stack) {
        if (f.child_pid == reaped_pid) {
            f.exit_status = exit_status;
            f.child_reaped = true;
            const ProcessState state = fork_state();
            if (state == ProcessState::ParentRestored
                || state == ProcessState::ParentWaiting
                || state == ProcessState::ParentSaved) {
                fork_mark_child_reaped(m);
                fork_set_state(m, ProcessState::ParentSaved, "wait4", "ready for next fork");
            }
            break;
        }
    }
    m.set_result(reaped_pid);
}

// Helper: resolve a VFS path through symlinks (up to 10 levels).
static std::string resolve_path(vfs::VirtualFS& fs, const std::string& path) {
    std::string resolved = path;
    for (int i = 0; i < 10; i++) {
        vfs::Entry entry;
        if (!fs.stat(resolved, entry)) return "";  // not found
        if (entry.type != vfs::FileType::Symlink) break;
        char target[256];
        ssize_t n = fs.readlink(resolved, target, sizeof(target));
        if (n <= 0) break;
        std::string link(target, n);
        if (link[0] != '/') {
            auto slash = resolved.rfind('/');
            if (slash != std::string::npos)
                link = resolved.substr(0, slash + 1) + link;
        }
        resolved = link;
    }
    return resolved;
}

// Helper: read a file from VFS into a byte vector.
static std::vector<uint8_t> read_vfs_file(vfs::VirtualFS& fs, const std::string& path) {
    int fd = fs.open(path, 0 /*O_RDONLY*/);
    if (fd < 0) return {};
    std::vector<uint8_t> data;
    char buf[4096];
    ssize_t n;
    while ((n = fs.read(fd, buf, sizeof(buf))) > 0) {
        data.insert(data.end(), buf, buf + n);
    }
    fs.close(fd);
    return data;
}

// Helper: search PATH for a command name, return full path or empty.
static std::string search_path(vfs::VirtualFS& fs, const std::string& cmd, const std::vector<std::string>& env) {
    if (cmd.empty() || cmd[0] == '/') return cmd;
    std::string path_val = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
    for (const auto& e : env) {
        if (e.substr(0, 5) == "PATH=") { path_val = e.substr(5); break; }
    }
    size_t pos = 0;
    while (pos < path_val.size()) {
        size_t colon = path_val.find(':', pos);
        std::string dir = (colon == std::string::npos)
            ? path_val.substr(pos) : path_val.substr(pos, colon - pos);
        std::string candidate = dir + "/" + cmd;
        std::string resolved = resolve_path(fs, candidate);
        if (!resolved.empty()) {
            vfs::Entry e2;
            if (fs.stat(resolved, e2) && e2.type == vfs::FileType::Regular)
                return candidate;  // return unresolved (let caller resolve)
        }
        pos = (colon == std::string::npos) ? path_val.size() : colon + 1;
    }
    return "";
}

enum class AtPathStatus {
    Ok,
    Badf,
    Notdir,
};

struct AtPathResult {
    AtPathStatus status;
    std::string path;
};

static AtPathResult resolve_at_path(vfs::VirtualFS& fs, int dirfd, const std::string& path) {
    auto normalize_guest_path = [](const std::string& input) {
        if (input.empty()) return input;
        std::string out;
        out.reserve(input.size());
        bool last_was_slash = false;
        for (char ch : input) {
            if (ch == '/') {
                if (!last_was_slash) out.push_back(ch);
                last_was_slash = true;
            } else {
                out.push_back(ch);
                last_was_slash = false;
            }
        }
        if (out.empty()) return std::string("/");
        return out;
    };

    if (!path.empty() && path[0] == '/') {
        return {AtPathStatus::Ok, normalize_guest_path(path)};
    }
    if (dirfd == AT_FDCWD) {
        return {AtPathStatus::Ok, normalize_guest_path(path)};
    }
    auto entry = fs.get_entry(dirfd);
    if (!entry) {
        return {AtPathStatus::Badf, {}};
    }
    if (!entry->is_dir()) {
        return {AtPathStatus::Notdir, {}};
    }
    std::string base = fs.get_path(dirfd);
    if (base.empty()) base = "/";
    if (base.back() == '/') return {AtPathStatus::Ok, normalize_guest_path(base + path)};
    return {AtPathStatus::Ok, normalize_guest_path(base + "/" + path)};
}

static inline int at_path_errno(AtPathStatus st) {
    switch (st) {
        case AtPathStatus::Badf: return err::BADF;
        case AtPathStatus::Notdir: return err::NOTDIR;
        default: return 0;
    }
}

// execve — replace current "process" with a new program.
// Supports:
//   - Busybox applets (same binary, just new argv)
//   - Arbitrary ELF binaries (loads new code + interpreter)
//   - Shebang scripts (#!/path/to/interpreter)
static void sys_execve(Machine& m) {
    auto path_addr = m.sysarg(0);
    auto argv_addr = m.sysarg(1);
    auto envp_addr = m.sysarg(2);

    if (g_exec_ctx.exec_binary.empty()) {
        m.set_result(-38);  // -ENOSYS
        return;
    }

    // Read target path
    std::string path;
    try {
        path = m.memory.memstring(path_addr);    } catch (...) {
        m.set_result(-14);  // -EFAULT
        return;
    }

    auto& fs = get_fs(m);

    // Resolve symlinks
    std::string resolved = resolve_path(fs, path);
    if (resolved.empty()) {
        m.set_result(-2);  // -ENOENT
        return;
    }

    // Read argv from guest memory
    std::vector<std::string> args;
    try {
        for (int i = 0; i < 256; i++) {
            uint64_t ptr = m.memory.template read<uint64_t>(argv_addr + i * 8);
            if (ptr == 0) break;
            args.push_back(m.memory.memstring(ptr));
        }
    } catch (...) {
        m.set_result(-14);  // -EFAULT
        return;
    }

    if (args.empty()) {
        args.push_back(path);
    }

    // Read envp from guest memory. If envp is non-NULL, it fully defines the
    // new process environment.
    std::vector<std::string> exec_env = g_exec_ctx.env;
    if (envp_addr != 0) {
        std::vector<std::string> new_env;
        try {
            for (int i = 0; i < 4096; i++) {
                uint64_t ptr = m.memory.template read<uint64_t>(envp_addr + i * 8);
                if (ptr == 0) break;
                new_env.push_back(m.memory.memstring(ptr));
            }
        } catch (...) {
            m.set_result(-14);  // -EFAULT
            return;
        }
        exec_env = std::move(new_env);
    }

    // Shebang handling: if the target file starts with "#!", parse the
    // interpreter line and rewrite args as: interpreter [arg] script argv[1..]
    {
        int fd = fs.open(resolved, 0 /*O_RDONLY*/);
        if (fd >= 0) {
            char hdr[256];
            ssize_t n = fs.read(fd, hdr, sizeof(hdr) - 1);
            fs.close(fd);
            if (n >= 4 && hdr[0] == '#' && hdr[1] == '!') {
                hdr[n] = '\0';
                char* eol = std::strchr(hdr + 2, '\n');
                if (eol) *eol = '\0';
                char* interp = hdr + 2;
                while (*interp == ' ' || *interp == '\t') interp++;
                std::string interp_path;
                std::string interp_arg;
                char* space = std::strchr(interp, ' ');
                if (!space) space = std::strchr(interp, '\t');
                if (space) {
                    interp_path = std::string(interp, space);
                    char* a = space + 1;
                    while (*a == ' ' || *a == '\t') a++;
                    char* end = a + std::strlen(a) - 1;
                    while (end > a && (*end == ' ' || *end == '\t' || *end == '\r')) *end-- = '\0';
                    if (*a) interp_arg = a;
                } else {
                    char* end = interp + std::strlen(interp) - 1;
                    while (end > interp && (*end == ' ' || *end == '\t' || *end == '\r')) *end-- = '\0';
                    interp_path = interp;
                }
                std::vector<std::string> new_args;
                new_args.push_back(interp_path);
                if (!interp_arg.empty()) new_args.push_back(interp_arg);
                new_args.push_back(resolved);
                for (size_t i = 1; i < args.size(); i++)
                    new_args.push_back(args[i]);
                args = std::move(new_args);

                // Handle /usr/bin/env: resolve command via PATH
                if (interp_path == "/usr/bin/env" && args.size() >= 2) {
                    std::string cmd = args[1];
                    std::string found = search_path(fs, cmd, exec_env);
                    if (!found.empty()) {
                        args[0] = found;
                        args.erase(args.begin() + 1);
                        resolved = resolve_path(fs, found);
                    }
                } else {
                    resolved = resolve_path(fs, interp_path);
                }
                if (resolved.empty()) {
                    m.set_result(-2);  // -ENOENT
                    return;
                }
            }
        }
    }

    // Read the target binary from VFS to check if it's a different ELF
    auto new_binary = read_vfs_file(fs, resolved);
    bool is_new_elf = false;

    if (new_binary.size() >= sizeof(elf::Elf64_Ehdr)) {
        const auto* ehdr = reinterpret_cast<const elf::Elf64_Ehdr*>(new_binary.data());
        if (ehdr->e_ident[0] == 0x7f && ehdr->e_ident[1] == 'E' &&
            ehdr->e_ident[2] == 'L' && ehdr->e_ident[3] == 'F' &&
            ehdr->e_machine == elf::EM_RISCV) {
            is_new_elf = true;
        }
    }

    if (is_new_elf && new_binary != g_exec_ctx.exec_binary) {
        // ---- Loading a NEW binary (e.g. /usr/bin/node) ----
        try {
            auto exec_info = elf::parse_elf(new_binary);
            std::cout << "[friscy] execve: loading new binary " << resolved
                      << " (" << new_binary.size() << " bytes)\n";

            // Check if new binary fits in arena
            constexpr uint64_t ARENA_SIZE = 1ULL << riscv::encompassing_Nbit_arena;

            auto [new_lo, new_hi] = elf::get_load_range(new_binary);
            uint64_t exec_base = 0x40000;
            uint64_t load_end = exec_base + new_hi - new_lo;
            if (load_end >= ARENA_SIZE) {
                std::cerr << "[execve] ERROR: binary too large for arena! "
                          << "Need 0x" << std::hex << load_end
                          << " but arena is 0x" << ARENA_SIZE << std::dec << "\n";
                m.set_result(-12);  // -ENOMEM
                return;
            }

            // CRITICAL: Reset cooperative thread scheduler before execve.
            // Reset cooperative thread scheduler to match fresh Machine state.
            // In a direct run, g_sched.count=0, so set_tid_address returns 1
            // and the first clone initializes the scheduler. Match this behavior
            // after execve for identical thread ID semantics.
            for (int i = 0; i < MAX_VTHREADS; i++) {
                g_sched.threads[i].active = false;
                g_sched.threads[i].waiting = false;
            }
            g_sched.count = 0;
            g_sched.current = 0;

            // CRITICAL: Evict all stale decoder/execute segments from the old
            // binary BEFORE loading new code. set_page_attr does NOT invalidate
            // the decoder cache, so without this the CPU tries to execute stale
            // decoded instructions → "Execution space protection fault" and
            // "Max execute segments reached".
            m.memory.evict_execute_segments();
            // Clear mmap free-list cache — stale entries from parent process
            m.memory.mmap_cache() = {};
            g_live_mmap_regions.clear();
            reset_lazy_mmap_page_tables(m);

            // In arena mode, skip set_page_attr for old/new ranges.
            // Arena reads/writes bypass page attributes entirely, so these
            // calls are expensive no-ops that can also trigger O(n²) scans
            // in owned_pages_active(). The load_elf_segments function handles
            // writing directly to both pages AND arena buffer.
            if constexpr (riscv::encompassing_Nbit_arena == 0) {
                // Make entire arena writable from exec_base to load_end
                {
                    riscv::PageAttributes rw;
                    rw.read = true; rw.write = true;
                    uint64_t rw_start = exec_base;
                    uint64_t rw_len = load_end - exec_base;
                    m.memory.set_page_attr(rw_start, rw_len, rw);
                }
                // Also make old binary range writable
                {
                    auto [old_lo, old_hi] = elf::get_load_range(g_exec_ctx.exec_binary);
                    uint64_t old_start = g_exec_ctx.exec_base;
                    uint64_t old_end = old_start + old_hi;
                    riscv::PageAttributes rw;
                    rw.read = true; rw.write = true;
                    m.memory.set_page_attr(old_start, old_end - old_start, rw);
                }
            }

            // Extract all ELF info BEFORE loading (load_elf_segments may cause
            // stack corruption with LTO inlining when called in fork context)
            auto [rw_lo, rw_hi] = elf::get_writable_range(new_binary);

            // NUCLEAR ZERO: After fork+exec, the arena has stale data from the
            // parent process (bash) everywhere. The parent's interpreter BSS,
            // stack, heap/mmap data all persist. V8's abseil mutexes detect
            // stale non-zero values and abort. Zero the ENTIRE arena to simulate
            // a fresh process address space, just like a real execve would give.
            if constexpr (riscv::encompassing_Nbit_arena > 0) {
                auto* arena = (uint8_t*)m.memory.memory_arena_ptr();
                size_t arena_size = m.memory.memory_arena_size();
                std::memset(arena, 0, arena_size);
            }

            // Load new main binary segments
            if (exec_info.type == elf::ET_DYN) {
                auto [lo, hi] = elf::get_load_range(new_binary);
                exec_base = 0x40000;
                dynlink::load_elf_segments(m, new_binary, exec_base);

                exec_info.phdr_addr += (exec_base - lo);
                exec_info.entry_point += (exec_base - lo);
                g_exec_ctx.exec_base = exec_base;
                g_exec_ctx.exec_rw_start = (exec_base - lo) + rw_lo;
                g_exec_ctx.exec_rw_end = (exec_base - lo) + rw_hi;
            } else {
                dynlink::load_elf_segments(m, new_binary, 0);
                g_exec_ctx.exec_rw_start = rw_lo;
                g_exec_ctx.exec_rw_end = rw_hi;
            }

            // If the new binary needs a dynamic linker, reload interpreter too
            uint64_t interp_base = g_exec_ctx.interp_base;
            uint64_t interp_entry = g_exec_ctx.interp_entry;

            if (exec_info.is_dynamic && !exec_info.interpreter.empty()) {
                // Load interpreter from VFS
                std::string interp_resolved = resolve_path(fs, exec_info.interpreter);
                auto interp_binary = read_vfs_file(fs, interp_resolved);
                if (interp_binary.empty()) {
                    std::cerr << "[friscy] execve: interpreter not found: "
                              << exec_info.interpreter << "\n";
                    m.set_result(-2);
                    return;
                }

                // Make old interpreter pages writable before overwriting
                // (only if previous binary had an interpreter loaded)
                if (!g_exec_ctx.interp_binary.empty()) {
                    if constexpr (riscv::encompassing_Nbit_arena == 0) {
                        auto [ilo, ihi] = elf::get_load_range(g_exec_ctx.interp_binary);
                        riscv::PageAttributes rw;
                        rw.read = true; rw.write = true;
                        m.memory.set_page_attr(interp_base, ihi - ilo, rw);
                    }
                }

                // Choose interpreter base: reuse old if available, else pick fresh address
                if (interp_base == 0) {
                    // Previous binary had no interpreter — pick a base above the new binary
                    interp_base = (load_end + 0x10000) & ~0xFFFULL;
                }

                // Load interpreter
                dynlink::load_elf_segments(m, interp_binary, interp_base);


                auto interp_info = elf::parse_elf(interp_binary);
                if (interp_info.type == elf::ET_DYN) {
                    auto [lo, hi] = elf::get_load_range(interp_binary);
                    interp_entry = interp_info.entry_point - lo + interp_base;
                } else {
                    interp_entry = interp_info.entry_point;
                }

                auto [irw_lo, irw_hi] = elf::get_writable_range(interp_binary);
                g_exec_ctx.interp_rw_start = interp_base + irw_lo;
                g_exec_ctx.interp_rw_end = interp_base + irw_hi;
                g_exec_ctx.interp_binary = std::move(interp_binary);
                g_exec_ctx.interp_entry = interp_entry;
            }

            // Update exec context
            g_exec_ctx.exec_binary = std::move(new_binary);
            g_exec_ctx.exec_info = exec_info;
            g_enable_node_anon_relax = is_node_guest_path(resolved);
            g_force_materialize_anon_mmap = true;

            // ---- CRITICAL: Reset memory layout after loading new binary ----
            // After loading a large binary (e.g. 48MB Node.js), libriscv's
            // internal m_heap_address still points to the OLD binary's end.
            // This causes brk() to return addresses INSIDE the new binary's
            // text segment, and memdiscard in anonymous mmap zeroes code/data.
            //
            // We fix this by:
            // 1. Setting brk to start after the new binary's BSS
            // 2. Ensuring mmap_address is above brk + BRK_MAX
            {
                // Use ONLY the main binary's end for brk_base, matching
                // libriscv's Machine constructor behavior. The interpreter is
                // loaded separately and doesn't affect the brk region.
                // This ensures brk(0) returns the same value in both direct
                // and fork+exec paths.
                uint64_t writable_end = g_exec_ctx.exec_rw_end;
                uint64_t new_brk_base = std::max(load_end, writable_end);
                new_brk_base = (new_brk_base + 4095) & ~4095ULL;
                g_exec_ctx.brk_base = new_brk_base;
                g_exec_ctx.brk_current = new_brk_base;
                g_exec_ctx.brk_overridden = true;

                // CRITICAL: Update libriscv's m_heap_address so that
                // mmap_start() = heap_address + BRK_MAX reflects the NEW
                // binary's layout, matching the Machine constructor behavior.
                m.memory.set_heap_address(new_brk_base);

                constexpr uint64_t BRK_MAX = 16ULL << 20;

                // Replicate the initial setup from main.cpp:
                // 1. mmap_address = heap_address + BRK_MAX (from constructor)
                // 2. Advance past interpreter (from main.cpp line 1094)
                // 3. Allocate 64MB heap (from main.cpp line 1124)
                uint64_t new_mmap_addr = new_brk_base + BRK_MAX;

                // Advance past interpreter if present
                if (exec_info.is_dynamic && !g_exec_ctx.interp_binary.empty()) {
                    auto [ilo, ihi] = elf::get_load_range(g_exec_ctx.interp_binary);
                    uint64_t interp_end_page = (interp_base + ihi + 0xFFF) & ~0xFFFULL;
                    if (new_mmap_addr < interp_end_page) {
                        new_mmap_addr = interp_end_page;
                    }
                }

                // Allocate 64MB heap space (matching main.cpp mmap_allocate(64MB))
                new_mmap_addr = (new_mmap_addr + 4095) & ~4095ULL;
                new_mmap_addr += 64ULL << 20;  // 64MB heap

                m.memory.mmap_address() = new_mmap_addr;
                g_mmap_bump = new_mmap_addr;
                g_exec_ctx.heap_start = new_brk_base + BRK_MAX;
                g_exec_ctx.heap_size = 64ULL << 20;
            }

            // Place stack in the same location as the Machine constructor:
            // between brk+BRK_MAX and the interpreter. This matches the
            // direct run's layout where mmap_allocate(1MB) returns
            // heap_address + BRK_MAX = brk_base + BRK_MAX.
            constexpr uint64_t STACK_SIZE = 1ULL << 20;  // 1MB (matching Machine default)
            uint64_t stack_base = g_exec_ctx.brk_base + (16ULL << 20); // brk + BRK_MAX
            uint64_t new_stack_top = stack_base + STACK_SIZE;
            {
                riscv::PageAttributes rw;
                rw.read = true; rw.write = true;
                m.memory.set_page_attr(stack_base, STACK_SIZE, rw);
            }
            g_exec_ctx.original_stack_top = new_stack_top;

            // POSIX execve semantics: reset signal dispositions and close CLOEXEC fds
            g_signal_mask[0] = 0;
            g_signal_mask[1] = 0;
            std::memset(g_sigactions, 0, sizeof(g_sigactions));
            // Close FD_CLOEXEC file descriptors
            {
                std::vector<int> to_close;
                for (auto& [cfd, cflags] : g_fd_cloexec_flags) {
                    if (cflags & 1) to_close.push_back(cfd);
                }
                for (int cfd : to_close) {
                    fs.close(cfd);
                    g_fd_cloexec_flags.erase(cfd);
                    g_fd_status_flags.erase(cfd);
                    g_tty_fds.erase(cfd);
                    g_eventfd_counters.erase(cfd);
                    g_timerfd_states.erase(cfd);
                    g_epoll_instances.erase(cfd);
                }
            }
            // Reset POSIX timers
            g_posix_timers.clear();

            // Set up fresh stack
            g_exec_ctx.env = exec_env;
            uint64_t sp = dynlink::setup_dynamic_stack(
                m, exec_info, interp_base, args,
                g_exec_ctx.env, new_stack_top);

            // WORKAROUND: Pre-seed Go's runtime.physPageSize with 4096.
            // Go's sysauxv reads AT_PAGESZ from auxv and stores it via AUIPC+SD.
            // The auxv and code bytes are correct, but the guest SD instruction
            // doesn't persist in Emscripten builds (suspected libriscv threaded
            // dispatch PC computation issue under Wasm32). Host-side write<T>
            // to the arena works fine.
            // TODO: Fix root cause in libriscv threaded dispatch AUIPC handler.
            if (!exec_info.is_dynamic) {
                try {
                    m.memory.template write<uint64_t>(0x51f368, 4096);
                } catch (...) {}
            }

            // Clear all registers (integer, FP, FCSR) — POSIX execve starts clean
            for (int i = 1; i < 32; i++) m.cpu.reg(i) = 0;
            for (int i = 0; i < 32; i++) m.cpu.registers().getfl(i).i64 = 0;
            m.cpu.registers().fcsr() = {};
            m.cpu.reg(riscv::REG_SP) = sp;
            uint64_t jump_target = exec_info.is_dynamic ? interp_entry : exec_info.entry_point;
            m.cpu.jump(jump_target);

            std::cout << "[friscy] execve: jumping to 0x" << std::hex
                      << jump_target << std::dec << "\n";

            // Enable syscall tracing for new binary startup debugging
            if (g_exec_ctx.exec_binary.size() > 10000000) {  // large binary like node
                riscv::g_execve_trace_remaining_init = 2000;
                dbg_fprintf(stderr, "[execve-trace] set remaining=%d trace=%d\n",
                    riscv::g_execve_trace_remaining_init, (int)g_trace_syscalls);
            }

            // Mark the jump target page and surrounding code as executable.
            // Without this, the CPU faults creating an execute segment for
            // the new binary's entry point — and in WASM with tail-call
            // dispatch, the exception can escape C++ catch blocks.
            {
                riscv::PageAttributes rwx;
                rwx.read = true; rwx.write = true; rwx.exec = true;
                // Entry point page
                m.memory.set_page_attr(jump_target & ~0xFFFULL, 4096, rwx);
                // Interpreter code range
                if (interp_base > 0 && !g_exec_ctx.interp_binary.empty()) {
                    auto [ilo, ihi] = elf::get_load_range(g_exec_ctx.interp_binary);
                    m.memory.set_page_attr(interp_base, ihi - ilo, rwx);
                }
                // New binary code range
                if (exec_base > 0) {
                    auto [mlo, mhi] = elf::get_load_range(g_exec_ctx.exec_binary);
                    if (mhi > mlo) {
                        m.memory.set_page_attr(exec_base, mhi - mlo, rwx);
                    }
                }
            }

            // CRITICAL: Stop the machine to break out of the threaded dispatch
            // loop cleanly. After evict_execute_segments(), the decoded instruction
            // cache is freed. If we just return from this handler, the dispatch
            // loop tries to read the next instruction from the freed segment →
            // SIGSEGV on the host. machine.stop() sets a flag that makes the
            // dispatch loop exit at the next checkpoint.
            g_conservative_small_mmap_reuse = true;
            g_execve_restart = true;
            // Mark that child did execve so fork_parent_restore reloads text
            if (!g_fork_stack.empty()) g_fork().child_did_execve = true;
            (void)fs.unlink("/proc/self/exe");
            (void)fs.symlink(resolved, "/proc/self/exe");
            if (g_fork_active() && g_fork().in_child) {
                fork_mark_child_execd(m);
            }
            m.stop();
            return;  // don't set_result — execve doesn't return on success
        } catch (const riscv::MachineException& e) {
            std::cerr << "[friscy] execve: MachineException loading " << resolved
                      << ": " << e.what()
                      << " (data=0x" << std::hex << e.data() << std::dec
                      << ", type=" << e.type() << ")\n";
            m.set_result(-8);  // -ENOEXEC
            return;
        } catch (const std::exception& e) {
            std::cerr << "[friscy] execve: failed to load " << resolved
                      << ": " << e.what() << "\n";
            m.set_result(-8);  // -ENOEXEC
            return;
        }
    }

    // ---- Same binary (busybox applet) or non-ELF ----
    // Re-load data segments to get clean BSS/heap state, then re-enter
    // the dynamic linker. Without this, the interpreter finds the parent's
    // stale malloc metadata and lock state, causing allocator crashes.

    // Reset cooperative thread scheduler to match fresh Machine state
    for (int i = 0; i < MAX_VTHREADS; i++) {
        g_sched.threads[i].active = false;
        g_sched.threads[i].waiting = false;
    }
    g_sched.count = 0;
    g_sched.current = 0;

    // Evict stale decoder caches — segment data will be reloaded
    m.memory.evict_execute_segments();

    // Reload main binary + interpreter from ELF to get clean data segments
    {
        uint64_t load_base = 0;
        if (g_exec_ctx.exec_info.type == elf::ET_DYN) {
            auto [lo, hi] = elf::get_load_range(g_exec_ctx.exec_binary);
            (void)hi;
            load_base = (g_exec_ctx.exec_base >= lo)
                ? (g_exec_ctx.exec_base - lo) : g_exec_ctx.exec_base;
        }
        dynlink::load_elf_segments(m, g_exec_ctx.exec_binary, load_base);
    }
    if (!g_exec_ctx.interp_binary.empty() && g_exec_ctx.interp_base != 0) {
        dynlink::load_elf_segments(m, g_exec_ctx.interp_binary, g_exec_ctx.interp_base);
    }

    // Reset BRK to initial state
    g_exec_ctx.brk_current = g_exec_ctx.brk_base;
    m.memory.set_heap_address(g_exec_ctx.brk_base);
    {
        constexpr uint64_t BRK_MAX = 16ULL << 20;
        if (m.memory.mmap_address() < g_exec_ctx.brk_base + BRK_MAX) {
            m.memory.mmap_address() = g_exec_ctx.brk_base + BRK_MAX;
        }
    }
    uint64_t sp = dynlink::setup_dynamic_stack(
        m, g_exec_ctx.exec_info, g_exec_ctx.interp_base,
        args, exec_env, g_exec_ctx.original_stack_top);
    g_exec_ctx.env = std::move(exec_env);

    for (int i = 1; i < 32; i++) m.cpu.reg(i) = 0;
    m.cpu.reg(riscv::REG_SP) = sp;
    m.cpu.jump(g_exec_ctx.interp_entry);

    // Stop machine to break out of stale decoder context
    g_conservative_small_mmap_reuse = true;
    g_enable_node_anon_relax = is_node_guest_path(resolved);
    g_force_materialize_anon_mmap = true;
    g_execve_restart = true;
    if (!g_fork_stack.empty()) g_fork().child_did_execve = true;
            (void)fs.unlink("/proc/self/exe");
            (void)fs.symlink(resolved, "/proc/self/exe");
            if (g_fork_active() && g_fork().in_child) {
                fork_mark_child_execd(m);
            }
            m.stop();
        }

static void sys_openat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    int flags = m.template sysarg<int>(2);

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    if (g_enable_node_anon_relax &&
        g_force_materialize_anon_mmap &&
        (path == "/proc/version_signature" || path == "/proc/cpuinfo")) {
        g_force_materialize_anon_mmap = false;
        static int node_relax_log_budget = 4;
        if (node_relax_log_budget-- > 0) {
            dbg_fprintf(stderr,
                "[node-mmap] relaxed anon materialization at path=%s pc=0x%lx ra=0x%lx\n",
                path.c_str(), (long)m.cpu.pc(), (long)m.cpu.reg(riscv::REG_RA));
        }
    }

    // Virtual device files: create synthetic VFS entries on demand via open+O_CREAT
    if ((path == "/dev/urandom" || path == "/dev/random" || path == "/dev/null")
        && !fs.resolve(path)) {
        fs.open(path, 0100 /* O_CREAT */);  // creates empty file via VFS open path
    }

#ifndef __EMSCRIPTEN__
    if (path == "/dev/tty" && !::isatty(STDIN_FILENO) && !::isatty(STDOUT_FILENO) && !::isatty(STDERR_FILENO)) {
        if (g_trace_syscalls) {
            fprintf(stderr, "[openat] dirfd=%d flags=0x%x path=%s => %lld (native-no-tty)\n",
                dirfd, flags, path.c_str(), (long long)err::NXIO);
        }
        m.set_result(err::NXIO);
        return;
    }
#endif

    // Intercept /mnt/host access for local folder sharing
#ifdef __EMSCRIPTEN__
    if (path.size() >= 10 && path.compare(0, 10, "/mnt/host/") == 0) {
        // Redirect to VectorHeart hypercall 600
        std::string vh_path = path;
        if (flags & O_DIRECTORY) vh_path += "/";
        long vh_fd = js_opfs_io(0, (void*)vh_path.c_str(), flags, 600, 0);
        if (vh_fd >= 0) g_vh_fds.insert((int)vh_fd);
        m.set_result(vh_fd);
        return;
    }
#endif

    int fd = (flags & O_DIRECTORY) ? fs.opendir(path) : fs.open(path, flags);
    if (g_trace_syscalls) {
        fprintf(stderr, "[openat] dirfd=%d flags=0x%x path=%s => %d\n",
            dirfd, flags, path.c_str(), fd);
    }
    // Track /dev/tty and /dev/pts/* opens as tty fds for ioctl
    if (fd >= 0 && (path == "/dev/tty" || path == "/dev/console"
                    || path.rfind("/dev/pts/", 0) == 0)) {
        g_tty_fds.insert(fd);
    }
    if (fd >= 0) {
        g_fd_cloexec_flags[fd] = (flags & O_CLOEXEC) ? 1 : 0;
        g_fd_status_flags[fd] = flags;
    }
    m.set_result(fd);
}

static void sys_openat2(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    auto how_addr = m.sysarg(2);
    auto size = m.sysarg(3);

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }

    // struct open_how starts with flags (u64), mode (u64), resolve (u64)
    // We currently only honor flags.
    if (size < 8) {
        m.set_result(err::INVAL);
        return;
    }
    uint64_t flags64 = 0;
    try {
        flags64 = m.memory.template read<uint64_t>(how_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    int flags = static_cast<int>(flags64);

    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    // Virtual device files: create synthetic VFS entries on demand via open+O_CREAT
    if ((path == "/dev/urandom" || path == "/dev/random" || path == "/dev/null")
        && !fs.resolve(path)) {
        fs.open(path, 0100 /* O_CREAT */);  // creates empty file via VFS open path
    }

#ifndef __EMSCRIPTEN__
    if (path == "/dev/tty" && !::isatty(STDIN_FILENO) && !::isatty(STDOUT_FILENO) && !::isatty(STDERR_FILENO)) {
        if (g_trace_syscalls) {
            fprintf(stderr, "[openat2] dirfd=%d flags=0x%x path=%s => %lld (native-no-tty)\n",
                dirfd, flags, path.c_str(), (long long)err::NXIO);
        }
        m.set_result(err::NXIO);
        return;
    }
#endif

    // Intercept /mnt/host access for local folder sharing
#ifdef __EMSCRIPTEN__
    if (path.size() >= 10 && path.compare(0, 10, "/mnt/host/") == 0) {
        std::string vh_path = path;
        if (flags & O_DIRECTORY) vh_path += "/";
        long vh_fd = js_opfs_io(0, (void*)vh_path.c_str(), flags, 600, 0);
        if (vh_fd >= 0) g_vh_fds.insert((int)vh_fd);
        m.set_result(vh_fd);
        return;
    }
#endif

    int fd = (flags & O_DIRECTORY) ? fs.opendir(path) : fs.open(path, flags);
    if (g_trace_syscalls) {
        fprintf(stderr, "[openat2] dirfd=%d flags=0x%x path=%s => %d\n",
            dirfd, flags, path.c_str(), fd);
    }
    if (fd >= 0 && (path == "/dev/tty" || path == "/dev/console"
                    || path.rfind("/dev/pts/", 0) == 0)) {
        g_tty_fds.insert(fd);
    }
    if (fd >= 0) {
        g_fd_cloexec_flags[fd] = (flags & O_CLOEXEC) ? 1 : 0;
        g_fd_status_flags[fd] = flags;
    }
    m.set_result(fd);
}

static void sys_close(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    if (g_trace_syscalls && g_trace_countdown-- > 0)
        dbg_fprintf(stderr, "[TRACE] close(fd=%d) pc=0x%lx\n", fd, (long)m.cpu.pc());

    bool is_stdio_valid = (fd >= 0 && fd <= 2 && g_stdio_open[fd]);
    bool is_valid = is_stdio_valid
        || fs.is_open(fd)
        || g_epoll_instances.count(fd)
        || g_eventfd_counters.count(fd)
        || g_timerfd_states.count(fd)
        || (net_is_socket_fd && net_is_socket_fd(fd))
        || is_vh_fd(fd);

    if (!is_valid) {
        int _sock = (net_is_socket_fd && net_is_socket_fd(fd)) ? 1 : 0;
        int _ep = g_epoll_instances.count(fd) ? 1 : 0;
        int _ev = g_eventfd_counters.count(fd) ? 1 : 0;
        int _vh = is_vh_fd(fd) ? 1 : 0;
        int _open = fs.is_open(fd) ? 1 : 0;
        int _stdio = (fd >= 0 && fd <= 2 && g_stdio_open[fd]) ? 1 : 0;
        dbg_fprintf(stderr, "[close] INVALID fd=%d open=%d stdio=%d sock=%d ep=%d ev=%d vh=%d\n", fd, _open, _stdio, _sock, _ep, _ev, _vh);
#ifdef __EMSCRIPTEN__
        m.set_result(0);
#else
        m.set_result(err::BADF);
#endif
        return;
    }

    // Remove from tty tracking (but never remove 0/1/2 from tty set)
    if (fd > 2) g_tty_fds.erase(fd);
    if (fd >= 0 && fd <= 2) g_stdio_open[fd] = false;
    g_fd_cloexec_flags.erase(fd);
    g_fd_status_flags.erase(fd);

    // Clean up epoll/eventfd/timerfd state
    g_epoll_instances.erase(fd);
    g_eventfd_counters.erase(fd);
    g_timerfd_states.erase(fd);

    if (is_vh_fd(fd)) {
#ifdef __EMSCRIPTEN__
        long rc = js_opfs_io(fd, nullptr, 0, 603, 0);
        // If JS side does not know this fd anymore, demote and retry as normal fd.
        if (rc != err::BADF) {
            g_vh_fds.erase(fd);
            m.set_result(rc);
            return;
        }
        g_vh_fds.erase(fd);
#endif
    }

    // VFS close is idempotent; validity already checked above.
    fs.close(fd);
    g_vh_fds.erase(fd);
    m.set_result(0);
}

static void sys_read(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);
    if (g_trace_syscalls && g_trace_countdown-- > 0)
        dbg_fprintf(stderr, "[TRACE] read(fd=%d, count=%zu) pc=0x%lx\n", fd, count, (long)m.cpu.pc());

    // /dev/tty fds (other than 0/1/2) redirect reads to stdin
    if (fd > 2 && g_tty_fds.count(fd)) {
        fd = 0;  // treat as stdin read
    }

    // eventfd: return 8-byte counter value and reset
    if (fd > 2 && g_eventfd_counters.count(fd)) {
        if (count < 8) {
            m.set_result(-22);  // -EINVAL (eventfd reads must be 8 bytes)
            return;
        }
        uint64_t val = g_eventfd_counters[fd];
        if (val == 0) {
            // No signal pending — would block (EAGAIN for nonblock)
            m.set_result(-11);  // -EAGAIN
            return;
        }
        // Reset counter and clear Fifo content so epoll sees empty
        g_eventfd_counters[fd] = 0;
        auto& fs2 = get_fs(m);
        auto entry = fs2.get_entry(fd);
        if (entry) {
            entry->content.clear();
            entry->size = 0;
        }
        // Reset file offset for next write
        fs2.lseek(fd, 0, 0);  // SEEK_SET
        m.memory.template write<uint64_t>(buf_addr, val);
        m.set_result(8);
        return;
    }

    // timerfd: return 8-byte expiration count
    if (fd > 2 && g_timerfd_states.count(fd)) {
        if (count < 8) {
            m.set_result(-22);  // -EINVAL
            return;
        }
        timerfd_tick(fd);
        auto& st = g_timerfd_states[fd];
        if (st.expirations == 0) {
            m.set_result(-11);  // -EAGAIN
            return;
        }
        uint64_t val = st.expirations;
        st.expirations = 0;
        // Clear Fifo content so epoll sees empty
        auto entry = fs.get_entry(fd);
        if (entry) { entry->content.clear(); entry->size = 0; }
        m.memory.template write<uint64_t>(buf_addr, val);
        m.set_result(8);
        return;
    }

    // /dev/urandom, /dev/random — return random bytes
    if (fd > 2) {
        auto path = fs.get_path(fd);
        if (path == "/dev/urandom" || path == "/dev/random") {
            auto* ctx = get_ctx(m);
            std::vector<uint8_t> buf(count);
            for (size_t i = 0; i < count; i++) buf[i] = ctx->rng() & 0xFF;
            m.memory.memcpy(buf_addr, buf.data(), count);
            m.set_result(count);
            return;
        }
        if (path == "/dev/null") {
            m.set_result(0);  // EOF
            return;
        }
    }

    // If fd 0 has been redirected (dup2'd to a pipe/file), read from VFS.
    // Only fall through to host stdin for our tty placeholder (CharDev "tty").
    if (fd == 0 && fs.is_open(fd)) {
        auto entry = fs.get_entry(fd);
        bool is_tty = entry && entry->type == vfs::FileType::CharDev && entry->name == "tty";
        if (!is_tty) {
            std::vector<uint8_t> buf(count);
            ssize_t n = fs.read(fd, buf.data(), count);
            if (n > 0) {
                m.memory.memcpy(buf_addr, buf.data(), n);
            }
            m.set_result(n > 0 ? n : 0);  // 0 = EOF for pipes/files
            return;
        }
        // tty placeholder — fall through to host stdin
    }

    if (fd == 0) {
#ifdef __EMSCRIPTEN__
        // Try non-blocking read from JavaScript stdin buffer
        auto view = m.memory.memview(buf_addr, count);
        int bytes_read = EM_ASM_INT({
            if (Module._stdinBuffer && Module._stdinBuffer.length > 0) {
                var off = Number($0);
                var toRead = Math.min(Number($1), Module._stdinBuffer.length);
                for (var i = 0; i < toRead; i++) {
                    Module.HEAPU8[off + i] = Module._stdinBuffer.shift();
                }
                return toRead;
            }
            if (Module._stdinEOF) return 0; // EOF
            return -1; // -1 means "no data yet", NOT EOF
        }, view.data(), count);
        if (bytes_read >= 0) {
            m.set_result(bytes_read);
        } else {
            // No data available — rewind PC to the ecall instruction
            // and stop the machine. When resumed, the ecall will
            // re-execute this syscall handler, retrying the read.
            g_waiting_for_stdin = true;
            m.cpu.increment_pc(-4);  // Rewind past ecall (4 bytes)
            m.stop();
        }
#else
        // Native mode: read from host stdin (pipe or terminal)
        if (g_checkpoint_on_stdin) {
            // Checkpoint mode: stop machine at stdin wait point
            // (don't block on read — we want to capture state here)
            g_waiting_for_stdin = true;
            m.cpu.increment_pc(-4);  // Rewind past ecall
            m.stop();
        } else {
            std::vector<uint8_t> buf(count);
            ssize_t n = ::read(STDIN_FILENO, buf.data(), count);
            if (n > 0) {
                m.memory.memcpy(buf_addr, buf.data(), n);
            }
            m.set_result(n >= 0 ? n : -errno);
        }
#endif
        return;
    }

    // Socket FDs: delegate to recv / network bridge
    if (net_is_socket_fd && net_is_socket_fd(fd)) {
#ifdef __EMSCRIPTEN__
        // Emscripten: read socket data from JS network bridge via RPC
        auto view = m.memory.memview(buf_addr, count);
        int bytes_read = EM_ASM_INT({
            if (typeof Module.readSocketData !== 'function') return 0;
            var result = Module.readSocketData($0, $1);
            if (result === null) return -11;
            if (result.length === 0) return 0;
            var off = Number($2);
            for (var i = 0; i < result.length; i++) {
                Module.HEAPU8[off + i] = result[i];
            }
            return result.length;
        }, fd, (int)count, view.data());
        dbg_fprintf(stderr, "[read-socket] fd=%d len=%zu bytes_read=%d\n", fd, count, bytes_read);
        m.set_result(bytes_read >= 0 ? bytes_read : -11 /*EAGAIN*/);
        return;
#else
        int native_fd = net_get_native_fd ? net_get_native_fd(fd) : -1;
        if (native_fd >= 0) {
            std::vector<uint8_t> buf(count);
            ssize_t n = ::recv(native_fd, buf.data(), count, 0);
            if (n > 0) {
                m.memory.memcpy(buf_addr, buf.data(), n);
            }
            m.set_result(n >= 0 ? n : -errno);
            return;
        }
#endif
    }

    // VectorHeart JSPI-managed FDs
    if (is_vh_fd(fd)) {
#ifdef __EMSCRIPTEN__
        auto* buf_ptr = m.memory.memarray<uint8_t>(buf_addr, count);
        m.set_result(js_opfs_io(fd, buf_ptr, count, 602, 0));
        return;
#endif
    }

    std::vector<uint8_t> buf(count);
    ssize_t n = fs.read(fd, buf.data(), count);
    if (fd > 2) {
        const auto path = fs.get_path(fd);
        if (!path.empty() && path == "/sys/fs/cgroup/cpu.max"
            && n >= 0 && g_trace_syscalls && !g_trace_after_cpu_max) {
            g_trace_after_cpu_max = true;
        }
    }
    if (n > 0) {
        m.memory.memcpy(buf_addr, buf.data(), n);
    }
    m.set_result(n);
}

static void sys_write(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);
    TRACE_SC("write(fd=%d, count=%zu)", fd, count);

    // /dev/tty fds (other than 0/1/2) redirect writes to stdout
    if (fd > 2 && g_tty_fds.count(fd)) {
        fd = 1;  // treat as stdout write
    }

    // /dev/null — discard all writes
    if (fd > 2) {
        auto path = fs.get_path(fd);
        if (path == "/dev/null") {
            m.set_result(count);
            return;
        }
    }

    // eventfd write: add value to counter, signal Fifo
    if (fd > 2 && g_eventfd_counters.count(fd) && count >= 8) {
        uint64_t val = m.memory.template read<uint64_t>(buf_addr);
        g_eventfd_counters[fd] += val;
        uint64_t total = g_eventfd_counters[fd];
        // Update Fifo content at offset 0 so epoll sees it as ready
        auto entry = fs.get_entry(fd);
        if (entry) {
            entry->content.resize(8);
            memcpy(entry->content.data(), &total, 8);
            entry->size = 8;
        }
        // Reset write offset to 0 for consistent eventfd semantics
        fs.lseek(fd, 0, 0);  // SEEK_SET

        // Wake threads sleeping on epoll instances that watch this eventfd.
        // Threads mark themselves as waiting with futex_addr = epfd.
        for (auto& [epfd, inst] : g_epoll_instances) {
            if (inst.interests.count(fd)) {
                // This epoll watches the eventfd we just wrote to.
                // Wake any thread sleeping on this epfd.
                for (int i = 0; i < MAX_VTHREADS; i++) {
                    if (g_sched.threads[i].active && g_sched.threads[i].waiting
                        && g_sched.threads[i].futex_addr == (uint64_t)epfd) {
                        g_sched.threads[i].waiting = false;
                        static int ewake = 0;
                        if (++ewake <= 20)
                            dbg_fprintf(stderr, "[eventfd-wake] write fd=%d → wake t%d (epfd=%d)\n",
                                    fd, i, epfd);
                    }
                }
            }
        }
        m.set_result(8);
        return;
    }

    // Check VFS first — fd 1/2 may have been dup2'd to a pipe/file
    if (fs.is_open(fd)) {
        // Check if this fd points to our tty placeholder (CharDevice named "tty").
        // If so, route to host printer instead of VFS write.
        auto entry = fs.get_entry(fd);
        if (entry && entry->type == vfs::FileType::CharDev && entry->name == "tty") {
            // This is our stdio placeholder — write to host console
            try {
                auto view = m.memory.memview(buf_addr, count);
                m.print(reinterpret_cast<const char*>(view.data()), count);
                m.set_result(count);
            } catch (...) {
                m.set_result(err::INVAL);
            }
            return;
        }
        std::vector<uint8_t> buf(count);
        m.memory.memcpy_out(buf.data(), buf_addr, count);
        ssize_t n = fs.write(fd, buf.data(), count);
        // Wake threads sleeping on epoll instances watching this pipe fd
        for (auto& [epfd, inst] : g_epoll_instances) {
            if (inst.interests.count(fd)) {
                for (int i = 0; i < MAX_VTHREADS; i++) {
                    if (g_sched.threads[i].active && g_sched.threads[i].waiting
                        && g_sched.threads[i].futex_addr == (uint64_t)epfd) {
                        g_sched.threads[i].waiting = false;
                    }
                }
            }
        }
        m.set_result(n);
        return;
    }

    // Default stdout/stderr go to host terminal
    if (fd == 1 || fd == 2) {
        try {
            auto view = m.memory.memview(buf_addr, count);
            m.print(reinterpret_cast<const char*>(view.data()), count);
            // Trace stderr content for debugging Go runtime errors
            if (fd == 2 && count > 0 && count < 4096) {
                std::string dbg(reinterpret_cast<const char*>(view.data()), count);
                dbg_fprintf(stderr, "[guest-stderr] %s", dbg.c_str());
                if (!dbg.empty() && dbg.back() != '\n') dbg_fprintf(stderr, "\n");
            }
            m.set_result(count);
        } catch (...) {
            m.set_result(err::INVAL);
        }
        return;
    }

    // Socket FDs: delegate to send / network bridge
    if (net_is_socket_fd && net_is_socket_fd(fd)) {
#ifdef __EMSCRIPTEN__
        std::vector<uint8_t> buf(count);
        m.memory.memcpy_out(buf.data(), buf_addr, count);
        int result = EM_ASM_INT({
            if (typeof Module.onSocketSend === 'function') {
                var data = new Uint8Array(Module.HEAPU8.buffer, Number($1), Number($2));
                return Module.onSocketSend($0, data);
            }
            return -38;
        }, fd, buf.data(), count);
        m.set_result(result >= 0 ? (int64_t)count : result);
        return;
#else
        int native_fd = net_get_native_fd ? net_get_native_fd(fd) : -1;
        if (native_fd >= 0) {
            std::vector<uint8_t> buf(count);
            m.memory.memcpy_out(buf.data(), buf_addr, count);
            ssize_t n = ::send(native_fd, buf.data(), count, 0);
            m.set_result(n >= 0 ? n : -errno);
            return;
        }
#endif
    }

    // VectorHeart JSPI-managed FDs
    if (is_vh_fd(fd)) {
#ifdef __EMSCRIPTEN__
        auto* buf_ptr = m.memory.memarray<uint8_t>(buf_addr, count);
        m.set_result(js_opfs_io(fd, buf_ptr, count, 601, 0));
        return;
#endif
    }
    m.set_result(err::BADF);
}

static void sys_writev(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto iov_addr = m.sysarg(1);
    int iovcnt = m.template sysarg<int>(2);

    TRACE_SC("writev(fd=%d, iovcnt=%d)", fd, iovcnt);

    // Check VFS first — fd 1/2 may have been dup2'd to a pipe/file
    if (fs.is_open(fd)) {
        // Check if this fd points to our tty placeholder — route to host console
        auto entry = fs.get_entry(fd);
        if (entry && entry->type == vfs::FileType::CharDev && entry->name == "tty") {
            size_t total = 0;
            for (int i = 0; i < iovcnt; i++) {
                uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
                uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
                if (len > 0) {
                    auto view = m.memory.memview(base, len);
                    m.print(reinterpret_cast<const char*>(view.data()), len);
                    total += len;
                }
            }
            m.set_result(total);
            return;
        }
        size_t total = 0;
        for (int i = 0; i < iovcnt; i++) {
            uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
            uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
            if (len > 0) {
                std::vector<uint8_t> buf(len);
                m.memory.memcpy_out(buf.data(), base, len);
                ssize_t n = fs.write(fd, buf.data(), len);
                if (n < 0) {
                    m.set_result(total > 0 ? (int64_t)total : n);
                    return;
                }
                total += n;
            }
        }
        m.set_result(total);
        return;
    }

    // Default stdout/stderr go to host terminal
    if (fd == 1 || fd == 2) {
        size_t total = 0;
        for (int i = 0; i < iovcnt; i++) {
            uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
            uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
            if (len > 0) {
                auto view = m.memory.memview(base, len);
                m.print(reinterpret_cast<const char*>(view.data()), len);
                total += len;
            }
        }
        m.set_result(total);
        return;
    }

    // Socket FDs: gather iov and send / network bridge
    if (net_is_socket_fd && net_is_socket_fd(fd)) {
#ifdef __EMSCRIPTEN__
        // Gather all iov buffers and send via network bridge
        size_t total = 0;
        for (int i = 0; i < iovcnt; i++) {
            uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
            uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
            if (len > 0) {
                std::vector<uint8_t> buf(len);
                m.memory.memcpy_out(buf.data(), base, len);
                int result = EM_ASM_INT({
                    if (typeof Module.onSocketSend === 'function') {
                        var data = new Uint8Array(Module.HEAPU8.buffer, Number($1), Number($2));
                        return Module.onSocketSend($0, data);
                    }
                    return -38;
                }, fd, buf.data(), len);
                if (result < 0) {
                    m.set_result(total > 0 ? (int64_t)total : result);
                    return;
                }
                total += len;
            }
        }
        m.set_result(total);
        return;
#else
        int native_fd = net_get_native_fd ? net_get_native_fd(fd) : -1;
        if (native_fd >= 0) {
            size_t total = 0;
            for (int i = 0; i < iovcnt; i++) {
                uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
                uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
                if (len > 0) {
                    std::vector<uint8_t> buf(len);
                    m.memory.memcpy_out(buf.data(), base, len);
                    ssize_t n = ::send(native_fd, buf.data(), len, 0);
                    if (n < 0) {
                        m.set_result(total > 0 ? (int64_t)total : -errno);
                        return;
                    }
                    total += n;
                    if (static_cast<size_t>(n) < len) break;
                }
            }
            m.set_result(total);
            return;
        }
#endif
    }

    m.set_result(err::BADF);
}

static void sys_lseek(Machine& m) {
    int fd = m.template sysarg<int>(0);
    int64_t offset = m.template sysarg<int64_t>(1);
    int whence = m.template sysarg<int>(2);

    if (is_vh_fd(fd)) {
#ifdef __EMSCRIPTEN__
        // js_opfs_io 604 handles positional reads, but for pure lseek 
        // we might need a dedicated op or manage offset in JS.
        // For now, return the offset to avoid breaking callers.
        m.set_result(js_opfs_io(fd, nullptr, 0, 605, (long)offset)); // Op 605 = lseek
        return;
#endif
    }

    auto& fs = get_fs(m);
    const int64_t res = fs.lseek(fd, offset, whence);
    if (fd > 2) {
        const auto path = fs.get_path(fd);
        if (!path.empty()
            && (path.rfind("/proc/", 0) == 0 || path.rfind("/sys/fs/cgroup/", 0) == 0)) {
            fprintf(stderr, "[lseek-probe] fd=%d path=%s off=%lld whence=%d => %lld\n",
                    fd, path.c_str(), (long long)offset, whence, (long long)res);
        }
    }
    m.set_result(res);
}

static void sys_getdents64(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);

    if (is_vh_fd(fd)) {
#ifdef __EMSCRIPTEN__
        auto* buf = m.memory.memarray<uint8_t>(buf_addr, count);
        m.set_result(js_opfs_io(fd, buf, count, 607, 0));
        return;
#endif
    }

    std::vector<uint8_t> buf(count);
    ssize_t n = fs.getdents64(fd, buf.data(), count);
    if (n > 0) {
        m.memory.memcpy(buf_addr, buf.data(), n);
    }
    m.set_result(n);
}

static bool fill_stat_from_fd(Machine& m, int fd, linux_stat64& st) {
    auto& fs = get_fs(m);
    st = {};
    st.st_dev = 1;
    st.st_nlink = 1;
    st.st_blksize = 4096;

    // stdio fds: check VFS first (may have been dup2'd to pipe/file)
    if (fd == 0 || fd == 1 || fd == 2) {
        if (fs.is_open(fd)) {
            auto entry = fs.get_entry(fd);
            if (entry && !(entry->type == vfs::FileType::CharDev && entry->name == "tty")) {
                // Not a tty placeholder — fall through to VFS stat below
                goto vfs_stat;
            }
        }
        st.st_mode = 020666;  // S_IFCHR | 0666
        return true;
    }

    // epoll/eventfd virtual fds behave like anon char devices
    if (g_epoll_instances.count(fd) || g_eventfd_counters.count(fd)) {
        st.st_mode = 020600;  // S_IFCHR | 0600
        return true;
    }

    // network socket fds
    if (net_is_socket_fd && net_is_socket_fd(fd)) {
        st.st_mode = 0140600;  // S_IFSOCK | 0600
        return true;
    }

    // VFS-backed fd (regular file, dir, fifo, symlink)
vfs_stat:
    auto entry = fs.get_entry(fd);
    if (entry) {
        std::string path = fs.get_path(fd);
        st.st_ino = std::hash<std::string>{}(path);
        st.st_mode = static_cast<uint32_t>(entry->type) | entry->mode;
        st.st_nlink = entry->is_dir() ? 2 : 1;
        st.st_uid = entry->uid;
        st.st_gid = entry->gid;
        st.st_size = entry->size;
        st.st_blocks = (entry->size + 511) / 512;
        st.st_mtime_sec = entry->mtime;
        st.st_atime_sec = entry->mtime;
        st.st_ctime_sec = entry->mtime;
        return true;
    }

    return false;
}


static void sys_newfstatat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    auto statbuf_addr = m.sysarg(2);
    int flags = m.template sysarg<int>(3);
    if (flags & AT_EMPTY_PATH) {
        if (is_vh_fd(dirfd)) {
#ifdef __EMSCRIPTEN__
            auto* buf = m.memory.memarray<uint8_t>(statbuf_addr, sizeof(linux_stat64));
            const int64_t rc = js_opfs_io(dirfd, buf, sizeof(linux_stat64), 606, 0);
            // Some VH backends do not implement op=606 for all fd classes.
            // Fall back to generic fd stat shape so Node startup does not hard-fail.
            if (rc != err::NOTSUP && rc != err::BADF) {
                m.set_result(rc);
                return;
            }
#endif
        }

        linux_stat64 st = {};
        if (fill_stat_from_fd(m, dirfd, st)) {
            m.memory.memcpy(statbuf_addr, &st, sizeof(st));
            m.set_result(0);
            return;
        }
        static int fstatat_badf_log = 0;
        if (fstatat_badf_log < 40) {
            fstatat_badf_log++;
            dbg_fprintf(stderr, "[fstatat-empty] BADF dirfd=%d flags=0x%x\n", dirfd, flags);
        }
        m.set_result(err::BADF);
        return;
    }

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    vfs::Entry entry;
    bool ok = (flags & AT_SYMLINK_NOFOLLOW) ? fs.lstat(path, entry) : fs.stat(path, entry);
    if (!ok) {
        m.set_result(err::NOENT);
        return;
    }

    linux_stat64 st = {};
    st.st_dev = 1;
    st.st_ino = std::hash<std::string>{}(path);
    st.st_mode = static_cast<uint32_t>(entry.type) | entry.mode;
    st.st_nlink = entry.is_dir() ? 2 : 1;
    st.st_uid = entry.uid;
    st.st_gid = entry.gid;
    st.st_size = entry.size;
    st.st_blksize = 4096;
    st.st_blocks = (entry.size + 511) / 512;
    st.st_mtime_sec = entry.mtime;
    st.st_atime_sec = entry.mtime;
    st.st_ctime_sec = entry.mtime;

    m.memory.memcpy(statbuf_addr, &st, sizeof(st));
    m.set_result(0);
}

static void sys_fstat(Machine& m) {
    int fd = m.template sysarg<int>(0);
    auto statbuf_addr = m.sysarg(1);

    if (is_vh_fd(fd)) {
#ifdef __EMSCRIPTEN__
        // Redirect to VH op 606 (fstat)
        // We pass statbuf_addr as the buffer
        auto* buf = m.memory.memarray<uint8_t>(statbuf_addr, sizeof(linux_stat64));
        const int64_t rc = js_opfs_io(fd, buf, sizeof(linux_stat64), 606, 0);
        // Some VH backends may return ENOTSUP/EBADF for op=606; in that case
        // degrade to generic fd stat instead of surfacing ENOTSUP to guest Node.
        if (rc != err::NOTSUP && rc != err::BADF) {
            m.set_result(rc);
            return;
        }
#endif
    }

    linux_stat64 st = {};    if (fill_stat_from_fd(m, fd, st)) {
        m.memory.memcpy(statbuf_addr, &st, sizeof(st));
        m.set_result(0);
        return;
    }
    static int fstat_badf_log = 0;
    if (fstat_badf_log < 80) {
        fstat_badf_log++;
        dbg_fprintf(stderr, "[fstat] BADF fd=%d\n", fd);
    }
    m.set_result(err::BADF);
}

static void sys_readlinkat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    auto buf_addr = m.sysarg(2);
    size_t bufsiz = m.sysarg(3);

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    std::vector<char> buf(bufsiz);
    ssize_t n = fs.readlink(path, buf.data(), bufsiz);
    if (n > 0) {
        m.memory.memcpy(buf_addr, buf.data(), n);
    }
    m.set_result(n);
}

static void sys_getcwd(Machine& m) {
    auto& fs = get_fs(m);
    auto buf_addr = m.sysarg(0);
    size_t size = m.sysarg(1);

    std::string cwd = fs.getcwd();
    if (cwd.size() + 1 > size) {
        m.set_result(-34);  // ERANGE
        return;
    }
    m.memory.memcpy(buf_addr, cwd.c_str(), cwd.size() + 1);
    m.set_result(buf_addr);
}

static void sys_chdir(Machine& m) {
    auto& fs = get_fs(m);
    std::string path;
    try {
        path = m.memory.memstring(m.sysarg(0));
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    m.set_result(fs.chdir(path) ? 0 : err::NOENT);
}

static void sys_faccessat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);

    std::string path;
    try {
        path = m.memory.memstring(m.sysarg(1));
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    vfs::Entry entry;
    const int rc = fs.stat(path, entry) ? 0 : err::NOENT;
    m.set_result(rc);
}

static void sys_getpid(Machine& m) {
    g_process_model.set_current(g_process_model.current_pid);
    if (g_trace_syscalls && g_trace_countdown-- > 0)
        dbg_fprintf(stderr, "[TRACE] getpid() => %d pc=0x%lx\n", (int)g_process_model.current_pid, (long)m.cpu.pc());
    m.set_result(g_process_model.current_pid);
}
static void sys_getppid(Machine& m) {
    m.set_result(g_process_model.current_ppid);
}
static void sys_gettid(Machine& m) {
    int tid;
    if (g_sched.count > 0) {
        tid = g_sched.threads[g_sched.current].tid;
    } else {
        tid = 1;
    }
    if (g_trace_syscalls && g_trace_countdown-- > 0)
        dbg_fprintf(stderr, "[TRACE] gettid() => %d pc=0x%lx\n", tid, (long)m.cpu.pc());
    m.set_result(tid);
}
static void sys_getuid(Machine& m) {
#ifdef __EMSCRIPTEN__
    m.set_result(0);
#else
    m.set_result(::getuid());
#endif
}
static void sys_geteuid(Machine& m) {
#ifdef __EMSCRIPTEN__
    m.set_result(0);
#else
    m.set_result(::geteuid());
#endif
}
static void sys_getgid(Machine& m) {
#ifdef __EMSCRIPTEN__
    m.set_result(0);
#else
    m.set_result(::getgid());
#endif
}
static void sys_getegid(Machine& m) {
#ifdef __EMSCRIPTEN__
    m.set_result(0);
#else
    m.set_result(::getegid());
#endif
}
static void sys_set_tid_address(Machine& m) {
    auto tidptr = m.sysarg(0);
    // Store clear_child_tid for current thread (used on thread exit)
    if (g_sched.count > 0) {
        g_sched.threads[g_sched.current].clear_child_tid = tidptr;
        int tid = g_sched.threads[g_sched.current].tid;
        dbg_fprintf(stderr, "[set_tid_address] count=%d current=%d tid=%d tidptr=0x%lx\n",
                g_sched.count, g_sched.current, tid, (long)tidptr);
        m.set_result(tid);
    } else {
        dbg_fprintf(stderr, "[set_tid_address] count=0 → returning 1 tidptr=0x%lx\n", (long)tidptr);
        m.set_result(1);
    }
}
static void sys_set_robust_list(Machine& m) { m.set_result(0); }

static void sys_clock_gettime(Machine& m) {
    auto clk_id = m.template sysarg<int>(0);
    auto tp_addr = m.sysarg(1);

    clockid_t host_clk = CLOCK_REALTIME;
    switch (clk_id) {
        case 0: host_clk = CLOCK_REALTIME; break;   // CLOCK_REALTIME
        case 1: host_clk = CLOCK_MONOTONIC; break;   // CLOCK_MONOTONIC
        case 4: // CLOCK_MONOTONIC_RAW → fallback to MONOTONIC
#ifdef CLOCK_MONOTONIC_RAW
            host_clk = CLOCK_MONOTONIC_RAW; break;
#else
            host_clk = CLOCK_MONOTONIC; break;
#endif
        case 5: // CLOCK_REALTIME_COARSE → fallback to REALTIME
#ifdef CLOCK_REALTIME_COARSE
            host_clk = CLOCK_REALTIME_COARSE; break;
#else
            host_clk = CLOCK_REALTIME; break;
#endif
        case 6: // CLOCK_MONOTONIC_COARSE → fallback to MONOTONIC
#ifdef CLOCK_MONOTONIC_COARSE
            host_clk = CLOCK_MONOTONIC_COARSE; break;
#else
            host_clk = CLOCK_MONOTONIC; break;
#endif
        case 7: // CLOCK_BOOTTIME → fallback to MONOTONIC
#ifdef CLOCK_BOOTTIME
            host_clk = CLOCK_BOOTTIME; break;
#else
            host_clk = CLOCK_MONOTONIC; break;
#endif
        default: host_clk = CLOCK_MONOTONIC; break;
    }

    struct timespec ts;
    int rc = clock_gettime(host_clk, &ts);
    if (rc != 0) {
        // Fallback: if the host rejects this clock, try CLOCK_MONOTONIC
        if (host_clk != CLOCK_MONOTONIC && host_clk != CLOCK_REALTIME) {
            rc = clock_gettime(CLOCK_MONOTONIC, &ts);
        }
        if (rc != 0) {
            // Last resort: use CLOCK_REALTIME
            rc = clock_gettime(CLOCK_REALTIME, &ts);
        }
        if (rc != 0) {
            dbg_fprintf(stderr, "[clock_gettime] FAILED clk_id=%d host_clk=%d\n", clk_id, (int)host_clk);
            m.set_result(err::INVAL);
            return;
        }
    }

    linux_timespec lts;
    lts.tv_sec = ts.tv_sec;
    lts.tv_nsec = ts.tv_nsec;
    m.memory.memcpy(tp_addr, &lts, sizeof(lts));
    m.set_result(0);

    if (g_trace_syscalls && g_trace_countdown-- > 0)
        dbg_fprintf(stderr, "[TRACE] clock_gettime(clk=%d=>host=%d) => %lld.%09lld pc=0x%lx\n", clk_id, (int)host_clk, (long long)lts.tv_sec, (long long)lts.tv_nsec, (long)m.cpu.pc());

    // Preemptive scheduling: yield to other threads periodically
    maybe_preempt(m);
}

static void sys_getrandom(Machine& m) {
    auto* ctx = get_ctx(m);
    auto buf_addr = m.sysarg(0);
    size_t count = m.sysarg(1);
    auto flags = m.template sysarg<unsigned int>(2);

    if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[getrandom] buf=0x%lx count=%zu flags=0x%x pc=0x%lx\n",
            (long)buf_addr, count, flags, (long)m.cpu.pc());

    std::vector<uint8_t> buf(count);
#ifdef __EMSCRIPTEN__
    // In wasm builds, avoid repeated /dev/urandom fopen() attempts.
    for (size_t i = 0; i < count; i++)
        buf[i] = ctx->rng() & 0xFF;
#else
    FILE* urandom = fopen("/dev/urandom", "rb");
    if (urandom) {
        size_t got = fread(buf.data(), 1, count, urandom);
        fclose(urandom);
        if (got < count) {
            for (size_t i = got; i < count; i++)
                buf[i] = ctx->rng() & 0xFF;
        }
    } else {
        for (size_t i = 0; i < count; i++)
            buf[i] = ctx->rng() & 0xFF;
    }
#endif
    m.memory.memcpy(buf_addr, buf.data(), count);
    m.set_result(count);
}

// Saved reference to libriscv's built-in mmap handler.
// We override mmap to handle file-backed mappings via our VFS, since
// libriscv's handler tries machine.fds().translate(vfd) which fails
// because our VFS fds aren't in libriscv's fd table.
inline Machine::syscall_t libriscv_mmap_handler = nullptr;

struct MmapGuard {
    uint64_t pc = 0;
    uint64_t ra = 0;
    uint64_t sp = 0;
    uint8_t stack_canary[64] {};
    bool armed = false;

    void snapshot(const Machine& m) {
        pc = m.cpu.pc();
        ra = m.cpu.reg(riscv::REG_RA);
        sp = m.cpu.reg(riscv::REG_SP);
        if (sp == 0) return;
        try {
            m.memory.memcpy_out(stack_canary, sp, sizeof(stack_canary));
            armed = true;
        } catch (...) {
            armed = false;
        }
    }

    bool verify(const Machine& m) const {
        if (!armed) return true;
        if (m.cpu.reg(riscv::REG_RA) == 0 || m.cpu.reg(riscv::REG_RA) == pc) {
            return false;
        }
        if (m.cpu.reg(riscv::REG_SP) != sp) return false;
        if (sp == 0) return true;
        uint8_t current[64] {};
        try {
            m.memory.memcpy_out(current, sp, sizeof(current));
        } catch (...) {
            return false;
        }
        return std::memcmp(stack_canary, current, sizeof(stack_canary)) == 0;
    }
};

// mmap — intercept file-backed mappings, delegate anonymous to libriscv
static void sys_mmap(Machine& m) {
    const uint64_t pc = m.cpu.pc();
    if (g_disable_custom_mmap_wrapper || (g_custom_mmap_bypass_pc != 0 && pc == g_custom_mmap_bypass_pc)) {
        libriscv_mmap_handler(m);
        return;
    }
    MmapGuard guard;
    guard.snapshot(m);
    auto assert_guard = [&guard, &m]() {
        if (!guard.verify(m)) __builtin_trap();
    };
    const auto mmap_boundary_call_id = begin_mmap_boundary_probe(m);
    auto dump_boundary = [mmap_boundary_call_id, &m](const char* phase) {
        dump_mmap_boundary_phase(m, mmap_boundary_call_id, phase);
        dump_mmap_boundary_decode_once(m, phase);
        check_mmap_boundary_drift(m, mmap_boundary_call_id, phase);
    };
    dump_boundary("entry");
    auto* ctx = get_ctx(m);
    int vfd = m.template sysarg<int>(4);

    if (vfd == -1) {
        auto addr_g = m.sysarg(0);
        auto length = m.sysarg(1);
        auto prot   = m.template sysarg<int>(2);
        auto flags  = m.template sysarg<int>(3);
        constexpr int MAP_FIXED = 0x10;
        auto anon = alloc_anon_mapping(m, addr_g, length, flags);
        if (anon.error != 0) {
            rails_note_mmap_fail(m.cpu.pc());
        if (anon.error == -12 && (flags & MAP_FIXED) && g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[mmap-FIXED-OOB] addr=0x%lx len=0x%lx limit=0x%lx ENOMEM\n",
                    (long)addr_g, (long)length, (long)arena_limit());
        m.set_result(uint64_t(anon.error));
        assert_guard();
        dump_boundary("anon-error");
        return;
    }

        const bool brk_guard_page =
            (flags & MAP_FIXED) &&
            prot == 0 &&
            anon.aligned_len == 0x1000 &&
            anon.addr == g_exec_ctx.brk_base &&
            g_exec_ctx.brk_current >= g_exec_ctx.brk_base + anon.aligned_len;
        if (brk_guard_page) {
            g_exec_ctx.brk_base += anon.aligned_len;
            if (g_exec_ctx.brk_current < g_exec_ctx.brk_base) {
                g_exec_ctx.brk_current = g_exec_ctx.brk_base;
            }
            m.memory.set_heap_address(g_exec_ctx.brk_base);
            fprintf(stderr,
                    "[brk-guard] old_base=0x%lx new_base=0x%lx cur=0x%lx mmap=0x%lx\n",
                    (long)(g_exec_ctx.brk_base - anon.aligned_len),
                    (long)g_exec_ctx.brk_base,
                    (long)g_exec_ctx.brk_current,
                    (long)m.memory.mmap_address());
        }

        // Anonymous mmap must always start zero-filled. Reused holes and
        // MAP_FIXED replacements obviously need clearing, but fresh bump
        // allocations do too once we materialize pages up front.
        if (anon.aligned_len > 0) {
            if constexpr (riscv::encompassing_Nbit_arena != 0) {
                auto* arena = (uint8_t*)m.memory.memory_arena_ptr();
                if (arena && anon.addr + anon.aligned_len <= m.memory.memory_arena_size()) {
                    std::memset(arena + anon.addr, 0, anon.aligned_len);
                } else {
                    m.memory.memset(anon.addr, 0, anon.aligned_len);
                }
            } else {
                m.memory.memset(anon.addr, 0, anon.aligned_len);
            }
        }

        if ((anon.addr >= m.memory.mmap_start() || brk_guard_page) && anon.aligned_len > 0) {
            const auto attr = mmap_attr_from_prot(prot);
            static int anon_attr_probe_count = 0;
            ++anon_attr_probe_count;
            const bool trace_anon_attr =
                anon_attr_probe_count <= 64 && (g_trace_after_cpu_max || anon.aligned_len >= (1ULL << 20));
            if (trace_anon_attr) {
                fprintf(stderr,
                        "[mmap-anon-probe] before set_page_attr addr=0x%lx len=0x%lx prot=%d flags=0x%x\n",
                        (long)anon.addr, (long)anon.aligned_len, prot, flags);
            }
            const bool materialize_attrs =
                brk_guard_page || should_materialize_anon_mmap(m, anon.addr, anon.aligned_len, attr);
            if (!materialize_attrs) {
                enable_lazy_mmap_page_tables(m);
                free_materialized_pages_for_range(m, anon.addr, anon.aligned_len);
            }
            if (materialize_attrs) {
                m.memory.set_page_attr(anon.addr, anon.aligned_len, attr);
            }
            if (trace_anon_attr) {
                fprintf(stderr,
                        "[mmap-anon-probe] after %s addr=0x%lx len=0x%lx\n",
                        materialize_attrs ? "set_page_attr" : "skip-attr-materialize",
                        (long)anon.addr, (long)anon.aligned_len);
            }
            live_mmap_map(anon.addr, anon.aligned_len, attr, !materialize_attrs, true);
        }

        m.set_result(anon.addr);
        rails_note_mmap(m.cpu.pc(), m.cpu.reg(1), anon.aligned_len);
        {   static int anon_flow_debug_budget = 96;
            if (anon_flow_debug_budget-- > 0) {
                fprintf(stderr,
                        "[mmap-anon-flow] pc=0x%lx ra=0x%lx hint=0x%lx len=0x%lx prot=%d flags=0x%x => addr=0x%lx aligned=0x%lx reuse=%d ignored_hint=%d bump=0x%lx\n",
                        (long)m.cpu.pc(), (long)m.cpu.reg(1),
                        (long)addr_g, (long)length, prot, flags,
                        (long)anon.addr, (long)anon.aligned_len,
                        (int)anon.from_reuse_cache, (int)anon.ignored_hint,
                        (long)g_mmap_bump);
                fflush(stderr);
            }
        }
        dump_boundary("anon-success");
        assert_guard();

        static int anon_count = 0;
        ++anon_count;
        if (anon_count <= 20)
            if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[mmap-anon] #%d addr=0x%lx len=0x%lx prot=%d flags=0x%x => 0x%lx (bump=0x%lx)\n",
                    anon_count, (long)addr_g, (long)length, prot, flags, (long)anon.addr, (long)g_mmap_bump);

        maybe_preempt(m);
        assert_guard();
        dump_boundary("anon-return");
        return;
    }

    // File-backed mapping: use our VFS
    auto addr_g = m.sysarg(0);
    auto length = m.sysarg(1);
    auto prot   = m.template sysarg<int>(2);
    auto flags  = m.template sysarg<int>(3);
    auto offset = m.sysarg(5);
    std::string fd_path = ctx->fs->get_path(vfd);
    if (g_trace_syscalls && g_trace_countdown-- > 0) std::cerr << "[mmap] fd=" << vfd << " path=" << fd_path
              << " addr=0x" << std::hex << addr_g
              << " len=0x" << length
              << " prot=" << std::dec << prot
              << " flags=0x" << std::hex << flags
              << " off=0x" << offset << std::dec << "\n";

    constexpr int MAP_FIXED = 0x10;
    constexpr uint64_t PAGE_MASK = 4095;

    // Linux requires alignment for MAP_FIXED target and file offset.
    // For non-fixed mappings, an unaligned hint should not fail the call.
    if ((flags & MAP_FIXED) && (addr_g % 4096 != 0)) {
        rails_note_mmap_fail(m.cpu.pc());
        m.set_result(uint64_t(-22));  // -EINVAL
        assert_guard();
        dump_boundary("file-fixed-align-error");
        return;
    }
    if (offset % 4096 != 0) {
        rails_note_mmap_fail(m.cpu.pc());
        m.set_result(uint64_t(-22));  // -EINVAL
        assert_guard();
        dump_boundary("file-offset-align-error");
        return;
    }
    if (!(flags & MAP_FIXED) && (addr_g % 4096 != 0)) {
        // Ignore misaligned hints to match Linux behavior.
        addr_g = 0;
    }
    length = (length + PAGE_MASK) & ~PAGE_MASK;

    // Get VFS entry content
    auto entry = ctx->fs->get_entry(vfd);
    if (!entry || !entry->is_file()) {
        rails_note_mmap_fail(m.cpu.pc());
        m.set_result(uint64_t(-9));  // -EBADF
        assert_guard();
        dump_boundary("file-bad-fd");
        return;
    }

    // Determine destination address (same logic as libriscv)
    auto& nextfree = m.memory.mmap_address();
    const uint64_t nextfree_before = nextfree;
    uint64_t dst;

    if (addr_g == 0) {
        // No preferred address: allocate at nextfree
        if constexpr (riscv::encompassing_Nbit_arena > 0) {
            if (nextfree + length > riscv::encompassing_arena_mask) {
                rails_note_mmap_fail(m.cpu.pc());
                m.set_result(uint64_t(-12));  // -ENOMEM
                assert_guard();
                dump_boundary("file-nextfree-oob");
                return;
            }
        }
        dst = nextfree;
        nextfree += length;
    } else if ((flags & MAP_FIXED) && addr_g < m.memory.mmap_start()) {
        // Fixed mapping below mmap arena (e.g., in code/data segments)
        dst = addr_g;
    } else if ((flags & MAP_FIXED) && addr_g >= m.memory.mmap_start() && addr_g + length <= nextfree) {
        // Fixed mapping inside already-allocated mmap arena
        dst = addr_g;
    } else if ((flags & MAP_FIXED) && addr_g >= m.memory.mmap_start()) {
        // Fixed mapping extending mmap arena
            if constexpr (riscv::encompassing_Nbit_arena > 0) {
                uint64_t needed_end = addr_g + length;
                if (needed_end > riscv::encompassing_arena_mask) {
                    rails_note_mmap_fail(m.cpu.pc());
                    m.set_result(uint64_t(-12));  // -ENOMEM
                    assert_guard();
                    dump_boundary("file-fixed-oob");
                    return;
                }
            }
        if (addr_g + length > nextfree)
            nextfree = addr_g + length;
        dst = addr_g;
    } else {
        dst = addr_g;
    }

    if (flags & MAP_FIXED) {
        invalidate_reuse_cache(m, dst, length);
    }

    // Make the area writable for the copy
    riscv::PageAttributes rw_attr;
    rw_attr.read = true;
    rw_attr.write = true;
    m.memory.set_page_attr(dst, length, rw_attr);

    // File-backed mappings must be zero-filled beyond the copied file bytes.
    // Fresh bump allocations in the encompassing arena are not guaranteed to
    // be clean after prior execs or mmaps, so always clear the destination
    // before copying the file contents.
    const bool reusing_existing_bytes = dst < nextfree_before;
    if (length > 0) {
        if (reusing_existing_bytes) {
            m.memory.memdiscard(dst, length, true);
        } else if constexpr (riscv::encompassing_Nbit_arena != 0) {
            auto* arena = (uint8_t*)m.memory.memory_arena_ptr();
            if (arena && dst + length <= m.memory.memory_arena_size()) {
                std::memset(arena + dst, 0, length);
            } else {
                m.memory.memset(dst, 0, length);
            }
        } else {
            m.memory.memset(dst, 0, length);
        }
    }


    // Copy file data from VFS directly into guest memory
    const auto& content = entry->content;
    if (offset < content.size()) {
        size_t avail = content.size() - offset;
        size_t to_copy = std::min((size_t)length, avail);
        m.memory.memcpy(dst, content.data() + offset, to_copy);
    }

    // Set final page attributes. When a later PT_LOAD overlaps the tail of an
    // earlier executable mapping, Linux effectively merges the page
    // permissions on the shared boundary pages. Without this, shared-library
    // PLT/text pages can lose execute permission during ld-musl startup.
    auto attr = mmap_attr_from_prot(prot);
    if (length > 0 && (dst < nextfree_before || (flags & MAP_FIXED))) {
        for (uint64_t page = dst; page < dst + length; page += 4096) {
            if (const auto* old_region = live_mmap_find(page); old_region != nullptr) {
                attr = merge_live_mmap_attr(attr, old_region->attr);
            }
        }
    }
    m.memory.set_page_attr(dst, length, attr);
    if (dst >= m.memory.mmap_start() && length > 0) {
        live_mmap_map(dst, length, attr);
    }

    m.set_result(dst);
    assert_guard();
    rails_note_mmap(m.cpu.pc(), m.cpu.reg(1), length);
    dump_boundary("file-success");

#ifdef __EMSCRIPTEN__
    // JIT invalidation: MAP_FIXED overwrites existing pages, potentially
    // replacing JIT-compiled code. Also trigger on any writable mapping
    // over regions that might have been executable.
    if (flags & MAP_FIXED) {
        EM_ASM({
            if (typeof Module._jitInvalidateRange === 'function') {
                Module._jitInvalidateRange($0 >>> 0, $1 >>> 0);
            }
        }, (uint32_t)dst, (uint32_t)length);
    }
#endif

    if (g_trace_syscalls && g_trace_countdown-- > 0) std::cerr << "[mmap] => 0x" << std::hex << dst << std::dec
              << " (nextfree=0x" << std::hex << nextfree << std::dec << ")\n";
    assert_guard();
    dump_boundary("file-return");
}

// mprotect — no-op during child execution to prevent RELRO from
// poisoning page permissions and the decoder cache. The child's
// interpreter applies RELRO (read-only relocations) which changes
// page attributes AND decoder cache entries. After parent restore,
// these stale entries cause protection faults we can't easily fix.
// By making mprotect a no-op for the child, pages stay in their
// pre-fork state and the parent can resume cleanly.
static void sys_mprotect(Machine& m) {
    auto addr = m.sysarg(0);
    auto len  = m.sysarg(1);
    auto prot = m.template sysarg<int>(2);

    static int mprot_count = 0;
    if (++mprot_count <= 50)
        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[mprotect] #%d addr=0x%lx len=0x%lx prot=%d pc=0x%lx\n",
                mprot_count, (long)addr, (long)len, prot, (long)m.cpu.pc());

    // Apply page attributes for the mmap region (thread stacks, etc.).
    // musl allocates thread stacks with PROT_NONE then mprotects them writable.
    // Without this, thread stacks would be inaccessible.
    if (addr >= m.memory.mmap_start()) {
        const auto* old_region = live_mmap_find(addr);
        const auto attr = mmap_attr_from_prot(prot);
        const bool anonymous = old_region != nullptr && old_region->anonymous;
        if (anonymous) {
            // Anonymous mappings already live in the encompassing arena. Do
            // not eagerly materialize every page on mprotect: large V8
            // reservations can span hundreds of MB, and future page faults
            // should materialize untouched pages with the updated attrs.
            enable_lazy_mmap_page_tables(m);
            set_materialized_page_attrs_for_range(m, addr, len, attr);
            live_mmap_map(addr, len, attr, true, true);
        } else {
            m.memory.set_page_attr(addr, len, attr);
            live_mmap_map(addr, len, attr, false, false);
        }
    }

#ifdef __EMSCRIPTEN__
    // JIT invalidation: when a page becomes writable, any JIT-compiled
    // code in that region must be invalidated (e.g. V8 patching code,
    // dynamic linker relocations, self-modifying code).
    if (prot & 2) { // PROT_WRITE
        EM_ASM({
            if (typeof Module._jitInvalidateRange === 'function') {
                Module._jitInvalidateRange($0 >>> 0, $1 >>> 0);
            }
        }, (uint32_t)addr, (uint32_t)len);
    }
#endif

    // For pages below mmap_start (code/data segments), remain a no-op
    // to avoid RELRO decoder cache invalidation issues.
    m.set_result(0);
}

// munmap — In the encompassing arena model, we can't truly free pages.
// Return 0 (success) so callers think the unmap worked. Optionally zero
// the region to prevent stale data from leaking to future mmaps.
static void sys_munmap(Machine& m) {
    auto addr = m.sysarg(0);
    auto len  = m.sysarg(1);
    uint64_t aligned_len = (len + 4095) & ~4095ULL;
    const bool keep_monotonic = keep_monotonic_small_anon_unmap(addr, aligned_len);

    static int munmap_count = 0;
    if (++munmap_count <= 50)
        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[munmap] addr=0x%lx len=0x%lx pc=0x%lx\n",
                (long)addr, (long)aligned_len, (long)m.cpu.pc());
    {   static int munmap_flow_debug_budget = 96;
        if (munmap_flow_debug_budget-- > 0) {
            fprintf(stderr,
                    "[munmap-flow] pc=0x%lx ra=0x%lx addr=0x%lx len=0x%lx keep_monotonic=%d bump_before=0x%lx\n",
                    (long)m.cpu.pc(), (long)munmap_return_ra(m),
                    (long)addr, (long)aligned_len, (int)keep_monotonic,
                    (long)g_mmap_bump);
            fflush(stderr);
        }
    }

    custom_unmap_range(m, addr, aligned_len, m.cpu.pc(), munmap_return_ra(m));
    if (addr >= m.memory.mmap_start() && aligned_len > 0) {
        if (g_lazy_mmap_page_tables_enabled) {
            free_materialized_pages_for_range(m, addr, aligned_len);
        } else {
            riscv::PageAttributes none {};
            none.read = false;
            none.write = false;
            none.exec = false;
            m.memory.set_page_attr(addr, aligned_len, none);
        }
        live_mmap_unmap(addr, aligned_len);
    }

#ifdef __EMSCRIPTEN__
    // JIT invalidation: unmapped pages may have contained JIT-compiled code.
    EM_ASM({
        if (typeof Module._jitInvalidateRange === 'function') {
            Module._jitInvalidateRange($0 >>> 0, $1 >>> 0);
        }
    }, (uint32_t)addr, (uint32_t)aligned_len);
#endif

    m.set_result(0);
}

// g_signal_mask and g_sigactions defined at top of namespace handlers block

static void sys_sigaction(Machine& m) {
    int signum = m.template sysarg<int>(0);
    auto act_addr = m.sysarg(1);    // new action (or 0)
    auto oldact_addr = m.sysarg(2); // old action output (or 0)
    auto sigsetsize = m.sysarg(3);  // size of sigset_t in the mask field

    TRACE_SC("sigaction(sig=%d, act=0x%lx, oldact=0x%lx, setsize=%lu)",
             signum, (long)act_addr, (long)oldact_addr, (long)sigsetsize);

    if (signum < 1 || signum > 64) {
        m.set_result(err::INVAL);
        return;
    }

    // Write old action if requested
    if (oldact_addr != 0) {
        m.memory.memcpy(oldact_addr, g_sigactions[signum - 1], 40);
    }

    // Store new action if provided
    if (act_addr != 0) {
        m.memory.memcpy_out(g_sigactions[signum - 1], act_addr, 40);
    }

    m.set_result(0);
}

static void sys_sigprocmask(Machine& m) {
    int how = m.template sysarg<int>(0);
    auto set_addr = m.sysarg(1);     // new mask (or 0)
    auto oldset_addr = m.sysarg(2);  // old mask output (or 0)
    auto sigsetsize = m.sysarg(3);   // typically 8
    static int child_trampoline_probe_budget = 8;

    TRACE_SC("sigprocmask(how=%d, set=0x%lx, oldset=0x%lx, size=%lu)",
             how, (long)set_addr, (long)oldset_addr, (long)sigsetsize);
    if (g_trace_syscalls && child_trampoline_probe_budget > 0 && m.cpu.pc() == 0x18050ce8ULL) {
        child_trampoline_probe_budget--;
        const uint64_t thread_obj = m.cpu.reg(15); // a5 in the trampoline
        uint64_t start_fn = 0;
        uint64_t start_arg = 0;
        try { start_fn = m.memory.template read<uint64_t>(thread_obj + 0); } catch (...) {}
        try { start_arg = m.memory.template read<uint64_t>(thread_obj + 8); } catch (...) {}
        fprintf(stderr,
                "[thread-start-probe] pc=0x%lx thread=0x%lx fn=0x%lx arg=0x%lx sp=0x%lx tp=0x%lx ra=0x%lx\n",
                (unsigned long)m.cpu.pc(),
                (unsigned long)thread_obj,
                (unsigned long)start_fn,
                (unsigned long)start_arg,
                (unsigned long)m.cpu.reg(riscv::REG_SP),
                (unsigned long)m.cpu.reg(4),
                (unsigned long)m.cpu.reg(riscv::REG_RA));
        dump_guest_qwords(m, "[thread-start-probe] thread-window:", thread_obj, 8);
        dump_guest_qwords(m, "[thread-start-probe] child-stack:", m.cpu.reg(riscv::REG_SP), 8);
        if (start_arg >= 0x1000) {
            dump_guest_qwords(m, "[thread-start-probe] arg-window:", start_arg, 12);
        }
        g_single_step_budget = 4096;
        g_single_step_resume = true;
        m.stop();
    }

    // Write old mask if requested
    if (oldset_addr != 0) {
        if (sigsetsize >= 16) {
            m.memory.template write<uint64_t>(oldset_addr, g_signal_mask[0]);
            m.memory.template write<uint64_t>(oldset_addr + 8, g_signal_mask[1]);
        } else if (sigsetsize >= 8) {
            m.memory.template write<uint64_t>(oldset_addr, g_signal_mask[0]);
        }
    }

    // Apply new mask if provided
    if (set_addr != 0) {
        uint64_t new_mask[2] = {0, 0};
        if (sigsetsize >= 16) {
            new_mask[0] = m.memory.template read<uint64_t>(set_addr);
            new_mask[1] = m.memory.template read<uint64_t>(set_addr + 8);
        } else if (sigsetsize >= 8) {
            new_mask[0] = m.memory.template read<uint64_t>(set_addr);
        }

        constexpr int SIG_BLOCK = 0;
        constexpr int SIG_UNBLOCK = 1;
        constexpr int SIG_SETMASK = 2;
        switch (how) {
            case SIG_BLOCK:
                g_signal_mask[0] |= new_mask[0];
                g_signal_mask[1] |= new_mask[1];
                break;
            case SIG_UNBLOCK:
                g_signal_mask[0] &= ~new_mask[0];
                g_signal_mask[1] &= ~new_mask[1];
                break;
            case SIG_SETMASK:
                g_signal_mask[0] = new_mask[0];
                g_signal_mask[1] = new_mask[1];
                break;
        }
    }
    m.set_result(0);
}
static void sys_prlimit64(Machine& m) {
    // pid_t pid = m.template sysarg<int>(0);  // ignored (always self)
    unsigned int resource = m.template sysarg<unsigned int>(1);
    auto new_rlim_addr = m.sysarg(2);
    auto old_rlim_addr = m.sysarg(3);

    // struct rlimit64 { uint64_t rlim_cur; uint64_t rlim_max; }
    constexpr unsigned RLIMIT_NOFILE = 7;
    constexpr unsigned RLIMIT_STACK  = 3;
    constexpr unsigned RLIMIT_AS     = 9;

    // Defaults for common resources
    uint64_t cur = 1024, max = 1024;
    switch (resource) {
        case RLIMIT_NOFILE: cur = 1024; max = 1024; break;
        case RLIMIT_STACK:  cur = 8*1024*1024; max = UINT64_MAX; break;
        case RLIMIT_AS:     cur = UINT64_MAX; max = UINT64_MAX; break;
        default:            cur = UINT64_MAX; max = UINT64_MAX; break;
    }

    // Write old limits if requested
    if (old_rlim_addr != 0) {
        m.memory.template write<uint64_t>(old_rlim_addr, cur);
        m.memory.template write<uint64_t>(old_rlim_addr + 8, max);
    }
    // Ignore new limits (read-only emulation)
    (void)new_rlim_addr;
    m.set_result(0);
}
static void sys_getrlimit(Machine& m) {
    unsigned int resource = m.template sysarg<unsigned int>(0);
    auto rlim_addr = m.sysarg(1);
    constexpr unsigned RLIMIT_NOFILE = 7;
    constexpr unsigned RLIMIT_STACK  = 3;
    constexpr unsigned RLIMIT_AS     = 9;
    uint64_t cur = UINT64_MAX, max = UINT64_MAX;
    switch (resource) {
        case RLIMIT_NOFILE: cur = 1024; max = 1024; break;
        case RLIMIT_STACK:  cur = 8*1024*1024; max = UINT64_MAX; break;
        case RLIMIT_AS:     cur = UINT64_MAX; max = UINT64_MAX; break;
    }
    if (rlim_addr != 0) {
        m.memory.template write<uint64_t>(rlim_addr, cur);
        m.memory.template write<uint64_t>(rlim_addr + 8, max);
    }
    dbg_fprintf(stderr, "[getrlimit] resource=%u => cur=%llu max=%llu\n",
            resource,
            (unsigned long long)cur,
            (unsigned long long)max);
    m.set_result(0);
}
static void sys_rseq(Machine& m) { m.set_result(err::NOSYS); }

// sendfile(out_fd, in_fd, offset, count) - copy data between fds via VFS
static void sys_sendfile(Machine& m) {
    auto* ctx = get_ctx(m);
    int out_fd = m.template sysarg<int>(0);
    int in_fd = m.template sysarg<int>(1);
    auto offset_ptr = m.sysarg(2);
    size_t count = m.sysarg(3);

    // Read from in_fd
    if (count > 65536) count = 65536;  // cap single transfer
    std::vector<uint8_t> buf(count);

    // Handle offset if provided
    if (offset_ptr != 0) {
        int64_t off = m.memory.template read<int64_t>(offset_ptr);
        ssize_t n = ctx->fs->pread(in_fd, buf.data(), count, off);
        if (n < 0) { m.set_result(n); return; }
        // Update the offset
        m.memory.template write<int64_t>(offset_ptr, off + n);
        count = n;
    } else {
        ssize_t n = ctx->fs->read(in_fd, buf.data(), count);
        if (n < 0) { m.set_result(n); return; }
        count = n;
    }

    if (count == 0) { m.set_result(0); return; }

    // Write to out_fd — check VFS first (fd may be dup2'd to a pipe/file)
    auto& fs = *ctx->fs;
    if (fs.is_open(out_fd)) {
        auto entry = fs.get_entry(out_fd);
        if (entry && entry->type == vfs::FileType::CharDev && entry->name == "tty") {
            // tty placeholder — write to host console
            m.print(reinterpret_cast<const char*>(buf.data()), count);
            m.set_result(count);
        } else {
            ssize_t n = fs.write(out_fd, buf.data(), count);
            m.set_result(n);
        }
    } else if (out_fd == 1 || out_fd == 2) {
        // Default stdout/stderr - use printer
        m.print(reinterpret_cast<const char*>(buf.data()), count);
        m.set_result(count);
    } else {
        ssize_t n = fs.write(out_fd, buf.data(), count);
        m.set_result(n);
    }
}

static void sys_ioctl(Machine& m) {
    int fd = m.template sysarg<int>(0);
    unsigned long request = m.sysarg(1);
    bool is_tty = g_tty_fds.count(fd) > 0;

    // TIOCGWINSZ - get window size (all tty fds)
    if (request == 0x5413) {
        if (is_tty) {
            auto ws_addr = m.sysarg(2);
            struct { uint16_t rows, cols, xpixel, ypixel; } ws = { 24, 80, 0, 0 };
#ifdef __EMSCRIPTEN__
            ws.rows = EM_ASM_INT({ return Module._termRows || 24; });
            ws.cols = EM_ASM_INT({ return Module._termCols || 80; });
#endif
            m.memory.memcpy(ws_addr, &ws, sizeof(ws));
            m.set_result(0);
            return;
        }
        m.set_result(err::NOTTY);
        return;
    }

    // TIOCSWINSZ - set window size (accept silently)
    if (request == 0x5414) {
        if (is_tty) {
            m.set_result(0);
            return;
        }
        m.set_result(err::NOTTY);
        return;
    }

    // TCGETS - get terminal attributes
    // All tty fds (0/1/2) return success → isatty() returns true for all.
    // This enables interactive mode in ash/bash and tools like less/vi.
    if (request == 0x5401) {
        if (is_tty) {
            auto termios_addr = m.sysarg(2);
            uint8_t buf[44] = {};
            g_termios.serialize(buf);
            m.memory.memcpy(termios_addr, buf, 44);
            m.set_result(0);
            return;
        }
        m.set_result(err::NOTTY);
        return;
    }

    // TCSETS, TCSETSW, TCSETSF - set terminal attributes
    // Store the termios state so TCGETS returns what was set (raw mode support).
    if (request == 0x5402 || request == 0x5403 || request == 0x5404) {
        if (is_tty) {
            auto termios_addr = m.sysarg(2);
            uint8_t buf[44] = {};
            m.memory.memcpy_out(buf, termios_addr, 44);
            g_termios.deserialize(buf);
            m.set_result(0);
            return;
        }
        m.set_result(err::NOTTY);
        return;
    }

    // TIOCGPGRP - get foreground process group
    if (request == 0x540f) {
        if (is_tty) {
            auto pgrp_addr = m.sysarg(2);
            int32_t pgrp = 1;  // PID 1 owns the terminal
            m.memory.memcpy(pgrp_addr, &pgrp, 4);
            m.set_result(0);
            return;
        }
        m.set_result(err::NOTTY);
        return;
    }

    // TIOCSPGRP - set foreground process group (accept silently)
    if (request == 0x5410) {
        if (is_tty) {
            m.set_result(0);
            return;
        }
        m.set_result(err::NOTTY);
        return;
    }

    // FIONBIO - set non-blocking mode (libuv uses this on pipes/sockets)
    if (request == 0x5421) {
        m.set_result(0);
        return;
    }

    // FIONREAD - bytes available in buffer
    if (request == 0x541b) {
        if (fd == 0) {
            auto count_addr = m.sysarg(2);
            int32_t avail = 0;
#ifdef __EMSCRIPTEN__
            avail = EM_ASM_INT({
                return (Module._stdinBuffer && Module._stdinBuffer.length) || 0;
            });
#endif
            m.memory.memcpy(count_addr, &avail, 4);
            m.set_result(0);
            return;
        }
    }

    if (g_trace_syscalls && g_trace_countdown-- > 0)
        dbg_fprintf(stderr, "[ioctl] fd=%d request=0x%lx => -ENOTSUP\n", fd, (long)request);
    m.set_result(err::NOTSUP);
}

// Lazily register stdio fds (0/1/2) in VFS so dup/dup2 can operate on them.
// Normally stdio goes directly to host console without VFS involvement,
// but bash redirects need to dup2 them, which requires a VFS entry.
static void ensure_stdio_in_vfs(vfs::VirtualFS& fs, int fd) {
    if (fd < 0 || fd > 2 || !g_stdio_open[fd] || fs.is_open(fd))
        return;
    auto tty_entry = std::make_shared<vfs::Entry>();
    tty_entry->type = vfs::FileType::CharDev;
    tty_entry->name = "tty";
    tty_entry->mode = 0666;
    int tmp_fd = fs.open_pipe(tty_entry, (fd == 0) ? 0 : 1);
    fs.dup2(tmp_fd, fd);
    fs.close(tmp_fd);
    g_tty_fds.insert(fd);
}

static void sys_fcntl(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    int cmd = m.template sysarg<int>(1);

    // Validate fd: 0-2 are always valid (stdin/stdout/stderr),
    // other fds must be open in VFS, be a socket fd, or be an epoll fd.
    // Return -EBADF for invalid fds
    // (critical: loops like libuv's fd-cloexec rely on -EBADF to terminate).
    bool valid = (fd >= 0 && fd <= 2) || fs.is_open(fd) || net_is_socket_fd(fd)
                 || g_epoll_instances.count(fd) || g_eventfd_counters.count(fd);
    if (g_trace_syscalls && g_trace_countdown-- > 0)
        dbg_fprintf(stderr, "[fcntl] fd=%d cmd=%d valid=%d\n", fd, cmd, (int)valid);
    if (!valid) {
        m.set_result(err::BADF);
        return;
    }

    constexpr int F_DUPFD = 0;
    constexpr int F_GETFD = 1;
    constexpr int F_SETFD = 2;
    constexpr int F_GETFL = 3;
    constexpr int F_SETFL = 4;
    constexpr int F_DUPFD_CLOEXEC = 1030;
    constexpr int FD_CLOEXEC = 1;

    auto get_default_status = [](int f) {
        if (f == 0) return O_RDONLY;
        if (f == 1 || f == 2) return O_WRONLY;
        return O_RDWR;
    };

    switch (cmd) {
        case F_DUPFD:
        case F_DUPFD_CLOEXEC: {
            // Epoll fds: dup by creating alias in g_epoll_instances
            if (g_epoll_instances.count(fd)) {
                int newfd = g_next_epoll_fd++;
                g_epoll_instances[newfd] = g_epoll_instances[fd];
                g_fd_cloexec_flags[newfd] = (cmd == F_DUPFD_CLOEXEC) ? FD_CLOEXEC : g_fd_cloexec_flags[fd];
                g_fd_status_flags[newfd] = g_fd_status_flags.count(fd) ? g_fd_status_flags[fd] : get_default_status(fd);
                if (g_trace_syscalls && g_trace_countdown-- > 0)
                    dbg_fprintf(stderr, "[fcntl] F_DUPFD epoll fd=%d -> newfd=%d\n", fd, newfd);
                m.set_result(newfd);
                return;
            }
            // Eventfd: dup by creating alias in VFS + counter map
            if (g_eventfd_counters.count(fd)) {
                int newfd = fs.dup(fd);
                if (newfd >= 0) g_eventfd_counters[newfd] = g_eventfd_counters[fd];
                if (newfd >= 0) {
                    g_fd_cloexec_flags[newfd] = (cmd == F_DUPFD_CLOEXEC) ? FD_CLOEXEC : g_fd_cloexec_flags[fd];
                    g_fd_status_flags[newfd] = g_fd_status_flags.count(fd) ? g_fd_status_flags[fd] : get_default_status(fd);
                }
                m.set_result(newfd);
                return;
            }
            ensure_stdio_in_vfs(fs, fd);
            int newfd = fs.dup(fd);
            // Propagate tty status to new fd
            if (newfd >= 0 && g_tty_fds.count(fd))
                g_tty_fds.insert(newfd);
            if (newfd >= 0) {
                g_fd_cloexec_flags[newfd] = (cmd == F_DUPFD_CLOEXEC) ? FD_CLOEXEC : g_fd_cloexec_flags[fd];
                g_fd_status_flags[newfd] = g_fd_status_flags.count(fd) ? g_fd_status_flags[fd] : get_default_status(fd);
            }
            m.set_result(newfd);
            return;
        }
        case F_GETFD:
            m.set_result(g_fd_cloexec_flags.count(fd) ? g_fd_cloexec_flags[fd] : 0);
            return;
        case F_SETFD:
            g_fd_cloexec_flags[fd] = (m.template sysarg<int>(2) & FD_CLOEXEC) ? FD_CLOEXEC : 0;
            m.set_result(0);
            return;
        case F_GETFL:
            m.set_result(g_fd_status_flags.count(fd) ? g_fd_status_flags[fd] : get_default_status(fd));
            return;
        case F_SETFL: {
#ifndef __EMSCRIPTEN__
            // For socket FDs, forward nonblocking flag to the real socket
            if (net_is_socket_fd(fd) && net_set_nonblock) {
                int arg = m.template sysarg<int>(2);
                net_set_nonblock(fd, (arg & O_NONBLOCK) != 0);
            }
#endif
            // Only status flags should change with F_SETFL; preserve access mode bits.
            int arg = m.template sysarg<int>(2);
            int old_flags = g_fd_status_flags.count(fd) ? g_fd_status_flags[fd] : get_default_status(fd);
            int access_mode = old_flags & 0x3;
            g_fd_status_flags[fd] = access_mode | (arg & ~0x3);
            m.set_result(0);
            return;
        }
        default:
            m.set_result(0);
            return;
    }
}

// close_range(first, last, flags) — bulk close/cloexec file descriptors
// Used by musl to mark all inherited fds as close-on-exec during startup.
// Without this, musl falls back to looping over all fds up to RLIMIT_NOFILE.
static void sys_close_range(Machine& m) {
    // Flags: CLOSE_RANGE_CLOEXEC=2 sets FD_CLOEXEC, CLOSE_RANGE_UNSHARE=4
    uint32_t first = m.template sysarg<uint32_t>(0);
    uint32_t last = m.template sysarg<uint32_t>(1);
    uint32_t flags = m.template sysarg<uint32_t>(2);
    const uint32_t kCloseRangeCloexecFlag = 2;
    if (flags & kCloseRangeCloexecFlag) {
        if (last == UINT32_MAX) last = 65535;
        for (uint32_t fd = first; fd <= last; fd++) {
            g_fd_cloexec_flags[(int)fd] = 1;
            if (fd == UINT32_MAX) break;
        }
    }
    m.set_result(0);
}

// Lazily register stdio fds (0/1/2) in VFS so dup/dup2 can operate on them.
// Normally stdio goes directly to host console without VFS involvement,
// but bash redirects need to dup2 them, which requires a VFS entry.
static void sys_dup(Machine& m) {
    auto& fs = get_fs(m);
    int oldfd = m.template sysarg<int>(0);
    ensure_stdio_in_vfs(fs, oldfd);
    int result = fs.dup(oldfd);
    // Propagate tty status to new fd
    if (result >= 0 && g_tty_fds.count(oldfd))
        g_tty_fds.insert(result);
    if (result >= 0) {
        g_fd_cloexec_flags[result] = 0;  // dup() clears FD_CLOEXEC on new descriptor
        g_fd_status_flags[result] = g_fd_status_flags.count(oldfd) ? g_fd_status_flags[oldfd]
                                                                    : ((oldfd == 0) ? O_RDONLY : ((oldfd == 1 || oldfd == 2) ? O_WRONLY : O_RDWR));
    }
    m.set_result(result);
}

static void sys_dup3(Machine& m) {
    auto& fs = get_fs(m);
    int oldfd = m.template sysarg<int>(0);
    int newfd = m.template sysarg<int>(1);
    int flags = m.template sysarg<int>(2);
    if (oldfd == newfd) {
        m.set_result(err::INVAL);
        return;
    }
    // Lazily register stdio fds in VFS so dup2 can operate on them
    ensure_stdio_in_vfs(fs, oldfd);
    int result = fs.dup2(oldfd, newfd);
    // Propagate tty status: if old fd is tty, new fd becomes tty
    if (result >= 0) {
        if (g_tty_fds.count(oldfd))
            g_tty_fds.insert(newfd);
        else if (newfd > 2)
            g_tty_fds.erase(newfd);  // dup'd non-tty over a tty fd
        g_fd_cloexec_flags[newfd] = 0;  // dup2() clears FD_CLOEXEC on target fd
        if (newfd >= 0 && newfd <= 2) g_stdio_open[newfd] = true;
        g_fd_status_flags[newfd] = g_fd_status_flags.count(oldfd) ? g_fd_status_flags[oldfd]
                                                                   : ((oldfd == 0) ? O_RDONLY : ((oldfd == 1 || oldfd == 2) ? O_WRONLY : O_RDWR));
    }
    m.set_result(result);
}

static void sys_pipe2(Machine& m) {
    auto& fs = get_fs(m);
    auto pipefd_addr = m.sysarg(0);
    int flags = m.template sysarg<int>(1);
    int allowed_flags = O_CLOEXEC | O_NONBLOCK;
    if ((flags & ~allowed_flags) != 0) {
        m.set_result(err::INVAL);
        return;
    }

    // Create a pipe using two connected in-memory file handles
    // Write end writes to a shared buffer, read end reads from it
    auto pipe_entry = std::make_shared<vfs::Entry>();
    pipe_entry->type = vfs::FileType::Fifo;
    pipe_entry->mode = 0600;
    pipe_entry->size = 0;

    // Allocate two fds - read end and write end
    int read_fd = fs.open_pipe(pipe_entry, 0);
    int write_fd = fs.open_pipe(pipe_entry, 1);
    if (read_fd < 0 || write_fd < 0) {
        m.set_result(err::INVAL);
        return;
    }
    int cloexec = (flags & O_CLOEXEC) ? 1 : 0;
    int nonblock = (flags & O_NONBLOCK) ? O_NONBLOCK : 0;
    g_fd_cloexec_flags[read_fd] = cloexec;
    g_fd_cloexec_flags[write_fd] = cloexec;
    g_fd_status_flags[read_fd] = O_RDONLY | nonblock;
    g_fd_status_flags[write_fd] = O_WRONLY | nonblock;

    int32_t fds[2] = { read_fd, write_fd };
    m.memory.memcpy(pipefd_addr, fds, sizeof(fds));
    if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[pipe2] flags=0x%x => read=%d write=%d\n", flags, read_fd, write_fd);
    m.set_result(0);
}

static void sys_readv(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto iov_addr = m.sysarg(1);
    int iovcnt = m.template sysarg<int>(2);

    // /dev/tty fds (other than 0/1/2) redirect reads to stdin
    if (fd > 2 && g_tty_fds.count(fd)) {
        fd = 0;  // treat as stdin read
    }

    // If fd 0 has been redirected (dup2'd to a pipe/file), read from VFS.
    // Only fall through to host stdin for our tty placeholder (CharDev "tty").
    if (fd == 0 && fs.is_open(fd)) {
        auto entry = fs.get_entry(fd);
        bool is_tty = entry && entry->type == vfs::FileType::CharDev && entry->name == "tty";
        if (!is_tty) {
            size_t total = 0;
            for (int i = 0; i < iovcnt; i++) {
                uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
                uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
                if (len > 0) {
                    std::vector<uint8_t> buf(len);
                    ssize_t n = fs.read(fd, buf.data(), len);
                    if (n < 0) {
                        m.set_result(total > 0 ? (int64_t)total : n);
                        return;
                    }
                    if (n > 0) {
                        m.memory.memcpy(base, buf.data(), n);
                        total += n;
                    }
                    if (static_cast<size_t>(n) < len) break;
                }
            }
            m.set_result(total);  // 0 = EOF for pipes/files
            return;
        }
        // tty placeholder — fall through to host stdin
    }

    if (fd == 0) {
#ifdef __EMSCRIPTEN__
        // Try non-blocking read from JavaScript stdin buffer into iovec
        int has_data = EM_ASM_INT({
            return (Module._stdinBuffer && Module._stdinBuffer.length > 0) ? 1 :
                   (Module._stdinEOF ? -1 : 0);
        });
        if (has_data == -1) {
            // EOF
            m.set_result(0);
            return;
        }
        if (has_data == 0) {
            // No data — rewind PC and stop machine so main loop can yield
            g_waiting_for_stdin = true;
            m.cpu.increment_pc(-4);  // Rewind past ecall (4 bytes)
            m.stop();
            return;
        }
        size_t total = 0;
        for (int i = 0; i < iovcnt; i++) {
            uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
            uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
            if (len > 0) {
                auto view = m.memory.memview(base, len);
                int bytes_read = EM_ASM_INT({
                    if (Module._stdinBuffer && Module._stdinBuffer.length > 0) {
                        var off = Number($0);
                        var toRead = Math.min(Number($1), Module._stdinBuffer.length);
                        for (var i = 0; i < toRead; i++) {
                            Module.HEAPU8[off + i] = Module._stdinBuffer.shift();
                        }
                        return toRead;
                    }
                    return 0;
                }, view.data(), len);
                if (bytes_read > 0) {
                    total += bytes_read;
                }
                if (static_cast<size_t>(bytes_read) < len) break;
            }
        }
        m.set_result(total);
#else
        // Native mode: read from host stdin into iovec
        size_t total = 0;
        for (int i = 0; i < iovcnt; i++) {
            uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
            uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
            if (len > 0) {
                std::vector<uint8_t> buf(len);
                ssize_t n = ::read(STDIN_FILENO, buf.data(), len);
                if (n > 0) {
                    m.memory.memcpy(base, buf.data(), n);
                    total += n;
                }
                if (n <= 0 || static_cast<size_t>(n) < len) break;
            }
        }
        m.set_result(total > 0 ? (int64_t)total : 0);
#endif
        return;
    }

    size_t total = 0;
    for (int i = 0; i < iovcnt; i++) {
        uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
        uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
        if (len > 0) {
            std::vector<uint8_t> buf(len);
            ssize_t n = fs.read(fd, buf.data(), len);
            if (n < 0) {
                m.set_result(total > 0 ? (int64_t)total : n);
                return;
            }
            if (n > 0) {
                m.memory.memcpy(base, buf.data(), n);
                total += n;
            }
            if (static_cast<size_t>(n) < len) break;  // Short read
        }
    }
    m.set_result(total);
}

static void sys_pread64(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);
    uint64_t offset = m.sysarg(3);

    std::vector<uint8_t> buf(count);
    ssize_t n = fs.pread(fd, buf.data(), count, offset);
    if (fd > 2) {
        const auto path = fs.get_path(fd);
        if (!path.empty()
            && (path.rfind("/proc/", 0) == 0 || path.rfind("/sys/fs/cgroup/", 0) == 0)) {
            fprintf(stderr, "[pread-probe] fd=%d path=%s count=%zu off=%llu => %zd\n",
                    fd, path.c_str(), count, (unsigned long long)offset, n);
        }
    }
    if (n > 0) {
        m.memory.memcpy(buf_addr, buf.data(), n);
    }
    m.set_result(n);
}

static void sys_pwrite64(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);
    uint64_t offset = m.sysarg(3);

    std::vector<uint8_t> buf(count);
    m.memory.memcpy_out(buf.data(), buf_addr, count);
    ssize_t n = fs.pwrite(fd, buf.data(), count, offset);
    m.set_result(n);
}

static void sys_ftruncate(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    uint64_t length = m.sysarg(1);
    m.set_result(fs.ftruncate(fd, length));
}

static void sys_mkdirat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    uint32_t mode = m.template sysarg<uint32_t>(2);

    std::string path;
    try { path = m.memory.memstring(path_addr); }
    catch (...) { m.set_result(err::INVAL); return; }
    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    m.set_result(fs.mkdir(path, mode));
}

static void sys_unlinkat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    int flags = m.template sysarg<int>(2);

    std::string path;
    try { path = m.memory.memstring(path_addr); }
    catch (...) { m.set_result(err::INVAL); return; }
    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    m.set_result(fs.unlink(path, flags));
}

static void sys_symlinkat(Machine& m) {
    auto& fs = get_fs(m);
    auto target_addr = m.sysarg(0);
    int newdirfd = m.template sysarg<int>(1);
    auto linkpath_addr = m.sysarg(2);

    std::string target, linkpath;
    try {
        target = m.memory.memstring(target_addr);
        linkpath = m.memory.memstring(linkpath_addr);
    } catch (...) { m.set_result(err::INVAL); return; }
    auto at = resolve_at_path(fs, newdirfd, linkpath);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    linkpath = std::move(at.path);

    m.set_result(fs.symlink(target, linkpath));
}

static void sys_linkat(Machine& m) {
    auto& fs = get_fs(m);
    int olddirfd = m.template sysarg<int>(0);
    auto oldpath_addr = m.sysarg(1);
    int newdirfd = m.template sysarg<int>(2);
    auto newpath_addr = m.sysarg(3);

    std::string oldpath, newpath;
    try {
        oldpath = m.memory.memstring(oldpath_addr);
        newpath = m.memory.memstring(newpath_addr);
    } catch (...) { m.set_result(err::INVAL); return; }
    auto old_at = resolve_at_path(fs, olddirfd, oldpath);
    if (old_at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(old_at.status));
        return;
    }
    auto new_at = resolve_at_path(fs, newdirfd, newpath);
    if (new_at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(new_at.status));
        return;
    }
    oldpath = std::move(old_at.path);
    newpath = std::move(new_at.path);

    m.set_result(fs.link(oldpath, newpath));
}

static void sys_renameat(Machine& m) {
    auto& fs = get_fs(m);
    int olddirfd = m.template sysarg<int>(0);
    auto oldpath_addr = m.sysarg(1);
    int newdirfd = m.template sysarg<int>(2);
    auto newpath_addr = m.sysarg(3);

    std::string oldpath, newpath;
    try {
        oldpath = m.memory.memstring(oldpath_addr);
        newpath = m.memory.memstring(newpath_addr);
    } catch (...) { m.set_result(err::INVAL); return; }
    auto old_at = resolve_at_path(fs, olddirfd, oldpath);
    if (old_at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(old_at.status));
        return;
    }
    auto new_at = resolve_at_path(fs, newdirfd, newpath);
    if (new_at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(new_at.status));
        return;
    }
    oldpath = std::move(old_at.path);
    newpath = std::move(new_at.path);

    m.set_result(fs.rename(oldpath, newpath));
}

static void sys_renameat2(Machine& m) {
    auto& fs = get_fs(m);
    int olddirfd = m.template sysarg<int>(0);
    auto oldpath_addr = m.sysarg(1);
    int newdirfd = m.template sysarg<int>(2);
    auto newpath_addr = m.sysarg(3);
    uint32_t flags = m.template sysarg<uint32_t>(4);

    // Common case used by Node CLIs.
    if (flags != 0) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string oldpath, newpath;
    try {
        oldpath = m.memory.memstring(oldpath_addr);
        newpath = m.memory.memstring(newpath_addr);
    } catch (...) { m.set_result(err::INVAL); return; }
    auto old_at = resolve_at_path(fs, olddirfd, oldpath);
    if (old_at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(old_at.status));
        return;
    }
    auto new_at = resolve_at_path(fs, newdirfd, newpath);
    if (new_at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(new_at.status));
        return;
    }
    oldpath = std::move(old_at.path);
    newpath = std::move(new_at.path);

    m.set_result(fs.rename(oldpath, newpath));
}

static void sys_sysinfo(Machine& m) {
    auto info_addr = m.sysarg(0);

    // Linux sysinfo structure (64-bit)
    struct linux_sysinfo {
        int64_t  uptime;
        uint64_t loads[3];
        uint64_t totalram;
        uint64_t freeram;
        uint64_t bufferram;
        uint64_t totalswap;
        uint64_t freeswap;
        uint16_t procs;
        uint16_t pad;
        uint32_t pad2;
        uint64_t totalhigh;
        uint64_t freehigh;
        uint32_t mem_unit;
    };

    linux_sysinfo si = {};
    si.uptime = 100;
    si.totalram = 256ULL * 1024 * 1024;  // 256MB
    si.freeram = 128ULL * 1024 * 1024;   // 128MB
    si.procs = 1;
    si.mem_unit = 1;

    m.memory.memcpy(info_addr, &si, sizeof(si));
    m.set_result(0);
}

// pselect6 - synchronous I/O multiplexing (select-style with fd_set bitmasks)
// Bash uses this to wait for stdin input before reading.
// pselect6(nfds, readfds, writefds, exceptfds, timeout, sigmask)
static void sys_pselect6(Machine& m) {
    int nfds = m.template sysarg<int>(0);
    auto readfds_addr = m.sysarg(1);
    auto writefds_addr = m.sysarg(2);
    // arg3: exceptfds (ignored), arg4: timeout, arg5: sigmask (ignored)
    auto timeout_addr = m.sysarg(4);

    if (nfds <= 0) {
        m.set_result(0);
        return;
    }
    if (nfds > 1024) nfds = 1024;

    // Read timeout: NULL = block forever, {0,0} = return immediately
    bool has_timeout = (timeout_addr != 0);
    bool zero_timeout = false;
    if (has_timeout) {
        int64_t tv_sec = m.memory.template read<int64_t>(timeout_addr);
        int64_t tv_nsec = m.memory.template read<int64_t>(timeout_addr + 8);
        zero_timeout = (tv_sec == 0 && tv_nsec == 0);
    }

    // Helper to check if fd is set in an fd_set bitmask (128 bytes = 1024 bits)
    auto fd_isset = [&](uint64_t fdset_addr, int fd) -> bool {
        if (fdset_addr == 0 || fd < 0 || fd >= nfds) return false;
        int word_idx = fd / 64;
        int bit_idx = fd % 64;
        uint64_t word = m.memory.template read<uint64_t>(fdset_addr + word_idx * 8);
        return (word >> bit_idx) & 1;
    };
    auto fd_set_bit = [&](uint64_t fdset_addr, int fd) {
        if (fdset_addr == 0 || fd < 0) return;
        int word_idx = fd / 64;
        int bit_idx = fd % 64;
        uint64_t word = m.memory.template read<uint64_t>(fdset_addr + word_idx * 8);
        word |= (1ULL << bit_idx);
        m.memory.template write<uint64_t>(fdset_addr + word_idx * 8, word);
    };
    auto fd_zero = [&](uint64_t fdset_addr) {
        if (fdset_addr == 0) return;
        int words = (nfds + 63) / 64;
        for (int i = 0; i < words; i++)
            m.memory.template write<uint64_t>(fdset_addr + i * 8, 0ULL);
    };

    int ready = 0;
    bool needs_stdin = false;
    // Track which fds are ready (read) or writable — max 64 fds tracked
    uint64_t ready_read = 0, ready_write = 0;

    // Check each fd in the read/write sets
    for (int fd = 0; fd < nfds && fd < 64; fd++) {
        bool in_read = fd_isset(readfds_addr, fd);
        bool in_write = fd_isset(writefds_addr, fd);
        if (!in_read && !in_write) continue;

        // Redirect tty fds to stdin for read checks
        int check_fd = fd;
        if (fd > 2 && g_tty_fds.count(fd) && in_read) {
            check_fd = 0;
        }

        if (check_fd == 0 && in_read) {
            // Check if fd 0 is a VFS pipe/file (not tty placeholder)
            auto& fs0 = get_fs(m);
            if (fs0.is_open(0)) {
                auto entry0 = fs0.get_entry(0);
                bool is_tty0 = entry0 && entry0->type == vfs::FileType::CharDev && entry0->name == "tty";
                if (!is_tty0) {
                    // Pipe/file: check if data available
                    if (entry0 && entry0->content.size() > 0) {
                        ready_read |= (1ULL << fd);
                        ready++;
                    }
                    // else: empty pipe = not ready (EOF handled by read)
                    goto pselect_next_fd;
                }
            }
            // tty or not in VFS — check host stdin
#ifdef __EMSCRIPTEN__
            int has_data = EM_ASM_INT({
                return (Module._stdinBuffer && Module._stdinBuffer.length > 0) ? 1 :
                       (Module._stdinEOF ? -1 : 0);
            });
            if (has_data != 0) {
                ready_read |= (1ULL << fd);
                ready++;
            } else {
                needs_stdin = true;
            }
#else
            struct pollfd pfd = { STDIN_FILENO, POLLIN, 0 };
            int ret = ::poll(&pfd, 1, 0);
            if (ret > 0 && (pfd.revents & (POLLIN | POLLHUP))) {
                ready_read |= (1ULL << fd);
                ready++;
            } else {
                needs_stdin = true;
            }
#endif
        } else if ((fd == 1 || fd == 2) && in_write) {
            ready_write |= (1ULL << fd);
            ready++;
        } else if (fd >= 0 && in_read) {
            auto& fs = get_fs(m);
            if (fs.is_open(fd)) {
                ready_read |= (1ULL << fd);
                ready++;
            }
        }
pselect_next_fd:;
    }

    // If we need stdin and aren't polling (zero_timeout), block BEFORE
    // modifying the fd_sets. This preserves guest memory so the ecall
    // can re-execute correctly after resume.
    if (needs_stdin && ready == 0 && !zero_timeout) {
        // Block waiting for stdin — rewind PC and stop machine
        g_waiting_for_stdin = true;
        m.cpu.increment_pc(-4);
        m.stop();
        return;
    }

    // Zero out fd_sets, then set only the ready bits
    fd_zero(readfds_addr);
    fd_zero(writefds_addr);
    for (int fd = 0; fd < nfds && fd < 64; fd++) {
        if (ready_read & (1ULL << fd)) fd_set_bit(readfds_addr, fd);
        if (ready_write & (1ULL << fd)) fd_set_bit(writefds_addr, fd);
    }

    m.set_result(ready);
}

// ppoll - poll file descriptors for events
// Ash uses this to check if stdin has data before reading.
static void sys_ppoll(Machine& m) {
    auto fds_addr = m.sysarg(0);
    uint64_t nfds = m.sysarg(1);
    auto timeout_addr = m.sysarg(2);
    // arg3: sigmask (ignored), arg4: sigsetsize (ignored)

    if (nfds == 0) {
        m.set_result(0);
        return;
    }
    if (nfds > 64) nfds = 64;

    // Read timeout: NULL = block forever, {0,0} = return immediately
    bool has_timeout = (timeout_addr != 0);
    bool zero_timeout = false;
    if (has_timeout) {
        int64_t tv_sec = m.memory.template read<int64_t>(timeout_addr);
        int64_t tv_nsec = m.memory.template read<int64_t>(timeout_addr + 8);
        zero_timeout = (tv_sec == 0 && tv_nsec == 0);
    }
    int ready = 0;
    bool needs_stdin = false;

    for (uint64_t i = 0; i < nfds; i++) {
        uint64_t entry_addr = fds_addr + i * 8;
        int32_t fd = m.memory.template read<int32_t>(entry_addr);
        int16_t events = m.memory.template read<int16_t>(entry_addr + 4);
        int16_t revents = 0;
        // Redirect tty fds to stdin for POLLIN checks
        int poll_fd = fd;
        if (fd > 2 && g_tty_fds.count(fd) && (events & 0x0001)) {
            poll_fd = 0;  // treat tty fd poll as stdin poll
        }

        if (poll_fd == 0 && (events & 0x0001 /*POLLIN*/)) {
            // Check if fd 0 is a VFS pipe/file (not tty placeholder)
            auto& fs0 = get_fs(m);
            if (fs0.is_open(0)) {
                auto entry0 = fs0.get_entry(0);
                bool is_tty0 = entry0 && entry0->type == vfs::FileType::CharDev && entry0->name == "tty";
                if (!is_tty0) {
                    // Pipe/file: check if data available
                    if (entry0 && entry0->content.size() > 0) {
                        revents |= 0x0001; // POLLIN
                        ready++;
                    } else {
                        revents |= 0x0010; // POLLHUP (EOF on empty pipe)
                        ready++;
                    }
                    m.memory.template write<int16_t>(entry_addr + 6, revents);
                    continue;
                }
            }
            // tty or not in VFS — check host stdin
#ifdef __EMSCRIPTEN__
            int has_data = EM_ASM_INT({
                return (Module._stdinBuffer && Module._stdinBuffer.length > 0) ? 1 :
                       (Module._stdinEOF ? -1 : 0);
            });
            if (has_data == 1) {
                revents |= 0x0001; // POLLIN
                ready++;
            } else if (has_data == -1) {
                revents |= 0x0010; // POLLHUP (EOF)
                ready++;
            } else {
                needs_stdin = true;
            }
#else
            // Native mode: use real poll on stdin
            struct pollfd pfd = { STDIN_FILENO, POLLIN, 0 };
            int ret = ::poll(&pfd, 1, 0);
            if (ret > 0 && (pfd.revents & POLLIN)) {
                revents |= 0x0001; // POLLIN
                ready++;
            } else if (ret > 0 && (pfd.revents & POLLHUP)) {
                revents |= 0x0010; // POLLHUP
                ready++;
            }
            // else: no data yet, don't set needs_stdin for native mode
#endif
        } else if (fd == 1 || fd == 2) {
            if (events & 0x0004 /*POLLOUT*/) {
                revents |= 0x0004;
                ready++;
            }
        } else if (fd >= 0) {
#ifndef __EMSCRIPTEN__
            // For socket FDs, use real poll on the native fd
            if (net_is_socket_fd && net_is_socket_fd(fd) && net_get_native_fd) {
                int native_fd = net_get_native_fd(fd);
                if (native_fd >= 0) {
                    struct pollfd pfd;
                    pfd.fd = native_fd;
                    pfd.events = events;
                    pfd.revents = 0;
                    // Use a short timeout to avoid blocking forever
                    int timeout_ms = zero_timeout ? 0 : (has_timeout ? 10 : 100);
                    int pr = ::poll(&pfd, 1, timeout_ms);
                    if (pr > 0) {
                        revents = pfd.revents;
                        ready++;
                    }
                    m.memory.template write<int16_t>(entry_addr + 6, revents);
                    continue;
                }
            }
#endif
            // timerfd: only POLLIN when expired
            if (g_timerfd_states.count(fd)) {
                timerfd_tick(fd);
                if (g_timerfd_states[fd].expirations > 0) {
                    revents |= (events & 0x0001); // POLLIN
                    if (revents) ready++;
                }
                m.memory.template write<int16_t>(entry_addr + 6, revents);
                continue;
            }
            // VFS file descriptors are always ready
            revents |= (events & 0x0001); // POLLIN if requested
            if (revents) ready++;
        }

        m.memory.template write<int16_t>(entry_addr + 6, revents);
    }

    if (ready > 0) {
        m.set_result(ready);
    } else if (zero_timeout) {
        m.set_result(0);
    } else if (needs_stdin) {
#ifdef __EMSCRIPTEN__
        // Browser: no stdin data yet, cooperatively yield and retry same ecall.
        g_waiting_for_stdin = true;
        m.cpu.increment_pc(-4);
        m.stop();
#else
        // Native: block briefly and report timeout-style no events.
        // Do not stop/replay the same ecall — that can strand restored checkpoints.
        struct pollfd pfd = { STDIN_FILENO, POLLIN, 0 };
        ::poll(&pfd, 1, 10);
        m.set_result(0);
#endif
    } else {
#ifdef __EMSCRIPTEN__
        // Browser: yield to event loop when no FDs are ready.
        g_waiting_for_stdin = true;
        m.cpu.increment_pc(-4);
        m.stop();
#else
        // Native: avoid hard stop; return no events and let guest progress.
        m.set_result(0);
#endif
    }
}

// ============================================================================
// epoll — I/O event notification for libuv (Node.js event loop)
// ============================================================================

// (EpollInterest, EpollInstance, g_epoll_instances, g_next_epoll_fd declared near top of file)

static void sys_epoll_create1(Machine& m) {
    int fd = g_next_epoll_fd++;
    g_epoll_instances[fd] = EpollInstance{};
    if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[epoll_create1] => fd=%d\n", fd);
    m.set_result(fd);
}

static void sys_epoll_ctl(Machine& m) {
    int epfd = m.template sysarg<int>(0);
    int op   = m.template sysarg<int>(1);
    int fd   = m.template sysarg<int>(2);
    auto event_addr = m.sysarg(3);

    auto it = g_epoll_instances.find(epfd);
    if (it == g_epoll_instances.end()) {
        m.set_result(-9);  // -EBADF
        return;
    }

    constexpr int EPOLL_CTL_ADD = 1;
    constexpr int EPOLL_CTL_DEL = 2;
    constexpr int EPOLL_CTL_MOD = 3;

    if (op == EPOLL_CTL_ADD || op == EPOLL_CTL_MOD) {
        // struct epoll_event { uint32_t events; [pad]; uint64_t data; } = 16 bytes
        uint32_t events = m.memory.template read<uint32_t>(event_addr);
        uint64_t data   = m.memory.template read<uint64_t>(event_addr + 8);
        it->second.interests[fd] = EpollInterest{events, data};
        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[epoll_ctl] %s epfd=%d fd=%d events=0x%x data=0x%lx\n",
                op == 1 ? "ADD" : "MOD", epfd, fd, events, (unsigned long)data);
        m.set_result(0);
    } else if (op == EPOLL_CTL_DEL) {
        it->second.interests.erase(fd);
        m.set_result(0);
    } else {
        m.set_result(err::INVAL);
    }
}

static void sys_epoll_pwait(Machine& m) {
    int epfd = m.template sysarg<int>(0);
    auto events_addr = m.sysarg(1);
    int maxevents = m.template sysarg<int>(2);
    int timeout = m.template sysarg<int>(3);

    auto it = g_epoll_instances.find(epfd);
    if (it == g_epoll_instances.end()) {
        m.set_result(-4);  // -EINTR (avoid libuv assertion on cleanup)
        return;
    }

    // Child-exit wake hint: nudge libuv out of epoll wait so it can reap.
    if (g_process_model.has_exited_child(g_process_model.current_pid)) {
        m.set_result(-4);  // -EINTR
        return;
    }

#ifdef __EMSCRIPTEN__
    // Debug: log epoll interests to see which fds are watched
    static int epoll_log_count = 0;
    if (epoll_log_count < 40) {
        epoll_log_count++;
        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[epoll] epfd=%d timeout=%d maxev=%d interests:", epfd, timeout, maxevents);
        for (auto& [fd2, int2] : it->second.interests) {
            bool is_sock = net_is_socket_fd && net_is_socket_fd(fd2);
            dbg_fprintf(stderr, " fd=%d(ev=0x%x,d=0x%lx%s)", fd2, int2.events, (unsigned long)int2.data, is_sock ? ",sock" : "");
        }
        dbg_fprintf(stderr, "\n");
    }
#endif

    auto& fs = get_fs(m);
    int ready = 0;
#ifdef __EMSCRIPTEN__
    bool socket_waiting_for_data = false;  // Socket has EPOLLIN interest but no data yet
#endif

    // Check each interest for readiness
    for (auto& [fd, interest] : it->second.interests) {
        if (ready >= maxevents) break;

        uint32_t revents = 0;

        if (fd == 0) {
            // Check if fd 0 is a VFS pipe/file (not tty placeholder)
            if (fs.is_open(0)) {
                auto entry0 = fs.get_entry(0);
                bool is_tty0 = entry0 && entry0->type == vfs::FileType::CharDev && entry0->name == "tty";
                if (!is_tty0) {
                    if ((interest.events & 0x01) && entry0 && entry0->content.size() > 0)
                        revents |= 0x01;
                    goto epoll_check_revents;
                }
            }
            // tty or not in VFS — check host stdin
#ifdef __EMSCRIPTEN__
            int has_data = EM_ASM_INT({
                return (Module._stdinBuffer && Module._stdinBuffer.length > 0) ? 1 : 0;
            });
            if (has_data && (interest.events & 0x01 /*EPOLLIN*/))
                revents |= 0x01;
#endif
        } else if (fd == 1 || fd == 2) {
            // stdout/stderr always writable
            if (interest.events & 0x04 /*EPOLLOUT*/)
                revents |= 0x04;
        } else if (fs.is_open(fd)) {
            // VFS fds: pipes may have data, regular files always ready
            auto entry = fs.get_entry(fd);
            if (entry && entry->type == vfs::FileType::Fifo) {
                // Pipe: check if data available
                if ((interest.events & 0x01) && entry->content.size() > 0)
                    revents |= 0x01;
                if (interest.events & 0x04)
                    revents |= 0x04;
            } else {
                // Regular file: always ready
                if (interest.events & 0x01) revents |= 0x01;
                if (interest.events & 0x04) revents |= 0x04;
            }
        } else if (g_timerfd_states.count(fd)) {
            // timerfd: check if expired
            timerfd_tick(fd);
            if ((interest.events & 0x01) && g_timerfd_states[fd].expirations > 0)
                revents |= 0x01;
        }
#ifdef __EMSCRIPTEN__
        else if (net_is_socket_fd && net_is_socket_fd(fd)) {
            // Socket FDs in Emscripten: check JS bridge for readiness
            // Connected sockets: always writable, check JS buffer for readable
            int sock_status = EM_ASM_INT({
                // Returns bitmask: bit 0 = has recv data, bit 1 = has pending accept
                var status = 0;
                if (typeof Module.hasSocketData === 'function' && Module.hasSocketData($0))
                    status |= 1;
                if (typeof Module.hasPendingAccept === 'function' && Module.hasPendingAccept($0))
                    status |= 2;
                return status;
            }, fd);
            // Sockets are always writable (we send optimistically)
            if (interest.events & 0x04 /*EPOLLOUT*/)
                revents |= 0x04;
            if ((sock_status & 1) && (interest.events & 0x01 /*EPOLLIN*/))
                revents |= 0x01;
            else if (interest.events & 0x01 /*EPOLLIN*/)
                socket_waiting_for_data = true;  // Wants EPOLLIN but no data yet
            if ((sock_status & 2) && (interest.events & 0x01 /*EPOLLIN*/))
                revents |= 0x01;
        }
#else
        else if (net_is_socket_fd && net_is_socket_fd(fd)) {
            // Socket FDs: use ::poll() to check readiness
            int native_fd = net_get_native_fd ? net_get_native_fd(fd) : -1;
            if (native_fd >= 0) {
                struct pollfd pfd;
                pfd.fd = native_fd;
                pfd.events = 0;
                if (interest.events & 0x01) pfd.events |= POLLIN;
                if (interest.events & 0x04) pfd.events |= POLLOUT;
                pfd.revents = 0;
                if (::poll(&pfd, 1, 0) > 0) {
                    if (pfd.revents & POLLIN)  revents |= 0x01;
                    if (pfd.revents & POLLOUT) revents |= 0x04;
                    if (pfd.revents & (POLLERR | POLLHUP)) revents |= 0x08;  // EPOLLERR
                }
            }
        }
#endif

epoll_check_revents:
        if (revents) {
            // struct epoll_event { uint32_t events; [4 pad]; uint64_t data; } = 16 bytes
            uint64_t offset = events_addr + ready * 16;
            m.memory.template write<uint32_t>(offset, revents);
            m.memory.template write<uint32_t>(offset + 4, 0);  // padding
            m.memory.template write<uint64_t>(offset + 8, interest.data);  // caller's data
            ready++;
#ifdef __EMSCRIPTEN__
            if (epoll_log_count <= 40) {
                if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[epoll-ev] fd=%d revents=0x%x data=0x%lx\n", fd, revents, (unsigned long)interest.data);
            }
#endif
        }
    }

#ifdef __EMSCRIPTEN__
    if (epoll_log_count <= 40) {
        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[epoll] result: ready=%d socket_waiting=%d\n", ready, (int)socket_waiting_for_data);
    }
#endif

    static int epoll_zero_timeout_spin = 0;
    if (ready > 0) {
        g_idle_epoll_count = 0;  // Reset idle counter on activity
        epoll_zero_timeout_spin = 0;
        m.set_result(ready);
    } else if (timeout == 0) {
        // Non-blocking poll, nothing ready.
        // In browser mode, repeated timeout=0 polls can starve host/worker progress.
#ifdef __EMSCRIPTEN__
        if (++epoll_zero_timeout_spin >= 2048) {
            epoll_zero_timeout_spin = 0;
            g_waiting_for_stdin = true;
            m.set_result(0);
            m.stop();
            return;
        }
#endif
        m.set_result(0);
    } else {
        epoll_zero_timeout_spin = 0;
#ifndef __EMSCRIPTEN__
        // Native mode: collect socket fds and do a blocking poll
        std::vector<struct pollfd> pfds;
        std::vector<std::pair<int, EpollInterest*>> pfd_map;  // index → {guest_fd, interest}
        for (auto& [fd2, interest2] : it->second.interests) {
            if (net_is_socket_fd && net_is_socket_fd(fd2)) {
                int native_fd = net_get_native_fd ? net_get_native_fd(fd2) : -1;
                if (native_fd >= 0) {
                    struct pollfd pfd;
                    pfd.fd = native_fd;
                    pfd.events = 0;
                    if (interest2.events & 0x01) pfd.events |= POLLIN;
                    if (interest2.events & 0x04) pfd.events |= POLLOUT;
                    pfd.revents = 0;
                    pfds.push_back(pfd);
                    pfd_map.push_back({fd2, &interest2});
                }
            }
        }
        if (!pfds.empty()) {
            // Native mode: do a real blocking poll with the actual timeout.
            // This blocks the emulator (fine for server workloads).
            int poll_timeout = timeout;  // -1 = infinite, >0 = ms
            int ret = ::poll(pfds.data(), pfds.size(), poll_timeout);
            if (ret > 0) {
                for (size_t i = 0; i < pfds.size() && ready < maxevents; i++) {
                    uint32_t revents2 = 0;
                    if (pfds[i].revents & POLLIN)  revents2 |= 0x01;
                    if (pfds[i].revents & POLLOUT) revents2 |= 0x04;
                    if (pfds[i].revents & (POLLERR | POLLHUP)) revents2 |= 0x08;
                    if (revents2) {
                        uint64_t offset = events_addr + ready * 16;
                        m.memory.template write<uint32_t>(offset, revents2);
                        m.memory.template write<uint32_t>(offset + 4, 0);
                        m.memory.template write<uint64_t>(offset + 8, pfd_map[i].second->data);
                        ready++;
                    }
                }
            }
            // ret == 0: timeout expired, nothing ready
            // ret < 0: error (e.g. EINTR)
            m.set_result(ready);
            return;
        }
#endif
        // Nothing ready — use cooperative threading to schedule other threads.
        if (timeout == -1) {
            // Infinite timeout: block this thread until an eventfd wakes it.
            if (g_sched.count > 1) {
                auto& cur = g_sched.threads[g_sched.current];
                cur.waiting = true;
                cur.futex_addr = (uint64_t)epfd;  // epoll fd as wakeup key
                m.set_result(0);  // Will re-execute when woken
                m.cpu.increment_pc(-4);  // Rewind to ecall
                int next = g_sched.next_runnable(g_sched.current);
                if (next >= 0) {
                    switch_to_thread(m, next);
                    return;
                }
                // All threads waiting — deadlock. Force-wake one.
                for (int i = 0; i < MAX_VTHREADS; i++) {
                    if (i != g_sched.current && g_sched.threads[i].active && g_sched.threads[i].waiting) {
                        g_sched.threads[i].waiting = false;
                        switch_to_thread(m, i);
                        return;
                    }
                }
                // Truly alone — unmark and fall through
                cur.waiting = false;
            }
#ifdef __EMSCRIPTEN__
            // In Wasm: yield to JS event loop (can't usleep — blocks everything).
            // Return -EINTR (same as native) so the event loop handles it properly.
            // Do NOT rewind PC — let the event loop continue past epoll_pwait.
            g_waiting_for_stdin = true;
            m.set_result(-4);  // -EINTR
            m.stop();
            return;
#else
            if (g_checkpoint_on_stdin) {
                // Checkpoint mode: stop at idle point
                g_waiting_for_stdin = true;
                m.cpu.increment_pc(-4);
                m.stop();
                return;
            }
            // Native: sleep 10ms, return -EINTR
            usleep(10000);
            m.set_result(-4);  // -EINTR
            return;
#endif
        }
        // Finite timeout > 0: yield to runnable threads first, then
        // sleep briefly and return 0.
        if (g_sched.count > 1) {
            int next = g_sched.next_runnable(g_sched.current);
            if (next >= 0) {
                // Let runnable worker threads execute (e.g. DNS resolution).
                // Rewind PC so this thread re-enters epoll_pwait when rescheduled.
                m.cpu.increment_pc(-4);
                switch_to_thread(m, next);
                return;
            }
        }
        // No runnable threads — sleep briefly and return 0.
#ifdef __EMSCRIPTEN__
        // In Wasm: yield to JS for timers/network.
        // IMPORTANT: Do NOT rewind PC. Return 0 events so the event loop
        // continues past epoll_pwait and processes pending callbacks.
        // If we rewound PC, the machine would re-enter epoll_pwait forever
        // in a tight loop without processing any event loop callbacks.
        g_waiting_for_stdin = true;
        m.set_result(0);
        m.stop();
#else
        if (g_checkpoint_on_stdin) {
            // Checkpoint mode: count consecutive idle epoll waits.
            // After several idle polls, the system is truly idle (waiting for user input).
            g_idle_epoll_count++;
            if (g_idle_epoll_count >= IDLE_EPOLL_THRESHOLD) {
                g_waiting_for_stdin = true;
                m.cpu.increment_pc(-4);
                m.stop();
                return;
            }
        }
        {
            if (timeout > 0) {
                int sleep_ms = std::min(timeout, 10);
                usleep(sleep_ms * 1000);
            }
            m.set_result(0);
        }
#endif
    }
}

// ============================================================================
// futex — thread synchronization (single-threaded: mostly no-ops)
// ============================================================================

static void sys_futex(Machine& m) {
    auto uaddr = m.sysarg(0);
    int op = m.template sysarg<int>(1);

    // Mask off FUTEX_PRIVATE_FLAG (128) and FUTEX_CLOCK_REALTIME (256)
    int cmd = op & 0x7f;

    constexpr int FUTEX_WAIT = 0;
    constexpr int FUTEX_WAKE = 1;
    constexpr int FUTEX_WAIT_BITSET = 9;
    constexpr int FUTEX_WAKE_BITSET = 10;

    if (cmd == FUTEX_WAIT || cmd == FUTEX_WAIT_BITSET) {
        int32_t expected = m.template sysarg<int>(2);
        int32_t actual = m.memory.template read<int32_t>(uaddr);
        if (actual != expected) {
            m.set_result(-11);  // -EAGAIN
            return;
        }

        // Cooperative scheduling: if another thread is runnable, switch to it.
        // This handles the pattern: main creates thread → main waits → thread runs.
        if (g_sched.count > 1) {
            auto& cur = g_sched.threads[g_sched.current];
            cur.waiting = true;
            cur.futex_addr = uaddr;
            cur.futex_val = expected;
            // Return value when this thread resumes: 0 (woken successfully)
            m.set_result(0);

            int next = g_sched.next_runnable(g_sched.current);
            if (next >= 0) {
                static int switch_count = 0;
                if (++switch_count <= 50)
                    if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[futex] WAIT switch t%d->t%d addr=0x%lx exp=0x%x\n",
                            g_sched.current, next, (long)uaddr, (unsigned)expected);
                switch_to_thread(m, next);
                return;
            }
            // All threads waiting — cooperative deadlock. Force-wake a sleeping
            // thread so it can observe any shutdown signals written to memory.
            // This simulates parallel execution where threads run concurrently.
            for (int i = 0; i < MAX_VTHREADS; i++) {
                if (i != g_sched.current && g_sched.threads[i].active && g_sched.threads[i].waiting) {
                    g_sched.threads[i].waiting = false;
                    static int deadlock_count = 0;
                    if (++deadlock_count <= 50)
                        if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[futex] deadlock-break: force-wake t%d, switch from t%d\n",
                                i, g_sched.current);
                    switch_to_thread(m, i);
                    return;
                }
            }
            // Truly no other threads — fall through
            cur.waiting = false;
        }

        // Fallback: single-threaded (or all threads exited).
        // No other thread can wake us. Force-unlock the futex word so
        // glibc's __lll_lock_wait CAS loop can acquire the lock.
        // Stack canary is zeroed (AT_RANDOM=0) to prevent false positives
        // from any glibc state disruption this may cause.
        static int futex_wait_count = 0;
        if (++futex_wait_count <= 50) {
            if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[futex] WAIT fallback addr=0x%lx exp=0x%x actual=0x%x count=%d pc=0x%lx\n",
                    (long)uaddr, (unsigned)expected, (unsigned)actual,
                    g_sched.count, (long)m.cpu.pc());
        }
        m.memory.template write<int32_t>(uaddr, 0);
        m.set_result(-11);  // -EAGAIN: value changed, re-check

    } else if (cmd == FUTEX_WAKE || cmd == FUTEX_WAKE_BITSET) {
        int max_wake = m.template sysarg<int>(2);
        int woken = g_sched.wake(uaddr, max_wake);

        // If we woke a thread, optionally switch to it
        if (woken > 0) {
            static int wake_count = 0;
            if (++wake_count <= 20)
                if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[futex] WAKE addr=0x%lx woke=%d\n",
                        (long)uaddr, woken);
        }
        m.set_result(woken);
    } else {
        m.set_result(-38);  // -ENOSYS for other futex ops
    }
}

// ============================================================================
// statx — extended file stat
// ============================================================================

static void sys_statx(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    int flags = m.template sysarg<int>(2);
    // uint32_t mask = m.template sysarg<uint32_t>(3);  // unused — we fill all
    auto buf_addr = m.sysarg(4);

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    // Support fstat-like statx(dirfd, "", AT_EMPTY_PATH, ...).
    if ((flags & AT_EMPTY_PATH) && path.empty()) {
        linux_stat64 st = {};
        if (!fill_stat_from_fd(m, dirfd, st)) {
            m.set_result(err::BADF);
            return;
        }

        uint8_t buf[256] = {};
        uint32_t stx_mask = 0x07ff;  // STATX_BASIC_STATS
        std::memcpy(buf + 0, &stx_mask, 4);
        uint32_t blksize = (st.st_blksize > 0) ? (uint32_t)st.st_blksize : 4096;
        std::memcpy(buf + 4, &blksize, 4);
        uint32_t nlink = st.st_nlink;
        std::memcpy(buf + 16, &nlink, 4);
        uint32_t uid = st.st_uid;
        uint32_t gid = st.st_gid;
        std::memcpy(buf + 20, &uid, 4);
        std::memcpy(buf + 24, &gid, 4);
        uint16_t mode16 = (uint16_t)(st.st_mode & 0xFFFF);
        std::memcpy(buf + 28, &mode16, 2);
        uint64_t ino = st.st_ino;
        std::memcpy(buf + 32, &ino, 8);
        uint64_t size64 = (uint64_t)st.st_size;
        std::memcpy(buf + 40, &size64, 8);
        uint64_t blocks = (uint64_t)st.st_blocks;
        std::memcpy(buf + 48, &blocks, 8);
        uint64_t attr_mask = 0;
        std::memcpy(buf + 56, &attr_mask, 8);
        int64_t at_sec = st.st_atime_sec; int32_t at_nsec = st.st_atime_nsec;
        int64_t bt_sec = 0;               int32_t bt_nsec = 0;
        int64_t ct_sec = st.st_ctime_sec; int32_t ct_nsec = st.st_ctime_nsec;
        int64_t mt_sec = st.st_mtime_sec; int32_t mt_nsec = st.st_mtime_nsec;
        std::memcpy(buf + 64,  &at_sec, 8); std::memcpy(buf + 72,  &at_nsec, 4);
        std::memcpy(buf + 80,  &bt_sec, 8); std::memcpy(buf + 88,  &bt_nsec, 4);
        std::memcpy(buf + 96,  &ct_sec, 8); std::memcpy(buf + 104, &ct_nsec, 4);
        std::memcpy(buf + 112, &mt_sec, 8); std::memcpy(buf + 120, &mt_nsec, 4);
        uint32_t major = 0, minor = 0;
        std::memcpy(buf + 136, &major, 4); std::memcpy(buf + 140, &minor, 4);
        std::memcpy(buf + 144, &major, 4); std::memcpy(buf + 148, &minor, 4);

        m.memory.memcpy(buf_addr, buf, sizeof(buf));
        m.set_result(0);
        return;
    }


    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    // AT_EMPTY_PATH with empty string means fstat on dirfd — not supported
    if (path.empty()) {
        m.set_result(-2);  // -ENOENT
        return;
    }

    auto entry = fs.resolve(path);
    if (!entry) {
        m.set_result(-2);  // -ENOENT
        return;
    }

    // struct statx (256 bytes on rv64)
    uint8_t buf[256] = {};

    // stx_mask (offset 0): what fields are filled
    uint32_t stx_mask = 0x07ff;  // STATX_BASIC_STATS
    std::memcpy(buf + 0, &stx_mask, 4);

    // stx_blksize (offset 4)
    uint32_t blksize = 4096;
    std::memcpy(buf + 4, &blksize, 4);

    // stx_attributes (offset 8) — 0
    // stx_nlink (offset 16)
    uint32_t nlink = entry->is_dir() ? 2 : 1;
    std::memcpy(buf + 16, &nlink, 4);

    // stx_uid (offset 20), stx_gid (offset 24)
    uint32_t zero32 = 0;
    std::memcpy(buf + 20, &zero32, 4);
    std::memcpy(buf + 24, &zero32, 4);

    // stx_mode (offset 28)
    uint16_t mode = entry->mode;
    if (entry->is_dir())       mode |= 0040000;  // S_IFDIR
    else if (entry->type == vfs::FileType::Symlink) mode |= 0120000;  // S_IFLNK
    else                       mode |= 0100000;  // S_IFREG
    std::memcpy(buf + 28, &mode, 2);

    // stx_ino (offset 32) — use pointer as fake inode
    uint64_t ino = reinterpret_cast<uintptr_t>(entry.get()) & 0xFFFFFFFF;
    std::memcpy(buf + 32, &ino, 8);

    // stx_size (offset 40)
    uint64_t size = entry->is_dir() ? 4096 : entry->content.size();
    std::memcpy(buf + 40, &size, 8);

    // stx_blocks (offset 48)
    uint64_t blocks = (size + 511) / 512;
    std::memcpy(buf + 48, &blocks, 8);

    // stx_attributes_mask (offset 56) — 0

    // Timestamps: stx_atime (64), stx_btime (80), stx_ctime (96), stx_mtime (112)
    // Each is { int64_t tv_sec; uint32_t tv_nsec; int32_t __reserved; } = 16 bytes
    // Use current time
    struct timespec now;
    clock_gettime(CLOCK_REALTIME, &now);
    for (int i = 0; i < 4; i++) {
        size_t off = 64 + i * 16;
        std::memcpy(buf + off, &now.tv_sec, 8);
        uint32_t nsec = now.tv_nsec;
        std::memcpy(buf + off + 8, &nsec, 4);
    }

    m.memory.memcpy(buf_addr, buf, sizeof(buf));
    m.set_result(0);
}

// ============================================================================
// uname — system identification
// ============================================================================

static void sys_uname(Machine& m) {
    auto buf_addr = m.sysarg(0);

    // struct utsname: 5 fields of 65 bytes each = 325 bytes (some add domainname=65 → 390)
    // RISC-V Linux uses 65-byte fields
    constexpr int FIELD_LEN = 65;
    uint8_t buf[FIELD_LEN * 6] = {};  // 6 fields to be safe

    auto write_field = [&](int idx, const char* val) {
        size_t len = std::strlen(val);
        if (len >= FIELD_LEN) len = FIELD_LEN - 1;
        std::memcpy(buf + idx * FIELD_LEN, val, len);
    };

    write_field(0, "Linux");                  // sysname
    write_field(1, "friscy");                 // nodename
    write_field(2, "6.1.0-friscy");           // release
    write_field(3, "#1 SMP PREEMPT_DYNAMIC"); // version
    write_field(4, "riscv64");                // machine
    write_field(5, "(none)");                 // domainname

    m.memory.memcpy(buf_addr, buf, sizeof(buf));
    m.set_result(0);
}

// ============================================================================
// nanosleep — sleep for specified duration
// ============================================================================

static void sys_nanosleep(Machine& m) {
    auto req_addr = m.sysarg(0);

    int64_t tv_sec = m.memory.template read<int64_t>(req_addr);
    int64_t tv_nsec = m.memory.template read<int64_t>(req_addr + 8);
    int ms = static_cast<int>(tv_sec * 1000 + tv_nsec / 1000000);
    if (ms < 1) ms = 1;

    // Cooperative scheduling: nanosleep is a natural yield point
    if (g_sched.count > 1) {
        int next = g_sched.next_runnable(g_sched.current);
        if (next >= 0) {
            switch_to_thread(m, next);
            return;
        }
    }

#ifdef __EMSCRIPTEN__
    // Yield to host event loop — emscripten_sleep is not available (no ASYNCIFY).
    // Don't rewind PC: nanosleep should return 0 on resume (sleep "completed").
    // The host's 4ms poll interval provides a natural minimum sleep.
    g_waiting_for_stdin = true;
    m.set_result(0);
    m.stop();
    return;
#endif
    m.set_result(0);
}

// ============================================================================
// Stubs — safe no-ops or ENOSYS returns
// ============================================================================

static void sys_madvise(Machine& m) {
    auto addr = m.sysarg(0);
    auto len = m.sysarg(1);
    auto advice = m.template sysarg<int>(2);
    if (g_trace_syscalls && g_trace_countdown-- > 0)
        dbg_fprintf(stderr, "[madvise] addr=0x%lx len=0x%lx advice=%d pc=0x%lx\n",
                (long)addr, (long)len, advice, (long)m.cpu.pc());
    constexpr int MADV_NORMAL = 0;
    constexpr int MADV_RANDOM = 1;
    constexpr int MADV_SEQUENTIAL = 2;
    constexpr int MADV_WILLNEED = 3;
    constexpr int MADV_DONTNEED = 4;
    constexpr int MADV_FREE = 8;
    constexpr int MADV_HUGEPAGE = 14;
    constexpr int MADV_NOHUGEPAGE = 15;
    switch (advice) {
        case MADV_NORMAL:
        case MADV_RANDOM:
        case MADV_SEQUENTIAL:
        case MADV_WILLNEED:
        case MADV_DONTNEED:
        case MADV_FREE:
        case MADV_HUGEPAGE:
        case MADV_NOHUGEPAGE:
            m.set_result(0);
            return;
        default:
            // Compatibility-first stub: accept unknown advice as no-op.
            m.set_result(0);
            return;
    }
}
static void sys_prctl(Machine& m) { m.set_result(0); }
static void sys_mremap(Machine& m) {
    auto old_addr = m.sysarg(0);
    auto old_size = m.sysarg(1);
    auto new_size = m.sysarg(2);
    auto flags = m.template sysarg<int>(3);
    auto requested_new_addr = m.sysarg(4);
    (void)requested_new_addr;

    if (old_size == 0) {
        m.set_result(uint64_t(-22));  // -EINVAL
        return;
    }

    // Validate address is within the arena. QEMU returns EFAULT (-14) for
    // addresses outside valid mappings, and musl uses this as a stop signal
    // when iterating through chunks. Without EFAULT, musl loops forever
    // through its entire corrupted chunk list.
    constexpr uint64_t ARENA_LIMIT = (1ULL << riscv::encompassing_Nbit_arena);
    if (old_addr >= ARENA_LIMIT || old_addr + old_size > ARENA_LIMIT) {
        m.set_result(uint64_t(-14));  // -EFAULT (bad address)
        return;
    }

    // mremap only applies to mmap()ed regions. In this runtime, get_pageno()
    // cannot be used for mappedness checks because missing pages resolve to a
    // synthetic CoW zero page. Use mmap arena bounds instead.
    const uint64_t mmap_start = m.memory.mmap_start();
    const uint64_t mmap_top = std::max<uint64_t>(g_mmap_bump, m.memory.mmap_address());
    if (old_addr < mmap_start || old_addr + old_size > mmap_top) {
        m.set_result(uint64_t(-14));  // -EFAULT
        return;
    }

    const uint64_t aligned_old = (old_size + 4095) & ~4095ULL;
    const uint64_t aligned_new = (new_size + 4095) & ~4095ULL;
    const auto* old_region = live_mmap_find(old_addr);
    const auto old_attr = (old_region != nullptr)
        ? old_region->attr
        : mmap_attr_from_prot(1 | 2);
    const bool old_lazy = old_region != nullptr && old_region->lazy;
    const bool old_anonymous = old_region != nullptr && old_region->anonymous;

    // Shrink / same-size remap: keep address stable and report success.
    if (new_size <= old_size) {
        if (new_size < old_size && old_addr >= m.memory.mmap_start()) {
            if (aligned_old > aligned_new) {
                if (g_lazy_mmap_page_tables_enabled) {
                    free_materialized_pages_for_range(m, old_addr + aligned_new, aligned_old - aligned_new);
                } else {
                    riscv::PageAttributes none {};
                    none.read = false;
                    none.write = false;
                    none.exec = false;
                    m.memory.set_page_attr(old_addr + aligned_new, aligned_old - aligned_new, none);
                }
                live_mmap_unmap(old_addr + aligned_new, aligned_old - aligned_new);
            }
            live_mmap_map(old_addr, aligned_new, old_attr, old_lazy, old_anonymous);
        }
        m.set_result(old_addr);
        return;
    }

    // Grow path: keep the custom anonymous allocator behavior coherent with
    // sys_mmap/sys_munmap so accounting, cache invalidation and hint policy
    // all stay aligned.
    constexpr int MREMAP_MAYMOVE = 1;
    if ((flags & MREMAP_MAYMOVE) == 0) {
        m.set_result(uint64_t(-12));  // -ENOMEM
        return;
    }

    sync_mmap_bump(m);

    if (old_addr + aligned_old == g_mmap_bump && old_addr + aligned_new <= ARENA_LIMIT) {
        g_mmap_bump = old_addr + aligned_new;
        publish_mmap_bump(m);
        if (aligned_new > aligned_old) {
            if (old_lazy) {
                enable_lazy_mmap_page_tables(m);
                set_materialized_page_attrs_for_range(m, old_addr, aligned_new, old_attr);
            } else {
                m.memory.set_page_attr(old_addr, aligned_new, old_attr);
            }
            rails_note_mmap(m.cpu.pc(), m.cpu.reg(1), aligned_new - aligned_old);
        }
        live_mmap_map(old_addr, aligned_new, old_attr, old_lazy, old_anonymous);
        m.set_result(old_addr);
        return;
    }

    auto anon = alloc_anon_mapping(m, 0, new_size, 0);
    if (anon.error != 0 || anon.addr == 0 || anon.addr == ~0ULL) {
        if (anon.error != 0) rails_note_mmap_fail(m.cpu.pc());
        m.set_result(uint64_t(-12));  // -ENOMEM
        return;
    }
    const uint64_t new_addr = anon.addr;

    try {
        uint64_t i = 0;
        for (; i + 8 <= old_size; i += 8) {
            const uint64_t v = m.memory.template read<uint64_t>(old_addr + i);
            m.memory.template write<uint64_t>(new_addr + i, v);
        }
        for (; i < old_size; i++) {
            const uint8_t v = m.memory.template read<uint8_t>(old_addr + i);
            m.memory.template write<uint8_t>(new_addr + i, v);
        }
    } catch (...) {
        m.set_result(uint64_t(-14));  // -EFAULT
        return;
    }

    rails_note_mmap(m.cpu.pc(), m.cpu.reg(1), anon.aligned_len);
    custom_unmap_range(m, old_addr, aligned_old, m.cpu.pc(), m.cpu.reg(1));
    if (old_addr >= m.memory.mmap_start()) {
        if (g_lazy_mmap_page_tables_enabled) {
            free_materialized_pages_for_range(m, old_addr, aligned_old);
        } else {
            riscv::PageAttributes none {};
            none.read = false;
            none.write = false;
            none.exec = false;
            m.memory.set_page_attr(old_addr, aligned_old, none);
        }
        live_mmap_unmap(old_addr, aligned_old);
    }
    if (new_addr >= m.memory.mmap_start()) {
        if (old_lazy) {
            enable_lazy_mmap_page_tables(m);
            free_materialized_pages_for_range(m, new_addr, anon.aligned_len);
        } else {
            m.memory.set_page_attr(new_addr, anon.aligned_len, old_attr);
        }
        live_mmap_map(new_addr, anon.aligned_len, old_attr, old_lazy, old_anonymous);
    }
    m.set_result(new_addr);
}

static void sys_eventfd2(Machine& m) {
    // eventfd: create a notification fd backed by a counter.
    // libuv uses this for async wakeup — write(fd, &val, 8) to signal,
    // read(fd, &val, 8) to consume.
    uint32_t initval = m.template sysarg<uint32_t>(0);
    auto& fs = get_fs(m);
    auto entry = std::make_shared<vfs::Entry>();
    entry->type = vfs::FileType::Fifo;  // Pipe-like: only ready when data available
    entry->mode = 0600;
    entry->size = 0;
    // Start with empty content (no signal pending)
    int fd = fs.open_pipe(entry, 0);
    g_eventfd_counters[fd] = initval;
    // If initval > 0, mark as having data
    if (initval > 0) {
        entry->content.resize(8);
        memcpy(entry->content.data(), &initval, sizeof(initval));
    }
    if (g_trace_syscalls && g_trace_countdown-- > 0) dbg_fprintf(stderr, "[eventfd2] => fd=%d initval=%u\n", fd, initval);
    m.set_result(fd);
}
// timerfd_create(clockid, flags) → fd
static void sys_timerfd_create(Machine& m) {
    int clockid = m.template sysarg<int>(0);
    int flags = m.template sysarg<int>(1);
    (void)clockid; (void)flags;
    auto& fs = get_fs(m);
    auto entry = std::make_shared<vfs::Entry>();
    entry->type = vfs::FileType::Fifo;
    entry->mode = 0600;
    entry->size = 0;
    int fd = fs.open_pipe(entry, 0);
    g_timerfd_states[fd] = {0, 0, 0};
    TRACE_SC("timerfd_create(clockid=%d, flags=0x%x) => fd=%d", clockid, flags, fd);
    m.set_result(fd);
}

// linux_itimerspec defined near top of file (see TimerFdState section)

// timerfd_settime(fd, flags, new_value, old_value) → 0 or -errno
static void sys_timerfd_settime(Machine& m) {
    int fd = m.template sysarg<int>(0);
    int flags = m.template sysarg<int>(1);
    auto new_addr = m.sysarg(2);
    auto old_addr = m.sysarg(3);

    auto it = g_timerfd_states.find(fd);
    if (it == g_timerfd_states.end()) {
        m.set_result(err::BADF);
        return;
    }
    auto& st = it->second;

    // Return old value if requested
    if (old_addr != 0) {
        linux_itimerspec old_val = {};
        old_val.interval_sec = st.interval_ns / 1000000000ULL;
        old_val.interval_nsec = st.interval_ns % 1000000000ULL;
        if (st.expire_ns > 0) {
            uint64_t now = monotonic_ns();
            int64_t remaining = (int64_t)(st.expire_ns - now);
            if (remaining < 0) remaining = 0;
            old_val.value_sec = remaining / 1000000000LL;
            old_val.value_nsec = remaining % 1000000000LL;
        }
        m.memory.memcpy(old_addr, &old_val, sizeof(old_val));
    }

    // Read new value
    linux_itimerspec spec = {};
    m.memory.memcpy_out(&spec, new_addr, sizeof(spec));

    st.interval_ns = (uint64_t)spec.interval_sec * 1000000000ULL + (uint64_t)spec.interval_nsec;
    st.expirations = 0;

    uint64_t value_ns = (uint64_t)spec.value_sec * 1000000000ULL + (uint64_t)spec.value_nsec;
    if (value_ns == 0) {
        st.expire_ns = 0;  // disarm
    } else {
        constexpr int TFD_TIMER_ABSTIME = 1;
        if (flags & TFD_TIMER_ABSTIME) {
            st.expire_ns = value_ns;
        } else {
            st.expire_ns = monotonic_ns() + value_ns;
        }
    }

    // If timer already expired, mark it readable for epoll/poll
    timerfd_tick(fd);
    if (st.expirations > 0) {
        auto entry = get_fs(m).get_entry(fd);
        if (entry) {
            entry->content.resize(8);
            uint64_t exp = st.expirations;
            memcpy(entry->content.data(), &exp, 8);
            entry->size = 8;
        }
    }

    TRACE_SC("timerfd_settime(fd=%d, flags=%d, val=%ld.%09ld, interval=%ld.%09ld)",
             fd, flags, (long)spec.value_sec, (long)spec.value_nsec,
             (long)spec.interval_sec, (long)spec.interval_nsec);
    m.set_result(0);
}

// timerfd_gettime(fd, curr_value) → 0 or -errno
static void sys_timerfd_gettime(Machine& m) {
    int fd = m.template sysarg<int>(0);
    auto addr = m.sysarg(1);

    auto it = g_timerfd_states.find(fd);
    if (it == g_timerfd_states.end()) {
        m.set_result(err::BADF);
        return;
    }
    auto& st = it->second;
    timerfd_tick(fd);

    linux_itimerspec val = {};
    val.interval_sec = st.interval_ns / 1000000000ULL;
    val.interval_nsec = st.interval_ns % 1000000000ULL;
    if (st.expire_ns > 0) {
        uint64_t now = monotonic_ns();
        int64_t remaining = (int64_t)(st.expire_ns - now);
        if (remaining < 0) remaining = 0;
        val.value_sec = remaining / 1000000000LL;
        val.value_nsec = remaining % 1000000000LL;
    }
    m.memory.memcpy(addr, &val, sizeof(val));
    m.set_result(0);
}

static void sys_io_uring_setup(Machine& m) { m.set_result(err::NOSYS); }
static void sys_capget(Machine& m) {
    // Node.js calls capget during initialization to check capabilities.
    // Two-call protocol: first call gets header version, second gets data.
    // We zero the data buffer and return success (no capabilities).
    auto header_addr = m.sysarg(0);
    auto data_addr = m.sysarg(1);
    if (data_addr != 0) {
        // Zero the cap_user_data_t struct (3 x __u32 = 12 bytes, or 2 structs = 24 bytes)
        uint8_t zeros[24] = {};
        try { m.memory.memcpy(data_addr, zeros, sizeof(zeros)); } catch (...) {}
    }
    m.set_result(0);
}

static void sys_sched_getscheduler(Machine& m) {
    m.set_result(0);  // SCHED_OTHER
}

static void sys_sched_getparam(Machine& m) {
    auto param_addr = m.sysarg(1);
    // struct sched_param { int sched_priority; }
    m.memory.template write<int32_t>(param_addr, 0);
    m.set_result(0);
}

static void sys_sched_getaffinity(Machine& m) {
    auto mask_addr = m.sysarg(2);
    // Write 1-bit CPU mask (1 core)
    uint64_t mask = 1;
    m.memory.template write<uint64_t>(mask_addr, mask);
    m.set_result(8);  // Return size of mask in bytes
}

// ============================================================================
// Additional syscalls discovered from strace of curl/git/python/vim/bash/ssh
// ============================================================================

static void sys_umask(Machine& m) {
    // Return previous umask, accept new one (we don't enforce permissions)
    static uint32_t current_umask = 0022;
    uint32_t new_mask = m.template sysarg<uint32_t>(0);
    uint32_t old = current_umask;
    current_umask = new_mask & 0777;
    m.set_result(old);
}

static void sys_setpgid(Machine& m) {
    // setpgid(pid, pgid) — shells call this to manage job control.
    // Single-process emulation: accept silently.
    m.set_result(0);
}

static void sys_getpgid(Machine& m) {
    // Return same as getpid — single process group
    m.set_result(1);
}

static void sys_setsid(Machine& m) {
    // setsid() — create new session. Return "new session id" = our pid.
    m.set_result(1);
}

static void sys_getresuid(Machine& m) {
    auto ruid_addr = m.sysarg(0);
    auto euid_addr = m.sysarg(1);
    auto suid_addr = m.sysarg(2);
#ifdef __EMSCRIPTEN__
    const uint32_t ruid = 0;
    const uint32_t euid = 0;
    const uint32_t suid = 0;
#else
    const uint32_t ruid = ::getuid();
    const uint32_t euid = ::geteuid();
    const uint32_t suid = euid;
#endif
    m.memory.template write<uint32_t>(ruid_addr, ruid);
    m.memory.template write<uint32_t>(euid_addr, euid);
    m.memory.template write<uint32_t>(suid_addr, suid);
    m.set_result(0);
}

static void sys_getresgid(Machine& m) {
    auto rgid_addr = m.sysarg(0);
    auto egid_addr = m.sysarg(1);
    auto sgid_addr = m.sysarg(2);
#ifdef __EMSCRIPTEN__
    const uint32_t rgid = 0;
    const uint32_t egid = 0;
    const uint32_t sgid = 0;
#else
    const uint32_t rgid = ::getgid();
    const uint32_t egid = ::getegid();
    const uint32_t sgid = egid;
#endif
    m.memory.template write<uint32_t>(rgid_addr, rgid);
    m.memory.template write<uint32_t>(egid_addr, egid);
    m.memory.template write<uint32_t>(sgid_addr, sgid);
    m.set_result(0);
}

static void sys_sigaltstack(Machine& m) {
    // Accept silently — we don't deliver signals, so alternate stack is unused
    m.set_result(0);
}

static void sys_clock_getres(Machine& m) {
    // int clock_getres(clockid_t clk, struct timespec *res)
    auto res_addr = m.sysarg(1);
    if (res_addr != 0) {
        // Report 1ms resolution (matches emscripten_sleep granularity)
        m.memory.template write<int64_t>(res_addr, 0);       // tv_sec
        m.memory.template write<int64_t>(res_addr + 8, 1000000);  // tv_nsec = 1ms
    }
    m.set_result(0);
}

static void sys_membarrier(Machine& m) {
    // Single-core/runtime-local emulation: expedited membarrier operations can
    // safely succeed as no-ops. Modern runtimes like Node/libuv register
    // private expedited barriers during thread startup and expect success.
    int cmd = m.template sysarg<int>(0);
    constexpr int MEMBARRIER_CMD_QUERY = 0;
    constexpr int MEMBARRIER_CMD_GLOBAL = 1;
    constexpr int MEMBARRIER_CMD_GLOBAL_EXPEDITED = 2;
    constexpr int MEMBARRIER_CMD_REGISTER_GLOBAL_EXPEDITED = 4;
    constexpr int MEMBARRIER_CMD_PRIVATE_EXPEDITED = 8;
    constexpr int MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED = 16;
    constexpr int MEMBARRIER_CMD_PRIVATE_EXPEDITED_SYNC_CORE = 32;
    constexpr int MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED_SYNC_CORE = 64;
    constexpr int MEMBARRIER_CMD_PRIVATE_EXPEDITED_RSEQ = 128;
    constexpr int MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED_RSEQ = 256;
    constexpr int SUPPORTED_MASK =
        MEMBARRIER_CMD_GLOBAL |
        MEMBARRIER_CMD_GLOBAL_EXPEDITED |
        MEMBARRIER_CMD_REGISTER_GLOBAL_EXPEDITED |
        MEMBARRIER_CMD_PRIVATE_EXPEDITED |
        MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED |
        MEMBARRIER_CMD_PRIVATE_EXPEDITED_SYNC_CORE |
        MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED_SYNC_CORE |
        MEMBARRIER_CMD_PRIVATE_EXPEDITED_RSEQ |
        MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED_RSEQ;
    switch (cmd) {
        case MEMBARRIER_CMD_QUERY:
            m.set_result(SUPPORTED_MASK);
            return;
        case MEMBARRIER_CMD_GLOBAL:
        case MEMBARRIER_CMD_GLOBAL_EXPEDITED:
        case MEMBARRIER_CMD_REGISTER_GLOBAL_EXPEDITED:
        case MEMBARRIER_CMD_PRIVATE_EXPEDITED:
        case MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED:
        case MEMBARRIER_CMD_PRIVATE_EXPEDITED_SYNC_CORE:
        case MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED_SYNC_CORE:
        case MEMBARRIER_CMD_PRIVATE_EXPEDITED_RSEQ:
        case MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED_RSEQ:
            m.set_result(0);
            return;
        default:
            m.set_result(err::NOSYS);
            return;
    }
}

static void sys_faccessat2(Machine& m) {
    // Same as faccessat but with extra flags arg (which we ignore)
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    // int mode = m.template sysarg<int>(2);
    // int flags = m.template sysarg<int>(3);  // AT_SYMLINK_NOFOLLOW etc.

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) {
        m.set_result(at_path_errno(at.status));
        return;
    }
    path = std::move(at.path);

    auto entry = fs.resolve(path);
    const int rc = entry ? 0 : err::NOENT;
    m.set_result(rc);
}

// recvmsg — scatter-gather socket receive (needed by node HTTP)
static void sys_recvmsg(Machine& m) {
    int fd = m.template sysarg<int>(0);
    auto msghdr_addr = m.sysarg(1);
    // int flags = m.template sysarg<int>(2);

    auto& fs = get_fs(m);

    // struct msghdr {
    //   void *msg_name;          // 0:  8 bytes
    //   socklen_t msg_namelen;   // 8:  4 bytes (+4 pad)
    //   struct iovec *msg_iov;   // 16: 8 bytes
    //   size_t msg_iovlen;       // 24: 8 bytes
    //   void *msg_control;       // 32: 8 bytes
    //   size_t msg_controllen;   // 40: 8 bytes
    //   int msg_flags;           // 48: 4 bytes
    // }
    auto iov_addr = m.memory.template read<uint64_t>(msghdr_addr + 16);
    auto iovlen   = m.memory.template read<uint64_t>(msghdr_addr + 24);

    // Read into iovec buffers, similar to readv
    size_t total = 0;
    for (uint64_t i = 0; i < iovlen && i < 16; i++) {
        uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
        uint64_t len  = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
        if (len > 0) {
            std::vector<uint8_t> buf(len);
            ssize_t n = fs.read(fd, buf.data(), len);
            if (n < 0) {
                m.set_result(total > 0 ? (int64_t)total : n);
                return;
            }
            if (n > 0) {
                m.memory.memcpy(base, buf.data(), n);
                total += n;
            }
            if (static_cast<size_t>(n) < len) break;
        }
    }

    // Zero out msg_controllen (no ancillary data)
    m.memory.template write<uint64_t>(msghdr_addr + 40, 0);
    // Clear msg_flags
    m.memory.template write<int32_t>(msghdr_addr + 48, 0);

    m.set_result(total);
}

// ============================================================================
// Round 3: Go echo + Next.js build gaps
// ============================================================================

static void sys_flock(Machine& m) {
    // File locking — no-op in single-process VFS
    m.set_result(0);
}

static void sys_fsync(Machine& m) {
    // Flush to disk — in-memory VFS, nothing to flush
    m.set_result(0);
}

static void sys_fchmod(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    uint32_t mode = m.template sysarg<uint32_t>(1);
    auto entry = fs.get_entry(fd);
    if (!entry) { m.set_result(err::BADF); return; }
    entry->mode = mode & 07777;
    m.set_result(0);
}

static void sys_fchmodat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    uint32_t mode = m.template sysarg<uint32_t>(2);
    std::string path;
    try { path = m.memory.memstring(path_addr); }
    catch (...) { m.set_result(err::INVAL); return; }
    auto at = resolve_at_path(fs, dirfd, path);
    if (at.status != AtPathStatus::Ok) { m.set_result(at_path_errno(at.status)); return; }
    path = std::move(at.path);

    auto entry = fs.resolve(path);
    if (!entry) { m.set_result(err::NOENT); return; }
    entry->mode = mode & 07777;
    m.set_result(0);
}

static void sys_fchownat(Machine& m) {
    // Ownership changes — we're always root, accept silently
    m.set_result(0);
}

static void sys_getgroups(Machine& m) {
    // No supplementary groups
    m.set_result(0);
}

static void sys_kill(Machine& m) {
    int pid = m.template sysarg<int>(0);
    int sig = m.template sysarg<int>(1);
    // pid 0 = current process group, pid -1 = all, negative = pgid
    // For our single-machine model: treat 0, -1, and self as "this process".
    if (pid <= 0 || pid == g_process_model.current_pid) {
        // sig 0 = existence check; others accepted silently (no signal delivery yet)
        m.set_result(0);
        return;
    }
    // Look up the pid in the process table.
    if (g_process_model.pid_exists(pid)) {
        m.set_result(0);  // process exists; signal accepted (not delivered)
    } else {
        m.set_result(-3);  // -ESRCH
    }
}


static void sys_tkill(Machine& m) {
    int sig = m.template sysarg<int>(1);
    if (sig == 6) { // SIGABRT
#ifdef __EMSCRIPTEN__
        // Intercept SIGABRT: the subsequent ebreak will throw an exception
        // that JSPI can't propagate. Handle it here instead.
        if (g_checkpoint_on_stdin) {
            uint64_t ra = m.cpu.reg(1);
            dbg_fprintf(stderr, "[ABORT] Intercept SIGABRT in checkpoint mode: jump RA=0x%lx\n", (long)ra);
            m.cpu.jump(ra);
            m.set_result(0);
            return;
        }
        if (g_fork_active()) {
            dbg_fprintf(stderr, "[ABORT] SIGABRT in fork child — forcing exit(127)\n");
            // Dump syscall ring to diagnose what node was doing before abort
            dbg_fprintf(stderr, "[ABORT-child] ring_idx=%d, Last 32 syscalls:\n", riscv::g_syscall_ring_idx);
            for (int j = 0; j < 32; j++) {
                int idx = (riscv::g_syscall_ring_idx - 32 + j + 1024) % 32;
                auto& entry = riscv::g_syscall_ring[idx];
                if (entry.pc != 0 || entry.sysnum != 0)
                    dbg_fprintf(stderr, "  [%d] sys#%zu a0=0x%lx a1=0x%lx a2=0x%lx ret=%ld pc=0x%lx\n",
                            j, entry.sysnum, (long)entry.a0, (long)entry.a1, (long)entry.a2,
                            (long)entry.result, (long)entry.pc);
            }
            dbg_fprintf(stderr, "[ABORT-child] PC=0x%lx RA=0x%lx SP=0x%lx a7=%ld\n",
                    (long)m.cpu.pc(), (long)m.cpu.reg(1), (long)m.cpu.reg(2), (long)m.cpu.reg(17));
            g_fork().exit_status = 127;
            g_process_model.push_event(
                ProcessEventKind::Exit,
                g_fork().child_pid, g_fork().parent_pid,
                g_fork().child_pgid, 127);
            g_process_model.mark_exited(g_fork().child_pid, 127);
            fork_mark_child_exited(m);
            m.stop();
            return;
        }
#endif
        // Dump machine state on crash
        static bool dumped = false;
        if (!dumped) {
            dumped = true;
            dbg_fprintf(stderr, "[ABORT] tkill(SIGABRT) received. Node.js or guest app is aborting.\n");
            // Dump syscall ring buffer
            dbg_fprintf(stderr, "[ABORT] ring_idx=%d, Last 32 syscalls:\n", riscv::g_syscall_ring_idx);
            for (int j = 0; j < 32; j++) {
                int idx = (riscv::g_syscall_ring_idx - 32 + j + 1024) % 32;
                auto& e = riscv::g_syscall_ring[idx];
                dbg_fprintf(stderr, "  [%d] idx=%d sys#%zu a0=0x%lx a1=0x%lx ret=%ld pc=0x%lx\n",
                        j, idx, e.sysnum, (long)e.a0, (long)e.a1, (long)e.a2, (long)e.result, (long)e.pc);
            }
        }
        dbg_fprintf(stderr, "[ABORT] tkill(SIGABRT)! PC=0x%lx RA=0x%lx SP=0x%lx\n",
                (long)m.cpu.pc(), (long)m.cpu.reg(1), (long)m.cpu.reg(2));
        // Dump all non-zero registers
        for (int r = 0; r < 32; r++) {
            if (m.cpu.reg(r) != 0)
                dbg_fprintf(stderr, "  x%d=0x%lx", r, (long)m.cpu.reg(r));
        }
        dbg_fprintf(stderr, "\n");
        // Try to read strings from registers that might be message pointers.
        // IMPORTANT: sanitize to printable ASCII before fprintf("%s") so
        // Emscripten's UTF-8 decoding never aborts on arbitrary guest bytes.
        for (int r : {10, 11, 12, 13, 14, 15}) {
            auto addr = m.cpu.reg(r);
            if (addr > 0x10000 && addr < 0x1FFFFFFF) {
                try {
                    char buf[256] = {};
                    for (int i = 0; i < 255; i++) {
                        unsigned char ch = static_cast<unsigned char>(m.memory.template read<char>(addr + i));
                        if (ch == 0) break;
                        // Keep printable ASCII; replace everything else.
                        buf[i] = (ch >= 32 && ch <= 126) ? static_cast<char>(ch) : '?';
                    }
                    if (buf[0]) dbg_fprintf(stderr, "  x%d string: \"%s\"\n", r, buf);
                } catch (...) {}
            }
        }
        // Walk stack for return addresses
        uint64_t sp = m.cpu.reg(2);
        dbg_fprintf(stderr, "[ABORT] Stack words near SP:\n");
        for (int i = 0; i < 32; i++) {
            try {
                uint64_t val = m.memory.template read<uint64_t>(sp + i * 8);
                if (val > 0x40000 && val < 0x1FFFFFFF)
                    dbg_fprintf(stderr, "  SP+%d: 0x%lx", i*8, (long)val);
            } catch (...) { break; }
        }
        dbg_fprintf(stderr, "\n");
        // FP chain walk
        uint64_t fp = m.cpu.reg(8); // s0/fp
        dbg_fprintf(stderr, "[ABORT] FP chain:\n");
        for (int i = 0; i < 20 && fp > 0x40000 && fp < 0x1FFFFFFF; i++) {
            try {
                uint64_t saved_ra = m.memory.template read<uint64_t>(fp - 8);
                uint64_t saved_fp = m.memory.template read<uint64_t>(fp - 16);
                dbg_fprintf(stderr, "  [%d] RA=0x%lx FP=0x%lx\n", i, (long)saved_ra, (long)saved_fp);
                fp = saved_fp;
            } catch (...) { break; }
        }
    }
    m.set_result(0);
}

static void dump_guest_words_around(Machine& m, const char* label, uint64_t center) {
    if (center < 8) {
        fprintf(stderr, "[ebreak-handler] %s=0x%lx too low for word dump\n",
                label, (long)center);
        return;
    }
    fprintf(stderr, "[ebreak-handler] %s words around 0x%lx:\n",
            label, (long)center);
    const uint64_t base = center - 8;
    for (int i = 0; i < 6; i++) {
        const uint64_t addr = base + uint64_t(i) * 4;
        try {
            uint32_t word = 0;
            m.memory.memcpy_out(&word, addr, sizeof(word));
            fprintf(stderr, "  0x%lx: 0x%08x%s\n",
                    (long)addr, word, addr == center ? "  <==" : "");
        } catch (...) {
            fprintf(stderr, "  0x%lx: <unreadable>\n", (long)addr);
            break;
        }
    }
}

static void dump_guest_qwords(Machine& m, const char* label, uint64_t base, int count) {
    fprintf(stderr, "%s", label);
    for (int i = 0; i < count; i++) {
        const uint64_t addr = base + uint64_t(i) * 8;
        try {
            const uint64_t word = m.memory.template read<uint64_t>(addr);
            fprintf(stderr, " [0x%lx]=0x%lx", (unsigned long)addr, (unsigned long)word);
        } catch (...) {
            fprintf(stderr, " [0x%lx]=<fault>", (unsigned long)addr);
            break;
        }
    }
    fprintf(stderr, "\n");
}

static void dump_exec_decode_state(Machine& m, uint64_t pc) {
    auto& exec = m.cpu.current_execute_segment();
    fprintf(stderr,
            "[ebreak-handler] exec-state pc=0x%lx within=%d seg=[0x%lx,0x%lx) stale=%d translated=%d\n",
            (long)pc,
            (int)exec.is_within(pc),
            (long)exec.exec_begin(),
            (long)exec.exec_end(),
            (int)exec.is_stale(),
            (int)exec.is_binary_translated());
    if (!exec.is_within(pc)) {
        return;
    }
    try {
        const auto dec_index = pc >> riscv::DecoderCache<riscv::RISCV64>::SHIFT;
        const auto* dec = &exec.decoder_cache()[dec_index];
        uint32_t exec_word = 0;
        const auto* exec_ptr = exec.exec_data(pc);
        std::memcpy(&exec_word, exec_ptr, sizeof(exec_word));
        fprintf(stderr,
                "[ebreak-handler] exec-decode pc=0x%lx dec_instr=0x%08x dec_bc=%u block=%u icount=%u exec_word=0x%08x\n",
                (long)pc,
                dec->instr,
                unsigned(dec->get_bytecode()),
                unsigned(dec->block_bytes()),
                unsigned(dec->instruction_count()),
                exec_word);
        const uint64_t start = (pc >= 8) ? pc - 8 : 0;
        const uint64_t end = pc + 8;
        for (uint64_t addr = start; addr <= end; addr += 2) {
            const auto dec_i = addr >> riscv::DecoderCache<riscv::RISCV64>::SHIFT;
            const auto* entry = &exec.decoder_cache()[dec_i];
            uint32_t word = 0;
            if (addr + 4 <= exec.exec_end()) {
                std::memcpy(&word, exec.exec_data(addr), sizeof(word));
            }
            fprintf(stderr,
                    "[ebreak-handler] exec-near addr=0x%lx word=0x%08x bc=%u block=%u icount=%u\n",
                    (long)addr,
                    word,
                    unsigned(entry->get_bytecode()),
                    unsigned(entry->block_bytes()),
                    unsigned(entry->instruction_count()));
        }
    } catch (...) {
        fprintf(stderr, "[ebreak-handler] exec-decode pc=0x%lx unavailable\n", (long)pc);
    }
}

static bool is_real_ebreak_instruction(Machine& m, uint64_t pc) {
    try {
        uint32_t instr = 0;
        m.memory.memcpy_out(&instr, pc, sizeof(instr));
        return instr == 0x00100073U || (instr & 0xFFFFU) == 0x9002U;
    } catch (...) {
        return true;
    }
}

// Custom EBREAK handler: do NOT throw (JSPI breaks wasm exception propagation).
// Instead, handle abort recovery inline — mirrors what the catch block in
// friscy_resume() was supposed to do.
static void sys_ebreak(Machine& m) {
    const uint64_t pc = m.cpu.pc();
    const uint64_t ra = m.cpu.reg(1);
    const uint64_t sp = m.cpu.reg(2);
    const bool real_ebreak = is_real_ebreak_instruction(m, pc);
    fprintf(stderr,
            "[ebreak-handler] PC=0x%lx RA=0x%lx SP=0x%lx A0=0x%lx A1=0x%lx A7=%ld fork=%d real=%d\n",
            (long)pc, (long)ra, (long)sp,
            (long)m.cpu.reg(10), (long)m.cpu.reg(11), (long)m.cpu.reg(17),
            (int)g_fork_active(), (int)real_ebreak);
    dump_exec_decode_state(m, pc);
    dump_guest_words_around(m, "pc", pc);
    if (ra != pc) dump_guest_words_around(m, "ra", ra);
    if (!real_ebreak) {
        fprintf(stderr, "[ebreak-handler] non-EBREAK decode, evicting execute segments and retrying PC\n");
        m.memory.evict_execute_segments();
        m.cpu.jump(pc);
        return;
    }
    if (g_fork_active()) {
        fprintf(stderr, "[ebreak-handler] In fork child, forcing exit(127)\n");
        g_fork().exit_status = 127;
        g_process_model.push_event(
            ProcessEventKind::Exit,
            g_fork().child_pid, g_fork().parent_pid,
            g_fork().child_pgid, 127);
        g_process_model.mark_exited(g_fork().child_pid, 127);
        fork_mark_child_exited(m);
        m.stop();
        return;
    }
    // Jump to RA to skip past the trap (abort/assert/stack_chk_fail)
    if (ra > 0x1000) {
        m.cpu.jump(ra);
    } else {
        // RA is garbage — just stop
        fprintf(stderr, "[ebreak-handler] RA=0x%lx looks invalid, stopping\n", (long)ra);
        m.stop();
    }
}

static void sys_sched_yield(Machine& m) {
    m.set_result(0);
    // Cooperative scheduling: yield to another thread if available
    if (g_sched.count > 1) {
        int next = g_sched.next_runnable(g_sched.current);
        if (next >= 0) {
            switch_to_thread(m, next);
        }
    }
}

static void sys_rt_sigreturn(Machine& m) {
    // Signal frame cleanup — we never deliver signals, so this shouldn't
    // be called. Return success if it somehow is.
    m.set_result(0);
}

static void sys_pwritev(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto iov_addr = m.sysarg(1);
    int iovcnt = m.template sysarg<int>(2);
    int64_t offset = m.template sysarg<int64_t>(3);

    // Collect all iovec data into a single buffer, then pwrite
    std::vector<uint8_t> combined;
    for (int i = 0; i < iovcnt && i < 16; i++) {
        uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
        uint64_t len  = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
        if (len > 0) {
            size_t prev = combined.size();
            combined.resize(prev + len);
            m.memory.memcpy_out(combined.data() + prev, base, len);
        }
    }

    if (combined.empty()) { m.set_result(0); return; }
    ssize_t n = fs.pwrite(fd, combined.data(), combined.size(), offset);
    m.set_result(n);
}

// socketpair — bidirectional pipe for IPC (Next.js uses for worker communication)
static void sys_socketpair(Machine& m) {
    auto& fs = get_fs(m);
    // int domain = m.template sysarg<int>(0);
    // int type = m.template sysarg<int>(1);
    // int protocol = m.template sysarg<int>(2);
    auto sv_addr = m.sysarg(3);

    // Implement as two cross-connected pipes:
    // Writing to fd[0] → readable from fd[1], and vice versa
    auto pipe_a = std::make_shared<vfs::Entry>();
    pipe_a->type = vfs::FileType::Fifo;
    pipe_a->mode = 0600;
    pipe_a->size = 0;

    auto pipe_b = std::make_shared<vfs::Entry>();
    pipe_b->type = vfs::FileType::Fifo;
    pipe_b->mode = 0600;
    pipe_b->size = 0;

    // fd[0]: reads from pipe_a, writes to pipe_b
    // fd[1]: reads from pipe_b, writes to pipe_a
    // We approximate with two separate pipes — each end reads its own pipe
    // and writes to the other. VFS pipe semantics: write appends to content,
    // read drains from content.
    int fd0_read = fs.open_pipe(pipe_a, 0);   // read end of pipe_a
    int fd0_write = fs.open_pipe(pipe_b, 1);  // write end of pipe_b

    int fd1_read = fs.open_pipe(pipe_b, 0);   // read end of pipe_b
    int fd1_write = fs.open_pipe(pipe_a, 1);  // write end of pipe_a

    // The issue: each socket fd needs to be BOTH readable and writable,
    // but our pipe fds are one-directional. We need a duplex fd abstraction.
    // For now, use dup3 to merge: fd[0] = fd0_read, and intercept writes
    // Actually, the simplest approach: just use two regular pipes.
    // sv[0] reads from pipe_a, writes go to pipe_b
    // sv[1] reads from pipe_b, writes go to pipe_a
    // This requires the write handler to know about cross-wiring.
    //
    // SIMPLER: just create two unidirectional pipes and return them.
    // Most socketpair usage is parent writes sv[0], child reads sv[1].
    // This matches a regular pipe(). Close the unused ends.
    fs.close(fd0_write);
    fs.close(fd1_read);

    // sv[0] = write end (parent writes here)
    // sv[1] = read end (child reads here)
    int32_t sv[2] = { fd1_write, fd0_read };
    m.memory.memcpy(sv_addr, sv, sizeof(sv));
    m.set_result(0);
}

// sendmsg — scatter-gather socket send
static void sys_sendmsg(Machine& m) {
    int fd = m.template sysarg<int>(0);
    auto msghdr_addr = m.sysarg(1);
    // int flags = m.template sysarg<int>(2);

    auto& fs = get_fs(m);

    auto iov_addr = m.memory.template read<uint64_t>(msghdr_addr + 16);
    auto iovlen   = m.memory.template read<uint64_t>(msghdr_addr + 24);

    size_t total = 0;
    for (uint64_t i = 0; i < iovlen && i < 16; i++) {
        uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
        uint64_t len  = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
        if (len > 0) {
            std::vector<uint8_t> buf(len);
            m.memory.memcpy_out(buf.data(), base, len);
            ssize_t n = fs.write(fd, buf.data(), len);
            if (n < 0) {
                m.set_result(total > 0 ? (int64_t)total : n);
                return;
            }
            total += n;
            if (static_cast<size_t>(n) < len) break;
        }
    }
    m.set_result(total);
}

// Custom brk handler: after execve, libriscv's m_heap_address is stale
// (points into the old binary's address range). This handler uses
// g_exec_ctx.brk_base/brk_current which are updated by execve to point
// past the new binary's BSS segment.
static void sys_brk(Machine& m) {
    auto new_end = m.sysarg(0);
    static int brk_debug_budget = 16;
    auto materialize_brk_growth = [&m](uint64_t start, uint64_t len) {
        if (len == 0) return;
        riscv::PageAttributes rw;
        rw.read = true;
        rw.write = true;
        m.memory.set_page_attr(start, len, rw);
        // Linux guarantees freshly exposed brk pages read back as zeroes.
        // Reusing the arena without clearing here leaks stale data into musl's
        // heap metadata and quickly corrupts malloc bin invariants.
        m.memory.memset(start, 0, len);
    };

    if (!g_exec_ctx.brk_overridden) {
        // Before execve: use g_exec_ctx.brk_current so fork save/restore
        // correctly captures the BRK heap region.
        uint64_t heap_addr = m.memory.heap_address();
        constexpr uint64_t BRK_MAX = 16ULL << 20;  // 16MB
        // Initialize brk_current if not yet set
        if (g_exec_ctx.brk_current == 0 || g_exec_ctx.brk_current < heap_addr)
            g_exec_ctx.brk_current = heap_addr;

        if (new_end == 0 || new_end < heap_addr) {
            m.set_result(g_exec_ctx.brk_current);
        } else if (new_end > heap_addr + BRK_MAX) {
            m.set_result(g_exec_ctx.brk_current);
        } else {
            if (new_end > g_exec_ctx.brk_current) {
                materialize_brk_growth(g_exec_ctx.brk_current, new_end - g_exec_ctx.brk_current);
            }
            g_exec_ctx.brk_current = new_end;
            m.set_result(g_exec_ctx.brk_current);
        }
        if (brk_debug_budget-- > 0) {
            fprintf(stderr,
                    "[brk-flow] pre-exec req=0x%lx heap=0x%lx base=0x%lx cur=0x%lx result=0x%lx\n",
                    (long)new_end, (long)heap_addr, (long)g_exec_ctx.brk_base,
                    (long)g_exec_ctx.brk_current, (long)m.cpu.reg(10));
            fflush(stderr);
        }
        return;
    }

    // After execve: use our tracked brk pointers
    constexpr uint64_t BRK_MAX = 16ULL << 20;  // 16MB for brk
    if (new_end == 0 || new_end < g_exec_ctx.brk_base) {
        new_end = g_exec_ctx.brk_current;
    } else if (new_end > g_exec_ctx.brk_base + BRK_MAX) {
        new_end = g_exec_ctx.brk_base + BRK_MAX;
    }

    // Make new pages writable if extending
    if (new_end > g_exec_ctx.brk_current) {
        materialize_brk_growth(g_exec_ctx.brk_current, new_end - g_exec_ctx.brk_current);
    }

    g_exec_ctx.brk_current = new_end;
    m.set_result(new_end);
    if (brk_debug_budget-- > 0) {
        fprintf(stderr,
                "[brk-flow] post-exec req=0x%lx base=0x%lx cur=0x%lx result=0x%lx mmap=0x%lx\n",
                (long)m.sysarg(0), (long)g_exec_ctx.brk_base, (long)g_exec_ctx.brk_current,
                (long)m.cpu.reg(10), (long)m.memory.mmap_address());
        fflush(stderr);
    }
}

// getsockopt, riscv_hwprobe nr constants are in the outer nr namespace (line ~667)

static void sys_getsockopt(Machine& m) {
    m.set_result(-88);  // -ENOTSOCK
}

static void sys_riscv_hwprobe(Machine& m) {
    m.set_result(-38);  // -ENOSYS — musl handles the fallback gracefully
}

// ============================================================================
// Round 4: Node.js / Claude Code — discovered via strace of node doing
// fetch + crypto + file I/O + child_process + timers
// ============================================================================

// io_uring_enter(fd, to_submit, min_complete, flags, ...) — Node.js probes
// for io_uring support; returning ENOSYS makes it fall back to epoll.
static void sys_io_uring_enter(Machine& m) {
    m.set_result(err::NOSYS);
}

// lgetxattr / fgetxattr / listxattr / llistxattr / flistxattr
// Extended attributes — not supported in our VFS. Return ENOTSUP so callers
// (Node.js fs.stat, Python os.listxattr) use fallback paths.
static void sys_lgetxattr(Machine& m)  { m.set_result(-95); } // -ENOTSUP
static void sys_fgetxattr(Machine& m)  { m.set_result(-95); }
static void sys_getxattr(Machine& m)   { m.set_result(-95); }
static void sys_listxattr(Machine& m)  { m.set_result(-95); }
static void sys_llistxattr(Machine& m) { m.set_result(-95); }
static void sys_flistxattr(Machine& m) { m.set_result(-95); }

// statfs / fstatfs — filesystem statistics
// Return plausible values for a tmpfs-like filesystem.
struct linux_statfs64 {
    int64_t f_type;       // filesystem type (TMPFS_MAGIC = 0x01021994)
    int64_t f_bsize;      // block size
    int64_t f_blocks;     // total blocks
    int64_t f_bfree;      // free blocks
    int64_t f_bavail;     // available blocks (non-root)
    int64_t f_files;      // total inodes
    int64_t f_ffree;      // free inodes
    int64_t f_fsid[2];    // filesystem ID
    int64_t f_namelen;    // max filename length
    int64_t f_frsize;     // fragment size
    int64_t f_flags;      // mount flags
    int64_t f_spare[4];   // padding
};

static void sys_statfs(Machine& m) {
    auto path_addr = m.sysarg(0);
    auto buf_addr = m.sysarg(1);
    (void)path_addr;
    linux_statfs64 st = {};
    st.f_type = 0x01021994;  // TMPFS_MAGIC
    st.f_bsize = 4096;
    st.f_blocks = 262144;    // 1GB in 4K blocks
    st.f_bfree = 131072;     // 512MB free
    st.f_bavail = 131072;
    st.f_files = 65536;
    st.f_ffree = 32768;
    st.f_namelen = 255;
    st.f_frsize = 4096;
    m.memory.memcpy(buf_addr, &st, sizeof(st));
    m.set_result(0);
}

static void sys_fstatfs(Machine& m) {
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    (void)fd;
    linux_statfs64 st = {};
    st.f_type = 0x01021994;
    st.f_bsize = 4096;
    st.f_blocks = 262144;
    st.f_bfree = 131072;
    st.f_bavail = 131072;
    st.f_files = 65536;
    st.f_ffree = 32768;
    st.f_namelen = 255;
    st.f_frsize = 4096;
    m.memory.memcpy(buf_addr, &st, sizeof(st));
    m.set_result(0);
}

// POSIX timers: timer_create / timer_settime / timer_gettime / timer_delete
// Node.js uses these for profiling and CPU time limits. We implement them as
// PosixTimerState, g_posix_timers, g_next_timer_id defined at top of namespace handlers block

// timer_create(clockid, sevp, timerid_ptr)
static void sys_timer_create(Machine& m) {
    int clockid = m.template sysarg<int>(0);
    auto sevp_addr = m.sysarg(1);
    auto tid_addr = m.sysarg(2);

    int timer_id = g_next_timer_id++;
    PosixTimerState st = {};
    st.clockid = clockid;
    st.signo = 14; // default SIGALRM

    // Read sigevent if provided (sevp != NULL)
    if (sevp_addr != 0) {
        // struct sigevent layout on riscv64:
        // int sigev_value (8 bytes union), int sigev_signo (4), int sigev_notify (4), ...
        // We just need sigev_signo and sigev_notify
        int32_t sigev_signo = m.memory.template read<int32_t>(sevp_addr + 8);
        int32_t sigev_notify = m.memory.template read<int32_t>(sevp_addr + 12);
        if (sigev_notify == 0 /* SIGEV_SIGNAL */) {
            st.signo = sigev_signo;
        }
        // SIGEV_NONE (1) = don't deliver signal, just track
        // SIGEV_THREAD (2) = not supported, but still create the timer
    }

    g_posix_timers[timer_id] = st;
    m.memory.template write<int32_t>(tid_addr, timer_id);
    TRACE_SC("timer_create(clockid=%d) => timer_id=%d", clockid, timer_id);
    m.set_result(0);
}

// timer_settime(timerid, flags, new_value, old_value)
static void sys_timer_settime(Machine& m) {
    int timer_id = m.template sysarg<int>(0);
    int flags = m.template sysarg<int>(1);
    auto new_addr = m.sysarg(2);
    auto old_addr = m.sysarg(3);

    auto it = g_posix_timers.find(timer_id);
    if (it == g_posix_timers.end()) {
        m.set_result(err::INVAL);
        return;
    }
    auto& st = it->second;

    // Return old value
    if (old_addr != 0) {
        linux_itimerspec old_val = {};
        old_val.interval_sec = st.interval_ns / 1000000000ULL;
        old_val.interval_nsec = st.interval_ns % 1000000000ULL;
        if (st.expire_ns > 0) {
            uint64_t now = monotonic_ns();
            int64_t rem = (int64_t)(st.expire_ns - now);
            if (rem < 0) rem = 0;
            old_val.value_sec = rem / 1000000000LL;
            old_val.value_nsec = rem % 1000000000LL;
        }
        m.memory.memcpy(old_addr, &old_val, sizeof(old_val));
    }

    linux_itimerspec spec = {};
    m.memory.memcpy_out(&spec, new_addr, sizeof(spec));

    st.interval_ns = (uint64_t)spec.interval_sec * 1000000000ULL + (uint64_t)spec.interval_nsec;
    st.overruns = 0;

    uint64_t value_ns = (uint64_t)spec.value_sec * 1000000000ULL + (uint64_t)spec.value_nsec;
    if (value_ns == 0) {
        st.expire_ns = 0;  // disarm
    } else if (flags & 1 /* TIMER_ABSTIME */) {
        st.expire_ns = value_ns;
    } else {
        st.expire_ns = monotonic_ns() + value_ns;
    }

    TRACE_SC("timer_settime(id=%d, flags=%d, val=%ld.%09ld, interval=%ld.%09ld)",
             timer_id, flags, (long)spec.value_sec, (long)spec.value_nsec,
             (long)spec.interval_sec, (long)spec.interval_nsec);
    m.set_result(0);
}

// timer_gettime(timerid, curr_value)
static void sys_timer_gettime(Machine& m) {
    int timer_id = m.template sysarg<int>(0);
    auto addr = m.sysarg(1);
    auto it = g_posix_timers.find(timer_id);
    if (it == g_posix_timers.end()) {
        m.set_result(err::INVAL);
        return;
    }
    auto& st = it->second;
    linux_itimerspec val = {};
    val.interval_sec = st.interval_ns / 1000000000ULL;
    val.interval_nsec = st.interval_ns % 1000000000ULL;
    if (st.expire_ns > 0) {
        uint64_t now = monotonic_ns();
        int64_t rem = (int64_t)(st.expire_ns - now);
        if (rem < 0) rem = 0;
        val.value_sec = rem / 1000000000LL;
        val.value_nsec = rem % 1000000000LL;
    }
    m.memory.memcpy(addr, &val, sizeof(val));
    m.set_result(0);
}

// timer_getoverrun(timerid)
static void sys_timer_getoverrun(Machine& m) {
    int timer_id = m.template sysarg<int>(0);
    auto it = g_posix_timers.find(timer_id);
    if (it == g_posix_timers.end()) {
        m.set_result(err::INVAL);
        return;
    }
    m.set_result((int64_t)it->second.overruns);
}

// timer_delete(timerid)
static void sys_timer_delete(Machine& m) {
    int timer_id = m.template sysarg<int>(0);
    auto it = g_posix_timers.find(timer_id);
    if (it == g_posix_timers.end()) {
        m.set_result(err::INVAL);
        return;
    }
    g_posix_timers.erase(it);
    m.set_result(0);
}

// setfsuid / setfsgid — set filesystem UID/GID. We run as root, accept silently.
static void sys_setfsuid(Machine& m) { m.set_result(0); }
static void sys_setfsgid(Machine& m) { m.set_result(0); }

// rt_sigsuspend(sigmask, sigsetsize) — atomically replace signal mask and
// suspend until a signal is delivered. In our single-process emulation,
// signals are not asynchronously delivered, so this would block forever.
// Return -EINTR immediately (as if a signal was delivered) which is the
// only valid return value for sigsuspend.
static void sys_rt_sigsuspend(Machine& m) {
    m.set_result(-4);  // -EINTR
}

// sendmmsg(sockfd, msgvec, vlen, flags) — send multiple messages.
// Node.js DNS resolver uses this for parallel DNS queries.
static void sys_sendmmsg(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    auto msgvec_addr = m.sysarg(1);
    unsigned int vlen = m.template sysarg<unsigned int>(2);
    int flags = m.template sysarg<int>(3);

#ifndef __EMSCRIPTEN__
    // Native: use real sendmmsg if it's a real socket
    if (net_is_socket_fd && net_is_socket_fd(sockfd) && net_get_native_fd) {
        int native_fd = net_get_native_fd(sockfd);
        if (native_fd >= 0) {
            // For simplicity, send messages one at a time via sendto
            unsigned int sent = 0;
            for (unsigned int i = 0; i < vlen; i++) {
                // struct mmsghdr { struct msghdr msg_hdr; unsigned int msg_len; }
                // msghdr on riscv64: name(8) namelen(4) pad(4) iov(8) iovlen(8) control(8) controllen(8) flags(4)
                uint64_t mmsg_addr = msgvec_addr + i * 64; // sizeof(mmsghdr) on riscv64
                auto iov_addr = m.memory.template read<uint64_t>(mmsg_addr + 16);
                auto iovlen = m.memory.template read<uint64_t>(mmsg_addr + 24);
                auto name_addr = m.memory.template read<uint64_t>(mmsg_addr);
                auto namelen = m.memory.template read<uint32_t>(mmsg_addr + 8);

                // Gather iovec data
                std::vector<uint8_t> buf;
                for (uint64_t j = 0; j < iovlen && j < 16; j++) {
                    auto base = m.memory.template read<uint64_t>(iov_addr + j * 16);
                    auto len = m.memory.template read<uint64_t>(iov_addr + j * 16 + 8);
                    if (len > 65536) len = 65536;
                    size_t off = buf.size();
                    buf.resize(off + len);
                    m.memory.memcpy_out(buf.data() + off, base, len);
                }

                struct sockaddr_storage sa = {};
                socklen_t sa_len = 0;
                if (name_addr != 0 && namelen > 0 && namelen <= sizeof(sa)) {
                    m.memory.memcpy_out(&sa, name_addr, namelen);
                    sa_len = namelen;
                }

                ssize_t n = ::sendto(native_fd, buf.data(), buf.size(), flags,
                                     sa_len > 0 ? (struct sockaddr*)&sa : nullptr, sa_len);
                if (n < 0) {
                    if (sent == 0) { m.set_result(-errno); return; }
                    break;
                }
                // Write msg_len field
                m.memory.template write<uint32_t>(mmsg_addr + 56, (uint32_t)n);
                sent++;
            }
            m.set_result(sent);
            return;
        }
    }
#endif
    // Emscripten / no native socket: not supported
    m.set_result(err::NOSYS);
}

// Syscall 500: Host fetch hypercall
// Guest calls ecall with a7=500, a0=req_ptr, a1=req_len, a2=resp_buf, a3=resp_cap
// First invocation: store request, stop machine (Worker performs fetch)
// Re-entry after resume: copy response to guest buffer, return bytes_written in a0
static void sys_host_fetch(Machine& m) {
    if (g_host_fetch_response_ready) {
        // Re-entry after Worker completed the fetch
        auto resp_buf = m.sysarg(2);
        auto resp_cap = m.sysarg(3);
        size_t to_copy = std::min((size_t)resp_cap, g_host_fetch_response.size());
        if (to_copy > 0) {
            m.memory.memcpy(resp_buf,
                reinterpret_cast<const uint8_t*>(g_host_fetch_response.data()),
                to_copy);
        }
        m.set_result(to_copy);
        g_host_fetch_response_ready = false;
        g_host_fetch_response.clear();
        g_host_fetch_request.clear();
        return;
    }
    // First call: store request, stop machine for Worker to handle
    auto req_addr = m.sysarg(0);
    auto req_len = m.sysarg(1);
    std::vector<uint8_t> buf(req_len);
    m.memory.memcpy_out(buf.data(), req_addr, req_len);
    g_host_fetch_request.assign(reinterpret_cast<const char*>(buf.data()), req_len);
    g_host_fetch_response.clear();
    g_waiting_for_host_fetch = true;
    m.cpu.increment_pc(-4);  // Rewind to ecall for re-entry
    m.stop();
}

}  // namespace handlers

// Install all syscall handlers
inline void install_syscalls(Machine& machine, vfs::VirtualFS& fs) {
    // Create and store context
    static SyscallContext ctx(&fs);
    machine.set_userdata(&ctx);

    // Install handlers
    using namespace handlers;
    machine.install_syscall_handler(nr::exit, sys_exit);
    machine.install_syscall_handler(nr::exit_group, sys_exit_group);
    machine.install_syscall_handler(nr::openat, sys_openat);
    machine.install_syscall_handler(nr::openat2, sys_openat2);
    machine.install_syscall_handler(nr::close, sys_close);
    machine.install_syscall_handler(nr::read, sys_read);
    machine.install_syscall_handler(nr::write, sys_write);
    machine.install_syscall_handler(nr::writev, sys_writev);
    machine.install_syscall_handler(nr::lseek, sys_lseek);
    machine.install_syscall_handler(nr::getdents64, sys_getdents64);
    machine.install_syscall_handler(nr::newfstatat, sys_newfstatat);
    machine.install_syscall_handler(nr::fstat, sys_fstat);
    machine.install_syscall_handler(nr::readlinkat, sys_readlinkat);
    machine.install_syscall_handler(nr::getcwd, sys_getcwd);
    machine.install_syscall_handler(nr::chdir, sys_chdir);
    machine.install_syscall_handler(nr::faccessat, sys_faccessat);
    machine.install_syscall_handler(nr::getpid, sys_getpid);
    machine.install_syscall_handler(nr::getppid, sys_getppid);
    machine.install_syscall_handler(nr::gettid, sys_gettid);
    machine.install_syscall_handler(nr::getuid, sys_getuid);
    machine.install_syscall_handler(nr::geteuid, sys_geteuid);
    machine.install_syscall_handler(nr::getgid, sys_getgid);
    machine.install_syscall_handler(nr::getegid, sys_getegid);
    machine.install_syscall_handler(nr::set_tid_address, sys_set_tid_address);
    machine.install_syscall_handler(nr::set_robust_list, sys_set_robust_list);
    machine.install_syscall_handler(nr::clock_gettime, sys_clock_gettime);
    machine.install_syscall_handler(nr::getrandom, sys_getrandom);
    machine.install_syscall_handler(nr::clone, sys_clone);
    machine.install_syscall_handler(nr::clone3, sys_clone3);
    machine.install_syscall_handler(nr::execve, sys_execve);
    machine.install_syscall_handler(nr::wait4, sys_wait4);
    // brk: override to handle post-execve memory layout changes
    machine.install_syscall_handler(nr::brk, sys_brk);
    // mmap: override to handle file-backed mappings via VFS
    // (libriscv's handler uses machine.fds() which doesn't know our VFS fds)
    handlers::libriscv_mmap_handler = Machine::syscall_handlers[nr::mmap];
    machine.install_syscall_handler(nr::mmap, sys_mmap);
    // mprotect: override to no-op during child execution (prevent RELRO
    // from poisoning decoder cache / page attrs during fork cycle)
    machine.install_syscall_handler(nr::mprotect, sys_mprotect);
    machine.install_syscall_handler(nr::munmap, sys_munmap);
    machine.install_syscall_handler(nr::sigaction, sys_sigaction);
    machine.install_syscall_handler(nr::sigprocmask, sys_sigprocmask);
    machine.install_syscall_handler(nr::prlimit64, sys_prlimit64);
    machine.install_syscall_handler(nr::getrlimit, sys_getrlimit);
    machine.install_syscall_handler(nr::rseq, sys_rseq);
    machine.install_syscall_handler(nr::ioctl, sys_ioctl);
    machine.install_syscall_handler(nr::fcntl, sys_fcntl);
    machine.install_syscall_handler(nr::dup, sys_dup);
    machine.install_syscall_handler(nr::dup3, sys_dup3);
    machine.install_syscall_handler(nr::pipe2, sys_pipe2);
    machine.install_syscall_handler(nr::readv, sys_readv);
    machine.install_syscall_handler(nr::pselect6, sys_pselect6);
    machine.install_syscall_handler(nr::ppoll, sys_ppoll);
    machine.install_syscall_handler(nr::sendfile, sys_sendfile);
    machine.install_syscall_handler(nr::pread64, sys_pread64);
    machine.install_syscall_handler(nr::pwrite64, sys_pwrite64);
    machine.install_syscall_handler(nr::ftruncate, sys_ftruncate);
    machine.install_syscall_handler(nr::mkdirat, sys_mkdirat);
    machine.install_syscall_handler(nr::unlinkat, sys_unlinkat);
    machine.install_syscall_handler(nr::symlinkat, sys_symlinkat);
    machine.install_syscall_handler(nr::linkat, sys_linkat);
    machine.install_syscall_handler(nr::renameat, sys_renameat);
    machine.install_syscall_handler(nr::renameat2, sys_renameat2);
    machine.install_syscall_handler(nr::sysinfo, sys_sysinfo);

    // epoll — libuv event loop
    machine.install_syscall_handler(nr::epoll_create1, sys_epoll_create1);
    machine.install_syscall_handler(nr::epoll_ctl, sys_epoll_ctl);
    machine.install_syscall_handler(nr::epoll_pwait, sys_epoll_pwait);

    // futex — thread synchronization
    machine.install_syscall_handler(nr::futex, sys_futex);

    // statx — extended stat
    machine.install_syscall_handler(nr::statx, sys_statx);

    // uname — system identification
    machine.install_syscall_handler(nr::uname, sys_uname);

    // nanosleep
    machine.install_syscall_handler(nr::nanosleep, sys_nanosleep);

    // Stubs
    machine.install_syscall_handler(nr::madvise, sys_madvise);
    machine.install_syscall_handler(nr::prctl, sys_prctl);
    machine.install_syscall_handler(nr::mremap, sys_mremap);
    machine.install_syscall_handler(nr::eventfd2, sys_eventfd2);
    machine.install_syscall_handler(nr::timerfd_create, sys_timerfd_create);
    machine.install_syscall_handler(nr::timerfd_settime, sys_timerfd_settime);
    machine.install_syscall_handler(nr::timerfd_gettime, sys_timerfd_gettime);
    machine.install_syscall_handler(nr::io_uring_setup, sys_io_uring_setup);
    machine.install_syscall_handler(nr::capget, sys_capget);
    machine.install_syscall_handler(nr::sched_getscheduler, sys_sched_getscheduler);
    machine.install_syscall_handler(nr::sched_getparam, sys_sched_getparam);
    machine.install_syscall_handler(nr::sched_getaffinity, sys_sched_getaffinity);

    // Round 2: discovered from strace of curl/git/python/vim/bash/ssh
    machine.install_syscall_handler(nr::umask, sys_umask);
    machine.install_syscall_handler(nr::setpgid, sys_setpgid);
    machine.install_syscall_handler(nr::getpgid, sys_getpgid);
    machine.install_syscall_handler(nr::setsid, sys_setsid);
    machine.install_syscall_handler(nr::getresuid, sys_getresuid);
    machine.install_syscall_handler(nr::getresgid, sys_getresgid);
    machine.install_syscall_handler(nr::sigaltstack, sys_sigaltstack);
    machine.install_syscall_handler(nr::clock_getres, sys_clock_getres);
    machine.install_syscall_handler(nr::membarrier, sys_membarrier);
    machine.install_syscall_handler(nr::faccessat2, sys_faccessat2);
    machine.install_syscall_handler(nr::recvmsg, sys_recvmsg);

    // Round 3: Go echo + Next.js build
    machine.install_syscall_handler(nr::flock, sys_flock);
    machine.install_syscall_handler(nr::fsync, sys_fsync);
    machine.install_syscall_handler(nr::fchmod, sys_fchmod);
    machine.install_syscall_handler(nr::fchmodat, sys_fchmodat);
    machine.install_syscall_handler(nr::fchownat, sys_fchownat);
    machine.install_syscall_handler(nr::getgroups, sys_getgroups);
    machine.install_syscall_handler(nr::kill, sys_kill);
    machine.install_syscall_handler(nr::tkill, sys_tkill);
    machine.install_syscall_handler(nr::tgkill, sys_tkill);  // same as tkill
    machine.install_syscall_handler(nr::sched_yield, sys_sched_yield);
    machine.install_syscall_handler(nr::close_range, sys_close_range);
    machine.install_syscall_handler(nr::rt_sigreturn, sys_rt_sigreturn);
    machine.install_syscall_handler(nr::pwritev, sys_pwritev);
    machine.install_syscall_handler(nr::socketpair, sys_socketpair);
    machine.install_syscall_handler(nr::sendmsg, sys_sendmsg);

    // Round 4: Node.js startup (from QEMU strace)
    // getsockname (204) is handled by network.hpp — installed via install_network_syscalls
    machine.install_syscall_handler(nr::getsockopt, sys_getsockopt);
    machine.install_syscall_handler(nr::riscv_hwprobe, sys_riscv_hwprobe);

    // Round 4: Node.js / Claude Code syscalls
    machine.install_syscall_handler(nr::io_uring_enter, sys_io_uring_enter);
    machine.install_syscall_handler(nr::getxattr, sys_getxattr);
    machine.install_syscall_handler(nr::lgetxattr, sys_lgetxattr);
    machine.install_syscall_handler(nr::fgetxattr, sys_fgetxattr);
    machine.install_syscall_handler(nr::listxattr, sys_listxattr);
    machine.install_syscall_handler(nr::llistxattr, sys_llistxattr);
    machine.install_syscall_handler(nr::flistxattr, sys_flistxattr);
    machine.install_syscall_handler(nr::statfs, sys_statfs);
    machine.install_syscall_handler(nr::fstatfs, sys_fstatfs);
    machine.install_syscall_handler(nr::timer_create, sys_timer_create);
    machine.install_syscall_handler(nr::timer_settime, sys_timer_settime);
    machine.install_syscall_handler(nr::timer_gettime, sys_timer_gettime);
    machine.install_syscall_handler(nr::timer_getoverrun, sys_timer_getoverrun);
    machine.install_syscall_handler(nr::timer_delete, sys_timer_delete);
    machine.install_syscall_handler(nr::rt_sigsuspend, sys_rt_sigsuspend);
    machine.install_syscall_handler(nr::sendmmsg, sys_sendmmsg);
    machine.install_syscall_handler(nr::setfsuid, sys_setfsuid);
    machine.install_syscall_handler(nr::setfsgid, sys_setfsgid);

    // Custom hypercalls (500+)
    machine.install_syscall_handler(500, sys_host_fetch);

    // EBREAK: override libriscv's default handler which throws (broken under JSPI).
    // Must be installed LAST to override the libriscv linux handler.
    machine.install_syscall_handler(riscv::SYSCALL_EBREAK, sys_ebreak);
}

}  // namespace syscalls
