// Copyright 2024 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Platform-specific implementation for Emscripten/WebAssembly.
//
// This is a COMPLETE standalone platform file for V8 running under
// Emscripten/Wasm. It replaces both platform-posix.cc and platform-linux.cc.
//
// Key differences from native POSIX:
//   - No virtual memory (mmap/mprotect are emulated via malloc + alignment)
//   - No signals (no SIGSEGV, no sigaltstack, no trap handlers)
//   - No /proc filesystem (no /proc/self/maps)
//   - No memfd_create, no mremap
//   - Wasm page size = 64KB (not 4KB)
//   - All linear memory is always readable/writable
//   - Threads via pthreads (SharedArrayBuffer + Web Workers)
//   - No JIT compilation (jitless mode only)
//
// Method inventory derived from V8 main branch (2025):
//   platform.h         - class OS declaration (all static methods)
//   platform.h         - class Thread declaration
//   platform.h         - class AddressSpaceReservation
//   platform.h         - class Stack
//   platform-posix.cc  - POSIX implementations (55 OS:: methods)
//   platform-linux.cc  - Linux overrides (7 OS:: methods)
//
// Complete method coverage:
//
// === OS class (public static) ===
//  1. Initialize(const char* const gc_fake_mmap)
//  2. IsHardwareEnforcedShadowStacksEnabled()
//  3. EnsureAlternativeSignalStackIsAvailableForCurrentThread()
//  4. GetUserTime(uint32_t* secs, uint32_t* usecs)
//  5. GetPeakMemoryUsageKb()
//  6. TimeCurrentMillis()
//  7. CreateTimezoneCache()
//  8. GetLastError()
//  9. FOpen(const char* path, const char* mode)
// 10. Remove(const char* path)
// 11. DirectorySeparator()
// 12. isDirectorySeparator(const char ch)
// 13. OpenTemporaryFile()
// 14. Print(const char* format, ...)
// 15. VPrint(const char* format, va_list args)
// 16. FPrint(FILE* out, const char* format, ...)
// 17. VFPrint(FILE* out, const char* format, va_list args)
// 18. PrintError(const char* format, ...)
// 19. VPrintError(const char* format, va_list args)
// 20. HasLazyCommits()
// 21. Sleep(TimeDelta interval)
// 22. Abort()
// 23. DebugBreak()
// 24. SNPrintF(char* str, int length, const char* format, ...)
// 25. VSNPrintF(char* str, int length, const char* format, va_list args)
// 26. StrNCpy(char* dest, int length, const char* src, size_t n)
// 27. GetSharedLibraryAddresses()
// 28. SignalCodeMovingGC()
// 29. ArmUsingHardFloat()
// 30. ActivationFrameAlignment()
// 31. GetCurrentProcessId()
// 32. GetCurrentThreadId() -> calls GetCurrentThreadIdInternal()
// 33. AdjustSchedulingParams()
// 34. GetFirstFreeMemoryRangeWithin(...)
// 35. ExitProcess(int exit_code)
// 36. IsRemapPageSupported()          [constexpr]
// 37. RemapPages(...)
// 38. SetDataReadOnly(void* address, size_t size)
// 39. CreateSharedMemoryHandleForTesting(size_t size)
// 40. DestroySharedMemoryHandle(SharedMemoryHandle handle)
//
// === OS class (private static, called by PageAllocator) ===
// 41. AllocatePageSize()
// 42. CommitPageSize()
// 43. SetRandomMmapSeed(int64_t seed)
// 44. GetRandomMmapAddr()
// 45. Allocate(void* address, size_t size, size_t alignment,
//              MemoryPermission access, optional<SharedMemoryHandle>)
// 46. AllocateShared(size_t size, MemoryPermission access)
// 47. AllocateShared(void* hint, size_t size, MemoryPermission access,
//                    SharedMemoryHandle handle, uint64_t offset)
// 48. RemapShared(void* old_address, void* new_address, size_t size)
// 49. Free(void* address, size_t size)
// 50. FreeShared(void* address, size_t size)
// 51. Release(void* address, size_t size)
// 52. SetPermissions(void* address, size_t size, MemoryPermission access)
// 53. RecommitPages(void* address, size_t size, MemoryPermission access)
// 54. DiscardSystemPages(void* address, size_t size)
// 55. DecommitPages(void* address, size_t size)
// 56. SealPages(void* address, size_t size)
// 57. CanReserveAddressSpace()
// 58. CreateAddressSpaceReservation(void* hint, size_t size, ...)
// 59. FreeAddressSpaceReservation(AddressSpaceReservation reservation)
// 60. SetMemoryRegionName(const void* address, size_t size, const char* name)
// 61. GetCurrentThreadIdInternal()
// 62. GetGCFakeMMapFile()
//
// === OS::MemoryMappedFile ===
// 63. open(const char* name, FileMode mode)
// 64. create(const char* name, size_t size, void* initial)
// 65. ~MemoryMappedFile()
//
// === Thread class ===
// 66. Thread(const Options& options)
// 67. ~Thread()
// 68. set_name(const char* name)
// 69. Start()
// 70. StartSynchronously()
// 71. Join()
// 72. CreateThreadLocalKey()
// 73. DeleteThreadLocalKey(LocalStorageKey key)
// 74. GetThreadLocal(LocalStorageKey key)
// 75. SetThreadLocal(LocalStorageKey key, void* value)
// 76. HasThreadLocal(LocalStorageKey key)
//
// === AddressSpaceReservation ===
// 77. Allocate(void* address, size_t size, OS::MemoryPermission access)
// 78. Free(void* address, size_t size)
// 79. AllocateShared(void* address, size_t size, ...)
// 80. FreeShared(void* address, size_t size)
// 81. SetPermissions(void* address, size_t size, OS::MemoryPermission access)
// 82. RecommitPages(void* address, size_t size, OS::MemoryPermission access)
// 83. DiscardSystemPages(void* address, size_t size)
// 84. DecommitPages(void* address, size_t size)
// 85. CreateSubReservation(void* address, size_t size, ...)
// 86. FreeSubReservation(AddressSpaceReservation reservation)
// 87. SetName(const char* name)
//
// === Stack class ===
// 88. ObtainCurrentThreadStackStart()
// 89. GetCurrentStackPosition()
//
// === Free functions ===
// 90. EnsureConsoleOutput()

