// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_EXTERNAL_POINTER_COMPAT_H_
#define WASI_EXTERNAL_POINTER_COMPAT_H_

namespace v8 {
namespace internal {

#ifndef V8_EXTERNAL_POINTER_T_DEFINED
using ExternalPointer_t = uintptr_t;
#endif

}  // namespace internal
}  // namespace v8

#endif  // WASI_EXTERNAL_POINTER_COMPAT_H_
