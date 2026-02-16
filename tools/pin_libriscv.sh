#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${FRISCY_PROJECT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOCK_FILE="$SCRIPT_DIR/build-lock.env"
PATCH_FILE="$SCRIPT_DIR/libriscv-emscripten.patch"

if [[ ! -f "$LOCK_FILE" ]]; then
    echo "[pin-libriscv] ERROR: lock file missing: $LOCK_FILE"
    exit 1
fi

# shellcheck disable=SC1090
source "$LOCK_FILE"

if [[ -z "${FRISCY_LIBRISCV_COMMIT:-}" ]]; then
    echo "[pin-libriscv] ERROR: FRISCY_LIBRISCV_COMMIT not set in $LOCK_FILE"
    exit 1
fi

VENDOR_DIR="$PROJECT_DIR/vendor"
TARGET_DIR="$VENDOR_DIR/libriscv"
mkdir -p "$VENDOR_DIR"

# If libriscv is vendored directly (no .git), skip pinning entirely
if [[ -d "$TARGET_DIR" && ! -d "$TARGET_DIR/.git" ]]; then
    echo "[pin-libriscv] libriscv is vendored in-repo (no .git), skipping pin"
    exit 0
fi

if [[ ! -d "$TARGET_DIR/.git" ]]; then
    echo "[pin-libriscv] Cloning libriscv..."
    git clone https://github.com/libriscv/libriscv.git "$TARGET_DIR"
fi

if ! git -C "$TARGET_DIR" cat-file -e "${FRISCY_LIBRISCV_COMMIT}^{commit}" 2>/dev/null; then
    echo "[pin-libriscv] Fetching pinned commit $FRISCY_LIBRISCV_COMMIT..."
    git -C "$TARGET_DIR" fetch --depth=1 origin "$FRISCY_LIBRISCV_COMMIT"
fi

CURRENT="$(git -C "$TARGET_DIR" rev-parse HEAD)"
if [[ "$CURRENT" != "$FRISCY_LIBRISCV_COMMIT" ]]; then
    echo "[pin-libriscv] Checking out pinned commit $FRISCY_LIBRISCV_COMMIT"
    git -C "$TARGET_DIR" checkout --detach "$FRISCY_LIBRISCV_COMMIT"
fi

FINAL="$(git -C "$TARGET_DIR" rev-parse HEAD)"
echo "[pin-libriscv] libriscv pinned at $FINAL"

# Apply friscy-specific patches (Emscripten malloc fix, dispatch optimizations, etc.)
# These patches are REQUIRED for 31-bit arena to work under Emscripten/wasm32.
# Without them, new PageData[] overflows for 2GB+ allocations → OOB in Machine constructor.
if [[ -f "$PATCH_FILE" ]]; then
    echo "[pin-libriscv] Applying friscy patches from $(basename "$PATCH_FILE")..."
    if ! git -C "$TARGET_DIR" apply --check "$PATCH_FILE" 2>/dev/null; then
        echo "[pin-libriscv] Patches already applied or conflict — skipping"
    else
        git -C "$TARGET_DIR" apply "$PATCH_FILE"
        echo "[pin-libriscv] Patches applied successfully"
    fi
else
    echo "[pin-libriscv] WARNING: patch file not found: $PATCH_FILE"
    echo "[pin-libriscv] 31-bit arena will FAIL under Emscripten without the malloc fix!"
fi
