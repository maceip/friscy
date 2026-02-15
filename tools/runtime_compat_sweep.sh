#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${FRISCY_PROJECT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
RUNTIME_DIR="$PROJECT_DIR/runtime"
EMSDK_DIR="$RUNTIME_DIR/emsdk"
LOCK_FILE="$SCRIPT_DIR/build-lock.env"
PIN_SCRIPT="$SCRIPT_DIR/pin_libriscv.sh"

if [[ ! -f "$LOCK_FILE" ]]; then
    echo "[compat-sweep] ERROR: lock file missing: $LOCK_FILE"
    exit 1
fi

# shellcheck disable=SC1090
source "$LOCK_FILE"

if [[ -z "${FRISCY_LIBRISCV_COMMIT:-}" ]]; then
    echo "[compat-sweep] ERROR: FRISCY_LIBRISCV_COMMIT missing in $LOCK_FILE"
    exit 1
fi

if [[ -z "${FRISCY_EMSDK_VERSION:-}" ]]; then
    echo "[compat-sweep] ERROR: FRISCY_EMSDK_VERSION missing in $LOCK_FILE"
    exit 1
fi

ROOTFS_URL="./nodejs-claude.tar"
SMOKE_TIMEOUT_SEC=120
BUILD_TIMEOUT_SEC=900
OUT_FILE="$PROJECT_DIR/tests/perf/runtime_compat_sweep.latest.json"
TEST_SCRIPT="$PROJECT_DIR/tests/test_claude_version.js"
TEST_QUERY=""
TEST_CMD=""
TEST_EXPECTED=""
TEST_WAIT_FOR_EXIT=""

declare -a EMSDK_VERSIONS
declare -a LIBRISCV_REFS

# Defaults are intentionally small for a quick signal.
EMSDK_VERSIONS=("$FRISCY_EMSDK_VERSION")
LIBRISCV_REFS=("$FRISCY_LIBRISCV_COMMIT")

while [[ $# -gt 0 ]]; do
    case "$1" in
        --emsdk)
            EMSDK_VERSIONS=()
            shift
            while [[ $# -gt 0 && "$1" != --* ]]; do
                EMSDK_VERSIONS+=("$1")
                shift
            done
            continue
            ;;
        --libriscv)
            LIBRISCV_REFS=()
            shift
            while [[ $# -gt 0 && "$1" != --* ]]; do
                LIBRISCV_REFS+=("$1")
                shift
            done
            continue
            ;;
        --rootfs-url)
            ROOTFS_URL="${2:-}"
            shift 2
            ;;
        --smoke-timeout-sec)
            SMOKE_TIMEOUT_SEC="${2:-}"
            shift 2
            ;;
        --build-timeout-sec)
            BUILD_TIMEOUT_SEC="${2:-}"
            shift 2
            ;;
        --out)
            OUT_FILE="${2:-}"
            shift 2
            ;;
        --test-script)
            TEST_SCRIPT="${2:-}"
            shift 2
            ;;
        --test-query)
            TEST_QUERY="${2:-}"
            shift 2
            ;;
        --test-cmd)
            TEST_CMD="${2:-}"
            shift 2
            ;;
        --test-expected)
            TEST_EXPECTED="${2:-}"
            shift 2
            ;;
        --test-wait-for-exit)
            TEST_WAIT_FOR_EXIT="${2:-}"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--emsdk V1 V2 ...] [--libriscv REF1 REF2 ...] [--rootfs-url URL] [--smoke-timeout-sec N] [--build-timeout-sec N] [--test-script PATH] [--test-query QUERY] [--test-cmd CMD] [--test-expected TEXT] [--test-wait-for-exit 0|1] [--out PATH]"
            exit 1
            ;;
    esac
done

if [[ "${#EMSDK_VERSIONS[@]}" -eq 0 ]]; then
    echo "[compat-sweep] ERROR: at least one emsdk version is required"
    exit 1
fi

