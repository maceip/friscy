// Comprehensive V8 platform implementation for Emscripten/Wasm
//
// Replaces platform-posix.cc + platform-linux.cc with Emscripten-safe
// implementations. Instead of fixing crashes one at a time, this provides
// ALL platform methods V8 needs during boot and JS execution.
//
// APPROACH: Include V8's own platform.h to get exact signatures, then
// implement each method for the Emscripten environment.
//
// If platform.h inclusion fails during compilation, the error messages
// will tell us exactly which methods we need and their signatures.
// This is INTENTIONAL — it's faster than guessing signatures.
//
// What this replaces:
//   - src/base/platform/platform-posix.cc (POSIX implementation)
//   - src/base/platform/platform-linux.cc (Linux-specific overrides)
//   - src/base/platform/platform-posix-time.cc (time functions)
//
// V8 startup syscall profile (from strace of `node -e "1+1"`):
//   61 mmap, 48 mprotect, 51 munmap, 14 brk, 35 madvise,
//   63 rt_sigaction, 7 clone3, 92 futex

#include "src/base/platform/platform.h"
// Also pull in time zone cache
#include "src/base/platform/platform-posix.h"
#include "src/base/timezone-cache.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cerrno>
#include <climits>
#include <pthread.h>
#include <unistd.h>
#include <sys/time.h>
#include <sys/stat.h>
#include <sys/mman.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

// ============================================================================
// COMPILE NOTE:
// ============================================================================
// If this file fails to compile because platform.h has different method
// signatures than what we implement below, the compiler errors are
// EXACTLY what we need — they tell us the real signatures.
//
// Fix process:
// 1. Read the error: "no declaration matches 'void v8::base::OS::Foo(int)'"
// 2. Check platform.h for the real signature
// 3. Update the implementation below
//
// This is the systematic approach — no more runtime crashes from
// wrong assumptions about the API.
// ============================================================================

