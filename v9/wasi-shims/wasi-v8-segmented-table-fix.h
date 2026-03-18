// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_V8_SEGMENTED_TABLE_FIX_H_
#define WASI_V8_SEGMENTED_TABLE_FIX_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstdint>

#ifndef V8_ENABLE_SANDBOX_BOOL
#define V8_ENABLE_SANDBOX_BOOL false
#endif

namespace v8 {
namespace internal {

// Forward declare the base template
template <typename Entry, size_t kReservationSize>
class SegmentedTable;

namespace wasm {

struct WasmCodePointerTableEntry {
  uint32_t code_pointer = 0;
  uint32_t signature_hash = 0;
};

}  // namespace wasm

// Specialization of SegmentedTable for WasmCodePointerTableEntry
template <>
class SegmentedTable<wasm::WasmCodePointerTableEntry, 1024 * 1024> {
 public:
  struct FreelistHead {
    uint32_t next_ = 0;
    uint32_t length_ = 0;

    FreelistHead() = default;
    FreelistHead(uint32_t next, uint32_t length)
        : next_(next), length_(length) {}

    bool is_empty() const { return length_ == 0; }
  };

  SegmentedTable() = default;
  virtual ~SegmentedTable() = default;
};

}  // namespace internal
}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_V8_SEGMENTED_TABLE_FIX_H_
