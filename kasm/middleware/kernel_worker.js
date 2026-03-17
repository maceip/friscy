/**
 * Kernel Worker - Runs in Web Worker, handles syscalls
 * 
 * Research insight (Browsix wasm-loader-browsix): Handle simple syscalls locally 
 * in the process, only route complex ones to the kernel.
 * 
 * Mock kernel initially - swap for real LKL kernel when G1+G3 complete.
 * 
 * Real kernel interface:
 *   const retval = Module._kasm_syscall(nr, a0, a1, a2, a3, a4, a5);
 */

import { SYS, isLocalSyscall, isKernelSyscall, getSyscallName } from './syscall_numbers.js';
import { createChannel, syscallAwait, syscallReply, STATE, ERRNO, SAB_LAYOUT } from './sab_protocol.js';

/**
 * Kernel Worker - Manages process channels and handles syscalls
 */
class KernelWorker {
    constructor() {
        this.processes = new Map(); // workerId -> { pid, channel, state }
        this.nextPid = 1;
        this.fs = new MockFilesystem();
        this.running = false;
        
        // Real kernel module (populated when G1+G3 complete)
        this.kernelModule = null;
    }
    
    /**
     * Initialize kernel worker
     */
    async init() {
        // Try to load real LKL kernel if available
        try {
            const response = await fetch('../kernel/kernel.wasm');
            if (response.ok) {
                // Real kernel available - load it
                // const wasmModule = await WebAssembly.compileStreaming(response);
                // this.kernelModule = await WebAssembly.instantiate(wasmModule, ...);
                console.log('KernelWorker: Real kernel available but not loaded (G1+G3 pending)');
            }
        } catch (e) {
            console.log('KernelWorker: Using mock kernel');
        }
        
        this.running = true;
        this.processLoop();
    }
    
    /**
     * Register a new process
     */
    registerProcess(workerId, sab) {
        const pid = this.nextPid++;

        // Build kernel-side views directly from the process's SAB.
        // No need to allocate a separate channel — we just need typed views.
        const channel = {
            sab,
            isKernel: true,
            stateView: new Int32Array(sab, SAB_LAYOUT.STATE_OFFSET, 1),
            syscallView: new Int32Array(sab, SAB_LAYOUT.SYSCALL_OFFSET, 1),
            argsView: new Int32Array(sab, SAB_LAYOUT.ARGS_OFFSET, 6),
            retvalView: new Int32Array(sab, SAB_LAYOUT.RETVAL_OFFSET, 1),
            errnoView: new Int32Array(sab, SAB_LAYOUT.ERRNO_OFFSET, 1),
            dataView: new Uint8Array(sab, SAB_LAYOUT.DATA_OFFSET, SAB_LAYOUT.DATA_SIZE),
        };
        
        this.processes.set(workerId, {
            pid,
            channel,
            state: 'running',
        });
        
        // Start handling syscalls for this process
        this.handleProcessSyscalls(workerId, pid, channel);
        
        return pid;
    }
    
    /**
     * Handle syscalls for a specific process
     */
    async handleProcessSyscalls(workerId, pid, channel) {
        while (this.running && this.processes.has(workerId)) {
            // Wait for syscall request.
            // Atomics.wait blocks until stateView[0] is no longer IDLE.
            // When the process sets STATE=REQUEST and calls Atomics.notify,
            // this wakes up. The timeout is a safety net for shutdown checks.
            while (this.running) {
                const state = Atomics.load(channel.stateView, 0);
                if (state === STATE.REQUEST) break;
                // Block until state changes from current value
                Atomics.wait(channel.stateView, 0, state, 5000);
            }
            if (!this.running) return;
            
            // Read syscall details
            const syscallNr = Atomics.load(channel.syscallView, 0);
            const args = Array.from(channel.argsView);
            
            // Handle the syscall
            const result = await this.handleSyscall(pid, syscallNr, args, channel.dataView);
            
            // Write reply
            if (result.error) {
                Atomics.store(channel.errnoView, 0, result.error);
                Atomics.store(channel.retvalView, 0, -1);
            } else {
                Atomics.store(channel.errnoView, 0, 0);
                Atomics.store(channel.retvalView, 0, result.value !== undefined ? result.value : 0);
            }
            
            // Signal reply
            Atomics.store(channel.stateView, 0, STATE.REPLY);
            Atomics.notify(channel.stateView, 0, 1);
        }
    }
    
