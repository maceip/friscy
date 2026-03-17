// Shim for linux/unistd.h on Emscripten
#ifndef LINUX_UNISTD_EMSCRIPTEN_SHIM
#define LINUX_UNISTD_EMSCRIPTEN_SHIM

// Provide syscall stubs for Emscripten
#include <unistd.h>

// __NR_gettid is used by sysinfo.cc - return 1 for single-threaded wasm
#ifndef __NR_gettid
#define __NR_gettid 186  // Common value, doesn't matter on Emscripten
#endif

static inline pid_t sys_gettid(void) {
    return 1;  // Single thread
}

#endif
