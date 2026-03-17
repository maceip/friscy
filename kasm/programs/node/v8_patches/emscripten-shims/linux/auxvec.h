// Emscripten shim: linux/auxvec.h
// V8 uses this for CPU feature detection via getauxval().
// In Wasm, CPU features are fixed by the Wasm engine.
#ifndef _LINUX_AUXVEC_H
#define _LINUX_AUXVEC_H

#define AT_HWCAP  16
#define AT_HWCAP2 26

#ifdef __EMSCRIPTEN__
static inline unsigned long getauxval(unsigned long type) {
    (void)type;
    return 0;  // No CPU feature detection in Wasm
}
#endif

#endif
