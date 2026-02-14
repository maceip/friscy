#!/bin/bash
# ============================================================================
# smoke_phase1_peephole.sh — Phase 1 (peephole) browser smoke validation
#
# Verifies that fRISCy still boots:
#   1) Node.js guest workload
#   2) Claude Code guest workload (`claude --version`)
#
# Usage:
#   ./tests/smoke_phase1_peephole.sh
#   ./tests/smoke_phase1_peephole.sh --skip-claude   # quicker local smoke
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

echo "[smoke] Phase 1 peephole smoke: Node.js boot"
FRISCY_TEST_ROOTFS_URL="$TEST_ROOTFS_URL" \
FRISCY_TEST_NODE_EVAL='console.log("42")' \
FRISCY_TEST_EXPECTED_OUTPUT='42' \
node "${NODE_OPTS[@]}" "$PROJECT_DIR/tests/test_phase1_nodejs2.js"
echo "[smoke] PASS: Node.js boot"

if $RUN_CLAUDE; then
    echo "[smoke] Phase 1 peephole smoke: Claude version"
    FRISCY_TEST_ROOTFS_URL="$TEST_ROOTFS_URL" \
    node "${NODE_OPTS[@]}" "$PROJECT_DIR/tests/test_claude_version.js"
    echo "[smoke] PASS: Claude version"
else
    echo "[smoke] SKIP: Claude version (--skip-claude)"
fi

echo "[smoke] Phase 1 peephole smoke completed successfully"
