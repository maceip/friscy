#!/bin/bash
# ============================================================================
# test_build.sh — Validate Emscripten/Wasm build output (Workstream B)
#
# Usage:
#   ./tests/test_build.sh                  # Validate existing dev build
#   ./tests/test_build.sh --build          # Build first, then validate
#   ./tests/test_build.sh --production     # Build + validate production
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="${PROJECT_DIR}/runtime/build"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

pass() { echo -e "  ${GREEN}PASS${NC}: $1"; ((PASS++)); }
fail() { echo -e "  ${RED}FAIL${NC}: $1"; ((FAIL++)); }
skip() { echo -e "  ${YELLOW}SKIP${NC}: $1"; ((SKIP++)); }
section() { echo -e "\n${CYAN}=== $1 ===${NC}"; }

# Parse args
DO_BUILD=false
PRODUCTION=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --build) DO_BUILD=true; shift ;;
        --production|-p) PRODUCTION=true; DO_BUILD=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo -e "${CYAN}friscy Build Validation (Workstream B)${NC}"
echo "Project: $PROJECT_DIR"

# ---- Step 1: Optionally build ----
if $DO_BUILD; then
    section "Building"
    if $PRODUCTION; then
        echo "  Building production..."
        "$PROJECT_DIR/tools/harness.sh" --production
    else
        echo "  Building development..."
        "$PROJECT_DIR/tools/harness.sh"
    fi
fi

# ---- Step 2: Check build artifacts exist ----
section "Build Artifacts"

if [[ -f "$BUILD_DIR/friscy.js" ]]; then
    JS_SIZE=$(stat -c%s "$BUILD_DIR/friscy.js" 2>/dev/null || stat -f%z "$BUILD_DIR/friscy.js" 2>/dev/null || echo 0)
    JS_SIZE_KB=$((JS_SIZE / 1024))

    if [[ $JS_SIZE -gt 512000 ]]; then
        pass "friscy.js exists (${JS_SIZE_KB}KB > 500KB)"
    else
        fail "friscy.js is undersized (${JS_SIZE_KB}KB, expected > 500KB)"
    fi
else
    fail "friscy.js not found at $BUILD_DIR/friscy.js"
fi

if $PRODUCTION; then
    # Production: wasm embedded in JS, no separate .wasm
    if [[ -f "$BUILD_DIR/friscy.js" ]]; then
        pass "Production build: single friscy.js (wasm embedded)"
    fi
else
    if [[ -f "$BUILD_DIR/friscy.wasm" ]]; then
        WASM_SIZE=$(stat -c%s "$BUILD_DIR/friscy.wasm" 2>/dev/null || stat -f%z "$BUILD_DIR/friscy.wasm" 2>/dev/null || echo 0)
        WASM_SIZE_KB=$((WASM_SIZE / 1024))

        if [[ $WASM_SIZE -gt 500000 ]]; then
            pass "friscy.wasm exists (${WASM_SIZE_KB}KB)"
        else
            fail "friscy.wasm is undersized (${WASM_SIZE_KB}KB)"
        fi
    else
        fail "friscy.wasm not found (dev build requires separate .wasm)"
    fi
fi

# ---- Step 3: Check JS module structure ----
section "JS Module Structure"

if [[ -f "$BUILD_DIR/friscy.js" ]]; then
    # Check ES6 module export
    if grep -q 'export default' "$BUILD_DIR/friscy.js" 2>/dev/null || \
       grep -q 'export{' "$BUILD_DIR/friscy.js" 2>/dev/null; then
        pass "ES6 module export found"
    else
        fail "No ES6 module export (expected MODULARIZE+EXPORT_ES6)"
    fi

    # Check exported runtime methods
    if grep -q 'callMain\|_main' "$BUILD_DIR/friscy.js" 2>/dev/null; then
        pass "callMain/_main export found"
    else
        fail "Missing callMain/_main in exports"
    fi

    # Check FS availability
    if grep -q "'FS'" "$BUILD_DIR/friscy.js" 2>/dev/null || \
       grep -q '"FS"' "$BUILD_DIR/friscy.js" 2>/dev/null; then
        pass "FS runtime method exported"
    else
        fail "Missing FS in EXPORTED_RUNTIME_METHODS"
    fi
fi

# ---- Step 4: Check CMakeLists.txt configuration ----
section "CMakeLists.txt Configuration"

CMAKE_FILE="$PROJECT_DIR/runtime/CMakeLists.txt"
if [[ -f "$CMAKE_FILE" ]]; then
    if grep -q '_friscy_export_tar' "$CMAKE_FILE"; then
        pass "_friscy_export_tar in EXPORTED_FUNCTIONS"
    else
        fail "Missing _friscy_export_tar in EXPORTED_FUNCTIONS"
    fi

    if grep -q 'RISCV_ENCOMPASSING_ARENA_BITS' "$CMAKE_FILE"; then
        ARENA_BITS=$(grep 'RISCV_ENCOMPASSING_ARENA_BITS' "$CMAKE_FILE" | grep -o '[0-9]*' | head -1)
        pass "Arena size: ${ARENA_BITS} bits"
    fi

    if grep -q 'RISCV_THREADED ON' "$CMAKE_FILE"; then
        pass "Threaded dispatch enabled"
    else
        fail "Threaded dispatch not enabled"
    fi
fi

# ---- Step 5: Node.js test (if available) ----
section "Node.js Validation"

if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    pass "Node.js available ($NODE_VERSION)"

    # Check that test_node.js has correct import path
    if grep -q '../runtime/build/friscy.js' "$SCRIPT_DIR/test_node.js" 2>/dev/null; then
        pass "test_node.js import path correct"
    else
        fail "test_node.js import path wrong (should be ../runtime/build/friscy.js)"
    fi
else
    skip "Node.js not installed"
fi

# ---- Step 6: harness.sh sanity check ----
section "Build Script (harness.sh)"

HARNESS="$PROJECT_DIR/tools/harness.sh"
if [[ -f "$HARNESS" ]]; then
    # Check Docker volume mount uses project root
    if grep -q 'PROJECT_DIR' "$HARNESS"; then
        pass "harness.sh mounts project root (PROJECT_DIR)"
    else
        fail "harness.sh may mount wrong directory (missing PROJECT_DIR)"
    fi

    if grep -q '\-w /src/runtime/build' "$HARNESS"; then
        pass "harness.sh workdir set to /src/runtime/build"
    else
        fail "harness.sh workdir incorrect"
    fi
else
    fail "harness.sh not found"
fi

# ---- Summary ----
section "Summary"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "  Passed: ${GREEN}${PASS}${NC}/${TOTAL}"
echo -e "  Failed: ${RED}${FAIL}${NC}/${TOTAL}"
echo -e "  Skipped: ${YELLOW}${SKIP}${NC}/${TOTAL}"

if [[ $FAIL -gt 0 ]]; then
    echo -e "\n${RED}BUILD VALIDATION FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}BUILD VALIDATION PASSED${NC}"
    exit 0
fi
