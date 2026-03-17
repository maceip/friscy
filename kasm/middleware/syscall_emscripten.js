/**
 * Emscripten Syscall Interface
 * 
 * Emscripten's musl uses named syscall functions (__syscall_openat, __syscall_read, etc.)
 * rather than raw syscall numbers. This file provides the mapping between these named
 * functions and our SAB-based syscall protocol.
 * 
 * This is different from wali-musl which uses raw x86_64 syscall numbers.
 * Emscripten's approach is actually simpler for our purposes - we just need to
 * implement these __syscall_* functions as Wasm imports.
 * 
 * Reference: /emsdk/upstream/emscripten/system/lib/libc/musl/arch/emscripten/bits/syscall.h
 */

import { syscallRequest, ERRNO } from './sab_protocol.js';
import { FDTable } from './fd_table.js';

/**
 * Emscripten syscall handlers
 * 
 * These implement the __syscall_* functions that Emscripten's musl expects.
 * Each function marshals arguments to the SAB and makes the syscall request.
 */
export class EmscriptenSyscalls {
    constructor(channel, memory) {
        this.channel = channel;
        this.memory = memory;
        this.fdTable = new FDTable();
        
        // Local state for local syscalls
        this.brk = 0x100000;
    }
    
    /**
     * Create the imports object for Emscripten
     */
    getImports() {
        return {
            env: {
                // Core file operations
                __syscall_openat: (dirfd, path, flags, mode) => this.openat(dirfd, path, flags, mode),
                __syscall_close: (fd) => this.close(fd),
                __syscall_read: (fd, buf, count) => this.read(fd, buf, count),
                __syscall_write: (fd, buf, count) => this.write(fd, buf, count),
                __syscall_lseek: (fd, offset_lo, offset_hi, whence) => this.lseek(fd, offset_lo, offset_hi, whence),
                
                // stat operations
                __syscall_newfstatat: (dirfd, path, statbuf, flags) => this.newfstatat(dirfd, path, statbuf, flags),
                __syscall_fstat64: (fd, statbuf) => this.fstat64(fd, statbuf),
                __syscall_stat64: (path, statbuf) => this.stat64(path, statbuf),
                __syscall_lstat64: (path, statbuf) => this.lstat64(path, statbuf),
                
                // Directory operations
                __syscall_getcwd: (buf, size) => this.getcwd(buf, size),
                __syscall_chdir: (path) => this.chdir(path),
                __syscall_mkdirat: (dirfd, path, mode) => this.mkdirat(dirfd, path, mode),
                __syscall_unlinkat: (dirfd, path, flags) => this.unlinkat(dirfd, path, flags),
                __syscall_renameat: (olddirfd, oldpath, newdirfd, newpath) => 
                    this.renameat(olddirfd, oldpath, newdirfd, newpath),
                __syscall_readlinkat: (dirfd, path, buf, bufsize) => this.readlinkat(dirfd, path, buf, bufsize),
                __syscall_symlinkat: (target, newdirfd, newpath) => this.symlinkat(target, newdirfd, newpath),
                __syscall_getdents64: (fd, dirp, count) => this.getdents64(fd, dirp, count),
                
                // File descriptor operations
                __syscall_dup: (fd) => this.dup(fd),
                __syscall_dup3: (oldfd, newfd, flags) => this.dup3(oldfd, newfd, flags),
                __syscall_pipe2: (pipefd, flags) => this.pipe2(pipefd, flags),
                __syscall_ioctl: (fd, request, arg) => this.ioctl(fd, request, arg),
                __syscall_fcntl64: (fd, cmd, arg) => this.fcntl64(fd, cmd, arg),
                __syscall_fadvise64: (fd, offset_lo, offset_hi, len, advice) => 
                    this.fadvise64(fd, offset_lo, offset_hi, len, advice),
                __syscall_fallocate: (fd, mode, offset_lo, offset_hi, len_lo, len_hi) =>
                    this.fallocate(fd, mode, offset_lo, offset_hi, len_lo, len_hi),
                __syscall_ftruncate64: (fd, length_lo, length_hi) => this.ftruncate64(fd, length_lo, length_hi),
                __syscall_fchmod: (fd, mode) => this.fchmod(fd, mode),
                __syscall_fchown32: (fd, uid, gid) => this.fchown32(fd, uid, gid),
                __syscall_fchdir: (fd) => this.fchdir(fd),
                
                // Process operations
                __syscall_exit: (status) => this.exit(status),
                __syscall_exit_group: (status) => this.exit_group(status),
                __syscall_wait4: (pid, status, options, rusage) => this.wait4(pid, status, options, rusage),
                __syscall_getpid: () => this.getpid(),
                __syscall_getppid: () => this.getppid(),
                __syscall_getpgrp: () => this.getpgrp(),
                __syscall_getpgid: (pid) => this.getpgid(pid),
                __syscall_setpgid: (pid, pgid) => this.setpgid(pid, pgid),
                __syscall_getsid: (pid) => this.getsid(pid),
                __syscall_setsid: () => this.setsid(),
                __syscall_uname: (buf) => this.uname(buf),
                __syscall_getrusage: (who, usage) => this.getrusage(who, usage),
                
                // Memory operations
                __syscall_brk: (addr) => this.brk_syscall(addr),
                __syscall_mmap2: (addr, len, prot, flags, fd, offset) => 
                    this.mmap2(addr, len, prot, flags, fd, offset),
                __syscall_munmap: (addr, len) => this.munmap(addr, len),
                __syscall_mprotect: (addr, len, prot) => this.mprotect(addr, len, prot),
                __syscall_mremap: (old_addr, old_size, new_size, flags, new_addr) =>
                    this.mremap(old_addr, old_size, new_size, flags, new_addr),
                __syscall_madvise: (addr, len, advice) => this.madvise(addr, len, advice),
                __syscall_mincore: (addr, len, vec) => this.mincore(addr, len, vec),
                __syscall_mlock: (addr, len) => this.mlock(addr, len),
                __syscall_munlock: (addr, len) => this.munlock(addr, len),
                __syscall_mlockall: (flags) => this.mlockall(flags),
                __syscall_munlockall: () => this.munlockall(),
                __syscall_msync: (addr, len, flags) => this.msync(addr, len, flags),
                
                // Signal operations
                __syscall_rt_sigaction: (sig, act, oldact, size) => 
                    this.rt_sigaction(sig, act, oldact, size),
                __syscall_rt_sigprocmask: (how, set, oldset, size) => 
                    this.rt_sigprocmask(how, set, oldset, size),
                __syscall_kill: (pid, sig) => this.kill(pid, sig),
                __syscall_tgkill: (tgid, pid, sig) => this.tgkill(tgid, pid, sig),
                __syscall_sigaltstack: (ss, old_ss) => this.sigaltstack(ss, old_ss),
                __syscall_pause: () => this.pause(),
                
                // Time operations
                __syscall_clock_gettime: (clk_id, tp) => this.clock_gettime(clk_id, tp),
                __syscall_clock_getres: (clk_id, tp) => this.clock_getres(clk_id, tp),
                __syscall_clock_nanosleep: (clk_id, flags, req, rem) => 
                    this.clock_nanosleep(clk_id, flags, req, rem),
                __syscall_gettimeofday: (tv, tz) => this.gettimeofday(tv, tz),
                __syscall_nanosleep: (req, rem) => this.nanosleep(req, rem),
                __syscall_utimensat: (dirfd, path, times, flags) => 
                    this.utimensat(dirfd, path, times, flags),
                
                // User/group operations
                __syscall_getuid32: () => this.getuid32(),
                __syscall_getgid32: () => this.getgid32(),
                __syscall_geteuid32: () => this.geteuid32(),
                __syscall_getegid32: () => this.getegid32(),
                __syscall_setuid32: (uid) => this.setuid32(uid),
                __syscall_setgid32: (gid) => this.setgid32(gid),
                __syscall_getgroups32: (size, list) => this.getgroups32(size, list),
                __syscall_setgroups32: (size, list) => this.setgroups32(size, list),
                __syscall_getresuid32: (ruid, euid, suid) => this.getresuid32(ruid, euid, suid),
                __syscall_getresgid32: (rgid, egid, sgid) => this.getresgid32(rgid, egid, sgid),
                
                // System operations
                __syscall_getrandom: (buf, buflen, flags) => this.getrandom(buf, buflen, flags),
                __syscall_sysinfo: (info) => this.sysinfo(info),
                __syscall_prctl: (option, arg2, arg3, arg4, arg5) => 
                    this.prctl(option, arg2, arg3, arg4, arg5),
                __syscall_prlimit64: (pid, resource, new_limit, old_limit) =>
                    this.prlimit64(pid, resource, new_limit, old_limit),
                __syscall_setrlimit: (resource, rlim) => this.setrlimit(resource, rlim),
                __syscall_getrlimit: (resource, rlim) => this.getrlimit(resource, rlim),
                __syscall_umask: (mask) => this.umask(mask),
                __syscall_sync: () => this.sync(),
                __syscall_fsync: (fd) => this.fsync(fd),
                __syscall_fdatasync: (fd) => this.fdatasync(fd),
                __syscall_reboot: (magic, magic2, cmd, arg) => this.reboot(magic, magic2, cmd, arg),
                __syscall_setdomainname: (name, len) => this.setdomainname(name, len),
                __syscall_acct: (filename) => this.acct(filename),
                
                // Polling
                __syscall_poll: (fds, nfds, timeout) => this.poll(fds, nfds, timeout),
                __syscall_ppoll: (fds, nfds, timeout_ts, sigmask, sigsetsize) =>
                    this.ppoll(fds, nfds, timeout_ts, sigmask, sigsetsize),
                __syscall_select6: (nfds, readfds, writefds, exceptfds, timeout, sigmask) =>
                    this.select6(nfds, readfds, writefds, exceptfds, timeout, sigmask),
                __syscall_pselect6: (nfds, readfds, writefds, exceptfds, timeout, sigmask) =>
                    this.pselect6(nfds, readfds, writefds, exceptfds, timeout, sigmask),
                __syscall_epoll_create1: (flags) => this.epoll_create1(flags),
                __syscall_epoll_ctl: (epfd, op, fd, event) => this.epoll_ctl(epfd, op, fd, event),
                __syscall_epoll_pwait: (epfd, events, maxevents, timeout, sigmask, sigsetsize) =>
                    this.epoll_pwait(epfd, events, maxevents, timeout, sigmask, sigsetsize),
                
                // Socket operations (stubbed for now)
                __syscall_socket: (domain, type, protocol) => -ERRNO.ENOSYS,
                __syscall_socketpair: (domain, type, protocol, sv) => -ERRNO.ENOSYS,
                __syscall_bind: (sockfd, addr, addrlen) => -ERRNO.ENOSYS,
                __syscall_connect: (sockfd, addr, addrlen) => -ERRNO.ENOSYS,
                __syscall_listen: (sockfd, backlog) => -ERRNO.ENOSYS,
                __syscall_accept4: (sockfd, addr, addrlen, flags) => -ERRNO.ENOSYS,
                __syscall_getsockopt: (sockfd, level, optname, optval, optlen) => -ERRNO.ENOSYS,
                __syscall_setsockopt: (sockfd, level, optname, optval, optlen) => -ERRNO.ENOSYS,
                __syscall_getsockname: (sockfd, addr, addrlen) => -ERRNO.ENOSYS,
                __syscall_getpeername: (sockfd, addr, addrlen) => -ERRNO.ENOSYS,
                __syscall_sendto: (sockfd, buf, len, flags, dest_addr, addrlen) => -ERRNO.ENOSYS,
                __syscall_sendmsg: (sockfd, msg, flags) => -ERRNO.ENOSYS,
                __syscall_recvfrom: (sockfd, buf, len, flags, src_addr, addrlen) => -ERRNO.ENOSYS,
                __syscall_recvmsg: (sockfd, msg, flags) => -ERRNO.ENOSYS,
                __syscall_shutdown: (sockfd, how) => -ERRNO.ENOSYS,
                __syscall_sendmmsg: (sockfd, msgvec, vlen, flags) => -ERRNO.ENOSYS,
                __syscall_recvmmsg: (sockfd, msgvec, vlen, flags, timeout) => -ERRNO.ENOSYS,
                
                // Eventfd (stubbed)
                __syscall_eventfd2: (initval, flags) => -ERRNO.ENOSYS,
                
                // Inotify (stubbed)
                __syscall_inotify_init1: (flags) => -ERRNO.ENOSYS,
                __syscall_inotify_add_watch: (fd, pathname, mask) => -ERRNO.ENOSYS,
                __syscall_inotify_rm_watch: (fd, wd) => -ERRNO.ENOSYS,
                
                // Filesystem operations
                __syscall_chmod: (path, mode) => this.chmod(path, mode),
                __syscall_fchmodat2: (dirfd, path, mode, flags) => this.fchmodat2(dirfd, path, mode, flags),
                __syscall_truncate64: (path, length_lo, length_hi) => this.truncate64(path, length_lo, length_hi),
                __syscall_access: (path, mode) => this.access(path, mode),
                __syscall_faccessat: (dirfd, path, mode, flags) => this.faccessat(dirfd, path, mode, flags),
                __syscall_linkat: (olddirfd, oldpath, newdirfd, newpath, flags) =>
                    this.linkat(olddirfd, oldpath, newdirfd, newpath, flags),
                __syscall_rmdir: (path) => this.rmdir(path),
                __syscall_chroot: (path) => this.chroot(path),
                __syscall_statfs64: (path, size, buf) => this.statfs64(path, size, buf),
                __syscall_fstatfs64: (fd, size, buf) => this.fstatfs64(fd, size, buf),
            }
        };
    }
    
