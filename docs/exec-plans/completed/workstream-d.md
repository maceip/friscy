# ExecPlan: Workstream D — Interactive Terminal

## Progress

- [x] Wire stdin through Emscripten to guest process
- [x] Handle raw stdout output (buffering, line discipline)
- [x] Add terminal ioctl support (TIOCGWINSZ, TCGETS, TCSETS)
- [x] Implement cooperative fork via clone syscall
- [x] Implement execve for program launching
- [x] Implement wait4 for child process reaping
- [x] Add page permission tracking (mprotect enforcement)
- [x] Validate interactive BusyBox shell session

## Surprises & Discoveries

- Terminal raw mode requires TCGETS/TCSETS ioctls — without them, programs
  like `less` and `vi` hang waiting for terminal attributes.
- Cooperative fork was harder than expected — needed to snapshot the full
  register file and allow the "child" to diverge at a known PC.
- Page permissions matter for dynamic linkers that mark code pages executable
  after loading — mprotect enforcement caught several silent failures.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-02 | Cooperative fork instead of full process isolation | Single-address-space Wasm; true fork impossible |
| 2025-02 | Fixed terminal size (80x24) | Simplicity; dynamic resize can be added later via SIGWINCH |

## Outcomes & Retrospective

Interactive terminal works end-to-end.  BusyBox `sh`, `ls`, `cat`, and `vi`
all function correctly.  The fork/execve/wait4 trio enables multi-command
sessions.  Page permission tracking resolved silent mprotect failures.
