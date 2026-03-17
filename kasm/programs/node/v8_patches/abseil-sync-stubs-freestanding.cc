// ==========================================================================
// Freestanding Abseil No-Op Stubs (NO header dependencies)
// ==========================================================================
//
// Use this file if the header-based abseil-sync-stubs.cc fails to compile
// due to missing transitive dependencies (ICU, etc.).
//
// This version declares everything from scratch with matching signatures.
// The C++ name mangling will match as long as the namespace, class names,
// and parameter types are identical to real Abseil.
//
// Compile:
//   em++ -std=c++20 -O0 -w -c abseil-sync-stubs-freestanding.cc \
//        -o abseil-sync-stubs.o
//
// DO NOT link any real Abseil .o files alongside this.
// ==========================================================================

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <atomic>

namespace absl {

// Forward declarations matching real Abseil types
class Duration {};
class Time {};
class Condition {
public:
    ~Condition();
    bool Eval() const;
};
Condition::~Condition() {}
bool Condition::Eval() const { return true; }

enum class LogSeverity : int { kInfo = 0, kWarning = 1, kError = 2, kFatal = 3 };

// ============================================================================
// Mutex
// ============================================================================

class Mutex {
    char pad_[sizeof(void*) * 2]; // enough padding, layout doesn't matter
public:
    Mutex();
    ~Mutex();
    void lock();
    void unlock();
    bool try_lock();
    // Uppercase wrappers declared here, defined out-of-line
    void Lock();
    void Unlock();
    bool TryLock();
    void ReaderLock();
    void ReaderUnlock();
    bool ReaderTryLock();
    void WriterLock();
    void WriterUnlock();
    bool WriterTryLock();
    void AssertHeld() const;
    void AssertReaderHeld() const;
    void AssertNotHeld() const;
    void Await(const Condition&);
    bool AwaitWithTimeout(const Condition&, Duration);
    bool AwaitWithDeadline(const Condition&, Time);
    void LockWhen(const Condition&);
    bool LockWhenWithTimeout(const Condition&, Duration);
    bool LockWhenWithDeadline(const Condition&, Time);
    void ReaderLockWhen(const Condition&);
    bool ReaderLockWhenWithTimeout(const Condition&, Duration);
    bool ReaderLockWhenWithDeadline(const Condition&, Time);
    void ForgetDeadlockInfo();
    void EnableDebugLog(const char*);
    void EnableInvariantDebugging(void (*)(void*), void*);
};

Mutex::Mutex() { memset(this, 0, sizeof(*this)); }
Mutex::~Mutex() {}
// Lowercase versions (called by V8's compiled code)
void Mutex::lock() {}
void Mutex::unlock() {}
bool Mutex::try_lock() { return true; }

// Uppercase wrappers (inline in real Abseil)
void Mutex::Lock() { lock(); }
void Mutex::Unlock() { unlock(); }
bool Mutex::TryLock() { return try_lock(); }
void Mutex::ReaderLock() {}
void Mutex::ReaderUnlock() {}
bool Mutex::ReaderTryLock() { return true; }
void Mutex::WriterLock() {}
void Mutex::WriterUnlock() {}
bool Mutex::WriterTryLock() { return true; }
void Mutex::AssertHeld() const {}
void Mutex::AssertReaderHeld() const {}
void Mutex::AssertNotHeld() const {}
void Mutex::Await(const Condition&) {}
bool Mutex::AwaitWithTimeout(const Condition&, Duration) { return true; }
bool Mutex::AwaitWithDeadline(const Condition&, Time) { return true; }
void Mutex::LockWhen(const Condition&) {}
bool Mutex::LockWhenWithTimeout(const Condition&, Duration) { return true; }
bool Mutex::LockWhenWithDeadline(const Condition&, Time) { return true; }
void Mutex::ReaderLockWhen(const Condition&) {}
bool Mutex::ReaderLockWhenWithTimeout(const Condition&, Duration) { return true; }
bool Mutex::ReaderLockWhenWithDeadline(const Condition&, Time) { return true; }
void Mutex::ForgetDeadlockInfo() {}
void Mutex::EnableDebugLog(const char*) {}
void Mutex::EnableInvariantDebugging(void (*)(void*), void*) {}

// ============================================================================
// CondVar
// ============================================================================

class CondVar {
    char pad_[sizeof(void*)];
public:
    CondVar();
    ~CondVar();
    void Wait(Mutex*);
    bool WaitWithTimeout(Mutex*, Duration);
    bool WaitWithDeadline(Mutex*, Time);
    void Signal();
    void SignalAll();
    void EnableDebugLog(const char*);
};

CondVar::CondVar() { memset(this, 0, sizeof(*this)); }
CondVar::~CondVar() {}
void CondVar::Wait(Mutex*) { 
    // In single-threaded mode, Wait should never be called.
    // If it is, we just return immediately (no actual waiting).
    // This is a deviation from the strict stub policy but needed for boot.
}
bool CondVar::WaitWithTimeout(Mutex*, Duration) { return true; }
bool CondVar::WaitWithDeadline(Mutex*, Time) { return true; }
void CondVar::Signal() {}
void CondVar::SignalAll() {}
void CondVar::EnableDebugLog(const char*) {}

// ============================================================================
// Notification
// ============================================================================

class Notification {
    std::atomic<bool> notified_yet_;
public:
    Notification();
    ~Notification();
    void Notify();
    bool HasBeenNotified() const;
    void WaitForNotification() const;
    bool WaitForNotificationWithTimeout(Duration) const;
    bool WaitForNotificationWithDeadline(Time) const;
};

Notification::Notification() : notified_yet_(false) {}
Notification::~Notification() {}
void Notification::Notify() { notified_yet_.store(true, std::memory_order_release); }
bool Notification::HasBeenNotified() const { return notified_yet_.load(std::memory_order_acquire); }
void Notification::WaitForNotification() const {
    // In single-threaded mode, this shouldn't be called without prior Notify
    // Just return instead of trapping to allow boot to continue
}
bool Notification::WaitForNotificationWithTimeout(Duration) const { return HasBeenNotified(); }
bool Notification::WaitForNotificationWithDeadline(Time) const { return HasBeenNotified(); }

// ============================================================================
// Thread Identity
// ============================================================================

namespace base_internal {

// Match the real ThreadIdentity size (it's large — has per_thread_synch etc.)
struct PerThreadSynch {
    char data[256];
};

struct ThreadIdentity {
    PerThreadSynch per_thread_synch;
    char rest[512]; // remaining fields
};

using ThreadIdentityReclaimerFunction = void (*)(void*);

static ThreadIdentity g_thread_identity;
static bool g_identity_initialized = false;

ThreadIdentity* CurrentThreadIdentityIfPresent() {
    if (!g_identity_initialized) return nullptr;
    return &g_thread_identity;
}

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

// SpinLock
class SpinLock {
public:
    void SlowLock();
    void SlowUnlock(uint32_t);
    uint32_t SpinLoop();
};
void SpinLock::SlowLock() {}
void SpinLock::SlowUnlock(uint32_t) {}
uint32_t SpinLock::SpinLoop() { return 0; }

// LowLevelAlloc
class LowLevelAlloc {
public:
    struct Arena {};
    static Arena* DefaultArena();
    static Arena* NewArena(uint32_t);
    static bool DeleteArena(Arena*);
    static void* Alloc(size_t);
    static void* AllocWithArena(size_t, Arena*);
    static void Free(void*);
};

LowLevelAlloc::Arena* LowLevelAlloc::DefaultArena() {
    static Arena arena;
    return &arena;
}
LowLevelAlloc::Arena* LowLevelAlloc::NewArena(uint32_t) { return DefaultArena(); }
bool LowLevelAlloc::DeleteArena(Arena*) { return true; }
void* LowLevelAlloc::Alloc(size_t s) { return std::malloc(s ? s : 1); }
void* LowLevelAlloc::AllocWithArena(size_t s, Arena*) { return std::malloc(s ? s : 1); }
void LowLevelAlloc::Free(void* p) { std::free(p); }

// CycleClock
class CycleClock {
public:
    static double Frequency();
};
double CycleClock::Frequency() { return 1000000000.0; }

} // namespace base_internal

// ============================================================================
// GraphCycles (deadlock detection)
// ============================================================================

namespace synchronization_internal {

struct GraphId { uint64_t id; };

class GraphCycles {
    void* rep_;
public:
    GraphCycles();
    ~GraphCycles();
    GraphId GetId(void*);
    void RemoveNode(void*);
    bool InsertEdge(GraphId, GraphId);
    void RemoveEdge(GraphId, GraphId);
    bool HasEdge(GraphId, GraphId) const;
    bool IsReachable(GraphId, GraphId) const;
};

GraphCycles::GraphCycles() : rep_(nullptr) {}
GraphCycles::~GraphCycles() {}
GraphId GraphCycles::GetId(void*) { return GraphId{0}; }
void GraphCycles::RemoveNode(void*) {}
bool GraphCycles::InsertEdge(GraphId, GraphId) { return true; }
void GraphCycles::RemoveEdge(GraphId, GraphId) {}
bool GraphCycles::HasEdge(GraphId, GraphId) const { return false; }
bool GraphCycles::IsReachable(GraphId, GraphId) const { return false; }

// PerThreadSem
class PerThreadSem {
public:
    static void Init(base_internal::ThreadIdentity*);
    static void Tick(base_internal::ThreadIdentity*);
};
void PerThreadSem::Init(base_internal::ThreadIdentity*) {}
void PerThreadSem::Tick(base_internal::ThreadIdentity*) {}

// KernelTimeout placeholder
struct KernelTimeout {};

} // namespace synchronization_internal

// ============================================================================
// Logging
// ============================================================================

namespace raw_log_internal {
void RawLog(LogSeverity, const char*, int, const char*, ...) {}
void AsyncSignalSafeWriteError(const char*, int) {}
} // namespace raw_log_internal

// ============================================================================
// Stack Trace
// ============================================================================

int GetStackTrace(void**, int, int) { return 0; }
int GetStackFrames(void**, int*, int, int) { return 0; }
int GetStackTraceWithContext(void**, int, int, const void*, int*) { return 0; }
int GetStackFramesWithContext(void**, int*, int, int, const void*, int*) { return 0; }

// ============================================================================
// Container/hash internals
// ============================================================================

namespace container_internal {
alignas(16) const char kEmptyGroup[16] = {
    -128, -128, -128, -128, -128, -128, -128, -128,
    -128, -128, -128, -128, -128, -128, -128, -128
};
} // namespace container_internal

namespace hash_internal {
const uint64_t kSeed = 0x9e3779b97f4a7c15ULL;
} // namespace hash_internal

} // namespace absl

// ============================================================================
// C-linkage symbols
// ============================================================================

extern "C" {
    // PerThreadSem C-linkage functions referenced by Abseil's mutex.cc
    bool AbslInternalPerThreadSemWait(void*) { return true; }
    void AbslInternalPerThreadSemPost(void*) {}
    void AbslInternalPerThreadSemPoke(void*) {}

    // SpinLock profiling hooks
    void AbslInternalSpinLockDelay(void*, uint32_t, int, int) {}
    void AbslInternalSpinLockWake(void*, bool) {}
}