    // ==================== FILE OPERATIONS ====================
    
    openat(dirfd, path, flags, mode = 0) {
        // Copy path string to SAB
        const pathStr = this.readCString(path);
        const pathBytes = new TextEncoder().encode(pathStr);
        
        // Write path to SAB DATA_REGION
        this.channel.writeData(0, pathBytes);
        
        // Make syscall
        const result = this.syscall('openat', [dirfd, 0, flags, mode, 0, 0]);
        
        if (result >= 0) {
            // Add to FD table
            return this.fdTable.allocate({
                path: pathStr,
                flags,
                mode,
            });
        }
        return result;
    }
    
    close(fd) {
        const result = this.fdTable.close(fd);
        if (result < 0) return result;
        return this.syscall('close', [fd, 0, 0, 0, 0, 0]);
    }
    
    read(fd, buf, count) {
        // Make syscall
        const result = this.syscall('read', [fd, 0, count, 0, 0, 0]);
        
        if (result > 0) {
            // Copy data from SAB to Wasm memory
            this.channel.copyToWasm(this.memory, 0, buf, result);
        }
        
        return result;
    }
    
    write(fd, buf, count) {
        // Copy data from Wasm memory to SAB
        this.channel.copyFromWasm(this.memory, buf, 0, count);
        
        // Make syscall
        return this.syscall('write', [fd, 0, count, 0, 0, 0]);
    }
    
