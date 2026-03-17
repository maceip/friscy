// Emscripten shim: sys/personality.h
// Not used by V8 directly but may be included transitively.
#ifndef _SYS_PERSONALITY_H
#define _SYS_PERSONALITY_H

#define PER_LINUX 0

static inline int personality(unsigned long persona) {
    (void)persona;
    return 0;
}

#endif
