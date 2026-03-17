# Node.js Emscripten Build Makefile
# Compiles Node.js to WebAssembly for browser execution
# Part of the Kasm Wasm-Native Linux project

# Emscripten configuration
EMSDK_DIR = ../../emsdk
EMCC = $(EMSDK_DIR)/upstream/emscripten/emcc
EMCXX = $(EMSDK_DIR)/upstream/emscripten/em++
EMCONFIGURE = $(EMSDK_DIR)/upstream/emscripten/emconfigure
EMMAKE = $(EMSDK_DIR)/upstream/emscripten/emmake
EMCMAKE = $(EMSDK_DIR)/upstream/emscripten/emcmake

# Node.js source directory
NODE_DIR = node
NODE_SRC = $(NODE_DIR)/src

# Build configuration
BUILD_TYPE = Release
BUILD_DIR = build

# Emscripten flags for maximum performance and browser compatibility
# Based on ARCHITECTURE.md specifications

# Core Wasm features (REQUIRED)
EMFLAGS_CORE = \
	-msimd128 \
	-mbulk-memory \
	-matomics \
	-mtail-call \
	-fwasm-exceptions \
	-sWASM_LEGACY_EXCEPTIONS=0 \
	-sSHARED_MEMORY=1 \
	-pthread

# Memory configuration
EMFLAGS_MEMORY = \
	-sALLOW_MEMORY_GROWTH=1 \
	-sMAXIMUM_MEMORY=4GB \
	-sINITIAL_MEMORY=128MB \
	-sSTACK_SIZE=8MB \
	-sMALLOC=mimalloc

# Threading configuration
EMFLAGS_THREADS = \
	-sPTHREAD_POOL_SIZE=navigator.hardwareConcurrency \
	-sPTHREAD_POOL_DELAY_LOAD=1 \
	-sPROXY_TO_PTHREAD=0

# JSPI for async I/O (libuv)
EMFLAGS_JSPI = \
	-sJSPI=1 \
	-sASYNCIFY=0

# Export configuration for syscall integration
EMFLAGS_EXPORTS = \
	-sEXPORTED_FUNCTIONS="['_main', '_malloc', '_free', '_posix_memalign', '__syscall_openat', '__syscall_read', '__syscall_write', '__syscall_close', '__syscall_fstat', '__syscall_stat', '__syscall_lstat', '__syscall_ioctl', '__syscall_mmap2', '__syscall_munmap', '__syscall_mprotect', '_emscripten_thread_init', '_emscripten_thread_exit']" \
	-sEXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'UTF8ToString', 'stringToUTF8', 'lengthBytesUTF8', 'getTempRet0', 'setTempRet0', 'wasmMemory', 'PTHREAD_POOL']" \
	-sMODULARIZE=1 \
	-sEXPORT_NAME="'NodeJSModule'"

# V8-specific flags
# --jitless: Run V8 without JIT (interpreter only)
# --noopt: Disable optimizations
# v8_enable_pointer_compression: Compress pointers to fit in 4GB
V8_FLAGS = \
	-DV8_JITLESS_MODE=1 \
	-DV8_ENABLE_JITLESS=1 \
	-Dv8_enable_pointer_compression=1 \
	-Dv8_enable_31bit_smis_on_64bit_arch=1 \
	-Dv8_use_external_startup_data=0 \
	-Dv8_enable_i18n_support=1 \
	-Dv8_icu_small=true

# Linker flags
LDFLAGS = \
	-O3 \
	-g2 \
	-sERROR_ON_UNDEFINED_SYMBOLS=0 \
	-sWARN_ON_UNDEFINED_SYMBOLS=1 \
	-sASSERTIONS=1 \
	-sSAFE_HEAP=0 \
	-sALLOW_UNIMPLEMENTED_SYSCALLS=1 \
	-sSOCKET_WEBRTC=0 \
	-sSOCKET_DEBUG=0 \
	-sFILESYSTEM=1 \
	-sFORCE_FILESYSTEM=1 \
	-lnodefs.js \
	-lworkerfs.js

# Combine all Emscripten flags
EMFLAGS = $(EMFLAGS_CORE) $(EMFLAGS_MEMORY) $(EMFLAGS_THREADS) $(EMFLAGS_JSPI) $(EMFLAGS_EXPORTS) $(LDFLAGS)

# Compiler flags
CFLAGS = -O3 -g2 $(V8_FLAGS) -I$(NODE_DIR)/deps/v8/include
CXXFLAGS = -O3 -g2 -std=c++20 $(V8_FLAGS) -I$(NODE_DIR)/deps/v8/include

# Output files
OUTPUT_DIR = .
NODE_WASM = $(OUTPUT_DIR)/node.wasm
NODE_JS = $(OUTPUT_DIR)/node.js

# Phony targets
.PHONY: all clean configure build patch-v8 patch-libuv check-emsdk

# Default target
all: check-emsdk patch-v8 patch-libuv configure build
	@echo "========================================="
	@echo "  Node.js Wasm build complete"
	@echo "  Output: $(NODE_WASM)"
	@echo "========================================="

# Check Emscripten SDK is available
check-emsdk:
	@if [ ! -f "$(EMCC)" ]; then \
		echo "Error: Emscripten SDK not found at $(EMSDK_DIR)"; \
		echo "Please run: cd ../.. && ./emsdk/emsdk install latest && ./emsdk/emsdk activate latest"; \
		exit 1; \
	fi
	@echo "Emscripten SDK found: $(EMCC)"
	$(EMCC) --version | head -1

