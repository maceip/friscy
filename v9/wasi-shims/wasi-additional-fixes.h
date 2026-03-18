// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_ADDITIONAL_FIXES_H_
#define WASI_ADDITIONAL_FIXES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstdint>
#include <cstddef>
#include <initializer_list>
#include <algorithm>

namespace v8 {
namespace internal {

// ---- Zone Methods ----
template <typename T>
class ZoneVector;

// ---- Hash function specialization for double ----
inline size_t hash_double(double value) {
  uint64_t bits;
  __builtin_memcpy(&bits, &value, sizeof(bits));
  return static_cast<size_t>(bits ^ (bits >> 32));
}

// ---- CountLeadingSignBits ----
inline int CountLeadingSignBits(int32_t value) {
  if (value >= 0) return __builtin_clz(value) - 1;
  return __builtin_clz(~value) - 1;
}

// ---- Assembler stubs ----
class AssemblerBase {
 public:
  void RecordComment(const char*) {}
};

class MacroAssembler : public AssemblerBase {
 public:
  void InitializeRootRegister() {}
};

// ---- Register conversion ----
class Register {
 public:
  int code_ = 0;
  static Register from_code(int code) { Register r; r.code_ = code; return r; }
};

class DoubleRegister {
 public:
  int code_ = 0;
};

class Simd128Register {
 public:
  int code_ = 0;
};

inline Register ToRegister(DoubleRegister r) {
  return Register::from_code(r.code_);
}

inline Register ToRegister(Simd128Register r) {
  return Register::from_code(r.code_);
}

// ---- DeoptimizeReason ----
enum class DeoptimizeReason {
  kNoReason,
  kUnknown,
  kWrongMap,
  kMissingMap,
  kInsufficientTypeFeedbackForGenericNamedAccess,
  kInsufficientTypeFeedbackForGenericKeyedAccess,
  kWrongCallTarget,
  kWrongEnumIndices,
  kArrayBufferWasDetached,
  kLostPrecision,
  kLostPrecisionOrNaN,
  kNotAHeapNumber,
  kNotAJavaScriptObject,
  kNotASmi,
  kOutOfBounds,
  kOverflow,
  kDivisionByZero,
};

inline const char* DeoptimizeReasonToString(DeoptimizeReason reason) {
  return "deopt";
}

// ---- AssertCondition ----
enum class AssertCondition {
  kEqual,
  kNotEqual,
  kLessThan,
  kLessThanOrEqual,
  kGreaterThan,
  kGreaterThanOrEqual,
};

// ---- SmallVector ----
template <typename T, size_t kInlineSize = 8>
class SmallVector {
 public:
  SmallVector() : size_(0) {}
  SmallVector(std::initializer_list<T> init) : size_(0) {
    for (const auto& v : init) push_back(v);
  }
  SmallVector(const SmallVector& other) : size_(other.size_) {
    std::copy(other.data_, other.data_ + size_, data_);
  }
  SmallVector(SmallVector&& other) noexcept : size_(other.size_) {
    std::copy(other.data_, other.data_ + size_, data_);
    other.size_ = 0;
  }

  void push_back(const T& v) {
    if (size_ < kInlineSize) data_[size_++] = v;
  }
  size_t size() const { return size_; }
  bool empty() const { return size_ == 0; }
  T& operator[](size_t i) { return data_[i]; }
  const T& operator[](size_t i) const { return data_[i]; }
  T* data() { return data_; }
  const T* data() const { return data_; }
  T* begin() { return data_; }
  T* end() { return data_ + size_; }
  const T* begin() const { return data_; }
  const T* end() const { return data_ + size_; }

 private:
  T data_[kInlineSize];
  size_t size_;
};

// ---- MachineRepresentation / MachineType helpers ----
enum class MachineRepresentation : uint8_t {
  kNone, kBit, kWord8, kWord16, kWord32, kWord64,
  kFloat32, kFloat64, kSimd128, kTaggedSigned,
  kTaggedPointer, kTagged, kCompressedPointer, kCompressed,
};

enum class MachineType {
  kNone, kInt8, kUint8, kInt16, kUint16, kInt32, kUint32,
  kInt64, kUint64, kFloat32, kFloat64,
};

inline bool Is64(MachineRepresentation rep) {
  return rep == MachineRepresentation::kWord64 ||
         rep == MachineRepresentation::kFloat64;
}

inline bool Is64(MachineType type) {
  return type == MachineType::kInt64 ||
         type == MachineType::kUint64 ||
         type == MachineType::kFloat64;
}

// ---- Wasm structs ----
namespace wasm {
struct CatchCase {
  CatchCase() = default;
};
struct HandlerCase {
  HandlerCase() = default;
};
}  // namespace wasm

}  // namespace internal
}  // namespace v8

// ---- std::hash for StrongAlias ----
namespace v8 {
namespace base {
template <typename TagType, typename UnderlyingType>
class StrongAlias {
 public:
  explicit StrongAlias(UnderlyingType v) : value_(v) {}
  UnderlyingType value() const { return value_; }
  bool operator==(const StrongAlias& other) const { return value_ == other.value_; }
 private:
  UnderlyingType value_;
};
}  // namespace base
}  // namespace v8

namespace std {
template <typename TagType, typename UnderlyingType>
struct hash<v8::base::StrongAlias<TagType, UnderlyingType>> {
  size_t operator()(const v8::base::StrongAlias<TagType, UnderlyingType>& alias) const {
    return std::hash<UnderlyingType>{}(alias.value());
  }
};
}  // namespace std

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_ADDITIONAL_FIXES_H_
