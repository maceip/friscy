// checkpoint.hpp - Linear memory transplant: save/load emulator state
//
// Saves the entire emulator state (arena, registers, threads) at the
// "idle waiting for stdin" point. On restore, skip all boot overhead.
//
// Binary format:
//   Header: magic "FRISCYCK" (8B) + version (4B) + flags (4B)
//   CPU:    PC (8B) + FCSR (4B) + pad (4B) + int regs x0-x31 (256B) + FP regs f0-f31 (256B)
//   Memory: mmap_address (8B) + brk_base (8B) + brk_current (8B)
//   Exec:   exec_base..original_stack_top + heap_start + heap_size + brk_overridden + dynamic (112B)
//   Sched:  g_sched raw bytes + g_next_pid (4B) + g_next_epoll_fd (4B)
//   Arena:  sparse chunks [guest_addr:u64, len:u64, data...]
//           terminated by sentinel [addr=0xFFFFFFFFFFFFFFFF, len=0]

#pragma once

#include <libriscv/machine.hpp>
#include <cstdio>
#include <cstring>
#include <vector>
#include <string>

namespace checkpoint {

using Machine = riscv::Machine<riscv::RISCV64>;

static constexpr char MAGIC[8] = {'F','R','I','S','C','Y','C','K'};
static constexpr uint32_t VERSION = 2;
static constexpr uint64_t CHUNK_SIZE = 65536;  // 64KB sparse scan
static constexpr uint64_t SENTINEL_ADDR = 0xFFFFFFFFFFFFFFFFULL;

// ============================================================================
// Helper: write raw bytes to a vector
// ============================================================================
static inline void emit(std::vector<uint8_t>& out, const void* data, size_t len) {
    auto* p = reinterpret_cast<const uint8_t*>(data);
    out.insert(out.end(), p, p + len);
}

template<typename T>
static inline void emit_val(std::vector<uint8_t>& out, T val) {
    emit(out, &val, sizeof(val));
}

// ============================================================================
// Helper: read raw bytes from a pointer, advancing it
// ============================================================================
struct Reader {
    const uint8_t* p;
    const uint8_t* end;

    template<typename T>
    T read() {
        if (p + sizeof(T) > end) throw std::runtime_error("checkpoint: unexpected EOF");
        T val;
        std::memcpy(&val, p, sizeof(T));
        p += sizeof(T);
        return val;
    }

    void read_into(void* dst, size_t len) {
        if (p + len > end) throw std::runtime_error("checkpoint: unexpected EOF");
        std::memcpy(dst, p, len);
        p += len;
    }

