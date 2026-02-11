cmake_minimum_required(VERSION 3.14)
project(friscy CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

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
# 28-bit = 256MB, 29-bit = 512MB, 30-bit = 1GB
# Larger arena = more containers supported, but higher memory baseline
set(RISCV_ENCOMPASSING_ARENA ON  CACHE BOOL "Pre-allocate guest address space")
set(RISCV_ENCOMPASSING_ARENA_BITS 29 CACHE STRING "512MB guest address space")
set(RISCV_FLAT_RW_ARENA ON  CACHE BOOL "Fast read-write arena")
set(RISCV_MEMORY_TRAPS OFF CACHE BOOL "Disable page traps (overhead)")

# --- Features to disable for Wasm ---
set(RISCV_BINARY_TRANSLATION OFF CACHE BOOL "Requires dlopen/native code")
set(RISCV_LIBTCC OFF CACHE BOOL "TCC not available in Wasm")
set(RISCV_EXPERIMENTAL ON  CACHE BOOL "Enable experimental features")

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
            -fexceptions
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
            -fexceptions
            -msimd128              # WASM SIMD (2-4x faster memcpy)
            -mbulk-memory          # Fast memcpy/memset intrinsics
        )
    else()
        target_compile_options(friscy PRIVATE
            -O2
            -fexceptions
        )
    endif()
endif()

# --- Link flags ---
if(EMSCRIPTEN)
    set(FRISCY_LINK_FLAGS
        -fexceptions
        -msimd128                       # WASM SIMD for faster memory ops
        -mbulk-memory                   # memory.copy, memory.fill intrinsics
        -sALLOW_TABLE_GROWTH
        -sINITIAL_MEMORY=536870912      # 512MB initial (matches 29-bit arena)
        -sALLOW_MEMORY_GROWTH
        -sMAXIMUM_MEMORY=2147483648     # 2GB max
        -sSTACK_SIZE=1048576            # 1MB stack
        -sEXPORT_ES6=1
        -sMODULARIZE=1
        -sEXPORTED_RUNTIME_METHODS=['FS','callMain','HEAPU8']
        -sEXPORTED_FUNCTIONS=['_main','_malloc','_free','_friscy_export_tar']
    )

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
            -sASSERTIONS=1
        )
    endif()

    # Wizer support for instant snapshots
    if(FRISCY_WIZER)
        list(APPEND FRISCY_LINK_FLAGS
            -sEXPORTED_FUNCTIONS=['_main','_malloc','_free','_wizer_init']
        )
        target_compile_definitions(friscy PRIVATE FRISCY_WIZER=1)
    endif()

    target_link_options(friscy PRIVATE ${FRISCY_LINK_FLAGS})

    # Output file
    set_target_properties(friscy PROPERTIES
        OUTPUT_NAME "friscy"
        SUFFIX ".js"
    )
else()
    # Native build
    target_link_options(friscy PRIVATE -fexceptions)
endif()

# --- Print configuration ---
message(STATUS "friscy configuration:")
message(STATUS "  Production build: ${FRISCY_PRODUCTION}")
message(STATUS "  Wizer snapshots: ${FRISCY_WIZER}")
message(STATUS "  Arena size: ${RISCV_ENCOMPASSING_ARENA_BITS} bits (${RISCV_ENCOMPASSING_ARENA_BITS})")
message(STATUS "  Threaded dispatch: ${RISCV_THREADED}")
