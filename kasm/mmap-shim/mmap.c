#include "mmap.h"
#include "vma.h"
#include "arena.h"

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>

#define ALIGN_UP(x, a) (((x) + (a) - 1) & ~((uintptr_t)(a) - 1))

// Fix #6: Initial stack buffer for overlaps; dynamically allocate if needed.
#define OVERLAP_STACK_MAX 256

static vma_tree_t vma_tree;
static bool initialized = false;

int mmap_init(void *arena_base, size_t arena_size) {
    if (initialized) return 0;
    if (!arena_base || arena_size < MMAP_PAGE_SIZE) return -1;
    if ((uintptr_t)arena_base % MMAP_PAGE_SIZE != 0) return -1;

    vma_init(&vma_tree);
    if (arena_init(arena_base, arena_size) != 0) return -1;

    initialized = true;
    return 0;
}

// Fix #5: Destroy and allow re-initialization.
void mmap_destroy(void) {
    if (!initialized) return;
    vma_destroy(&vma_tree);
    arena_destroy();
    initialized = false;
}

// Fix #2: Carve [addr, addr+len) by iteratively finding and processing one
// overlap at a time, re-querying after each mutation. This avoids operating
// on stale pointers after splits/removes modify the tree.
static void carve_range(uintptr_t addr, size_t len) {
    uintptr_t end = addr + len;

    while (1) {
        // Find the first VMA overlapping our range
        vma_node_t *v = NULL;
        struct rb_iter iter;
        rb_iter_init(&iter);
        vma_node_t *candidate = rb_iter_first(&iter, &vma_tree.tree);
        while (candidate) {
            uintptr_t c_end = candidate->addr + candidate->size;
            if (candidate->addr < end && c_end > addr) {
                v = candidate;
                break;
            }
            if (candidate->addr >= end) break;
            candidate = rb_iter_next(&iter);
        }

        if (!v) break;  // No more overlaps

        // Split left overhang
        if (v->addr < addr) {
            vma_node_t *right = vma_split(&vma_tree, v, addr);
            if (!right) break;
            v = right;
        }

        // Split right overhang
        if (v->addr + v->size > end) {
            vma_split(&vma_tree, v, end);
        }

        // Free committed pages
        if (v->committed) {
            if (v->is_external) {
                free((void *)v->addr);
            } else if (arena_contains((void *)v->addr)) {
                arena_free_pages((void *)v->addr, v->size);
            }
        } else if (arena_contains((void *)v->addr)) {
            // Fix #4: Release buddy reservation for uncommitted ranges
            arena_release_range((void *)v->addr, v->size);
        }

        vma_remove(&vma_tree, v);
        vma_node_free(v);
    }
}

void *wasm_mmap(void *addr, size_t length, int prot, int flags, int fd, long offset) {
    if (!initialized || length == 0) return MAP_FAILED;
    length = ALIGN_UP(length, MMAP_PAGE_SIZE);

    if (!(flags & MAP_ANONYMOUS)) return MAP_FAILED;

    if (flags & MAP_FIXED) {
        if (!addr) return MAP_FAILED;
        uintptr_t target = (uintptr_t)addr;
        if (target % MMAP_PAGE_SIZE != 0) return MAP_FAILED;

        carve_range(target, length);

        bool committed = false;
        bool is_external = false;

        if (prot != PROT_NONE) {
            if (arena_contains((void *)target)) {
                memset((void *)target, 0, length);
                committed = true;
            } else {
                memset((void *)target, 0, length);
                committed = true;
                is_external = true;
            }
        } else {
            // Fix #4: Reserve range in buddy so it won't be given out
            if (arena_contains((void *)target)) {
                arena_reserve_range((void *)target, length);
            }
        }

        vma_node_t *node = vma_node_create(
            target, length, prot, flags & ~MAP_FIXED,
            committed, fd, offset
        );
        if (!node) return MAP_FAILED;
        node->is_external = is_external;

        if (vma_insert(&vma_tree, node) != 0) {
            vma_node_free(node);
            return MAP_FAILED;
        }

        return addr;
    }

    // Non-fixed PROT_NONE reservation
    if (prot == PROT_NONE) {
        uintptr_t gap = vma_find_free_gap(
            &vma_tree, length, MMAP_PAGE_SIZE,
            arena_base_addr(), arena_end_addr()
        );
        if (gap == 0) return MAP_FAILED;

        // Fix #4: Reserve the range in the buddy allocator so committed
        // allocations won't land in this address range.
        arena_reserve_range((void *)gap, length);

        vma_node_t *node = vma_node_create(
            gap, length, PROT_NONE, flags,
            false, fd, offset
        );
        if (!node) {
            arena_release_range((void *)gap, length);
            return MAP_FAILED;
        }

        if (vma_insert(&vma_tree, node) != 0) {
            arena_release_range((void *)gap, length);
            vma_node_free(node);
            return MAP_FAILED;
        }

        return (void *)gap;
    }

    // Committed allocation from buddy
    void *pages = arena_alloc_pages(length / MMAP_PAGE_SIZE, MMAP_PAGE_SIZE);

    // Fix #8: Fallback to posix_memalign if arena is exhausted
    bool is_external = false;
    if (!pages) {
        if (posix_memalign(&pages, MMAP_PAGE_SIZE, length) != 0) {
            return MAP_FAILED;
        }
        is_external = true;
    }

    memset(pages, 0, length);

    vma_node_t *node = vma_node_create(
        (uintptr_t)pages, length, prot, flags,
        true, fd, offset
    );
    if (!node) {
        if (is_external) free(pages);
        else arena_free_pages(pages, length);
        return MAP_FAILED;
    }
    node->is_external = is_external;

    if (vma_insert(&vma_tree, node) != 0) {
        if (is_external) free(pages);
        else arena_free_pages(pages, length);
        vma_node_free(node);
        return MAP_FAILED;
    }

    return pages;
}

