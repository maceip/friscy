#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_DIR="$ROOT_DIR/docs_site"
PORT="${PORT:-9095}"

log() { printf '[golden-harness] %s\n' "$*"; }
fail() { printf '[golden-harness] ERROR: %s\n' "$*" >&2; exit 1; }

require_file() {
  local f="$1"
  [[ -f "$f" ]] || fail "missing file: $f"
}

verify_assets() {
  require_file "$DOCS_DIR/friscy.js"
  require_file "$DOCS_DIR/friscy.wasm"
  require_file "$DOCS_DIR/worker.js"
  require_file "$DOCS_DIR/jit_manager.js"
  require_file "$DOCS_DIR/rootfs.tar"
  require_file "$DOCS_DIR/nodejs.tar"
  require_file "$DOCS_DIR/goserver.tar"
  require_file "$DOCS_DIR/alpine-bash.ckpt"
  require_file "$DOCS_DIR/node-stdin.ckpt"
  log 'asset verification: OK'
}

hash_assets() {
  verify_assets
  log 'asset hashes:'
  sha256sum \
    "$DOCS_DIR/rootfs.tar" \
    "$DOCS_DIR/nodejs.tar" \
    "$DOCS_DIR/goserver.tar" \
    "$DOCS_DIR/alpine-bash.ckpt" \
    "$DOCS_DIR/node-stdin.ckpt" \
    "$DOCS_DIR/claude-repl.ckpt" 2>/dev/null || true
}

build_alpine_rootfs() {
  (cd "$ROOT_DIR" && docker buildx build --platform linux/riscv64 -f tools/Dockerfile.golden-alpine-dev -t friscy-golden-alpine-dev . --load)
  local cid
  cid="$(docker create friscy-golden-alpine-dev)"
  docker export "$cid" > "$DOCS_DIR/rootfs.tar"
  docker rm "$cid" >/dev/null
  if cp "$DOCS_DIR/rootfs.tar" "$ROOT_DIR/friscy-bundle/rootfs.tar" 2>/dev/null; then
    log 'rebuilt docs_site/rootfs.tar and friscy-bundle/rootfs.tar (golden-alpine-dev)'
  else
    log 'rebuilt docs_site/rootfs.tar (golden-alpine-dev); skipped friscy-bundle/rootfs.tar copy (permission denied)'
  fi
}

build_nodejs_rootfs() {
  (cd "$ROOT_DIR" && docker buildx build --platform linux/riscv64 -f tools/Dockerfile.golden-nodejs -t friscy-golden-nodejs . --load)
  local cid
  cid="$(docker create friscy-golden-nodejs)"
  docker export "$cid" > "$DOCS_DIR/nodejs.tar"
  docker rm "$cid" >/dev/null
  log 'rebuilt docs_site/nodejs.tar'
}

build_goserver_rootfs() {
  (cd "$ROOT_DIR" && docker buildx build --platform linux/riscv64 -f tools/Dockerfile.golden-goserver -t friscy-golden-goserver . --load)
  local cid
  cid="$(docker create friscy-golden-goserver)"
  docker export "$cid" > "$DOCS_DIR/goserver.tar"
  docker rm "$cid" >/dev/null
  log 'rebuilt docs_site/goserver.tar'
}

build_node_stdin_checkpoint() {
  local out="${1:-$DOCS_DIR/node-stdin.ckpt}"
  local friscy_bin="$ROOT_DIR/build-native/friscy"
  [[ -x "$friscy_bin" ]] || fail "missing native runtime binary: $friscy_bin"
  local js
  js='const fs=require("fs");process.stdout.write("READY\n");const b=Buffer.alloc(1);while(true){const n=fs.readSync(0,b,0,1,null);if(n<=0)break;if(b[0]===10){process.stdout.write("OK\n");break;}}'
  (cd "$ROOT_DIR" && "$friscy_bin" \
    --rootfs docs_site/nodejs.tar \
    --export-checkpoint "$out" \
    /usr/bin/node --jitless -e "$js")
  log "rebuilt $out"
}

export_claude_checkpoint() {
  local out="${1:-$DOCS_DIR/claude-repl.ckpt}"
  local p="${2:-9090}"
  (cd "$ROOT_DIR" && node tools/export-checkpoint-browser.mjs --out "$out" --port "$p")
  log "exported checkpoint: $out"
}

serve_demo() {
  (cd "$ROOT_DIR" && node golden_demo/serve.js "$PORT")
}

usage() {
  cat <<USAGE
Usage: golden_demo/harness.sh <command>

Commands:
  verify-assets
  hash-assets
  build-alpine-rootfs
  build-nodejs-rootfs
  build-goserver-rootfs
  build-node-stdin-checkpoint [out_path]
  export-claude-checkpoint [out_path] [port]
  serve [PORT=9095]
USAGE
}

cmd="${1:-}"
case "$cmd" in
  verify-assets) verify_assets ;;
  hash-assets) hash_assets ;;
  build-alpine-rootfs) build_alpine_rootfs ;;
  build-nodejs-rootfs) build_nodejs_rootfs ;;
  build-goserver-rootfs) build_goserver_rootfs ;;
  build-node-stdin-checkpoint)
    shift
    build_node_stdin_checkpoint "${1:-}"
    ;;
  export-claude-checkpoint)
    shift
    export_claude_checkpoint "${1:-}" "${2:-}"
    ;;
  serve) serve_demo ;;
  *) usage; exit 1 ;;
esac
