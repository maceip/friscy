// Single-threaded Abseil synchronization stubs
// Provides no-op implementations for all sync operations

#include <cstddef>
#include <cstdint>
#include <cstdlib>

// ============================================================================
// Raw Logging
// ============================================================================
namespace absl {
enum LogSeverity { INFO = 0, WARNING = 1, ERROR = 2, FATAL = 3 };

namespace raw_log_internal {
    void RawLog(absl::LogSeverity severity, const char* file, int line,
                const char* format, ...) {
        (void)severity;
        (void)file;
        (void)line;
        (void)format;
    }
} // namespace raw_log_internal

// ============================================================================
// Container/hash constants
// ============================================================================
namespace container_internal {
    extern const char kSooControl = 0;
    extern const char kDefaultIterControl = 0;
}
namespace hash_internal {
    extern const size_t kSeed = 0x9e3779b97f4a7c15ULL;
}

// ============================================================================
// Thread Identity - Single global instance
// ============================================================================
namespace base_internal {
    struct ThreadIdentity {
        uint32_t data[8];  // Enough space for internal state
    };

    ThreadIdentity* GetCurrentThreadIdentityIfPresent() {
        static ThreadIdentity identity = {};
        return &identity;
    }

    int NumCPUs() {
        return 1;
    }
} // namespace base_internal

namespace synchronization_internal {
    using ThreadIdentity = base_internal::ThreadIdentity;

    ThreadIdentity* CreateThreadIdentity() {
        return base_internal::GetCurrentThreadIdentityIfPresent();
    }

    void SetCurrentThreadIdentity(ThreadIdentity* identity) {
        (void)identity;
    }

    void ClearCurrentThreadIdentity() {
    }
} // namespace synchronization_internal

// ============================================================================
// Mutex - 4 bytes as per Abseil header
// ============================================================================
class Mutex {
    uint32_t state_;
public:
    Mutex() : state_(0) {}
    ~Mutex() {}

    void Lock() {}
    void Unlock() {}
    bool TryLock() { return true; }
    void AssertHeld() const {}
};

// ============================================================================
// CondVar - 4 bytes as per Abseil header
// ============================================================================
class CondVar {
    uint32_t state_;
public:
    CondVar() : state_(0) {}
    ~CondVar() {}

    void Wait(Mutex* mu) {
        (void)mu;
        __builtin_trap();  // HARD FAIL: should never wait in single-threaded
    }

    void Signal() {}
    void SignalAll() {}
};

// ============================================================================
// Notification
// ============================================================================
class Notification {
    mutable uint32_t notified_;
public:
    Notification() : notified_(0) {}

    void Notify() {
        notified_ = 1;
    }

    bool HasBeenNotified() const {
        return notified_ != 0;
    }

    void WaitForNotification() const {
        while (!HasBeenNotified()) {
            // Spin - should not loop in single-threaded
        }
    }
};

// ============================================================================
// LowLevelAlloc
// ============================================================================
namespace base_internal {
    class LowLevelAlloc {
    public:
        static void* Alloc(size_t size) {
            return std::malloc(size);
        }
        static void Free(void* ptr) {
            std::free(ptr);
        }
    };
} // namespace base_internal

// ============================================================================
// GetStackTrace
// ============================================================================
int GetStackTrace(void** result, int max_depth, int skip_count) {
    (void)result;
    (void)max_depth;
    (void)skip_count;
    return 0;
}

} // namespace absl

// ============================================================================
// C-linkage Abseil internal functions
// ============================================================================
extern "C" {
    bool AbslInternalPerThreadSemWait() { return true; }
    void AbslInternalPerThreadSemPost() { }
    void AbslInternalPerThreadSemPoke() { }
}