if [[ "${#LIBRISCV_REFS[@]}" -eq 0 ]]; then
    echo "[compat-sweep] ERROR: at least one libriscv ref is required"
    exit 1
fi

if ! [[ "$SMOKE_TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$SMOKE_TIMEOUT_SEC" -lt 1 ]]; then
    echo "[compat-sweep] ERROR: --smoke-timeout-sec must be a positive integer"
    exit 1
fi

if ! [[ "$BUILD_TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$BUILD_TIMEOUT_SEC" -lt 1 ]]; then
    echo "[compat-sweep] ERROR: --build-timeout-sec must be a positive integer"
    exit 1
fi

if [[ ! -d "$EMSDK_DIR" ]]; then
    echo "[compat-sweep] ERROR: emsdk not found at $EMSDK_DIR"
    exit 1
fi

if [[ ! -f "$TEST_SCRIPT" ]]; then
    echo "[compat-sweep] ERROR: test script not found: $TEST_SCRIPT"
    exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

BUNDLE_JS="$PROJECT_DIR/friscy-bundle/friscy.js"
BUNDLE_WASM="$PROJECT_DIR/friscy-bundle/friscy.wasm"
if [[ ! -f "$BUNDLE_JS" || ! -f "$BUNDLE_WASM" ]]; then
    echo "[compat-sweep] ERROR: bundled runtime artifacts missing"
    exit 1
fi

ORIG_JS="$(mktemp)"
ORIG_WASM="$(mktemp)"
cp "$BUNDLE_JS" "$ORIG_JS"
cp "$BUNDLE_WASM" "$ORIG_WASM"

