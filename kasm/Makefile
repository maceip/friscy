# Kasm Top-Level Makefile

# EMSDK paths
EMCC = emcc
AR = emar
NODE = $(shell which node)

# Kasm source directories
KERNEL_DIR = kernel
LKL_DIR = $(KERNEL_DIR)/lkl
BACKENDS_DIR = $(KERNEL_DIR)/backends
LKL_LIB_DIR = $(LKL_DIR)/tools/lkl/lib

# Compiler Flags
CFLAGS = -O3 -g -Wall -fvisibility=default \
	-sWASM_LEGACY_EXCEPTIONS=0 -sSHARED_MEMORY=1 \
	-mbulk-memory -matomics -msimd128 -pthread

LDFLAGS = -O3 -g -sWASM_LEGACY_EXCEPTIONS=0 -sSHARED_MEMORY=1 \
	-sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB \
	-sALLOW_TABLE_GROWTH=1 -sINITIAL_TABLE=65536 \
	-sMODULARIZE=1 -sEXPORTED_FUNCTIONS="['_main', '_malloc', '_free', '_kasm_set_console_ring', '_kasm_syscall']" \
	-sEXPORTED_RUNTIME_METHODS="['wasmMemory', 'wasmTable', 'ccall', 'cwrap']" \
	-Wl,--shared-memory -pthread -Wl,--allow-multiple-definition -sERROR_ON_UNDEFINED_SYMBOLS=0

KERNEL_LDFLAGS = $(LDFLAGS) -sEMULATE_FUNCTION_POINTER_CASTS=1

# Targets
.PHONY: all clean kernel mmap-shim test test-c test-js

all: kernel mmap-shim

LLVM_NM = emsdk/upstream/bin/llvm-nm

# Generate initcall tables from vmlinux.o (replaces vmlinux.lds)
kernel/initcalls_gen.c: kernel/lkl/vmlinux.o kernel/extract_initcalls.py
	@echo "Extracting initcalls from vmlinux.o..."
	python3 kernel/extract_initcalls.py $(LLVM_NM) kernel/lkl/vmlinux.o kernel/initcalls_gen.c

LKL_LIB_SRCS = $(LKL_LIB_DIR)/fs.c $(LKL_LIB_DIR)/utils.c

kernel: kernel/initcalls_gen.c
	@echo "Building kernel..."
	$(EMCC) $(CFLAGS) $(KERNEL_LDFLAGS) \
		-Ikernel \
		-Ikernel/lkl/tools/lkl/include \
		-Ikernel/lkl/usr/include \
		kernel/main.c \
		kernel/initcalls_gen.c \
		kernel/syscall_dispatch.c \
		kernel/backends/block.c \
		kernel/backends/net.c \
		kernel/backends/random.c \
		kernel/backends/host_ops.c \
		kernel/lkl/vmlinux.o \
		-o kernel.js

MMAP_SRCS = mmap-shim/mmap.c mmap-shim/vma.c mmap-shim/arena.c mmap-shim/rb_tree.c

mmap-shim:
	@echo "Building mmap shim..."
	$(EMCC) $(CFLAGS) $(LDFLAGS) -Wl,--no-entry \
		-sMODULARIZE=1 \
		-sEXPORTED_FUNCTIONS="['_mmap_init','_wasm_mmap','_wasm_munmap','_wasm_mremap','_wasm_mprotect','_arena_stats','_malloc','_free','_memalign']" \
		-sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8']" \
		$(MMAP_SRCS) -o mmap-shim/mmap.js

# --- C Unit Tests (compiled to Wasm, run via Node) ---

test-vma: $(MMAP_SRCS) mmap-shim/tests/test_vma.c
	@echo "Building VMA tests..."
	$(EMCC) $(CFLAGS) $(LDFLAGS) \
		mmap-shim/tests/test_vma.c mmap-shim/vma.c mmap-shim/rb_tree.c \
		-o mmap-shim/tests/test_vma.js
	$(NODE) mmap-shim/tests/test_vma.js

test-arena: $(MMAP_SRCS) mmap-shim/tests/test_arena.c
	@echo "Building Arena tests..."
	$(EMCC) $(CFLAGS) $(LDFLAGS) \
		mmap-shim/tests/test_arena.c mmap-shim/arena.c mmap-shim/rb_tree.c \
		-o mmap-shim/tests/test_arena.js
	$(NODE) mmap-shim/tests/test_arena.js

test-mmap-c: $(MMAP_SRCS) mmap-shim/tests/test_mmap.c
	@echo "Building mmap C integration tests..."
	$(EMCC) $(CFLAGS) $(LDFLAGS) \
		mmap-shim/tests/test_mmap.c $(MMAP_SRCS) \
		-o mmap-shim/tests/test_mmap.js
	$(NODE) mmap-shim/tests/test_mmap.js

# --- JS Integration Tests ---

test-js: mmap-shim
	@echo "Running JS integration tests..."
	$(NODE) tests/run_tests.js

# --- Run All Tests ---

test-c: test-vma test-arena test-mmap-c

test: test-c test-js
	@echo ""
	@echo "========================================="
	@echo "  All tests passed (C + JS)"
	@echo "========================================="

clean:
	rm -rf build/
	rm -f mmap-shim/*.wasm mmap-shim/*.o
	rm -f mmap-shim/tests/*.js mmap-shim/tests/*.wasm
	rm -f kernel/initcalls_gen.c kernel/initcalls.defsym kernel.js kernel.wasm
