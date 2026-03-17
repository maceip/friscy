// Platform overrides for Emscripten/Wasm target
//
// V8's platform-posix.cc uses sysconf(_SC_PAGESIZE) which returns 65536
// on Emscripten (Wasm page size = 64KB). But Emscripten's mmap emulation
// uses malloc() internally, returning addresses aligned to only 8-16 bytes.
// This causes: Check failed: address % CommitPageSize() == 0
//
// Fix: Override Emscripten's mmap/munmap/mprotect with versions that
// return 64KB-aligned addresses using aligned_alloc.
//
// This file is compiled as a stub and linked AFTER the V8 .o files.
// Because Emscripten's mmap/munmap/mprotect are weak symbols in its
// libc, our strong definitions here win at link time.

#ifdef __EMSCRIPTEN__

#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <cerrno>
#include <emscripten.h>

// Wasm page size — what sysconf(_SC_PAGESIZE) returns on Emscripten
static constexpr size_t WASM_PAGE_SIZE = 65536;

// We override Emscripten's mmap to return page-aligned memory.
// V8 uses mmap for:
//   - Heap cage reservation (large PROT_NONE regions)
//   - Code range allocation
//   - Stack guard pages
//   - General page-aligned allocations
//
// In Emscripten, there's no real virtual memory — everything is backed
// by the linear memory. PROT_NONE "reservations" are just bookkeeping.

extern "C" {

// Track allocations so munmap can free the right pointer.
// Simple approach: over-allocate by one page, store the real malloc
// pointer just before the aligned region.
//
// Layout:  [padding] [real_ptr stored here] [aligned region ...]
//          ^                                ^
//          malloc'd                         returned to caller

void* __wrap_mmap(void* addr, size_t length, int prot, int flags,
                  int fd, long offset) {
    (void)prot;   // No real memory protection in Wasm linear memory
    (void)flags;
    (void)fd;
    (void)offset;

    if (length == 0) {
        errno = EINVAL;
        return (void*)-1;  // MAP_FAILED
    }

    // If addr is specified (MAP_FIXED), we can't guarantee it.
    // V8 uses MAP_FIXED for commit-over-reservation patterns.
    // In Emscripten all memory is always "committed" so just return addr.
    if (addr != nullptr && (flags & 0x10 /* MAP_FIXED */)) {
        // Memory is already accessible in Wasm linear memory.
        // Just zero it (MAP_ANONYMOUS behavior).
        if (flags & 0x20 /* MAP_ANONYMOUS */) {
            memset(addr, 0, length);
        }
        return addr;
    }

    // Allocate with alignment. Use aligned_alloc which is C11 standard.
    // Round up length to page boundary.
    size_t aligned_len = (length + WASM_PAGE_SIZE - 1) & ~(WASM_PAGE_SIZE - 1);

    // We need to store the size for munmap. Allocate extra space for header.
    // Use a simple scheme: allocate (aligned_len + WASM_PAGE_SIZE) via malloc,
    // align up, store metadata before the aligned pointer.
    size_t total = aligned_len + WASM_PAGE_SIZE;
    void* raw = malloc(total);
    if (!raw) {
        errno = ENOMEM;
        return (void*)-1;
    }

    // Align up to WASM_PAGE_SIZE
    uintptr_t raw_addr = (uintptr_t)raw;
    uintptr_t aligned_addr = (raw_addr + WASM_PAGE_SIZE - 1) & ~(WASM_PAGE_SIZE - 1);
    // Ensure we have room for the metadata pointer before aligned_addr
    if (aligned_addr == raw_addr) {
        aligned_addr += WASM_PAGE_SIZE;
    }

    // Store the raw pointer just before the aligned region
    ((void**)aligned_addr)[-1] = raw;
    // Store the allocated size at [-2] for potential use
    ((size_t*)aligned_addr)[-2] = aligned_len;

    // Zero-fill (MAP_ANONYMOUS behavior)
    memset((void*)aligned_addr, 0, aligned_len);

    return (void*)aligned_addr;
}

int __wrap_munmap(void* addr, size_t length) {
    (void)length;

    if (addr == nullptr || addr == (void*)-1) {
        return -1;
    }

    // Check if this looks like one of our aligned allocations.
    // Our allocations are always page-aligned and have the raw pointer
    // stored at [-1].
    uintptr_t a = (uintptr_t)addr;
    if ((a & (WASM_PAGE_SIZE - 1)) == 0) {
        void* raw = ((void**)addr)[-1];
        // Sanity check: raw should be before addr and within one page
        uintptr_t r = (uintptr_t)raw;
        if (r < a && (a - r) <= WASM_PAGE_SIZE) {
            free(raw);
            return 0;
        }
    }

    // Fallback: addr might be from MAP_FIXED or not our allocation.
    // Can't free it — just ignore. This is safe because in Wasm
    // linear memory, "unmapping" is just advisory.
    return 0;
}

int __wrap_mprotect(void* addr, size_t len, int prot) {
    // No-op in Emscripten. All Wasm linear memory is always readable
    // and writable. V8 uses mprotect for:
    //   - Guard pages (PROT_NONE) — we can't enforce this
    //   - Committing pages (PROT_READ|PROT_WRITE) — already committed
    //   - Making code executable (PROT_EXEC) — not applicable in jitless
    (void)addr;
    (void)len;
    (void)prot;
    return 0;
}

// madvise — V8 calls this ~35 times during startup
int __wrap_madvise(void* addr, size_t length, int advice) {
    (void)addr;
    (void)length;
    (void)advice;
    return 0;  // Success, ignored
}

}  // extern "C"

#endif  // __EMSCRIPTEN__
