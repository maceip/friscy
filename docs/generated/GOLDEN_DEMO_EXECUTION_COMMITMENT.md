# Golden Demo Execution Commitment (2026-02-23)

## User-requested work (committed)
1. Detail custom rootfs for each demo (Alpine, Node, Go).
2. For each of the 3 demos:
   - Boot rootfs in browser.
   - Run interactive verification action(s):
     - Alpine: perform a git operation.
     - Node: run crypto SHA verification command.
     - Go demo: verify server/network behavior.
   - Take checkpoint.
   - Reboot from checkpoint in browser.
   - Re-run action(s) to verify no crash.
   - Take browser-tool checkpoint.
   - Reboot from browser-tool checkpoint.
   - Re-run action one more time to verify no crash.
   - Record wall-clock timing for each span.
3. Investigate networking architecture at high level:
   - Legacy Go WebTransport proxy path.
   - VectorHeart optimized hypercall + host `window.fetch` path.
4. Get networking working on all three demos using optimized hypercall path where feasible.
5. Redo checkpoint ladder with networking action at each checkpoint stage:
   - perform `fetch` / `wget` / `curl https://stare.network` at each checkpoint point.
6. If all green, build optional 4th demo from Node deep checkpoint:
   - Optimize large JS blob startup path for Claude CLI.
   - Verify `claude mcp list` works (no API key required).
   - Then verify `claude -p "write me a haiku"` using provided API key.
   - Take checkpoint after haiku.
   - Reboot from that checkpoint, request limerick, checkpoint as `claude_limmerick`.
   - Record wall-clock timing for all spans.

## Acceptance gates
- No-crash continuity proven for each checkpoint ladder stage.
- Wall-clock timing captured and reported for every boot + command + checkpoint export step.
- Artifact provenance/hashes recorded for all rootfs and checkpoint outputs.
- Run journal updated continuously with commands, outcomes, and blockers.

