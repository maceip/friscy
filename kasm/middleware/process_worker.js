/**
 * Process Worker - Per-Process Wasm Execution
 * 
 * Research insight (Browsix wasm-loader-browsix): Use a single __syscall 
 * import for all syscalls, not 60 separate imports.
 * 
 * Research insight (deno-wasi iovec pattern): For read/write/writev/readv, 
 * walk the iovec array using DataView + Uint8Array dual access on the Wasm 
 * linear memory.
 */

// Note: We avoid importing syscall_numbers.js here to prevent circular deps.
// The syscall numbers are resolved at the kernel side.
import { createChannel, syscallRequest, SAB_LAYOUT } from './sab_protocol.js';
import { FDTable } from './fd_table.js';

// Local copy of errno to avoid circular import
const ERRNO = {
    EPERM: 1, ENOENT: 2, ESRCH: 3, EINTR: 4, EIO: 5,
    ENXIO: 6, E2BIG: 7, ENOEXEC: 8, EBADF: 9, ECHILD: 10,
    EAGAIN: 11, ENOMEM: 12, EACCES: 13, EFAULT: 14, ENOTBLK: 15,
    EBUSY: 16, EEXIST: 17, EXDEV: 18, ENODEV: 19, ENOTDIR: 20,
    EISDIR: 21, EINVAL: 22, ENFILE: 23, EMFILE: 24, ENOTTY: 25,
    ETXTBSY: 26, EFBIG: 27, ENOSPC: 28, ESPIPE: 29, EROFS: 30,
    EMLINK: 31, EPIPE: 32, EDOM: 33, ERANGE: 34, EDEADLK: 35,
    ENAMETOOLONG: 36, ENOLCK: 37, ENOSYS: 38, ENOTEMPTY: 39,
    ELOOP: 40,
};

// Local syscall numbers for local handling
const LOCAL_SYS = {
    brk: 214, munmap: 215, mmap: 222, mmap2: 222, mprotect: 226, mremap: 234,
    clock_gettime: 113, clock_getres: 114, getpid: 172, getppid: 173,
    getrandom: 278, uname: 160,
};

/**
 * Process Worker State
 */
class ProcessWorker {
    constructor(workerId, wasmModule, kernelPort) {
        this.workerId = workerId;
        this.wasmModule = wasmModule;
        this.kernelPort = kernelPort;
        this.instance = null;
        this.memory = null;
        this.fdTable = new FDTable();
        this.channel = createChannel(false); // Process-side channel
        this.pid = null;
        this.exitCode = null;
        this.mmapShim = null; // Set to mmap-shim Wasm module instance if available

        // Local state for local syscalls
        this.brk = 0x100000; // Initial break
        this.startTime = Date.now();
    }
    
    /**
     * Initialize the Wasm instance
     */
    async init(argv = [], envp = {}) {
        // Send SAB to kernel for registration
        this.kernelPort.postMessage({
            type: 'register',
            workerId: this.workerId,
            sab: this.channel.sab,
        });
        
        // Wait for pid assignment
        const pidPromise = new Promise((resolve) => {
            this.kernelPort.onmessage = (e) => {
                if (e.data.type === 'registered') {
                    this.pid = e.data.pid;
                    resolve(this.pid);
                }
            };
        });
        
        this.pid = await pidPromise;
        
        // Create syscall import
        const imports = this.createImports(argv, envp);
        
        // Instantiate Wasm module
        this.instance = await WebAssembly.instantiate(this.wasmModule, imports);
        this.memory = this.instance.exports.memory;
        
        // Run _start or main
        if (this.instance.exports._start) {
            return this.instance.exports._start();
        } else if (this.instance.exports.main) {
            return this.instance.exports.main(argv.length, 0); // argc, argv pointer
        }
        
        return 0;
    }
    