int wasm_munmap(void *addr, size_t length) {
    if (!initialized || !addr || length == 0) return -1;
    if ((uintptr_t)addr % MMAP_PAGE_SIZE != 0) return -1;
    length = ALIGN_UP(length, MMAP_PAGE_SIZE);

    // Fix #2: Re-query after each mutation instead of using stale snapshot.
    uintptr_t target = (uintptr_t)addr;
    uintptr_t end = target + length;

    while (1) {
        vma_node_t *v = NULL;
        struct rb_iter iter;
        rb_iter_init(&iter);
        vma_node_t *candidate = rb_iter_first(&iter, &vma_tree.tree);
        while (candidate) {
            uintptr_t c_end = candidate->addr + candidate->size;
            if (candidate->addr < end && c_end > target) {
                v = candidate;
                break;
            }
            if (candidate->addr >= end) break;
            candidate = rb_iter_next(&iter);
        }

        if (!v) break;

        if (v->addr < target) {
            vma_node_t *right = vma_split(&vma_tree, v, target);
            if (!right) break;
            v = right;
        }

        if (v->addr + v->size > end) {
            vma_split(&vma_tree, v, end);
        }

        if (v->committed) {
            if (v->is_external) {
                free((void *)v->addr);
            } else if (arena_contains((void *)v->addr)) {
                arena_free_pages((void *)v->addr, v->size);
            }
        } else if (arena_contains((void *)v->addr)) {
            // Release buddy reservation for uncommitted ranges
            arena_release_range((void *)v->addr, v->size);
        }

        vma_remove(&vma_tree, v);
        vma_node_free(v);
    }

    return 0;
}

