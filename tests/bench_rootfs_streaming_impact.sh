#!/bin/bash
set -euo pipefail

echo "[bench-streaming] Gate scaffold is registered but feature toggles are not wired yet."
echo "[bench-streaming] Expected A/B toggles: ?nostreamrootfs=1 vs ?streamrootfs=1"
echo "[bench-streaming] Spec: docs/generated/TEST-SPEC-BENCH-GATES-3-4-5.md"
exit 2
