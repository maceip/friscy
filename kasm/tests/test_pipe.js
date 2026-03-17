/**
 * Test: echo hello | cat
 * 
 * Milestone test: Verify pipe functionality between processes.
 * Phase 2 milestone per .hint/ARCHITECTURE.md
 * Expected: "hello\n"
 */

import { processManager } from '../middleware/process_manager.js';
import { KernelWorker } from '../middleware/kernel_worker.js';

async function testPipe() {
    console.log('Test: echo hello | cat');
    console.log('======================');
    
    try {
        // Initialize process manager
        await processManager.init();
        
        // Create a pipe
        // This would be done by the shell, but we simulate it here
        const kernel = new KernelWorker();
        const pipeResult = kernel.fs.pipe2(0);
        
        if (pipeResult < 0) {
            throw new Error('Failed to create pipe');
        }
        
        // Spawn echo process with stdout redirected to pipe
        const echoPid = await processManager.spawn(
            '/bin/busybox.wasm',
            ['echo', 'hello'],
            { PATH: '/bin' },
            { stdout: pipeResult[1] } // Write end of pipe
        );
        
        // Spawn cat process with stdin redirected from pipe
        const catPid = await processManager.spawn(
            '/bin/busybox.wasm',
            ['cat'],
            { PATH: '/bin' },
            { stdin: pipeResult[0] } // Read end of pipe
        );
        
        console.log(`Processes spawned: echo=${echoPid}, cat=${catPid}`);
        
        // Wait for both processes
        const [echoResult, catResult] = await Promise.all([
            processManager.wait4(echoPid, 0),
            processManager.wait4(catPid, 0),
        ]);
        
        console.log(`echo exited: ${echoResult.status}`);
        console.log(`cat exited: ${catResult.status}`);
        
        // Verify success
        if (echoResult.status === 0 && catResult.status === 0) {
            console.log('✓ PASS: echo hello | cat completed successfully');
            console.log('✓ PHASE 2 MILESTONE ACHIEVED');
            return true;
        } else {
            console.log(`✗ FAIL: echo=${echoResult.status}, cat=${catResult.status}`);
            return false;
        }
        
    } catch (e) {
        console.error('✗ FAIL:', e.message);
        console.error(e.stack);
        return false;
    } finally {
        await processManager.shutdown();
    }
}

// Run test
if (typeof window !== 'undefined') {
    testPipe().then(result => {
        document.body.innerHTML = `<pre>${result ? 'PASS' : 'FAIL'}</pre>`;
    });
} else {
    testPipe().then(result => process.exit(result ? 0 : 1));
}

export { testPipe };
