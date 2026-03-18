// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_MINIMAL_FIXES_H
#define WASI_MINIMAL_FIXES_H

namespace v8 {
namespace internal {
namespace base {
}  // namespace base
}  // namespace internal
}  // namespace v8

#ifndef kSystemPointerSize
constexpr int kSystemPointerSize = sizeof(void*);
#endif

#endif  // WASI_MINIMAL_FIXES_H
