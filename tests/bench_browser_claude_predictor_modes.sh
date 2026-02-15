#!/bin/bash
# ============================================================================
# bench_browser_claude_predictor_modes.sh
#
# Compare user-perceived latency for `claude --version` across predictor modes:
#   1) no_predictor  : no trace / no predictive compile
#   2) edge          : edge-only predictor
#   3) edge_triplet  : edge + triplet + weighted Markov predictor
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RUNS=3
ROOTFS_URL="./nodejs-claude.tar"
CLAUDE_CMD='/usr/bin/node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js --version'
EXPECTED_OUTPUT='Claude Code'
OUT_FILE="$PROJECT_DIR/tests/perf/browser_claude_predictor_modes.latest.json"

NO_PRED_QUERY='?noproxy&jithot=1&jitawait=1&nojittrace=1&nojitmarkov=1&nojittriplet=1&jitbudget=6&jitqmax=96'
EDGE_QUERY='?noproxy&jithot=1&jitawait=1&jitedgehot=3&nojitmarkov=1&nojittriplet=1&jitbudget=6&jitqmax=96'
EDGE_TRIPLET_QUERY='?noproxy&jithot=1&jitawait=1&jitedgehot=3&jittrace3hot=2&jitpredk=2&jitpredconf=0.5&jitbudget=6&jitqmax=96'

while [[ $# -gt 0 ]]; do
    case "$1" in
        --runs)
            RUNS="${2:-}"
            shift 2
            ;;
        --rootfs-url)
            ROOTFS_URL="${2:-}"
            shift 2
            ;;
        --cmd)
            CLAUDE_CMD="${2:-}"
            shift 2
            ;;
        --expected)
            EXPECTED_OUTPUT="${2:-}"
            shift 2
            ;;
        --out)
            OUT_FILE="${2:-}"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--runs N] [--rootfs-url URL] [--cmd CMD] [--expected TEXT] [--out PATH]"
            exit 1
            ;;
    esac
done

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
    echo "[bench-claude] ERROR: --runs must be a positive integer"
    exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

echo "[bench-claude] Predictor benchmark via Puppeteer"
echo "[bench-claude] Runs: $RUNS"
echo "[bench-claude] Rootfs: $ROOTFS_URL"
echo "[bench-claude] Command: $CLAUDE_CMD"
echo "[bench-claude] Expected output: $EXPECTED_OUTPUT"
echo

declare -A MODE_QUERY
MODE_QUERY[no_predictor]="$NO_PRED_QUERY"
MODE_QUERY[edge]="$EDGE_QUERY"
MODE_QUERY[edge_triplet]="$EDGE_TRIPLET_QUERY"

declare -A MODE_DATA_FILE

run_mode() {
    local mode="$1"
    local query="$2"
    local data_file
    data_file="$(mktemp)"

    echo "[bench-claude] Mode: $mode"
    echo "[bench-claude] Query: $query"

    for i in $(seq 1 "$RUNS"); do
        local log_file
        log_file="$(mktemp)"
        echo "[bench-claude]   run ${i}/${RUNS}..."
        if ! (
            cd "$PROJECT_DIR" && \
            FRISCY_TEST_ROOTFS_URL="$ROOTFS_URL" \
            FRISCY_TEST_CLAUDE_CMD="$CLAUDE_CMD" \
            FRISCY_TEST_EXPECTED_OUTPUT="$EXPECTED_OUTPUT" \
            FRISCY_TEST_QUERY="$query" \
            FRISCY_TEST_WAIT_FOR_EXIT=1 \
            node --experimental-default-type=module ./tests/test_claude_version.js
        ) >"$log_file" 2>&1; then
            echo "[bench-claude] ERROR: mode=$mode run=$i failed. Full log:"
            awk '1' "$log_file"
            rm -f "$log_file" "$data_file"
            exit 1
        fi

        local first_output completion steady miss_rate predictor_hit
        first_output="$(awk -F= '/\[METRIC\] first_output_s=/{print $2; exit}' "$log_file")"
        completion="$(awk -F= '/\[METRIC\] completion_s=/{print $2; exit}' "$log_file")"
        steady="$(awk -F= '/\[METRIC\] misses_before_steady_state=/{print $2; exit}' "$log_file")"
        miss_rate="$(awk -F= '/\[METRIC\] miss_rate=/{print $2; exit}' "$log_file")"
        predictor_hit="$(awk -F= '/\[METRIC\] predictor_hit_rate=/{print $2; exit}' "$log_file")"

        if [[ -z "$first_output" || -z "$completion" || -z "$steady" || -z "$miss_rate" || -z "$predictor_hit" ]]; then
            echo "[bench-claude] ERROR: missing metrics for mode=$mode run=$i. Full log:"
            awk '1' "$log_file"
            rm -f "$log_file" "$data_file"
            exit 1
        fi

        echo "${first_output},${completion},${steady},${miss_rate},${predictor_hit}" >> "$data_file"
        echo "[bench-claude]   run ${i}: first_output=${first_output}s completion=${completion}s misses_before_steady=${steady} miss_rate=${miss_rate} predictor_hit=${predictor_hit}"
        rm -f "$log_file"
    done

    MODE_DATA_FILE["$mode"]="$data_file"
    echo
}

run_mode "no_predictor" "${MODE_QUERY[no_predictor]}"
run_mode "edge" "${MODE_QUERY[edge]}"
run_mode "edge_triplet" "${MODE_QUERY[edge_triplet]}"

git_commit="$(cd "$PROJECT_DIR" && git rev-parse HEAD)"
timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

