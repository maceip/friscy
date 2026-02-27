#!/bin/bash
# ============================================================================
# bench_main_path_jit_impact.sh
#
# Impact gate for #1 (main-path JIT activation / resume behavior).
# Compares two query modes over identical workload:
#   - legacy mode (timeslice resume disabled)
#   - enabled mode (timeslice resume enabled)
#
# Harness: tests/test_main_path_jit_activation.mjs
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RUNS=3
ROOTFS_URL="./rootfs.tar"
GUEST_CMD='i=0; while [ $i -lt 200000 ]; do i=$((i+1)); done; echo done'
LEGACY_QUERY='?example=alpine&legacyresume=1&jithot=1&jitawait=1'
ENABLED_QUERY='?example=alpine&jithot=1&jitawait=1'
TEST_TIMEOUT_MS=180000
MIN_JIT_ACTIVITY_SCORE=1
MIN_MEDIAN_WIN_PCT=5
OUT_FILE="$PROJECT_DIR/tests/.perf/main_path_jit_impact.latest.json"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --runs) RUNS="${2:-}"; shift 2 ;;
        --rootfs-url) ROOTFS_URL="${2:-}"; shift 2 ;;
        --cmd) GUEST_CMD="${2:-}"; shift 2 ;;
        --legacy-query) LEGACY_QUERY="${2:-}"; shift 2 ;;
        --enabled-query) ENABLED_QUERY="${2:-}"; shift 2 ;;
        --timeout-ms) TEST_TIMEOUT_MS="${2:-}"; shift 2 ;;
        --min-jit-activity-score) MIN_JIT_ACTIVITY_SCORE="${2:-}"; shift 2 ;;
        --min-median-win-pct) MIN_MEDIAN_WIN_PCT="${2:-}"; shift 2 ;;
        --out) OUT_FILE="${2:-}"; shift 2 ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--runs N] [--rootfs-url URL] [--cmd CMD] [--legacy-query Q] [--enabled-query Q] [--timeout-ms MS] [--min-jit-activity-score N] [--min-median-win-pct PCT] [--out PATH]"
            exit 1
            ;;
    esac
done

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
    echo "[bench-mainpath] ERROR: --runs must be a positive integer"
    exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

echo "[bench-mainpath] Runs: $RUNS"
echo "[bench-mainpath] Rootfs: $ROOTFS_URL"
echo "[bench-mainpath] Command: $GUEST_CMD"
echo "[bench-mainpath] Legacy query: $LEGACY_QUERY"
echo "[bench-mainpath] Enabled query: $ENABLED_QUERY"
echo

legacy_elapsed_values=()
enabled_elapsed_values=()
legacy_done_values=()
enabled_done_values=()
legacy_resume_values=()
enabled_resume_values=()
legacy_jit_activity_values=()
enabled_jit_activity_values=()
legacy_jit_loaded_values=()
enabled_jit_loaded_values=()
legacy_jit_regions_values=()
enabled_jit_regions_values=()

