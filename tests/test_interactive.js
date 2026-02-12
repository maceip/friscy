// test_interactive.js - Validates interactive stdin via JSPI
//
// Starts busybox sh, feeds commands into _stdinBuffer after a delay
// (while emscripten_sleep yields to the event loop), and verifies
// the output contains expected responses.
//
// Usage: node --experimental-wasm-exnref --experimental-wasm-jspi tests/test_interactive.js

import initModule from '../runtime/build/friscy.js';
import { readFileSync } from 'fs';

const TIMEOUT_MS = 15000;

async function test() {
    const rootfsData = readFileSync('tests/alpine.tar');

    let output = '';
    let errOutput = '';

    // Initialize module — noInitialRun prevents main() from auto-running
    const Module = await initModule({
        noInitialRun: true,
        print: (text) => {
            output += text + '\n';
            console.log('[stdout]', text);
        },
        printErr: (text) => {
            errOutput += text + '\n';
            console.error('[stderr]', text);
        },
    });

    // Load rootfs into Emscripten VFS
    Module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));

    // Set up stdin buffer (same as browser template)
    Module._stdinBuffer = [];
    Module._stdinEOF = false;

    // Helper: push a string into stdin buffer after a delay
    function feedInput(text, delayMs) {
        return new Promise(resolve => {
            setTimeout(() => {
                console.log(`[test] Feeding stdin (${delayMs}ms): ${JSON.stringify(text)}`);
                for (let i = 0; i < text.length; i++) {
                    Module._stdinBuffer.push(text.charCodeAt(i));
                }
                resolve();
            }, delayMs);
        });
    }

    // Schedule commands to be fed while sh is blocked on stdin
    feedInput("echo INTERACTIVE_TEST_MARKER\n", 500);
    feedInput("pwd\n", 1500);
    feedInput("exit\n", 2500);

    // Run busybox sh — with JSPI, callMain returns a Promise that
    // resolves when main() finishes (after all sleep/resume cycles)
    console.log('[test] Starting busybox sh...');
    const exitCode = await Module.callMain([
        '--rootfs', '/rootfs.tar',
        '/bin/busybox', 'sh'
    ]);

    console.log('[test] Shell exited with code:', exitCode);

    // Verify output
    const checks = [
        ['echo response', output.includes('INTERACTIVE_TEST_MARKER')],
        ['pwd response', output.includes('/')],
    ];

    let passed = 0;
    for (const [name, ok] of checks) {
        if (ok) {
            console.log(`[PASS] ${name}`);
            passed++;
        } else {
            console.error(`[FAIL] ${name}`);
        }
    }

    console.log(`\n[test] ${passed}/${checks.length} checks passed`);
    if (passed < checks.length) {
        console.error('[test] Full output:', JSON.stringify(output));
        process.exit(1);
    }
}

// Timeout guard
const timer = setTimeout(() => {
    console.error('[FAIL] Test timed out after', TIMEOUT_MS, 'ms');
    console.error('[FAIL] emscripten_sleep may not be yielding to the event loop');
    process.exit(2);
}, TIMEOUT_MS);

test().then(() => {
    clearTimeout(timer);
    console.log('\n[PASS] Interactive terminal test complete');
    process.exit(0);
}).catch(err => {
    clearTimeout(timer);
    console.error('[FAIL]', err);
    process.exit(1);
});
