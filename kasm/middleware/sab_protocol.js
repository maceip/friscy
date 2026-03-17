/**
 * SAB Protocol - SharedArrayBuffer Syscall Channel
 * 
 * Design (validated by ATC'19 paper + Browsix source):
 * - 64KB auxiliary SAB per process, separate from Wasm memory
 * - SAB layout optimized for minimal Atomics operations
 * 
 * Research insight (ATC'19): "The cost of these memory copy operations is 
 * dwarfed by the overall cost of the system call invocation." 
 * Copy freely between process Wasm memory and the SAB DATA_REGION.
 * 
 * Research insight (Browsix): Use postMessage only for Worker setup/registration. 
 * All syscall data goes through SAB + Atomics on the hot path.
 * 
 * SAB Layout (64KB):
 *   Offset  Size   Field
 *   0       4      STATE (0=idle, 1=request, 2=reply)
 *   4       4      SYSCALL_NR
 *   8       24     ARG0-ARG5 (6 × int32)
 *   32      4      RETVAL
 *   36      4      ERRNO
 *   40      ...    DATA_REGION (65496 bytes)
 * 
 * Total: 64KB = 65536 bytes
 * Header: 40 bytes
 * Data: 65496 bytes
 * 
 * NOTE: This module does NOT import syscall_numbers.js to avoid circular dependencies.
 * Syscall name resolution happens at the kernel side.
 */

// SAB Layout constants
export const SAB_LAYOUT = {
    STATE_OFFSET: 0,
    STATE_SIZE: 4,
    SYSCALL_OFFSET: 4,
    SYSCALL_SIZE: 4,
    ARGS_OFFSET: 8,
    ARGS_SIZE: 24,  // 6 × 4 bytes
    RETVAL_OFFSET: 32,
    RETVAL_SIZE: 4,
    ERRNO_OFFSET: 36,
    ERRNO_SIZE: 4,
    DATA_OFFSET: 40,
    DATA_SIZE: 65496,  // 65536 - 40
    TOTAL_SIZE: 65536,  // 64KB
};

// State constants
export const STATE = {
    IDLE: 0,    // Ready for new syscall
    REQUEST: 1, // Process posted request, waiting for kernel
    REPLY: 2,   // Kernel posted reply, waiting for process
};

// Error constants (errno values)
export const ERRNO = {
    EPERM: 1,      // Operation not permitted
    ENOENT: 2,     // No such file or directory
    ESRCH: 3,      // No such process
    EINTR: 4,      // Interrupted system call
    EIO: 5,        // I/O error
    ENXIO: 6,      // No such device or address
    E2BIG: 7,      // Argument list too long
    ENOEXEC: 8,    // Exec format error
    EBADF: 9,      // Bad file number
    ECHILD: 10,    // No child processes
    EAGAIN: 11,    // Try again
    ENOMEM: 12,    // Out of memory
    EACCES: 13,    // Permission denied
    EFAULT: 14,    // Bad address
    ENOTBLK: 15,   // Block device required
    EBUSY: 16,     // Device or resource busy
    EEXIST: 17,    // File exists
    EXDEV: 18,     // Cross-device link
    ENODEV: 19,    // No such device
    ENOTDIR: 20,   // Not a directory
    EISDIR: 21,    // Is a directory
    EINVAL: 22,    // Invalid argument
    ENFILE: 23,    // File table overflow
    EMFILE: 24,    // Too many open files
    ENOTTY: 25,    // Not a typewriter
    ETXTBSY: 26,   // Text file busy
    EFBIG: 27,     // File too large
    ENOSPC: 28,    // No space left on device
    ESPIPE: 29,    // Illegal seek
    EROFS: 30,     // Read-only file system
    EMLINK: 31,    // Too many links
    EPIPE: 32,     // Broken pipe
    EDOM: 33,      // Math argument out of domain
    ERANGE: 34,    // Math result not representable
    EDEADLK: 35,   // Resource deadlock would occur
    ENAMETOOLONG: 36, // File name too long
    ENOLCK: 37,    // No record locks available
    ENOSYS: 38,    // Function not implemented
    ENOTEMPTY: 39, // Directory not empty
    ELOOP: 40,     // Too many symbolic links
    // ... more errno values as needed
};

