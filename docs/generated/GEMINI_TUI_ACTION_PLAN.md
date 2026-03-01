# Gemini Native + TUI Emergency Action Plan

## TUI Track (Gemini)
- Build `gemini-tui.tar` from Alpine with `bash`, `ca-certificates`, and real `@google/gemini-cli` installed globally; verify `/usr/local/bin/gemini` exists in tar export. OWNER: [ ]
- Add a Gemini TUI boot profile that starts `/bin/bash -li` and launches `gemini` with no args from the shell (no wrapper command protocol). OWNER: [ ]
- Add Gemini no-arg TUI gate: detect first interactive screen draw and prompt/menu text within timeout. OWNER: [ ]
- Add Gemini keyboard gate in TUI mode: send `ArrowUp`, `ArrowDown`, and `Enter`, and assert visible state transition in terminal output. OWNER: [ ]
- Add Gemini interaction durability gate: run no-arg Gemini, exit, relaunch in same guest session, and confirm second launch remains interactive. OWNER: [ ]
- Add Gemini checkpoint flow in TUI mode: checkpoint at idle TUI state, restore, and confirm keyboard interaction still works. OWNER: [ ]

## UI Work (Gemini)
- Add per-pane run mode selector for Gemini: `Ladder Mode` (protocol runner) vs `Native TUI Mode` (raw passthrough). OWNER: [ ]
- Add Gemini pane badges: `native-bin`, `tui-mode`, `checkpoint-loaded`, `tier2-active`. OWNER: [ ]
- Add explicit on-screen warning when Gemini pane is not using native binary path. OWNER: [ ]
- Add Gemini diagnostics panel action: print active entrypoint + binary path from current session for operator verification. OWNER: [ ]
- Add Gemini status line updates for key lifecycle points: booting, shell ready, gemini launched, tui input accepted, exited. OWNER: [ ]

## Runtime Work (Gemini)
- Validate tty behavior for Gemini TUI: `isatty`, line discipline, and stdin raw key delivery path in browser worker loop. OWNER: [ ]
- Validate and patch required `ioctl` handling for TUI apps (`TIOCGWINSZ`, related terminal sizing paths) to keep Gemini screen rendering stable. OWNER: [ ]
- Validate resize propagation (`rows/cols`) from UI to guest and confirm Gemini redraw on terminal resize. OWNER: [ ]
- Stress test fork/exec path under Gemini TUI workload (start, interact, exit, relaunch) and fix any runtime restore regressions. OWNER: [ ]
- Validate network path for Gemini TUI prompt execution (host-fetch/hypercall lane) with retries and clear surfaced errors. OWNER: [ ]

## Policy / Gate Rules (Gemini)
- Gemini green status is invalid unless `/usr/local/bin/gemini` exists inside shipped tar artifact. OWNER: [ ]
- Gemini green status is invalid if entrypoint contains `/usr/local/bin/gemini-repl.js` for native claims. OWNER: [ ]
- Gemini reports must record exact launch args and active binary path used during test execution. OWNER: [ ]
- Gemini gates must include both: (a) native binary command path (`gemini --version`, `gemini -p ...`) and (b) no-arg interactive TUI path. OWNER: [ ]
- Gemini checkpoint reports are stale after rootfs/runtime changes; rerun required before claiming green. OWNER: [ ]
- Any Gemini failure to show interactive output within timeout is a hard fail, not a soft warning. OWNER: [ ]
