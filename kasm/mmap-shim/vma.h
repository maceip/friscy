#ifndef VMA_H
#define VMA_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <sys/types.h>
#include "rb_tree.h"

typedef struct vma_node {
    uintptr_t addr;
    size_t    size;
    int       prot;
    int       flags;
    bool      committed;
    bool      is_external;  // Fix #8: true if backed by posix_memalign, not buddy arena
    int       fd;
    long      offset;
} vma_node_t;

typedef struct vma_tree {
    struct rb_tree tree;
} vma_tree_t;

void vma_init(vma_tree_t *vt);
void vma_destroy(vma_tree_t *vt);

// Find the VMA containing addr. O(log n).
vma_node_t *vma_find(vma_tree_t *vt, uintptr_t addr);

// Insert a new VMA. Caller must ensure no overlap. O(log n).
int vma_insert(vma_tree_t *vt, vma_node_t *node);

// Remove a VMA from the tree. Does not free the vma_node_t.
void vma_remove(vma_tree_t *vt, vma_node_t *node);

// Split at split_addr. Left part stays as 'node', returns new right part.
vma_node_t *vma_split(vma_tree_t *vt, vma_node_t *node, uintptr_t split_addr);

// Merge with adjacent predecessor/successor if properties match. O(log n).
vma_node_t *vma_merge(vma_tree_t *vt, vma_node_t *node);

// Find free gap >= size with given alignment. Returns aligned address or 0.
uintptr_t vma_find_free_gap(vma_tree_t *vt, size_t size, size_t alignment,
                            uintptr_t arena_start, uintptr_t arena_end);

// Collect all VMAs overlapping [addr, addr+len).
// If count exceeds max_results, returns -1 (truncation error). Fix #6.
int vma_find_range(vma_tree_t *vt, uintptr_t addr, size_t len,
                   vma_node_t **results, int max_results);

size_t vma_count(vma_tree_t *vt);

vma_node_t *vma_node_create(uintptr_t addr, size_t size, int prot,
                            int flags, bool committed, int fd, long offset);
void vma_node_free(vma_node_t *node);

#endif