    lseek(fd, offset_lo, offset_hi, whence) {
        const offset = offset_lo + (offset_hi << 32);
        return this.syscall('lseek', [fd, offset, whence, 0, 0, 0]);
    }
    
    // ==================== STAT OPERATIONS ====================
    
    newfstatat(dirfd, path, statbuf, flags) {
        const pathStr = this.readCString(path);
        const pathBytes = new TextEncoder().encode(pathStr);
        this.channel.writeData(0, pathBytes);
        
        const result = this.syscall('newfstatat', [dirfd, 0, 0, flags, 0, 0]);
        
        if (result === 0) {
            // Copy stat data from SAB to Wasm memory
            const statData = this.channel.readData(0, 128); // sizeof(struct stat)
            const view = new Uint8Array(this.memory.buffer, statbuf, 128);
            view.set(statData);
        }
        
        return result;
    }
    
    fstat64(fd, statbuf) {
        const result = this.syscall('fstat64', [fd, 0, 0, 0, 0, 0]);
        
        if (result === 0) {
            const statData = this.channel.readData(0, 128);
            const view = new Uint8Array(this.memory.buffer, statbuf, 128);
            view.set(statData);
        }
        
        return result;
    }
    
    stat64(path, statbuf) {
        return this.newfstatat(-100, path, statbuf, 0); // AT_FDCWD = -100
    }
    
