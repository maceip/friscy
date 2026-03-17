// Stub for v8::base::Thread::Start() to avoid worker thread creation in Emscripten
// This is a minimal workaround - threads "start" but don't actually run

#include "src/base/platform/platform.h"

namespace v8 {
namespace base {

// Override the Start() method to always return true without creating a thread
bool Thread::Start() {
    // In single-threaded Wasm, we don't create actual OS threads
    // Just return true to indicate "success"
    // The Run() method will never be called, which is fine for jitless mode
    return true;
}

} // namespace base
} // namespace v8