    /**
     * Create Wasm imports object
     * Single __syscall import for all syscalls (Browsix pattern)
     */
    createImports(argv, envp) {
        const self = this;
        
        return {
            env: {
                // Single syscall import (Browsix pattern)
                __syscall: (nr, a0, a1, a2, a3, a4, a5) => {
                    return self.handleSyscall(nr, a0, a1, a2, a3, a4, a5);
                },
                
                // musl libc may use these directly
                __syscall0: (nr) => self.handleSyscall(nr, 0, 0, 0, 0, 0, 0),
                __syscall1: (nr, a0) => self.handleSyscall(nr, a0, 0, 0, 0, 0, 0),
                __syscall2: (nr, a0, a1) => self.handleSyscall(nr, a0, a1, 0, 0, 0, 0),
                __syscall3: (nr, a0, a1, a2) => self.handleSyscall(nr, a0, a1, a2, 0, 0, 0),
                __syscall4: (nr, a0, a1, a2, a3) => self.handleSyscall(nr, a0, a1, a2, a3, 0, 0),
                __syscall5: (nr, a0, a1, a2, a3, a4) => self.handleSyscall(nr, a0, a1, a2, a3, a4, 0),
                __syscall6: (nr, a0, a1, a2, a3, a4, a5) => self.handleSyscall(nr, a0, a1, a2, a3, a4, a5),
                
                // Memory and table: provided by the Wasm module's own exports.
                // Only supply these if the module imports (not exports) them.
                // Most Emscripten binaries export their own memory.
                // The init() method sets this.memory = instance.exports.memory.
            },
            
            // Note: WASI compatibility removed (FIX #8)
            // Emscripten's musl uses __syscall_* functions directly, not WASI.
            // WASI is not needed when using Emscripten-compiled binaries.
        };
    }
    
    /**
     * Handle a syscall from Wasm
     * 
     * Research insight (Browsix): Handle locally if possible, route to kernel
     * for complex syscalls.
     * 
     * Research insight (BrowserFS): Return -errno, never throw on hot path.
     */
    handleSyscall(nr, a0, a1, a2, a3, a4, a5) {
        // Handle local syscalls (no kernel round-trip)
        if (isLocalSyscall(nr)) {
            return this.handleLocalSyscall(nr, a0, a1, a2, a3, a4, a5);
        }
        
        // Marshal data for read/write/stat via SAB DATA_REGION
        const dataInfo = this.marshalSyscallData(nr, a0, a1, a2, a3);
        
        // Copy data to SAB if needed
        if (dataInfo && dataInfo.copyToSab) {
            this.channel.copyFromWasm(
                this.memory,
                dataInfo.srcOffset,
                dataInfo.dstOffset,
                dataInfo.length
            );
        }
        
        // Block until kernel replies
        const result = syscallRequest(this.channel, nr, [a0, a1, a2, a3, a4, a5]);
        
        // Copy data from SAB if needed (e.g., read syscall)
        if (dataInfo && dataInfo.copyFromSab && result >= 0) {
            this.channel.copyToWasm(
                this.memory,
                dataInfo.srcOffset,
                dataInfo.dstOffset,
                Math.min(result, dataInfo.length)
            );
        }
        
        return result;
    }
    
    /**
     * Handle local syscalls (no kernel round-trip needed)
     */
    handleLocalSyscall(nr, a0, a1, a2, a3, a4, a5) {
        // Check if this is a local syscall
        const isLocal = [
            LOCAL_SYS.brk, LOCAL_SYS.munmap, LOCAL_SYS.mmap, LOCAL_SYS.mmap2,
            LOCAL_SYS.mprotect, LOCAL_SYS.mremap, LOCAL_SYS.clock_gettime,
            LOCAL_SYS.clock_getres, LOCAL_SYS.getpid, LOCAL_SYS.getppid,
            LOCAL_SYS.getrandom, LOCAL_SYS.uname,
        ].includes(nr);
        
        if (!isLocal) {
            // Not a local syscall - should be routed to kernel
            return null;
        }
        
        switch (nr) {
            case LOCAL_SYS.brk:
                return this.handleBrk(a0);
                
            case LOCAL_SYS.clock_gettime:
            case LOCAL_SYS.clock_getres:
                return this.handleClockGettime(a0, a1);
                
            case LOCAL_SYS.getpid:
                return this.pid || 1;
                
            case LOCAL_SYS.getppid:
                return 0; // TODO: Track parent pid
                
            case LOCAL_SYS.getrandom:
                return this.handleGetrandom(a0, a1, a2);
                
            case LOCAL_SYS.uname:
                return this.handleUname(a0);
                
            case LOCAL_SYS.mmap:
            case LOCAL_SYS.mmap2:
                // Route to mmap-shim. a0=addr, a1=length, a2=prot, a3=flags, a4=fd, a5=offset
                if (this.mmapShim) {
                    return this.mmapShim._wasm_mmap(a0, a1, a2, a3, a4, a5);
                }
                // Fallback: route to kernel
                return null;

            case LOCAL_SYS.munmap:
                if (this.mmapShim) {
                    return this.mmapShim._wasm_munmap(a0, a1);
                }
                return null;

            case LOCAL_SYS.mprotect:
                if (this.mmapShim) {
                    return this.mmapShim._wasm_mprotect(a0, a1, a2);
                }
                return null;

            case LOCAL_SYS.mremap:
                if (this.mmapShim) {
                    return this.mmapShim._wasm_mremap(a0, a1, a2, a3, a4);
                }
                return null;
                
            default:
                return -ERRNO.ENOSYS;
        }
    }
    
