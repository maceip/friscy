// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_INTERNALS_CONSTANTS_H_
#define WASI_V8_INTERNALS_CONSTANTS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>

namespace v8 {
namespace internal {

using Address = uintptr_t;

// ValueHelper class
class ValueHelper {
 public:
  using InternalRepresentationType = Address;

  static constexpr Address kEmpty = 0;

  static Address ValueAsAddress(const void* value) {
    return reinterpret_cast<Address>(value);
  }

  template <typename T>
  static T* SlotAsValue(Address* slot) {
    return reinterpret_cast<T*>(slot);
  }
};

// Internals instance type constants
class Internals {
 public:
  static constexpr int kFirstNonstringType = 0x80;
  static constexpr int kOddballType = 0x83;
  static constexpr int kForeignType = 0x87;
  static constexpr int kJSSpecialApiObjectType = 0x410;
  static constexpr int kJSObjectType = 0x421;
  static constexpr int kFirstJSApiObjectType = 0xAA00;
  static constexpr int kLastJSApiObjectType = 0xAAFF;
  static constexpr int kFirstEmbedderJSApiObjectType = 0;
  static constexpr int kLastEmbedderJSApiObjectType = 0;

  // Oddball kind constants
  static constexpr int kUndefinedOddballKind = 4;
  static constexpr int kNullOddballKind = 3;
  static constexpr int kFalseOddballKind = 1;
  static constexpr int kTrueOddballKind = 2;

  static void IncrementLongTasksStatsCounter() {}

  static bool PointerCompressionIsEnabled() { return false; }
  static bool SandboxIsEnabled() { return false; }
};

}  // namespace internal
}  // namespace v8

// Global scope aliases for instance types
#ifndef JS_OBJECT_TYPE
#define JS_OBJECT_TYPE 0x421
#endif
#ifndef ODDBALL_TYPE
#define ODDBALL_TYPE 0x83
#endif
#ifndef FOREIGN_TYPE
#define FOREIGN_TYPE 0x87
#endif
#ifndef FIRST_NONSTRING_TYPE
#define FIRST_NONSTRING_TYPE 0x80
#endif

// DoubleRegister and DoubleRegList forward declarations
namespace v8 {
namespace internal {

struct DoubleRegister {
  int code_ = 0;
  constexpr explicit DoubleRegister(int code = 0) : code_(code) {}
  constexpr int code() const { return code_; }
  constexpr bool operator==(DoubleRegister other) const {
    return code_ == other.code_;
  }
  constexpr bool operator!=(DoubleRegister other) const {
    return code_ != other.code_;
  }
};

class DoubleRegList {
 public:
  DoubleRegList() : bits_(0) {}

  void set(DoubleRegister reg) {
    bits_ |= (1u << reg.code());
  }

  bool has(DoubleRegister reg) const {
    return (bits_ & (1u << reg.code())) != 0;
  }

  int Count() const {
    unsigned count = 0;
    uint32_t b = bits_;
    while (b) { count += b & 1; b >>= 1; }
    return static_cast<int>(count);
  }

 private:
  uint32_t bits_;
};

}  // namespace internal
}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_INTERNALS_CONSTANTS_H_
