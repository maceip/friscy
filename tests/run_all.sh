#!/bin/bash
# ============================================================================
# run_all.sh — Run all friscy validation tests
#
# Usage:
#   ./tests/run_all.sh                         # Run what's possible
#   ./tests/run_all.sh --friscy <binary>       # With native friscy binary
#   ./tests/run_all.sh --rootfs <rootfs.tar>   # With rootfs for container tests
#   ./tests/run_all.sh --bundle <bundle-dir>   # Validate a bundle
#   ./tests/run_all.sh --all                   # Run everything
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Parse arguments
FRISCY_BIN=""
ROOTFS_TAR=""
BUNDLE_DIR=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --friscy) FRISCY_BIN="$2"; shift 2 ;;
        --rootfs) ROOTFS_TAR="$2"; shift 2 ;;
        --bundle) BUNDLE_DIR="$2"; shift 2 ;;
        --all) shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║     friscy Validation Test Suite      ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

SUITE_PASS=0
SUITE_FAIL=0
SUITE_SKIP=0

run_test() {
    local name="$1"
    local script="$2"
    shift 2

    echo -e "\n${BOLD}${CYAN}━━━ $name ━━━${NC}"

    if [[ ! -f "$script" ]]; then
        echo -e "  ${RED}SKIP${NC}: Script not found: $script"
        ((SUITE_SKIP++))
        return
    fi

    if bash "$script" "$@" 2>&1; then
        echo -e "  ${GREEN}SUITE: $name PASSED${NC}"
        ((SUITE_PASS++))
    else
        echo -e "  ${RED}SUITE: $name FAILED${NC}"
        ((SUITE_FAIL++))
    fi
}

# ---- Test 1: Build Validation (Workstream B) ----
run_test "Build Validation (Workstream B)" \
    "$SCRIPT_DIR/test_build.sh"

# ---- Test 2: AOT Compiler (Workstream C) ----
run_test "AOT Compiler (Workstream C)" \
    "$SCRIPT_DIR/test_rv2wasm.sh"

# ---- Test 3: Runtime Validation (Workstream A + D + E + F) ----
if [[ -n "$FRISCY_BIN" ]]; then
    if [[ -n "$ROOTFS_TAR" ]]; then
        run_test "Runtime Validation (Workstream A + D + E + F)" \
            "$SCRIPT_DIR/test_runtime.sh" "$FRISCY_BIN" "$ROOTFS_TAR"
    else
        run_test "Runtime Validation (Workstream A)" \
            "$SCRIPT_DIR/test_runtime.sh" "$FRISCY_BIN"
    fi
else
    echo -e "\n${BOLD}${CYAN}━━━ Runtime Validation ━━━${NC}"
    echo -e "  ${YELLOW}SKIP${NC}: No --friscy binary provided"
    ((SUITE_SKIP++))
fi

# ---- Test 4: Bundle Validation (Workstream B + F) ----
if [[ -n "$BUNDLE_DIR" ]]; then
    run_test "Bundle Validation (Workstream B + F)" \
        "$SCRIPT_DIR/test_bundle.sh" "$BUNDLE_DIR"
else
    echo -e "\n${BOLD}${CYAN}━━━ Bundle Validation ━━━${NC}"
    echo -e "  ${YELLOW}SKIP${NC}: No --bundle directory provided"
    ((SUITE_SKIP++))
fi

# ---- Final Summary ----
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════${NC}"
echo -e "${BOLD}  Test Suite Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
TOTAL=$((SUITE_PASS + SUITE_FAIL + SUITE_SKIP))
echo -e "  Suites Passed:  ${GREEN}${SUITE_PASS}${NC}/${TOTAL}"
echo -e "  Suites Failed:  ${RED}${SUITE_FAIL}${NC}/${TOTAL}"
echo -e "  Suites Skipped: ${YELLOW}${SUITE_SKIP}${NC}/${TOTAL}"

if [[ $SUITE_FAIL -gt 0 ]]; then
    echo -e "\n${RED}${BOLD}OVERALL: FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}${BOLD}OVERALL: PASSED${NC}"
    exit 0
fi
