// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_RUNTIME_PROFILER_FIXES_H_
#define WASI_RUNTIME_PROFILER_FIXES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <vector>
#include <string>
#include <memory>

namespace v8 {

class Isolate;
template <class T> class Local;
class Value;
class String;
class Context;

// Isolate UseCounterFeature enum (52 entries)
enum UseCounterFeature {
  kUseAsm = 0,
  kBreakIterator,
  kLegacyConst,
  kMarkDequeOverflow,
  kStoreBufferOverflow,
  kSlotsBufferOverflow,
  kObjectObserve,
  kForcedGC,
  kSloppyMode,
  kStrictMode,
  kStrongMode,
  kRegExpPrototypeStickyGetter,
  kRegExpPrototypeToString,
  kV8FunctionConstructor,
  kV8FunctionConstructorReturnUndefined,
  kArrayPrototypeSortJSArrayModifiedPrototype,
  kArraySpeciesModified,
  kArrayPrototypeConstructorModified,
  kArrayInstanceProtoModified,
  kArrayInstanceConstructorModified,
  kLegacyFunctionDeclaration,
  kRegExpPrototypeSourceGetter,
  kRegExpPrototypeOldFlagGetter,
  kDecimalWithLeadingZeroInStrictMode,
  kLegacyDateParser,
  kDefineGetterOrSetterWouldThrow,
  kFunctionConstructorReturnedUndefined,
  kAssigmentExpressionLHSIsCallInSloppy,
  kAssigmentExpressionLHSIsCallInStrict,
  kPromiseConstructor,
  kPromiseResolve,
  kPromiseReject,
  kPromiseChain,
  kPromiseAccept,
  kPromiseDefer,
  kHtmlCommentInExternalScript,
  kHtmlComment,
  kSloppyModeBlockScopedFunctionRedefinition,
  kForInInitializer,
  kArrayPrototypeForEach,
  kArrayPrototypeMap,
  kArrayPrototypeFilter,
  kArrayPrototypeSome,
  kArrayPrototypeEvery,
  kArrayPrototypeFind,
  kArrayPrototypeFindIndex,
  kArrayPrototypeFill,
  kArrayPrototypeCopyWithin,
  kArrayPrototypeIncludes,
  kArrayPrototypeFlat,
  kArrayPrototypeFlatMap,
  kUseCounterFeatureCount,
};

// Isolate method stubs
namespace wasi_shim {

// Callback types
using UseCounterCallback = void (*)(Isolate*, UseCounterFeature);
using GCCallback = void (*)(Isolate*, int, int, void*);

inline void SetUseCounterCallback(Isolate* isolate, UseCounterCallback callback) {
  (void)isolate; (void)callback;
}

inline void RequestGarbageCollectionForTesting(Isolate* isolate, int type) {
  (void)isolate; (void)type;
}

// GC suppression stubs
inline void SetMicrotasksSuppressed(bool suppressed) {
  (void)suppressed;
}

inline bool IsMicrotasksSuppressed() { return false; }

}  // namespace wasi_shim

// CpuProfileNode class
class CpuProfileNode {
 public:
  const char* GetFunctionNameStr() const { return ""; }
  const char* GetScriptResourceNameStr() const { return ""; }
  int GetLineNumber() const { return 0; }
  int GetColumnNumber() const { return 0; }
  unsigned GetHitCount() const { return 0; }
  int GetChildrenCount() const { return 0; }
  const CpuProfileNode* GetChild(int index) const {
    (void)index;
    return nullptr;
  }
  unsigned GetNodeId() const { return 0; }
  int GetScriptId() const { return 0; }
  const char* GetBailoutReason() const { return ""; }
  unsigned int GetHitLineCount() const { return 0; }
};

// CpuProfile class
class CpuProfile {
 public:
  const char* GetTitle() const { return ""; }
  const CpuProfileNode* GetTopDownRoot() const { return nullptr; }
  int GetSamplesCount() const { return 0; }
  const CpuProfileNode* GetSample(int index) const {
    (void)index;
    return nullptr;
  }
  int64_t GetSampleTimestamp(int index) const {
    (void)index;
    return 0;
  }
  int64_t GetStartTime() const { return 0; }
  int64_t GetEndTime() const { return 0; }
  void Delete() {}
};

// CpuProfiler class
class CpuProfiler {
 public:
  static CpuProfiler* New(Isolate* isolate) {
    (void)isolate;
    static CpuProfiler instance;
    return &instance;
  }

