# Quality Score

## Rubric

Quality is tracked across five dimensions.  Each is scored 1-5 where 3 means
"acceptable for a solo-developer project" and 5 means "production-grade".

| Dimension | Current | Target | Notes |
|-----------|---------|--------|-------|
| **Correctness** | 4 | 5 | 84 syscalls implemented; AOT integer translation verified |
| **Reliability** | 3 | 4 | VFS is solid; crash recovery during AOT compilation untested |
| **Performance** | 3 | 5 | Interpreter at ~40% native; AOT target is 80%+ |
| **Security** | 3 | 4 | Wasm sandbox is strong; network proxy needs auth |
| **Developer UX** | 3 | 4 | friscy-pack works; docs and error messages need polish |

## Metrics (future)

These are not instrumented yet but should be:

- **Startup time** — time from page load to first shell prompt.
- **Syscall coverage** — percentage of syscalls hit by Alpine test suite.
- **AOT compilation ratio** — percentage of code blocks successfully AOT-compiled.
- **Memory overhead** — Wasm linear memory vs guest memory actually used.

## SLOs (aspirational)

| SLO | Target |
|-----|--------|
| Alpine shell interactive within 1 s of page load | 90 % |
| Zero syscall panics on supported test suite | 100 % |
| AOT-compiled code matches interpreter output | 100 % |