namespace v8 {
namespace base {

// ============================================================================
// OS::Initialize — on Linux reads /proc/self/maps, sets up signals
// ============================================================================

static size_t g_page_size = 0;

void OS::Initialize(bool hard_abort, const char* const gc_fake_mmap) {
    (void)hard_abort;
    (void)gc_fake_mmap;
    g_page_size = static_cast<size_t>(sysconf(_SC_PAGESIZE));
    if (g_page_size == 0) g_page_size = 65536;
}

// ============================================================================
// Page sizes — critical for the CommitPageSize() alignment check
// ============================================================================

size_t OS::AllocatePageSize() {
    if (g_page_size == 0) g_page_size = static_cast<size_t>(sysconf(_SC_PAGESIZE));
    return g_page_size;
}

size_t OS::CommitPageSize() {
    if (g_page_size == 0) g_page_size = static_cast<size_t>(sysconf(_SC_PAGESIZE));
    return g_page_size;
}

void OS::SetRandomMmapSeed(int64_t seed) { (void)seed; }
void* OS::GetRandomMmapAddr() { return nullptr; }

// ============================================================================
// Memory allocation — uses our __wrap_mmap for proper alignment
// ============================================================================

// Note: The exact signature depends on V8 version. Common variants:
//   void* Allocate(void* hint, size_t size, size_t alignment, MemoryPermission)
//   static void* Allocate(void* address, size_t size, size_t alignment, Permission)
// If compilation fails here, update to match platform.h.

void* OS::Allocate(void* hint, size_t size, size_t alignment,
                   MemoryPermission access) {
    (void)access;
    size_t page_size = AllocatePageSize();
    size_t request_size = (size + page_size - 1) & ~(page_size - 1);

    void* result = mmap(hint, request_size, PROT_READ | PROT_WRITE,
                        MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (result == MAP_FAILED) return nullptr;

    // Handle super-page alignment (e.g. V8 heap cage wants GB alignment)
    if (alignment > page_size) {
        uintptr_t addr = reinterpret_cast<uintptr_t>(result);
        if (addr % alignment != 0) {
            munmap(result, request_size);
            size_t padded = request_size + alignment;
            result = mmap(nullptr, padded, PROT_READ | PROT_WRITE,
                          MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
            if (result == MAP_FAILED) return nullptr;
            addr = reinterpret_cast<uintptr_t>(result);
            uintptr_t aligned = (addr + alignment - 1) & ~(alignment - 1);
            if (aligned > addr) munmap(result, aligned - addr);
            size_t tail = (addr + padded) - (aligned + request_size);
            if (tail > 0) munmap(reinterpret_cast<void*>(aligned + request_size), tail);
            result = reinterpret_cast<void*>(aligned);
        }
    }
    return result;
}

void OS::Free(void* address, size_t size) {
    if (address) munmap(address, size);
}

void* OS::AllocateShared(void* hint, size_t size, MemoryPermission access,
                         PlatformSharedMemoryHandle handle, uint64_t offset) {
    (void)hint; (void)size; (void)access; (void)handle; (void)offset;
    return nullptr;
}

void OS::FreeShared(void* address, size_t size) {
    if (address) munmap(address, size);
}

void OS::Release(void* address, size_t size) {
    munmap(address, size);
}

bool OS::SetPermissions(void* address, size_t size, MemoryPermission access) {
    // All Wasm linear memory is RW. mprotect is a no-op.
    (void)address; (void)size; (void)access;
    return true;
}

bool OS::RecommitPages(void* address, size_t size, MemoryPermission access) {
    (void)address; (void)size; (void)access;
    return true;
}

bool OS::DiscardSystemPages(void* address, size_t size) {
    (void)address; (void)size;
    return true;
}

bool OS::DecommitPages(void* address, size_t size) {
    memset(address, 0, size);
    return true;
}

bool OS::SealPages(void* address, size_t size) {
    (void)address; (void)size;
    return true;
}

bool OS::HasLazyCommits() { return false; }

// ============================================================================
// Address space reservation
// ============================================================================

// V8 uses these for the pointer cage and sandbox. In Wasm, we just
// allocate the memory directly — there's no separate reserve/commit model.

// Note: These may not exist in all V8 versions. If they cause
// "no member named" errors, they can be safely removed.

// ============================================================================
// Time
// ============================================================================

double OS::TimeCurrentMillis() {
    struct timeval tv;
    gettimeofday(&tv, nullptr);
    return tv.tv_sec * 1000.0 + tv.tv_usec / 1000.0;
}

// Timezone cache implementation
class EmscriptenTimezoneCache : public TimezoneCache {
 public:
    void Clear(TimeZoneDetection) override {}
    ~EmscriptenTimezoneCache() override = default;

    const char* LocalTimezone(double time_ms) override {
        time_t ts = static_cast<time_t>(time_ms / 1000.0);
        struct tm* t = localtime(&ts);
        return (t && t->tm_zone) ? t->tm_zone : "UTC";
    }

    double LocalTimeOffset(double time_ms, bool is_utc) override {
        (void)is_utc;
        time_t ts = static_cast<time_t>(time_ms / 1000.0);
        struct tm local, utc;
        localtime_r(&ts, &local);
        gmtime_r(&ts, &utc);
        return difftime(mktime(&local), mktime(&utc)) * 1000.0;
    }

    double DaylightSavingsOffset(double time_ms) override {
        time_t ts = static_cast<time_t>(time_ms / 1000.0);
        struct tm* t = localtime(&ts);
        return (t && t->tm_isdst > 0) ? 3600000.0 : 0.0;
    }
};

TimezoneCache* OS::CreateTimezoneCache() {
    return new EmscriptenTimezoneCache();
}

// ============================================================================
// System info
// ============================================================================

int OS::NumberOfProcessors() { return 1; }
int OS::ActivationFrameAlignment() { return 16; }
int OS::GetCurrentProcessId() { return 1; }

int OS::GetCurrentThreadId() {
    return static_cast<int>(pthread_self());
}

// ============================================================================
// Shared libraries — /proc/self/maps not available
// ============================================================================

std::vector<OS::SharedLibraryAddress> OS::GetSharedLibraryAddresses() {
    return {};
}

void OS::SignalCodeMovingGC() {}
bool OS::IsHardwareEnforcedShadowStacksEnabled() { return false; }

// ============================================================================
// User time
// ============================================================================

int OS::GetUserTime(uint32_t* secs, uint32_t* usecs) {
    struct timeval tv;
    gettimeofday(&tv, nullptr);
    *secs = static_cast<uint32_t>(tv.tv_sec);
    *usecs = static_cast<uint32_t>(tv.tv_usec);
    return 0;
}

// ============================================================================
// Signals — no-ops in Wasm
// ============================================================================

void OS::EnsureAlternativeSignalStackIsAvailableForCurrentThread() {}
void OS::AdjustSchedulingParams() {}

// ============================================================================
// File operations — Emscripten provides POSIX file I/O
// ============================================================================

FILE* OS::FOpen(const char* path, const char* mode) {
    return fopen(path, mode);
}

bool OS::Remove(const char* path) { return remove(path) == 0; }
char OS::DirectorySeparator() { return '/'; }
bool OS::isDirectorySeparator(const char ch) { return ch == '/'; }

FILE* OS::OpenTemporaryFile() { return tmpfile(); }

// ============================================================================
// Print functions
// ============================================================================

void OS::Print(const char* format, ...) {
    va_list args;
    va_start(args, format);
    VPrint(format, args);
    va_end(args);
}

void OS::VPrint(const char* format, va_list args) {
    vprintf(format, args);
}

void OS::FPrint(FILE* out, const char* format, ...) {
    va_list args;
    va_start(args, format);
    VFPrint(out, format, args);
    va_end(args);
}

void OS::VFPrint(FILE* out, const char* format, va_list args) {
    vfprintf(out, format, args);
}

void OS::PrintError(const char* format, ...) {
    va_list args;
    va_start(args, format);
    VPrintError(format, args);
    va_end(args);
}

void OS::VPrintError(const char* format, va_list args) {
    vfprintf(stderr, format, args);
}

int OS::SNPrintF(char* str, int length, const char* format, ...) {
    va_list args;
    va_start(args, format);
    int result = VSNPrintF(str, length, format, args);
    va_end(args);
    return result;
}

int OS::VSNPrintF(char* str, int length, const char* format, va_list args) {
    int n = vsnprintf(str, length, format, args);
    if (n < 0 || n >= length) {
        if (length > 0) str[length - 1] = '\0';
        return -1;
    }
    return n;
}

// ============================================================================
// Abort / debug
// ============================================================================

void OS::Abort() { abort(); }

void OS::DebugBreak() {
#ifdef __EMSCRIPTEN__
    emscripten_debugger();
#else
    abort();
#endif
}

// ============================================================================
// Memory-mapped files — not supported in Wasm
// ============================================================================

OS::MemoryMappedFile* OS::MemoryMappedFile::open(const char* name,
                                                   FileMode mode) {
    (void)name; (void)mode;
    return nullptr;
}

OS::MemoryMappedFile* OS::MemoryMappedFile::create(const char* name,
                                                     size_t size, void* initial) {
    (void)name; (void)size; (void)initial;
    return nullptr;
}

// ============================================================================
// Stack
// ============================================================================

// V8 needs this for stack overflow detection
size_t OS::GetCurrentStackPosition() {
    volatile char marker;
    return reinterpret_cast<size_t>(&marker);
}

// ============================================================================
// Thread implementation — wraps pthreads
// ============================================================================
// With --single-threaded, V8 shouldn't spawn threads, but it still
// compiles the Thread class. Provide pthread-based implementation.

Thread::Thread(const Options& options)
    : data_(new PlatformData()),
      stack_size_(options.stack_size()),
      start_semaphore_(nullptr) {
    if (options.name()) {
        name_ = options.name();
    }
}

Thread::~Thread() {
    delete data_;
}

static void* ThreadEntry(void* arg) {
    Thread* thread = static_cast<Thread*>(arg);
    thread->NotifyStartedAndRun();
    return nullptr;
}

void Thread::Start() {
    pthread_attr_t attr;
    pthread_attr_init(&attr);
    if (stack_size_ > 0) {
        size_t s = stack_size_ < PTHREAD_STACK_MIN
                       ? static_cast<size_t>(PTHREAD_STACK_MIN)
                       : stack_size_;
        pthread_attr_setstacksize(&attr, s);
    }
    pthread_create(&data_->thread_, &attr, ThreadEntry, this);
    pthread_attr_destroy(&attr);
}

void Thread::Join() {
    pthread_join(data_->thread_, nullptr);
}

Thread::LocalStorageKey Thread::CreateThreadLocalKey() {
    pthread_key_t key;
    int result = pthread_key_create(&key, nullptr);
    if (result != 0) return static_cast<LocalStorageKey>(0);
    return static_cast<LocalStorageKey>(key);
}

void Thread::DeleteThreadLocalKey(LocalStorageKey key) {
    pthread_key_delete(static_cast<pthread_key_t>(key));
}

void* Thread::GetThreadLocal(LocalStorageKey key) {
    return pthread_getspecific(static_cast<pthread_key_t>(key));
}

void Thread::SetThreadLocal(LocalStorageKey key, void* value) {
    pthread_setspecific(static_cast<pthread_key_t>(key), value);
}

}  // namespace base
}  // namespace v8

// ============================================================================
// Sampler stub — linker expects v8::sampler::Sampler RTTI
// Symbol: _ZTIN2v87sampler7SamplerE
// ============================================================================

namespace v8 {
namespace sampler {

class Sampler {
 public:
    virtual ~Sampler() = default;
    virtual void SampleStack(const void* state) { (void)state; }
    void Start() {}
    void Stop() {}
    bool IsProfiling() const { return false; }
    bool IsActive() const { return false; }
 protected:
    Sampler() = default;
};

// Force RTTI emission
namespace { Sampler* volatile force_rtti_ = nullptr; }

}  // namespace sampler
}  // namespace v8
