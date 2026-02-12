#!/usr/bin/env node
// Debug test for interactive shell (Workstream D validation)
//
// Usage:
//   node --experimental-wasm-exnref tests/test_shell_debug.js
//
// Pre-fills stdin with "echo interactive_test\nexit\n" and verifies
// the shell processes the commands and produces output.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = join(__dirname, '..', 'runtime', 'build');
const ROOTFS_PATH = join(__dirname, 'rootfs.tar');

const createFriscy = (await import(join(RUNTIME_DIR, 'friscy.js'))).default;

// Pre-fill stdin with commands
const commands = 'echo interactive_test\nexit\n';
const buf = [];
for (let i = 0; i < commands.length; i++) buf.push(commands.charCodeAt(i));

let stdout = '';
let stderr = '';

const Module = await createFriscy({
    noInitialRun: true,

    print: (text) => {
        if (typeof text !== 'string') text = String(text || '');
        // Filter ANSI Device Status Report (\x1b[6n) which can freeze terminals
        if (text.includes('\x1b[6n')) {
            text = text.replace(/\x1b\[6n/g, '');
        }
        stdout += text + '\n';
        if (text) console.log('[print]', text);
    },

    printErr: (text) => {
        if (typeof text !== 'string') text = String(text || '');
        if (text.includes('\x1b[6n')) {
            text = text.replace(/\x1b\[6n/g, '');
        }
        stderr += text + '\n';
        if (text) console.error('[printErr]', text);
    },

    _stdinBuffer: buf,
    _stdinEOF: false,
});

// Load rootfs
const rootfsData = readFileSync(ROOTFS_PATH);
Module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));

console.log('[test] Starting shell with', buf.length, 'bytes in stdin buffer');

// Run main — this will stop when stdin has no data
const exitCode = Module.callMain([
    '--rootfs', '/rootfs.tar',
    '/bin/busybox', 'sh'
]);

// Resume loop: if machine stopped for stdin, keep resuming
// The C side exposes _friscy_stopped() and _friscy_resume()
const friscyStopped = Module._friscy_stopped;
const friscyResume = Module._friscy_resume;

if (friscyStopped && friscyResume) {
    let resumeCount = 0;
    const maxResumes = 5000; // Safety limit (50 seconds at 10ms each)

    while (friscyStopped() && resumeCount < maxResumes) {
        // Wait for stdin data or timeout
        await new Promise(resolve => setTimeout(resolve, 10));

        // Signal EOF if buffer is drained and no more input coming
        if (Module._stdinBuffer.length === 0) {
            Module._stdinEOF = true;
        }

        friscyResume();
        resumeCount++;
    }
    console.log('[test] Resume loop ran', resumeCount, 'times');
}

console.log('[test] Exit code:', exitCode);
console.log('[test] Stdin buffer remaining:', Module._stdinBuffer.length, 'bytes');

// Validate
const hasInteractiveTest = stdout.includes('interactive_test');
console.log('[test] Output contains "interactive_test":', hasInteractiveTest);
console.log('[test] Full stdout:', JSON.stringify(stdout));

if (hasInteractiveTest) {
    console.log('[test] PASS: Interactive shell processed stdin commands');
    process.exit(0);
} else {
    console.log('[test] FAIL: Shell did not process stdin commands');
    process.exit(1);
}