  void Dispose() {}

  void StartProfiling(Local<String> title, bool record_samples = false) {
    (void)title; (void)record_samples;
  }

  CpuProfile* StopProfiling(Local<String> title) {
    (void)title;
    return nullptr;
  }

  void SetSamplingInterval(int us) { (void)us; }
  void SetUsePreciseSampling(bool precise) { (void)precise; }
};

// HeapProfiler class
class HeapProfiler {
 public:
  void TakeHeapSnapshot() {}
  bool StartTrackingHeapObjects(bool track_allocations = false) {
    (void)track_allocations;
    return false;
  }
  void StopTrackingHeapObjects() {}
};

// Tracing API
namespace platform {
namespace tracing {

inline const uint8_t* GetCategoryGroupEnabled(const char* name) {
  (void)name;
  static uint8_t disabled = 0;
  return &disabled;
}

inline uint64_t AddTraceEvent(
    char phase, const uint8_t* category_enabled_flag, const char* name,
    const char* scope, uint64_t id, uint64_t bind_id,
    int32_t num_args, const char** arg_names, const uint8_t* arg_types,
    const uint64_t* arg_values, unsigned int flags) {
  (void)phase; (void)category_enabled_flag; (void)name; (void)scope;
  (void)id; (void)bind_id; (void)num_args; (void)arg_names;
  (void)arg_types; (void)arg_values; (void)flags;
  return 0;
}

}  // namespace tracing
}  // namespace platform

// EmbedderStackStateScope
namespace internal {

class EmbedderStackStateScope {
 public:
  enum StackState { kMayContainHeapPointers, kNoHeapPointers };

  EmbedderStackStateScope(void* heap, StackState state) {
    (void)heap; (void)state;
  }
  ~EmbedderStackStateScope() = default;
};

}  // namespace internal

// OutputStream abstract class
class OutputStream {
 public:
  enum WriteResult { kContinue = 0, kAbort = 1 };

  virtual ~OutputStream() = default;
  virtual void EndOfStream() = 0;
  virtual int GetChunkSize() { return 65536; }
  virtual WriteResult WriteAsciiChunk(char* data, int size) = 0;
  virtual WriteResult WriteHeapStatsChunk(void* data, int items_count) {
    (void)data; (void)items_count;
    return kContinue;
  }
};

// DTOA conversion
namespace internal {

inline int DoubleToCString(double v, char* buf, int buf_size) {
  int n = snprintf(buf, buf_size, "%.17g", v);
  return n;
}

// Ring buffer utility
template <typename T, int kSize>
class RingBuffer {
 public:
  RingBuffer() : pos_(0), count_(0) {}

  void Push(const T& value) {
    buffer_[pos_] = value;
    pos_ = (pos_ + 1) % kSize;
    if (count_ < kSize) count_++;
  }

  int Count() const { return count_; }

  T& operator[](int index) {
    int actual = (pos_ - count_ + index + kSize) % kSize;
    return buffer_[actual];
  }

 private:
  T buffer_[kSize];
  int pos_;
  int count_;
};

// Foreign address tagging system
using ExternalPointerTag = uint64_t;
static constexpr ExternalPointerTag kExternalPointerNullTag = 0;
static constexpr ExternalPointerTag kAnyExternalPointerTag = ~static_cast<uint64_t>(0);

}  // namespace internal

}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_RUNTIME_PROFILER_FIXES_H_