for i in $(seq 1 "$RUNS"); do
    echo "[bench-mainpath] Run ${i}/${RUNS}..."
    LOG_FILE="$(mktemp)"
    if ! (
        cd "$PROJECT_DIR" && \
        FRISCY_TEST_ROOTFS_URL="$ROOTFS_URL" \
        FRISCY_TEST_CMD="$GUEST_CMD" \
        FRISCY_TEST_TIMEOUT_MS="$TEST_TIMEOUT_MS" \
        FRISCY_TEST_LEGACY_QUERY="$LEGACY_QUERY" \
        FRISCY_TEST_ENABLED_QUERY="$ENABLED_QUERY" \
        FRISCY_TEST_REQUIRE_DONE_OUTPUT=0 \
        node ./tests/test_main_path_jit_activation.mjs
    ) >"$LOG_FILE" 2>&1; then
        echo "[bench-mainpath] ERROR: run ${i} failed. Full log:"
        awk '1' "$LOG_FILE"
        rm -f "$LOG_FILE"
        exit 1
    fi

    legacy_elapsed="$(awk -F= '/\[METRIC\] legacy_elapsed_ms=/{print $2; exit}' "$LOG_FILE")"
    enabled_elapsed="$(awk -F= '/\[METRIC\] enabled_elapsed_ms=/{print $2; exit}' "$LOG_FILE")"
    legacy_done="$(awk -F= '/\[METRIC\] legacy_done=/{print $2; exit}' "$LOG_FILE")"
    enabled_done="$(awk -F= '/\[METRIC\] enabled_done=/{print $2; exit}' "$LOG_FILE")"
    legacy_resume="$(awk -F= '/\[METRIC\] legacy_resume_count=/{print $2; exit}' "$LOG_FILE")"
    enabled_resume="$(awk -F= '/\[METRIC\] enabled_resume_count=/{print $2; exit}' "$LOG_FILE")"
    legacy_jit_activity="$(awk -F= '/\[METRIC\] legacy_jit_activity_score=/{print $2; exit}' "$LOG_FILE")"
    enabled_jit_activity="$(awk -F= '/\[METRIC\] enabled_jit_activity_score=/{print $2; exit}' "$LOG_FILE")"
    legacy_jit_loaded="$(awk -F= '/\[METRIC\] legacy_jit_compiler_loaded=/{print $2; exit}' "$LOG_FILE")"
    enabled_jit_loaded="$(awk -F= '/\[METRIC\] enabled_jit_compiler_loaded=/{print $2; exit}' "$LOG_FILE")"
    legacy_jit_regions="$(awk -F= '/\[METRIC\] legacy_jit_regions_compiled=/{print $2; exit}' "$LOG_FILE")"
    enabled_jit_regions="$(awk -F= '/\[METRIC\] enabled_jit_regions_compiled=/{print $2; exit}' "$LOG_FILE")"

    for metric in legacy_elapsed enabled_elapsed legacy_done enabled_done legacy_resume enabled_resume legacy_jit_activity enabled_jit_activity legacy_jit_loaded enabled_jit_loaded legacy_jit_regions enabled_jit_regions; do
        if [[ -z "${!metric}" ]]; then
            echo "[bench-mainpath] ERROR: run ${i} missing metric $metric. Full log:"
            awk '1' "$LOG_FILE"
            rm -f "$LOG_FILE"
            exit 1
        fi
    done

    legacy_elapsed_values+=("$legacy_elapsed")
    enabled_elapsed_values+=("$enabled_elapsed")
    legacy_done_values+=("$legacy_done")
    enabled_done_values+=("$enabled_done")
    legacy_resume_values+=("$legacy_resume")
    enabled_resume_values+=("$enabled_resume")
    legacy_jit_activity_values+=("$legacy_jit_activity")
    enabled_jit_activity_values+=("$enabled_jit_activity")
    legacy_jit_loaded_values+=("$legacy_jit_loaded")
    enabled_jit_loaded_values+=("$enabled_jit_loaded")
    legacy_jit_regions_values+=("$legacy_jit_regions")
    enabled_jit_regions_values+=("$enabled_jit_regions")

    echo "[bench-mainpath] run=${i} enabled_done=${enabled_done} legacy_done=${legacy_done} enabled_elapsed_ms=${enabled_elapsed} legacy_elapsed_ms=${legacy_elapsed} enabled_jit_activity=${enabled_jit_activity}"
    rm -f "$LOG_FILE"
done

