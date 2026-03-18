// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_SYSTEM_COMPAT_H_
#define WASI_SYSTEM_COMPAT_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstdint>
#include <cstddef>

// ---- Resource limit constants ----
#ifndef RLIMIT_NOFILE
#define RLIMIT_NOFILE 7
#endif

#ifndef RLIM_INFINITY
#define RLIM_INFINITY (~0ULL)
#endif

// ---- Network constants ----
#ifndef NI_NUMERICSERV
#define NI_NUMERICSERV 0x08
#endif

// ---- System clock ----
inline uint64_t SystemClockTimeMillis() {
  static uint64_t counter = 0;
  return ++counter;
}

// ---- cppgc statistics classes ----
namespace cppgc {

struct FreeListStats {
  size_t free_count = 0;
  size_t free_size = 0;
};

struct PageStatistics {
  size_t committed_size_bytes = 0;
  size_t used_size_bytes = 0;
  size_t wasted_size_bytes = 0;
  FreeListStats free_list_stats;
};

struct SpaceStatistics {
  size_t committed_size_bytes = 0;
  size_t used_size_bytes = 0;
  size_t wasted_size_bytes = 0;
  FreeListStats free_list_stats;
  size_t num_pages = 0;
};

}  // namespace cppgc

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_SYSTEM_COMPAT_H_