    /**
     * Handle a syscall
     * 
     * Returns { value } on success
     * Returns { error: errno } on failure
     */
    async handleSyscall(pid, syscallNr, args, dataView) {
        const syscallName = getSyscallName(syscallNr) || `syscall_${syscallNr}`;
        
        // If real kernel available, use it
        if (this.kernelModule && this.kernelModule._kasm_syscall) {
            const retval = this.kernelModule._kasm_syscall(syscallNr, args[0], args[1], args[2], args[3], args[4], args[5]);
            return retval < 0 ? { error: -retval } : { value: retval };
        }
        
        // Otherwise, use mock implementation
        switch (syscallNr) {
            case SYS.openat:
                return this.handleOpenat(pid, args[0], args[1], args[2], args[3], dataView);
                
            case SYS.close:
                return this.handleClose(pid, args[0]);
                
            case SYS.read:
                return this.handleRead(pid, args[0], args[1], args[2], dataView);
                
            case SYS.write:
                return this.handleWrite(pid, args[0], args[1], args[2], dataView);
                
            case SYS.lseek:
                return this.handleLseek(pid, args[0], args[1], args[2]);
                
            case SYS.fstat:
                return this.handleFstat(pid, args[0], args[1]);
                
            case SYS.fstatat:
                return this.handleFstatat(pid, args[0], args[1], args[2], args[3], dataView);
                
            case SYS.getcwd:
                return this.handleGetcwd(pid, args[0], args[1], dataView);
                
            case SYS.chdir:
                return this.handleChdir(pid, args[0], dataView);
                
            case SYS.mkdirat:
                return this.handleMkdirat(pid, args[0], args[1], args[2], dataView);
                
            case SYS.unlinkat:
                return this.handleUnlinkat(pid, args[0], args[1], args[2], dataView);
                
            case SYS.pipe2:
                return this.handlePipe2(pid, args[0], args[1]);
                
            case SYS.dup:
                return this.handleDup(pid, args[0]);
                
            case SYS.dup3:
                return this.handleDup3(pid, args[0], args[1], args[2]);
                
            case SYS.ioctl:
                return this.handleIoctl(pid, args[0], args[1], args[2]);
                
            case SYS.fcntl:
                return this.handleFcntl(pid, args[0], args[1], args[2]);
                
            case SYS.exit:
                return this.handleExit(pid, args[0]);
                
            case SYS.exit_group:
                return this.handleExitGroup(pid, args[0]);
                
            case SYS.wait4:
                return this.handleWait4(pid, args[0], args[1], args[2], args[3]);
                
            case SYS.clone:
                return this.handleClone(pid, args[0], args[1], args[2], args[3], args[4]);
                
            case SYS.execve:
                return this.handleExecve(pid, args[0], args[1], args[2], dataView);
                
            case SYS.getpid:
                return { value: pid };
                
            case SYS.getppid:
                return { value: 0 }; // Mock - no parent
                
            default:
                console.warn(`Mock kernel: Unimplemented syscall ${syscallName} (${syscallNr})`);
                return { error: ERRNO.ENOSYS };
        }
    }
    
    // Syscall handlers
    
    handleOpenat(pid, dirfd, pathnamePtr, flags, mode, dataView) {
        const path = this.readStringFromData(dataView, pathnamePtr, 4096);
        const fd = this.fs.openat(dirfd, path, flags, mode);
        return fd < 0 ? { error: -fd } : { value: fd };
    }
    
