#include "vma.h"
#include <stdlib.h>
#include <string.h>

#define ALIGN_UP(addr, align) (((addr) + (align) - 1) & ~((uintptr_t)(align) - 1))

static int vma_cmp(struct rb_tree *self, struct rb_node *a, struct rb_node *b) {
    vma_node_t *va = (vma_node_t *)a->value;
    vma_node_t *vb = (vma_node_t *)b->value;
    if (va->addr < vb->addr) return -1;
    if (va->addr > vb->addr) return 1;
    return 0;
}

vma_node_t *vma_node_create(uintptr_t addr, size_t size, int prot,
                            int flags, bool committed, int fd, long offset) {
    vma_node_t *n = malloc(sizeof(vma_node_t));
    if (!n) return NULL;
    n->addr = addr;
    n->size = size;
    n->prot = prot;
    n->flags = flags;
    n->committed = committed;
    n->is_external = false;
    n->fd = fd;
    n->offset = offset;
    return n;
}

void vma_node_free(vma_node_t *node) {
    free(node);
}

void vma_init(vma_tree_t *vt) {
    rb_tree_init(&vt->tree, vma_cmp);
}

void vma_destroy(vma_tree_t *vt) {
    struct rb_node *node = vt->tree.root;
    struct rb_node *save = NULL;
    while (node) {
        if (node->link[0] == NULL) {
            save = node->link[1];
            if (node->value) free(node->value);
            rb_node_dealloc(node);
            node = NULL;
        } else {
            save = node->link[0];
            node->link[0] = save->link[1];
            save->link[1] = node;
        }
        node = save;
    }
    vt->tree.root = NULL;
    vt->tree.size = 0;
}

vma_node_t *vma_find(vma_tree_t *vt, uintptr_t addr) {
    struct rb_node *it = vt->tree.root;
    while (it) {
        vma_node_t *v = (vma_node_t *)it->value;
        if (addr < v->addr) {
            it = it->link[0];
        } else if (addr >= v->addr + v->size) {
            it = it->link[1];
        } else {
            return v;
        }
    }
    return NULL;
}

int vma_insert(vma_tree_t *vt, vma_node_t *node) {
    return rb_tree_insert(&vt->tree, node) ? 0 : -1;
}

void vma_remove(vma_tree_t *vt, vma_node_t *node) {
    rb_tree_remove_with_cb(&vt->tree, node, rb_tree_node_dealloc_cb);
}

vma_node_t *vma_split(vma_tree_t *vt, vma_node_t *node, uintptr_t split_addr) {
    if (split_addr <= node->addr || split_addr >= node->addr + node->size)
        return NULL;

    size_t right_size = (node->addr + node->size) - split_addr;

    vma_node_t *right = vma_node_create(
        split_addr, right_size,
        node->prot, node->flags, node->committed,
        node->fd,
        (node->fd >= 0) ? node->offset + (long)(split_addr - node->addr) : 0
    );
    if (!right) return NULL;
    right->is_external = node->is_external;

    node->size = split_addr - node->addr;

    if (vma_insert(vt, right) != 0) {
        vma_node_free(right);
        node->size += right_size;
        return NULL;
    }

    return right;
}

static bool vma_can_merge(vma_node_t *a, vma_node_t *b) {
    if (a->addr + a->size != b->addr) return false;
    if (a->prot != b->prot) return false;
    if (a->committed != b->committed) return false;
    if (a->flags != b->flags) return false;
    if (a->fd != b->fd) return false;
    if (a->is_external != b->is_external) return false;
    if (a->fd >= 0 && a->offset + (long)a->size != b->offset) return false;
    return true;
}

// Fix #1: O(log n) predecessor/successor using direct tree descent.
// Find the rb_node whose value matches the given vma_node_t by address,
// then walk the tree structure to find prev/next in O(log n).

// Find the rb_node* for a given vma_node_t* by tree descent. O(log n).
static struct rb_node *find_rb_node(vma_tree_t *vt, vma_node_t *target) {
    struct rb_node *it = vt->tree.root;
    while (it) {
        vma_node_t *v = (vma_node_t *)it->value;
        if (target->addr < v->addr) it = it->link[0];
        else if (target->addr > v->addr) it = it->link[1];
        else return it;
    }
    return NULL;
}