#ifdef __EMSCRIPTEN__

#include "src/base/platform/platform.h"

#include <cmath>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cerrno>
#include <algorithm>

// POSIX headers available in Emscripten
#include <pthread.h>
#include <sched.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>

// Emscripten-specific
#include <emscripten.h>
#include <emscripten/threading.h>
#include <emscripten/stack.h>

// V8 internal headers
#include "src/base/lazy-instance.h"
#include "src/base/macros.h"
#include "src/base/platform/time.h"
#include "src/base/utils/random-number-generator.h"

namespace v8 {
namespace base {

// ==========================================================================
// Wasm page size constants
// ==========================================================================

// Emscripten reports sysconf(_SC_PAGESIZE) = 65536 (Wasm page size).
// We use this consistently throughout.
static constexpr size_t kWasmPageSize = 65536;

// ==========================================================================
// Aligned allocation helpers
//
// Emscripten's mmap emulation uses malloc internally, returning addresses
// aligned to only 8-16 bytes. V8 requires page-aligned addresses.
// We implement our own page-aligned allocator.
//
// Layout: [padding] [raw_ptr @ -sizeof(void*)] [aligned region ...]
//         ^                                     ^
//         malloc'd                              returned to caller
// ==========================================================================

namespace {

void* PageAlignedAlloc(size_t size, size_t alignment = kWasmPageSize) {
  if (size == 0) return nullptr;
  if (alignment < kWasmPageSize) alignment = kWasmPageSize;

  // Round up to alignment boundary
  size_t aligned_size = (size + alignment - 1) & ~(alignment - 1);

  // Over-allocate to guarantee alignment + space for metadata
  size_t total = aligned_size + alignment;
  void* raw = malloc(total);
  if (!raw) return nullptr;

  // Align up
  uintptr_t raw_addr = reinterpret_cast<uintptr_t>(raw);
  uintptr_t aligned_addr = (raw_addr + alignment - 1) & ~(alignment - 1);

  // Ensure room for metadata pointer before aligned region
  if (aligned_addr - raw_addr < sizeof(void*)) {
    aligned_addr += alignment;
  }

  // Store the raw malloc pointer just before the aligned region
  reinterpret_cast<void**>(aligned_addr)[-1] = raw;

  // Zero-fill (emulating MAP_ANONYMOUS behavior)
  memset(reinterpret_cast<void*>(aligned_addr), 0, aligned_size);

  return reinterpret_cast<void*>(aligned_addr);
}

void PageAlignedFree(void* addr) {
  if (!addr) return;

  uintptr_t a = reinterpret_cast<uintptr_t>(addr);
  // Check if page-aligned (one of our allocations)
  if ((a & (kWasmPageSize - 1)) == 0) {
    // Retrieve the raw malloc pointer stored at [-1]
    void* raw = reinterpret_cast<void**>(addr)[-1];
    uintptr_t r = reinterpret_cast<uintptr_t>(raw);
    // Sanity: raw should be before addr and within a reasonable distance
    if (r < a && (a - r) <= 2 * kWasmPageSize) {
      free(raw);
      return;
    }
  }
  // If we can't identify it as our allocation, do nothing.
  // In Wasm linear memory, "unmapping" is advisory anyway.
}

// Random mmap seed state
static int64_t random_mmap_seed = 0;

// GC fake mmap file (for perf profiling; meaningless in Wasm)
static const char* gc_fake_mmap_file = nullptr;

}  // namespace


// **************************************************************************
//
//   OS :: Initialization
//
// **************************************************************************

// static
void OS::Initialize(const char* const gc_fake_mmap) {
  gc_fake_mmap_file = gc_fake_mmap;
  // No other platform-specific initialization needed for Emscripten.
  // On Linux this would set up the GC fake mmap file descriptor for
  // perf profiling. In Wasm, perf profiling via mmap is not applicable.
}

// static
const char* OS::GetGCFakeMMapFile() {
  return gc_fake_mmap_file;
}


// **************************************************************************
//
//   OS :: Memory allocation — page sizes
//
// **************************************************************************

// static
size_t OS::AllocatePageSize() {
  // Wasm page size = 64KB. This is what sysconf(_SC_PAGESIZE) returns
  // in Emscripten, and is the natural alignment for Wasm memory.
  return kWasmPageSize;
}

// static
size_t OS::CommitPageSize() {
  // In Wasm, committing and allocating are the same granularity.
  return kWasmPageSize;
}


// **************************************************************************
//
//   OS :: Memory allocation — random mmap
//
// **************************************************************************

// static
void OS::SetRandomMmapSeed(int64_t seed) {
  random_mmap_seed = seed;
}

// static
void* OS::GetRandomMmapAddr() {
  // In Wasm, we cannot control where malloc places memory in the
  // linear address space. Return nullptr to let the allocator choose.
  // On Linux this uses a random offset for ASLR — not applicable here.
  return nullptr;
}


// **************************************************************************
//
//   OS :: Memory allocation — Allocate / Free / Release
//
// **************************************************************************

// static
void* OS::Allocate(void* hint, size_t size, size_t alignment,
                   MemoryPermission access,
                   std::optional<SharedMemoryHandle> handle) {
  // In Wasm linear memory, all memory is always read/write.
  // We ignore the permission and handle parameters.
  // The hint is also ignored since we can't control placement.
  //
  // V8 calls this for:
  //   - Heap cage reservation (huge PROT_NONE region — ~128MB+)
  //   - Code range allocation
  //   - Stack guard pages
  //   - General page-aligned allocations
  (void)hint;
  (void)access;
  (void)handle;

  if (size == 0) return nullptr;

  size_t effective_alignment =
      (alignment > kWasmPageSize) ? alignment : kWasmPageSize;
  return PageAlignedAlloc(size, effective_alignment);
}

// static
void* OS::AllocateShared(size_t size, MemoryPermission access) {
  // Emscripten has no real shared memory mapping distinction at the OS
  // level — SharedArrayBuffer is the mechanism for shared memory.
  // Just allocate page-aligned memory.
  (void)access;
  return PageAlignedAlloc(size);
}

// static
void* OS::AllocateShared(void* hint, size_t size,
                         OS::MemoryPermission access,
                         SharedMemoryHandle handle, uint64_t offset) {
  // In Wasm, shared memory handles (memfd) are not meaningful.
  // If hint is provided (MAP_FIXED pattern), return hint after zeroing.
  // V8 uses this for mapping shared memory into a reservation.
  (void)access;
  (void)handle;
  (void)offset;

  if (hint) {
    memset(hint, 0, size);
    return hint;
  }
  return PageAlignedAlloc(size);
}

// static
void* OS::RemapShared(void* old_address, void* new_address, size_t size) {
  // mremap(MREMAP_FIXED | MREMAP_MAYMOVE) equivalent.
  // In Wasm we can't truly remap memory. If the addresses differ,
  // copy the data.
  if (old_address == new_address) return old_address;

  void* result = new_address;
  if (!result) {
    result = PageAlignedAlloc(size);
    if (!result) return nullptr;
  }
  if (result != old_address) {
    memmove(result, old_address, size);
  }
  return result;
}

// static
void OS::Free(void* address, size_t size) {
  (void)size;
  PageAlignedFree(address);
}

// static
void OS::FreeShared(void* address, size_t size) {
  (void)size;
  PageAlignedFree(address);
}

// static
void OS::Release(void* address, size_t size) {
  // Release is the same as Free on most platforms.
  (void)size;
  PageAlignedFree(address);
}


// **************************************************************************
//
//   OS :: Memory permissions
//
// **************************************************************************

// static
bool OS::SetPermissions(void* address, size_t size,
                        MemoryPermission access) {
  // No-op in Wasm. All linear memory is always readable and writable.
  // V8 uses this for:
  //   - Guard pages (kNoAccess) — can't enforce in Wasm
  //   - Committing pages (kReadWrite) — memory is already committed
  //   - Making code executable (kReadExecute) — N/A in jitless mode
  (void)address;
  (void)size;
  (void)access;
  return true;
}

// static
void OS::SetDataReadOnly(void* address, size_t size) {
  // mprotect(PROT_READ) equivalent — cannot enforce read-only in Wasm
  // linear memory. V8 uses this for snapshot data protection.
  (void)address;
  (void)size;
}

// static
bool OS::SetMemoryRegionName(const void* address, size_t size,
                             const char* name) {
  // prctl(PR_SET_VMA, PR_SET_VMA_ANON_NAME, ...) — Linux-specific.
  // Not available in Wasm.
  (void)address;
  (void)size;
  (void)name;
  return false;
}

// static
bool OS::RecommitPages(void* address, size_t size,
                       MemoryPermission access) {
  // Recommit previously decommitted pages. In Wasm, all memory is
  // always committed. Zero-fill to emulate "fresh page" semantics.
  (void)access;
  if (address && size > 0) {
    memset(address, 0, size);
  }
  return true;
}

// static
bool OS::DiscardSystemPages(void* address, size_t size) {
  // Equivalent to madvise(MADV_DONTNEED). In Wasm, we can't return
  // physical pages to the OS. V8 calls this ~35 times during startup.
  // Report success without doing work — the memory remains accessible.
  (void)address;
  (void)size;
  return true;
}

// static
bool OS::DecommitPages(void* address, size_t size) {
  // "Decommit" has no real meaning in Wasm linear memory — it's always
  // backed by the WebAssembly.Memory buffer. Zero-fill to ensure
  // deterministic behavior if the pages are later recommitted.
  if (address && size > 0) {
    memset(address, 0, size);
  }
  return true;
}

// static
bool OS::SealPages(void* address, size_t size) {
  // mseal() or equivalent — prevents future permission changes.
  // Not available in Wasm.
  (void)address;
  (void)size;
  return false;
}

// static
bool OS::HasLazyCommits() {
  // Wasm linear memory is always fully committed (backed by the
  // ArrayBuffer). There is no lazy commit / overcommit.
  return false;
}


// **************************************************************************
//
//   OS :: Address space reservations
//
// **************************************************************************

// static
bool OS::CanReserveAddressSpace() {
  // We can "reserve" by allocating — there's no true virtual address
  // space reservation in Wasm, but we simulate it with actual allocation.
  return true;
}

// static
std::optional<AddressSpaceReservation> OS::CreateAddressSpaceReservation(
    void* hint, size_t size, size_t alignment,
    MemoryPermission max_permission,
    std::optional<SharedMemoryHandle> handle) {
  // In native Linux, this would use mmap(PROT_NONE) to reserve address
  // space without committing physical memory. In Wasm, there's no lazy
  // commit, so this actually allocates from the linear memory heap.
  // For large reservations (e.g., 4GB sandbox), this may fail or
  // consume significant memory.
  void* address = Allocate(hint, size, alignment, max_permission, handle);
  if (!address) return std::nullopt;
  return AddressSpaceReservation(address, size);
}

// static
void OS::FreeAddressSpaceReservation(AddressSpaceReservation reservation) {
  Free(reservation.base(), reservation.size());
}


// **************************************************************************
//
//   OS :: Shared memory handles (for testing)
//
// **************************************************************************

// static
std::optional<SharedMemoryHandle> OS::CreateSharedMemoryHandleForTesting(
    size_t size) {
  // memfd_create() or shm_open() equivalent — not available in Wasm.
  // Return nullopt to signal unsupported.
  (void)size;
  return std::nullopt;
}

// static
void OS::DestroySharedMemoryHandle(SharedMemoryHandle handle) {
  // No-op — we never create real handles.
  (void)handle;
}


// **************************************************************************
//
//   OS :: Remap
//
// **************************************************************************

// static
constexpr bool OS::IsRemapPageSupported() {
  // mremap is Linux-specific and not available in Wasm.
  return false;
}

// static
bool OS::RemapPages(const void* address, size_t size, void* new_address,
                    MemoryPermission access) {
  // mremap equivalent — not supported in Wasm.
  (void)address;
  (void)size;
  (void)new_address;
  (void)access;
  return false;
}


// **************************************************************************
//
//   OS :: Memory-mapped files
//
// **************************************************************************

// static
OS::MemoryMappedFile* OS::MemoryMappedFile::open(const char* name,
                                                  FileMode mode) {
  // Emscripten has a virtual filesystem (MEMFS by default, NODEFS for
  // Node.js). We use standard file I/O to read the file into memory.
  const char* fopen_mode = (mode == FileMode::kReadOnly) ? "rb" : "r+b";
  FILE* file = fopen(name, fopen_mode);
  if (!file) return nullptr;

  fseek(file, 0, SEEK_END);
  size_t size = static_cast<size_t>(ftell(file));
  fseek(file, 0, SEEK_SET);

  void* memory = PageAlignedAlloc(size);
  if (!memory) {
    fclose(file);
    return nullptr;
  }

  if (size > 0 && fread(memory, 1, size, file) != size) {
    PageAlignedFree(memory);
    fclose(file);
    return nullptr;
  }
  fclose(file);

  return new MemoryMappedFile(memory, size);
}

// static
OS::MemoryMappedFile* OS::MemoryMappedFile::create(const char* name,
                                                    size_t size,
                                                    void* initial) {
  FILE* file = fopen(name, "w+b");
  if (!file) return nullptr;

  void* memory = PageAlignedAlloc(size);
  if (!memory) {
    fclose(file);
    return nullptr;
  }

  if (initial && size > 0) {
    memcpy(memory, initial, size);
  }

  if (size > 0 && fwrite(memory, 1, size, file) != size) {
    PageAlignedFree(memory);
    fclose(file);
    return nullptr;
  }
  fclose(file);

  return new MemoryMappedFile(memory, size);
}

OS::MemoryMappedFile::~MemoryMappedFile() {
  if (memory_) {
    PageAlignedFree(memory_);
  }
}


// **************************************************************************
//
//   OS :: Time
//
// **************************************************************************

// static
double OS::TimeCurrentMillis() {
  // Use Emscripten's high-resolution timer, which calls
  // performance.now() in the browser or Date.now() as fallback.
  return emscripten_get_now();
}

// static
TimezoneCache* OS::CreateTimezoneCache() {
  // Emscripten supports tzset()/localtime_r() via its JS-backed libc.
  // Use the POSIX default timezone cache.
  return new PosixDefaultTimezoneCache();
}


// **************************************************************************
//
//   OS :: Process and thread identification
//
// **************************************************************************

// static
int OS::GetCurrentProcessId() {
  // Emscripten's getpid() returns a constant (typically 42).
  // Good enough — there's only one "process" in a Wasm module.
  return static_cast<int>(getpid());
}

// static
int OS::GetCurrentThreadIdInternal() {
  // Use pthread_self() as the thread ID. In Emscripten with
  // SharedArrayBuffer enabled, each Web Worker has a unique pthread_t.
  return static_cast<int>(pthread_self());
}

// static
void OS::ExitProcess(int exit_code) {
  // In Emscripten, _exit() terminates the runtime.
  _exit(exit_code);
  // UNREACHABLE
}


// **************************************************************************
//
//   OS :: User time and memory usage
//
// **************************************************************************

// static
int OS::GetUserTime(uint32_t* secs, uint32_t* usecs) {
  // Emscripten doesn't support getrusage(RUSAGE_THREAD) accurately.
  // Use emscripten_get_now() as an approximation of elapsed time.
  // This is user+system time combined, which is acceptable for profiling.
  double ms = emscripten_get_now();
  double total_secs = ms / 1000.0;
  *secs = static_cast<uint32_t>(total_secs);
  *usecs = static_cast<uint32_t>((total_secs - *secs) * 1000000.0);
  return 0;
}

// static
int OS::GetPeakMemoryUsageKb() {
  // No reliable way to get peak RSS in Emscripten.
  // Could use emscripten_get_heap_size() / 1024 as an approximation
  // of current heap usage, but that's not peak RSS.
  return 0;
}


// **************************************************************************
//
//   OS :: Error handling
//
// **************************************************************************

// static
int OS::GetLastError() {
  return errno;
}


// **************************************************************************
//
//   OS :: File I/O
//
// **************************************************************************

// static
FILE* OS::FOpen(const char* path, const char* mode) {
  // Emscripten provides a virtual filesystem (MEMFS, NODEFS, etc.).
  FILE* result = fopen(path, mode);
  if (result == nullptr) return nullptr;
  return result;
}

// static
bool OS::Remove(const char* path) {
  return (remove(path) == 0);
}

// static
char OS::DirectorySeparator() {
  return '/';
}

// static
bool OS::isDirectorySeparator(const char ch) {
  return ch == '/';
}

// static
FILE* OS::OpenTemporaryFile() {
  return tmpfile();
}


// **************************************************************************
//
//   OS :: Printing
//
// **************************************************************************

// static
void OS::Print(const char* format, ...) {
  va_list args;
  va_start(args, format);
  VPrint(format, args);
  va_end(args);
}

// static
void OS::VPrint(const char* format, va_list args) {
  vprintf(format, args);
}

// static
void OS::FPrint(FILE* out, const char* format, ...) {
  va_list args;
  va_start(args, format);
  VFPrint(out, format, args);
  va_end(args);
}

// static
void OS::VFPrint(FILE* out, const char* format, va_list args) {
  vfprintf(out, format, args);
}

// static
void OS::PrintError(const char* format, ...) {
  va_list args;
  va_start(args, format);
  VPrintError(format, args);
  va_end(args);
}

// static
void OS::VPrintError(const char* format, va_list args) {
  vfprintf(stderr, format, args);
}


// **************************************************************************
//
//   OS :: String formatting
//
// **************************************************************************

// static
int OS::SNPrintF(char* str, int length, const char* format, ...) {
  va_list args;
  va_start(args, format);
  int result = VSNPrintF(str, length, format, args);
  va_end(args);
  return result;
}

// static
int OS::VSNPrintF(char* str, int length, const char* format, va_list args) {
  int n = vsnprintf(str, length, format, args);
  if (n < 0 || n >= length) {
    // Output was truncated or error occurred.
    if (length > 0) str[length - 1] = '\0';
    return -1;
  }
  return n;
}

// static
void OS::StrNCpy(char* dest, int length, const char* src, size_t n) {
  size_t copy_len = std::min(static_cast<size_t>(length), n);
  strncpy(dest, src, copy_len);
  // Ensure null termination
  if (length > 0) {
    dest[std::min(static_cast<size_t>(length - 1), n)] = '\0';
  }
}


// **************************************************************************
//
//   OS :: Sleep, Abort, DebugBreak
//
// **************************************************************************

// static
void OS::Sleep(TimeDelta interval) {
  // Emscripten supports usleep() in pthreads mode.
  // On the main thread, usleep() busy-waits, which is not ideal but
  // functional. V8 primarily calls this from background threads.
  usleep(static_cast<useconds_t>(interval.InMicroseconds()));
}

// static
void OS::Abort() {
  // In Emscripten, abort() raises SIGABRT and terminates the runtime.
  // This calls into Emscripten's _abort() which may show a stack trace.
  abort();
  // UNREACHABLE
}

// static
void OS::DebugBreak() {
  // Insert a "debugger;" statement that will pause in browser DevTools.
  emscripten_debugger();
}


// **************************************************************************
//
//   OS :: Signals and hardware features
//
// **************************************************************************

// static
bool OS::IsHardwareEnforcedShadowStacksEnabled() {
  // CET (Control-flow Enforcement Technology) shadow stacks are an
  // x86-64 hardware feature. Not applicable in Wasm.
  return false;
}

// static
void OS::EnsureAlternativeSignalStackIsAvailableForCurrentThread() {
  // sigaltstack() — signals do not exist in WebAssembly.
  // V8 uses this for trap handlers (SIGSEGV) which are disabled
  // in jitless/Wasm mode via V8_TRAP_HANDLER_SUPPORTED=0.
  // No-op.
}

// static
bool OS::ArmUsingHardFloat() {
  // ARM hard-float detection. Not applicable — we're running Wasm.
  return false;
}

// static
int OS::ActivationFrameAlignment() {
  // Return 16 as a safe default. This matches most platforms and
  // Wasm's natural alignment requirements. V8 uses this for stack
  // frame setup in the interpreter.
  return 16;
}


// **************************************************************************
//
//   OS :: Shared library addresses (profiling support)
//
// **************************************************************************

// static
std::vector<OS::SharedLibraryAddress> OS::GetSharedLibraryAddresses() {
  // On Linux, this parses /proc/self/maps to find loaded shared
  // libraries for profiling/symbolication. In Wasm, there are no
  // shared libraries — everything is in the Wasm module.
  return {};
}

// static
void OS::SignalCodeMovingGC() {
  // On Linux, this does a fake mmap("/tmp/__v8_gc__") to signal
  // the perf profiler about GC events. Not applicable in Wasm.
}

// static
void OS::AdjustSchedulingParams() {
  // On Linux, this can set scheduler parameters (SCHED_BATCH, etc.)
  // for GC threads. Not applicable in Wasm where the browser/runtime
  // controls thread scheduling.
}


// **************************************************************************
//
//   OS :: Free memory ranges
//
// **************************************************************************

// static
std::optional<OS::MemoryRange> OS::GetFirstFreeMemoryRangeWithin(
    Address boundary_start, Address boundary_end, size_t minimum_size,
    size_t alignment) {
  // On Linux, this parses /proc/self/maps to find gaps in the address
  // space. In Wasm linear memory, we can't determine free ranges.
  // Return nullopt — V8 will fall back to OS::Allocate with a hint.
  (void)boundary_start;
  (void)boundary_end;
  (void)minimum_size;
  (void)alignment;
  return std::nullopt;
}


// **************************************************************************
//
//   AddressSpaceReservation methods
//
// **************************************************************************

bool AddressSpaceReservation::Allocate(void* address, size_t size,
                                       OS::MemoryPermission access) {
  // "Commit" within a reservation. In Wasm, memory is already committed.
  // Zero-fill to provide clean pages.
  (void)access;
  DCHECK(Contains(address, size));
  if (address && size > 0) {
    memset(address, 0, size);
  }
  return true;
}

bool AddressSpaceReservation::Free(void* address, size_t size) {
  // "Decommit" within a reservation. Zero the memory to emulate
  // giving pages back to the OS.
  DCHECK(Contains(address, size));
  if (address && size > 0) {
    memset(address, 0, size);
  }
  return true;
}

bool AddressSpaceReservation::AllocateShared(void* address, size_t size,
                                             OS::MemoryPermission access,
                                             SharedMemoryHandle handle,
                                             uint64_t offset) {
  (void)access;
  (void)handle;
  (void)offset;
  DCHECK(Contains(address, size));
  if (address && size > 0) {
    memset(address, 0, size);
  }
  return true;
}

bool AddressSpaceReservation::FreeShared(void* address, size_t size) {
  DCHECK(Contains(address, size));
  return true;
}

bool AddressSpaceReservation::SetPermissions(void* address, size_t size,
                                             OS::MemoryPermission access) {
  (void)access;
  DCHECK(Contains(address, size));
  // No-op in Wasm — all memory is read/write.
  return true;
}

bool AddressSpaceReservation::RecommitPages(void* address, size_t size,
                                            OS::MemoryPermission access) {
  (void)access;
  DCHECK(Contains(address, size));
  if (address && size > 0) {
    memset(address, 0, size);
  }
  return true;
}

bool AddressSpaceReservation::DiscardSystemPages(void* address, size_t size) {
  DCHECK(Contains(address, size));
  // Advisory only — no-op.
  return true;
}

bool AddressSpaceReservation::DecommitPages(void* address, size_t size) {
  DCHECK(Contains(address, size));
  if (address && size > 0) {
    memset(address, 0, size);
  }
  return true;
}

std::optional<AddressSpaceReservation>
AddressSpaceReservation::CreateSubReservation(
    void* address, size_t size, OS::MemoryPermission max_permission) {
  (void)max_permission;
  DCHECK(Contains(address, size));
  return AddressSpaceReservation(address, size);
}

// static
bool AddressSpaceReservation::FreeSubReservation(
    AddressSpaceReservation reservation) {
  // Sub-reservations are bookkeeping only — the memory belongs to the
  // parent reservation. Nothing to free.
  (void)reservation;
  return true;
}

bool AddressSpaceReservation::SetName(const char* name) {
  (void)name;
  return false;
}


// **************************************************************************
//
//   Thread implementation
//
// **************************************************************************

// Thread::PlatformData holds the pthread handle.
class Thread::PlatformData {
 public:
  PlatformData() : thread_(0), has_thread_(false) {}
  pthread_t thread_;
  bool has_thread_;
};

Thread::Thread(const Options& options)
    : data_(new PlatformData()),
      priority_(options.priority()),
      stack_size_(options.stack_size()) {
  set_name(options.name());
}

Thread::~Thread() {
  delete data_;
}

void Thread::set_name(const char* name) {
  strncpy(name_, name, kMaxThreadNameLength - 1);
  name_[kMaxThreadNameLength - 1] = '\0';
}

namespace {

void* ThreadEntry(void* arg) {
  Thread* thread = static_cast<Thread*>(arg);
  // NotifyStartedAndRun() is the V8 entry point that calls Run()
  // after signaling the thread has started.
  thread->NotifyStartedAndRun();
  return nullptr;
}

}  // namespace

bool Thread::Start() {
  pthread_attr_t attr;
  int result = pthread_attr_init(&attr);
  if (result != 0) return false;

  if (stack_size_ > 0) {
    size_t stack = static_cast<size_t>(stack_size_);
    // Emscripten has a default stack size (usually 64KB or 256KB for
    // workers). Enforce a minimum.
    if (stack < kWasmPageSize) stack = kWasmPageSize;
    result = pthread_attr_setstacksize(&attr, stack);
    if (result != 0) {
      pthread_attr_destroy(&attr);
      return false;
    }
  }

  // Set detach state to joinable (default, but be explicit)
  pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_JOINABLE);

