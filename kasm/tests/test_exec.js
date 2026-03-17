/**
 * Test: sh -c "echo hello"
 * 
 * Test exec() functionality - shell spawning child process.
 * Expected: "hello\n"
 */

import { processManager } from '../middleware/process_manager.js';

async function testExec() {
    console.log('Test: sh -c "echo hello"');
    console.log('========================');
    
    try {
        // Initialize process manager
        await processManager.init();
        
        // Spawn shell with command
        const pid = await processManager.spawn(
            '/bin/busybox.wasm',
            ['sh', '-c', 'echo hello'],
            { PATH: '/bin' }
        );
        
        console.log(`Shell spawned: pid=${pid}`);
        
        // Wait for shell and its children
        const result = await processManager.wait4(-1, 0); // Wait for any child
        
        console.log(`Process exited: pid=${result.pid}, status=${result.status}`);
        
        if (result.status === 0) {
            console.log('✓ PASS: sh -c "echo hello" completed successfully');
            return true;
        } else {
            console.log(`✗ FAIL: Exit code ${result.status}`);
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
    testExec().then(result => {
        document.body.innerHTML = `<pre>${result ? 'PASS' : 'FAIL'}</pre>`;
    });
} else {
    testExec().then(result => process.exit(result ? 0 : 1));
}

export { testExec };
