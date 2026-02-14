cmake_minimum_required(VERSION 3.14)
project(friscy CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Apply -O3 + LTO globally so libriscv's interpreter hot path benefits too
if(NOT EMSCRIPTEN)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -flto -march=native -DNDEBUG")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3 -flto -march=native -DNDEBUG")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -flto -O3")
else()
    # SHARED_MEMORY requires atomics+bulk-memory at compile time (for all TUs including libriscv)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -matomics -mbulk-memory")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -matomics -mbulk-memory")
endif()

# ============================================================================
# friscy: Docker container runner via libriscv → WebAssembly
#
# Goal: Beat WebVM/CheerpX performance through:
#   1. Simple ISA (RISC-V vs x86) = efficient interpreter
#   2. Pre-compiled Wasm (Emscripten LLVM) vs runtime JIT
#   3. Threaded dispatch (computed goto) = ~40-50% native perf
#   4. Wizer snapshots = instant startup
#   5. No kernel boot (userland emulation)
#
# Key configuration decisions (see PERFORMANCE_ROADMAP.md):
#   - NO MEMORY64: Guest 64-bit addrs are uint64_t in 32-bit host space
#   - NO TAIL CALLS: Wasm return_call != libriscv's musttail dispatch
#   - NO BINARY TRANSLATION: No dlopen in Wasm
#   - YES EXCEPTIONS: libriscv uses throw/catch
#   - THREADED DISPATCH: Fastest interpreter mode
#   - ENCOMPASSING ARENA: O(1) memory access, 256MB guest space
# ============================================================================

option(FRISCY_WIZER "Enable Wizer pre-initialization support" OFF)
option(FRISCY_PRODUCTION "Production build with maximum optimization" OFF)

# --- Core ISA ---
set(RISCV_32I OFF CACHE BOOL "")
set(RISCV_64I ON  CACHE BOOL "")
set(RISCV_EXT_A ON  CACHE BOOL "Atomics extension")
set(RISCV_EXT_C ON  CACHE BOOL "Compressed instructions (2-byte opcodes)")
set(RISCV_EXT_F ON  CACHE BOOL "Single-precision FP")
set(RISCV_EXT_D ON  CACHE BOOL "Double-precision FP")
set(RISCV_EXT_V OFF CACHE BOOL "Vector extension (complex, not needed)")
set(RISCV_EXT_ZICOND OFF CACHE BOOL "")
set(RISCV_EXT_ZMMUL  OFF CACHE BOOL "")
set(RISCV_EXT_ZCMP   OFF CACHE BOOL "")

# --- Dispatch mode ---
# Threaded dispatch (computed goto) works in Emscripten and is fastest.
# Provides ~30-40% speedup over switch-based dispatch.
set(RISCV_THREADED ON  CACHE BOOL "Computed-goto threaded dispatch")
set(RISCV_TAILCALL_DISPATCH OFF CACHE BOOL "musttail doesn't work in Wasm")

# --- Memory configuration ---
# Encompassing arena: pre-allocate full guest address space
# 28-bit = 256MB, 29-bit = 512MB, 30-bit = 1GB, 31-bit = 2GB
# 31-bit required for Node.js/V8 (pointer cage + code spaces need ~1.15GB)
set(RISCV_ENCOMPASSING_ARENA ON  CACHE BOOL "Pre-allocate guest address space")
set(RISCV_ENCOMPASSING_ARENA_BITS 31 CACHE STRING "2GB guest address space")
set(RISCV_FLAT_RW_ARENA ON  CACHE BOOL "Fast read-write arena")
set(RISCV_MEMORY_TRAPS OFF CACHE BOOL "Disable page traps (overhead)")

# --- Features ---
# Binary translation (libtcc JIT) tested but 7x slower than interpreter:
# compilation overhead dwarfs execution benefit for startup-heavy workloads.
# V8 JIT (Sparkplug) tested but 9x slower: interpreted JIT code + decoder cache thrash.
# Threaded dispatch interpreter is fastest for our use case.
set(RISCV_BINARY_TRANSLATION OFF CACHE BOOL "Tested: 7x slower due to compilation overhead")
set(RISCV_LIBTCC OFF CACHE BOOL "Not needed without binary translation")
set(RISCV_EXPERIMENTAL ON  CACHE BOOL "Enable experimental features")

# --- Execute segments ---
# Node.js dynamically links 16+ shared libraries, and V8's JIT compiler
# generates many code regions. Each needs its own execute segment.
add_definitions(-DRISCV_MAX_EXECUTE_SEGS=1024)

# --- Add libriscv ---
# libriscv is in ../vendor/libriscv (cloned by setup scripts)
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../vendor/libriscv/lib ${CMAKE_BINARY_DIR}/libriscv)

# --- Main executable ---
add_executable(friscy main.cpp)
target_link_libraries(friscy PUBLIC riscv)

