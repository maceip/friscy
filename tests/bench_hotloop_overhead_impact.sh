#!/bin/bash
set -euo pipefail

echo "[bench-hotloop] Gate scaffold is registered but feature toggles are not wired yet."
echo "[bench-hotloop] Expected A/B toggles: ?legacyhotloop=1 vs ?eventloophot=1"
echo "[bench-hotloop] Spec: docs/generated/TEST-SPEC-BENCH-GATES-3-4-5.md"
exit 2
