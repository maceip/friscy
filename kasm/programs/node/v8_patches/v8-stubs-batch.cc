// Comprehensive V8 stubs for single-threaded Wasm build
#include <cstddef>
#include <cstdint>
#include <string>

namespace v8 {
namespace internal {

// ExternalReference stubs
class ExternalReference {
public:
    static void* abort_with_reason();
};
void* ExternalReference::abort_with_reason() { return nullptr; }

// ThreadIsolation stubs
class ThreadIsolation {
public:
    static void Initialize(void* allocator);
};
void ThreadIsolation::Initialize(void* allocator) { (void)allocator; }

// PageAllocator stubs
class PageAllocator {
};

class GetPlatformPageAllocator {
public:
    static PageAllocator* Get();
};
PageAllocator* GetPlatformPageAllocator::Get() { return nullptr; }

// OS stubs
class OS {
public:
    static void Initialize(int abort_mode, const char* gc_fake_mmap);
    static int GetCurrentProcessId();
};
void OS::Initialize(int abort_mode, const char* gc_fake_mmap) { (void)abort_mode; (void)gc_fake_mmap; }
int OS::GetCurrentProcessId() { return 1; }

// AbortMode enum
enum class AbortMode {
    kDefault = 0,
    kExitWithFailureAndIgnoreDcheckFailures = 1,
    kExitWithSuccessAndIgnoreDcheckFailures = 2,
    kImmediateCrash = 3,
    kExitIfNoSecurityImpact = 4
};

// TracingCategoryObserver stubs
class TracingCategoryObserver {
public:
    static void Initialize();
};
void TracingCategoryObserver::Initialize() {}

// Sandbox stubs (disabled)
class Sandbox {
public:
    static void InitializeDefaultOncePerProcess(void* vas);
    static Sandbox* current();
    size_t size();
};
void Sandbox::InitializeDefaultOncePerProcess(void* vas) { (void)vas; }
Sandbox* Sandbox::current() {
    static Sandbox instance;
    return &instance;
}
size_t Sandbox::size() { return 0; }

constexpr size_t kSandboxSize = 0;

} // namespace internal

// Platform stubs
class Platform {
public:
    virtual void* GetThreadIsolatedAllocator() { return nullptr; }
};

Platform* GetCurrentPlatform() {
    static Platform instance;
    return &instance;
}

} // namespace v8
