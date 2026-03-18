// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_CPPGC_STUBS_H_
#define WASI_CPPGC_STUBS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

namespace cppgc {
class AllocationHandle;
}  // namespace cppgc

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_CPPGC_STUBS_H_
