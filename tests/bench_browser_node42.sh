#!/bin/bash
# ============================================================================
# bench_browser_node42.sh — Browser benchmark via Puppeteer + emulator
#
# Runs Node.js in-browser emulator using:
#   /usr/bin/node -e 'console.log("42")'
# and reports wall-clock stats and instruction-count stats across runs.
#
# Usage:
#   ./tests/bench_browser_node42.sh
#   ./tests/bench_browser_node42.sh --runs 7
#   ./tests/bench_browser_node42.sh --write-baseline
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RUNS=5
WRITE_BASELINE=0
ROOTFS_URL="./nodejs.tar"
PAGE_QUERY="?noproxy"
BASELINE_FILE="$PROJECT_DIR/tests/perf/browser_node42.baseline.json"
OUT_FILE="$PROJECT_DIR/tests/perf/browser_node42.latest.json"

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
        --query)
            PAGE_QUERY="${2:-}"
            shift 2
            ;;
        --baseline)
            BASELINE_FILE="${2:-}"
            shift 2
            ;;
        --out)
            OUT_FILE="${2:-}"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--runs N] [--write-baseline] [--rootfs-url URL] [--query QUERY] [--baseline PATH] [--out PATH]"
            exit 1
            ;;
    esac
done

if ! command -v node >/dev/null 2>&1; then
    echo "[bench] ERROR: node is required but not found in PATH"
    exit 1
fi

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
    echo "[bench] ERROR: --runs must be a positive integer"
    exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")" "$(dirname "$BASELINE_FILE")"

echo "[bench] Browser benchmark: node -e 'console.log(\"42\")' via Puppeteer"
echo "[bench] Runs: $RUNS"
echo "[bench] Rootfs URL: $ROOTFS_URL"
echo "[bench] Query: ${PAGE_QUERY:-'(none)'}"
echo "[bench] Output JSON: $OUT_FILE"
echo "[bench] Baseline JSON: $BASELINE_FILE"
echo

elapsed_values=()
instruction_values=()
jit_region_values=()
jit_loaded_values=()

for i in $(seq 1 "$RUNS"); do
    echo "[bench] Run ${i}/${RUNS}..."
    LOG_FILE="$(mktemp)"
    if ! (
        cd "$PROJECT_DIR" && \
        FRISCY_TEST_ROOTFS_URL="$ROOTFS_URL" \
        FRISCY_TEST_NODE_EVAL='console.log("42")' \
        FRISCY_TEST_EXPECTED_OUTPUT='42' \
        FRISCY_TEST_QUERY="$PAGE_QUERY" \
        FRISCY_TEST_WAIT_FOR_EXIT=1 \
        node --experimental-default-type=module ./tests/test_phase1_nodejs2.js
    ) >"$LOG_FILE" 2>&1; then
        echo "[bench] ERROR: run ${i} failed. Full log:"
        awk '1' "$LOG_FILE"
        rm -f "$LOG_FILE"
        exit 1
    fi

    elapsed="$(awk -F= '/\[METRIC\] elapsed_s=/{print $2; exit}' "$LOG_FILE")"
    instructions="$(awk -F= '/\[METRIC\] instructions=/{print $2; exit}' "$LOG_FILE")"
    jit_loaded="$(awk -F= '/\[METRIC\] jit_compiler_loaded=/{print $2; exit}' "$LOG_FILE")"
    jit_regions="$(awk -F= '/\[METRIC\] jit_regions_compiled=/{print $2; exit}' "$LOG_FILE")"

    if [[ -z "$elapsed" ]]; then
        echo "[bench] ERROR: run ${i} missing elapsed metric. Full log:"
        awk '1' "$LOG_FILE"
        rm -f "$LOG_FILE"
        exit 1
    fi
    if [[ -z "$instructions" ]]; then
        echo "[bench] ERROR: run ${i} missing instruction metric. Full log:"
        awk '1' "$LOG_FILE"
        rm -f "$LOG_FILE"
        exit 1
    fi
    if [[ -z "$jit_loaded" ]]; then
        echo "[bench] ERROR: run ${i} missing jit_compiler_loaded metric. Full log:"
        awk '1' "$LOG_FILE"
        rm -f "$LOG_FILE"
        exit 1
    fi
    if [[ -z "$jit_regions" ]]; then
        echo "[bench] ERROR: run ${i} missing jit_regions_compiled metric. Full log:"
        awk '1' "$LOG_FILE"
        rm -f "$LOG_FILE"
        exit 1
    fi

    elapsed_values+=("$elapsed")
    instruction_values+=("$instructions")
    jit_loaded_values+=("$jit_loaded")
    jit_region_values+=("$jit_regions")
    echo "[bench] Run ${i}: elapsed=${elapsed}s instructions=${instructions} jit_loaded=${jit_loaded} jit_regions=${jit_regions}"
    rm -f "$LOG_FILE"
