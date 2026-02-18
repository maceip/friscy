// vh_preload.c — Guest LD_PRELOAD "SurfaceShim" for VectorHeart hypercalls
//
// RISC-V shared library that intercepts libc functions and routes them
// through custom ecalls to the host. The host-side C++ handlers call
// extern JS functions that perform the actual work (OPFS, fetch, crypto).
//
// ZERO LIBRARY DEPENDENCIES — uses raw syscalls for stdio passthrough
// so it works with both glibc AND musl (Alpine Linux).
//
// Compile:
//   riscv64-linux-gnu-gcc -shared -fPIC -O2 -nostdlib -o vh_preload.so vh_preload.c
//
// Usage:
//   LD_PRELOAD=/usr/lib/vh_preload.so node app.js
//
// FD routing:
//   fd 0-2        → real Linux syscall (passthrough)
//   fd 3+         → OPFS via ecall 601/602/603/604
//   fd 500-599    → synthetic socket FDs via ecall 802/803
//   fd 99         → JSON channel (ecall 708)

// We deliberately avoid #include <anything> to stay -nostdlib clean.
// Only need basic types — define them inline.
typedef unsigned long size_t;
typedef long          ssize_t;
typedef long          off_t;
typedef unsigned int  socklen_t;

// Linux RISC-V syscall numbers
#define SYS_close     57
#define SYS_read      63
#define SYS_write     64
#define SYS_pread64   67

// ============================================================================
// Raw Linux syscall — for fd 0-2 passthrough (no libc dependency)
// ============================================================================
static inline long raw_syscall3(long nr, long a0, long a1, long a2) {
    register long r_a0 __asm__("a0") = a0;
    register long r_a1 __asm__("a1") = a1;
    register long r_a2 __asm__("a2") = a2;
    register long r_a7 __asm__("a7") = nr;
    __asm__ volatile("ecall"
        : "+r"(r_a0)
        : "r"(r_a1), "r"(r_a2), "r"(r_a7)
        : "memory");
    return r_a0;
}

static inline long raw_syscall4(long nr, long a0, long a1, long a2, long a3) {
    register long r_a0 __asm__("a0") = a0;
    register long r_a1 __asm__("a1") = a1;
    register long r_a2 __asm__("a2") = a2;
    register long r_a3 __asm__("a3") = a3;
    register long r_a7 __asm__("a7") = nr;
    __asm__ volatile("ecall"
        : "+r"(r_a0)
        : "r"(r_a1), "r"(r_a2), "r"(r_a3), "r"(r_a7)
        : "memory");
    return r_a0;
}

// ============================================================================
// VH ecall — custom syscall numbers (600-803) handled by host C++ harness
// ============================================================================
static inline long vh_ecall(int nr, long a0, long a1, long a2, long a3, long a4) {
    register long r_a0 __asm__("a0") = a0;
    register long r_a1 __asm__("a1") = a1;
    register long r_a2 __asm__("a2") = a2;
    register long r_a3 __asm__("a3") = a3;
    register long r_a4 __asm__("a4") = a4;
    register int  r_a7 __asm__("a7") = nr;
    __asm__ volatile("ecall"
        : "+r"(r_a0)
        : "r"(r_a1), "r"(r_a2), "r"(r_a3), "r"(r_a4), "r"(r_a7)
        : "memory");
    return r_a0;
}

// ============================================================================
// [600s] FS / OPFS
// ============================================================================

ssize_t write(int fd, const void *buf, size_t count) {
    // JSON channel
    if (fd == 99)
        return (ssize_t)vh_ecall(708, (long)buf, (long)count, 0, 0, 0);
    // Synthetic socket FD range
    if (fd >= 500 && fd < 600)
        return (ssize_t)vh_ecall(802, (long)fd, (long)buf, (long)count, 0, 0);
    // OPFS file FD
    if (fd > 2)
        return (ssize_t)vh_ecall(601, (long)fd, (long)buf, (long)count, 0, 0);
    // Passthrough to real Linux syscall for stdio (fd 0-2)
    return raw_syscall3(SYS_write, fd, (long)buf, (long)count);
}

ssize_t read(int fd, void *buf, size_t count) {
    // Synthetic socket FD range
    if (fd >= 500 && fd < 600)
        return (ssize_t)vh_ecall(803, (long)fd, (long)buf, (long)count, 0, 0);
    // OPFS file FD
    if (fd > 2)
        return (ssize_t)vh_ecall(602, (long)fd, (long)buf, (long)count, 0, 0);
    // Passthrough to real Linux syscall for stdio
    return raw_syscall3(SYS_read, fd, (long)buf, (long)count);
}

ssize_t pread(int fd, void *buf, size_t count, off_t offset) {
    if (fd > 2)
        return (ssize_t)vh_ecall(604, (long)fd, (long)buf, (long)count, (long)offset, 0);
    return raw_syscall4(SYS_pread64, fd, (long)buf, (long)count, (long)offset);
}

int close(int fd) {
    if (fd > 2)
        return (int)vh_ecall(603, (long)fd, 0, 0, 0, 0);
    return (int)raw_syscall3(SYS_close, fd, 0, 0);
}

// ============================================================================
// [700s] Compute / Crypto
// ============================================================================

// 703: memmove — offload large copies to host (native speed)
void *memmove(void *dest, const void *src, size_t n) {
    if (n > 1024)
        return (void *)vh_ecall(703, (long)dest, (long)src, (long)n, 0, 0);
    unsigned char *d = dest;
    const unsigned char *s = src;
    if (d < s) {
        for (size_t i = 0; i < n; i++) d[i] = s[i];
    } else {
        for (size_t i = n; i > 0; i--) d[i-1] = s[i-1];
    }
    return dest;
}

// 704: gettimeofday — offload to host Date.now()
struct vh_timeval { long tv_sec; long tv_usec; };
int gettimeofday(struct vh_timeval *tv, void *tz) {
    (void)tz;
    return (int)vh_ecall(704, (long)tv, 0, 0, 0, 0);
}

// 705: getrandom — offload to host crypto.getRandomValues
ssize_t getrandom(void *buf, size_t len, unsigned int flags) {
    (void)flags;
    return (ssize_t)vh_ecall(705, (long)buf, (long)len, 0, 0, 0);
}

// ============================================================================
// [800s] Networking
// ============================================================================

// 800: connect — route to host net proxy
int connect(int fd, const void *addr, socklen_t len) {
    return (int)vh_ecall(800, (long)fd, (long)addr, (long)len, 0, 0);
}

// 801: getaddrinfo — resolve via host DNS
int getaddrinfo(const char *node, const void *service,
                const void *hints, void **res) {
    return (int)vh_ecall(801, (long)node, (long)service, (long)hints, (long)res, 0);
}

void freeaddrinfo(void *res) {
    (void)res;
}
