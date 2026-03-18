// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_ESSENTIAL_CONSTANTS_H_
#define WASI_V8_ESSENTIAL_CONSTANTS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstdint>
#include "wasi-v8-missing-types.h"

namespace v8 {
namespace internal {

// Tag constants
#ifndef WASI_SMI_TAG_DEFINED
#define WASI_SMI_TAG_DEFINED
static constexpr int kSmiTag = 0;
static constexpr int kSmiTagSize = 1;
static constexpr intptr_t kSmiTagMask = (1 << kSmiTagSize) - 1;

static constexpr intptr_t kHeapObjectTag = 1;
static constexpr intptr_t kWeakHeapObjectTag = 3;
static constexpr intptr_t kHeapObjectTagSize = 2;
static constexpr intptr_t kHeapObjectTagMask = (1 << kHeapObjectTagSize) - 1;
#endif  // WASI_SMI_TAG_DEFINED

}  // namespace internal
}  // namespace v8

// Bridge v8::base::bits helpers into v8::internal::base::bits
namespace v8 {
namespace internal {
namespace base {
namespace bits {

template <typename T>
inline unsigned CountLeadingZeros(T value) {
  if (value == 0) return sizeof(T) * 8;
  unsigned count = 0;
  for (int i = sizeof(T) * 8 - 1; i >= 0; --i) {
    if (value & (static_cast<T>(1) << i)) break;
    count++;
  }
  return count;
}

template <typename T>
inline unsigned CountPopulation(T value) {
  unsigned count = 0;
  while (value) {
    count += value & 1;
    value >>= 1;
  }
  return count;
}

template <typename T>
inline unsigned CountTrailingZeros(T value) {
  if (value == 0) return sizeof(T) * 8;
  unsigned count = 0;
  while ((value & 1) == 0) {
    count++;
    value >>= 1;
  }
  return count;
}

}  // namespace bits
}  // namespace base
}  // namespace internal
}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_ESSENTIAL_CONSTANTS_H_
