// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_CUSTOM_ARGUMENTS_H_
#define WASI_V8_CUSTOM_ARGUMENTS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

// Only compiles when WASI_USE_CUSTOM_ARGUMENTS_STUB is defined
#ifdef WASI_USE_CUSTOM_ARGUMENTS_STUB

#include <cstddef>
#include <cstdint>

namespace v8 {
namespace internal {

template <typename T>
class CustomArguments {
 public:
  CustomArguments() = default;
  virtual ~CustomArguments() = default;

  T operator[](int index) const {
    (void)index;
    return nullptr;
  }

  int length() const { return 0; }
};

// Stub print helpers for callback info
inline void PrintFunctionCallbackInfo(const void* info) {
  (void)info;
}

inline void PrintPropertyCallbackInfo(const void* info) {
  (void)info;
}

}  // namespace internal
}  // namespace v8

#endif  // WASI_USE_CUSTOM_ARGUMENTS_STUB

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_CUSTOM_ARGUMENTS_H_
