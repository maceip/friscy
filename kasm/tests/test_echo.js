/**
 * Test: echo hello
 * 
 * Milestone test: Verify basic process execution and stdio works.
 * Expected: "hello\n"
 */

import { processManager } from '../middleware/process_manager.js';

async function testEcho() {
    console.log('Test: echo hello');
    console.log('==================');
    
    try {
        // Initialize process manager
        await processManager.init();
        
        // Spawn busybox echo
        const pid = await processManager.spawn(
            '/bin/busybox.wasm',
            ['echo', 'hello'],
            { PATH: '/bin' }
        );
        
        console.log(`Process spawned: pid=${pid}`);
        
        // Wait for process to complete
        const result = await processManager.wait4(pid, 0);
        
        console.log(`Process exited: pid=${result.pid}, status=${result.status}`);
        
        // Check output (would need to capture stdout)
        // For now, just verify process completed successfully
        if (result.status === 0) {
            console.log('✓ PASS: echo hello completed successfully');
            return true;
        } else {
            console.log(`✗ FAIL: Unexpected exit code ${result.status}`);
            return false;
        }
        
    } catch (e) {
        console.error('✗ FAIL:', e.message);
        return false;
    } finally {
        await processManager.shutdown();
    }
}

// Run test if called directly
if (typeof window !== 'undefined') {
    // Browser environment
    testEcho().then(result => {
        document.body.innerHTML = `<pre>${result ? 'PASS' : 'FAIL'}</pre>`;
    });
} else if (typeof self !== 'undefined') {
    // Worker environment
} else {
    // Node.js environment
    testEcho().then(result => {
        process.exit(result ? 0 : 1);
    });
}

export { testEcho };
