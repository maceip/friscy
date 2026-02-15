#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPAT_SCRIPT="$SCRIPT_DIR/runtime_compat_sweep.sh"

if [[ ! -x "$COMPAT_SCRIPT" ]]; then
    echo "[source-sweep] ERROR: missing compat script: $COMPAT_SCRIPT"
    exit 1
fi

OUT_FILE="$PROJECT_DIR/tests/perf/runtime_source_ref_sweep.latest.json"
declare -a SOURCE_REFS
SOURCE_REFS=("HEAD")

declare -a COMPAT_ARGS
COMPAT_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source-ref)
            SOURCE_REFS=()
            shift
            while [[ $# -gt 0 && "$1" != --* ]]; do
                SOURCE_REFS+=("$1")
                shift
            done
            continue
            ;;
        --out)
            OUT_FILE="${2:-}"
            shift 2
            ;;
        --emsdk|--libriscv)
            flag="$1"
            COMPAT_ARGS+=("$flag")
            shift
            while [[ $# -gt 0 && "$1" != --* ]]; do
                COMPAT_ARGS+=("$1")
                shift
            done
            continue
            ;;
        --rootfs-url|--smoke-timeout-sec|--build-timeout-sec|--test-script|--test-query|--test-cmd|--test-expected|--test-wait-for-exit)
            COMPAT_ARGS+=("$1" "${2:-}")
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--source-ref REF1 REF2 ...] [--emsdk V1 V2 ...] [--libriscv R1 R2 ...] [--rootfs-url URL] [--smoke-timeout-sec N] [--build-timeout-sec N] [--test-script PATH] [--test-query QUERY] [--test-cmd CMD] [--test-expected TEXT] [--test-wait-for-exit 0|1] [--out PATH]"
            exit 1
            ;;
    esac
done

mkdir -p "$(dirname "$OUT_FILE")"

tmp_jsonl="$(mktemp)"
declare -a WORKTREES
WORKTREES=()

cleanup() {
    for wt in "${WORKTREES[@]}"; do
        if [[ -d "$wt" ]]; then
            git -C "$PROJECT_DIR" worktree remove "$wt" --force >/dev/null 2>&1 || true
        fi
    done
    rm -f "$tmp_jsonl" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for source_ref in "${SOURCE_REFS[@]}"; do
    worktree_dir="$(mktemp -d "/tmp/friscy-source-sweep.${source_ref//[^a-zA-Z0-9]/_}.XXXX")"
    WORKTREES+=("$worktree_dir")
    echo "[source-sweep] Testing source-ref=$source_ref"

    git -C "$PROJECT_DIR" worktree add --detach "$worktree_dir" "$source_ref" >/dev/null

    if [[ -d "$PROJECT_DIR/node_modules" && ! -e "$worktree_dir/node_modules" ]]; then
        ln -s "$PROJECT_DIR/node_modules" "$worktree_dir/node_modules"
    fi
    if [[ -f "$PROJECT_DIR/friscy-bundle/nodejs-claude.tar" && ! -e "$worktree_dir/friscy-bundle/nodejs-claude.tar" ]]; then
        ln -s "$PROJECT_DIR/friscy-bundle/nodejs-claude.tar" "$worktree_dir/friscy-bundle/nodejs-claude.tar"
    fi
    if [[ -d "$PROJECT_DIR/runtime/emsdk" && ! -e "$worktree_dir/runtime/emsdk" ]]; then
        ln -s "$PROJECT_DIR/runtime/emsdk" "$worktree_dir/runtime/emsdk"
    fi

    compat_out="$worktree_dir/tests/perf/runtime_compat_sweep.source_ref.json"
    mkdir -p "$(dirname "$compat_out")"
    compat_exit=0
    FRISCY_PROJECT_DIR="$worktree_dir" bash "$COMPAT_SCRIPT" "${COMPAT_ARGS[@]}" --out "$compat_out" || compat_exit=$?

    if [[ -f "$compat_out" ]]; then
        SOURCE_REF="$source_ref" COMPAT_EXIT="$compat_exit" node -e '
const fs = require("fs");
const ref = process.env.SOURCE_REF;
const compatExit = Number(process.env.COMPAT_EXIT || "1");
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const result of data.results || []) {
  result.sourceRef = ref;
  result.compatExit = compatExit;
  console.log(JSON.stringify(result));
}
' "$compat_out" >> "$tmp_jsonl"
    else
        SOURCE_REF="$source_ref" COMPAT_EXIT="$compat_exit" node -e '
const ref = process.env.SOURCE_REF;
const compatExit = Number(process.env.COMPAT_EXIT || "1");
console.log(JSON.stringify({
  sourceRef: ref,
  compatExit,
  status: "compat_run_failed",
  reason: "missing_compat_output"
}));
' >> "$tmp_jsonl"
    fi

    git -C "$PROJECT_DIR" worktree remove "$worktree_dir" --force >/dev/null 2>&1 || true
done

node -e '
const fs = require("fs");
const out = process.argv[1];
const commit = process.argv[2];
const timestamp = process.argv[3];
const rows = fs.readFileSync(process.argv[4], "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const payload = {
  benchmark: "runtime_source_ref_sweep",
  commit,
  timestampUtc: timestamp,
  results: rows
};
fs.writeFileSync(out, JSON.stringify(payload, null, 2));
' "$OUT_FILE" "$(git -C "$PROJECT_DIR" rev-parse HEAD)" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$tmp_jsonl"

echo "[source-sweep] Wrote $OUT_FILE"
if rg -n "\"status\": \"pass\"|\"status\":\"pass\"" "$OUT_FILE" >/dev/null; then
    echo "[source-sweep] At least one source ref produced a pass."
    exit 0
fi
echo "[source-sweep] No passing source refs found."
exit 1
