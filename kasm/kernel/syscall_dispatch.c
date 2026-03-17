#include <emscripten.h>

long lkl_syscall(long no, long *params);

EMSCRIPTEN_KEEPALIVE
long kasm_syscall(long nr, long a0, long a1, long a2, long a3, long a4, long a5) {
    long params[6] = { a0, a1, a2, a3, a4, a5 };
    return lkl_syscall(nr, params);
}