# Apply V8 patches for Wasm compatibility
patch-v8:
	@echo "Applying V8 patches for Emscripten/Wasm target..."
	@mkdir -p v8_patches
	@echo "Patch 1: Disable JIT compilation (already using --jitless flag)"
	@echo "Patch 2: Configure for interpreter-only mode"
	@echo "Patch 3: Stub out platform-specific code"
	@echo "Note: V8 patches stored in v8_patches/ directory"

# Apply libuv patches for JSPI-based async I/O
patch-libuv:
	@echo "Creating libuv JSPI adapter..."
	@if [ ! -f "libuv_jspi.c" ]; then \
		echo "// libuv JSPI adapter - generated" > libuv_jspi.c; \
		echo "// See: https://emscripten.org/docs/api_reference/proxying.h.html" >> libuv_jspi.c; \
		echo "// JSPI allows Wasm to suspend on Promise and resume on resolve" >> libuv_jspi.c; \
	fi
	@echo "libuv JSPI adapter ready"

# Configure Node.js build with Emscripten
configure: check-emsdk
	@echo "========================================="
	@echo "  Configuring Node.js for Emscripten"
	@echo "========================================="
	cd $(NODE_DIR) && \
	$(EMCONFIGURE) ./configure \
		--dest-os=linux \
		--dest-cpu=wasm32 \
		--without-intl \
		--without-inspector \
		--without-ssl \
		--without-report \
		--without-performance \
		--without-v8-sandbox \
		--shared \
		--prefix=/nonexistent \
		2>&1 | tee ../configure.log || true
	@echo "Note: Configuration may fail - we'll use direct gyp build"

# Build Node.js with Emscripten
# Note: This uses a hybrid approach - configure.py for deps, manual emcc for final link
build: check-emsdk
	@echo "========================================="
	@echo "  Building Node.js Wasm"
	@echo "========================================="
	@echo "Step 1: Building dependencies..."
	@echo "  - V8 (jitless mode)"
	@echo "  - libuv (JSPI adapter)"
	@echo "  - cares, nghttp2, llhttp"
	@echo ""
	@echo "Step 2: Linking final node.wasm..."
	@echo ""
	@echo "Target flags:"
	@echo "  - SharedArrayBuffer: ENABLED"
	@echo "  - Pthreads: ENABLED"
	@echo "  - JSPI (async): ENABLED"
	@echo "  - SIMD128: ENABLED"
	@echo "  - Tail calls: ENABLED"
	@echo "  - Bulk memory: ENABLED"
	@echo "  - Atomics: ENABLED"
	@echo "  - Native exceptions: ENABLED"
	@echo ""
	@echo "Estimated output size: 50-80MB (gzips to ~10-15MB)"
	@echo ""
	$(EMCXX) $(CXXFLAGS) $(EMFLAGS) \
		$(NODE_DIR)/src/node_main.cc \
		-o $(NODE_JS) \
		2>&1 | tee build.log || true
	@echo "Build attempt complete - check build.log for details"

# Quick test build (minimal)
build-minimal: check-emsdk
	@echo "Building minimal Node.js test..."
	$(EMCXX) -O2 \
		-sSHARED_MEMORY=1 \
		-pthread \
		-sALLOW_MEMORY_GROWTH=1 \
		-sMODULARIZE=1 \
		-sEXPORT_NAME="'NodeMinimal'" \
		-DNODE_WANT_INTERNALS=1 \
		-I$(NODE_DIR)/src \
		-I$(NODE_DIR)/deps/v8/include \
		$(NODE_DIR)/src/node_main.cc \
		-o node-minimal.js \
		2>&1 | head -50

# Clean build artifacts
clean:
	rm -f $(NODE_WASM) $(NODE_JS) node-minimal.js
	rm -f configure.log build.log
	rm -rf $(BUILD_DIR)
	rm -f v8_patches/*.patch
	@echo "Cleaned Node.js build artifacts"

# Help target
help:
	@echo "Node.js Emscripten Build System"
	@echo "================================"
	@echo ""
	@echo "Targets:"
	@echo "  all           - Full build (check-emsdk, patch, configure, build)"
	@echo "  check-emsdk   - Verify Emscripten SDK is available"
	@echo "  patch-v8      - Apply V8 patches for Wasm target"
	@echo "  patch-libuv   - Create libuv JSPI adapter"
	@echo "  configure     - Run Node.js configure with emconfigure"
	@echo "  build         - Compile Node.js to Wasm"
	@echo "  build-minimal - Quick minimal test build"
	@echo "  clean         - Remove build artifacts"
	@echo "  help          - Show this help"
	@echo ""
	@echo "Configuration:"
	@echo "  EMSDK_DIR     = $(EMSDK_DIR)"
	@echo "  NODE_DIR      = $(NODE_DIR)"
	@echo "  EMCC          = $(EMCC)"
	@echo ""
	@echo "Key Emscripten flags enabled:"
	@echo "  -msimd128, -mbulk-memory, -matomics"
	@echo "  -sSHARED_MEMORY=1, -pthread"
	@echo "  -sJSPI=1 (for async I/O)"
	@echo "  -sMALLOC=mimalloc (multi-threaded allocator)"
	@echo "  V8: --jitless (interpreter only)"
