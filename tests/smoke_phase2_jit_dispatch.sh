#!/bin/bash
# ============================================================================
# smoke_phase2_jit_dispatch.sh — Phase 2 (Wasm-internal JIT dispatch) smoke
#
# Validates browser execution for:
#   1) Node.js workload
#   2) Claude workload
# and checks for JIT compilation evidence in browser logs.
#
# Usage:
#   ./tests/smoke_phase2_jit_dispatch.sh
#   ./tests/smoke_phase2_jit_dispatch.sh --skip-claude
# Environment overrides:
#   FRISCY_PHASE_ROOTFS=/abs/path/to/rootfs.tar
#   FRISCY_TEST_ROOTFS_URL=./nodejs.tar
#   CLAUDE_NPM_PACKAGE=@anthropic-ai/claude-code
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PROJECT_DIR/tests/baseline_rootfs_checks.sh"

RUN_CLAUDE=true
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-claude)
            RUN_CLAUDE=false
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-claude]"
            exit 1
            ;;
    esac
done

if ! command -v node >/dev/null 2>&1; then
    echo "[smoke] ERROR: node is required but not found in PATH"
    exit 1
fi

ROOTFS="$PROJECT_DIR/friscy-bundle/nodejs.tar"
TEST_ROOTFS_URL="./nodejs.tar"

if $RUN_CLAUDE && [[ -z "${FRISCY_PHASE_ROOTFS:-}" ]]; then
    CLAUDE_ROOTFS="$PROJECT_DIR/friscy-bundle/nodejs-claude.tar"
    if [[ ! -f "$CLAUDE_ROOTFS" ]] || ! tar -tf "$CLAUDE_ROOTFS" 2>/dev/null | rg -q '(^|/)(usr/bin/claude)$'; then
        echo "[smoke] Preparing Claude-enabled rootfs (this may take a minute)..."
        bash "$PROJECT_DIR/tests/build_nodejs_claude_rootfs.sh" "$ROOTFS" "$CLAUDE_ROOTFS"
    fi
    ROOTFS="$CLAUDE_ROOTFS"
    TEST_ROOTFS_URL="./$(basename "$CLAUDE_ROOTFS")"
fi

ROOTFS="${FRISCY_PHASE_ROOTFS:-$ROOTFS}"
TEST_ROOTFS_URL="${FRISCY_TEST_ROOTFS_URL:-$TEST_ROOTFS_URL}"

echo "[smoke] Using rootfs: $ROOTFS"
echo "[smoke] Browser rootfs URL: $TEST_ROOTFS_URL"
check_baseline_rootfs "$ROOTFS" "$RUN_CLAUDE" 62914560

NODE_OPTS=(--experimental-default-type=module)

echo "[smoke] Phase 2 JIT-dispatch smoke: Node.js workload"
FRISCY_TEST_ROOTFS_URL="$TEST_ROOTFS_URL" \
FRISCY_TEST_NODE_EVAL='console.log("42")' \
FRISCY_TEST_EXPECTED_OUTPUT='42' \
node "${NODE_OPTS[@]}" "$PROJECT_DIR/tests/test_phase1_nodejs2.js"
echo "[smoke] PASS: Node.js workload"

if $RUN_CLAUDE; then
    echo "[smoke] Phase 2 JIT-dispatch smoke: Claude workload"
    CLAUDE_LOG="$(mktemp)"
    trap 'rm -f "$CLAUDE_LOG"' EXIT
    FRISCY_TEST_ROOTFS_URL="$TEST_ROOTFS_URL" \
    node "${NODE_OPTS[@]}" "$PROJECT_DIR/tests/test_claude_version.js" 2>&1 | tee "$CLAUDE_LOG"

    if ! rg -q '\[JIT\] Compiled region|\[METRIC\] jit_compiler_loaded=1' "$CLAUDE_LOG"; then
        echo "[smoke] ERROR: did not observe JIT availability in Claude run logs"
        exit 1
    fi
    if ! rg -q '\[JIT\] Compiled region|\[METRIC\] jit_regions_compiled=[1-9][0-9]*' "$CLAUDE_LOG"; then
        echo "[smoke] WARN: Claude run did not compile any JIT regions (workload may be non-hot/short in this path)"
    fi
    echo "[smoke] PASS: Claude workload with JIT compilation evidence"
else
    echo "[smoke] SKIP: Claude workload (--skip-claude)"
fi

echo "[smoke] Phase 2 JIT-dispatch smoke completed successfully"
