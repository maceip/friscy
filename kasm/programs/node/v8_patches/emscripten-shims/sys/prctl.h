// Emscripten shim: sys/prctl.h
// V8 uses prctl for thread naming (PR_SET_NAME) and seccomp.
// These are no-ops in Wasm.
#ifndef _SYS_PRCTL_H
#define _SYS_PRCTL_H

#define PR_SET_NAME    15
#define PR_GET_NAME    16
#define PR_SET_SECCOMP 22
#define PR_GET_SECCOMP 21
#define PR_SET_NO_NEW_PRIVS 38

static inline int prctl(int option, ...) {
    (void)option;
    return 0;  // Success no-op
}

#endif
