// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_API_STUBS_H_
#define WASI_V8_API_STUBS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>

namespace v8 {

// Forward declarations
class Isolate;
class Context;
class Value;
class Object;
class String;
class Function;
class Boolean;
class Number;
class Integer;
class Int32;
class Uint32;
class BigInt;
class Array;
class Map;
class Set;
class Promise;
class Proxy;
class RegExp;
class Date;
class Symbol;
class External;
class Name;
class Message;
class StackTrace;
class StackFrame;
class Script;
class Module;
class UnboundScript;
class UnboundModuleScript;
class Data;
class Private;

template <class T> class Local;
template <class T> class MaybeLocal;
template <class T> class Global;
template <class T> class Persistent;
template <class T> class Eternal;

namespace internal {
using Address = uintptr_t;
}  // namespace internal

// Size constants
static constexpr int kApiSystemPointerSize = sizeof(void*);
static constexpr int kApiDoubleSize = sizeof(double);
static constexpr int kApiSizetSize = sizeof(size_t);
static constexpr int kApiTaggedSize = 4;
static constexpr int kApiInt32Size = sizeof(int32_t);
static constexpr int kApiInt64Size = sizeof(int64_t);

// HandleScope stubs
class HandleScope {
 public:
  explicit HandleScope(Isolate* isolate) { (void)isolate; }
  ~HandleScope() = default;

  HandleScope(const HandleScope&) = delete;
  HandleScope& operator=(const HandleScope&) = delete;

 protected:
  Isolate* isolate_ = nullptr;
};

class EscapableHandleScope : public HandleScope {
 public:
  explicit EscapableHandleScope(Isolate* isolate) : HandleScope(isolate) {}

  template <class T>
  Local<T> Escape(Local<T> value) {
    return value;
  }

  template <class T>
  MaybeLocal<T> EscapeMaybe(MaybeLocal<T> value) {
    return value;
  }
};

// SmiValue
inline int SmiValue(internal::Address value) {
  return static_cast<int>(static_cast<intptr_t>(value) >> 1);
}

// IncrementLongTasksStatsCounter
inline void IncrementLongTasksStatsCounter() {}

// TryGetCurrent
inline Isolate* TryGetCurrent() { return nullptr; }

}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_API_STUBS_H_
