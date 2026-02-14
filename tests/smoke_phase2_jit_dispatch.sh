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
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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

ROOTFS="$PROJECT_DIR/friscy-bundle/rootfs.tar"
if [[ ! -f "$ROOTFS" ]]; then
    echo "[smoke] ERROR: missing rootfs: $ROOTFS"
    exit 1
fi

if ! tar -tf "$ROOTFS" 2>/dev/null | rg -q '(^|/)(usr/bin/node)$'; then
    echo "[smoke] ERROR: rootfs does not contain /usr/bin/node (Node.js smoke prerequisite)"
    exit 1
fi

if $RUN_CLAUDE && ! tar -tf "$ROOTFS" 2>/dev/null | rg -q '(^|/)(usr/bin/claude)$'; then
    echo "[smoke] ERROR: rootfs does not contain /usr/bin/claude (Claude smoke prerequisite)"
    exit 1
fi

NODE_OPTS=(--experimental-default-type=module)

echo "[smoke] Phase 2 JIT-dispatch smoke: Node.js workload"
node "${NODE_OPTS[@]}" "$PROJECT_DIR/tests/test_phase1_nodejs2.js"
echo "[smoke] PASS: Node.js workload"

if $RUN_CLAUDE; then
    echo "[smoke] Phase 2 JIT-dispatch smoke: Claude workload"
    CLAUDE_LOG="$(mktemp)"
    trap 'rm -f "$CLAUDE_LOG"' EXIT
    node "${NODE_OPTS[@]}" "$PROJECT_DIR/tests/test_claude_version.js" 2>&1 | tee "$CLAUDE_LOG"

    if ! rg -q '\[JIT\] Compiled region' "$CLAUDE_LOG"; then
        echo "[smoke] ERROR: did not observe JIT region compilation in Claude run logs"
        exit 1
    fi
    echo "[smoke] PASS: Claude workload with JIT compilation evidence"
else
    echo "[smoke] SKIP: Claude workload (--skip-claude)"
fi

echo "[smoke] Phase 2 JIT-dispatch smoke completed successfully"
