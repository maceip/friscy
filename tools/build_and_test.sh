#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

NATIVE=0
REBUILD_RUNTIME=0
KEEP_RUNTIME_ON_FAIL=0
RUN_HAIKU=0
RUN_SYNTH_STREAM=0
ROOTFS_URL="./nodejs-claude.tar"
HAIKU_QUERY="?proxy=https://78.141.219.102:4433/connect"
SYNTH_BUNDLE_MB="6"
BUNDLE_JS="$PROJECT_DIR/friscy-bundle/friscy.js"
BUNDLE_WASM="$PROJECT_DIR/friscy-bundle/friscy.wasm"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --native)
            NATIVE=1
            shift
            ;;
        --rebuild-runtime)
            REBUILD_RUNTIME=1
            shift
            ;;
        --keep-runtime-on-fail)
            KEEP_RUNTIME_ON_FAIL=1
            shift
            ;;
        --haiku)
            RUN_HAIKU=1
            shift
            ;;
        --synthetic-stream)
            RUN_SYNTH_STREAM=1
            shift
            ;;
        --rootfs-url)
            ROOTFS_URL="${2:-}"
            shift 2
            ;;
        --haiku-query)
            HAIKU_QUERY="${2:-}"
            shift 2
            ;;
        --synthetic-bundle-mb)
            SYNTH_BUNDLE_MB="${2:-}"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--rebuild-runtime] [--native] [--keep-runtime-on-fail] [--haiku] [--synthetic-stream] [--rootfs-url URL] [--haiku-query QUERY] [--synthetic-bundle-mb N]"
            exit 1
            ;;
    esac
done

if [[ ! -f "$BUNDLE_JS" || ! -f "$BUNDLE_WASM" ]]; then
    echo "[build-and-test] ERROR: bundled runtime artifacts missing"
    exit 1
fi

ORIG_JS="$(mktemp)"
ORIG_WASM="$(mktemp)"
cp "$BUNDLE_JS" "$ORIG_JS"
cp "$BUNDLE_WASM" "$ORIG_WASM"

restore_bundle_artifacts() {
    cp "$ORIG_JS" "$BUNDLE_JS"
    cp "$ORIG_WASM" "$BUNDLE_WASM"
}

cleanup() {
    rm -f "$ORIG_JS" "$ORIG_WASM"
}
trap cleanup EXIT

runtime_swapped=0

if [[ "$REBUILD_RUNTIME" == "1" ]]; then
    echo "[build-and-test] Rebuilding runtime artifacts"
    if [[ "$NATIVE" == "1" ]]; then
        bash "$SCRIPT_DIR/harness.sh" --native
    else
        bash "$SCRIPT_DIR/harness.sh"
    fi

    if [[ ! -f "$PROJECT_DIR/runtime/build/friscy.js" || ! -f "$PROJECT_DIR/runtime/build/friscy.wasm" ]]; then
        echo "[build-and-test] ERROR: runtime/build artifacts missing after rebuild"
        exit 1
    fi

    cp "$PROJECT_DIR/runtime/build/friscy.js" "$BUNDLE_JS"
    cp "$PROJECT_DIR/runtime/build/friscy.wasm" "$BUNDLE_WASM"
    runtime_swapped=1
else
    echo "[build-and-test] Using checked-in bundled runtime artifacts"
fi

echo "[build-and-test] Running claude --version smoke"
if ! (
    cd "$PROJECT_DIR"
    FRISCY_TEST_ROOTFS_URL="$ROOTFS_URL" \
    node --experimental-default-type=module ./tests/test_claude_version.js
); then
    if [[ "$runtime_swapped" == "1" && "$KEEP_RUNTIME_ON_FAIL" == "0" ]]; then
        echo "[build-and-test] Runtime smoke failed; restoring bundled runtime artifacts"
        restore_bundle_artifacts
    fi
    exit 1
fi

if [[ "$RUN_HAIKU" == "1" ]]; then
    echo "[build-and-test] Running claude haiku workload"
    if ! (
        cd "$PROJECT_DIR"
        FRISCY_TEST_ROOTFS_URL="$ROOTFS_URL" \
        FRISCY_TEST_QUERY="$HAIKU_QUERY" \
        node --experimental-default-type=module ./tests/test_claude_haiku.js
    ); then
        if [[ "$runtime_swapped" == "1" && "$KEEP_RUNTIME_ON_FAIL" == "0" ]]; then
            echo "[build-and-test] Haiku test failed; restoring bundled runtime artifacts"
            restore_bundle_artifacts
        fi
        exit 1
    fi
fi

if [[ "$RUN_SYNTH_STREAM" == "1" ]]; then
    echo "[build-and-test] Running synthetic streaming workload"
    if ! (
        cd "$PROJECT_DIR"
        FRISCY_TEST_ROOTFS_URL="$ROOTFS_URL" \
        FRISCY_TEST_SYNTH_BUNDLE_MB="$SYNTH_BUNDLE_MB" \
        node --experimental-default-type=module ./tests/test_synthetic_streaming_workload.js
    ); then
        if [[ "$runtime_swapped" == "1" && "$KEEP_RUNTIME_ON_FAIL" == "0" ]]; then
            echo "[build-and-test] Synthetic stream test failed; restoring bundled runtime artifacts"
            restore_bundle_artifacts
        fi
        exit 1
    fi
fi

echo "[build-and-test] Completed"
