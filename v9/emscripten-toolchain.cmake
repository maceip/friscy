# Emscripten Toolchain for EdgeJS
# Replaces wasix/wasix-toolchain.cmake from upstream EdgeJS
#
# Usage:
#   cmake -DCMAKE_TOOLCHAIN_FILE=../emscripten-toolchain.cmake ..
#
# This file mirrors the structure of EdgeJS's wasix-toolchain.cmake
# but targets Emscripten instead of WASIX.

# ---- Emscripten SDK Detection ----
if(NOT DEFINED ENV{EMSDK})
    message(FATAL_ERROR "EMSDK environment variable not set. Run: source emsdk_env.sh")
endif()

set(EMSDK_DIR "$ENV{EMSDK}")
set(EMSCRIPTEN_ROOT "${EMSDK_DIR}/upstream/emscripten")

# ---- System identification ----
set(CMAKE_SYSTEM_NAME Emscripten)
set(CMAKE_SYSTEM_PROCESSOR wasm32)
set(CMAKE_CROSSCOMPILING TRUE)

# ---- Compilers ----
set(CMAKE_C_COMPILER "${EMSCRIPTEN_ROOT}/emcc")
set(CMAKE_CXX_COMPILER "${EMSCRIPTEN_ROOT}/em++")
set(CMAKE_AR "${EMSCRIPTEN_ROOT}/emar")
set(CMAKE_RANLIB "${EMSCRIPTEN_ROOT}/emranlib")
set(CMAKE_STRIP "${EMSCRIPTEN_ROOT}/emstrip")

# ---- Wasm feature flags ----
# Match EdgeJS's WASIX build features, adapted for Emscripten
set(WASM_FEATURES
    "-msimd128"
    "-mbulk-memory"
    "-matomics"
    "-mtail-call"
    "-fwasm-exceptions"
)
string(JOIN " " WASM_FEATURES_STR ${WASM_FEATURES})

# ---- Compiler flags ----
set(CMAKE_C_FLAGS_INIT "${WASM_FEATURES_STR} -pthread")
set(CMAKE_CXX_FLAGS_INIT "${WASM_FEATURES_STR} -pthread -std=c++20")

# ---- N-API Provider ----
# In browser mode, N-API is provided by the browser's JS engine
# This matches EdgeJS's WASIX mode where EDGE_NAPI_PROVIDER=imports
set(EDGE_NAPI_PROVIDER "imports" CACHE STRING "N-API provider: browser JS engine")

# ---- Emscripten-specific link flags ----
set(EMSCRIPTEN_LINK_FLAGS
    "-sALLOW_MEMORY_GROWTH=1"
    "-sMAXIMUM_MEMORY=4GB"
    "-sINITIAL_MEMORY=128MB"
    "-sSTACK_SIZE=8MB"
    "-sSHARED_MEMORY=1"
    "-pthread"
    "-sJSPI=1"
    "-sMODULARIZE=1"
    "-sEXPORT_NAME='EdgeJSModule'"
    "-sFILESYSTEM=1"
    "-sFORCE_FILESYSTEM=1"
    "-sALLOW_UNIMPLEMENTED_SYSCALLS=1"
    "-sERROR_ON_UNDEFINED_SYMBOLS=0"
)
string(JOIN " " CMAKE_EXE_LINKER_FLAGS_INIT ${EMSCRIPTEN_LINK_FLAGS})

# ---- Exported functions ----
# Core exports needed by the N-API browser bridge
set(EXPORTED_FUNCTIONS
    "_main"
    "_malloc"
    "_free"
    "_napi_module_register"
    "_edge_napi_init"
)

# ---- Definitions ----
# Tell EdgeJS we're in browser/Emscripten mode
add_definitions(
    -DEDGE_PLATFORM_EMSCRIPTEN=1
    -DEDGE_NAPI_PROVIDER_IMPORTS=1
    -D__EMSCRIPTEN__=1
    -DV8_JITLESS_MODE=1
)

# ---- Find paths ----
set(CMAKE_FIND_ROOT_PATH "${EMSCRIPTEN_ROOT}/cache/sysroot")
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
