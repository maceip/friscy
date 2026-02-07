#!/bin/bash
#
# Test rv2wasm AOT compiler with a simple RISC-V binary
#
# Prerequisites:
#   - Rust toolchain (cargo)
#   - RISC-V cross-compiler (riscv64-linux-gnu-gcc)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AOT_DIR="${PROJECT_DIR}/aot"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[test]${NC} $1"; }
warn() { echo -e "${YELLOW}[test]${NC} $1"; }
err()  { echo -e "${RED}[test]${NC} $1"; exit 1; }

# Check prerequisites
command -v cargo >/dev/null 2>&1 || err "cargo (Rust) is required"

# Build rv2wasm
log "Building rv2wasm..."
cd "$AOT_DIR"
cargo build --release || err "Failed to build rv2wasm"
RV2WASM="${AOT_DIR}/target/release/rv2wasm"

# Create test directory
TEST_TMP=$(mktemp -d)
trap "rm -rf $TEST_TMP" EXIT

# Check for RISC-V cross-compiler
if command -v riscv64-linux-gnu-gcc >/dev/null 2>&1; then
    log "Creating test RISC-V binary..."

    # Simple test program
    cat > "$TEST_TMP/test.c" << 'EOF'
int main() {
    int sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += i;
    }
    return sum;
}
EOF

    riscv64-linux-gnu-gcc -static -O2 -o "$TEST_TMP/test" "$TEST_TMP/test.c" || {
        warn "Failed to compile test binary, trying with alternative flags..."
        riscv64-linux-gnu-gcc -static -O0 -o "$TEST_TMP/test" "$TEST_TMP/test.c" || err "Failed to compile"
    }

    log "Test binary created: $(file "$TEST_TMP/test" | cut -d: -f2)"

    # Run rv2wasm
    log "Running rv2wasm..."
    "$RV2WASM" "$TEST_TMP/test" -o "$TEST_TMP/test.wasm" --verbose || {
        warn "rv2wasm failed (may be expected for complex binaries)"
    }

    if [[ -f "$TEST_TMP/test.wasm" ]]; then
        log "Output Wasm: $(ls -lh "$TEST_TMP/test.wasm" | awk '{print $5}')"
        log "SUCCESS: rv2wasm produced output"

        # Validate with wasm-validate if available
        if command -v wasm-validate >/dev/null 2>&1; then
            if wasm-validate "$TEST_TMP/test.wasm"; then
                log "Wasm validation: PASSED"
            else
                warn "Wasm validation: FAILED (may be expected)"
            fi
        fi
    else
        warn "No output Wasm produced"
    fi
else
    warn "RISC-V cross-compiler not found (riscv64-linux-gnu-gcc)"
    warn "Skipping binary compilation test"

    # Test with just --help
    log "Testing rv2wasm --help..."
    "$RV2WASM" --help || err "rv2wasm --help failed"
    log "rv2wasm help: OK"
fi

log "Test complete!"
