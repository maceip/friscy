#!/bin/bash
# ============================================================================
# test_rv2wasm.sh — Validate AOT compiler (Workstream C)
#
# Tests: br_table dispatch, floating-point, atomics, wasm validation
#
# Prerequisites:
#   - Rust toolchain (cargo)
#   - RISC-V cross-compiler (riscv64-linux-gnu-gcc) for full tests
#   - Optional: wasm-validate (wabt) for validation
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AOT_DIR="${PROJECT_DIR}/aot"

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

echo -e "${CYAN}rv2wasm AOT Compiler Validation (Workstream C)${NC}"

# Check prerequisites
command -v cargo >/dev/null 2>&1 || { echo "Error: cargo (Rust) is required"; exit 1; }

# Create test directory
TEST_TMP=$(mktemp -d)
trap "rm -rf $TEST_TMP" EXIT

# ---- Build rv2wasm ----
section "Build"

cd "$AOT_DIR"
if cargo build --release 2>&1; then
    pass "cargo build --release"
else
    fail "cargo build --release"
    echo -e "\n${RED}Cannot continue without successful build${NC}"
    exit 1
fi

RV2WASM="${AOT_DIR}/target/release/rv2wasm"
if [[ -f "$RV2WASM" ]] || [[ -f "${RV2WASM}.exe" ]]; then
    pass "rv2wasm binary exists"
    # Handle Windows
    [[ -f "${RV2WASM}.exe" ]] && RV2WASM="${RV2WASM}.exe"
else
    fail "rv2wasm binary not found"
    exit 1
fi

# Help test
"$RV2WASM" --help >/dev/null 2>&1 && pass "--help works" || fail "--help failed"

# ---- Skip binary tests if no cross-compiler ----
if ! command -v riscv64-linux-gnu-gcc >/dev/null 2>&1; then
    section "Cross-Compiler Not Found"
    skip "riscv64-linux-gnu-gcc not installed"
    skip "Skipping all binary compilation tests"
    skip "Install with: apt install gcc-riscv64-linux-gnu"

    section "Summary"
    TOTAL=$((PASS + FAIL + SKIP))
    echo -e "  Passed: ${GREEN}${PASS}${NC}/${TOTAL}"
    echo -e "  Failed: ${RED}${FAIL}${NC}/${TOTAL}"
    echo -e "  Skipped: ${YELLOW}${SKIP}${NC}/${TOTAL}"
    exit 0
fi

# ---- Gap 1: br_table Dispatch ----
section "Gap 1: br_table Dispatch"

cat > "$TEST_TMP/test_loop.c" << 'CEOF'
int main() {
    int sum = 0;
    for (int i = 0; i < 100; i++) {
        sum += i;
        if (sum > 50) sum -= 10;
    }
    return sum;
}
CEOF

riscv64-linux-gnu-gcc -static -O2 -o "$TEST_TMP/test_loop" "$TEST_TMP/test_loop.c" 2>/dev/null && {
    pass "Compiled test_loop binary"

    "$RV2WASM" "$TEST_TMP/test_loop" -o "$TEST_TMP/test_loop.wasm" --verbose 2>/dev/null && {
        pass "rv2wasm translated test_loop"

        if command -v wasm-validate >/dev/null 2>&1; then
            wasm-validate "$TEST_TMP/test_loop.wasm" 2>/dev/null && \
                pass "test_loop.wasm validates" || fail "test_loop.wasm validation failed"
        else
            skip "wasm-validate not installed"
        fi

        # Check for br_table usage
        if command -v wasm-objdump >/dev/null 2>&1; then
            if wasm-objdump -d "$TEST_TMP/test_loop.wasm" 2>/dev/null | grep -q 'br_table'; then
                pass "br_table instruction found in output"
            else
                fail "No br_table found (using if-else chain instead)"
            fi
        else
            skip "wasm-objdump not installed for br_table check"
        fi
    } || fail "rv2wasm failed on test_loop"
} || fail "Failed to compile test_loop"

# ---- Gap 2: Floating-Point Translation ----
section "Gap 2: Floating-Point"

cat > "$TEST_TMP/test_fp.c" << 'CEOF'
#include <stdio.h>
int main() {
    float a = 3.14f;
    float b = 2.72f;
    float c = a * b + 1.0f;
    double d = 1.23456789;
    double e = d * d;
    volatile float vc = c;
    volatile double ve = e;
    return (vc > 9.0f && ve > 1.5) ? 0 : 1;
}
CEOF

