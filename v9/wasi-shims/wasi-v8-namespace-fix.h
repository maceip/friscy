// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_NAMESPACE_FIX_H_
#define WASI_V8_NAMESPACE_FIX_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)
// No-op: avoid introducing nested namespace aliases that could
// inadvertently create v8::v8::* or v8::std::* resolutions.
#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)

#endif  // WASI_V8_NAMESPACE_FIX_H_
