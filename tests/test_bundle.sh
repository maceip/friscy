#!/bin/bash
# ============================================================================
# test_bundle.sh — Validate friscy-pack bundle output (Workstream B + F)
#
# Usage:
#   ./tests/test_bundle.sh <bundle-dir>
#   ./tests/test_bundle.sh /tmp/friscy-bundle
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

BUNDLE_DIR="${1:-}"
if [[ -z "$BUNDLE_DIR" ]]; then
    echo "Usage: $0 <bundle-directory>"
    echo ""
    echo "Create a bundle first:"
    echo "  ./tools/friscy-pack alpine:latest --output /tmp/friscy-bundle"
    exit 1
fi

echo -e "${CYAN}friscy Bundle Validation (Workstream B + F)${NC}"
echo "Bundle: $BUNDLE_DIR"

# ---- Required files ----
section "Required Files"

for f in index.html manifest.json rootfs.tar; do
    if [[ -f "$BUNDLE_DIR/$f" ]]; then
        SIZE=$(stat -c%s "$BUNDLE_DIR/$f" 2>/dev/null || stat -f%z "$BUNDLE_DIR/$f" 2>/dev/null || echo 0)
        SIZE_KB=$((SIZE / 1024))
        pass "$f exists (${SIZE_KB}KB)"
    else
        fail "$f missing from bundle"
    fi
done

# Check for Wasm runtime (either friscy.js + friscy.wasm or single friscy.js)
if [[ -f "$BUNDLE_DIR/friscy.js" ]]; then
    pass "friscy.js present"
    if [[ -f "$BUNDLE_DIR/friscy.wasm" ]]; then
        pass "friscy.wasm present (development mode)"
    else
        # Check if wasm is embedded (production mode)
        if grep -q 'Uint8Array' "$BUNDLE_DIR/friscy.js" 2>/dev/null; then
            pass "friscy.wasm embedded in JS (production mode)"
        else
            fail "friscy.wasm missing and not embedded"
        fi
    fi
else
    fail "friscy.js missing from bundle"
fi

# ---- Manifest validation ----
section "Manifest (manifest.json)"

if [[ -f "$BUNDLE_DIR/manifest.json" ]]; then
    # Check valid JSON
    if command -v python3 >/dev/null 2>&1; then
        if python3 -m json.tool "$BUNDLE_DIR/manifest.json" >/dev/null 2>&1; then
            pass "Valid JSON"
        else
            fail "Invalid JSON in manifest.json"
        fi
    elif command -v jq >/dev/null 2>&1; then
        if jq . "$BUNDLE_DIR/manifest.json" >/dev/null 2>&1; then
            pass "Valid JSON"
        else
            fail "Invalid JSON in manifest.json"
        fi
    else
        skip "No JSON validator (python3/jq) to check manifest"
    fi

    # Check required fields
    for field in version image entrypoint; do
        if grep -q "\"$field\"" "$BUNDLE_DIR/manifest.json" 2>/dev/null; then
            pass "manifest has '$field' field"
        else
            fail "manifest missing '$field' field"
        fi
    done
fi

# ---- Rootfs tar validation ----
section "Rootfs (rootfs.tar)"

if [[ -f "$BUNDLE_DIR/rootfs.tar" ]]; then
    TAR_SIZE=$(stat -c%s "$BUNDLE_DIR/rootfs.tar" 2>/dev/null || stat -f%z "$BUNDLE_DIR/rootfs.tar" 2>/dev/null || echo 0)
    TAR_SIZE_MB=$((TAR_SIZE / 1024 / 1024))

    if [[ $TAR_SIZE -gt 1000000 ]]; then
        pass "rootfs.tar size reasonable (${TAR_SIZE_MB}MB)"
    else
        fail "rootfs.tar suspiciously small (${TAR_SIZE_MB}MB)"
    fi

    # Verify tar integrity
    if tar -tf "$BUNDLE_DIR/rootfs.tar" >/dev/null 2>&1; then
        pass "rootfs.tar is valid tar"

        # Check for expected Alpine files
        if tar -tf "$BUNDLE_DIR/rootfs.tar" 2>/dev/null | grep -q 'bin/'; then
            pass "rootfs contains /bin/"
        else
            fail "rootfs missing /bin/"
        fi

        if tar -tf "$BUNDLE_DIR/rootfs.tar" 2>/dev/null | grep -q 'etc/'; then
            pass "rootfs contains /etc/"
        else
            fail "rootfs missing /etc/"
        fi
    else
        fail "rootfs.tar is corrupted or invalid"
    fi
fi

# ---- index.html validation ----
section "Web UI (index.html)"

if [[ -f "$BUNDLE_DIR/index.html" ]]; then
    # Check for xterm.js
    if grep -qi 'xterm' "$BUNDLE_DIR/index.html" 2>/dev/null; then
        pass "index.html references xterm.js"
    else
        fail "index.html missing xterm.js reference"
    fi

    # Check for friscy.js import
    if grep -q 'friscy' "$BUNDLE_DIR/index.html" 2>/dev/null; then
        pass "index.html imports friscy runtime"
    else
        fail "index.html missing friscy runtime import"
    fi

    # Check for service worker
    if grep -qi 'serviceWorker\|sw\.js' "$BUNDLE_DIR/index.html" 2>/dev/null; then
        pass "Service worker reference found"
    else
        skip "No service worker reference (optional)"
    fi
fi

# ---- AOT output check (if --aot was used) ----
section "AOT Compilation (optional)"

if [[ -d "$BUNDLE_DIR/aot" ]]; then
    WASM_COUNT=$(find "$BUNDLE_DIR/aot" -name '*.wasm' 2>/dev/null | wc -l)
    if [[ $WASM_COUNT -gt 0 ]]; then
        pass "AOT directory contains $WASM_COUNT .wasm files"
    else
        fail "AOT directory exists but has no .wasm files"
    fi
else
    skip "No AOT directory (build with --aot to enable)"
fi

# ---- Summary ----
section "Summary"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "  Passed: ${GREEN}${PASS}${NC}/${TOTAL}"
echo -e "  Failed: ${RED}${FAIL}${NC}/${TOTAL}"
echo -e "  Skipped: ${YELLOW}${SKIP}${NC}/${TOTAL}"

if [[ $FAIL -gt 0 ]]; then
    echo -e "\n${RED}BUNDLE VALIDATION FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}BUNDLE VALIDATION PASSED${NC}"
    exit 0
fi
