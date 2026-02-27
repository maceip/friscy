#!/bin/bash
# ============================================================================
# bench_jit_prewarm_impact.sh
#
# Impact gate for #2 (boot JIT preload + prewarm) on alpine workload.
# A/B benchmark over identical command:
#   - control:   nojitprewarm=1
#   - candidate: default prewarm behavior
#
# Harness: tests/test_jit_prewarm_ab.mjs
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RUNS=3
ROOTFS_URL="./rootfs.tar"
GUEST_CMD='i=0; while [ $i -lt 200000 ]; do i=$((i+1)); done; echo done'
CONTROL_QUERY='?example=alpine&jithot=1&jitawait=1&nojitprewarm=1'
CANDIDATE_QUERY='?example=alpine&jithot=1&jitawait=1'
TEST_TIMEOUT_MS=180000
MIN_FIRST_COMPILE_WIN_PCT=5
MAX_ELAPSED_REGRESSION_PCT=5
OUT_FILE="$PROJECT_DIR/tests/.perf/jit_prewarm_impact.latest.json"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --runs) RUNS="${2:-}"; shift 2 ;;
        --rootfs-url) ROOTFS_URL="${2:-}"; shift 2 ;;
        --cmd) GUEST_CMD="${2:-}"; shift 2 ;;
        --control-query) CONTROL_QUERY="${2:-}"; shift 2 ;;
        --candidate-query) CANDIDATE_QUERY="${2:-}"; shift 2 ;;
        --timeout-ms) TEST_TIMEOUT_MS="${2:-}"; shift 2 ;;
        --min-first-compile-win-pct) MIN_FIRST_COMPILE_WIN_PCT="${2:-}"; shift 2 ;;
        --max-elapsed-regression-pct) MAX_ELAPSED_REGRESSION_PCT="${2:-}"; shift 2 ;;
        --out) OUT_FILE="${2:-}"; shift 2 ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--runs N] [--rootfs-url URL] [--cmd CMD] [--control-query Q] [--candidate-query Q] [--timeout-ms MS] [--min-first-compile-win-pct PCT] [--max-elapsed-regression-pct PCT] [--out PATH]"
            exit 1
            ;;
    esac
done

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
    echo "[bench-prewarm] ERROR: --runs must be a positive integer"
    exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

echo "[bench-prewarm] Runs: $RUNS"
echo "[bench-prewarm] Rootfs: $ROOTFS_URL"
echo "[bench-prewarm] Command: $GUEST_CMD"
echo "[bench-prewarm] control query:   $CONTROL_QUERY"
echo "[bench-prewarm] candidate query: $CANDIDATE_QUERY"
echo "[bench-prewarm] timeout_ms: $TEST_TIMEOUT_MS"
echo

control_elapsed_values=()
candidate_elapsed_values=()
control_resume_values=()
candidate_resume_values=()
control_jit_loaded_values=()
candidate_jit_loaded_values=()
control_jit_regions_values=()
candidate_jit_regions_values=()
control_prewarm_success_values=()
candidate_prewarm_success_values=()
control_prewarmed_values=()
candidate_prewarmed_values=()
control_first_compile_values=()
candidate_first_compile_values=()