node -e '
const fs = require("fs");

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function stat(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  const sorted = [...clean].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return { runs: 0, min: null, median: null, mean: null, p95: null, max: null, values: [] };
  }
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const rank95 = Math.max(0, Math.ceil(0.95 * n) - 1);
  const p95 = sorted[rank95];
  return { runs: n, min: sorted[0], median, mean, p95, max: sorted[n - 1], values: clean };
}

function pctDelta(cur, base) {
  if (!Number.isFinite(cur) || !Number.isFinite(base) || base === 0) return null;
  return ((cur - base) / base) * 100;
}

const outFile = process.argv[1];
const commit = process.argv[2];
const timestamp = process.argv[3];
const rootfsUrl = process.argv[4];
const command = process.argv[5];
const expected = process.argv[6];
const noPredQuery = process.argv[7];
const edgeQuery = process.argv[8];
const edgeTripletQuery = process.argv[9];
const noPredFile = process.argv[10];
const edgeFile = process.argv[11];
const edgeTripletFile = process.argv[12];

function readMode(file) {
  const rows = fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [firstOut, completion, steady, missRate, predictorHit] = line.split(",");
      return {
        firstOutput: toNum(firstOut),
        completion: toNum(completion),
        missesBeforeSteady: toNum(steady),
        missRate: toNum(missRate),
        predictorHitRate: toNum(predictorHit),
      };
    });
  return {
    firstOutputSeconds: stat(rows.map((r) => r.firstOutput)),
    completionSeconds: stat(rows.map((r) => r.completion)),
    missesBeforeSteadyState: stat(rows.map((r) => r.missesBeforeSteady)),
    missRate: stat(rows.map((r) => r.missRate)),
    predictorHitRate: stat(rows.map((r) => r.predictorHitRate)),
  };
}

const result = {
  benchmark: "browser_claude_predictor_modes",
  commit,
  timestampUtc: timestamp,
  rootfsUrl,
  command,
  expectedOutput: expected,
  harness: "tests/test_claude_version.js",
  modes: {
    no_predictor: {
      query: noPredQuery,
      ...readMode(noPredFile),
    },
    edge: {
      query: edgeQuery,
      ...readMode(edgeFile),
    },
    edge_triplet: {
      query: edgeTripletQuery,
      ...readMode(edgeTripletFile),
    },
  },
};

const baseline = result.modes.no_predictor;
result.comparisons = {
  edge_vs_no_predictor: {
    firstOutputMedianPctDelta: pctDelta(
      result.modes.edge.firstOutputSeconds.median,
      baseline.firstOutputSeconds.median
    ),
    completionMedianPctDelta: pctDelta(
      result.modes.edge.completionSeconds.median,
      baseline.completionSeconds.median
    ),
    missesBeforeSteadyMedianPctDelta: pctDelta(
      result.modes.edge.missesBeforeSteadyState.median,
      baseline.missesBeforeSteadyState.median
    ),
  },
  edge_triplet_vs_no_predictor: {
    firstOutputMedianPctDelta: pctDelta(
      result.modes.edge_triplet.firstOutputSeconds.median,
      baseline.firstOutputSeconds.median
    ),
    completionMedianPctDelta: pctDelta(
      result.modes.edge_triplet.completionSeconds.median,
      baseline.completionSeconds.median
    ),
    missesBeforeSteadyMedianPctDelta: pctDelta(
      result.modes.edge_triplet.missesBeforeSteadyState.median,
      baseline.missesBeforeSteadyState.median
    ),
  },
};

fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
' "$OUT_FILE" "$git_commit" "$timestamp_utc" "$ROOTFS_URL" "$CLAUDE_CMD" "$EXPECTED_OUTPUT" \
  "${MODE_QUERY[no_predictor]}" "${MODE_QUERY[edge]}" "${MODE_QUERY[edge_triplet]}" \
  "${MODE_DATA_FILE[no_predictor]}" "${MODE_DATA_FILE[edge]}" "${MODE_DATA_FILE[edge_triplet]}"

echo "[bench-claude] Summary:"
node -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
function fmt(n, digits = 3) { return Number.isFinite(n) ? n.toFixed(digits) : "n/a"; }
function pct(n) { return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "n/a"; }
for (const mode of ["no_predictor", "edge", "edge_triplet"]) {
  const m = r.modes[mode];
  console.log(`  ${mode}: first_out_med=${fmt(m.firstOutputSeconds.median)}s completion_med=${fmt(m.completionSeconds.median)}s misses_before_steady_med=${fmt(m.missesBeforeSteadyState.median, 0)} predictor_hit_med=${fmt(m.predictorHitRate.median, 4)}`);
}
console.log("  deltas vs no_predictor:");
console.log(`    edge first output median:        ${pct(r.comparisons.edge_vs_no_predictor.firstOutputMedianPctDelta)}`);
console.log(`    edge completion median:          ${pct(r.comparisons.edge_vs_no_predictor.completionMedianPctDelta)}`);
console.log(`    edge misses-before-steady med:   ${pct(r.comparisons.edge_vs_no_predictor.missesBeforeSteadyMedianPctDelta)}`);
console.log(`    edge+triplet first output median:${pct(r.comparisons.edge_triplet_vs_no_predictor.firstOutputMedianPctDelta)}`);
console.log(`    edge+triplet completion median:  ${pct(r.comparisons.edge_triplet_vs_no_predictor.completionMedianPctDelta)}`);
console.log(`    edge+triplet misses-before-steady:${pct(r.comparisons.edge_triplet_vs_no_predictor.missesBeforeSteadyMedianPctDelta)}`);
' "$OUT_FILE"

for mode in no_predictor edge edge_triplet; do
    rm -f "${MODE_DATA_FILE[$mode]}"
done

echo "[bench-claude] Output: $OUT_FILE"
echo "[bench-claude] Done."
