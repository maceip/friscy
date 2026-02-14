#!/bin/bash
# ============================================================================
# build_nodejs_claude_rootfs.sh — Build Claude-enabled nodejs rootfs tar
#
# Creates a new rootfs tar by overlaying @anthropic-ai/claude-code onto an
# existing nodejs rootfs tar and wiring /usr/bin/claude launcher.
#
# Usage:
#   ./tests/build_nodejs_claude_rootfs.sh
#   ./tests/build_nodejs_claude_rootfs.sh <base-nodejs.tar> <out-nodejs-claude.tar>
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_ROOTFS="${1:-$PROJECT_DIR/friscy-bundle/nodejs.tar}"
OUT_ROOTFS="${2:-$PROJECT_DIR/friscy-bundle/nodejs-claude.tar}"
CLAUDE_PKG="${CLAUDE_NPM_PACKAGE:-@anthropic-ai/claude-code}"

if [[ ! -f "$BASE_ROOTFS" ]]; then
    echo "[build-claude-rootfs] ERROR: missing base rootfs: $BASE_ROOTFS"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "[build-claude-rootfs] ERROR: npm is required but not found in PATH"
    exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[build-claude-rootfs] Base rootfs: $BASE_ROOTFS"
echo "[build-claude-rootfs] Output rootfs: $OUT_ROOTFS"
echo "[build-claude-rootfs] NPM package: $CLAUDE_PKG"

echo "[build-claude-rootfs] Downloading Claude package..."
(
    cd "$TMP_DIR"
    npm pack "$CLAUDE_PKG" >/dev/null
)

PKG_TGZ="$(rg --files "$TMP_DIR" | rg '\.tgz$' | head -n 1)"
if [[ -z "$PKG_TGZ" ]]; then
    echo "[build-claude-rootfs] ERROR: npm pack did not produce a tarball"
    exit 1
fi

mkdir -p "$TMP_DIR/unpack"
tar -xzf "$PKG_TGZ" -C "$TMP_DIR/unpack"

OVERLAY="$TMP_DIR/overlay"
PKG_DST="$OVERLAY/usr/lib/node_modules/@anthropic-ai/claude-code"
mkdir -p "$PKG_DST" "$OVERLAY/usr/bin"
cp -a "$TMP_DIR/unpack/package/." "$PKG_DST/"

cat > "$OVERLAY/usr/bin/claude" <<'EOF'
#!/bin/sh
exec /usr/bin/node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js "$@"
EOF
chmod 755 "$OVERLAY/usr/bin/claude"

cp "$BASE_ROOTFS" "$OUT_ROOTFS"
tar --append -f "$OUT_ROOTFS" -C "$OVERLAY" .

if ! tar -tf "$OUT_ROOTFS" 2>/dev/null | rg -q '(^|/)(usr/bin/claude)$'; then
    echo "[build-claude-rootfs] ERROR: output rootfs missing /usr/bin/claude"
    exit 1
fi

SIZE_BYTES="$(stat -c%s "$OUT_ROOTFS")"
SIZE_MB=$((SIZE_BYTES / 1024 / 1024))
echo "[build-claude-rootfs] DONE: $OUT_ROOTFS (${SIZE_MB}MB)"
