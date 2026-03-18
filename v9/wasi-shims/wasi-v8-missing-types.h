// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_MISSING_TYPES_SHIM_H_
#define WASI_V8_MISSING_TYPES_SHIM_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)
// In EdgeJS Emscripten build, missing types are resolved differently
// than in upstream node-wasix32 which forwards to deps/v8/include/wasi/
#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)

#endif  // WASI_V8_MISSING_TYPES_SHIM_H_
