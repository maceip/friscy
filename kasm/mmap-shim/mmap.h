#ifndef MMAP_SHIM_H
#define MMAP_SHIM_H

#include <stddef.h>
#include <sys/types.h>

#define MAP_SHARED      0x01
#define MAP_PRIVATE     0x02
#define MAP_FIXED       0x10
#define MAP_ANONYMOUS   0x20
#define MAP_NORESERVE   0x4000
#define MAP_FAILED      ((void *)-1)

#define PROT_NONE       0x0
#define PROT_READ       0x1
#define PROT_WRITE      0x2
#define PROT_EXEC       0x4

#define MREMAP_MAYMOVE  1

// OS-level page size for mmap granularity (not Wasm page size which is 64KB)
#define MMAP_PAGE_SIZE  4096

int mmap_init(void *arena_base, size_t arena_size);
void mmap_destroy(void);  // Fix #5: allow re-initialization

void *wasm_mmap(void *addr, size_t length, int prot, int flags, int fd, long offset);
int   wasm_munmap(void *addr, size_t length);
void *wasm_mremap(void *old_address, size_t old_size, size_t new_size, int flags, void *new_address);
int   wasm_mprotect(void *addr, size_t len, int prot);

#endif