    size_t remaining() const { return end - p; }
};

// ============================================================================
// save_checkpoint — serialize machine state to binary blob
// ============================================================================
inline std::vector<uint8_t> save_checkpoint(Machine& machine) {
    std::vector<uint8_t> out;
    out.reserve(128 * 1024 * 1024);  // 128MB initial reserve

    // --- Header ---
    emit(out, MAGIC, 8);
    emit_val<uint32_t>(out, VERSION);
    emit_val<uint32_t>(out, 0);  // flags (reserved)

    // --- CPU state ---
    uint64_t pc = machine.cpu.pc();
    emit_val(out, pc);

    uint32_t fcsr = machine.cpu.registers().fcsr().whole;
    emit_val(out, fcsr);
    emit_val<uint32_t>(out, 0);  // pad to 8-byte align

    // Integer registers x0-x31
    for (int i = 0; i < 32; i++) {
        uint64_t val = machine.cpu.reg(i);
        emit_val(out, val);
    }

    // FP registers f0-f31 (as raw i64)
    for (int i = 0; i < 32; i++) {
        uint64_t val = machine.cpu.registers().getfl(i).i64;
        emit_val(out, val);
    }

    // --- Memory management state ---
    uint64_t mmap_addr = machine.memory.mmap_address();
    emit_val(out, mmap_addr);

    // Import ExecContext fields we need
    // (These are declared in syscalls.hpp as inline globals)
    extern uint64_t get_brk_base();
    extern uint64_t get_brk_current();

    // We access g_exec_ctx directly via the syscalls namespace
    // Forward declarations handled by including syscalls.hpp before this header

    emit_val(out, syscalls::g_exec_ctx.brk_base);
    emit_val(out, syscalls::g_exec_ctx.brk_current);

    // --- Exec context (addresses and flags) ---
    emit_val(out, syscalls::g_exec_ctx.exec_base);
    emit_val(out, syscalls::g_exec_ctx.exec_rw_start);
    emit_val(out, syscalls::g_exec_ctx.exec_rw_end);
    emit_val(out, syscalls::g_exec_ctx.interp_base);
    emit_val(out, syscalls::g_exec_ctx.interp_rw_start);
    emit_val(out, syscalls::g_exec_ctx.interp_rw_end);
    emit_val(out, syscalls::g_exec_ctx.interp_entry);
    emit_val(out, syscalls::g_exec_ctx.original_stack_top);
    emit_val(out, syscalls::g_exec_ctx.heap_start);
    emit_val(out, syscalls::g_exec_ctx.heap_size);
    emit_val<uint8_t>(out, syscalls::g_exec_ctx.brk_overridden ? 1 : 0);
    emit_val<uint8_t>(out, syscalls::g_exec_ctx.dynamic ? 1 : 0);
    // Pad to 8-byte boundary (2 bytes used, need 6 more)
    for (int i = 0; i < 6; i++) emit_val<uint8_t>(out, 0);

    // --- Thread scheduler ---
    // Write g_sched as raw bytes (ThreadScheduler is POD-like)
    emit(out, &syscalls::g_sched, sizeof(syscalls::g_sched));
    emit_val<int32_t>(out, static_cast<int32_t>(syscalls::g_next_pid));
    emit_val<int32_t>(out, syscalls::g_next_epoll_fd);

    // --- Epoll instances ---
    emit_val<uint32_t>(out, static_cast<uint32_t>(syscalls::g_epoll_instances.size()));
    for (const auto& [epfd, inst] : syscalls::g_epoll_instances) {
        emit_val<int32_t>(out, epfd);
        emit_val<uint32_t>(out, static_cast<uint32_t>(inst.interests.size()));
        for (const auto& [fd, interest] : inst.interests) {
            emit_val<int32_t>(out, fd);
            emit_val<uint32_t>(out, interest.events);
            emit_val<uint64_t>(out, interest.data);
        }
    }

    // --- Eventfd counters ---
    emit_val<uint32_t>(out, static_cast<uint32_t>(syscalls::g_eventfd_counters.size()));
    for (const auto& [fd, counter] : syscalls::g_eventfd_counters) {
        emit_val<int32_t>(out, fd);
        emit_val<uint64_t>(out, counter);
    }

    // --- Executable page list ---
    // Save page numbers that have exec permission (for dynamic libraries loaded via mmap+mprotect)
    std::vector<uint64_t> exec_pages;
    for (const auto& [pageno, page] : machine.memory.pages()) {
        if (page.attr.exec) {
            exec_pages.push_back(static_cast<uint64_t>(pageno));
        }
    }
    emit_val<uint64_t>(out, static_cast<uint64_t>(exec_pages.size()));
    for (auto pn : exec_pages) {
        emit_val<uint64_t>(out, pn);
    }
    fprintf(stderr, "[checkpoint] Saved %zu exec pages\n", exec_pages.size());

    // --- Sparse arena data ---
    auto* arena = reinterpret_cast<const uint8_t*>(machine.memory.memory_arena_ptr());
    size_t arena_size = machine.memory.memory_arena_size();

    size_t chunks_written = 0;
    size_t total_data = 0;

    for (size_t offset = 0; offset + CHUNK_SIZE <= arena_size; offset += CHUNK_SIZE) {
        // Check if chunk is all-zero
        const uint64_t* qwords = reinterpret_cast<const uint64_t*>(arena + offset);
        bool all_zero = true;
        for (size_t q = 0; q < CHUNK_SIZE / 8; q++) {
            if (qwords[q] != 0) {
                all_zero = false;
                break;
            }
        }
        if (all_zero) continue;

        // Non-zero chunk: write [addr, len, data]
        uint64_t guest_addr = static_cast<uint64_t>(offset);
        uint64_t len = CHUNK_SIZE;
        emit_val(out, guest_addr);
        emit_val(out, len);
        emit(out, arena + offset, CHUNK_SIZE);
        chunks_written++;
        total_data += CHUNK_SIZE;
    }

    // Handle trailing partial chunk
    size_t tail_offset = (arena_size / CHUNK_SIZE) * CHUNK_SIZE;
    if (tail_offset < arena_size) {
        size_t tail_len = arena_size - tail_offset;
        const uint8_t* tail = arena + tail_offset;
        bool all_zero = true;
        for (size_t i = 0; i < tail_len; i++) {
            if (tail[i] != 0) { all_zero = false; break; }
        }
        if (!all_zero) {
            emit_val<uint64_t>(out, static_cast<uint64_t>(tail_offset));
            emit_val<uint64_t>(out, static_cast<uint64_t>(tail_len));
            emit(out, tail, tail_len);
            chunks_written++;
            total_data += tail_len;
        }
    }

    // Sentinel: end of arena data
    emit_val<uint64_t>(out, SENTINEL_ADDR);
    emit_val<uint64_t>(out, 0);

    fprintf(stderr, "[checkpoint] Saved: %zu non-zero chunks, %zu bytes arena data, %zu bytes total\n",
            chunks_written, total_data, out.size());

    return out;
}

// ============================================================================
// save_checkpoint to file (convenience wrapper)
// ============================================================================
inline void save_checkpoint_file(Machine& machine, const std::string& path) {
    auto data = save_checkpoint(machine);
    FILE* f = fopen(path.c_str(), "wb");
    if (!f) throw std::runtime_error("checkpoint: cannot open " + path + " for writing");
    size_t written = fwrite(data.data(), 1, data.size(), f);
    fclose(f);
    if (written != data.size()) throw std::runtime_error("checkpoint: write failed");
    fprintf(stderr, "[checkpoint] Written %zu bytes to %s\n", data.size(), path.c_str());
}

// ============================================================================
// load_checkpoint — restore machine state from binary blob
// ============================================================================
inline void load_checkpoint(Machine& machine, const uint8_t* data, size_t size) {
    Reader r{data, data + size};

    // --- Header ---
    char magic[8];
    r.read_into(magic, 8);
    if (std::memcmp(magic, MAGIC, 8) != 0)
        throw std::runtime_error("checkpoint: bad magic");

    uint32_t version = r.read<uint32_t>();
    if (version != VERSION)
        throw std::runtime_error("checkpoint: unsupported version " + std::to_string(version));

    /*uint32_t flags =*/ r.read<uint32_t>();  // reserved

    // --- CPU state ---
    uint64_t pc = r.read<uint64_t>();
    uint32_t fcsr = r.read<uint32_t>();
    /*uint32_t pad =*/ r.read<uint32_t>();

    // Integer registers
    uint64_t int_regs[32];
    for (int i = 0; i < 32; i++)
        int_regs[i] = r.read<uint64_t>();

    // FP registers
    uint64_t fp_regs[32];
    for (int i = 0; i < 32; i++)
        fp_regs[i] = r.read<uint64_t>();

    // --- Memory management ---
    uint64_t mmap_addr = r.read<uint64_t>();
    uint64_t brk_base = r.read<uint64_t>();
    uint64_t brk_current = r.read<uint64_t>();

    // --- Exec context ---
    uint64_t exec_base = r.read<uint64_t>();
    uint64_t exec_rw_start = r.read<uint64_t>();
    uint64_t exec_rw_end = r.read<uint64_t>();
    uint64_t interp_base = r.read<uint64_t>();
    uint64_t interp_rw_start = r.read<uint64_t>();
    uint64_t interp_rw_end = r.read<uint64_t>();
    uint64_t interp_entry = r.read<uint64_t>();
    uint64_t original_stack_top = r.read<uint64_t>();
    uint64_t heap_start = r.read<uint64_t>();
    uint64_t heap_size = r.read<uint64_t>();
    uint8_t brk_overridden = r.read<uint8_t>();
    uint8_t dynamic = r.read<uint8_t>();
    // Skip padding
    for (int i = 0; i < 6; i++) r.read<uint8_t>();

    // --- Thread scheduler ---
    r.read_into(&syscalls::g_sched, sizeof(syscalls::g_sched));
    syscalls::g_next_pid = static_cast<pid_t>(r.read<int32_t>());
    syscalls::g_next_epoll_fd = r.read<int32_t>();

    // --- Epoll instances ---
    {
        uint32_t num_epoll = r.read<uint32_t>();
        syscalls::g_epoll_instances.clear();
        for (uint32_t i = 0; i < num_epoll; i++) {
            int32_t epfd = r.read<int32_t>();
            uint32_t num_interests = r.read<uint32_t>();
            auto& inst = syscalls::g_epoll_instances[epfd];
            for (uint32_t j = 0; j < num_interests; j++) {
                int32_t fd = r.read<int32_t>();
                uint32_t events = r.read<uint32_t>();
                uint64_t data = r.read<uint64_t>();
                inst.interests[fd] = {events, data};
            }
        }
        fprintf(stderr, "[checkpoint] Restored %u epoll instances\n", num_epoll);
    }

    // --- Eventfd counters ---
    {
        uint32_t num_eventfd = r.read<uint32_t>();
        syscalls::g_eventfd_counters.clear();
        for (uint32_t i = 0; i < num_eventfd; i++) {
            int32_t fd = r.read<int32_t>();
            uint64_t counter = r.read<uint64_t>();
            syscalls::g_eventfd_counters[fd] = counter;
        }
        fprintf(stderr, "[checkpoint] Restored %u eventfd counters\n", num_eventfd);
    }

    // --- Executable page list ---
    uint64_t num_exec_pages = r.read<uint64_t>();
    std::vector<uint64_t> exec_pages(num_exec_pages);
    for (uint64_t i = 0; i < num_exec_pages; i++) {
        exec_pages[i] = r.read<uint64_t>();
    }

    // --- Invalidate decoder cache before writing arena ---
    machine.memory.evict_execute_segments();

    // --- Sparse arena data ---
    auto* arena = reinterpret_cast<uint8_t*>(machine.memory.memory_arena_ptr());
    size_t arena_size = machine.memory.memory_arena_size();

    // Zero the entire arena first (checkpoint only stores non-zero chunks)
    std::memset(arena, 0, arena_size);

    size_t chunks_read = 0;
    size_t total_data = 0;

    while (r.remaining() >= 16) {
        uint64_t guest_addr = r.read<uint64_t>();
        uint64_t len = r.read<uint64_t>();

        if (guest_addr == SENTINEL_ADDR) break;  // end of arena data

        if (guest_addr + len > arena_size) {
            fprintf(stderr, "[checkpoint] WARNING: chunk at 0x%lx+%lu exceeds arena size %zu, skipping\n",
                    (unsigned long)guest_addr, (unsigned long)len, arena_size);
            // Skip this chunk's data
            if (r.remaining() >= len) r.p += len;
            continue;
        }

        r.read_into(arena + guest_addr, len);
        chunks_read++;
        total_data += len;
    }

    // --- Restore exec page permissions ---
    riscv::PageAttributes exec_attr;
    exec_attr.read = true;
    exec_attr.write = false;
    exec_attr.exec = true;
    for (auto pageno : exec_pages) {
        machine.memory.set_pageno_attr(pageno, exec_attr);
    }
    fprintf(stderr, "[checkpoint] Restored %zu exec pages\n", exec_pages.size());

    // --- Restore CPU state ---
    for (int i = 0; i < 32; i++)
        machine.cpu.reg(i) = int_regs[i];
    for (int i = 0; i < 32; i++)
        machine.cpu.registers().getfl(i).i64 = fp_regs[i];
    machine.cpu.registers().fcsr().whole = fcsr;
    machine.cpu.jump(pc);

    // --- Restore memory management ---
    machine.memory.mmap_address() = mmap_addr;

    // --- Restore exec context ---
    syscalls::g_exec_ctx.exec_base = exec_base;
    syscalls::g_exec_ctx.exec_rw_start = exec_rw_start;
    syscalls::g_exec_ctx.exec_rw_end = exec_rw_end;
    syscalls::g_exec_ctx.interp_base = interp_base;
    syscalls::g_exec_ctx.interp_rw_start = interp_rw_start;
    syscalls::g_exec_ctx.interp_rw_end = interp_rw_end;
    syscalls::g_exec_ctx.interp_entry = interp_entry;
    syscalls::g_exec_ctx.original_stack_top = original_stack_top;
    syscalls::g_exec_ctx.heap_start = heap_start;
    syscalls::g_exec_ctx.heap_size = heap_size;
    syscalls::g_exec_ctx.brk_base = brk_base;
    syscalls::g_exec_ctx.brk_current = brk_current;
    syscalls::g_exec_ctx.brk_overridden = brk_overridden != 0;
    syscalls::g_exec_ctx.dynamic = dynamic != 0;

    // --- Set stdin-wait flag so the main loop knows we're restored ---
    syscalls::g_waiting_for_stdin = true;

    fprintf(stderr, "[checkpoint] Loaded: %zu chunks, %zu bytes arena data, pc=0x%lx\n",
            chunks_read, total_data, (unsigned long)pc);
    fprintf(stderr, "[checkpoint] mmap=0x%lx brk=0x%lx..0x%lx sched.count=%d\n",
            (unsigned long)mmap_addr, (unsigned long)brk_base, (unsigned long)brk_current,
            syscalls::g_sched.count);
}

// ============================================================================
// load_checkpoint from file (convenience wrapper)
// ============================================================================
inline void load_checkpoint_file(Machine& machine, const std::string& path) {
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) throw std::runtime_error("checkpoint: cannot open " + path);
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::vector<uint8_t> data(sz);
    size_t rd = fread(data.data(), 1, sz, f);
    fclose(f);
    if (static_cast<long>(rd) != sz) throw std::runtime_error("checkpoint: read failed");
    fprintf(stderr, "[checkpoint] Read %ld bytes from %s\n", sz, path.c_str());
    load_checkpoint(machine, data.data(), data.size());
}

}  // namespace checkpoint