    handleClose(pid, fd) {
        const result = this.fs.close(fd);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handleRead(pid, fd, bufPtr, count, dataView) {
        const result = this.fs.read(fd, count);
        if (result < 0) {
            return { error: -result };
        }
        // Write data to SAB DATA_REGION
        dataView.set(result, 0);
        return { value: result.length };
    }
    
    handleWrite(pid, fd, bufPtr, count, dataView) {
        // Read data from SAB DATA_REGION
        const data = dataView.slice(0, count);
        const result = this.fs.write(fd, data);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handleLseek(pid, fd, offset, whence) {
        const result = this.fs.lseek(fd, offset, whence);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handleFstat(pid, fd, statbufPtr) {
        const stat = this.fs.fstat(fd);
        if (!stat) {
            return { error: ERRNO.EBADF };
        }
        // Stat structure would be written here
        return { value: 0 };
    }
    
    handleFstatat(pid, dirfd, pathnamePtr, statbufPtr, flags, dataView) {
        const path = this.readStringFromData(dataView, pathnamePtr, 4096);
        const stat = this.fs.statat(dirfd, path, flags);
        if (!stat) {
            return { error: ERRNO.ENOENT };
        }
        return { value: 0 };
    }
    
    handleGetcwd(pid, bufPtr, size, dataView) {
        const cwd = this.fs.getcwd(pid);
        if (!cwd) {
            return { error: ERRNO.ENOENT };
        }
        const bytes = new TextEncoder().encode(cwd);
        if (bytes.length >= size) {
            return { error: ERRNO.ERANGE };
        }
        dataView.set(bytes, 0);
        dataView[bytes.length] = 0; // Null terminator
        return { value: bytes.length };
    }
    
    handleChdir(pid, pathPtr, dataView) {
        const path = this.readStringFromData(dataView, pathPtr, 4096);
        const result = this.fs.chdir(pid, path);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handleMkdirat(pid, dirfd, pathnamePtr, mode, dataView) {
        const path = this.readStringFromData(dataView, pathnamePtr, 4096);
        const result = this.fs.mkdirat(dirfd, path, mode);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handleUnlinkat(pid, dirfd, pathnamePtr, flags, dataView) {
        const path = this.readStringFromData(dataView, pathnamePtr, 4096);
        const result = this.fs.unlinkat(dirfd, path, flags);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handlePipe2(pid, pipefdPtr, flags) {
        const result = this.fs.pipe2(flags);
        if (result < 0) {
            return { error: -result };
        }
        // Write fds to result (simplified)
        return { value: 0 };
    }
    
    handleDup(pid, oldfd) {
        const result = this.fs.dup(oldfd);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handleDup3(pid, oldfd, newfd, flags) {
        const result = this.fs.dup3(oldfd, newfd, flags);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handleIoctl(pid, fd, request, arg) {
        // Mock - return ENOTTY for most ioctls
        return { error: ERRNO.ENOTTY };
    }
    
    handleFcntl(pid, fd, cmd, arg) {
        const result = this.fs.fcntl(fd, cmd, arg);
        return result < 0 ? { error: -result } : { value: result };
    }
    
    handleExit(pid, status) {
        const proc = this.processes.get(pid);
        if (proc) {
            proc.state = 'exited';
            proc.exitStatus = status;
        }
        return { value: 0 };
    }
    
    handleExitGroup(pid, status) {
        // Exit all threads in process group
        return this.handleExit(pid, status);
    }
    
    handleWait4(pid, targetPid, statusPtr, options, rusagePtr) {
        // Mock - return ECHILD
        return { error: ERRNO.ECHILD };
    }
    
    handleClone(pid, flags, stackPtr, parent_tid, child_tid, tls) {
        // Mock - return ENOSYS (we use Worker spawn instead)
        return { error: ERRNO.ENOSYS };
    }
    
    handleExecve(pid, pathnamePtr, argvPtr, envpPtr, dataView) {
        const path = this.readStringFromData(dataView, pathnamePtr, 4096);
        console.log(`Mock kernel: execve(${path}) - would load new Wasm binary`);
        return { error: ERRNO.ENOSYS };
    }
    
    // Helpers
    
    readStringFromData(dataView, offset, maxLen) {
        const bytes = [];
        for (let i = 0; i < maxLen && offset + i < dataView.length; i++) {
            const byte = dataView[offset + i];
            if (byte === 0) break;
            bytes.push(byte);
        }
        return new TextDecoder().decode(new Uint8Array(bytes));
    }
    
    /**
     * Main process loop
     */
    processLoop() {
        // Keep worker alive
        setInterval(() => {
            // Cleanup exited processes
            for (const [workerId, proc] of this.processes) {
                if (proc.state === 'exited') {
                    // Cleanup after delay
                }
            }
        }, 1000);
    }
    
    /**
     * Shutdown kernel worker
     */
    shutdown() {
        this.running = false;
        for (const [workerId, proc] of this.processes) {
            // Signal processes to exit
        }
        this.processes.clear();
    }
}

/**
 * Mock Filesystem for testing
 */
class MockFilesystem {
    constructor() {
        this.cwd = new Map(); // pid -> current working directory
        this.files = new Map(); // fd -> { path, position, data }
        this.nextFd = 3;
        this.root = {
            type: 'directory',
            entries: new Map([
                ['bin', { type: 'directory', entries: new Map() }],
                ['etc', { type: 'directory', entries: new Map() }],
                ['home', { type: 'directory', entries: new Map() }],
                ['tmp', { type: 'directory', entries: new Map() }],
                ['dev', { type: 'directory', entries: new Map() }],
                ['proc', { type: 'directory', entries: new Map() }],
            ]),
        };
    }
    
    openat(dirfd, path, flags, mode) {
        const fd = this.nextFd++;
        this.files.set(fd, {
            path,
            position: 0,
            data: new Uint8Array(0),
        });
        return fd;
    }
    
    close(fd) {
        if (!this.files.has(fd)) return -ERRNO.EBADF;
        this.files.delete(fd);
        return 0;
    }
    
    read(fd, count) {
        const file = this.files.get(fd);
        if (!file) return -ERRNO.EBADF;

        const fileSize = file.size || file.data.length;
        const end = Math.min(file.position + count, fileSize);
        const data = file.data.slice(file.position, end);
        file.position = end;
        return data;
    }
    
    write(fd, data) {
        const file = this.files.get(fd);
        if (!file) return -ERRNO.EBADF;

        const endPos = file.position + data.length;
        if (endPos > file.data.length) {
            // Grow by at least 4KB or double, whichever is larger
            // (BrowserFS ATC'19 fix: avoid O(n²) realloc on every append)
            const newSize = Math.max(endPos, file.data.length * 2, file.data.length + 4096);
            const newData = new Uint8Array(newSize);
            newData.set(file.data);
            file.data = newData;
        }
        file.data.set(data, file.position);
        file.position = endPos;
        file.size = Math.max(file.size || 0, endPos);
        return data.length;
    }
    
    lseek(fd, offset, whence) {
        const file = this.files.get(fd);
        if (!file) return -ERRNO.EBADF;
        
        switch (whence) {
            case 0: // SEEK_SET
                file.position = offset;
                break;
            case 1: // SEEK_CUR
                file.position += offset;
                break;
            case 2: // SEEK_END
                file.position = file.data.length + offset;
                break;
            default:
                return -ERRNO.EINVAL;
        }
        return file.position;
    }
    
    fstat(fd) {
        const file = this.files.get(fd);
        if (!file) return null;
        return {
            dev: 0,
            ino: fd,
            mode: 0o100644,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: 0,
            size: file.data.length,
            blksize: 4096,
            blocks: Math.ceil(file.data.length / 512),
        };
    }
    
    statat(dirfd, path, flags) {
        return null; // Mock
    }
    
    getcwd(pid) {
        return this.cwd.get(pid) || '/';
    }
    
    chdir(pid, path) {
        this.cwd.set(pid, path);
        return 0;
    }
    
    mkdirat(dirfd, path, mode) {
        return 0; // Mock
    }
    
    unlinkat(dirfd, path, flags) {
        return 0; // Mock
    }
    
    pipe2(flags) {
        const readFd = this.nextFd++;
        const writeFd = this.nextFd++;
        // Create pipe
        return 0;
    }
    
    dup(oldfd) {
        const file = this.files.get(oldfd);
        if (!file) return -ERRNO.EBADF;
        const newFd = this.nextFd++;
        this.files.set(newFd, { ...file });
        return newFd;
    }
    
    dup3(oldfd, newfd, flags) {
        if (this.files.has(newfd)) {
            this.close(newfd);
        }
        const file = this.files.get(oldfd);
        if (!file) return -ERRNO.EBADF;
        this.files.set(newfd, { ...file });
        return newfd;
    }
    
    fcntl(fd, cmd, arg) {
        return 0; // Mock
    }
}

// Worker entry point
self.onmessage = async (e) => {
    const { type, workerId, sab } = e.data;
    
    if (type === 'init') {
        const kernel = new KernelWorker();
        self.kernel = kernel;
        await kernel.init();
        self.postMessage({ type: 'ready' });
    } else if (type === 'register') {
        const pid = self.kernel.registerProcess(workerId, sab);
        self.postMessage({ type: 'registered', workerId, pid });
    } else if (type === 'shutdown') {
        if (self.kernel) {
            self.kernel.shutdown();
        }
    }
};

// Auto-init if running standalone
if (typeof self !== 'undefined' && self.postMessage) {
    // Worker context
}

export { KernelWorker, MockFilesystem };
export default KernelWorker;
