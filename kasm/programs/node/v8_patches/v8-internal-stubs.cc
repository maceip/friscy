// V8-specific stub definitions
// Abseil synchronization is stubbed in abseil-sync-stubs.cc

#include <cstddef>

namespace v8 {
namespace internal {

// v8_flags stub
struct V8Flags {
    bool jitless = true;
    bool single_threaded = true;
    bool no_snapshot = true;
};
V8Flags v8_flags;

// IsolateGroup stub
class IsolateGroup {
public:
    static void* default_isolate_group_;
};
void* IsolateGroup::default_isolate_group_ = nullptr;

// CpuFeatures stubs
class CpuFeatures {
public:
    static bool initialized_;
    static unsigned supported_;
    static bool supports_wasm_simd_128_;
    static bool supports_cetss_;

    static bool SupportsWasmSimd128() { return false; }
    static bool SupportsCetss() { return false; }
    static bool IsSupported(unsigned feature) { return false; }
};
bool CpuFeatures::initialized_ = false;
unsigned CpuFeatures::supported_ = 0;
bool CpuFeatures::supports_wasm_simd_128_ = false;
bool CpuFeatures::supports_cetss_ = false;

// CppHeap stub
class CppHeap {
public:
    static void InitializeOncePerProcess();
};
void CppHeap::InitializeOncePerProcess() {}

// FlagList stub
class FlagList {
public:
    static void SetFlagsFromString(const char* str, size_t size);
};
void FlagList::SetFlagsFromString(const char* str, size_t size) {
    (void)str;
    (void)size;
}

} // namespace internal
} // namespace v8

// heap::base stubs
namespace heap {
namespace base {
class WorklistBase {
public:
    static bool predictable_order_;
};
bool WorklistBase::predictable_order_ = false;
} // namespace base
} // namespace heap

// cppgc stubs
namespace cppgc {
namespace internal {
class GlobalGCInfoTable {
public:
    static void* global_table_;
};
void* GlobalGCInfoTable::global_table_ = nullptr;
} // namespace internal
} // namespace cppgc