    /**
     * Marshal syscall data for SAB
     * Returns info about data that needs to be copied
     */
    marshalSyscallData(nr, a0, a1, a2, a3) {
        // Common syscall numbers for read/write/open
        const SYS_WRITE = 64;  // asm-generic
        const SYS_WRITEV = 66;
        const SYS_READ = 63;
        const SYS_READV = 65;
        const SYS_OPENAT = 56;
        const SYS_GETCWD = 17;
        
        // Determine if we need to copy data to/from SAB
        switch (nr) {
            case SYS_WRITE:
            case SYS_WRITEV:
                // Copy data from Wasm memory to SAB
                return {
                    copyToSab: true,
                    srcOffset: a1, // buf pointer
                    dstOffset: 0,
                    length: a2, // count
                };
                
            case SYS_READ:
            case SYS_READV:
                // Copy data from SAB to Wasm memory after syscall
                return {
                    copyToSab: false,
                    copyFromSab: true,
                    srcOffset: 0,
                    dstOffset: a1, // buf pointer
                    length: a2, // count
                };
                
            case SYS_OPENAT:
                // Copy path string to SAB
                if (a1) {
                    const path = this.readCString(a1);
                    const pathBytes = new TextEncoder().encode(path);
                    this.channel.writeData(0, pathBytes);
                    return {
                        copyToSab: false, // Already copied above
                        pathLength: pathBytes.length,
                    };
                }
                return null;
                
            case SYS_GETCWD:
                // Copy result to Wasm memory after syscall
                return {
                    copyFromSab: true,
                    srcOffset: 0,
                    dstOffset: a0, // buf
                    length: a1, // size
                };
                
            default:
                return null;
        }
    }
    
    /**
     * Handle brk syscall (local)
     */
    handleBrk(newBrk) {
        if (newBrk === 0) {
            return this.brk; // Query current break
        }
        
        if (newBrk < 0x100000) {
            return -ERRNO.EINVAL;
        }
        
        // Check against memory limit
        const memorySize = this.memory.buffer.byteLength;
        if (newBrk > memorySize) {
            // Try to grow memory
            const delta = Math.ceil((newBrk - memorySize) / 65536);
            const oldPages = this.memory.grow(delta);
            if (oldPages === -1) {
                return -ERRNO.ENOMEM;
            }
        }
        
        this.brk = newBrk;
        return newBrk;
    }
    
    /**
     * Handle clock_gettime syscall (local)
     */
    handleClockGettime(clockId, timespecPtr) {
        const now = Date.now();
        const seconds = Math.floor(now / 1000);
        const nanoseconds = (now % 1000) * 1000000;
        
        // Write timespec structure to Wasm memory
        const view = new DataView(this.memory.buffer);
        view.setBigInt64(timespecPtr, BigInt(seconds), true);
        view.setBigInt64(timespecPtr + 8, BigInt(nanoseconds), true);
        
        return 0;
    }
    
    /**
     * Handle getrandom syscall (local)
     */
    handleGetrandom(bufPtr, bufLen, flags) {
        // crypto.getRandomValues max is 65536 bytes per call
        const view = new Uint8Array(this.memory.buffer, bufPtr, bufLen);
        let offset = 0;
        while (offset < bufLen) {
            const chunk = Math.min(bufLen - offset, 65536);
            const sub = new Uint8Array(this.memory.buffer, bufPtr + offset, chunk);
            crypto.getRandomValues(sub);
            offset += chunk;
        }
        return bufLen;
    }
    
    /**
     * Handle uname syscall (local)
    */
    handleUname(utsnamePtr) {
        const fields = [
            'Linux',     // sysname
            'kasm',      // nodename
            '6.6.0',     // release
            '#1',        // version
            'wasm32',    // machine
            '',          // domainname
        ];
        
        let offset = utsnamePtr;
        for (const field of fields) {
            this.writeCString(offset, field, 65); // 65 bytes per field
            offset += 65;
        }
        
        return 0;
    }
    
    /**
     * Read null-terminated string from Wasm memory
     */
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
    
    /**
     * Write null-terminated string to Wasm memory
     */
    writeCString(ptr, str, maxLen) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        const view = new Uint8Array(this.memory.buffer);
        
        const len = Math.min(bytes.length, maxLen - 1);
        for (let i = 0; i < len; i++) {
            view[ptr + i] = bytes[i];
        }
        view[ptr + len] = 0; // Null terminator
    }
    
}

// Export
export { ProcessWorker };
export default ProcessWorker;
