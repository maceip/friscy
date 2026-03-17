// Shim for sys/mman.h on Emscripten
// Makes mmap appear unavailable so Abseil auto-defines ABSL_LOW_LEVEL_ALLOC_MISSING
#ifndef SYS_MMAN_EMSCRIPTEN_SHIM
#define SYS_MMAN_EMSCRIPTEN_SHIM

// Don't define MAP_FAILED or mmap prototypes - this forces Abseil to
// detect mmap as unavailable and use malloc fallback instead

// Only define what Abseil needs for the "missing" path
#define ABSL_HAVE_MMAP 0

#endif
