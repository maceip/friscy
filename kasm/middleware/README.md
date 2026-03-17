# Middleware Layer

Syscall dispatch and backend selection for Kasm Wasm-Native Linux.

## Overview

The middleware layer sits between Wasm programs and the kernel backend. It implements the WALI syscall API and provides:

1. **SAB Protocol** - SharedArrayBuffer syscall channel
2. **Syscall Numbers** - LKL/WALI syscall definitions
3. **Kernel Worker** - Web Worker running the kernel
4. **Process Worker** - Per-process Wasm execution
5. **FD Table** - File descriptor management
6. **Process Manager** - Process lifecycle management

## Architecture

```
User Code (e.g., echo hello)
         │
         ▼
┌─────────────────────┐
│ Process Worker      │
│ - __syscall import  │
│ - FD table          │
│ - Local syscalls    │
└─────────┬───────────┘
          │ SAB channel
          ▼
┌─────────────────────┐
│ Kernel Worker       │
│ - Mock kernel (now) │
│ - Real LKL (later)  │
│ - Syscall routing   │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌───────┐   ┌─────────┐
│ Mock  │   │ Real    │
│ Files │   │ LKL     │
│ (test)│   │ (G1+G3) │
└───────┘   └─────────┘
```

## Files

| File | Purpose | Research Basis |
|------|---------|----------------|
| `sab_protocol.js` | 64KB SAB layout + Atomics protocol | ATC'19 paper, Browsix |
| `syscall_numbers.js` | Syscall numbers from LKL header | LKL unistd.h |
| `kernel_worker.js` | Kernel Worker + mock filesystem | Browsix routing |
| `process_worker.js` | Single `__syscall` import handler | Browsix loader |
| `fd_table.js` | FD table with dev/ino tracking | BrowserFS fork |
| `process_manager.js` | Process lifecycle | Standard Unix |

## SAB Protocol Layout

64KB auxiliary SAB per process:

```
Offset  Size   Field
0       4      STATE (0=idle, 1=request, 2=reply)
4       4      SYSCALL_NR
8       24     ARG0-ARG5 (6 × int32)
32      4      RETVAL
36      4      ERRNO
40      ...    DATA_REGION (65496 bytes)
```

## Syscall Routing

**Local syscalls** (no kernel round-trip):
- `brk`, `clock_gettime`, `getpid`, `getppid`, `getrandom`, `uname`
- `mmap`, `munmap`, `mprotect`, `mremap` (routed to mmap-shim)

**Kernel syscalls** (routed via SAB):
- `openat`, `close`, `read`, `write`, `lseek`, `fstat`
- `pipe2`, `dup`, `dup3`, `ioctl`, `fcntl`
- `getcwd`, `chdir`, `mkdirat`, `unlinkat`
- `clone`, `execve`, `wait4`, `exit`, `exit_group`

## Usage

```javascript
import { processManager } from './middleware/process_manager.js';

// Initialize
await processManager.init();

// Spawn process
const pid = await processManager.spawn(
    '/bin/busybox.wasm',
    ['echo', 'hello'],
    { PATH: '/bin' }
);

// Wait for completion
const result = await processManager.wait4(pid, 0);
console.log(`Exit status: ${result.status}`);
```

## Testing

```bash
cd tests
node sab_latency_poc.js    # 100K syscalls under 2s
node test_echo.js          # echo hello
node test_pipe.js          # echo hello | cat
node test_exec.js          # sh -c "echo hello"
```

## Research References

- **ATC'19**: "Browsix-Wasm / Not So Fast" - SAB syscall channel performance
- **Browsix**: wasm-loader-browsix - Single `__syscall` import pattern
- **BrowserFS**: FD table with dev/ino tracking
- **Deno-WASI**: iovec marshaling with DataView

## Integration Timeline

### Week 1 (K1-K5)
- ✅ SAB protocol
- ✅ Syscall numbers
- ✅ Kernel worker (mock)
- ✅ Process worker
- ✅ FD table

### Week 2 (K6-K8)
- ✅ Process manager
- ⏳ Busybox build (requires wali-musl submodule)
- ✅ Tests

### Week 3 Integration
- G1 (Gemini): Real LKL kernel via wasm2c
- K3: Swap mock → real kernel
- Test: test_echo.js passes
- Test: test_pipe.js passes → Phase 2 milestone

## Next Steps

1. Add wali-musl submodule: `git submodule add https://github.com/arjunr2/wali-musl.git wali-musl`
2. Build wali-musl toolchain
3. Compile busybox using wali-musl
4. Run test_echo.js against real kernel

## Notes

- **Exception-free hot path**: All syscalls return `-errno`, never throw
- **Copy freely**: ATC'19 showed SAB data copy cost is negligible vs syscall overhead
- **Single import**: One `__syscall` function, not 60 separate imports
