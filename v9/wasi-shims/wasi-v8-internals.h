// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_INTERNALS_H_
#define WASI_V8_INTERNALS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <type_traits>

namespace v8 {

class Isolate;
class Value;
class Context;

namespace internal {

using Address = uintptr_t;

// Tag constants
static constexpr int kApiTaggedSize = 4;
static constexpr int kApiSystemPointerSize = sizeof(void*);
static constexpr int kApiDoubleSize = sizeof(double);
static constexpr int kApiSizetSize = sizeof(size_t);
static constexpr int kApiInt32Size = sizeof(int32_t);
static constexpr int kApiInt64Size = sizeof(int64_t);

static constexpr intptr_t kHeapObjectTag = 1;
static constexpr intptr_t kWeakHeapObjectTag = 3;
static constexpr intptr_t kHeapObjectTagSize = 2;
static constexpr intptr_t kHeapObjectTagMask = (1 << kHeapObjectTagSize) - 1;
static constexpr intptr_t kForwardingTag = 0;
static constexpr intptr_t kForwardingTagSize = 2;
static constexpr intptr_t kForwardingTagMask = (1 << kForwardingTagSize) - 1;
static constexpr int kSmiShiftSize = 0;
static constexpr int kSmiValueSize = 31;
static constexpr int kSmiTag = 0;
static constexpr int kSmiTagSize = 1;
static constexpr intptr_t kSmiTagMask = (1 << kSmiTagSize) - 1;

static constexpr uint64_t kExternalAllocationSoftLimit = 64 * 1024 * 1024;  // 64MB

// Root indices
enum RootIndex {
  kEmptyStringRootIndex = 0,
  kTheHoleValueRootIndex,
  kUndefinedValueRootIndex,
  kNullValueRootIndex,
  kTrueValueRootIndex,
  kFalseValueRootIndex,
  kRootListLength,
};

// String layout constants
static constexpr int kStringResourceOffset = kApiTaggedSize + kApiInt32Size;
static constexpr int kStringEncodingMask = 0x8;
static constexpr int kExternalTwoByteRepresentationTag = 0x02;
static constexpr int kExternalOneByteRepresentationTag = 0x0A;
static constexpr int kStringRepresentationAndEncodingMask = 0x0F;

// Object layout constants
static constexpr int kJSAPIObjectWithEmbedderSlotsHeaderSize = 3 * kApiTaggedSize;
static constexpr int kJSObjectHeaderSize = 3 * kApiTaggedSize;
static constexpr int kJSSpecialApiObjectHeaderSize = 3 * kApiTaggedSize;
static constexpr int kFixedArrayHeaderSize = 2 * kApiTaggedSize;
static constexpr int kEmbedderDataSlotSize = kApiTaggedSize;
static constexpr int kEmbedderDataSlotExternalPointerOffset = 0;
static constexpr int kNativeContextEmbedderDataOffset = 7 * kApiTaggedSize;
static constexpr int kFirstEmbedderJSApiObjectType = 0;
static constexpr int kLastEmbedderJSApiObjectType = 0;
static constexpr int kFirstJSApiObjectType = 0xAA00;
static constexpr int kLastJSApiObjectType = 0xAAFF;

// Map layout
static constexpr int kMapInstanceTypeOffset = kApiTaggedSize + kApiInt32Size;

// Oddball constants
static constexpr int kUndefinedOddballKind = 4;
static constexpr int kNullOddballKind = 3;
static constexpr int kFalseOddballKind = 1;
static constexpr int kTrueOddballKind = 2;
static constexpr int kOddballKindOffset = 4 * kApiTaggedSize + kApiDoubleSize;

class Internals {
 public:
  // SMI conversion
  static constexpr int SmiValue(Address value) {
    return static_cast<int>(static_cast<intptr_t>(value) >> (kSmiTagSize + kSmiShiftSize));
  }

  static constexpr Address IntToSmi(int value) {
    return static_cast<Address>(
        (static_cast<intptr_t>(value) << (kSmiTagSize + kSmiShiftSize)) | kSmiTag);
  }

  template <typename T,
            typename = typename std::enable_if<std::is_integral<T>::value>::type>
  static constexpr Address IntegralToSmi(T value) {
    return IntToSmi(static_cast<int>(value));
  }

  static constexpr bool IsValidSmi(intptr_t value) {
    return (value >= -(static_cast<intptr_t>(1) << (kSmiValueSize - 1))) &&
           (value < (static_cast<intptr_t>(1) << (kSmiValueSize - 1)));
  }

  // Tag checks
  static constexpr bool HasHeapObjectTag(Address value) {
    return (value & kHeapObjectTagMask) == static_cast<Address>(kHeapObjectTag);
  }

  // Raw memory access
  template <typename T>
  static T ReadRawField(Address heap_object, int offset) {
    T result;
    std::memcpy(&result,
                reinterpret_cast<const void*>(heap_object - kHeapObjectTag + offset),
                sizeof(T));
    return result;
  }

  static Address ReadTaggedPointerField(Address heap_object, int offset) {
    return ReadRawField<Address>(heap_object, offset);
  }

  static Address DecompressTaggedField(Address heap_object, uint32_t value) {
    (void)heap_object;
    return static_cast<Address>(value);
  }

  // Instance type
  static int GetInstanceType(Address heap_object) {
    Address map = ReadTaggedPointerField(heap_object, 0);
    if (!HasHeapObjectTag(map)) return -1;
    return ReadRawField<uint16_t>(map, kMapInstanceTypeOffset);
  }

  static bool IsExternalTwoByteString(int instance_type) {
    int representation = instance_type & kStringRepresentationAndEncodingMask;
    return representation == kExternalTwoByteRepresentationTag;
  }

  // Isolate helpers
  static Address GetRoot(Isolate* isolate, int index) {
    (void)isolate; (void)index;
    return 0;
  }

  static Address* GetRootSlot(Isolate* isolate, int index) {
    (void)isolate; (void)index;
    static Address dummy = 0;
    return &dummy;
  }

  static bool CheckInitialized(Isolate* isolate) {
    (void)isolate;
    return true;
  }

  static void* GetNodeState(void* node) {
    (void)node;
    return nullptr;
  }

  static Isolate* GetIsolateForSandbox(Address heap_object) {
    (void)heap_object;
    return nullptr;
  }
};

}  // namespace internal
}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_INTERNALS_H_
