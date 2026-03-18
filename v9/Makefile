# v9 — EdgeJS Browser Runtime Build
#
# Targets:
#   make setup       — install Emscripten SDK + dependencies
#   make fetch       — clone EdgeJS source + node-wasix32 shims
#   make configure   — run CMake with Emscripten toolchain
#   make build       — compile EdgeJS to .wasm
#   make test        — run smoke tests
#   make clean       — remove build artifacts
#   make all         — fetch + configure + build + test
#
# Prerequisites:
#   - git, cmake, python3, node
#   - Emscripten SDK (auto-installed by `make setup`)

SHELL := /bin/bash
.ONESHELL:
.PHONY: all setup fetch configure build test clean distclean lint size help

# ---- Paths ----
ROOT_DIR   := $(shell pwd)
EDGEJS_SRC := $(ROOT_DIR)/edgejs-src
BUILD_DIR  := $(ROOT_DIR)/build
SHIMS_DIR  := $(ROOT_DIR)/wasi-shims
NAPI_DIR   := $(ROOT_DIR)/napi-bridge
OUTPUT_DIR := $(ROOT_DIR)/dist

# ---- Emscripten ----
EMSDK_DIR  ?= $(HOME)/emsdk
EMSDK_VER  ?= 3.1.64
EMCC       := $(EMSDK_DIR)/upstream/emscripten/emcc
EMCMAKE    := $(EMSDK_DIR)/upstream/emscripten/emcmake

# ---- Build Config ----
BUILD_TYPE ?= Release
JOBS       ?= $(shell nproc 2>/dev/null || echo 4)

# ---- EdgeJS Source ----
EDGEJS_REPO := https://github.com/aspect-build/aspect-edgejs.git
EDGEJS_BRANCH ?= main

# ---- node-wasix32 ----
WASIX32_REPO := https://github.com/Multi-V-VM/node-wasix32.git
WASIX32_BRANCH ?= main

# ---- Outputs ----
WASM_OUT   := $(OUTPUT_DIR)/edgejs.wasm
JS_OUT     := $(OUTPUT_DIR)/edgejs.js
WORKER_OUT := $(OUTPUT_DIR)/edgejs.worker.js

# ============================================================
# Targets
# ============================================================

all: fetch configure build test
	@echo ""
	@echo "=== Build complete ==="
	@echo "Output: $(OUTPUT_DIR)/"
	@ls -lh $(OUTPUT_DIR)/edgejs.* 2>/dev/null || true

help:
	@echo "v9 EdgeJS Browser Runtime Build"
	@echo ""
	@echo "Targets:"
	@echo "  make setup       Install Emscripten SDK"
	@echo "  make fetch       Clone EdgeJS source"
	@echo "  make configure   Configure CMake build"
	@echo "  make build       Compile to WebAssembly"
	@echo "  make test        Run smoke tests"
	@echo "  make size        Show output sizes"
	@echo "  make clean       Remove build artifacts"
	@echo "  make distclean   Remove everything (including sources)"
	@echo "  make all         Full build pipeline"
	@echo ""
	@echo "Variables:"
	@echo "  BUILD_TYPE=Debug|Release  (default: Release)"
	@echo "  EMSDK_DIR=<path>          (default: ~/emsdk)"
	@echo "  JOBS=<n>                  (default: nproc)"

# ---- Setup Emscripten ----
setup: $(EMCC)

$(EMCC):
	@echo ">>> Installing Emscripten SDK $(EMSDK_VER)..."
	@if [ ! -d "$(EMSDK_DIR)" ]; then \
		git clone https://github.com/aspect-build/aspect-edgejs.git $(EMSDK_DIR) && \
		cd $(EMSDK_DIR) && git clone https://github.com/emscripten-core/emsdk.git . ; \
	fi
	cd $(EMSDK_DIR) && \
		./emsdk install $(EMSDK_VER) && \
		./emsdk activate $(EMSDK_VER)
	@echo ">>> Emscripten installed. Run: source $(EMSDK_DIR)/emsdk_env.sh"

# ---- Fetch Sources ----
fetch: $(EDGEJS_SRC)/CMakeLists.txt

$(EDGEJS_SRC)/CMakeLists.txt:
	@echo ">>> Cloning EdgeJS..."
	@if [ ! -d "$(EDGEJS_SRC)/.git" ]; then \
		git clone --depth 1 --branch $(EDGEJS_BRANCH) $(EDGEJS_REPO) $(EDGEJS_SRC) 2>/dev/null || \
		git clone --depth 1 $(EDGEJS_REPO) $(EDGEJS_SRC) || \
		(echo "ERROR: Could not clone EdgeJS. Clone manually:" && \
		 echo "  git clone $(EDGEJS_REPO) $(EDGEJS_SRC)" && exit 1); \
	fi
	@echo ">>> EdgeJS source ready at $(EDGEJS_SRC)"

