/**
 * Kernel Loader - Bootstraps the LKL kernel in browser
 * 
 * This module loads and initializes the LKL kernel compiled to Wasm.
 * For now, uses mock kernel; will switch to real LKL when G1 lands.
 */

import { KernelWorker } from '../middleware/kernel_worker.js';

/**
 * Kernel loader state
 */
class KernelLoader {
    constructor() {
        this.kernelWorker = null;
        this.kernelModule = null;
        this.isRealKernel = false;
    }

    /**
     * Initialize kernel
     * 
     * Attempts to load real LKL kernel first, falls back to mock.
     */
    async init() {
        console.log('KernelLoader: Initializing...');

        // Try to load real kernel (G1+G3 will provide this)
        try {
            const kernelResponse = await fetch('../kernel/kernel.wasm');
            if (kernelResponse.ok) {
                console.log('KernelLoader: Real kernel found, loading...');
                
                // Compile kernel module
                this.kernelModule = await WebAssembly.compileStreaming(kernelResponse);
                
                // Check for kasm_syscall export (the integration point)
                const exports = WebAssembly.Module.exports(this.kernelModule);
                const hasSyscall = exports.some(e => e.name === '_kasm_syscall');
                
                if (hasSyscall) {
                    console.log('KernelLoader: Real kernel with _kasm_syscall found');
                    this.isRealKernel = true;
                    await this.initRealKernel();
                    return;
                } else {
                    console.log('KernelLoader: Kernel missing _kasm_syscall, using mock');
                }
            }
        } catch (e) {
            console.log('KernelLoader: Real kernel not available:', e.message);
        }

        // Fall back to mock kernel
        console.log('KernelLoader: Using mock kernel (G1+G3 pending)');
        await this.initMockKernel();
    }

    /**
     * Initialize real LKL kernel
     */
    async initRealKernel() {
        // Create kernel worker with real module
        this.kernelWorker = new Worker('./kernel_worker.js', { type: 'module' });
        
        // Transfer kernel module to worker
        this.kernelWorker.postMessage({
            type: 'init_real',
            kernelModule: this.kernelModule,
        }, [this.kernelModule]);

        // Wait for ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Kernel init timeout')), 10000);
            
            this.kernelWorker.onmessage = (e) => {
                if (e.data.type === 'ready') {
                    clearTimeout(timeout);
                    resolve();
                } else if (e.data.type === 'error') {
                    clearTimeout(timeout);
                    reject(new Error(e.data.message));
                }
            };
        });

        console.log('KernelLoader: Real kernel initialized');
    }

    /**
     * Initialize mock kernel and spawn first process
     */
    async initMockKernel() {
        // Create mock kernel worker
        this.kernelWorker = new Worker('./kernel_worker.js', { type: 'module' });
        
        this.kernelWorker.postMessage({ type: 'init_mock' });

        // Wait for ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Kernel init timeout')), 5000);
            
            this.kernelWorker.onmessage = (e) => {
                if (e.data.type === 'ready') {
                    clearTimeout(timeout);
                    resolve();
                } else if (e.data.type === 'error') {
                    clearTimeout(timeout);
                    reject(new Error(e.data.message));
                }
            };
        });

        console.log('KernelLoader: Mock kernel initialized');
        
        // Boot complete - spawn initial process if requested
        if (this.initialProcess) {
            await this.spawnInitialProcess();
        }
    }
    
    /**
     * Set initial process to spawn after boot
     */
    setInitialProcess(executable, argv, envp = {}) {
        this.initialProcess = { executable, argv, envp };
    }
    
    /**
     * Spawn the initial process (shell or init)
     */
    async spawnInitialProcess() {
        if (!this.initialProcess) return;
        
        const { executable, argv, envp } = this.initialProcess;
        console.log(`KernelLoader: Spawning initial process: ${executable} ${argv.join(' ')}`);
        
        // Import ProcessManager and spawn
        const { processManager } = await import('../middleware/process_manager.js');
        
        // Set kernel worker
        processManager.kernelWorker = this.kernelWorker;
        
        // Spawn process
        const pid = await processManager.spawn(executable, argv, envp);
        console.log(`KernelLoader: Process spawned with pid=${pid}`);
        
        return pid;
    }

    /**
     * Get kernel worker (for process manager)
     */
    getWorker() {
        return this.kernelWorker;
    }

    /**
     * Shutdown kernel
     */
    async shutdown() {
        if (this.kernelWorker) {
            this.kernelWorker.postMessage({ type: 'shutdown' });
            this.kernelWorker.terminate();
            this.kernelWorker = null;
        }
    }

    /**
     * Check if using real kernel
     */
    isReal() {
        return this.isRealKernel;
    }
}

// Singleton instance
export const kernelLoader = new KernelLoader();
export default KernelLoader;
