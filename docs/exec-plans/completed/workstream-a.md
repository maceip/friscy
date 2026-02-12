# ExecPlan: Workstream A — Native Runtime Validation

## Progress

- [x] Build libriscv as native Linux binary
- [x] Run static RISC-V hello-world binary
- [x] Load Alpine rootfs tar into VFS
- [x] Execute dynamically linked busybox with ld-musl
- [x] Run Python stress test under native runtime
- [x] Validate all 84 syscalls return expected results

## Surprises & Discoveries

- ld-musl requires a precise auxiliary vector layout — AT_PHDR, AT_ENTRY,
  AT_BASE must all be set correctly or the linker segfaults silently.
- Python's `os.urandom()` requires `getrandom` syscall — had to implement
  it reading from a seeded PRNG.
- Alpine's busybox uses `faccessat2` (syscall 439) which is relatively new —
  needed to add it alongside `faccessat`.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01 | Use libriscv memory API for all guest accesses | Bounds checking built-in, avoids raw pointer math |
| 2025-01 | Fixed linker base at 0x40000000 | Avoids ASLR complexity; single-process model means no collision |
| 2025-02 | Cooperative fork via clone | Full fork impossible in single-address-space; clone+execve pattern works |

## Outcomes & Retrospective

All validation targets met.  Native runtime successfully runs Alpine BusyBox,
Python, and dynamically linked musl binaries.  The 84-syscall surface proved
sufficient for the target workloads.  Key learnings about aux vector layout
were documented in the ELF loader comments.