done

elapsed_csv="$(IFS=,; echo "${elapsed_values[*]}")"
instructions_csv="$(IFS=,; echo "${instruction_values[*]}")"
jit_regions_csv="$(IFS=,; echo "${jit_region_values[*]}")"
jit_loaded_csv="$(IFS=,; echo "${jit_loaded_values[*]}")"
git_commit="$(cd "$PROJECT_DIR" && git rev-parse HEAD)"
timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

node -e '
const fs = require("fs");

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const rank95 = Math.max(0, Math.ceil(0.95 * n) - 1);
  const p95 = sorted[rank95];
  return {
    runs: n,
    min: sorted[0],
    median,
    mean,
    p95,
    max: sorted[n - 1],
    values,
  };
}

function pctDelta(current, base) {
  if (!Number.isFinite(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}

const elapsed = process.argv[1].split(",").map(Number).filter(Number.isFinite);
const instructions = process.argv[2].split(",").map(Number).filter(Number.isFinite);
const jitRegions = process.argv[3].split(",").map(Number).filter(Number.isFinite);
const jitLoaded = process.argv[4].split(",").map(Number).filter(Number.isFinite);
const rootfsUrl = process.argv[5];
const pageQuery = process.argv[6];
const commit = process.argv[7];
const timestamp = process.argv[8];
const outFile = process.argv[9];
const baselineFile = process.argv[10];

const result = {
  benchmark: "browser_node42",
  command: "/usr/bin/node -e console.log(\"42\")",
  harness: "tests/test_phase1_nodejs2.js",
  rootfsUrl,
  pageQuery,
  commit,
  timestampUtc: timestamp,
  elapsedSeconds: stats(elapsed),
  instructions: stats(instructions),
  jitRegionsCompiled: stats(jitRegions),
  jitCompilerLoadedRuns: jitLoaded.reduce((a, b) => a + (b > 0 ? 1 : 0), 0),
};

if (fs.existsSync(baselineFile)) {
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  result.baseline = {
    file: baselineFile,
    commit: baseline.commit || null,
    timestampUtc: baseline.timestampUtc || null,
    elapsedMedianPctDelta: pctDelta(
      result.elapsedSeconds.median,
      baseline.elapsedSeconds?.median
    ),
    elapsedP95PctDelta: pctDelta(
      result.elapsedSeconds.p95,
      baseline.elapsedSeconds?.p95
    ),
    instructionMedianPctDelta: pctDelta(
      result.instructions.median,
      baseline.instructions?.median
    ),
  };
}

fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
' "$elapsed_csv" "$instructions_csv" "$jit_regions_csv" "$jit_loaded_csv" "$ROOTFS_URL" "$PAGE_QUERY" "$git_commit" "$timestamp_utc" "$OUT_FILE" "$BASELINE_FILE"

echo
echo "[bench] Summary:"
node -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
function fmt(n, digits = 3) { return Number.isFinite(n) ? n.toFixed(digits) : "n/a"; }
function pct(n) { return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "n/a"; }
console.log(`  elapsed_s  median=${fmt(r.elapsedSeconds.median)}  p95=${fmt(r.elapsedSeconds.p95)}  min=${fmt(r.elapsedSeconds.min)}  max=${fmt(r.elapsedSeconds.max)}`);
console.log(`  instr      median=${fmt(r.instructions.median, 0)}  p95=${fmt(r.instructions.p95, 0)}  min=${fmt(r.instructions.min, 0)}  max=${fmt(r.instructions.max, 0)}`);
console.log(`  jit_regs   median=${fmt(r.jitRegionsCompiled.median, 0)}  p95=${fmt(r.jitRegionsCompiled.p95, 0)}  loaded_runs=${fmt(r.jitCompilerLoadedRuns, 0)}/${fmt(r.elapsedSeconds.runs, 0)}`);
if (r.baseline) {
  console.log("  vs baseline:");
  console.log(`    elapsed median delta: ${pct(r.baseline.elapsedMedianPctDelta)}`);
  console.log(`    elapsed p95 delta:    ${pct(r.baseline.elapsedP95PctDelta)}`);
  console.log(`    instr median delta:   ${pct(r.baseline.instructionMedianPctDelta)}`);
}
' "$OUT_FILE"

if [[ "$WRITE_BASELINE" == "1" ]]; then
    cp "$OUT_FILE" "$BASELINE_FILE"
    echo "[bench] Baseline updated: $BASELINE_FILE"
fi

echo "[bench] Done."
