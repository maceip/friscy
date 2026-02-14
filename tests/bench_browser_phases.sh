#!/bin/bash
# ============================================================================
# bench_browser_phases.sh — Compare Phase 1 vs Phase 2 in browser
#
# Phase 1 profile: interpreter/peephole path (JIT disabled)
# Phase 2 profile: JIT dispatch path (JIT enabled)
#
# Usage:
#   ./tests/bench_browser_phases.sh
#   ./tests/bench_browser_phases.sh --runs 7
#   ./tests/bench_browser_phases.sh --write-baseline
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RUNS=5
WRITE_BASELINE=0
ROOTFS_URL="./nodejs.tar"
NODE_EVAL='console.log("42")'
EXPECTED_OUTPUT='42'
BENCHMARK_PREFIX='browser_node42'

PHASE1_QUERY="?noproxy&nojit=1"
PHASE2_QUERY="?noproxy&jithot=20"

PHASE1_OUT="$PROJECT_DIR/tests/perf/browser_node42.phase1.latest.json"
PHASE2_OUT="$PROJECT_DIR/tests/perf/browser_node42.phase2.latest.json"
PHASE1_BASELINE="$PROJECT_DIR/tests/perf/browser_node42.phase1.baseline.json"
PHASE2_BASELINE="$PROJECT_DIR/tests/perf/browser_node42.phase2.baseline.json"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --runs)
            RUNS="${2:-}"
            shift 2
            ;;
        --write-baseline)
            WRITE_BASELINE=1
            shift
            ;;
        --rootfs-url)
            ROOTFS_URL="${2:-}"
            shift 2
            ;;
        --eval)
            NODE_EVAL="${2:-}"
            shift 2
            ;;
        --expected)
            EXPECTED_OUTPUT="${2:-}"
            shift 2
            ;;
        --benchmark-prefix)
            BENCHMARK_PREFIX="${2:-}"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--runs N] [--write-baseline] [--rootfs-url URL] [--eval JS] [--expected TEXT] [--benchmark-prefix NAME]"
            exit 1
            ;;
    esac
done

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
    echo "[bench-phases] ERROR: --runs must be a positive integer"
    exit 1
fi

WRITE_FLAG=()
if [[ "$WRITE_BASELINE" == "1" ]]; then
    WRITE_FLAG=(--write-baseline)
fi

echo "[bench-phases] Running Phase 1 profile (nojit)..."
bash "$PROJECT_DIR/tests/bench_browser_node42.sh" \
    --runs "$RUNS" \
    --rootfs-url "$ROOTFS_URL" \
    --query "$PHASE1_QUERY" \
    --out "$PHASE1_OUT" \
    --baseline "$PHASE1_BASELINE" \
    --eval "$NODE_EVAL" \
    --expected "$EXPECTED_OUTPUT" \
    --benchmark "${BENCHMARK_PREFIX}.phase1" \
    "${WRITE_FLAG[@]}"

echo
echo "[bench-phases] Running Phase 2 profile (jit dispatch)..."
bash "$PROJECT_DIR/tests/bench_browser_node42.sh" \
    --runs "$RUNS" \
    --rootfs-url "$ROOTFS_URL" \
    --query "$PHASE2_QUERY" \
    --out "$PHASE2_OUT" \
    --baseline "$PHASE2_BASELINE" \
    --eval "$NODE_EVAL" \
    --expected "$EXPECTED_OUTPUT" \
    --benchmark "${BENCHMARK_PREFIX}.phase2" \
    "${WRITE_FLAG[@]}"

echo
echo "[bench-phases] Phase comparison (Phase 2 vs Phase 1):"
node -e '
const fs = require("fs");
const p1 = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const p2 = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
function pct(cur, base) {
  if (!Number.isFinite(base) || base === 0) return "n/a";
  const v = ((cur - base) / base) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
console.log(`  elapsed median: ${p1.elapsedSeconds.median.toFixed(3)}s -> ${p2.elapsedSeconds.median.toFixed(3)}s (${pct(p2.elapsedSeconds.median, p1.elapsedSeconds.median)})`);
console.log(`  elapsed p95:    ${p1.elapsedSeconds.p95.toFixed(3)}s -> ${p2.elapsedSeconds.p95.toFixed(3)}s (${pct(p2.elapsedSeconds.p95, p1.elapsedSeconds.p95)})`);
console.log(`  instr median:   ${Math.round(p1.instructions.median)} -> ${Math.round(p2.instructions.median)} (${pct(p2.instructions.median, p1.instructions.median)})`);
console.log(`  jit regions med ${Math.round(p1.jitRegionsCompiled.median)} -> ${Math.round(p2.jitRegionsCompiled.median)}`);
console.log(`  jit loaded runs ${p1.jitCompilerLoadedRuns}/${p1.elapsedSeconds.runs} -> ${p2.jitCompilerLoadedRuns}/${p2.elapsedSeconds.runs}`);
' "$PHASE1_OUT" "$PHASE2_OUT"

echo "[bench-phases] Done."