cleanup() {
    cp "$ORIG_JS" "$BUNDLE_JS" || true
    cp "$ORIG_WASM" "$BUNDLE_WASM" || true
    rm -f "$ORIG_JS" "$ORIG_WASM" || true
    # Restore pinned default ref as post-condition.
    if [[ -x "$PIN_SCRIPT" ]]; then
        bash "$PIN_SCRIPT" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

if [[ ! -d "$PROJECT_DIR/vendor/libriscv/.git" ]]; then
    bash "$PIN_SCRIPT" >/dev/null
fi

declare -a RESULTS

for emsdk_version in "${EMSDK_VERSIONS[@]}"; do
    for libriscv_ref in "${LIBRISCV_REFS[@]}"; do
        echo "[compat-sweep] Testing emsdk=$emsdk_version libriscv=$libriscv_ref"

        build_log="$(mktemp)"
        smoke_log="$(mktemp)"
        status="unknown"
        reason=""
        smoke_exit_code=-1
        build_exit_code=0

        (
            cd "$PROJECT_DIR/vendor/libriscv"
            git fetch --tags --quiet >/dev/null 2>&1 || true
            git fetch origin "$libriscv_ref" --quiet >/dev/null 2>&1 || true
            git checkout --detach "$libriscv_ref"
        ) >/dev/null 2>&1 || {
            status="setup_fail"
            reason="libriscv_checkout_failed"
            build_exit_code=1
        }

        if [[ "$status" == "unknown" ]]; then
            (
                cd "$EMSDK_DIR"
                ./emsdk install "$emsdk_version"
                ./emsdk activate "$emsdk_version"
            ) >/dev/null 2>&1 || {
                status="setup_fail"
                reason="emsdk_activate_failed"
                build_exit_code=1
            }
        fi

        if [[ "$status" == "unknown" ]]; then
            rm -rf "$RUNTIME_DIR/build"
            mkdir -p "$RUNTIME_DIR/build"
            if ! timeout "${BUILD_TIMEOUT_SEC}s" bash -lc "cd \"$RUNTIME_DIR/build\" && source \"$EMSDK_DIR/emsdk_env.sh\" >/dev/null && emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DFRISCY_PRODUCTION=OFF -DFRISCY_WIZER=OFF && emmake make -j\$(nproc)" >"$build_log" 2>&1; then
                status="build_fail"
                reason="runtime_build_failed"
                build_exit_code=1
            fi
        fi

        if [[ "$status" == "unknown" ]]; then
            cp "$RUNTIME_DIR/build/friscy.js" "$BUNDLE_JS"
            cp "$RUNTIME_DIR/build/friscy.wasm" "$BUNDLE_WASM"

            smoke_cmd=(env FRISCY_TEST_ROOTFS_URL="$ROOTFS_URL")
            if [[ -n "$TEST_QUERY" ]]; then
                smoke_cmd+=(FRISCY_TEST_QUERY="$TEST_QUERY")
            fi
            if [[ -n "$TEST_CMD" ]]; then
                smoke_cmd+=(FRISCY_TEST_CLAUDE_CMD="$TEST_CMD")
            fi
            if [[ -n "$TEST_EXPECTED" ]]; then
                smoke_cmd+=(FRISCY_TEST_EXPECTED_OUTPUT="$TEST_EXPECTED")
            fi
            if [[ -n "$TEST_WAIT_FOR_EXIT" ]]; then
                smoke_cmd+=(FRISCY_TEST_WAIT_FOR_EXIT="$TEST_WAIT_FOR_EXIT")
            fi
            smoke_cmd+=(node --experimental-default-type=module "$TEST_SCRIPT")

            if timeout "${SMOKE_TIMEOUT_SEC}s" "${smoke_cmd[@]}" >"$smoke_log" 2>&1; then
                status="pass"
                reason="ok"
                smoke_exit_code=0
            else
                status="smoke_fail"
                reason="claude_version_smoke_failed"
                smoke_exit_code=1
            fi
        fi

        if [[ "$status" != "pass" ]]; then
            # Keep summary compact but actionable.
            sig="$(rg -n "memory access out of bounds|MachineException|\\[FAIL\\]|Process exited|WASM_LEGACY_EXCEPTIONS|error:" "$build_log" "$smoke_log" -m 3 | tr '\n' ';' || true)"
            if [[ -n "$sig" ]]; then
                reason="${reason}:${sig}"
            fi
        fi

        RESULTS+=("{\"emsdk\":\"$emsdk_version\",\"libriscv\":\"$libriscv_ref\",\"status\":\"$status\",\"reason\":$(printf '%s' "$reason" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"buildExit\":$build_exit_code,\"smokeExit\":$smoke_exit_code}")

        rm -f "$build_log" "$smoke_log"
    done
done

timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
git_commit="$(git -C "$PROJECT_DIR" rev-parse HEAD)"

{
    echo "{"
    echo "  \"benchmark\": \"runtime_compat_sweep\","
    echo "  \"commit\": \"$git_commit\","
    echo "  \"timestampUtc\": \"$timestamp_utc\","
    echo "  \"rootfsUrl\": \"${ROOTFS_URL}\","
    echo "  \"testScript\": \"${TEST_SCRIPT}\","
    echo "  \"testQuery\": $(printf '%s' "$TEST_QUERY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),"
    echo "  \"testCommand\": $(printf '%s' "$TEST_CMD" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),"
    echo "  \"testExpected\": $(printf '%s' "$TEST_EXPECTED" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),"
    echo "  \"testWaitForExit\": $(printf '%s' "$TEST_WAIT_FOR_EXIT" | python3 -c 'import json,sys; s=sys.stdin.read(); print(json.dumps(s if s else None))'),"
    echo "  \"results\": ["
    for i in "${!RESULTS[@]}"; do
        if [[ "$i" -gt 0 ]]; then
            echo "    ,${RESULTS[$i]}"
        else
            echo "    ${RESULTS[$i]}"
        fi
    done
    echo "  ]"
    echo "}"
} >"$OUT_FILE"

echo "[compat-sweep] Wrote $OUT_FILE"

if rg -n "\"status\":\"pass\"" "$OUT_FILE" >/dev/null; then
    echo "[compat-sweep] At least one combo passed."
    exit 0
fi

echo "[compat-sweep] No passing combinations found."
exit 1