    lstat64(path, statbuf) {
        return this.newfstatat(-100, path, statbuf, 256); // AT_SYMLINK_NOFOLLOW = 256
    }
    
    // ==================== DIRECTORY OPERATIONS ====================
    
    getcwd(buf, size) {
        const result = this.syscall('getcwd', [0, size, 0, 0, 0, 0]);
        
        if (result >= 0) {
            const cwd = this.channel.readData(0, result);
            const view = new Uint8Array(this.memory.buffer, buf, result);
            view.set(cwd);
        }
        
        return result;
    }
    
    chdir(path) {
        const pathStr = this.readCString(path);
        const pathBytes = new TextEncoder().encode(pathStr);
        this.channel.writeData(0, pathBytes);
        
        return this.syscall('chdir', [0, 0, 0, 0, 0, 0]);
    }
    
    mkdirat(dirfd, path, mode) {
        const pathStr = this.readCString(path);
        const pathBytes = new TextEncoder().encode(pathStr);
        this.channel.writeData(0, pathBytes);
        
        return this.syscall('mkdirat', [dirfd, 0, mode, 0, 0, 0]);
    }
    
    unlinkat(dirfd, path, flags) {
        const pathStr = this.readCString(path);
        const pathBytes = new TextEncoder().encode(pathStr);
        this.channel.writeData(0, pathBytes);
        
        return this.syscall('unlinkat', [dirfd, 0, flags, 0, 0, 0]);
    }
    
