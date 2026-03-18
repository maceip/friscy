// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_BITS_FIXES_H_
#define WASI_V8_BITS_FIXES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)
#include <array>
#include <cstdint>
#include <type_traits>
#include <utility>
#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)

#endif  // WASI_V8_BITS_FIXES_H_
