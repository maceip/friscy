/**
 * Process Worker Thread - Runs inside Web Worker
 * 
 * This is the actual Web Worker entry point. Each process runs in its own
 * Worker with its own Wasm instance.
 */

import { ProcessWorker } from './process_worker.js';

let processWorker = null;

// Handle messages from main thread
self.onmessage = async (e) => {
    const { type, executable, wasmModule, argv, envp, options, sab } = e.data;
    
    if (type === 'init') {
        try {
            // Create process worker
            const workerId = Math.random().toString(36).substring(7);
            
            // Create a mock kernel port using the SAB
            const kernelPort = {
                postMessage: (msg) => {
                    // This would go to the real kernel worker
                    // For now, we handle it locally or echo back
                    if (msg.type === 'register') {
                        // Simulate kernel registration
                        setTimeout(() => {
                            self.postMessage({
                                type: 'registered',
                                workerId: msg.workerId,
                                pid: Math.floor(Math.random() * 100000) + 1000,
                            });
                        }, 10);
                    }
                },
                onmessage: null,
            };
            
            processWorker = new ProcessWorker(workerId, wasmModule, kernelPort);
            
            // Initialize
            const exitCode = await processWorker.init(argv, envp);
            
            // Notify main thread
            self.postMessage({
                type: 'init_complete',
                pid: processWorker.pid,
                exitCode: exitCode,
            });
            
        } catch (error) {
            self.postMessage({
                type: 'error',
                message: error.message,
                stack: error.stack,
            });
        }
    }
};

// Signal ready
self.postMessage({ type: 'ready' });
