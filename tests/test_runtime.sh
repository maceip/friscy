#!/bin/bash
# ============================================================================
# test_runtime.sh — Validate friscy runtime (Workstream A + D + E + F)
#
# Runs against a native build of friscy. Requires:
#   - Native friscy binary (from setup_native_harness.sh or Docker)
#   - Alpine rootfs tar (from friscy-pack or container_to_riscv.sh)
#   - Optional: riscv64-linux-gnu-gcc for static test binary
#
# Usage:
#   ./tests/test_runtime.sh <friscy-binary> <rootfs.tar>
#   ./tests/test_runtime.sh ./runtime/build-native/friscy /tmp/alpine.tar
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

FRISCY="${1:-}"
ROOTFS="${2:-}"

if [[ -z "$FRISCY" ]]; then
    echo "Usage: $0 <friscy-binary> [rootfs.tar]"
    echo ""
    echo "Examples:"
    echo "  $0 ./runtime/build-native/friscy /tmp/alpine.tar"
    echo "  $0 ./runtime/build-native/friscy  # skip container tests"
    exit 1
fi

if [[ ! -x "$FRISCY" ]]; then
    echo "Error: $FRISCY is not executable"
    exit 1
fi

echo -e "${CYAN}friscy Runtime Validation (Workstreams A + D + E + F)${NC}"
echo "Binary: $FRISCY"
[[ -n "$ROOTFS" ]] && echo "Rootfs: $ROOTFS"

TEST_TMP=$(mktemp -d)
trap "rm -rf $TEST_TMP" EXIT

# ---- Workstream A: Basic runtime ----
section "Workstream A: Basic Runtime"

# Help text
OUTPUT=$("$FRISCY" --help 2>&1 || true)
if echo "$OUTPUT" | grep -qi 'usage\|friscy'; then
    pass "--help shows usage"
else
    fail "--help output missing usage info"
fi

# Static binary test (if cross-compiler available)
if command -v riscv64-linux-gnu-gcc >/dev/null 2>&1; then
    cat > "$TEST_TMP/hello.c" << 'CEOF'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main() {
    printf("Hello from friscy!\n");
    // Test file ops via VFS
    FILE *f = fopen("/tmp/testfile", "w");
    if (f) {
        fprintf(f, "test content");
        fclose(f);
        f = fopen("/tmp/testfile", "r");
        if (f) {
            char buf[64];
            fgets(buf, sizeof(buf), f);
            fclose(f);
            printf("Read back: %s\n", buf);
        }
    }
    return 0;
}
CEOF
    riscv64-linux-gnu-gcc -static -O2 -o "$TEST_TMP/hello" "$TEST_TMP/hello.c" 2>/dev/null && {
        OUTPUT=$("$FRISCY" "$TEST_TMP/hello" 2>/dev/null || true)
        if echo "$OUTPUT" | grep -q 'Hello from friscy'; then
            pass "Static binary: hello output"
        else
            fail "Static binary: missing hello output"
        fi
        if echo "$OUTPUT" | grep -q 'Read back: test content'; then
            pass "Static binary: file I/O works"
        else
            fail "Static binary: file I/O failed"
        fi
    } || skip "Failed to compile static test binary"
else
    skip "No RISC-V cross-compiler (riscv64-linux-gnu-gcc)"
fi

