#!/bin/bash
set -euo pipefail

echo "[bench-checkpoint-delta] Gate scaffold is registered but feature toggles are not wired yet."
echo "[bench-checkpoint-delta] Expected A/B toggles: ?checkpointfull=1 vs ?checkpointdelta=1"
echo "[bench-checkpoint-delta] Spec: docs/generated/TEST-SPEC-BENCH-GATES-3-4-5.md"
exit 2