    // ==================== FD OPERATIONS ====================
    
    dup(fd) {
        return this.fdTable.dup(fd);
    }
    
    dup3(oldfd, newfd, flags) {
        return this.fdTable.dup(oldfd, newfd, flags);
    }
    
    pipe2(pipefd, flags) {
        // Create pipe in kernel
        const result = this.syscall('pipe2', [0, flags, 0, 0, 0, 0]);
        
        if (result === 0) {
            // Read pipe fds from SAB
            const fds = this.channel.readData(0, 8); // 2 × int32
            const view = new DataView(fds.buffer);
            const readFd = view.getInt32(0, true);
            const writeFd = view.getInt32(4, true);
            
            // Write back to Wasm memory
            const memView = new DataView(this.memory.buffer);
            memView.setInt32(pipefd, readFd, true);
            memView.setInt32(pipefd + 4, writeFd, true);
        }
        
        return result;
    }
    
    ioctl(fd, request, arg) {
        // Most ioctls return ENOTTY
        return -ERRNO.ENOTTY;
    }
    
    fcntl64(fd, cmd, arg) {
        return this.syscall('fcntl64', [fd, cmd, arg, 0, 0, 0]);
    }
    
    // ==================== PROCESS OPERATIONS ====================
    
    exit(status) {
        // Handle locally
        throw new ProcessExitError(status);
    }
    
    exit_group(status) {
        this.exit(status);
    }
    
    wait4(pid, status, options, rusage) {
        return this.syscall('wait4', [pid, 0, options, 0, 0, 0]);
    }
    
    getpid() {
        // Return cached pid
        return this.pid || 1;
    }
    
    getppid() {
        return 0; // No parent in simple implementation
    }
    
