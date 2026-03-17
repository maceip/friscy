// Emscripten shim: linux/mman.h
// V8 uses MREMAP_FIXED, MREMAP_MAYMOVE, MADV_HUGEPAGE from this header.
// Emscripten's sys/mman.h covers most, but linux/mman.h adds Linux-specific ones.
#ifndef _LINUX_MMAN_H
#define _LINUX_MMAN_H

// Pull in Emscripten's real mmap definitions (MAP_FAILED, mmap, munmap, etc.)
// We can't use #include <sys/mman.h> because our shim shadows it.
#include_next <sys/mman.h>

#ifndef MREMAP_MAYMOVE
#define MREMAP_MAYMOVE  1
#endif

#ifndef MREMAP_FIXED
#define MREMAP_FIXED    2
#endif

#ifndef MREMAP_DONTUNMAP
#define MREMAP_DONTUNMAP 4
#endif

#ifndef MADV_HUGEPAGE
#define MADV_HUGEPAGE   14
#endif

#ifndef MADV_DONTFORK
#define MADV_DONTFORK   10
#endif

#ifndef MAP_NORESERVE
#define MAP_NORESERVE   0x4000
#endif

#ifndef MAP_STACK
#define MAP_STACK       0x20000
#endif

// mremap is not available in Emscripten — stub it
#ifdef __EMSCRIPTEN__
#include <errno.h>
static inline void *mremap(void *old_address, size_t old_size,
                           size_t new_size, int flags, ...) {
    errno = ENOSYS;
    return MAP_FAILED;
}
#endif

#endif