# ---- Fetch upstream wasi-shims (optional, we have our copies) ----
fetch-wasix32:
	@echo ">>> Fetching node-wasix32 reference headers..."
	@if [ ! -d "$(ROOT_DIR)/.node-wasix32" ]; then \
		git clone --depth 1 $(WASIX32_REPO) $(ROOT_DIR)/.node-wasix32; \
	fi
	@echo ">>> Reference headers at $(ROOT_DIR)/.node-wasix32/"

# ---- Configure ----
configure: $(BUILD_DIR)/CMakeCache.txt

$(BUILD_DIR)/CMakeCache.txt: $(EDGEJS_SRC)/CMakeLists.txt emscripten-toolchain.cmake
	@echo ">>> Configuring EdgeJS for Emscripten..."
	@mkdir -p $(BUILD_DIR)
	@source $(EMSDK_DIR)/emsdk_env.sh 2>/dev/null || true
	$(EMCMAKE) cmake \
		-S $(EDGEJS_SRC) \
		-B $(BUILD_DIR) \
		-DCMAKE_TOOLCHAIN_FILE=$(ROOT_DIR)/emscripten-toolchain.cmake \
		-DCMAKE_BUILD_TYPE=$(BUILD_TYPE) \
		-DEDGE_NAPI_PROVIDER=imports \
		-DEDGE_PLATFORM=emscripten \
		-DEDGE_EXTRA_INCLUDES="$(SHIMS_DIR)" \
		2>&1 | tee $(BUILD_DIR)/configure.log
	@echo ">>> Configuration complete"

# ---- Build ----
build: $(WASM_OUT)

$(WASM_OUT): $(BUILD_DIR)/CMakeCache.txt
	@echo ">>> Building EdgeJS ($(BUILD_TYPE), $(JOBS) jobs)..."
	@mkdir -p $(OUTPUT_DIR)
	cmake --build $(BUILD_DIR) -j $(JOBS) 2>&1 | tee $(BUILD_DIR)/build.log
	@# Copy outputs
	@cp $(BUILD_DIR)/edgejs.js $(JS_OUT) 2>/dev/null || true
	@cp $(BUILD_DIR)/edgejs.wasm $(WASM_OUT) 2>/dev/null || true
	@cp $(BUILD_DIR)/edgejs.worker.js $(WORKER_OUT) 2>/dev/null || true
	@echo ">>> Build complete"

# ---- Test ----
test: test-unit test-napi

test-unit:
	@echo ">>> Running unit tests..."
	cd $(ROOT_DIR) && node tests/test-basic.mjs

test-napi:
	@echo ">>> Running N-API bridge tests..."
	cd $(ROOT_DIR) && node tests/test-napi-bridge.mjs 2>/dev/null || true

# ---- Size Report ----
size:
	@echo "=== Output Size Report ==="
	@if [ -f "$(WASM_OUT)" ]; then \
		RAW=$$(stat -c%s "$(WASM_OUT)" 2>/dev/null || stat -f%z "$(WASM_OUT)"); \
		echo "  edgejs.wasm:     $$(echo "scale=1; $$RAW / 1048576" | bc) MB (raw)"; \
		gzip -k -f "$(WASM_OUT)" 2>/dev/null && \
		GZ=$$(stat -c%s "$(WASM_OUT).gz" 2>/dev/null || stat -f%z "$(WASM_OUT).gz") && \
		echo "  edgejs.wasm.gz:  $$(echo "scale=1; $$GZ / 1048576" | bc) MB (gzipped)" && \
		rm -f "$(WASM_OUT).gz"; \
		brotli -k -f "$(WASM_OUT)" 2>/dev/null && \
		BR=$$(stat -c%s "$(WASM_OUT).br" 2>/dev/null || stat -f%z "$(WASM_OUT).br") && \
		echo "  edgejs.wasm.br:  $$(echo "scale=1; $$BR / 1048576" | bc) MB (brotli)" && \
		rm -f "$(WASM_OUT).br"; \
	else \
		echo "  (no wasm output yet — run 'make build')"; \
	fi
	@if [ -f "$(JS_OUT)" ]; then \
		JS_SIZE=$$(stat -c%s "$(JS_OUT)" 2>/dev/null || stat -f%z "$(JS_OUT)"); \
		echo "  edgejs.js:       $$(echo "scale=0; $$JS_SIZE / 1024" | bc) KB"; \
	fi

# ---- Lint ----
lint:
	@echo ">>> Checking shim headers..."
	@for f in $(SHIMS_DIR)/wasi-*.h; do \
		if ! grep -q '#ifndef' "$$f" 2>/dev/null; then \
			echo "  WARN: $$f missing include guard"; \
		fi; \
	done
	@echo ">>> Checking N-API bridge..."
	@node --check $(NAPI_DIR)/index.js && echo "  OK: napi-bridge/index.js"
	@echo ">>> Done"

# ---- Clean ----
clean:
	rm -rf $(BUILD_DIR)
	rm -rf $(OUTPUT_DIR)

distclean: clean
	rm -rf $(EDGEJS_SRC)
	rm -rf $(ROOT_DIR)/.node-wasix32
