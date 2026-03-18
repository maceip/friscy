// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_COMPREHENSIVE_FIXES_H_
#define WASI_COMPREHENSIVE_FIXES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <memory>
#include <string>
#include <functional>

// ---- Assertion macros ----
#ifndef DCHECK_BOUNDS
#define DCHECK_BOUNDS(index, length) ((void)0)
#endif

#ifndef CHECK_IMPLIES
#define CHECK_IMPLIES(a, b) ((void)0)
#endif

namespace v8 {
namespace internal {

using Address = uintptr_t;

// Namespace re-exports from ::v8::base into v8::internal::base
namespace base {

// Memory utils
inline void Relaxed_Memcpy(void* dst, const void* src, size_t size) {
  std::memcpy(dst, src, size);
}

inline void* AlignedAlloc(size_t size, size_t alignment) {
  void* ptr = nullptr;
#if defined(__EMSCRIPTEN__) || defined(__wasi__)
  // aligned_alloc requires size to be multiple of alignment
  size_t aligned_size = (size + alignment - 1) & ~(alignment - 1);
  ptr = ::aligned_alloc(alignment, aligned_size);
#else
  (void)::posix_memalign(&ptr, alignment, size);
#endif
  return ptr;
}

inline void AlignedFree(void* ptr) {
  ::free(ptr);
}

}  // namespace base

// ZoneVector to Vector conversions
template <typename T>
class Vector {
 public:
  Vector() : start_(nullptr), length_(0) {}
  Vector(T* start, size_t length) : start_(start), length_(length) {}

  T* begin() const { return start_; }
  T* end() const { return start_ + length_; }
  size_t size() const { return length_; }
  size_t length() const { return length_; }
  bool empty() const { return length_ == 0; }
  T& operator[](size_t index) { return start_[index]; }
  const T& operator[](size_t index) const { return start_[index]; }

  Vector<T> SubVector(size_t from, size_t to) const {
    return Vector<T>(start_ + from, to - from);
  }

 private:
  T* start_;
  size_t length_;
};

template <typename T>
inline Vector<T> VectorOf(std::vector<T>& v) {
  return Vector<T>(v.data(), v.size());
}

template <typename T>
inline Vector<const T> VectorOf(const std::vector<T>& v) {
  return Vector<const T>(v.data(), v.size());
}

// UseCounterFeature enum
enum UseCounterFeature {
  kUseCounterFeatureCount = 0,
};

// Memory constants
static constexpr size_t kZonePageSize = 256 * 1024;       // 256KB
static constexpr size_t kOSPageSize = 4096;                // 4KB
static constexpr size_t kMaxRegularHeapObjectSize = 128 * 1024;

// Profiling: abstract base for heap snapshots
class HeapSnapshotGenerator {
 public:
  virtual ~HeapSnapshotGenerator() = default;
  virtual bool GenerateSnapshot() { return false; }
};

// CPU profiling base
class CpuProfilerBase {
 public:
  virtual ~CpuProfilerBase() = default;
  virtual void StartProfiling(const char* title) { (void)title; }
  virtual void StopProfiling(const char* title) { (void)title; }
};

// ModuleWireBytes constructors
class ModuleWireBytes {
 public:
  ModuleWireBytes() : start_(nullptr), end_(nullptr) {}
  ModuleWireBytes(const uint8_t* start, const uint8_t* end)
      : start_(start), end_(end) {}
  explicit ModuleWireBytes(Vector<const uint8_t> bytes)
      : start_(bytes.begin()),
        end_(bytes.begin() + bytes.size()) {}

  const uint8_t* start() const { return start_; }
  const uint8_t* end() const { return end_; }
  size_t length() const {
    return static_cast<size_t>(end_ - start_);
  }

  Vector<const uint8_t> module_bytes() const {
    return Vector<const uint8_t>(start_, length());
  }

 private:
  const uint8_t* start_;
  const uint8_t* end_;
};

// V8 API stubs for WASM callbacks
using WasmStreamingCallback = void (*)(const void*);

inline void SetWasmStreamingCallback(void* callback) {
  (void)callback;
}

}  // namespace internal
}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_COMPREHENSIVE_FIXES_H_
