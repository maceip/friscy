// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_BASE_INCLUDES_H_
#define WASI_V8_BASE_INCLUDES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)
// NOTE: When building EdgeJS for Emscripten, these paths may differ
// from upstream node-wasix32's deps/v8/src/base/ paths.
// Adapt include paths to match EdgeJS source tree.
#include "wasi-v8-bits-fixes.h"
#include "wasi-v8-lazy-instance-fix.h"
#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)

#endif  // WASI_V8_BASE_INCLUDES_H_