/**
 * Create a new syscall channel
 * @param {boolean} isKernel - True if creating kernel-side channel, false for process-side
 * @returns {Object} - Channel object with SAB and helper methods
 */
export function createChannel(isKernel = false) {
    const sab = new SharedArrayBuffer(SAB_LAYOUT.TOTAL_SIZE);
    const stateView = new Int32Array(sab, SAB_LAYOUT.STATE_OFFSET, 1);
    const syscallView = new Int32Array(sab, SAB_LAYOUT.SYSCALL_OFFSET, 1);
    const argsView = new Int32Array(sab, SAB_LAYOUT.ARGS_OFFSET, 6);
    const retvalView = new Int32Array(sab, SAB_LAYOUT.RETVAL_OFFSET, 1);
    const errnoView = new Int32Array(sab, SAB_LAYOUT.ERRNO_OFFSET, 1);
    const dataView = new Uint8Array(sab, SAB_LAYOUT.DATA_OFFSET, SAB_LAYOUT.DATA_SIZE);
    
    // Initialize state to IDLE
    Atomics.store(stateView, 0, STATE.IDLE);
    
    return {
        sab,
        isKernel,
        stateView,
        syscallView,
        argsView,
        retvalView,
        errnoView,
        dataView,
        
        // Helper methods
        getState: () => Atomics.load(stateView, 0),
        setState: (state) => Atomics.store(stateView, 0, state),
        
        getSyscall: () => Atomics.load(syscallView, 0),
        setSyscall: (nr) => Atomics.store(syscallView, 0, nr),
        
        getArgs: () => Array.from(argsView),
        setArgs: (args) => {
            for (let i = 0; i < 6 && i < args.length; i++) {
                Atomics.store(argsView, i, args[i]);
            }
        },
        
        getRetval: () => Atomics.load(retvalView, 0),
        setRetval: (val) => Atomics.store(retvalView, 0, val),
        
        getErrno: () => Atomics.load(errnoView, 0),
        setErrno: (err) => Atomics.store(errnoView, 0, err),
        
        // Data region access
        writeData: (offset, data) => {
            if (offset + data.length > SAB_LAYOUT.DATA_SIZE) {
                throw new Error('Data exceeds SAB DATA_REGION size');
            }
            dataView.set(data, offset);
        },
        
        readData: (offset, length) => {
            if (offset + length > SAB_LAYOUT.DATA_SIZE) {
                throw new Error('Read exceeds SAB DATA_REGION bounds');
            }
            return dataView.slice(offset, offset + length);
        },
        
        // Copy from Wasm memory to SAB DATA_REGION
        copyFromWasm: (wasmMemory, srcOffset, dstOffset, length) => {
            const wasmView = new Uint8Array(wasmMemory.buffer, srcOffset, length);
            dataView.set(wasmView, dstOffset);
        },
        
        // Copy from SAB DATA_REGION to Wasm memory
        copyToWasm: (wasmMemory, srcOffset, dstOffset, length) => {
            const wasmView = new Uint8Array(wasmMemory.buffer, dstOffset, length);
            wasmView.set(dataView.subarray(srcOffset, srcOffset + length));
        },
    };
}

/**
 * Make a syscall request (process side)
 * 
 * This is the hot path - must be exception-free for V8 optimization.
 * Research insight (BrowserFS): Return -errno values, never throw.
 * 
 * @param {Object} channel - Channel object from createChannel()
 * @param {number} syscallNr - Syscall number
 * @param {Array<number>} args - Syscall arguments (up to 6 int32)
 * @param {ArrayBufferView|null} data - Optional data to copy to DATA_REGION
 * @returns {number} - Return value from syscall (or -errno on error)
 */
export function syscallRequest(channel, syscallNr, args = [], data = null) {
    // Wait for IDLE state (should usually be immediate)
    while (Atomics.load(channel.stateView, 0) !== STATE.IDLE) {
        Atomics.wait(channel.stateView, 0, STATE.REPLY, 1000);
    }
    
    // Write syscall number and arguments
    Atomics.store(channel.syscallView, 0, syscallNr);
    for (let i = 0; i < 6 && i < args.length; i++) {
        Atomics.store(channel.argsView, i, args[i]);
    }
    
    // Copy data if provided
    if (data) {
        channel.dataView.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 0);
    }
    
    // Set state to REQUEST and notify kernel
    Atomics.store(channel.stateView, 0, STATE.REQUEST);
    Atomics.notify(channel.stateView, 0, 1);
    
    // Wait for REPLY state
    Atomics.wait(channel.stateView, 0, STATE.REQUEST);
    
    // Read return value and errno
    const retval = Atomics.load(channel.retvalView, 0);
    const errno = Atomics.load(channel.errnoView, 0);
    
    // Reset to IDLE for next syscall
    Atomics.store(channel.stateView, 0, STATE.IDLE);
    
    // Return -errno on error, retval on success
    // Research insight: This pattern allows exception-free syscall hot path
    return errno !== 0 ? -errno : retval;
}

