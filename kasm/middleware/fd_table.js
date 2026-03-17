/**
 * FD Table - File Descriptor Management
 * 
 * Research insight (BrowserFS fork): Add dev and ino tracking per file entry — 
 * needed for stat() to return correct POSIX values.
 * 
 * V8 treats throw as a deopt — the syscall hot path must be exception-free.
 * Return -errno values instead of throwing.
 */

// Errno constants (duplicated here to avoid import cycle)
const ERRNO = {
    EPERM: 1,
    ENOENT: 2,
    ESRCH: 3,
    EINTR: 4,
    EIO: 5,
    ENXIO: 6,
    E2BIG: 7,
    ENOEXEC: 8,
    EBADF: 9,
    ECHILD: 10,
    EAGAIN: 11,
    ENOMEM: 12,
    EACCES: 13,
    EFAULT: 14,
    ENOTBLK: 15,
    EBUSY: 16,
    EEXIST: 17,
    EXDEV: 18,
    ENODEV: 19,
    ENOTDIR: 20,
    EISDIR: 21,
    EINVAL: 22,
    ENFILE: 23,
    EMFILE: 24,
    ENOTTY: 25,
    ETXTBSY: 26,
    EFBIG: 27,
    ENOSPC: 28,
    ESPIPE: 29,
    EROFS: 30,
    EMLINK: 31,
    EPIPE: 32,
    EDOM: 33,
    ERANGE: 34,
    EDEADLK: 35,
    ENAMETOOLONG: 36,
    ENOLCK: 37,
    ENOSYS: 38,
    ENOTEMPTY: 39,
    ELOOP: 40,
};

/**
 * FDTable class - Manages file descriptors for a process
 */
class FDTable {
    constructor() {
        this._nextFd = 3;  // 0, 1, 2 reserved for stdio
        this._nextDev = 1; // Start at 1 (0 reserved)
        this._nextIno = 3; // Start after stdio
        this.fds = new Map([
            [0, { type: 'stdio', name: 'stdin', dev: 0, ino: 0, flags: 0, position: 0 }],
            [1, { type: 'stdio', name: 'stdout', dev: 0, ino: 1, flags: 0, position: 0 }],
            [2, { type: 'stdio', name: 'stderr', dev: 0, ino: 2, flags: 0, position: 0 }],
        ]);
    }
    
    /**
     * Allocate a new file descriptor
     * @param {Object} entry - File entry with path, flags, etc.
     * @returns {number} - File descriptor number (or -errno on error)
     */
    allocate(entry) {
        if (this._nextFd > 65535) {
            return -ERRNO.EMFILE; // Too many open files
        }
        
        const fd = this._nextFd++;
        this.fds.set(fd, {
            type: entry.type || 'file',
            path: entry.path,
            name: entry.name || entry.path,
            dev: entry.dev !== undefined ? entry.dev : this._nextDev++,
            ino: entry.ino !== undefined ? entry.ino : this._nextIno++,
            flags: entry.flags || 0,
            position: entry.position || 0,
            mode: entry.mode || 0,
            size: entry.size || 0,
        });
        
        return fd;
    }
    
    /**
     * Get file entry by descriptor
     * @param {number} fd - File descriptor
     * @returns {Object|number} - File entry (or -errno on error)
     */
    get(fd) {
        const entry = this.fds.get(fd);
        if (!entry) {
            return -ERRNO.EBADF; // Bad file number
        }
        return entry;
    }
    
    /**
     * Check if fd is valid
     * @param {number} fd - File descriptor
     * @returns {boolean}
     */
    isValid(fd) {
        return this.fds.has(fd);
    }
    
    /**
     * Update file position
     * @param {number} fd - File descriptor
     * @param {number} position - New position
     * @returns {number} - 0 on success, -errno on error
     */
    setPosition(fd, position) {
        const entry = this.fds.get(fd);
        if (!entry) {
            return -ERRNO.EBADF;
        }
        entry.position = position;
        return 0;
    }
    
    /**
     * Get file position
     * @param {number} fd - File descriptor
     * @returns {number} - Position (or -errno on error)
     */
    getPosition(fd) {
        const entry = this.fds.get(fd);
        if (!entry) {
            return -ERRNO.EBADF;
        }
        return entry.position;
    }
    
    /**
     * Close a file descriptor
     * @param {number} fd - File descriptor
     * @returns {number} - 0 on success, -errno on error
     */
    close(fd) {
        if (!this.fds.has(fd)) {
            return -ERRNO.EBADF;
        }
        
        // Don't close stdio
        if (fd < 3) {
            return -ERRNO.EPERM;
        }
        
        this.fds.delete(fd);
        return 0;
    }
    
