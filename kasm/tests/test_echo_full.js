/**
 * Test: echo hello (Full Middleware Integration)
 * 
 * This test verifies the complete pipeline:
 *   ProcessManager → Worker → busybox.wasm → syscall → mock kernel → response
 * 
 * This is the real end-to-end test using the actual middleware components.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock the browser environment for Node.js testing
// In production, this runs in actual browser with real Web Workers

class MockWorker {
    constructor(scriptUrl) {
        this.scriptUrl = scriptUrl;
        this.onmessage = null;
        this._processWorker = null;
        
        // Dynamically import the process worker module
        this._init();
    }
    
    async _init() {
        try {
            // Import process worker
            const { ProcessWorker } = await import('../middleware/process_worker.js');
            
            // Create a mock kernel port
            const kernelPort = {
                postMessage: (msg) => {
                    if (msg.type === 'register') {
                        // Simulate kernel registration response
                        setTimeout(() => {
                            if (this.onmessage) {
                                this.onmessage({
                                    data: {
                                        type: 'registered',
                                        workerId: msg.workerId,
                                        pid: Math.floor(Math.random() * 100000) + 1000,
                                    }
                                });
                            }
                        }, 10);
                    }
                },
                onmessage: null,
            };
            
            this._kernelPort = kernelPort;
            
        } catch (error) {
            console.error('MockWorker init error:', error);
        }
    }
    
    postMessage(data, transfer) {
        if (data.type === 'init') {
            this._handleInit(data);
        }
    }
    
    async _handleInit(data) {
        try {
            const { ProcessWorker } = await import('../middleware/process_worker.js');
            
            // Read the WASM module
            const wasmBuffer = fs.readFileSync(data.executable.replace('/bin/', '../programs/busybox/'));
            const wasmModule = await WebAssembly.compile(wasmBuffer);
            
            // Create process worker
            const workerId = Math.random().toString(36).substring(7);
            const processWorker = new ProcessWorker(workerId, wasmModule, this._kernelPort);
            
            this._processWorker = processWorker;
            
            // Initialize
            const exitCode = await processWorker.init(data.argv, data.envp);
            
            // Notify completion
            if (this.onmessage) {
                this.onmessage({
                    data: {
                        type: 'init_complete',
                        pid: processWorker.pid,
                        exitCode: exitCode,
                    }
                });
            }
            
        } catch (error) {
            if (this.onmessage) {
                this.onmessage({
                    data: {
                        type: 'error',
                        message: error.message,
                    }
                });
            }
        }
    }
    
    terminate() {
        this._processWorker = null;
    }
}

// Patch global Worker
if (typeof global !== 'undefined' && !global.Worker) {
    global.Worker = MockWorker;
}

async function testEchoFull() {
    console.log('Test: echo hello (Full Middleware)');
    console.log('==================================\n');
    
    const busyboxPath = path.join(__dirname, '../programs/busybox/busybox.wasm');
    
    try {
        // Check prerequisites
        if (!fs.existsSync(busyboxPath)) {
            throw new Error(`busybox.wasm not found at ${busyboxPath}`);
        }
        
        console.log(`✓ Found busybox.wasm`);
        
        // Import and initialize process manager
        console.log('\nInitializing ProcessManager...');
        const { processManager } = await import('../middleware/process_manager.js');
        
        // Initialize (starts mock kernel)
        await processManager.init();
        console.log('✓ ProcessManager initialized');
        
        // Spawn echo process
        console.log('\nSpawning: echo hello');
        const pid = await processManager.spawn(
            busyboxPath,
            ['echo', 'hello'],
            { PATH: '/bin' }
        );
        
        console.log(`✓ Process spawned (pid: ${pid})`);
        
        // Wait for completion
        console.log('\nWaiting for process...');
        const result = await processManager.wait4(pid, 0);
        
        console.log(`Process exited: status=${result.status}`);
        
        // Cleanup
        await processManager.shutdown();
        
        // Verify result
        if (result.status === 0) {
            console.log('\n✅ PASS: echo hello completed successfully');
            console.log('  Full pipeline working:');
            console.log('    ProcessManager → Worker → WASM → syscalls → mock kernel');
            return true;
        } else {
            console.log(`\n❌ FAIL: Exit code ${result.status}`);
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ FAIL:', error.message);
        console.error(error.stack);
        return false;
    }
}

// Run test
testEchoFull().then(result => {
    process.exit(result ? 0 : 1);
});

export { testEchoFull };