/**
 * Wait for and handle syscall requests (kernel side)
 * 
 * This runs in the kernel Worker and handles syscall routing.
 * 
 * @param {Object} channel - Channel object from createChannel()
 * @param {Function} handler - Syscall handler function(syscallNr, args, dataView)
 * @returns {Promise} - Resolves when channel is closed
 */
export async function syscallAwait(channel, handler) {
    if (!channel.isKernel) {
        throw new Error('syscallAwait should only be called on kernel-side channel');
    }
    
    return new Promise((resolve) => {
        const checkForRequests = () => {
            const state = Atomics.load(channel.stateView, 0);
            
            if (state === STATE.REQUEST) {
                // Read syscall details
                const syscallNr = Atomics.load(channel.syscallView, 0);
                const args = Array.from(channel.argsView);
                
                // Handle the syscall
                const result = handler(syscallNr, args, channel.dataView);
                
                // Write result
                if (result.error) {
                    Atomics.store(channel.errnoView, 0, result.error);
                    Atomics.store(channel.retvalView, 0, -1);
                } else {
                    Atomics.store(channel.errnoView, 0, 0);
                    Atomics.store(channel.retvalView, 0, result.value || 0);
                }
                
                // Set state to REPLY and notify process
                Atomics.store(channel.stateView, 0, STATE.REPLY);
                Atomics.notify(channel.stateView, 0, 1);
            }
            
            // Continue checking (use setTimeout to yield to event loop)
            setTimeout(checkForRequests, 0);
        };
        
        checkForRequests();
    });
}

/**
 * Non-blocking check for syscall requests (kernel side)
 * Use with Atomics.waitAsync for non-blocking operation.
 * 
 * @param {Object} channel - Channel object
 * @returns {Object|null} - Syscall details if REQUEST state, null otherwise
 */
export function syscallCheck(channel) {
    if (Atomics.load(channel.stateView, 0) === STATE.REQUEST) {
        return {
            syscallNr: Atomics.load(channel.syscallView, 0),
            args: Array.from(channel.argsView),
            dataView: channel.dataView,
        };
    }
    return null;
}

/**
 * Post reply to a syscall (kernel side)
 * 
 * @param {Object} channel - Channel object
 * @param {number} retval - Return value
 * @param {number} errno - Error number (0 for success)
 * @param {ArrayBufferView|null} data - Optional data to copy to DATA_REGION
 */
export function syscallReply(channel, retval, errno = 0, data = null) {
    if (!channel.isKernel) {
        throw new Error('syscallReply should only be called on kernel-side channel');
    }
    
    Atomics.store(channel.retvalView, 0, retval);
    Atomics.store(channel.errnoView, 0, errno);
    
    if (data) {
        channel.dataView.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 0);
    }
    
    Atomics.store(channel.stateView, 0, STATE.REPLY);
    Atomics.notify(channel.stateView, 0, 1);
}

/**
 * Latency test for SAB protocol
 * Performs 100K round-trips and measures time.
 * 
 * @param {Object} channel - Channel object
 * @returns {Object} - Test results { totalTime, roundTrips, avgLatency }
 */
export async function testLatency(channel) {
    const roundTrips = 100000;
    const startTime = performance.now();
    
    for (let i = 0; i < roundTrips; i++) {
        // Make a simple syscall (getpid = 172 in asm-generic)
        syscallRequest(channel, 172, []);
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    return {
        totalTime,
        roundTrips,
        avgLatency: totalTime / roundTrips,
        passed: totalTime < 2000, // Target: under 2 seconds for 100K
    };
}

// Export all components
// Note: Syscall name/number mappings are in syscall_numbers.js
// Import from there if you need syscall name resolution.
