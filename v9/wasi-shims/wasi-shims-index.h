// Master index of all WASI/Emscripten shim headers.
// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build.
//
// Include order matters. The primary entry point is wasi-all-fixes.h,
// which is force-included into every compilation unit via:
//   -include wasi-shims/wasi-all-fixes.h
//
// This index file is for reference and can be included directly if needed.

#ifndef WASI_SHIMS_INDEX_H_
#define WASI_SHIMS_INDEX_H_

// ======== Layer 0: Minimal / Foundational ========
#include "wasi-minimal-fixes.h"              // kSystemPointerSize
#include "wasi-filesystem-stubs.h"           // (empty placeholder)

// ======== Layer 1: Platform & System ========
#include "wasi-platform-fixes.h"             // FixCreateParams for Isolate
#include "wasi-system-compat.h"              // RLIMIT, NI_NUMERICSERV, clock, cppgc stats

// ======== Layer 2: cppgc / GC Stubs ========
#include "wasi-cppgc-stubs.h"                // AllocationHandle forward decl
#include "wasi-cppheap-pointer-table-stub.h" // CppHeapPointerTableEntry, handles

// ======== Layer 3: V8 Internals (low-level) ========
#include "wasi-v8-internals.h"               // Internals class (SMI, tags, roots)
#include "wasi-v8-internals-constants.h"      // ValueHelper, instance type constants
#include "wasi-v8-internals-minimal.h"        // (delegates to nuclear-fix.h)
#include "wasi-external-pointer-compat.h"     // ExternalPointer_t typedef
#include "wasi-v8-essential-constants.h"      // kSmiTag, kHeapObjectTag, bits bridge
#include "wasi-v8-missing-types.h"            // Forwarding shim for missing types

// ======== Layer 4: V8 Base Utilities ========
#include "wasi-v8-bits-fixes.h"              // Bit field/bits includes
#include "wasi-v8-lazy-instance-fix.h"        // (no-op stub)
#include "wasi-v8-base-includes.h"            // V8 base header pre-includes
#include "wasi-v8-flags-fix.h"                // V8 flags include guard
#include "wasi-v8-template-utils.h"           // Template utilities

// ======== Layer 5: V8 Namespace & Operator Fixes ========
#include "wasi-namespace-fixes.h"             // v8::internal::base aliases
#include "wasi-v8-namespace-fix.h"            // Prevent nested v8::v8::
#include "wasi-v8-operator-fix.h"             // Operator::Properties class

// ======== Layer 6: V8 Sandbox & Segmented Tables ========
#include "wasi-v8-sandbox-stubs.h"            // Sandbox-related stubs
#include "wasi-v8-segmented-table-fix.h"      // SegmentedTable, FreelistHead

// ======== Layer 7: V8 API Layer ========
#include "wasi-v8-api-stubs.h"                // HandleScope, size constants, forward decls
#include "wasi-v8-api-additions.h"            // LocalVector, FixedArray, TracingController
#include "wasi-v8-value-methods.h"            // (compatibility wrapper)
#include "wasi-v8-missing-methods.h"          // ValueToBoolean

// ======== Layer 8: V8 Isolate & Arguments ========
#include "wasi-v8-isolate-extensions.h"       // Isolate method stubs
#include "wasi-v8-custom-arguments.h"         // CustomArguments template stub
#include "wasi-v8-initialization-functions.h" // PointerCompressionIsEnabled, SandboxIsEnabled

// ======== Layer 9: V8 Complete Types ========
#include "wasi-v8-complete-types.h"           // TypedArrays, Isolate, PromiseReject
#include "wasi-v8-complete-missing.h"         // All remaining stubs
#include "wasi-v8-node-missing.h"             // Node.js-specific V8 API gaps
#include "wasi-v8-minimal-missing.h"          // Delegates to node-missing

// ======== Layer 10: simdutf ========
#include "wasi-simdutf-compat.h"              // result struct, base64_type enum
#include "wasi-simdutf-stubs.h"               // validate_ascii, convert_latin1_to_utf8

// ======== Layer 11: Architecture & Builtins ========
#include "wasi-wasm32-arch-fixes.h"           // MemOperand, Assembler, JumpTable
#include "wasi-bytecodes-builtins-list.h"     // BUILTIN_LIST_BYTECODE_HANDLERS

// ======== Layer 12: Node.js Integration ========
#include "wasi-node-compat.h"                 // Master Node.js compat include

// ======== Layer 13: Comprehensive / Catch-all ========
#include "wasi-additional-fixes.h"            // Zone, Hash, SmallVector, Assembler
#include "wasi-comprehensive-fixes.h"         // Namespace re-exports, profiling
#include "wasi-consolidated-fixes.h"          // Base types, assertions, allocators
#include "wasi-runtime-profiler-fixes.h"      // CPU/Heap profiler, tracing, DTOA

// ======== Master Include ========
// wasi-all-fixes.h includes a subset of the above in the correct order
// and is the primary entry point for force-include mode.

#endif  // WASI_SHIMS_INDEX_H_
