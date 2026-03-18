// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_ISOLATE_EXTENSIONS_H_
#define WASI_V8_ISOLATE_EXTENSIONS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>

namespace v8 {
namespace wasi_shim {

// Heap statistics (zeroed structs)
struct HeapStatistics {
  size_t total_heap_size = 0;
  size_t total_heap_size_executable = 0;
  size_t total_physical_size = 0;
  size_t total_available_size = 0;
  size_t used_heap_size = 0;
  size_t heap_size_limit = 0;
  size_t malloced_memory = 0;
  size_t external_memory = 0;
  size_t peak_malloced_memory = 0;
  size_t number_of_native_contexts = 0;
  size_t number_of_detached_contexts = 0;
  size_t does_zap_garbage = 0;
};

struct HeapSpaceStatistics {
  const char* space_name = "";
  size_t space_size = 0;
  size_t space_used_size = 0;
  size_t space_available_size = 0;
  size_t physical_space_size = 0;
};

// Code/metadata stats (zeroed)
struct HeapCodeStatistics {
  size_t code_and_metadata_size = 0;
  size_t bytecode_and_metadata_size = 0;
  size_t external_script_source_size = 0;
  size_t cpu_profiler_metadata_size = 0;
};

// Context check (always true)
inline bool IsInContext() { return true; }

// Hash seed
inline uint64_t GetHashSeed() { return 0x12345678ULL; }

// Promise hook (no-op)
inline void SetPromiseHook(void* hook) { (void)hook; }

// Stack trace config (no-op)
inline void SetCaptureStackTraceForUncaughtExceptions(
    bool capture, int frame_limit = 10, int options = 0) {
  (void)capture; (void)frame_limit; (void)options;
}

// Error throwing (returns empty values)
// These return opaque pointers that must be cast by the caller
inline void* ThrowError(const char* message) {
  (void)message;
  return nullptr;
}

inline void* ThrowException(void* exception) {
  (void)exception;
  return nullptr;
}

}  // namespace wasi_shim
}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_ISOLATE_EXTENSIONS_H_