legacy_elapsed_csv="$(IFS=,; echo "${legacy_elapsed_values[*]}")"
enabled_elapsed_csv="$(IFS=,; echo "${enabled_elapsed_values[*]}")"
legacy_done_csv="$(IFS=,; echo "${legacy_done_values[*]}")"
enabled_done_csv="$(IFS=,; echo "${enabled_done_values[*]}")"
legacy_resume_csv="$(IFS=,; echo "${legacy_resume_values[*]}")"
enabled_resume_csv="$(IFS=,; echo "${enabled_resume_values[*]}")"
legacy_jit_activity_csv="$(IFS=,; echo "${legacy_jit_activity_values[*]}")"
enabled_jit_activity_csv="$(IFS=,; echo "${enabled_jit_activity_values[*]}")"
legacy_jit_loaded_csv="$(IFS=,; echo "${legacy_jit_loaded_values[*]}")"
enabled_jit_loaded_csv="$(IFS=,; echo "${enabled_jit_loaded_values[*]}")"
legacy_jit_regions_csv="$(IFS=,; echo "${legacy_jit_regions_values[*]}")"
enabled_jit_regions_csv="$(IFS=,; echo "${enabled_jit_regions_values[*]}")"

git_commit="$(cd "$PROJECT_DIR" && git rev-parse HEAD)"
timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

node -e '
const fs = require("fs");

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

function parseCsv(input) {
  return input.split(",").map(Number).filter(Number.isFinite);
}

function pctDelta(current, base) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}

const legacyElapsed = parseCsv(process.argv[1]);
const enabledElapsed = parseCsv(process.argv[2]);
const legacyDone = parseCsv(process.argv[3]);
const enabledDone = parseCsv(process.argv[4]);
const legacyResume = parseCsv(process.argv[5]);
const enabledResume = parseCsv(process.argv[6]);
const legacyJitActivity = parseCsv(process.argv[7]);
const enabledJitActivity = parseCsv(process.argv[8]);
const legacyJitLoaded = parseCsv(process.argv[9]);
const enabledJitLoaded = parseCsv(process.argv[10]);
const legacyJitRegions = parseCsv(process.argv[11]);
const enabledJitRegions = parseCsv(process.argv[12]);
const runs = Number(process.argv[13]);
const minJitActivityScore = Number(process.argv[14]);
const minMedianWinPct = Number(process.argv[15]);
const outFile = process.argv[16];
const commit = process.argv[17];
const timestamp = process.argv[18];
const rootfsUrl = process.argv[19];
const guestCmd = process.argv[20];
const legacyQuery = process.argv[21];
const enabledQuery = process.argv[22];

const legacyDoneRate = legacyDone.length ? legacyDone.reduce((a, b) => a + b, 0) / legacyDone.length : 0;
const enabledDoneRate = enabledDone.length ? enabledDone.reduce((a, b) => a + b, 0) / enabledDone.length : 0;
const legacyResumeStats = stat(legacyResume);
const enabledResumeStats = stat(enabledResume);
const enabledJitLoadedRuns = enabledJitLoaded.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
const enabledJitActivityRuns = enabledJitActivity.reduce((a, b) => a + (b >= minJitActivityScore ? 1 : 0), 0);

const legacyElapsedStats = stat(legacyElapsed);
const enabledElapsedStats = stat(enabledElapsed);
const latencyMedianPctDelta = pctDelta(enabledElapsedStats.median, legacyElapsedStats.median);

const semanticGatePass = Number.isFinite(enabledResumeStats.median) && enabledResumeStats.median > 0;
const jitActivityGatePass = enabledJitLoadedRuns === runs && enabledJitActivityRuns === runs;
const impactGatePass =
  (Number.isFinite(enabledResumeStats.median) && Number.isFinite(legacyResumeStats.median) && enabledResumeStats.median > legacyResumeStats.median) ||
  (enabledDoneRate > legacyDoneRate) ||
  (enabledDoneRate === legacyDoneRate && Number.isFinite(latencyMedianPctDelta) && latencyMedianPctDelta <= -Math.abs(minMedianWinPct));