# Include directories for our headers
target_include_directories(friscy PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# --- Compile flags ---
if(FRISCY_PRODUCTION)
    # Maximum performance for production
    if(EMSCRIPTEN)
        target_compile_options(friscy PRIVATE
            -O3
            -flto
            -fno-rtti
            -fwasm-exceptions
            -sWASM_LEGACY_EXCEPTIONS=0
            -DNDEBUG
            -msimd128              # WASM SIMD
            -mbulk-memory          # Fast memcpy/memset
            -mnontrapping-fptoint  # Faster FP conversions
        )
    else()
        target_compile_options(friscy PRIVATE
            -O3
            -flto
            -fno-rtti
            -fexceptions
            -DNDEBUG
        )
    endif()
else()
    # Development build
    if(EMSCRIPTEN)
        target_compile_options(friscy PRIVATE
            -O2
            -fwasm-exceptions
            -sWASM_LEGACY_EXCEPTIONS=0
            -msimd128              # WASM SIMD (2-4x faster memcpy)
            -mbulk-memory          # Fast memcpy/memset intrinsics
        )
    else()
        # Native build: maximize interpreter throughput
        target_compile_options(friscy PRIVATE
            -O3
            -flto
            -march=native
            -fexceptions
            -DNDEBUG
        )
    endif()
endif()

# --- Link flags ---
if(EMSCRIPTEN)
    set(FRISCY_LINK_FLAGS
        -fwasm-exceptions
        -sWASM_LEGACY_EXCEPTIONS=0
        -sSUPPORT_LONGJMP=0
        -sSHARED_MEMORY=1               # SharedArrayBuffer for Worker communication
        -sPTHREAD_POOL_SIZE=0           # No pthread workers — we manage our own Worker
        -msimd128                       # WASM SIMD for faster memory ops
        -mbulk-memory                   # memory.copy, memory.fill intrinsics
        -sALLOW_TABLE_GROWTH
        -sINITIAL_MEMORY=3221225472     # 3GB initial (2GB arena + overhead)
        -sALLOW_MEMORY_GROWTH
        -sMAXIMUM_MEMORY=4294967296     # 4GB max (wasm32 limit)
        -sSTACK_SIZE=1048576            # 1MB stack
        -sEXPORT_ES6=1
        -sMODULARIZE=1
        -sEXPORTED_RUNTIME_METHODS=['FS','callMain','HEAPU8','HEAPU32','wasmExports','wasmMemory']
        # Note: stdin polling uses machine.stop()/resume() + JS setTimeout,
        # NOT emscripten_sleep/ASYNCIFY (which can't unwind through libriscv)
    )

    # Build consolidated EXPORTED_FUNCTIONS list
    set(FRISCY_EXPORTS "_main" "_malloc" "_free" "_friscy_export_tar" "_friscy_stopped" "_friscy_resume" "_friscy_get_pc" "_friscy_set_pc" "_friscy_get_state_ptr")
    if(FRISCY_WIZER)
        list(APPEND FRISCY_EXPORTS "_wizer_init")
        target_compile_definitions(friscy PRIVATE FRISCY_WIZER=1)
    endif()
    # Format as ['_main','_malloc',...] for Emscripten
    list(JOIN FRISCY_EXPORTS "','" FRISCY_EXPORTS_STR)
    list(APPEND FRISCY_LINK_FLAGS "-sEXPORTED_FUNCTIONS=['${FRISCY_EXPORTS_STR}']")

    if(FRISCY_PRODUCTION)
        list(APPEND FRISCY_LINK_FLAGS
            -O3
            -flto
            --closure=1                 # Minify JS glue
            -sWASM_BIGINT               # Native i64 (faster)
            -sENVIRONMENT=web,worker    # Strip Node.js code
            -sSINGLE_FILE               # Embed Wasm in JS
        )
    else()
        list(APPEND FRISCY_LINK_FLAGS
            -O2
        )
        if(NOT FRISCY_WIZER)
            list(APPEND FRISCY_LINK_FLAGS -sASSERTIONS=1)
        endif()
    endif()

    target_link_options(friscy PRIVATE ${FRISCY_LINK_FLAGS})

    # Output file
    set_target_properties(friscy PROPERTIES
        OUTPUT_NAME "friscy"
        SUFFIX ".js"
    )
else()
    # Native build — LTO for cross-TU inlining of interpreter hot path
    target_link_options(friscy PRIVATE -fexceptions -flto -O3)
endif()

# --- Print configuration ---
message(STATUS "friscy configuration:")
message(STATUS "  Production build: ${FRISCY_PRODUCTION}")
message(STATUS "  Wizer snapshots: ${FRISCY_WIZER}")
message(STATUS "  Arena size: ${RISCV_ENCOMPASSING_ARENA_BITS} bits (${RISCV_ENCOMPASSING_ARENA_BITS})")
message(STATUS "  Threaded dispatch: ${RISCV_THREADED}")