// In-order successor of an rb_node. O(log n) via tree descent since
// mirek/rb_tree doesn't maintain parent pointers. We descend from root
// tracking the last left-turn ancestor.
static struct rb_node *rb_node_successor(struct rb_tree *tree, struct rb_node *node) {
    // Case 1: node has a right child — successor is leftmost in right subtree.
    if (node->link[1]) {
        struct rb_node *s = node->link[1];
        while (s->link[0]) s = s->link[0];
        return s;
    }
    // Case 2: no right child — successor is the lowest ancestor for which
    // this node is in the left subtree. Descend from root to find it.
    struct rb_node *successor = NULL;
    struct rb_node *it = tree->root;
    vma_node_t *nv = (vma_node_t *)node->value;
    while (it) {
        vma_node_t *iv = (vma_node_t *)it->value;
        if (nv->addr < iv->addr) {
            successor = it;  // it is a potential successor (we went left)
            it = it->link[0];
        } else if (nv->addr > iv->addr) {
            it = it->link[1];
        } else {
            break; // found the node itself
        }
    }
    return successor;
}

// In-order predecessor. Mirror of successor.
static struct rb_node *rb_node_predecessor(struct rb_tree *tree, struct rb_node *node) {
    if (node->link[0]) {
        struct rb_node *p = node->link[0];
        while (p->link[1]) p = p->link[1];
        return p;
    }
    struct rb_node *predecessor = NULL;
    struct rb_node *it = tree->root;
    vma_node_t *nv = (vma_node_t *)node->value;
    while (it) {
        vma_node_t *iv = (vma_node_t *)it->value;
        if (nv->addr > iv->addr) {
            predecessor = it;  // went right, so it is a potential predecessor
            it = it->link[1];
        } else if (nv->addr < iv->addr) {
            it = it->link[0];
        } else {
            break;
        }
    }
    return predecessor;
}

vma_node_t *vma_merge(vma_tree_t *vt, vma_node_t *node) {
    struct rb_node *rbn = find_rb_node(vt, node);
    if (!rbn) return node;

    // Try merge with successor (O(log n))
    struct rb_node *next_rbn = rb_node_successor(&vt->tree, rbn);
    if (next_rbn) {
        vma_node_t *next = (vma_node_t *)next_rbn->value;
        if (vma_can_merge(node, next)) {
            node->size += next->size;
            vma_remove(vt, next);
            vma_node_free(next);
            // rbn may have moved in the tree after remove, re-find
            rbn = find_rb_node(vt, node);
        }
    }

    // Try merge with predecessor (O(log n))
    if (rbn) {
        struct rb_node *prev_rbn = rb_node_predecessor(&vt->tree, rbn);
        if (prev_rbn) {
            vma_node_t *prev = (vma_node_t *)prev_rbn->value;
            if (vma_can_merge(prev, node)) {
                prev->size += node->size;
                vma_remove(vt, node);
                vma_node_free(node);
                return prev;
            }
        }
    }

    return node;
}

uintptr_t vma_find_free_gap(vma_tree_t *vt, size_t size, size_t alignment,
                            uintptr_t arena_start, uintptr_t arena_end) {
    struct rb_iter iter;
    rb_iter_init(&iter);

    uintptr_t gap_start = arena_start;

    vma_node_t *v = rb_iter_first(&iter, &vt->tree);
    while (v) {
        if (v->addr > gap_start) {
            uintptr_t aligned = ALIGN_UP(gap_start, alignment);
            if (aligned + size <= v->addr && aligned + size <= arena_end) {
                return aligned;
            }
        }
        uintptr_t vma_end = v->addr + v->size;
        if (vma_end > gap_start) {
            gap_start = vma_end;
        }
        v = rb_iter_next(&iter);
    }

    uintptr_t aligned = ALIGN_UP(gap_start, alignment);
    if (aligned + size <= arena_end) {
        return aligned;
    }

    return 0;
}

int vma_find_range(vma_tree_t *vt, uintptr_t addr, size_t len,
                   vma_node_t **results, int max_results) {
    uintptr_t end = addr + len;
    int count = 0;

    struct rb_iter iter;
    rb_iter_init(&iter);

    vma_node_t *v = rb_iter_first(&iter, &vt->tree);
    while (v) {
        uintptr_t v_end = v->addr + v->size;
        if (v->addr < end && v_end > addr) {
            if (count >= max_results) {
                return -1;  // Fix #6: signal truncation
            }
            results[count++] = v;
        }
        // Fix #13: Safe to early-exit because VMAs are non-overlapping and
        // visited in ascending address order. A VMA starting at or past 'end'
        // cannot overlap [addr, end).
        if (v->addr >= end) break;
        v = rb_iter_next(&iter);
    }

    return count;
}

size_t vma_count(vma_tree_t *vt) {
    return rb_tree_size(&vt->tree);
}
