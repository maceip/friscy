// Shim for sys/syscall.h on Emscripten
#ifndef SYS_SYSCALL_EMSCRIPTEN_SHIM
#define SYS_SYSCALL_EMSCRIPTEN_SHIM

// Include the linux unistd.h which has __NR_gettid
#include <linux/unistd.h>

// Include linux/futex.h for SYS_futex, SYS_mmap, SYS_munmap
#include <linux/futex.h>

// syscall() declaration - Emscripten doesn't support real syscalls
// These stubs return -1 (error) which triggers fallback behavior
#include <cstdarg>

static inline long syscall(long number, ...) {
    (void)number;
    return -1;
}

#endif