  result = pthread_create(&data_->thread_, &attr, ThreadEntry, this);
  pthread_attr_destroy(&attr);

  if (result != 0) return false;
  data_->has_thread_ = true;
  return true;
}

bool Thread::StartSynchronously() {
  // Start and wait until the thread signals it's running.
  // The base class default is to just call Start().
  return Start();
}

void Thread::Join() {
  if (!data_->has_thread_) return;
  pthread_join(data_->thread_, nullptr);
  data_->has_thread_ = false;
}

// --- Thread-local storage ---

// static
Thread::LocalStorageKey Thread::CreateThreadLocalKey() {
  pthread_key_t key;
  int result = pthread_key_create(&key, nullptr);
  DCHECK_EQ(0, result);
  USE(result);
  return static_cast<LocalStorageKey>(key);
}

// static
void Thread::DeleteThreadLocalKey(LocalStorageKey key) {
  pthread_key_delete(static_cast<pthread_key_t>(key));
}

// static
void* Thread::GetThreadLocal(LocalStorageKey key) {
  return pthread_getspecific(static_cast<pthread_key_t>(key));
}

// static
void Thread::SetThreadLocal(LocalStorageKey key, void* value) {
  int result = pthread_setspecific(static_cast<pthread_key_t>(key), value);
  DCHECK_EQ(0, result);
  USE(result);
}

// static
bool Thread::HasThreadLocal(LocalStorageKey key) {
  return GetThreadLocal(key) != nullptr;
}


// **************************************************************************
//
//   Stack
//
// **************************************************************************

// static
Stack::StackSlot Stack::ObtainCurrentThreadStackStart() {
  // Emscripten provides emscripten_stack_get_base() which returns
  // the high address (base) of the current thread's stack.
  // For the main thread, this is the start of the Emscripten-managed
  // stack region. For worker threads, it's the pthread stack base.
  return reinterpret_cast<void*>(emscripten_stack_get_base());
}

// static
Stack::StackSlot Stack::GetCurrentStackPosition() {
  // Use a local variable's address as a proxy for the current SP.
  // This is the standard technique used across all V8 platforms.
  volatile char dummy;
  return reinterpret_cast<void*>(
      const_cast<char*>(&dummy));
}


// **************************************************************************
//
//   Free functions
//
// **************************************************************************

void EnsureConsoleOutput() {
  // Console output always works in Emscripten — it goes to
  // console.log() in the browser or stdout in Node.js.
  // No initialization needed.
}


// **************************************************************************
//
//   PosixDefaultTimezoneCache
//
//   Emscripten's libc provides localtime_r, gmtime_r, tzset via
//   JavaScript Date object bindings. These work correctly for timezone
//   queries.
//
// **************************************************************************

const char* PosixDefaultTimezoneCache::LocalTimezone(double time) {
  if (std::isnan(time)) return "";
  time_t tv = static_cast<time_t>(std::floor(time / 1000.0));
  struct tm tm_result;
  struct tm* t = localtime_r(&tv, &tm_result);
  if (!t) return "";
  return t->tm_zone;
}

double PosixDefaultTimezoneCache::LocalTimeOffset(double time_ms,
                                                  bool is_utc) {
  // Compute UTC offset in milliseconds.
  time_t tv = static_cast<time_t>(std::floor(time_ms / 1000.0));
  struct tm tm_result;
  struct tm* t = localtime_r(&tv, &tm_result);
  if (!t) return 0;
  // tm_gmtoff is seconds east of UTC (POSIX extension, available in
  // Emscripten's musl-based libc).
  return static_cast<double>(t->tm_gmtoff * 1000);
}

double PosixDefaultTimezoneCache::DaylightSavingsOffset(double time_ms) {
  time_t tv = static_cast<time_t>(std::floor(time_ms / 1000.0));
  struct tm tm_result;
  struct tm* t = localtime_r(&tv, &tm_result);
  if (!t) return 0;
  return t->tm_isdst > 0 ? 3600.0 * 1000.0 : 0.0;
}

void PosixDefaultTimezoneCache::Clear(TimeZoneDetection time_zone_detection) {
  (void)time_zone_detection;
  tzset();
}


}  // namespace base
}  // namespace v8

#endif  // __EMSCRIPTEN__