int wasm_mprotect(void *addr, size_t len, int prot) {
    if (!initialized || !addr || len == 0) return -1;
    if ((uintptr_t)addr % MMAP_PAGE_SIZE != 0) return -1;
    len = ALIGN_UP(len, MMAP_PAGE_SIZE);

    uintptr_t target = (uintptr_t)addr;
    uintptr_t end = target + len;

    // Fix #2 + #6: Process one VMA at a time, re-querying after mutations.
    while (1) {
        vma_node_t *v = NULL;
        struct rb_iter iter;
        rb_iter_init(&iter);
        vma_node_t *candidate = rb_iter_first(&iter, &vma_tree.tree);
        while (candidate) {
            uintptr_t c_end = candidate->addr + candidate->size;
            if (candidate->addr < end && c_end > target) {
                v = candidate;
                break;
            }
            if (candidate->addr >= end) break;
            candidate = rb_iter_next(&iter);
        }

        if (!v) break;

        if (v->addr < target) {
            vma_node_t *right = vma_split(&vma_tree, v, target);
            if (!right) break;
            v = right;
        }
        if (v->addr + v->size > end) {
            vma_split(&vma_tree, v, end);
        }

        int old_prot = v->prot;

        if (old_prot == PROT_NONE && prot != PROT_NONE) {
            // Commit: PROT_NONE -> accessible
            if (!v->committed) {
                if (arena_contains((void *)v->addr)) {
                    // Fix #4: Release the buddy reservation, then allocate
                    // real pages. The reservation prevented buddy_malloc from
                    // giving out these addresses; now we commit them.
                    arena_release_range((void *)v->addr, v->size);
                    // The memory at v->addr is in the arena — just zero it.
                    memset((void *)v->addr, 0, v->size);
                    // Re-reserve as allocated (buddy_malloc equivalent)
                    arena_reserve_range((void *)v->addr, v->size);
                }
                v->committed = true;
            }
        } else if (old_prot != PROT_NONE && prot == PROT_NONE) {
            // Decommit: accessible -> PROT_NONE
            v->committed = false;
        }

        v->prot = prot;

        // Advance past this VMA before merging (merge may free v)
        uintptr_t v_end = v->addr + v->size;
        vma_merge(&vma_tree, v);

        // Advance target to avoid re-processing
        if (v_end > target) target = v_end;
    }

    return 0;
}

void *wasm_mremap(void *old_address, size_t old_size, size_t new_size,
                  int flags, void *new_address) {
    if (!initialized || !old_address) return MAP_FAILED;
    if ((uintptr_t)old_address % MMAP_PAGE_SIZE != 0) return MAP_FAILED;

    old_size = ALIGN_UP(old_size, MMAP_PAGE_SIZE);
    new_size = ALIGN_UP(new_size, MMAP_PAGE_SIZE);

    if (old_size == new_size) return old_address;

    vma_node_t *v = vma_find(&vma_tree, (uintptr_t)old_address);
    if (!v) return MAP_FAILED;

    if (new_size < old_size) {
        uintptr_t split_at = v->addr + new_size;
        vma_node_t *tail = vma_split(&vma_tree, v, split_at);
        if (tail) {
            if (tail->committed) {
                if (tail->is_external) free((void *)tail->addr);
                else if (arena_contains((void *)tail->addr))
                    arena_free_pages((void *)tail->addr, tail->size);
            }
            vma_remove(&vma_tree, tail);
            vma_node_free(tail);
        }
        return old_address;
    }

    // Fix #14: Only attempt in-place grow if the extension pages are at
    // exactly the right address. Use buddy_reserve_range to claim the
    // specific range, rather than buddy_malloc which returns arbitrary addresses.
    size_t extend_size = new_size - old_size;
    uintptr_t extend_addr = v->addr + v->size;

    vma_node_t *next = vma_find(&vma_tree, extend_addr);
    if (!next && arena_contains((void *)extend_addr)) {
        // Check if there's enough gap
        uintptr_t gap_end = arena_end_addr();
        struct rb_iter iter;
        rb_iter_init(&iter);
        vma_node_t *sv = rb_iter_first(&iter, &vma_tree.tree);
        while (sv) {
            if (sv->addr >= extend_addr) { gap_end = sv->addr; break; }
            sv = rb_iter_next(&iter);
        }

        if (extend_addr + extend_size <= gap_end) {
            // Fix #14: Reserve the exact range in the buddy, then zero it.
            // This guarantees the addresses match (unlike buddy_malloc which
            // returns arbitrary addresses).
            arena_reserve_range((void *)extend_addr, extend_size);
            memset((void *)extend_addr, 0, extend_size);

            vma_node_t *ext = vma_node_create(
                extend_addr, extend_size, v->prot, v->flags,
                true, -1, 0
            );
            if (ext) {
                vma_insert(&vma_tree, ext);
                vma_merge(&vma_tree, v);
                return old_address;
            }
            arena_release_range((void *)extend_addr, extend_size);
        }
    }

    if (!(flags & MREMAP_MAYMOVE)) return MAP_FAILED;

    void *new_mem = wasm_mmap(NULL, new_size, v->prot,
                              MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (new_mem == MAP_FAILED) return MAP_FAILED;

    memcpy(new_mem, old_address, old_size);
    wasm_munmap(old_address, old_size);

    return new_mem;
}
