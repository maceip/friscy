/**
 * Syscall Numbers for LKL/WALI
 *
 * Extracted from: kernel/lkl/tools/lkl/include/lkl/asm-generic/unistd.h
 *
 * These are asm-generic numbers - same as WALI, same as arm64/RISC-V.
 *
 * References:
 * - LKL: https://github.com/lkl/linux
 * - WALI: https://github.com/arjunr2/WALI
 * - ATC'19: Browsix-Wasm paper on syscall performance
 */

// Syscall number constants
export const SYS = {
    // File operations
    openat: 56,
    close: 57,
    read: 63,
    write: 64,
    readv: 65,
    writev: 66,
    lseek: 62,
    fstat: 80,
    fstatat: 79,
    
    // Directory operations
    getcwd: 17,
    chdir: 49,
    fchdir: 50,
    mkdirat: 34,
    unlinkat: 35,
    renameat: 38,
    readlinkat: 78,
    symlinkat: 36,
    
    // File descriptor operations
    dup: 23,
    dup3: 24,
    pipe2: 59,
    ioctl: 29,
    fcntl: 25,
    
    // Process lifecycle
    exit: 93,
    exit_group: 94,
    clone: 220,
    execve: 221,
    execveat: 281,
    wait4: 260,
    getpid: 172,
    getppid: 173,
    uname: 160,
    
    // Memory management
    brk: 214,
    munmap: 215,
    mmap: 222,  // __lkl__NR3264_mmap - routed to mmap-shim, not kernel
    mmap2: 222, // Same as mmap
    mprotect: 226,
    mremap: 234,
    
    // Signals
    rt_sigaction: 134,
    rt_sigprocmask: 135,
    rt_sigreturn: 139,
    kill: 129,
    tgkill: 131,
    
    // Time
    clock_gettime: 113,
    clock_getres: 114,
    clock_nanosleep: 115,
    gettimeofday: 169,
    nanosleep: 101,
    
    // Random
    getrandom: 278,
    
    // Polling
    epoll_create1: 20,
    epoll_ctl: 21,
    epoll_pwait: 22,
    eventfd2: 19,
    
    // Event notification
    inotify_init1: 26,
    inotify_add_watch: 27,
    inotify_rm_watch: 28,
    
    // Extended attributes
    setxattr: 5,
    lsetxattr: 6,
    fsetxattr: 7,
    getxattr: 8,
    lgetxattr: 9,
    fgetxattr: 10,
    listxattr: 11,
    llistxattr: 12,
    flistxattr: 13,
    removexattr: 14,
    lremovexattr: 15,
    fremovexattr: 16,
    
    // AIO
    io_setup: 0,
    io_destroy: 1,
    io_submit: 2,
    io_cancel: 3,
    io_getevents: 4,
    
    // Misc
    lookup_dcookie: 18,
    ioprio_set: 30,
    ioprio_get: 31,
    pread64: 67,
    pwrite64: 68,
    preadv: 69,
    pwritev: 70,
    sendfile: 71,
    pselect6: 72,
    ppoll: 73,
    signalfd4: 74,
    vmsplice: 75,
    splice: 76,
    tee: 77,
    syncfs: 82,
    setns: 268,
    process_vm_readv: 270,
    process_vm_writev: 271,
    readahead: 213,
};

// Syscall names by number (reverse lookup)
export const SYS_BY_NUMBER = Object.fromEntries(
    Object.entries(SYS).map(([name, num]) => [num, name])
);

// Syscalls handled locally in process (no kernel round-trip needed)
// Research insight (Browsix wasm-loader-browsix): Handle simple syscalls locally
export const LOCAL_SYSCALLS = new Set([
    SYS.brk,
    SYS.clock_gettime,
    SYS.clock_getres,
    SYS.getpid,
    SYS.getppid,
    SYS.getrandom,
    SYS.uname,
    // mmap family handled by mmap-shim, not kernel
    SYS.mmap,
    SYS.munmap,
    SYS.mprotect,
    SYS.mremap,
]);

// Syscalls routed to kernel via SAB
export const KERNEL_SYSCALLS = new Set([
    SYS.openat,
    SYS.close,
    SYS.read,
    SYS.write,
    SYS.readv,
    SYS.writev,
    SYS.lseek,
    SYS.fstat,
    SYS.fstatat,
    SYS.pipe2,
    SYS.dup,
    SYS.dup3,
    SYS.ioctl,
    SYS.fcntl,
    SYS.getcwd,
    SYS.chdir,
    SYS.mkdirat,
    SYS.unlinkat,
    SYS.renameat,
    SYS.readlinkat,
    SYS.wait4,
    SYS.clone,
    SYS.execve,
    SYS.execveat,
    SYS.exit,
    SYS.exit_group,
    SYS.rt_sigaction,
    SYS.rt_sigprocmask,
]);

/**
 * Check if a syscall should be handled locally in the process
 * @param {number} syscallNr - Syscall number
 * @returns {boolean} - True if local, false if should route to kernel
 */
export function isLocalSyscall(syscallNr) {
    return LOCAL_SYSCALLS.has(syscallNr);
}

/**
 * Check if a syscall should be routed to the kernel
 * @param {number} syscallNr - Syscall number
 * @returns {boolean} - True if kernel, false if local
 */
export function isKernelSyscall(syscallNr) {
    return KERNEL_SYSCALLS.has(syscallNr);
}

/**
 * Get syscall name from number
 * @param {number} syscallNr - Syscall number
 * @returns {string|undefined} - Syscall name or undefined
 */
export function getSyscallName(syscallNr) {
    return SYS_BY_NUMBER[syscallNr];
}

/**
 * Get syscall number from name
 * @param {string} name - Syscall name
 * @returns {number|undefined} - Syscall number or undefined
 */
export function getSyscallNumber(name) {
    return SYS[name];
}

// Export default for convenience
export default SYS;
