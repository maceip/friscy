// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_COMPLETE_MISSING_H_
#define WASI_V8_COMPLETE_MISSING_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <memory>
#include <string>
#include <vector>
#include <functional>

namespace cppgc {

// Heap enums
enum class MarkingType {
  kAtomic,
  kIncremental,
  kIncrementalAndConcurrent,
};

enum class SweepingType {
  kAtomic,
  kIncremental,
  kIncrementalAndConcurrent,
};

enum class StackState {
  kMayContainHeapPointers,
  kNoHeapPointers,
};

}  // namespace cppgc

namespace v8 {

// Forward declarations for ALL V8 types
class Isolate;
class Context;
class Value;
class Primitive;
class Boolean;
class Number;
class Integer;
class Int32;
class Uint32;
class BigInt;
class String;
class Symbol;
class Name;
class Object;
class Array;
class Map;
class Set;
class Function;
class Promise;
class Proxy;
class RegExp;
class Date;
class External;
class ArrayBuffer;
class ArrayBufferView;
class TypedArray;
class DataView;
class SharedArrayBuffer;
class Script;
class Module;
class UnboundScript;
class UnboundModuleScript;
class Data;
class Private;
class Signature;
class AccessorSignature;
class Template;
class ObjectTemplate;
class FunctionTemplate;
class Message;
class StackTrace;
class StackFrame;
class WasmModuleObject;
class WasmMemoryObject;

template <class T> class Local;
template <class T> class MaybeLocal;
template <class T> class Global;
template <class T> class Persistent;
template <class T> class Eternal;
template <class T> class PersistentBase;
template <class T> class NonCopyablePersistentTraits;

// IsolateMessageErrorLevel enum
enum class MessageErrorLevel {
  kMessageLog = (1 << 0),
  kMessageDebug = (1 << 1),
  kMessageInfo = (1 << 2),
  kMessageError = (1 << 3),
  kMessageWarning = (1 << 4),
  kMessageAll = kMessageLog | kMessageDebug | kMessageInfo |
                kMessageError | kMessageWarning,
};

// Callback typedefs
using FunctionCallback = void (*)(const void*);
using AccessorGetterCallback = void (*)(Local<String>, const void*);
using AccessorSetterCallback = void (*)(Local<String>, Local<Value>, const void*);
using AccessorNameGetterCallback = void (*)(Local<Name>, const void*);
using AccessorNameSetterCallback = void (*)(Local<Name>, Local<Value>, const void*);
using GenericNamedPropertyGetterCallback = void (*)(Local<Name>, const void*);
using GenericNamedPropertySetterCallback = void (*)(Local<Name>, Local<Value>, const void*);
using GenericNamedPropertyQueryCallback = void (*)(Local<Name>, const void*);
using GenericNamedPropertyDeleterCallback = void (*)(Local<Name>, const void*);
using GenericNamedPropertyEnumeratorCallback = void (*)(const void*);
using IndexedPropertyGetterCallbackV2 = void (*)(uint32_t, const void*);
using IndexedPropertySetterCallbackV2 = void (*)(uint32_t, Local<Value>, const void*);
using IndexedPropertyQueryCallbackV2 = void (*)(uint32_t, const void*);
using IndexedPropertyDeleterCallbackV2 = void (*)(uint32_t, const void*);
using IndexedPropertyEnumeratorCallback = void (*)(const void*);

// MicrotasksPolicy enum
enum class MicrotasksPolicy {
  kExplicit,
  kScoped,
  kAuto,
};

// StartupData struct
struct StartupData {
  const char* data = nullptr;
  int raw_size = 0;
};

// CppHeapCreateParams
struct CppHeapCreateParams {
  std::vector<std::string> custom_spaces;
  cppgc::MarkingType marking_support = cppgc::MarkingType::kAtomic;
  cppgc::SweepingType sweeping_support = cppgc::SweepingType::kAtomic;
};

// CppHeap class
class CppHeap {
 public:
  static std::unique_ptr<CppHeap> Create(
      void* platform, const CppHeapCreateParams& params) {
    (void)platform; (void)params;
    return nullptr;
  }

  virtual ~CppHeap() = default;

  cppgc::AllocationHandle& GetAllocationHandle() {
    static cppgc::AllocationHandle* handle = nullptr;
    return *handle;
  }

  void CollectGarbageForTesting(cppgc::StackState stack_state) {
    (void)stack_state;
  }

