// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_INITIALIZATION_FUNCTIONS_H_
#define WASI_V8_INITIALIZATION_FUNCTIONS_H_

namespace v8 { namespace internal {

#ifndef V8_INCLUDE_WASI_NUCLEAR_FIX_H_
inline bool PointerCompressionIsEnabled() { return false; }
inline bool SandboxIsEnabled() { return false; }
#endif

}}  // namespace v8::internal

#endif  // WASI_V8_INITIALIZATION_FUNCTIONS_H_
