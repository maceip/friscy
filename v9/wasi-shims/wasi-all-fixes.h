// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_ALL_FIXES_H_
#define WASI_ALL_FIXES_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

// ---- Size Constants ----
#ifndef KB
#define KB (1024)
#endif
#ifndef MB
#define MB (1024 * 1024)
#endif
#ifndef GB
#define GB (1024 * 1024 * 1024)
#endif

#ifndef kSystemPointerSizeLog2
constexpr int kSystemPointerSizeLog2 = 2;  // 32-bit wasm
#endif

// ---- Standard Library Pre-includes ----
// Include at global scope to prevent namespace pollution when V8's
// internal headers re-open namespaces.
#include <algorithm>
#include <array>
#include <atomic>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <limits>
#include <memory>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

// ---- Signal Stubs ----
#ifndef SIGBUS
#define SIGBUS 7
#endif
#ifndef SIGSYS
#define SIGSYS 31
#endif

// ---- Architecture / Platform ----
#if !defined(V8_OS_POSIX) && defined(__EMSCRIPTEN__)
#define V8_OS_POSIX 1
#define V8_OS_LINUX 1
#endif

#ifndef V8_HOST_ARCH_32_BIT
#define V8_HOST_ARCH_32_BIT 1
#endif

#ifndef V8_JITLESS
#define V8_JITLESS 1
#endif

// ---- Forward declarations / pre-includes for V8 ----
// These prevent ordering issues when v8-internal.h and v8-isolate.h
// are included from within nested namespaces.

namespace v8 {
class Isolate;
class Context;
class Value;
class String;
class Object;
class Function;
class Array;
template <class T> class Local;
template <class T> class MaybeLocal;
template <class T> class Global;

namespace base {
namespace internal {
// Internal helpers that get re-exported
}  // namespace internal

// Re-export internal symbols
using namespace internal;
}  // namespace base

namespace internal {
using Address = uintptr_t;
}  // namespace internal
}  // namespace v8

// ---- cppgc stubs ----
namespace cppgc {

class AllocationHandle;

class Visitor {
 public:
  virtual ~Visitor() = default;
};

class HeapStatistics {
 public:
  size_t used_size_bytes = 0;
  size_t allocated_size_bytes = 0;
  size_t pooled_size_bytes = 0;
};

namespace internal {
class HeapBase;
}  // namespace internal

class Heap {
 public:
  virtual ~Heap() = default;
};

}  // namespace cppgc

// ---- EmbedderGraph stub ----
namespace v8 {
class EmbedderGraph {
 public:
  class Node {
   public:
    virtual ~Node() = default;
    virtual const char* Name() { return ""; }
    virtual size_t SizeInBytes() { return 0; }
    virtual Node* WrapperNode() { return nullptr; }
    virtual bool IsRootNode() { return false; }
    virtual bool IsEmbedderNode() { return true; }
  };
  virtual ~EmbedderGraph() = default;
  virtual Node* V8Node(const void*) { return nullptr; }
  virtual Node* AddNode(std::unique_ptr<Node>) { return nullptr; }
  virtual void AddEdge(Node*, Node*, const char* = nullptr) {}
};
}  // namespace v8

// ---- Platform allocator stub ----
namespace v8 {
namespace platform {
inline void* Malloc(size_t size) { return ::malloc(size); }
inline void Free(void* ptr) { ::free(ptr); }
}  // namespace platform
}  // namespace v8

// ---- Assembler directive stubs ----
namespace v8 {
namespace internal {
namespace assembler {
inline void nop() {}
inline void int3() {}
}  // namespace assembler
}  // namespace internal
}  // namespace v8

// ---- Disassembler stub ----
namespace v8 {
namespace internal {
class Disassembler {
 public:
  static int Decode(void*, void*, void*, void* = nullptr) { return 0; }
};
}  // namespace internal
}  // namespace v8

// ---- Process stubs (WASIX only) ----
#include <sys/types.h>
#ifndef __EMSCRIPTEN__
static inline pid_t fork(void) { return -1; }
static inline int execvp(const char*, char* const[]) { return -1; }
#endif

// ---- Include sub-fix headers ----
#include "wasi-platform-fixes.h"
#include "wasi-cppgc-stubs.h"
#include "wasi-system-compat.h"
#include "wasi-namespace-fixes.h"
#include "wasi-v8-base-includes.h"
#include "wasi-v8-essential-constants.h"

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_ALL_FIXES_H_