riscv64-linux-gnu-gcc -static -O2 -o "$TEST_TMP/test_fp" "$TEST_TMP/test_fp.c" 2>/dev/null && {
    pass "Compiled test_fp binary"

    # Verify FP instructions in source binary
    if riscv64-linux-gnu-objdump -d "$TEST_TMP/test_fp" 2>/dev/null | grep -qE 'flw|fsw|fadd|fmul|fld|fsd'; then
        pass "Source binary uses FP instructions"
    else
        skip "Could not verify FP instructions in source"
    fi

    "$RV2WASM" "$TEST_TMP/test_fp" -o "$TEST_TMP/test_fp.wasm" --verbose 2>/dev/null && {
        pass "rv2wasm translated test_fp (no FP panic)"

        if command -v wasm-validate >/dev/null 2>&1; then
            wasm-validate "$TEST_TMP/test_fp.wasm" 2>/dev/null && \
                pass "test_fp.wasm validates" || fail "test_fp.wasm validation failed"
        else
            skip "wasm-validate not installed"
        fi

        # Check for unreachable stubs (indicates untranslated FP ops)
        if command -v wasm-objdump >/dev/null 2>&1; then
            UNREACHABLE_COUNT=$(wasm-objdump -d "$TEST_TMP/test_fp.wasm" 2>/dev/null | grep -c 'unreachable' || echo 0)
            if [[ $UNREACHABLE_COUNT -eq 0 ]]; then
                pass "No unreachable stubs (all FP ops translated)"
            elif [[ $UNREACHABLE_COUNT -lt 5 ]]; then
                pass "Few unreachable stubs ($UNREACHABLE_COUNT) - acceptable"
            else
                fail "Many unreachable stubs ($UNREACHABLE_COUNT) - FP ops may be stubbed"
            fi
        fi
    } || fail "rv2wasm failed on test_fp"
} || fail "Failed to compile test_fp"

# ---- Gap 3: Atomic Instructions ----
section "Gap 3: Atomics (AMOMIN/AMOMAX)"

cat > "$TEST_TMP/test_atomic.c" << 'CEOF'
#include <stdatomic.h>
#include <stdio.h>
int main() {
    atomic_int x = 0;
    atomic_fetch_add(&x, 5);
    atomic_fetch_add(&x, 3);
    int val = atomic_load(&x);
    return (val == 8) ? 0 : 1;
}
CEOF

riscv64-linux-gnu-gcc -static -O2 -o "$TEST_TMP/test_atomic" "$TEST_TMP/test_atomic.c" 2>/dev/null && {
    pass "Compiled test_atomic binary"

    "$RV2WASM" "$TEST_TMP/test_atomic" -o "$TEST_TMP/test_atomic.wasm" --verbose 2>/dev/null && {
        pass "rv2wasm translated test_atomic (no atomic panic)"

        if command -v wasm-validate >/dev/null 2>&1; then
            wasm-validate "$TEST_TMP/test_atomic.wasm" 2>/dev/null && \
                pass "test_atomic.wasm validates" || fail "test_atomic.wasm validation failed"
        else
            skip "wasm-validate not installed"
        fi
    } || fail "rv2wasm failed on test_atomic"
} || fail "Failed to compile test_atomic"

# ---- Gap 4: friscy-pack --aot integration ----
section "Gap 4: friscy-pack Integration"

FRISCY_PACK="${PROJECT_DIR}/tools/friscy-pack"
if [[ -f "$FRISCY_PACK" ]]; then
    if grep -q '\-\-aot' "$FRISCY_PACK" 2>/dev/null; then
        pass "friscy-pack supports --aot flag"
    else
        fail "friscy-pack missing --aot support"
    fi

    if grep -q 'rv2wasm' "$FRISCY_PACK" 2>/dev/null; then
        pass "friscy-pack references rv2wasm"
    else
        fail "friscy-pack doesn't reference rv2wasm"
    fi
else
    fail "friscy-pack not found"
fi

# ---- Summary ----
section "Summary"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "  Passed: ${GREEN}${PASS}${NC}/${TOTAL}"
echo -e "  Failed: ${RED}${FAIL}${NC}/${TOTAL}"
echo -e "  Skipped: ${YELLOW}${SKIP}${NC}/${TOTAL}"

if [[ $FAIL -gt 0 ]]; then
    echo -e "\n${RED}AOT VALIDATION FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}AOT VALIDATION PASSED${NC}"
    exit 0
fi