const result = {
  benchmark: "main_path_jit_impact",
  commit,
  timestampUtc: timestamp,
  rootfsUrl,
  guestCommand: guestCmd,
  runs,
  modes: {
    legacy: {
      query: legacyQuery,
      elapsedMs: legacyElapsedStats,
      doneRate: legacyDoneRate,
      resumeCount: legacyResumeStats,
      jitActivityScore: stat(legacyJitActivity),
      jitLoadedRuns: legacyJitLoaded.reduce((a, b) => a + (b > 0 ? 1 : 0), 0),
      jitRegionsCompiled: stat(legacyJitRegions),
    },
    enabled: {
      query: enabledQuery,
      elapsedMs: enabledElapsedStats,
      doneRate: enabledDoneRate,
      resumeCount: enabledResumeStats,
      jitActivityScore: stat(enabledJitActivity),
      jitLoadedRuns: enabledJitLoadedRuns,
      jitRegionsCompiled: stat(enabledJitRegions),
    },
  },
  comparisons: {
    doneRateDeltaPctPoints: (enabledDoneRate - legacyDoneRate) * 100,
    elapsedMedianPctDelta: latencyMedianPctDelta,
  },
  gates: {
    semantic: {
      description: "enabled mode must perform resumable execution (resumeCount median > 0)",
      pass: semanticGatePass,
      enabledResumeMedian: enabledResumeStats.median,
    },
    jit_activity: {
      description: "enabled mode must show JIT activity score >= threshold on every run",
      pass: jitActivityGatePass,
      threshold: minJitActivityScore,
      enabledJitActivityRuns,
      enabledJitLoadedRuns,
    },
    impact: {
      description: "enabled mode must increase executed resume work and/or improve completion/latency",
      pass: impactGatePass,
      minMedianWinPct,
      legacyResumeMedian: legacyResumeStats.median,
      enabledResumeMedian: enabledResumeStats.median,
      doneRateDeltaPctPoints: (enabledDoneRate - legacyDoneRate) * 100,
      elapsedMedianPctDelta: latencyMedianPctDelta,
    },
  },
};

result.pass = result.gates.semantic.pass && result.gates.jit_activity.pass && result.gates.impact.pass;

fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
' "$legacy_elapsed_csv" "$enabled_elapsed_csv" "$legacy_done_csv" "$enabled_done_csv" "$legacy_resume_csv" "$enabled_resume_csv" "$legacy_jit_activity_csv" "$enabled_jit_activity_csv" "$legacy_jit_loaded_csv" "$enabled_jit_loaded_csv" "$legacy_jit_regions_csv" "$enabled_jit_regions_csv" "$RUNS" "$MIN_JIT_ACTIVITY_SCORE" "$MIN_MEDIAN_WIN_PCT" "$OUT_FILE" "$git_commit" "$timestamp_utc" "$ROOTFS_URL" "$GUEST_CMD" "$LEGACY_QUERY" "$ENABLED_QUERY"

echo "[bench-mainpath] Summary:"
node -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
function fmt(n, digits = 3) { return Number.isFinite(n) ? n.toFixed(digits) : "n/a"; }
function pct(n) { return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "n/a"; }
console.log(`  legacy done_rate=${fmt(r.modes.legacy.doneRate * 100, 1)}% elapsed_med=${fmt(r.modes.legacy.elapsedMs.median, 0)}ms`);
console.log(`  enabled done_rate=${fmt(r.modes.enabled.doneRate * 100, 1)}% elapsed_med=${fmt(r.modes.enabled.elapsedMs.median, 0)}ms`);
console.log(`  done-rate delta=${fmt(r.comparisons.doneRateDeltaPctPoints, 1)}pp elapsed delta=${pct(r.comparisons.elapsedMedianPctDelta)}`);
console.log(`  gates: semantic=${r.gates.semantic.pass} jit_activity=${r.gates.jit_activity.pass} impact=${r.gates.impact.pass}`);
console.log(`  overall: ${r.pass ? "PASS" : "FAIL"}`);
' "$OUT_FILE"

echo "[bench-mainpath] Output: $OUT_FILE"
