// V8 Wasm Target Stubs
// Provides stub implementations for symbols that are needed by V8's core
// but come from subsystems we exclude (JIT compiler, snapshot, profiler, etc.)
//
// These stubs allow V8 to link and initialize in jitless/no-snapshot mode.
// Each stub is the minimum implementation needed — return 0, do nothing, etc.

#include <cstdint>
#include <cstddef>
#include <cstdlib>

// Prevent V8 from trying to use JIT-compiled code
// In jitless mode, these paths shouldn't be reached, but the linker
// needs the symbols to exist.

namespace v8 {
namespace internal {

// ====== Trap Handler (signals not available in Wasm) ======
// V8 checks V8_TRAP_HANDLER_SUPPORTED at compile time, but some
// references leak through. Stub them.

}  // namespace internal
}  // namespace v8

// ====== CPU Profiler stubs ======
// Referenced by isolate.cc but not needed for basic JS execution

// ====== Debug stubs ======
// Referenced by isolate.cc for debug break handling

// ====== Thread isolation stubs ======
// V8's thread isolation uses signal handlers on Linux
// Not available in Wasm

#ifdef __EMSCRIPTEN__
// Provide memfd_create stub (V8 uses it for code range on Linux)
extern "C" {
    int memfd_create(const char* name, unsigned int flags) {
        return -1;  // Not supported — V8 falls back to mmap
    }
}
#endif
