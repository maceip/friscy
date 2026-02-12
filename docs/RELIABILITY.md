# Reliability

## Syscall Coverage

friscy implements 84 Linux syscalls — enough to run Alpine Linux with BusyBox,
Python, and dynamically linked musl binaries.

### Coverage by category

| Category | Implemented | Key syscalls |
|----------|------------|-------------|
| Process lifecycle | 5 | exit, exit_group, clone, execve, wait4 |
| File I/O | 15 | openat, close, read, write, readv, writev, pread64, lseek |
| Filesystem | 15 | newfstatat, fstat, statx, getcwd, chdir, getdents64, mkdirat |
| Memory | 6 | brk, mmap, munmap, mprotect, madvise, mremap |
| I/O multiplexing | 4 | epoll_create1, epoll_ctl, epoll_pwait, ppoll |
| Network | 9+ | socket, bind, connect, sendto, recvfrom, setsockopt |
| Time | 3 | clock_gettime, clock_getres, nanosleep |
| Signals | 3 | rt_sigaction, rt_sigprocmask, sigaltstack |

### Stub policy

Syscalls that are safe to stub in a single-process, single-thread environment
return reasonable defaults (e.g., `getuid` → 0, `sched_getaffinity` → 1 CPU).
Syscalls that would silently corrupt state return `-ENOSYS`.

## Crash Handling

- **Guest segfault:** libriscv traps the invalid memory access and reports
  the faulting PC.  The Wasm runtime continues (no browser crash).
- **Unimplemented syscall:** Returns `-ENOSYS` to the guest.  The guest
  program receives an error, not a crash.
- **VFS corruption:** The VFS is in-memory only.  A browser refresh resets
  all state to the original tar contents.

## Dynamic Linking

friscy supports dynamically linked binaries via `ld-musl-riscv64.so.1`.  The
ELF loader detects `PT_INTERP`, loads the dynamic linker at a fixed base
address (0x40000000), and sets up the auxiliary vector (AT_PHDR, AT_ENTRY,
AT_BASE, etc.).

## Known Gaps

- **No multi-threading.**  `clone` creates a cooperative child process but
  does not support CLONE_THREAD.
- **No signal delivery.**  Signal handlers are registered but signals are
  never asynchronously delivered.
- **No persistent VFS.**  Filesystem changes are lost on page refresh.
  Wizer snapshots (planned) will address this.
