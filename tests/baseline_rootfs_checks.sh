#!/bin/bash
# Shared baseline preflight checks for browser smoke tests.
#
# Baseline requirements:
#   1) Node.js workload support (/usr/bin/node present)
#   2) Node.js + Claude workload support:
#      - /usr/bin/claude present
#      - Claude payload present, from either:
#        a) npm package JS bundle under @anthropic-ai/claude-code (js/mjs), or
#        b) native installer bundle under ~/.local/share/claude/versions/*
#           (install source: curl -fsSL https://claude.ai/install.sh | bash)
#
# Size policy:
#   - recommended_claude_payload_bytes is an advisory target (default 60 MiB)
#   - if CLAUDE_PAYLOAD_STRICT=1, target becomes a hard requirement

set -euo pipefail

check_baseline_rootfs() {
    local rootfs="$1"
    local require_claude="${2:-false}"
    local recommended_claude_payload_bytes="${3:-62914560}" # 60 MiB (advisory)
    local strict_size_check="${CLAUDE_PAYLOAD_STRICT:-0}"

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

    local chosen_size=0
    local chosen_kind="none"
    local chosen_path=""
    if (( js_size >= native_size )); then
        chosen_size=$js_size
        chosen_kind="js_bundle"
        chosen_path="$js_path"
    else
        chosen_size=$native_size
        chosen_kind="installer_bundle"
        chosen_path="$native_path"
    fi

    if (( chosen_size <= 0 )); then
        echo "[smoke] ERROR: Claude baseline requires payload files, but none were found."
        echo "[smoke]   Looked for npm JS bundles and installer bundles in rootfs."
        return 1
    fi

    local found_mb=$(( chosen_size / 1024 / 1024 ))
    local recommended_mb=$(( recommended_claude_payload_bytes / 1024 / 1024 ))
    echo "[smoke] Baseline check: Claude payload ${found_mb}MB (${chosen_kind}) at ${chosen_path}"

    if (( recommended_claude_payload_bytes > 0 && chosen_size < recommended_claude_payload_bytes )); then
        if [[ "$strict_size_check" == "1" ]]; then
            echo "[smoke] ERROR: Claude payload below strict target (${found_mb}MB < ${recommended_mb}MB)."
            return 1
        fi
        echo "[smoke] WARN: Claude payload below recommended target (${found_mb}MB < ${recommended_mb}MB). Continuing."
    fi
}