for i in $(seq 1 "$RUNS"); do
    echo "[bench-prewarm] Run ${i}/${RUNS}..."
    LOG_FILE="$(mktemp)"
    if ! (
        cd "$PROJECT_DIR" && \
        FRISCY_TEST_ROOTFS_URL="$ROOTFS_URL" \
        FRISCY_TEST_CMD="$GUEST_CMD" \
        FRISCY_TEST_TIMEOUT_MS="$TEST_TIMEOUT_MS" \
        FRISCY_TEST_CONTROL_QUERY="$CONTROL_QUERY" \
        FRISCY_TEST_CANDIDATE_QUERY="$CANDIDATE_QUERY" \
        node ./tests/test_jit_prewarm_ab.mjs
    ) >"$LOG_FILE" 2>&1; then
        echo "[bench-prewarm] ERROR: run ${i} failed. Full log:"
        awk '1' "$LOG_FILE"
        rm -f "$LOG_FILE"
        exit 1
    fi

    control_elapsed="$(awk -F= '/\[METRIC\] control_elapsed_ms=/{print $2; exit}' "$LOG_FILE")"
    candidate_elapsed="$(awk -F= '/\[METRIC\] candidate_elapsed_ms=/{print $2; exit}' "$LOG_FILE")"
    control_resume="$(awk -F= '/\[METRIC\] control_resume_count=/{print $2; exit}' "$LOG_FILE")"
    candidate_resume="$(awk -F= '/\[METRIC\] candidate_resume_count=/{print $2; exit}' "$LOG_FILE")"
    control_jit_loaded="$(awk -F= '/\[METRIC\] control_jit_compiler_loaded=/{print $2; exit}' "$LOG_FILE")"
    candidate_jit_loaded="$(awk -F= '/\[METRIC\] candidate_jit_compiler_loaded=/{print $2; exit}' "$LOG_FILE")"
    control_jit_regions="$(awk -F= '/\[METRIC\] control_jit_regions_compiled=/{print $2; exit}' "$LOG_FILE")"
    candidate_jit_regions="$(awk -F= '/\[METRIC\] candidate_jit_regions_compiled=/{print $2; exit}' "$LOG_FILE")"
    control_prewarm_success="$(awk -F= '/\[METRIC\] control_prewarm_successes=/{print $2; exit}' "$LOG_FILE")"
    candidate_prewarm_success="$(awk -F= '/\[METRIC\] candidate_prewarm_successes=/{print $2; exit}' "$LOG_FILE")"
    control_prewarmed="$(awk -F= '/\[METRIC\] control_compiler_prewarmed=/{print $2; exit}' "$LOG_FILE")"
    candidate_prewarmed="$(awk -F= '/\[METRIC\] candidate_compiler_prewarmed=/{print $2; exit}' "$LOG_FILE")"
    control_first_compile="$(awk -F= '/\[METRIC\] control_first_compile_latency_ms=/{print $2; exit}' "$LOG_FILE")"
    candidate_first_compile="$(awk -F= '/\[METRIC\] candidate_first_compile_latency_ms=/{print $2; exit}' "$LOG_FILE")"

    for metric in control_elapsed candidate_elapsed control_resume candidate_resume control_jit_loaded candidate_jit_loaded control_jit_regions candidate_jit_regions control_prewarm_success candidate_prewarm_success control_prewarmed candidate_prewarmed control_first_compile candidate_first_compile; do
        if [[ -z "${!metric}" ]]; then
            echo "[bench-prewarm] ERROR: run ${i} missing metric $metric. Full log:"
            awk '1' "$LOG_FILE"
            rm -f "$LOG_FILE"
            exit 1
        fi
    done

    control_elapsed_values+=("$control_elapsed")
    candidate_elapsed_values+=("$candidate_elapsed")
    control_resume_values+=("$control_resume")
    candidate_resume_values+=("$candidate_resume")
    control_jit_loaded_values+=("$control_jit_loaded")
    candidate_jit_loaded_values+=("$candidate_jit_loaded")
    control_jit_regions_values+=("$control_jit_regions")
    candidate_jit_regions_values+=("$candidate_jit_regions")
    control_prewarm_success_values+=("$control_prewarm_success")
    candidate_prewarm_success_values+=("$candidate_prewarm_success")
    control_prewarmed_values+=("$control_prewarmed")
    candidate_prewarmed_values+=("$candidate_prewarmed")
    control_first_compile_values+=("$control_first_compile")
    candidate_first_compile_values+=("$candidate_first_compile")

    echo "[bench-prewarm] run=${i} control_elapsed_ms=${control_elapsed} candidate_elapsed_ms=${candidate_elapsed} control_prewarm_success=${control_prewarm_success} candidate_prewarm_success=${candidate_prewarm_success}"
    rm -f "$LOG_FILE"
done