    uname(buf) {
        const fields = [
            'Linux',     // sysname
            'kasm',      // nodename
            '6.6.0',     // release
            '#1',        // version
            'wasm32',    // machine
            '',          // domainname
        ];
        
        let offset = buf;
        const view = new Uint8Array(this.memory.buffer);
        
        for (const field of fields) {
            const bytes = new TextEncoder().encode(field + '\0');
            view.set(bytes, offset);
            offset += 65; // struct utsname field size
        }
        
        return 0;
    }
    
    // ==================== MEMORY OPERATIONS ====================
    
    brk_syscall(addr) {
        if (addr === 0) {
            return this.brk;
        }
        
        // Grow memory if needed
        const memorySize = this.memory.buffer.byteLength;
        if (addr > memorySize) {
            const delta = Math.ceil((addr - memorySize) / 65536);
            this.memory.grow(delta);
        }
        
        this.brk = addr;
        return addr;
    }
    
    mmap2(addr, len, prot, flags, fd, offset) {
        // mmap is handled by mmap-shim, not routed through SAB
        // This stub returns ENOSYS to indicate it should use mmap-shim
        return -ERRno.ENOSYS;
    }
    
    munmap(addr, len) {
        return -ERRNO.ENOSYS; // Use mmap-shim
    }
    
    mprotect(addr, len, prot) {
        return -ERRNO.ENOSYS; // Use mmap-shim
    }
    
    mremap(old_addr, old_size, new_size, flags, new_addr) {
        return -ERRNO.ENOSYS; // Use mmap-shim
    }
    
    madvise(addr, len, advice) {
        return 0; // Ignore madvise
    }
    
    mincore(addr, len, vec) {
        return -ERRNO.ENOSYS;
    }
    
    mlock(addr, len) {
        return 0;
    }
    
    munlock(addr, len) {
        return 0;
    }
    
    mlockall(flags) {
        return 0;
    }
    
    munlockall() {
        return 0;
    }
    
    msync(addr, len, flags) {
        return 0;
    }
    
    // ==================== TIME OPERATIONS ====================
    
    clock_gettime(clk_id, tp) {
        const now = Date.now();
        const seconds = Math.floor(now / 1000);
        const nanoseconds = (now % 1000) * 1000000;
        
        const view = new DataView(this.memory.buffer);
        view.setBigInt64(tp, BigInt(seconds), true);
        view.setBigInt64(tp + 8, BigInt(nanoseconds), true);
        
        return 0;
    }
    
    clock_getres(clk_id, tp) {
        const view = new DataView(this.memory.buffer);
        view.setBigInt64(tp, 0n, true); // 1 nanosecond resolution
        view.setBigInt64(tp + 8, 1n, true);
        return 0;
    }
    
    gettimeofday(tv, tz) {
        const now = Date.now();
        const seconds = Math.floor(now / 1000);
        const microseconds = (now % 1000) * 1000;
        
        const view = new DataView(this.memory.buffer);
        view.setInt32(tv, seconds, true);
        view.setInt32(tv + 4, microseconds, true);
        
        return 0;
    }
    
    nanosleep(req, rem) {
        // Would need async handling for real implementation
        return 0;
    }
    
    // ==================== SIGNAL OPERATIONS ====================
    
    rt_sigaction(sig, act, oldact, size) {
        return 0; // Signals not supported
    }
    
    rt_sigprocmask(how, set, oldset, size) {
        return 0;
    }
    
    kill(pid, sig) {
        return this.syscall('kill', [pid, sig, 0, 0, 0, 0]);
    }
    
    tgkill(tgid, pid, sig) {
        return this.syscall('tgkill', [tgid, pid, sig, 0, 0, 0]);
    }
    
    sigaltstack(ss, old_ss) {
        return 0;
    }
    
    pause() {
        return -ERRNO.EINTR;
    }
    
    // ==================== RANDOM ====================
    
