// ==========================================================================
// Complete Abseil No-Op Stubs for Single-Threaded Wasm
// ==========================================================================
//
// V8 links against Abseil for synchronization, hashing, and logging.
// In single-threaded Wasm, none of these need real implementations:
// - Mutexes are always uncontended (no-op)
// - CondVar waits never happen (single thread can't signal itself)
// - ThreadIdentity is a single static instance
//
// IMPORTANT: Do NOT link any real Abseil .o files alongside this.
// This file replaces ALL of Abseil's synchronization layer.
//
// Compile with the same flags as V8 + -isystem emscripten-shims:
//   em++ -std=c++20 -O0 -w -pthread [V8 flags...] \
//     -isystem v8_patches/emscripten-shims \
//     -I$V8/third_party/abseil-cpp \
//     -c v8_patches/abseil-sync-stubs.cc -o abseil-sync-stubs.o
// ==========================================================================

// Pull in the real Abseil headers so our function signatures produce
// exactly the same mangled symbols that V8's compiled code expects.
// The emscripten-shims/ directory provides linux/futex.h etc.

#include "absl/synchronization/mutex.h"
#include "absl/synchronization/notification.h"
#include "absl/synchronization/internal/per_thread_sem.h"
#include "absl/synchronization/internal/graphcycles.h"
#include "absl/base/internal/spinlock.h"
#include "absl/base/internal/low_level_alloc.h"
#include "absl/base/internal/thread_identity.h"
#include "absl/base/internal/sysinfo.h"
#include "absl/base/internal/raw_logging.h"
#include "absl/base/internal/cycleclock.h"
#include "absl/base/internal/unscaledcycleclock.h"
#include "absl/debugging/stacktrace.h"
#include "absl/hash/hash.h"

#include <cstdlib>
#include <cstring>

// If headers can't be included (missing deps), uncomment the block below
// and comment out the includes above. The freestanding version uses
// hand-matched signatures — less safe but zero dependencies.
// See: abseil-sync-stubs-freestanding.cc

// ============================================================================
// Mutex — all no-ops (single-threaded, nothing to contend)
// ============================================================================

namespace absl {

Mutex::Mutex() { memset(this, 0, sizeof(*this)); }
Mutex::~Mutex() {}
void Mutex::Lock() {}
void Mutex::Unlock() {}
bool Mutex::TryLock() { return true; }
void Mutex::ReaderLock() {}
void Mutex::ReaderUnlock() {}
bool Mutex::ReaderTryLock() { return true; }
void Mutex::AssertHeld() const {}
void Mutex::AssertReaderHeld() const {}
void Mutex::AssertNotHeld() const {}
void Mutex::ForgetDeadlockInfo() {}
void Mutex::EnableDebugLog(const char*) {}
void Mutex::EnableInvariantDebugging(void (*)(void*), void*) {}

void Mutex::Await(const Condition&) {}
bool Mutex::AwaitWithTimeout(const Condition&, absl::Duration) { return true; }
bool Mutex::AwaitWithDeadline(const Condition&, absl::Time) { return true; }
void Mutex::LockWhen(const Condition&) {}
bool Mutex::LockWhenWithTimeout(const Condition&, absl::Duration) { return true; }
bool Mutex::LockWhenWithDeadline(const Condition&, absl::Time) { return true; }
void Mutex::ReaderLockWhen(const Condition&) {}
bool Mutex::ReaderLockWhenWithTimeout(const Condition&, absl::Duration) { return true; }
bool Mutex::ReaderLockWhenWithDeadline(const Condition&, absl::Time) { return true; }
void Mutex::WriterLock() {}
void Mutex::WriterUnlock() {}
bool Mutex::WriterTryLock() { return true; }

// Condition
Condition::~Condition() {}
bool Condition::Eval() const { return true; }

// ============================================================================
// CondVar — Signal/SignalAll are no-ops, Wait traps (should never happen)
// ============================================================================

CondVar::CondVar() { memset(this, 0, sizeof(*this)); }
CondVar::~CondVar() {}

void CondVar::Signal() {}
void CondVar::SignalAll() {}
void CondVar::EnableDebugLog(const char*) {}

void CondVar::Wait(Mutex*) {
    // Single-threaded: no other thread can signal us. If we get here,
    // something is deeply wrong. Trap so we get a stack trace.
    __builtin_trap();
}
bool CondVar::WaitWithTimeout(Mutex*, absl::Duration) { return true; }
bool CondVar::WaitWithDeadline(Mutex*, absl::Time) { return true; }

// ============================================================================
// Notification
// ============================================================================

Notification::Notification() : notified_yet_(false) {}
Notification::~Notification() {}

void Notification::Notify() {
    notified_yet_.store(true, std::memory_order_release);
}

bool Notification::HasBeenNotified() const {
    return notified_yet_.load(std::memory_order_acquire);
}

void Notification::WaitForNotification() const {
    // In single-threaded mode, if not already notified, we're stuck.
    // But V8 may call Notify() then WaitForNotification() sequentially.
    if (!HasBeenNotified()) {
        __builtin_trap();
    }
}

bool Notification::WaitForNotificationWithTimeout(absl::Duration) const {
    return HasBeenNotified();
}

bool Notification::WaitForNotificationWithDeadline(absl::Time) const {
    return HasBeenNotified();
}

} // namespace absl

// ============================================================================
// Thread Identity — single static instance
// ============================================================================