# ---- Container tests (need rootfs) ----
if [[ -n "$ROOTFS" && -f "$ROOTFS" ]]; then
    section "Workstream A: Container Mode"

    # Echo test
    OUTPUT=$("$FRISCY" --rootfs "$ROOTFS" /bin/busybox echo "hello world" 2>/dev/null || true)
    if echo "$OUTPUT" | grep -q 'hello world'; then
        pass "Container echo: output correct"
    else
        fail "Container echo: missing 'hello world'"
    fi

    # ls test
    OUTPUT=$("$FRISCY" --rootfs "$ROOTFS" /bin/busybox ls / 2>/dev/null || true)
    if echo "$OUTPUT" | grep -q 'bin'; then
        pass "Container ls /: shows bin"
    else
        fail "Container ls /: missing bin directory"
    fi

    # cat /etc/os-release
    OUTPUT=$("$FRISCY" --rootfs "$ROOTFS" /bin/busybox cat /etc/os-release 2>/dev/null || true)
    if echo "$OUTPUT" | grep -qi 'alpine\|linux'; then
        pass "Container cat /etc/os-release: valid content"
    else
        fail "Container cat /etc/os-release: unexpected content"
    fi

    # File write + read
    OUTPUT=$("$FRISCY" --rootfs "$ROOTFS" /bin/busybox sh -c "echo testdata > /tmp/x && cat /tmp/x" 2>/dev/null || true)
    if echo "$OUTPUT" | grep -q 'testdata'; then
        pass "Container file write + read: works"
    else
        fail "Container file write + read: failed"
    fi

    # mkdir
    "$FRISCY" --rootfs "$ROOTFS" /bin/busybox mkdir -p /tmp/testdir 2>/dev/null
    RETVAL=$?
    if [[ $RETVAL -eq 0 ]]; then
        pass "Container mkdir: exit code 0"
    else
        fail "Container mkdir: exit code $RETVAL"
    fi

    # Check for unhandled syscalls
    STDERR=$("$FRISCY" --rootfs "$ROOTFS" /bin/busybox echo test 2>&1 1>/dev/null || true)
    if echo "$STDERR" | grep -qi 'unhandled syscall'; then
        fail "Unhandled syscall warnings detected"
    else
        pass "No unhandled syscall warnings"
    fi

    # ---- Workstream F: VFS Export ----
    section "Workstream F: VFS Tar Export"

    EXPORT_TAR="$TEST_TMP/export.tar"
    "$FRISCY" --rootfs "$ROOTFS" --export-tar "$EXPORT_TAR" \
        /bin/busybox sh -c "echo 'created in friscy' > /created.txt" 2>/dev/null || true

    if [[ -f "$EXPORT_TAR" ]]; then
        pass "export-tar produced output file"

        # Check tar is valid
        if tar -tf "$EXPORT_TAR" >/dev/null 2>&1; then
            pass "Exported tar is valid"
        else
            fail "Exported tar is corrupted"
        fi

        # Check for new file
        if tar -tf "$EXPORT_TAR" 2>/dev/null | grep -q 'created.txt'; then
            pass "New file (created.txt) in exported tar"
        else
            fail "New file (created.txt) missing from exported tar"
        fi

        # Check original files preserved
        if tar -tf "$EXPORT_TAR" 2>/dev/null | grep -q 'bin/'; then
            pass "Original /bin/ preserved in exported tar"
        else
            fail "Original /bin/ missing from exported tar"
        fi

        # Extract and verify content
        mkdir -p "$TEST_TMP/verify"
        tar -xf "$EXPORT_TAR" -C "$TEST_TMP/verify" 2>/dev/null || true
        if [[ -f "$TEST_TMP/verify/created.txt" ]]; then
            CONTENT=$(cat "$TEST_TMP/verify/created.txt")
            if [[ "$CONTENT" == "created in friscy" ]]; then
                pass "File content matches: '$CONTENT'"
            else
                fail "File content mismatch: got '$CONTENT'"
            fi
        else
            skip "Could not extract created.txt for content check"
        fi
    else
        fail "export-tar produced no output"
    fi

else
    skip "No rootfs provided, skipping container + export tests"
fi

# ---- Summary ----
section "Summary"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "  Passed: ${GREEN}${PASS}${NC}/${TOTAL}"
echo -e "  Failed: ${RED}${FAIL}${NC}/${TOTAL}"
echo -e "  Skipped: ${YELLOW}${SKIP}${NC}/${TOTAL}"

if [[ $FAIL -gt 0 ]]; then
    echo -e "\n${RED}RUNTIME VALIDATION FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}RUNTIME VALIDATION PASSED${NC}"
    exit 0
fi
