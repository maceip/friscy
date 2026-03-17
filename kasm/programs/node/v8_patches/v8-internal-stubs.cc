// V8-specific stub definitions
// Abseil synchronization is stubbed in abseil-sync-stubs.cc
//
// CRITICAL: v8_flags MUST NOT be stubbed here. It must come from
// compiling src/flags/flags.cc for real. The FlagValues struct has
// hundreds of fields and every V8 .o file accesses them at fixed offsets.
// A 3-field stub creates an ABI mismatch — V8 reads garbage at offset 50+.
//
// If you CANNOT compile flags.cc, use the large zeroed buffer below as
// an emergency fallback (uncomment EMERGENCY_FLAGS_STUB).

#include <cstddef>
#include <cstdint>
#include <cstring>

namespace v8 {
namespace internal {

// ============================================================================
// v8_flags — DO NOT USE A SMALL STUB
// ============================================================================
//
// PREFERRED: Compile src/flags/flags.cc for real. It's pure data, no
// platform-specific code. Add it to your V8 .o file list.
//
// EMERGENCY FALLBACK: If flags.cc won't compile, uncomment the block below.
// It provides a 16KB zeroed buffer at the v8_flags symbol. Zero-initialized
// bools are false, zero ints are 0, zero pointers are null. V8 will see
// all flags as their zero/false value. Then we patch the critical ones
// at known offsets.
//
// To find flag offsets: compile a small program that includes
// src/flags/flags.h and prints offsetof(FlagValues, jitless), etc.

// #define EMERGENCY_FLAGS_STUB
#ifdef EMERGENCY_FLAGS_STUB

// FlagValues is typically 4-8KB. 16KB is safe headroom.
// All fields zero-initialized = all bool flags false, all int flags 0.
alignas(16) char v8_flags[16384] = {};

// After V8 is linked but before it runs, you must patch critical flags.
// Example (call this from your main() before V8::Initialize()):
//
//   void patch_v8_flags() {
//       // These offsets come from: offsetof(v8::internal::FlagValues, field)
//       // You MUST determine them from your V8 version's generated headers.
//       // Wrong offsets = subtle corruption.
//       //
//       // v8_flags[OFFSET_OF_JITLESS] = 1;
//       // v8_flags[OFFSET_OF_SINGLE_THREADED] = 1;
//       // *(int*)(v8_flags + OFFSET_OF_STACK_SIZE) = 984;  // default 984KB
//   }

#endif // EMERGENCY_FLAGS_STUB

// ============================================================================
// IsolateGroup — static member (symbol only, no ABI issue)
// ============================================================================
class IsolateGroup {
public:
    static void* default_isolate_group_;
};
void* IsolateGroup::default_isolate_group_ = nullptr;

// ============================================================================
// CpuFeatures — static members and static methods (no ABI issue)
// ============================================================================
class CpuFeatures {
public:
    static bool initialized_;
    static unsigned supported_;
    static bool supports_wasm_simd_128_;
    static bool supports_cetss_;

    static bool SupportsWasmSimd128() { return false; }
    static bool SupportsCetss() { return false; }
    static bool IsSupported(unsigned feature) {
        (void)feature;
        return false;
    }
};
bool CpuFeatures::initialized_ = false;
unsigned CpuFeatures::supported_ = 0;
bool CpuFeatures::supports_wasm_simd_128_ = false;
bool CpuFeatures::supports_cetss_ = false;

// ============================================================================
// CppHeap — compile src/heap/cppgc-js/cpp-heap.cc for real if possible
// The no-op is OK for initial boot but may need the real implementation
// once GC runs.
// ============================================================================
class CppHeap {
public:
    static void InitializeOncePerProcess();
};
void CppHeap::InitializeOncePerProcess() {}

// ============================================================================
// FlagList — REMOVE if compiling src/flags/flags.cc for real
// ============================================================================
#ifndef EMERGENCY_FLAGS_STUB
// If you're compiling flags.cc, it provides FlagList. Remove this.
// If you're using the emergency stub, you still need this:
#endif

class FlagList {
public:
    static void SetFlagsFromString(const char* str, size_t size);
    static void EnforceFlags();
    static void FreezeFlags();
    static int SetFlagsFromCommandLine(int* argc, char** argv, bool remove_flags);
};
void FlagList::SetFlagsFromString(const char* str, size_t size) {
    (void)str; (void)size;
}
void FlagList::EnforceFlags() {}
void FlagList::FreezeFlags() {}
int FlagList::SetFlagsFromCommandLine(int* argc, char** argv, bool remove_flags) {
    (void)argc; (void)argv; (void)remove_flags;
    return 0;
}

} // namespace internal
} // namespace v8

// ============================================================================
// heap::base — static member (no ABI issue)
// ============================================================================
namespace heap {
namespace base {
class WorklistBase {
public:
    static bool predictable_order_;
};
bool WorklistBase::predictable_order_ = false;
} // namespace base
} // namespace heap

// ============================================================================
// cppgc — static member (no ABI issue)
// ============================================================================
namespace cppgc {
namespace internal {
class GlobalGCInfoTable {
public:
    static void* global_table_;
};
void* GlobalGCInfoTable::global_table_ = nullptr;
} // namespace internal
} // namespace cppgc
