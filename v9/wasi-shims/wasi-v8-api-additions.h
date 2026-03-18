// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_API_ADDITIONS_H_
#define WASI_V8_API_ADDITIONS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>
#include <vector>
#include "wasi-v8-api-stubs.h"

namespace v8 {

// MakeLocalVector template
template <class T>
inline std::vector<Local<T>> MakeLocalVector(Isolate* isolate,
                                             const Local<T>* begin,
                                             size_t length) {
  (void)isolate;
  return std::vector<Local<T>>(begin, begin + length);
}

// FixedArray stub
class FixedArray {
 public:
  int Length() const { return 0; }
  Local<Value> Get(Isolate* isolate, int index) const {
    (void)isolate; (void)index;
    return Local<Value>();
  }
};

// StringEquals function
inline bool StringEquals(Local<String> a, Local<String> b) {
  (void)a; (void)b;
  return false;
}

// SealHandleScope no-op
class SealHandleScope {
 public:
  explicit SealHandleScope(Isolate* isolate) { (void)isolate; }
  ~SealHandleScope() = default;
  SealHandleScope(const SealHandleScope&) = delete;
  SealHandleScope& operator=(const SealHandleScope&) = delete;
};

// ValueToBoolean helper
inline bool ValueToBoolean(Local<Value> value) {
  (void)value;
  return false;
}

// DefaultTracingController - complete no-op implementation
class TracingController {
 public:
  TracingController() = default;
  virtual ~TracingController() = default;

  virtual const uint8_t* GetCategoryGroupEnabled(const char* name) {
    (void)name;
    static uint8_t disabled = 0;
    return &disabled;
  }

  virtual uint64_t AddTraceEvent(
      char phase, const uint8_t* category_enabled_flag, const char* name,
      const char* scope, uint64_t id, uint64_t bind_id, int32_t num_args,
      const char** arg_names, const uint8_t* arg_types,
      const uint64_t* arg_values, unsigned int flags) {
    (void)phase; (void)category_enabled_flag; (void)name; (void)scope;
    (void)id; (void)bind_id; (void)num_args; (void)arg_names;
    (void)arg_types; (void)arg_values; (void)flags;
    return 0;
  }

  virtual uint64_t AddTraceEventWithTimestamp(
      char phase, const uint8_t* category_enabled_flag, const char* name,
      const char* scope, uint64_t id, uint64_t bind_id, int32_t num_args,
      const char** arg_names, const uint8_t* arg_types,
      const uint64_t* arg_values, unsigned int flags,
      int64_t timestamp) {
    (void)phase; (void)category_enabled_flag; (void)name; (void)scope;
    (void)id; (void)bind_id; (void)num_args; (void)arg_names;
    (void)arg_types; (void)arg_values; (void)flags; (void)timestamp;
    return 0;
  }

  virtual void UpdateTraceEventDuration(const uint8_t* category_enabled_flag,
                                        const char* name, uint64_t handle) {
    (void)category_enabled_flag; (void)name; (void)handle;
  }

  virtual void AddTraceStateObserver(void* observer) { (void)observer; }
  virtual void RemoveTraceStateObserver(void* observer) { (void)observer; }
};

}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_API_ADDITIONS_H_
