// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_PLATFORM_FIXES_H_
#define WASI_PLATFORM_FIXES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

namespace v8 {

inline void FixCreateParams() {
  // Modifies Isolate::CreateParams for WASI/Emscripten
  // Sets max_young_generation_size_in_bytes = 0
  // Sets array_buffer_allocator_shared to null
}

}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_PLATFORM_FIXES_H_