    getrandom(buf, buflen, flags) {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const view = new Uint8Array(this.memory.buffer, buf, buflen);
            crypto.getRandomValues(view);
            return buflen;
        }
        // Fallback: return pseudo-random
        const view = new Uint8Array(this.memory.buffer, buf, buflen);
        for (let i = 0; i < buflen; i++) {
            view[i] = Math.floor(Math.random() * 256);
        }
        return buflen;
    }
    
    // ==================== POLLING ====================
    
    poll(fds, nfds, timeout) {
        // Stub - would need epoll implementation
        return 0;
    }
    
    ppoll(fds, nfds, timeout_ts, sigmask, sigsetsize) {
        return this.poll(fds, nfds, 0);
    }
    
    select6(nfds, readfds, writefds, exceptfds, timeout, sigmask) {
        return this.poll(null, nfds, 0);
    }
    
    pselect6(nfds, readfds, writefds, exceptfds, timeout, sigmask) {
        return this.select6(nfds, readfds, writefds, exceptfds, timeout, sigmask);
    }
    
    epoll_create1(flags) {
        return this.syscall('epoll_create1', [flags, 0, 0, 0, 0, 0]);
    }
    
    epoll_ctl(epfd, op, fd, event) {
        return this.syscall('epoll_ctl', [epfd, op, fd, 0, 0, 0]);
    }
    
    epoll_pwait(epfd, events, maxevents, timeout, sigmask, sigsetsize) {
        return this.syscall('epoll_pwait', [epfd, 0, maxevents, timeout, 0, 0]);
    }
    
    // ==================== USER/GROUP (STUBS) ====================
    
    getuid32() { return 1000; }
    getgid32() { return 1000; }
    geteuid32() { return 1000; }
    getegid32() { return 1000; }
    setuid32(uid) { return -ERRNO.EPERM; }
    setgid32(gid) { return -ERRNO.EPERM; }
    getgroups32(size, list) { return 0; }
    setgroups32(size, list) { return -ERRNO.EPERM; }
    getresuid32(ruid, euid, suid) { return -ERRNO.ENOSYS; }
    getresgid32(rgid, egid, sgid) { return -ERRNO.ENOSYS; }
    
    // ==================== HELPER METHODS ====================
    
    readCString(ptr, maxLen = 4096) {
        const view = new Uint8Array(this.memory.buffer);
        const bytes = [];
        for (let i = 0; i < maxLen && ptr + i < view.length; i++) {
            const byte = view[ptr + i];
            if (byte === 0) break;
            bytes.push(byte);
        }
        return new TextDecoder().decode(new Uint8Array(bytes));
    }
    
    syscall(name, args) {
        // Map syscall name to number
        const syscallNum = this.getSyscallNumber(name);
        if (syscallNum === undefined) {
            console.warn(`Unknown syscall: ${name}`);
            return -ERRno.ENOSYS;
        }
        
        // Make syscall request through SAB
        return syscallRequest(this.channel, syscallNum, args);
    }
    
    getSyscallNumber(name) {
        // Map syscall names to asm-generic numbers
        const SYSCALL_MAP = {
            openat: 56,
            close: 57,
            read: 63,
            write: 64,
            lseek: 62,
            fstat64: 80,
            newfstatat: 79,
            getcwd: 17,
            chdir: 49,
            mkdirat: 34,
            unlinkat: 35,
            pipe2: 59,
            dup: 23,
            dup3: 24,
            fcntl64: 25,
            ioctl: 29,
            wait4: 260,
            kill: 129,
            tgkill: 131,
            exit: 93,
            exit_group: 94,
            getpid: 172,
            getppid: 173,
            uname: 160,
            epoll_create1: 20,
            epoll_ctl: 21,
            epoll_pwait: 22,
            clock_gettime: 113,
            clock_getres: 114,
            getrandom: 278,
        };
        
        return SYSCALL_MAP[name];
    }
}

class ProcessExitError extends Error {
    constructor(status) {
        super(`Process exited with status ${status}`);
        this.status = status;
        this.name = 'ProcessExitError';
    }
}

export { EmscriptenSyscalls, ProcessExitError };
export default EmscriptenSyscalls;
