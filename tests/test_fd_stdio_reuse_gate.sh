#!/usr/bin/env bash
set -euo pipefail

# Regression gate: stdio fd reuse after explicit close must work.
# If fd=0 is closed and then /dev/null is opened, Linux semantics require
# reuse of the lowest available fd (0). Shell redirection depends on this.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FRISCY_COMMAND='/bin/sh -lc "exec 0<&-; exec </dev/null; echo hi"' \
  node tests/verify_process_proof.mjs

