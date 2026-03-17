/**
 * Process Manager - Standard process lifecycle
 * 
 * Manages process creation, execution, and termination.
 * Coordinates between main thread, kernel worker, and process workers.
 */

import { ProcessWorker } from './process_worker.js';
import { KernelWorker } from './kernel_worker.js';
import { createChannel } from './sab_protocol.js';
import { loadWasmModuleFromRootfs } from './rootfs_loader.js';

/**
 * Process Manager - Manages all processes in the system
 */
export class ProcessManager {
    constructor() {
        this.processes = new Map(); // pid -> ProcessWorker
        this.kernelWorker = null;
        this.nextWorkerId = 1;
        this.running = false;
    }
    
    /**
     * Initialize the process manager
     */
    async init() {
        // Create kernel worker
        this.kernelWorker = new Worker('./kernel_worker.js', { type: 'module' });
        
        // Wait for kernel ready
        await new Promise((resolve) => {
            this.kernelWorker.onmessage = (e) => {
                if (e.data.type === 'ready') {
                    resolve();
                }
            };
            this.kernelWorker.postMessage({ type: 'init' });
        });
        
        this.running = true;
        console.log('ProcessManager: Initialized');
    }
    
    /**
     * Spawn a new process in a Web Worker
     * 
     * @param {string} executable - Path to Wasm binary
     * @param {Array<string>} argv - Command line arguments
     * @param {Object} envp - Environment variables
     * @param {Object} options - Additional options (cwd, fds, etc.)
     * @returns {Promise<number>} - Process ID
     */
    async spawn(executable, argv = [], envp = {}, options = {}) {
        const workerId = this.nextWorkerId++;
        
        // Load Wasm module in main thread (can be cached)
        const module = await this.loadWasmModule(executable);
        
        // Create Web Worker for the process
        const worker = new Worker('./process_worker_thread.js', { type: 'module' });
        
        // Wait for worker ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Worker init timeout')), 5000);
            
            worker.onmessage = (e) => {
                if (e.data.type === 'ready') {
                    clearTimeout(timeout);
                    resolve();
                }
            };
        });
        
        // Send initialization data to worker
        const initPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Process spawn timeout')), 10000);
            
            worker.onmessage = (e) => {
                if (e.data.type === 'init_complete') {
                    clearTimeout(timeout);
                    resolve(e.data);
                } else if (e.data.type === 'error') {
                    clearTimeout(timeout);
                    reject(new Error(e.data.message));
                }
            };
        });
        
        // Send init message with module and args
        worker.postMessage({
            type: 'init',
            executable: executable,
            wasmModule: module,
            argv: argv,
            envp: envp,
            options: options,
            kernelPort: this.kernelWorker,
        }, [this.kernelWorker]); // Transfer MessageChannel
        
        const result = await initPromise;
        
        // Store process reference
        const process = {
            pid: result.pid,
            workerId: workerId,
            worker: worker,
            executable: executable,
            argv: argv,
            state: 'running',
        };
        
        this.processes.set(result.pid, process);
        
        // Handle worker messages
        worker.onmessage = (e) => {
            if (e.data.type === 'exit') {
                this.handleProcessExit(result.pid, e.data.exitCode);
            } else if (e.data.type === 'error') {
                console.error(`Process ${result.pid} error:`, e.data.message);
                this.handleProcessExit(result.pid, -1);
            }
        };
        
        return result.pid;
    }
    
    /**
     * Load a Wasm module
     */
    async loadWasmModule(path) {
        // Try to load from various sources
        // 1. OPFS (Origin Private File System) - cached
        // 2. Rootfs assembly output
        // 3. Fetch from network / explicit URL
        
        // Try OPFS
        try {
            if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
                const root = await navigator.storage.getDirectory();
                const opfsPath = path.replace(/^\/+/, '');
                const fileHandle = await root.getFileHandle(opfsPath);
                const file = await fileHandle.getFile();
                const arrayBuffer = await file.arrayBuffer();
                return await WebAssembly.compile(arrayBuffer);
            }
        } catch (e) {
            console.log(`Failed to load ${path} from OPFS`);
        }
        
        // Try from assembled rootfs tree
        try {
            return await loadWasmModuleFromRootfs(path);
        } catch (e) {
            console.log(`Failed to load ${path} from rootfs`);
        }

        // Try direct fetch for explicit URLs or dev-server paths
        try {
            if (typeof fetch === 'function') {
                const response = await fetch(path);
                if (response.ok) {
                    if (WebAssembly.compileStreaming) {
                        try {
                            return await WebAssembly.compileStreaming(fetch(path));
                        } catch (err) {
                            // Fall back to arrayBuffer below if MIME type is wrong.
                        }
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    return await WebAssembly.compile(arrayBuffer);
                }
            }
        } catch (e) {
            console.log(`Failed to fetch ${path} from network`);
        }

        throw new Error(`Cannot load Wasm module: ${path}`);
    }
    
    /**
     * Fork a process
     * 
     * @param {number} parentPid - Parent process ID
     * @returns {Promise<number>} - Child process ID (0 to child, pid to parent)
     */
    async fork(parentPid) {
        const parent = this.processes.get(parentPid);
        if (!parent) {
            throw new Error(`Parent process ${parentPid} not found`);
        }
        
        const workerId = this.nextWorkerId++;
        
        // Clone parent's Wasm memory
        const memoryClone = this.cloneMemory(parent.memory);
        
        // Create child process
        const child = new ProcessWorker(workerId, parent.wasmModule, this.kernelWorker);
        
        // Copy FD table
        child.fdTable.deserialize(parent.fdTable.serialize());
        
        // Register with kernel
        const pid = await new Promise((resolve) => {
            this.kernelWorker.postMessage({ type: 'register', workerId, sab: child.channel.sab });
            
            const handler = (e) => {
                if (e.data.type === 'registered' && e.data.workerId === workerId) {
                    this.kernelWorker.removeEventListener('message', handler);
                    resolve(e.data.pid);
                }
            };
            this.kernelWorker.addEventListener('message', handler);
        });
        
        child.pid = pid;
        this.processes.set(pid, child);
        
        // In real fork, parent returns child pid, child returns 0
        // Here we simulate that by starting child with modified state
        return pid;
    }
    
    /**
     * Execute a new program (execve)
     * 
     * @param {number} pid - Process ID
     * @param {string} executable - New executable path
     * @param {Array<string>} argv - New arguments
     * @param {Object} envp - New environment
     */
    async execve(pid, executable, argv, envp) {
        const process = this.processes.get(pid);
        if (!process) {
            throw new Error(`Process ${pid} not found`);
        }
        
        // Load new Wasm module
        const newModule = await this.loadWasmModule(executable);
        
        // Replace process instance
        process.wasmModule = newModule;
        process.instance = null; // Will be reinstantiated
        
        // Re-init with new program
        await process.init(argv, envp);
    }
    
    /**
     * Wait for a child process
     * 
     * @param {number} pid - Process ID to wait for (-1 for any child)
     * @param {number} options - Wait options
     * @returns {Promise<{pid: number, status: number}>}
    */
    async wait4(pid, options = 0) {
        return new Promise((resolve) => {
            const checkProcesses = () => {
                for (const [childPid, process] of this.processes) {
                    if (pid === -1 || pid === childPid) {
                        if (process.state === 'exited') {
                            resolve({ pid: childPid, status: process.exitCode });
                            return;
                        }
                    }
                }
                
                // Check again after delay
                setTimeout(checkProcesses, 10);
            };
            
            checkProcesses();
        });
    }
    
    /**
     * Kill a process
     * 
     * @param {number} pid - Process ID
     * @param {number} signal - Signal number
     */
    kill(pid, signal) {
        const process = this.processes.get(pid);
        if (!process) {
            return -1; // ESRCH
        }
        
        // Signal handling (simplified)
        if (signal === 9) { // SIGKILL
            process.state = 'exited';
            process.exitCode = 128 + signal;
        }
        
        return 0;
    }
    
    /**
     * Get process info
     */
    getProcess(pid) {
        return this.processes.get(pid);
    }
    
    /**
     * List all processes
     */
    listProcesses() {
        return Array.from(this.processes.values()).map(p => ({
            pid: p.pid,
            state: p.state,
            workerId: p.workerId,
        }));
    }
    
    /**
     * Handle process exit
     */
    handleProcessExit(pid, exitCode) {
        const process = this.processes.get(pid);
        if (process) {
            process.state = 'exited';
            process.exitCode = exitCode;
            console.log(`Process ${pid} exited with code ${exitCode}`);
        }
    }
    
    /**
     * Clone Wasm memory for fork
     */
    cloneMemory(memory) {
        const oldBuffer = memory.buffer;
        const newBuffer = new ArrayBuffer(oldBuffer.byteLength);
        const oldView = new Uint8Array(oldBuffer);
        const newView = new Uint8Array(newBuffer);
        newView.set(oldView);
        return newBuffer;
    }
    
    /**
     * Shutdown process manager
     */
    async shutdown() {
        this.running = false;
        
        // Kill all processes
        for (const [pid, process] of this.processes) {
            this.kill(pid, 9);
        }
        
        // Shutdown kernel
        if (this.kernelWorker) {
            this.kernelWorker.postMessage({ type: 'shutdown' });
            this.kernelWorker.terminate();
        }
        
        this.processes.clear();
        console.log('ProcessManager: Shutdown complete');
    }
}

// Export singleton instance for convenience
export const processManager = new ProcessManager();

export default ProcessManager;
