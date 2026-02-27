#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_DIR="$ROOT_DIR/docs_site"
BASE_ROOTFS="${1:-$DOCS_DIR/rootfs.tar}"
NODE_TARBALL="${2:-$ROOT_DIR/nodejs-25.5.0-riscv64-linux.tar.gz}"
OUT_TAR="${3:-$DOCS_DIR/nodejs.tar}"

log() { printf '[nodejs-local-rootfs] %s\n' "$*"; }
fail() { printf '[nodejs-local-rootfs] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$BASE_ROOTFS" ]] || fail "missing base rootfs: $BASE_ROOTFS"
[[ -f "$NODE_TARBALL" ]] || fail "missing node tarball: $NODE_TARBALL"

TMPDIR="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

log "extract base rootfs: $BASE_ROOTFS"
tar -xf "$BASE_ROOTFS" -C "$TMPDIR"

log "extract node tarball: $NODE_TARBALL"
tar -xzf "$NODE_TARBALL" -C "$TMPDIR/opt"

NODE_DIR_NAME="$(tar -tzf "$NODE_TARBALL" | awk -F/ 'NR==1{print $1; exit}')"
NODE_DIR="/opt/$NODE_DIR_NAME"

mkdir -p "$TMPDIR/usr/bin"
ln -sf "$NODE_DIR/bin/node" "$TMPDIR/usr/bin/node"
ln -sf "$NODE_DIR/bin/npm" "$TMPDIR/usr/bin/npm"
ln -sf "$NODE_DIR/bin/npx" "$TMPDIR/usr/bin/npx"
ln -sf "$NODE_DIR/bin/corepack" "$TMPDIR/usr/bin/corepack"

log "pack output: $OUT_TAR"
tar --numeric-owner --owner=0 --group=0 -cf "$OUT_TAR" -C "$TMPDIR" .

if cp "$OUT_TAR" "$ROOT_DIR/friscy-bundle/nodejs.tar" 2>/dev/null; then
  log "copied to friscy-bundle/nodejs.tar"
else
  log "skipped copy to friscy-bundle/nodejs.tar (permission denied or missing)"
fi

sha256sum "$OUT_TAR"
log "done"
