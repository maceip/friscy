// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_FLAGS_FIX_H_
#define WASI_V8_FLAGS_FIX_H_

#if (defined(__wasi__) || defined(__EMSCRIPTEN__)) && defined(V8_EXPORT_PRIVATE)
#include "wasi-v8-essential-constants.h"
#endif

#endif  // WASI_V8_FLAGS_FIX_H_
