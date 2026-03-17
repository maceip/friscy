#ifndef ARENA_H
#define ARENA_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

int arena_init(void *base, size_t total_size);
void arena_destroy(void);

// Allocate contiguous pages. Returns page-aligned address or NULL.
void *arena_alloc_pages(size_t num_pages, size_t alignment);

// Fix #7: Free pages with size validation. 'expected_size' in bytes.
// Uses buddy_safe_free to verify the size matches the allocation.
void arena_free_pages(void *addr, size_t expected_size);

// Reserve a range in the buddy allocator without allocating it.
// Fix #4: Prevents buddy_malloc from handing out these addresses.
void arena_reserve_range(void *addr, size_t size);

// Release a previously reserved range back to the buddy.
void arena_release_range(void *addr, size_t size);

bool arena_contains(void *addr);
uintptr_t arena_base_addr(void);
uintptr_t arena_end_addr(void);

size_t arena_total_size(void);
size_t arena_free_size(void);
void arena_stats(size_t *total, size_t *used, size_t *free_out);

#endif
