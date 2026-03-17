// Emscripten shim: sys/auxv.h
// V8 uses this for CPU feature detection via getauxval().
// In Wasm, CPU features are fixed by the Wasm engine.
#ifndef _SYS_AUXV_H
#define _SYS_AUXV_H

// Include the linux/auxvec.h which defines AT_HWCAP constants
#include <linux/auxvec.h>

// getauxval is defined in linux/auxvec.h

#endif
