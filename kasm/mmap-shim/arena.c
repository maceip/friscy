#define BUDDY_ALLOC_IMPLEMENTATION
#include "buddy_alloc.h"
#include "arena.h"
#include "mmap.h"
#include <stdlib.h>
#include <string.h>

static struct buddy *arena_buddy = NULL;
static unsigned char *arena_metadata = NULL;
static unsigned char *arena_base = NULL;
static size_t arena_size = 0;

int arena_init(void *base, size_t total_size) {
    if (!base || total_size < MMAP_PAGE_SIZE) return -1;

    arena_base = (unsigned char *)base;
    arena_size = total_size;

    size_t meta_size = buddy_sizeof_alignment(total_size, MMAP_PAGE_SIZE);
    if (meta_size == 0) return -1;

    arena_metadata = malloc(meta_size);
    if (!arena_metadata) return -1;

    arena_buddy = buddy_init_alignment(
        arena_metadata,
        arena_base,
        total_size,
        MMAP_PAGE_SIZE
    );

    if (!arena_buddy) {
        free(arena_metadata);
        arena_metadata = NULL;
        return -1;
    }

    return 0;
}

// Fix #5: Allow re-initialization by cleaning up state.
void arena_destroy(void) {
    if (arena_metadata) {
        free(arena_metadata);
        arena_metadata = NULL;
    }
    arena_buddy = NULL;
    arena_base = NULL;
    arena_size = 0;
}

void *arena_alloc_pages(size_t num_pages, size_t alignment) {
    if (!arena_buddy || num_pages == 0) return NULL;

    size_t size = num_pages * MMAP_PAGE_SIZE;

    if (alignment <= MMAP_PAGE_SIZE) {
        return buddy_malloc(arena_buddy, size);
    }

    // Fix #3: For larger alignments, we need the returned address to be
    // aligned to 'alignment'. The buddy allocator aligns blocks to their
    // power-of-2 size, but the arena base may not be aligned to 'alignment'.
    //
    // Strategy: over-allocate by 'alignment' extra bytes, then return
    // the first aligned address within the block. We track the raw buddy
    // pointer separately for freeing (stored just before the aligned address).
    size_t alloc_size = size + alignment;
    void *raw = buddy_malloc(arena_buddy, alloc_size);
    if (!raw) return NULL;

    uintptr_t raw_addr = (uintptr_t)raw;
    uintptr_t aligned_addr = (raw_addr + alignment - 1) & ~(alignment - 1);

    if (aligned_addr == raw_addr) {
        return raw;  // Already aligned
    }

    // Store the raw pointer just before the aligned address so arena_free_pages
    // can recover it. We have at least 'alignment' bytes of slack.
    // Use a hidden header pattern: store raw pointer at (aligned_addr - sizeof(void*)).
    void **header = (void **)(aligned_addr - sizeof(void *));
    *header = raw;

    return (void *)aligned_addr;
}

// Fix #7: Free with size parameter. If addr is a direct buddy allocation,
// use buddy_free. If it's an aligned sub-pointer (from over-allocation),
// recover the original raw pointer from the hidden header.
void arena_free_pages(void *addr, size_t expected_size) {
    if (!arena_buddy || !addr) return;

    // Check if this is a direct buddy allocation by trying buddy_free.
    // If the address was adjusted for alignment, the raw pointer is stored
    // at (addr - sizeof(void*)). We detect this by checking if buddy knows
    // about this address directly.
    size_t alloc_size = buddy_alloc_size(arena_buddy, addr);
    if (alloc_size > 0) {
        // Direct buddy allocation
        buddy_free(arena_buddy, addr);
    } else {
        // Aligned sub-pointer — recover raw pointer from hidden header
        void **header = (void **)((uintptr_t)addr - sizeof(void *));
        void *raw = *header;
        buddy_free(arena_buddy, raw);
    }
}

// Fix #4: Reserve a range in the buddy so it won't be handed out by buddy_malloc.
void arena_reserve_range(void *addr, size_t size) {
    if (!arena_buddy || !addr || size == 0) return;
    buddy_reserve_range(arena_buddy, addr, size);
}

void arena_release_range(void *addr, size_t size) {
    if (!arena_buddy || !addr || size == 0) return;
    buddy_unsafe_release_range(arena_buddy, addr, size);
}

bool arena_contains(void *addr) {
    if (!arena_base) return false;
    uintptr_t a = (uintptr_t)addr;
    return a >= (uintptr_t)arena_base && a < (uintptr_t)arena_base + arena_size;
}

uintptr_t arena_base_addr(void) {
    return (uintptr_t)arena_base;
}

uintptr_t arena_end_addr(void) {
    return (uintptr_t)arena_base + arena_size;
}

size_t arena_total_size(void) {
    return arena_buddy ? buddy_arena_size(arena_buddy) : 0;
}

size_t arena_free_size(void) {
    return arena_buddy ? buddy_arena_free_size(arena_buddy) : 0;
}

void arena_stats(size_t *total, size_t *used, size_t *free_out) {
    size_t t = arena_total_size();
    size_t f = arena_free_size();
    if (total) *total = t;
    if (free_out) *free_out = f;
    if (used) *used = t - f;
}
