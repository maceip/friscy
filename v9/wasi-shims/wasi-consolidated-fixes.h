// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_CONSOLIDATED_FIXES_H_
#define WASI_CONSOLIDATED_FIXES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <functional>

// ---- Assertion macros (no-ops) ----
#ifndef CHECK
#define CHECK(condition) ((void)0)
#endif
#ifndef DCHECK
#define DCHECK(condition) ((void)0)
#endif
#ifndef CHECK_EQ
#define CHECK_EQ(a, b) ((void)0)
#endif
#ifndef DCHECK_EQ
#define DCHECK_EQ(a, b) ((void)0)
#endif
#ifndef CHECK_NE
#define CHECK_NE(a, b) ((void)0)
#endif
#ifndef DCHECK_NE
#define DCHECK_NE(a, b) ((void)0)
#endif
#ifndef CHECK_LT
#define CHECK_LT(a, b) ((void)0)
#endif
#ifndef DCHECK_LT
#define DCHECK_LT(a, b) ((void)0)
#endif
#ifndef CHECK_LE
#define CHECK_LE(a, b) ((void)0)
#endif
#ifndef DCHECK_LE
#define DCHECK_LE(a, b) ((void)0)
#endif
#ifndef CHECK_GT
#define CHECK_GT(a, b) ((void)0)
#endif
#ifndef DCHECK_GT
#define DCHECK_GT(a, b) ((void)0)
#endif
#ifndef CHECK_GE
#define CHECK_GE(a, b) ((void)0)
#endif
#ifndef DCHECK_GE
#define DCHECK_GE(a, b) ((void)0)
#endif
#ifndef CHECK_NOT_NULL
#define CHECK_NOT_NULL(ptr) ((void)0)
#endif
#ifndef DCHECK_NOT_NULL
#define DCHECK_NOT_NULL(ptr) ((void)0)
#endif

namespace v8 {
namespace base {

// Base types
using Address = uintptr_t;

template <typename T>
struct hash {
  size_t operator()(T value) const {
    return static_cast<size_t>(value);
  }
};

class AllocationResult {
 public:
  AllocationResult() = default;
};

class Mutex {
 public:
  Mutex() = default;
  ~Mutex() = default;

  void Lock() { mutex_.lock(); }
  void Unlock() { mutex_.unlock(); }
  bool TryLock() { return mutex_.try_lock(); }

  void lock() { Lock(); }
  void unlock() { Unlock(); }
  bool try_lock() { return TryLock(); }

 private:
  std::mutex mutex_;
};

class MutexGuard {
 public:
  explicit MutexGuard(Mutex* mutex) : mutex_(mutex) {
    if (mutex_) mutex_->Lock();
  }
  ~MutexGuard() {
    if (mutex_) mutex_->Unlock();
  }
  MutexGuard(const MutexGuard&) = delete;
  MutexGuard& operator=(const MutexGuard&) = delete;

 private:
  Mutex* mutex_;
};

// Memory allocation
inline void* AllocatePages(void* hint, size_t size, size_t alignment,
                           int access) {
  (void)hint; (void)alignment; (void)access;
  return ::malloc(size);
}

inline bool FreePages(void* address, size_t size) {
  (void)size;
  ::free(address);
  return true;
}

inline void* Malloc(size_t size) { return ::malloc(size); }
inline void Free(void* ptr) { ::free(ptr); }

inline void* Calloc(size_t count, size_t size) {
  return ::calloc(count, size);
}

inline void* Realloc(void* ptr, size_t size) {
  return ::realloc(ptr, size);
}

// Bit manipulation
namespace bits {

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
inline bool IsPowerOfTwo(T value) {
  return value > 0 && (value & (value - 1)) == 0;
}

template <typename T>
inline T RoundUpToPowerOfTwo(T value) {
  if (value == 0) return 1;
  value--;
  for (size_t i = 1; i < sizeof(T) * 8; i <<= 1) {
    value |= value >> i;
  }
  return value + 1;
}

}  // namespace bits

}  // namespace base
}  // namespace v8

// Alias into v8::internal::base
namespace v8 {
namespace internal {
namespace base {
using namespace ::v8::base;
}  // namespace base
}  // namespace internal
}  // namespace v8

// SegmentedTable template with freelist management
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

 protected:
  Entry* base_ = nullptr;
  size_t capacity_ = 0;
  FreelistHead freelist_;
};

}  // namespace internal
}  // namespace v8

// node::Environment, node::MemoryTracker forward declarations
namespace node {

class Environment;

class MemoryTracker {
 public:
  MemoryTracker() = default;
  virtual ~MemoryTracker() = default;

  void TrackFieldWithSize(const char* name, size_t size) {
    (void)name; (void)size;
  }

  template <typename T>
  void TrackField(const char* name, const T& value) {
    (void)name; (void)value;
  }
};

}  // namespace node

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_CONSOLIDATED_FIXES_H_
