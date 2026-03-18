// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_NAMESPACE_FIXES_H_
#define WASI_NAMESPACE_FIXES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <type_traits>

namespace v8 {
namespace base {

// Forward declarations
template <typename T>
struct hash {
  size_t operator()(T value) const {
    return static_cast<size_t>(value);
  }
};

template <typename E>
class Flags {
 public:
  using flag_type = E;
  using mask_type = typename std::underlying_type<E>::type;

  constexpr Flags() : mask_(0) {}
  constexpr Flags(E flag) : mask_(static_cast<mask_type>(flag)) {}
  constexpr explicit Flags(mask_type mask) : mask_(mask) {}

  constexpr bool operator==(Flags other) const { return mask_ == other.mask_; }
  constexpr bool operator!=(Flags other) const { return mask_ != other.mask_; }
  constexpr Flags operator|(Flags other) const { return Flags(mask_ | other.mask_); }
  constexpr Flags operator&(Flags other) const { return Flags(mask_ & other.mask_); }
  constexpr Flags operator^(Flags other) const { return Flags(mask_ ^ other.mask_); }
  constexpr Flags operator~() const { return Flags(~mask_); }
  Flags& operator|=(Flags other) { mask_ |= other.mask_; return *this; }
  Flags& operator&=(Flags other) { mask_ &= other.mask_; return *this; }
  constexpr operator mask_type() const { return mask_; }

 private:
  mask_type mask_;
};

template <typename E>
class EnumSet {
 public:
  constexpr EnumSet() : bits_(0) {}
  void Add(E element) { bits_ |= (1u << static_cast<unsigned>(element)); }
  void Remove(E element) { bits_ &= ~(1u << static_cast<unsigned>(element)); }
  bool Contains(E element) const {
    return (bits_ & (1u << static_cast<unsigned>(element))) != 0;
  }
  bool IsEmpty() const { return bits_ == 0; }

 private:
  unsigned bits_;
};

// Memory functions
inline void* Malloc(size_t size) { return ::malloc(size); }
inline void Free(void* ptr) { ::free(ptr); }

inline void* AllocatePages(void* hint, size_t size, size_t alignment, int access) {
  (void)hint; (void)alignment; (void)access;
  return ::malloc(size);
}

inline bool FreePages(void* address, size_t size) {
  (void)size;
  ::free(address);
  return true;
}

// Page initialization/freeing modes
enum class PageInitializationMode {
  kAllocatedPagesCanBeUninitialized,
  kAllocatedPagesMustBeZeroInitialized,
};

enum class PageFreeingMode {
  kMakeInaccessible,
  kDiscard,
};

// Bit manipulation wrappers
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

namespace bits {
using ::v8::base::CountLeadingZeros;
using ::v8::base::CountPopulation;
}  // namespace bits

}  // namespace base

// Alias into v8::internal::base
namespace internal {
namespace base {
using namespace ::v8::base;
}  // namespace base
}  // namespace internal
}  // namespace v8

// AllocationResult forward declaration
namespace v8 {
namespace internal {
class AllocationResult {
 public:
  AllocationResult() = default;
};
}  // namespace internal
}  // namespace v8

// SegmentedTable class stub
namespace v8 {
namespace internal {

template <typename Entry, size_t kReservationSize = 1024 * 1024>
class SegmentedTable {
 public:
  struct FreelistHead {
    uint32_t next_ = 0;
    uint32_t length_ = 0;

    FreelistHead() = default;
    FreelistHead(uint32_t next, uint32_t length)
        : next_(next), length_(length) {}

    bool is_empty() const { return length_ == 0; }
  };

  SegmentedTable() = default;
  virtual ~SegmentedTable() = default;
};

}  // namespace internal
}  // namespace v8

// Custom mutex wrapper with both lock/unlock and Lock/Unlock styles
namespace v8 {
namespace base {

class WasiMutex {
 public:
  WasiMutex() = default;
  ~WasiMutex() = default;

  void lock() { mutex_.lock(); }
  void unlock() { mutex_.unlock(); }
  bool try_lock() { return mutex_.try_lock(); }

  void Lock() { lock(); }
  void Unlock() { unlock(); }
  bool TryLock() { return try_lock(); }

 private:
  std::mutex mutex_;
};

}  // namespace base
}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_NAMESPACE_FIXES_H_
