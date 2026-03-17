// Shim for linux/futex.h on Emscripten
// Abseil doesn't actually use futex on Emscripten when ABSL_FORCE_WAITER_MODE=4,
// but the header is still included. Provide minimal definitions.
#ifndef LINUX_FUTEX_EMSCRIPTEN_SHIM
#define LINUX_FUTEX_EMSCRIPTEN_SHIM

// Futex operations - not actually used with StdcppWaiter
#define FUTEX_WAIT 0
#define FUTEX_WAKE 1
#define FUTEX_PRIVATE_FLAG 128

// SYS_futex, SYS_mmap, SYS_munmap for syscall()
#ifndef SYS_futex
#define SYS_futex 202
#endif
#ifndef SYS_mmap
#define SYS_mmap 9
#endif
#ifndef SYS_munmap
#define SYS_munmap 11
#endif

// Stub futex function - never called with StdcppWaiter
static inline int futex(int *uaddr, int futex_op, int val,
                        const void *timeout, int *uaddr2, int val3) {
    (void)uaddr; (void)futex_op; (void)val;
    (void)timeout; (void)uaddr2; (void)val3;
    return -1;  // Error
}

#endif
