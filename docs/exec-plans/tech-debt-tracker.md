# Tech Debt Tracker

Debt items sorted by priority (P0 = blocking, P1 = should fix soon, P2 = nice to have).

| # | Priority | Area | Description | Tracking |
|---|----------|------|-------------|----------|
| 1 | P0 | AOT | Floating-point instructions emit `Unreachable` — any FP guest code traps | workstream-c |
| 2 | P0 | AOT | Atomic instructions use simplified single-thread stubs — breaks with SharedArrayBuffer | workstream-c |
| 3 | P1 | AOT | Dispatch loop uses linear scan instead of br_table — O(n) vs O(1) per block | workstream-c |
| 4 | P1 | Startup | No Wizer snapshot support — cold start requires full initialization | — |
| 5 | P1 | VFS | No persistence — filesystem changes lost on page refresh | — |
| 6 | P2 | Runtime | No multi-threading — CLONE_THREAD returns ENOSYS | — |
| 7 | P2 | Runtime | Signal handlers registered but never asynchronously delivered | — |
| 8 | P2 | Network | Proxy has no authentication or egress filtering | — |
| 9 | P2 | Tooling | friscy-pack has no --aot flag yet | — |

## Process

- When you discover new debt, add a row here.
- When debt is resolved, delete the row and note the resolving commit/PR.
- Review this file at least once per milestone.
