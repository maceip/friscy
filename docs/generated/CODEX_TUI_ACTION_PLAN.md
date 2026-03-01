# Codex Native + TUI Emergency Action Plan

## TUI Track (Codex)
- Build `codex-tui.tar` from Alpine with `bash`, `ca-certificates`, and real `@openai/codex` installed globally; verify `/usr/local/bin/codex` exists in tar export. OWNER: [ ]
- Add a Codex TUI boot profile that starts `/bin/bash -li` and launches `codex` with no args from the shell (no wrapper command protocol). OWNER: [ ]
- Add Codex no-arg TUI gate: detect first interactive screen draw and prompt/menu text within timeout. OWNER: [ ]
- Add Codex keyboard gate in TUI mode: send `ArrowUp`, `ArrowDown`, and `Enter`, and assert visible state transition in terminal output. OWNER: [ ]
- Add Codex interaction durability gate: run no-arg Codex, exit, relaunch in same guest session, and confirm second launch remains interactive. OWNER: [ ]
- Add Codex checkpoint flow in TUI mode: checkpoint at idle TUI state, restore, and confirm keyboard interaction still works. OWNER: [ ]

## UI Work (Codex)
- Add per-pane run mode selector for Codex: `Ladder Mode` (protocol runner) vs `Native TUI Mode` (raw passthrough). OWNER: [ ]
- Add Codex pane badges: `native-bin`, `tui-mode`, `checkpoint-loaded`, `tier2-active`. OWNER: [ ]
- Add explicit on-screen warning when Codex pane is not using native binary path. OWNER: [ ]
- Add Codex diagnostics panel action: print active entrypoint + binary path from current session for operator verification. OWNER: [ ]
- Add Codex status line updates for key lifecycle points: booting, shell ready, codex launched, tui input accepted, exited. OWNER: [ ]

## Runtime Work (Codex)
- Validate tty behavior for Codex TUI: `isatty`, line discipline, and stdin raw key delivery path in browser worker loop. OWNER: [ ]
- Validate and patch required `ioctl` handling for TUI apps (`TIOCGWINSZ`, related terminal sizing paths) to keep Codex screen rendering stable. OWNER: [ ]
- Validate resize propagation (`rows/cols`) from UI to guest and confirm Codex redraw on terminal resize. OWNER: [ ]
- Stress test fork/exec path under Codex TUI workload (start, interact, exit, relaunch) and fix any runtime restore regressions. OWNER: [ ]
- Validate network path for Codex TUI prompt execution (host-fetch/hypercall lane) with retries and clear surfaced errors. OWNER: [ ]

## Policy / Gate Rules (Codex)
- Codex green status is invalid unless `/usr/local/bin/codex` exists inside shipped tar artifact. OWNER: [ ]
- Codex green status is invalid if entrypoint contains `/usr/local/bin/codex-repl.js` for native claims. OWNER: [ ]
- Codex reports must record exact launch args and active binary path used during test execution. OWNER: [ ]
- Codex gates must include both: (a) native binary command path (`codex --version`, `codex e ...`) and (b) no-arg interactive TUI path. OWNER: [ ]
- Codex checkpoint reports are stale after rootfs/runtime changes; rerun required before claiming green. OWNER: [ ]
- Any Codex failure to show interactive output within timeout is a hard fail, not a soft warning. OWNER: [ ]
