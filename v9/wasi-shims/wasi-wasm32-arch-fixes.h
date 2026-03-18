// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_WASM32_ARCH_FIXES_H_
#define WASI_WASM32_ARCH_FIXES_H_

#if defined(V8_TARGET_ARCH_WASM32) || defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstdint>
#include <cstddef>

namespace v8 {
namespace internal {

// MemOperand class (tagged union pattern)
class MemOperand {
 public:
  enum Kind { kRegisterPlusOffset, kImmediate };

  MemOperand() : kind_(kImmediate), base_(0), offset_(0) {}
  explicit MemOperand(int base, int offset = 0)
      : kind_(kRegisterPlusOffset), base_(base), offset_(offset) {}

  Kind kind() const { return kind_; }
  int base() const { return base_; }
  int offset() const { return offset_; }

 private:
  Kind kind_;
  int base_;
  int offset_;
};

// Operand class (tagged union pattern)
class Operand {
 public:
  enum Kind { kImmediate, kRegister, kMemOperand };

  Operand() : kind_(kImmediate), value_(0) {}
  explicit Operand(intptr_t imm) : kind_(kImmediate), value_(imm) {}
  explicit Operand(int reg, int /*unused*/)
      : kind_(kRegister), value_(reg) {}

  Kind kind() const { return kind_; }
  intptr_t immediate() const { return value_; }
  bool is_reg() const { return kind_ == kRegister; }

 private:
  Kind kind_;
  intptr_t value_;
};

// Frame pointer = register code 10
static constexpr int kFramePointerRegCode = 10;

// Assembler stub
class Assembler {
 public:
  Assembler() = default;
  virtual ~Assembler() = default;

  void nop() {}
  void int3() {}
  void bind(void* label) { (void)label; }
  void jmp(void* target) { (void)target; }
  void ret(int imm = 0) { (void)imm; }

  uint8_t* buffer_start() { return nullptr; }
  int pc_offset() const { return 0; }
};

// MacroAssembler stub
class MacroAssembler : public Assembler {
 public:
  MacroAssembler() = default;
  ~MacroAssembler() override = default;

  void Push(int reg) { (void)reg; }
  void Pop(int reg) { (void)reg; }
  void Move(int dst, int src) { (void)dst; (void)src; }
  void LoadRoot(int dst, int root_index) { (void)dst; (void)root_index; }
};

// JumpTableAssembler namespace
namespace wasm {

class JumpTableAssembler {
 public:
  // Emit a lazy compile jump slot
  static void EmitLazyCompileJumpSlot(
      void* raw_buffer, uint32_t slot_index,
      uint32_t lazy_compile_table_start, void* wasm_compile_lazy_address) {
    (void)raw_buffer; (void)slot_index;
    (void)lazy_compile_table_start; (void)wasm_compile_lazy_address;
  }

  // Emit a regular jump slot
  static void EmitJumpSlot(void* raw_buffer, void* target,
                           uint32_t slot_index) {
    (void)raw_buffer; (void)target; (void)slot_index;
  }

  static constexpr int kJumpTableSlotSize = 8;
  static constexpr int kLazyCompileTableSlotSize = 12;
  static constexpr int kJumpTableLineSize = 64;
};

}  // namespace wasm

}  // namespace internal
}  // namespace v8

#endif  // V8_TARGET_ARCH_WASM32 || __wasi__ || __EMSCRIPTEN__
#endif  // WASI_WASM32_ARCH_FIXES_H_
