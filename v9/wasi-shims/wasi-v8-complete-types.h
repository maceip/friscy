// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_COMPLETE_TYPES_H_
#define WASI_V8_COMPLETE_TYPES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>

namespace v8 {

// Forward declarations
class Isolate;
class Value;
class Promise;
template <class T> class Local;

// ALL typed array classes via macro
#define WASI_TYPED_ARRAY_LIST(V) \
  V(Uint8Array)                  \
  V(Uint8ClampedArray)           \
  V(Int8Array)                   \
  V(Uint16Array)                 \
  V(Int16Array)                  \
  V(Uint32Array)                 \
  V(Int32Array)                  \
  V(Float16Array)                \
  V(Float32Array)                \
  V(Float64Array)                \
  V(BigInt64Array)               \
  V(BigUint64Array)

#define WASI_DECLARE_TYPED_ARRAY(TypedArray) \
  class TypedArray;

WASI_TYPED_ARRAY_LIST(WASI_DECLARE_TYPED_ARRAY)
#undef WASI_DECLARE_TYPED_ARRAY

// Callback typedefs
using FunctionCallback = void (*)(const void*);
using AccessorGetterCallback = void (*)(Local<class String>, const void*);
using AccessorNameGetterCallback = void (*)(Local<class Name>, const void*);

// PromiseRejectEvent enum
enum PromiseRejectEvent {
  kPromiseRejectWithNoHandler = 0,
  kPromiseHandlerAddedAfterReject = 1,
  kPromiseRejectAfterResolved = 2,
  kPromiseResolveAfterResolved = 3,
};

// PromiseRejectMessage class
class PromiseRejectMessage {
 public:
  PromiseRejectMessage() : event_(kPromiseRejectWithNoHandler) {}
  PromiseRejectMessage(Local<Promise> promise, PromiseRejectEvent event,
                       Local<Value> value)
      : event_(event) {
    (void)promise; (void)value;
  }

  Local<Promise> GetPromise() const { return Local<Promise>(); }
  PromiseRejectEvent GetEvent() const { return event_; }
  Local<Value> GetValue() const { return Local<Value>(); }

 private:
  PromiseRejectEvent event_;
};

// PromiseRejectCallback typedef
using PromiseRejectCallback = void (*)(PromiseRejectMessage);

// Isolate class with MessageErrorLevel and UseCounterFeature
class Isolate;

namespace internal {

// MessageErrorLevel for Isolate
enum class MessageErrorLevel {
  kMessageLog = (1 << 0),
  kMessageDebug = (1 << 1),
  kMessageInfo = (1 << 2),
  kMessageError = (1 << 3),
  kMessageWarning = (1 << 4),
  kMessageAll = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4),
};

// UseCounterFeature for Isolate
enum UseCounterFeature {
  kUseAsm = 0,
  kBreakIterator = 1,
  kLegacyConst = 2,
  kUseCounterFeatureCount = 3,
};

}  // namespace internal

}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_COMPLETE_TYPES_H_
