// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_OPERATOR_FIX_H_
#define WASI_V8_OPERATOR_FIX_H_

namespace v8 {
namespace internal {
namespace compiler {

class Operator {
 public:
  enum Property {
    kNoProperties = 0,
    kCommutative = 1 << 0,
    kAssociative = 1 << 1,
    kIdempotent = 1 << 2,
    kNoDeopt = 1 << 3,
    kNoThrow = 1 << 4,
    kNoWrite = 1 << 5,
    kNoRead = 1 << 6,
    kFoldable = kNoDeopt | kNoThrow,
    kEliminatable = kNoDeopt | kNoThrow | kNoWrite,
    kPure = kNoDeopt | kNoThrow | kNoWrite | kNoRead,
  };

  class Properties {
   public:
    using mask_type = unsigned;

    constexpr Properties() : mask_(0) {}
    constexpr explicit Properties(mask_type mask) : mask_(mask) {}
    constexpr Properties(Property p) : mask_(static_cast<mask_type>(p)) {}

    constexpr bool operator==(Properties other) const {
      return mask_ == other.mask_;
    }
    constexpr bool operator!=(Properties other) const {
      return mask_ != other.mask_;
    }
    constexpr Properties operator|(Properties other) const {
      return Properties(mask_ | other.mask_);
    }
    constexpr Properties operator&(Properties other) const {
      return Properties(mask_ & other.mask_);
    }
    constexpr Properties operator^(Properties other) const {
      return Properties(mask_ ^ other.mask_);
    }
    constexpr Properties operator~() const { return Properties(~mask_); }

    Properties& operator|=(Properties other) {
      mask_ |= other.mask_;
      return *this;
    }
    Properties& operator&=(Properties other) {
      mask_ &= other.mask_;
      return *this;
    }

    constexpr operator mask_type() const { return mask_; }

   private:
    mask_type mask_;
  };

  Operator() = default;
  virtual ~Operator() = default;

  Properties properties() const { return properties_; }

 private:
  Properties properties_;
};

}  // namespace compiler
}  // namespace internal
}  // namespace v8

#endif  // WASI_V8_OPERATOR_FIX_H_