namespace absl {
namespace base_internal {

// Provide a properly-sized ThreadIdentity with zeroed per_thread_synch.
// Single-threaded: only one identity ever exists.
static ThreadIdentity g_thread_identity;
static bool g_identity_initialized = false;

ThreadIdentity* CurrentThreadIdentityIfPresent() {
    if (!g_identity_initialized) return nullptr;
    return &g_thread_identity;
}

// Called by Abseil internals to set up thread-local identity.
// In our single-threaded stub, we just use the static instance.
void SetCurrentThreadIdentity(ThreadIdentity* identity,
                              ThreadIdentityReclaimerFunction reclaimer) {
    (void)identity;
    (void)reclaimer;
    g_identity_initialized = true;
}

void ClearCurrentThreadIdentity() {
    g_identity_initialized = false;
}

int NumCPUs() { return 1; }

int NominalCPUFrequency() { return 1000; }

} // namespace base_internal
} // namespace absl

// ============================================================================
// PerThreadSem — semaphore operations (no-op in single-threaded)
// ============================================================================

namespace absl {
namespace synchronization_internal {

void PerThreadSem::Init(base_internal::ThreadIdentity*) {}
void PerThreadSem::Tick(base_internal::ThreadIdentity*) {}

} // namespace synchronization_internal
} // namespace absl

// C-linkage PerThreadSem functions that Abseil's mutex.cc references
extern "C" {
    bool AbslInternalPerThreadSemWait(
        absl::synchronization_internal::KernelTimeout) {
        return true;
    }
    void AbslInternalPerThreadSemPost(absl::base_internal::ThreadIdentity*) {}
    void AbslInternalPerThreadSemPoke(absl::base_internal::ThreadIdentity*) {}
}

// ============================================================================
// GraphCycles — deadlock detection (not needed in single-threaded)
// ============================================================================

namespace absl {
namespace synchronization_internal {

GraphCycles::GraphCycles() : rep_(nullptr) {}
GraphCycles::~GraphCycles() {}
GraphId GraphCycles::GetId(void*) { return InvalidGraphId(); }
void GraphCycles::RemoveNode(void*) {}
bool GraphCycles::InsertEdge(GraphId, GraphId) { return true; }
void GraphCycles::RemoveEdge(GraphId, GraphId) {}
bool GraphCycles::HasEdge(GraphId, GraphId) const { return false; }
bool GraphCycles::IsReachable(GraphId, GraphId) const { return false; }
int GraphCycles::FindPath(GraphId, GraphId, int, GraphId[]) const { return 0; }
bool GraphCycles::CheckInvariant(std::string*) const { return true; }
int GraphCycles::Ptr(GraphId) { return 0; }
void GraphCycles::UpdateStackTrace(GraphId, int, int (*)(void**, int)) {}

} // namespace synchronization_internal
} // namespace absl

// ============================================================================
// SpinLock — no-op (single-threaded)
// ============================================================================

namespace absl {
namespace base_internal {

void SpinLock::SlowLock() {}
void SpinLock::SlowUnlock(uint32_t) {}
uint32_t SpinLock::SpinLoop() { return 0; }

} // namespace base_internal
} // namespace absl

// ============================================================================
// LowLevelAlloc — delegate to malloc/free
// ============================================================================

namespace absl {
namespace base_internal {

LowLevelAlloc::Arena* LowLevelAlloc::DefaultArena() {
    static LowLevelAlloc::Arena arena;
    return &arena;
}

LowLevelAlloc::Arena* LowLevelAlloc::NewArena(uint32_t) {
    return DefaultArena();
}

bool LowLevelAlloc::DeleteArena(Arena*) { return true; }

void* LowLevelAlloc::Alloc(size_t size) {
    return std::malloc(size ? size : 1);
}

void* LowLevelAlloc::AllocWithArena(size_t size, Arena*) {
    return std::malloc(size ? size : 1);
}

void LowLevelAlloc::Free(void* ptr) {
    std::free(ptr);
}

} // namespace base_internal
} // namespace absl

// ============================================================================
// Raw Logging — no-op
// ============================================================================

namespace absl {
namespace raw_log_internal {

void RawLog(absl::LogSeverity, const char*, int, const char*, ...) {}

void AsyncSignalSafeWriteError(const char*, int) {}

} // namespace raw_log_internal
} // namespace absl

// ============================================================================
// CycleClock / UnscaledCycleClock — return monotonic counter
// ============================================================================

namespace absl {
namespace base_internal {

// These may be inlined by the headers. Only provide out-of-line versions
// if the linker needs them (depends on V8's optimization level).
// If you get duplicate symbol errors, wrap these in:
//   #ifndef ABSL_USE_CYCLECLOCK_32BIT ... #endif

double CycleClock::Frequency() { return 1000000000.0; }

} // namespace base_internal
} // namespace absl

// ============================================================================
// Stack Trace — returns 0 frames
// ============================================================================

namespace absl {

int GetStackTrace(void**, int, int) { return 0; }
int GetStackFrames(void**, int*, int, int) { return 0; }
int GetStackTraceWithContext(void**, int, int, const void*, int*) { return 0; }
int GetStackFramesWithContext(void**, int*, int, int, const void*, int*) { return 0; }

} // namespace absl

// ============================================================================
// Container/hash internal constants — referenced by V8's Abseil hash tables
// ============================================================================

namespace absl {
namespace container_internal {

// SwissTable control byte constants
alignas(16) const char kEmptyGroup[16] = {
    -128, -128, -128, -128, -128, -128, -128, -128,
    -128, -128, -128, -128, -128, -128, -128, -128
};

} // namespace container_internal
} // namespace absl