    /**
     * Duplicate a file descriptor
     * @param {number} oldFd - Old file descriptor
     * @param {number} newFd - New file descriptor (optional, -1 for allocate)
     * @param {number} flags - Flags for dup3 (optional)
     * @returns {number} - New fd on success, -errno on error
     */
    dup(oldFd, newFd = -1, flags = 0) {
        const oldEntry = this.fds.get(oldFd);
        if (!oldEntry) {
            return -ERRNO.EBADF;
        }
        
        // If newFd specified, close it first (dup3 behavior)
        if (newFd >= 0) {
            if (newFd === oldFd) {
                return newFd; // No-op
            }
            if (this.fds.has(newFd)) {
                this.close(newFd);
            }
            this._nextFd = Math.max(this._nextFd, newFd + 1);
        } else {
            newFd = this._nextFd++;
        }
        
        // Copy entry
        this.fds.set(newFd, {
            ...oldEntry,
            flags: flags || oldEntry.flags,
        });
        
        return newFd;
    }
    
    /**
     * Get stat info for a file descriptor
     * @param {number} fd - File descriptor
     * @returns {Object|number} - Stat object (or -errno on error)
     */
    fstat(fd) {
        const entry = this.fds.get(fd);
        if (!entry) {
            return -ERRNO.EBADF;
        }
        
        // Return POSIX stat structure fields
        return {
            dev: entry.dev,
            ino: entry.ino,
            mode: entry.mode || (entry.type === 'directory' ? 0o40755 : 0o100644),
            nlink: 1,
            uid: 1000,
            gid: 1000,
            rdev: 0,
            size: entry.size || 0,
            blksize: 4096,
            blocks: Math.ceil((entry.size || 0) / 512),
            atime: Date.now(),
            mtime: Date.now(),
            ctime: Date.now(),
        };
    }
    
    /**
     * Create a pipe (pipe2)
     * @param {number} flags - Flags (O_CLOEXEC, O_NONBLOCK)
     * @param {Object} kernelPipe - Kernel pipe object for cross-process pipes
     * @returns {Array|number} - [readFd, writeFd] on success, -errno on error
     */
    pipe2(flags = 0, kernelPipe = null) {
        const readFd = this._nextFd++;
        const writeFd = this._nextFd++;
        
        this.fds.set(readFd, {
            type: 'pipe',
            name: `pipe:[${this._nextIno}]`,
            dev: 0,
            ino: this._nextIno++,
            flags: flags,
            pipeEnd: 'read',
            // Use kernel-provided pipe for cross-process communication
            kernelPipe: kernelPipe,
        });
        
        this.fds.set(writeFd, {
            type: 'pipe',
            name: `pipe:[${this._nextIno}]`,
            dev: 0,
            ino: this._nextIno++,
            flags: flags,
            pipeEnd: 'write',
            kernelPipe: kernelPipe,
        });
        
        return [readFd, writeFd];
    }
    
    /**
     * Get all open file descriptors
     * @returns {Array<number>} - Array of fd numbers
     */
    getAllFds() {
        return Array.from(this.fds.keys());
    }
    
    /**
     * Serialize FD table for fork
     * @returns {Object} - Serializable FD table state
     */
    serialize() {
        return {
            nextFd: this._nextFd,
            nextDev: this._nextDev,
            nextIno: this._nextIno,
            fds: Array.from(this.fds.entries()).map(([fd, entry]) => [fd, { ...entry, buffer: undefined }]),
        };
    }
    
    /**
     * Deserialize FD table from fork
     * @param {Object} data - Serialized FD table state
     */
    deserialize(data) {
        this._nextFd = data.nextFd;
        this._nextDev = data.nextDev;
        this._nextIno = data.nextIno;
        this.fds = new Map(data.fds);
    }
}

/**
 * Simple ring buffer for pipe implementation
 */
class RingBuffer {
    constructor(size) {
        this.buffer = new Uint8Array(size);
        this.readPos = 0;
        this.writePos = 0;
        this.size = size;
        this.closed = false;
    }
    
    write(data) {
        if (this.closed) return -1;
        
        const available = this.size - this.used();
        if (available === 0) return 0; // Full
        
        const toWrite = Math.min(data.length, available);
        for (let i = 0; i < toWrite; i++) {
            this.buffer[this.writePos] = data[i];
            this.writePos = (this.writePos + 1) % this.size;
        }
        
        return toWrite;
    }
    
    read(length) {
        const available = this.used();
        const toRead = Math.min(length, available);
        
        const result = new Uint8Array(toRead);
        for (let i = 0; i < toRead; i++) {
            result[i] = this.buffer[this.readPos];
            this.readPos = (this.readPos + 1) % this.size;
        }
        
        return result;
    }
    
    used() {
        if (this.writePos >= this.readPos) {
            return this.writePos - this.readPos;
        }
        return this.size - this.readPos + this.writePos;
    }
    
    close() {
        this.closed = true;
    }
}

// Export
export { FDTable };
export default FDTable;