  void CollectGarbageInYoungGenerationForTesting(
      cppgc::StackState stack_state) {
    (void)stack_state;
  }
};

// ArrayBuffer::Allocator
class ArrayBufferAllocator {
 public:
  virtual ~ArrayBufferAllocator() = default;
  virtual void* Allocate(size_t length) {
    void* data = ::calloc(1, length);
    return data;
  }
  virtual void* AllocateUninitialized(size_t length) {
    return ::malloc(length);
  }
  virtual void Free(void* data, size_t length) {
    (void)length;
    ::free(data);
  }
  virtual void* Reallocate(void* data, size_t old_length, size_t new_length) {
    (void)old_length;
    return ::realloc(data, new_length);
  }

  static std::unique_ptr<ArrayBufferAllocator> NewDefaultAllocator() {
    return std::make_unique<ArrayBufferAllocator>();
  }
};

// HandleScope stub
class HandleScope {
 public:
  explicit HandleScope(Isolate* isolate) { (void)isolate; }
  ~HandleScope() = default;
  HandleScope(const HandleScope&) = delete;
  HandleScope& operator=(const HandleScope&) = delete;
};

// EscapableHandleScope stub
class EscapableHandleScope : public HandleScope {
 public:
  explicit EscapableHandleScope(Isolate* isolate)
      : HandleScope(isolate) {}

  template <class T>
  Local<T> Escape(Local<T> value) {
    return value;
  }

  template <class T>
  MaybeLocal<T> EscapeMaybe(MaybeLocal<T> value) {
    return value;
  }
};

// SnapshotCreator stub
class SnapshotCreator {
 public:
  enum class FunctionCodeHandling {
    kClear,
    kKeep,
  };

  SnapshotCreator() = default;
  explicit SnapshotCreator(Isolate* isolate,
                           const intptr_t* external_references = nullptr,
                           const StartupData* existing_snapshot = nullptr) {
    (void)isolate; (void)external_references; (void)existing_snapshot;
  }

  ~SnapshotCreator() = default;

  Isolate* GetIsolate() { return nullptr; }

  void SetDefaultContext(Local<Context> context) { (void)context; }

  size_t AddContext(Local<Context> context) {
    (void)context;
    return 0;
  }

  StartupData CreateBlob(
      FunctionCodeHandling function_code_handling) {
    (void)function_code_handling;
    return StartupData{nullptr, 0};
  }

  size_t AddData(Local<Value> data) {
    (void)data;
    return 0;
  }

  template <class T>
  size_t AddData(Local<Context> context, Local<T> data) {
    (void)context; (void)data;
    return 0;
  }
};

// TryCatch stub
class TryCatch {
 public:
  explicit TryCatch(Isolate* isolate) { (void)isolate; }
  ~TryCatch() = default;

  bool HasCaught() const { return false; }
  bool CanContinue() const { return true; }
  bool HasTerminated() const { return false; }

  Local<Value> ReThrow() { return Local<Value>(); }
  Local<Value> Exception() const { return Local<Value>(); }
  Local<Value> StackTrace(Local<Context> context) const {
    (void)context;
    return Local<Value>();
  }
  Local<Message> Message_() const { return Local<Message>(); }

  void Reset() {}
  void SetVerbose(bool value) { (void)value; }
  bool IsVerbose() const { return false; }
  void SetCaptureMessage(bool value) { (void)value; }

  TryCatch(const TryCatch&) = delete;
  TryCatch& operator=(const TryCatch&) = delete;
};

// Isolate extension free functions
namespace wasi_shim {

inline void SetFatalErrorHandler(Isolate* isolate, void* handler) {
  (void)isolate; (void)handler;
}

inline void SetOOMErrorHandler(Isolate* isolate, void* handler) {
  (void)isolate; (void)handler;
}

inline void SetAbortOnUncaughtExceptionCallback(Isolate* isolate,
                                                 void* callback) {
  (void)isolate; (void)callback;
}

inline void SetPromiseRejectCallback(Isolate* isolate, void* callback) {
  (void)isolate; (void)callback;
}

inline void AddMessageListener(Isolate* isolate, void* listener) {
  (void)isolate; (void)listener;
}

inline void SetHostImportModuleDynamicallyCallback(Isolate* isolate,
                                                    void* callback) {
  (void)isolate; (void)callback;
}

inline void SetHostInitializeImportMetaObjectCallback(Isolate* isolate,
                                                       void* callback) {
  (void)isolate; (void)callback;
}

inline void SetPrepareStackTraceCallback(Isolate* isolate, void* callback) {
  (void)isolate; (void)callback;
}

}  // namespace wasi_shim

}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_COMPLETE_MISSING_H_
