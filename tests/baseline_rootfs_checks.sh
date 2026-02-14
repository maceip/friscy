#!/bin/bash
# Shared baseline preflight checks for browser smoke tests.
#
# Baseline requirements:
#   1) Node.js workload support (/usr/bin/node present)
#   2) Node.js + Claude workload support:
#      - /usr/bin/claude present
#      - Claude payload >= MIN_CLAUDE_JS_BYTES, from either:
#        a) npm package JS bundle under @anthropic-ai/claude-code (js/mjs), or
#        b) native installer bundle under ~/.local/share/claude/versions/*
#           (install source: curl -fsSL https://claude.ai/install.sh | bash)

set -euo pipefail

check_baseline_rootfs() {
    local rootfs="$1"
    local require_claude="${2:-false}"
    local min_claude_js_bytes="${3:-62914560}" # 60 MiB

    if [[ ! -f "$rootfs" ]]; then
        echo "[smoke] ERROR: missing rootfs: $rootfs"
        return 1
    fi

    if ! tar -tf "$rootfs" 2>/dev/null | rg -q '(^|/)(usr/bin/node)$'; then
        echo "[smoke] ERROR: baseline requires /usr/bin/node in rootfs"
        return 1
    fi

    if [[ "$require_claude" != "true" ]]; then
        return 0
    fi

    if ! tar -tf "$rootfs" 2>/dev/null | rg -q '(^|/)(usr/bin/claude)$'; then
        echo "[smoke] ERROR: baseline requires /usr/bin/claude in rootfs"
        return 1
    fi

    local largest_js
    largest_js="$(tar -tvf "$rootfs" 2>/dev/null | awk '
        {
            size=$3;
            path=$NF;
            if (path ~ /@anthropic-ai\/claude-code/ && path ~ /\.(js|mjs)$/) {
                if (size > max_size) {
                    max_size = size;
                    max_path = path;
                }
            }
        }
        END {
            if (max_size > 0) {
                printf "%s\t%s\n", max_size, max_path;
            }
        }
    ')"

    local largest_native
    largest_native="$(tar -tvf "$rootfs" 2>/dev/null | awk '
        {
            size=$3;
            path=$NF;
            if (path ~ /\/\.local\/share\/claude\/versions\//) {
                if (size > max_size) {
                    max_size = size;
                    max_path = path;
                }
            }
        }
        END {
            if (max_size > 0) {
                printf "%s\t%s\n", max_size, max_path;
            }
        }
    ')"

    local js_size=0 js_path=""
    if [[ -n "$largest_js" ]]; then
        js_size="${largest_js%%$'\t'*}"
        js_path="${largest_js#*$'\t'}"
    fi

    local native_size=0 native_path=""
    if [[ -n "$largest_native" ]]; then
        native_size="${largest_native%%$'\t'*}"
        native_path="${largest_native#*$'\t'}"
    fi

    local required_mb=$(( min_claude_js_bytes / 1024 / 1024 ))
    if (( js_size >= min_claude_js_bytes )); then
        local found_mb=$(( js_size / 1024 / 1024 ))
        echo "[smoke] Baseline check: Claude JS payload ${found_mb}MB at ${js_path}"
        return 0
    fi

    if (( native_size >= min_claude_js_bytes )); then
        local found_mb=$(( native_size / 1024 / 1024 ))
        echo "[smoke] Baseline check: Claude installer bundle ${found_mb}MB at ${native_path}"
        return 0
    fi

    local js_mb=$(( js_size / 1024 / 1024 ))
    local native_mb=$(( native_size / 1024 / 1024 ))
    echo "[smoke] ERROR: Claude baseline not met."
    echo "[smoke]   Need >= ${required_mb}MB payload (JS bundle or installer bundle)."
    echo "[smoke]   Found JS bundle: ${js_mb}MB ${js_path:-<none>}"
    echo "[smoke]   Found installer bundle: ${native_mb}MB ${native_path:-<none>}"
    return 1
}
