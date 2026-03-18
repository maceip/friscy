// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_NODE_COMPAT_H_
#define WASI_NODE_COMPAT_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <vector>
#include <string>
#include <cstring>
#include "wasi-system-compat.h"
#include "wasi-v8-sandbox-stubs.h"
#include "wasi-simdutf-compat.h"

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_NODE_COMPAT_H_
