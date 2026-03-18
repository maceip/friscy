// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_NODE_MISSING_H_
#define WASI_V8_NODE_MISSING_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstdint>
#include <cstddef>
#include <memory>
#include <vector>
#include <functional>

namespace v8 {

// ---- Callback typedefs ----
template <class T> class Local;
template <class T> class MaybeLocal;
class Value;
class Context;
class String;
class Array;
class Isolate;
class Function;
class Object;
class Promise;
class Boolean;

typedef void (*FatalErrorCallback)(const char* location, const char* message);
typedef void (*OOMErrorCallback)(const char* location, bool is_heap_oom);

class PromiseRejectMessage;
typedef void (*PromiseRejectCallback)(PromiseRejectMessage message);

typedef bool (*AllowWasmCodeGenerationCallback)(Local<Context> context,
                                               Local<String> source);
typedef bool (*ModifyCodeGenerationFromStringsCallback2)(
    Local<Context> context, Local<Value> source, bool is_code_like);

// ---- Enums ----
enum class MicrotasksPolicy { kExplicit, kScoped, kAuto };

// ---- CppHeap stub ----
namespace cppgc {
class CustomSpaceBase;
class Heap;
}

#ifndef V8_CPPHEAP_DEFINED
#define V8_CPPHEAP_DEFINED
class Platform;

struct CppHeapCreateParams {
  std::vector<std::unique_ptr<cppgc::CustomSpaceBase>> custom_spaces;
};

class CppHeap {
 public:
  static std::unique_ptr<CppHeap> Create(Platform*, const CppHeapCreateParams&) {
    return nullptr;
  }
};
#endif

// ---- HandleScope stubs ----
#ifndef V8_HANDLESCOPE_DEFINED
#define V8_HANDLESCOPE_DEFINED
class HandleScope {
 public:
  explicit HandleScope(Isolate*) {}
  ~HandleScope() = default;
  HandleScope(const HandleScope&) = delete;
  void operator=(const HandleScope&) = delete;
  static int NumberOfHandles(Isolate*) { return 0; }
  Isolate* GetIsolate() const { return nullptr; }
};

class EscapableHandleScope : public HandleScope {
 public:
  explicit EscapableHandleScope(Isolate* isolate) : HandleScope(isolate) {}
  template <typename T> Local<T> Escape(Local<T> value) { return value; }
  template <typename T> MaybeLocal<T> EscapeMaybe(MaybeLocal<T> value) { return value; }
};
#endif

// ---- SnapshotCreator stub ----
struct StartupData {
  const char* data;
  int raw_size;
};

class SnapshotCreator {
 public:
  enum class FunctionCodeHandling { kClear, kKeep };
  explicit SnapshotCreator(Isolate*) {}
  ~SnapshotCreator() {}
  void SetDefaultContext(Local<Context>) {}
  size_t AddContext(Local<Context>) { return 0; }
  size_t AddData(Local<Value>) { return 0; }
  StartupData CreateBlob(FunctionCodeHandling) { return {nullptr, 0}; }
};

// ---- Isolate setter free functions ----
inline void Isolate_SetOOMErrorHandler(Isolate*, OOMErrorCallback) {}
inline void Isolate_SetFatalErrorHandler(Isolate*, FatalErrorCallback) {}
inline void Isolate_SetPromiseRejectCallback(Isolate*, PromiseRejectCallback) {}
inline void Isolate_SetAllowWasmCodeGenerationCallback(Isolate*, AllowWasmCodeGenerationCallback) {}
inline void Isolate_SetModifyCodeGenerationFromStringsCallback(Isolate*, ModifyCodeGenerationFromStringsCallback2) {}
inline void Isolate_SetMicrotasksPolicy(Isolate*, MicrotasksPolicy) {}
inline void Isolate_SetCppHeap(Isolate*, CppHeap*) {}

namespace internal {
inline Isolate* TryGetCurrent() { return nullptr; }
inline void IncrementLongTasksStatsCounter(v8::Isolate*) {}

using Address = uintptr_t;
class PtrComprCageBase {};

template <bool check_statically_enabled>
inline Address ReadExternalPointerField(Address field_address,
                                       const PtrComprCageBase&,
                                       uint64_t) {
  return 0;
}
}  // namespace internal

}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_NODE_MISSING_H_