control_elapsed_csv="$(IFS=,; echo "${control_elapsed_values[*]}")"
candidate_elapsed_csv="$(IFS=,; echo "${candidate_elapsed_values[*]}")"
control_resume_csv="$(IFS=,; echo "${control_resume_values[*]}")"
candidate_resume_csv="$(IFS=,; echo "${candidate_resume_values[*]}")"
control_jit_loaded_csv="$(IFS=,; echo "${control_jit_loaded_values[*]}")"
candidate_jit_loaded_csv="$(IFS=,; echo "${candidate_jit_loaded_values[*]}")"
control_jit_regions_csv="$(IFS=,; echo "${control_jit_regions_values[*]}")"
candidate_jit_regions_csv="$(IFS=,; echo "${candidate_jit_regions_values[*]}")"
control_prewarm_success_csv="$(IFS=,; echo "${control_prewarm_success_values[*]}")"
candidate_prewarm_success_csv="$(IFS=,; echo "${candidate_prewarm_success_values[*]}")"
control_prewarmed_csv="$(IFS=,; echo "${control_prewarmed_values[*]}")"
candidate_prewarmed_csv="$(IFS=,; echo "${candidate_prewarmed_values[*]}")"
control_first_compile_csv="$(IFS=,; echo "${control_first_compile_values[*]}")"
candidate_first_compile_csv="$(IFS=,; echo "${candidate_first_compile_values[*]}")"

git_commit="$(cd "$PROJECT_DIR" && git rev-parse HEAD)"
timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

node -e '
const fs = require("fs");

function parseCsv(s) {
  return s.split(",").map(Number).filter(Number.isFinite);
}

function stat(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  const sorted = [...clean].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { runs: 0, min: null, median: null, mean: null, p95: null, max: null, values: [] };
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const rank95 = Math.max(0, Math.ceil(0.95 * n) - 1);
  return { runs: n, min: sorted[0], median, mean, p95: sorted[rank95], max: sorted[n - 1], values: clean };
}

function pctDelta(current, base) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}

const controlElapsed = parseCsv(process.argv[1]);
const candidateElapsed = parseCsv(process.argv[2]);
const controlResume = parseCsv(process.argv[3]);
const candidateResume = parseCsv(process.argv[4]);
const controlJitLoaded = parseCsv(process.argv[5]);
const candidateJitLoaded = parseCsv(process.argv[6]);
const controlJitRegions = parseCsv(process.argv[7]);
const candidateJitRegions = parseCsv(process.argv[8]);
const controlPrewarmSuccess = parseCsv(process.argv[9]);
const candidatePrewarmSuccess = parseCsv(process.argv[10]);
const controlPrewarmed = parseCsv(process.argv[11]);
const candidatePrewarmed = parseCsv(process.argv[12]);
const controlFirstCompile = parseCsv(process.argv[13]);
const candidateFirstCompile = parseCsv(process.argv[14]);
const runs = Number(process.argv[15]);
const minFirstCompileWinPct = Number(process.argv[16]);
const maxElapsedRegressionPct = Number(process.argv[17]);
const outFile = process.argv[18];
const commit = process.argv[19];
const timestamp = process.argv[20];
const rootfsUrl = process.argv[21];
const guestCmd = process.argv[22];
const controlQuery = process.argv[23];
const candidateQuery = process.argv[24];

const controlElapsedStats = stat(controlElapsed);
const candidateElapsedStats = stat(candidateElapsed);
const controlFirstCompileStats = stat(controlFirstCompile.filter((v) => v >= 0));
const candidateFirstCompileStats = stat(candidateFirstCompile.filter((v) => v >= 0));

const firstCompileMedianPctDelta = pctDelta(candidateFirstCompileStats.median, controlFirstCompileStats.median);
const elapsedMedianPctDelta = pctDelta(candidateElapsedStats.median, controlElapsedStats.median);

const controlLoadedRuns = controlJitLoaded.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
const candidateLoadedRuns = candidateJitLoaded.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
const controlPrewarmedRuns = controlPrewarmed.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
const candidatePrewarmedRuns = candidatePrewarmed.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);

const semanticGatePass = controlLoadedRuns === runs && candidateLoadedRuns === runs;
const engagementGatePass = stat(candidateResume).median > 0 && stat(controlResume).median > 0;
const prewarmConfigGatePass = controlPrewarmedRuns === 0 && candidatePrewarmedRuns === runs && stat(candidatePrewarmSuccess).median > 0;
const impactGatePass = Number.isFinite(firstCompileMedianPctDelta)
  ? (firstCompileMedianPctDelta <= -Math.abs(minFirstCompileWinPct) && elapsedMedianPctDelta <= Math.abs(maxElapsedRegressionPct))
  : (elapsedMedianPctDelta <= 0 && stat(candidatePrewarmSuccess).median > stat(controlPrewarmSuccess).median);

const result = {
  benchmark: "jit_prewarm_impact",
  commit,
  timestampUtc: timestamp,
  rootfsUrl,
  guestCommand: guestCmd,
  runs,
  modes: {
    control: {
      query: controlQuery,
      elapsedMs: controlElapsedStats,
      resumeCount: stat(controlResume),
      jitLoadedRuns: controlLoadedRuns,
      jitRegionsCompiled: stat(controlJitRegions),
      prewarmSuccesses: stat(controlPrewarmSuccess),
      prewarmedRuns: controlPrewarmedRuns,
      firstCompileLatencyMs: controlFirstCompileStats,
    },
    candidate: {
      query: candidateQuery,
      elapsedMs: candidateElapsedStats,
      resumeCount: stat(candidateResume),
      jitLoadedRuns: candidateLoadedRuns,
      jitRegionsCompiled: stat(candidateJitRegions),
      prewarmSuccesses: stat(candidatePrewarmSuccess),
      prewarmedRuns: candidatePrewarmedRuns,
      firstCompileLatencyMs: candidateFirstCompileStats,
    },
  },
  comparisons: {
    firstCompileMedianPctDelta,
    elapsedMedianPctDelta,
  },
  gates: {
    semantic: {
      description: "both modes must load JIT compiler and complete harness semantics",
      pass: semanticGatePass,
      controlLoadedRuns,
      candidateLoadedRuns,
    },
    engagement: {
      description: "both modes must run resumable execution (resume median > 0)",
      pass: engagementGatePass,
      controlResumeMedian: stat(controlResume).median,
      candidateResumeMedian: stat(candidateResume).median,
    },
    prewarm_config: {
      description: "candidate must be prewarmed, control must not",
      pass: prewarmConfigGatePass,
      controlPrewarmedRuns,
      candidatePrewarmedRuns,
      candidatePrewarmSuccessMedian: stat(candidatePrewarmSuccess).median,
    },
    impact: {
      description: "candidate must improve first compile latency (or non-regress elapsed when latency unavailable)",
      pass: impactGatePass,
      minFirstCompileWinPct,
      maxElapsedRegressionPct,
      firstCompileMedianPctDelta,
      elapsedMedianPctDelta,
    },
  },
};

result.pass = result.gates.semantic.pass && result.gates.engagement.pass && result.gates.prewarm_config.pass && result.gates.impact.pass;
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
' "$control_elapsed_csv" "$candidate_elapsed_csv" "$control_resume_csv" "$candidate_resume_csv" "$control_jit_loaded_csv" "$candidate_jit_loaded_csv" "$control_jit_regions_csv" "$candidate_jit_regions_csv" "$control_prewarm_success_csv" "$candidate_prewarm_success_csv" "$control_prewarmed_csv" "$candidate_prewarmed_csv" "$control_first_compile_csv" "$candidate_first_compile_csv" "$RUNS" "$MIN_FIRST_COMPILE_WIN_PCT" "$MAX_ELAPSED_REGRESSION_PCT" "$OUT_FILE" "$git_commit" "$timestamp_utc" "$ROOTFS_URL" "$GUEST_CMD" "$CONTROL_QUERY" "$CANDIDATE_QUERY"

echo "[bench-prewarm] Summary:"
node -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
function fmt(n, digits = 3) { return Number.isFinite(n) ? n.toFixed(digits) : "n/a"; }
function pct(n) { return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "n/a"; }
console.log(`  control elapsed_med=${fmt(r.modes.control.elapsedMs.median, 0)}ms prewarm_success_med=${fmt(r.modes.control.prewarmSuccesses.median, 0)}`);
console.log(`  candidate elapsed_med=${fmt(r.modes.candidate.elapsedMs.median, 0)}ms prewarm_success_med=${fmt(r.modes.candidate.prewarmSuccesses.median, 0)}`);
console.log(`  first-compile delta=${pct(r.comparisons.firstCompileMedianPctDelta)} elapsed delta=${pct(r.comparisons.elapsedMedianPctDelta)}`);
console.log(`  gates: semantic=${r.gates.semantic.pass} engagement=${r.gates.engagement.pass} prewarm_config=${r.gates.prewarm_config.pass} impact=${r.gates.impact.pass}`);
console.log(`  overall: ${r.pass ? "PASS" : "FAIL"}`);
' "$OUT_FILE"

echo "[bench-prewarm] Output: $OUT_FILE"
