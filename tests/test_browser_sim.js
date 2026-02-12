#!/usr/bin/env node
// Browser simulation test: mimics friscy-bundle/index.html behavior
// Tests the stop/resume interactive loop with line-by-line stdin feeding,
// exactly as the browser xterm.js terminal would work.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = join(__dirname, '..', 'runtime', 'build');
const ROOTFS_PATH = join(__dirname, 'rootfs.tar');

function encode(str) {
    const buf = [];
    for (let i = 0; i < str.length; i++) buf.push(str.charCodeAt(i));
    return buf;
}

let passed = 0;
let failed = 0;

function result(name, ok, detail) {
    if (ok) {
        passed++;
        console.log(`  [PASS] ${name}`);
    } else {
        failed++;
        console.log(`  [FAIL] ${name}: ${detail}`);
    }
}

console.log('=== Browser Simulation Test ===\n');

// Helper: push data then resume until machine stops again (or exits).
// This mimics the browser's scheduleResume behavior.
function feedAndResume(Module, inputBuffer, data, maxResumes = 100) {
    const bytes = encode(data);
    inputBuffer.push(...bytes);
    let resumes = 0;
    // Resume with data, then keep resuming while machine is processing
    do {
        Module._friscy_resume();
        resumes++;
    } while (Module._friscy_stopped() && inputBuffer.length > 0 && resumes < maxResumes);
    return resumes;
}

// Simulate the browser interactive loop:
// 1. callMain starts the shell
// 2. Shell reads stdin, finds no data, machine stops
// 3. "User types a command" (we push to inputBuffer)
// 4. scheduleResume() calls _friscy_resume()
// 5. Shell processes command, prints output, reads again, stops
// 6. Repeat until we send "exit"

console.log('Test: Interactive shell session (browser-style stop/resume)');
{
    const inputBuffer = [];
    let stdout = '';
    let stderr = '';

    const createFriscy = (await import(join(RUNTIME_DIR, 'friscy.js'))).default;
    const Module = await createFriscy({
        noInitialRun: true,
        print: (t) => { stdout += t + '\n'; },
        printErr: (t) => { stderr += t + '\n'; },
        _stdinBuffer: inputBuffer,
        _stdinEOF: false,
    });

    const rootfsData = readFileSync(ROOTFS_PATH);
    Module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));

    // Start the shell (like browser's callMain)
    await Module.callMain(['--rootfs', '/rootfs.tar', '/bin/busybox', 'sh']);

    // Shell should be stopped waiting for stdin
    result('shell stopped after start', Module._friscy_stopped() === 1,
        `stopped=${Module._friscy_stopped()}`);

    // --- Simulate user typing "echo browser_test" + Enter ---
    feedAndResume(Module, inputBuffer, 'echo browser_test\n');

    result('shell processed echo command', stdout.includes('browser_test'),
        `stdout: ${JSON.stringify(stdout.substring(0, 300))}`);
    result('shell still running (waiting for input)', Module._friscy_stopped() === 1,
        `stopped=${Module._friscy_stopped()}`);

    // --- Simulate user typing "ls /" + Enter (external cmd, triggers fork+exec) ---
    const lsPrevLen = stdout.length;
    feedAndResume(Module, inputBuffer, 'ls /\n');

    result('ls output contains bin', stdout.substring(lsPrevLen).includes('bin'),
        `stdout after ls: ${JSON.stringify(stdout.substring(lsPrevLen, lsPrevLen + 300))}`);
    result('shell still running after ls', Module._friscy_stopped() === 1,
        `stopped=${Module._friscy_stopped()}`);

    // --- Simulate user typing "ls /" again (second fork+exec) ---
    const ls2PrevLen = stdout.length;
    feedAndResume(Module, inputBuffer, 'ls /\n');

    result('second ls output contains bin', stdout.substring(ls2PrevLen).includes('bin'),
        `stdout after 2nd ls: ${JSON.stringify(stdout.substring(ls2PrevLen, ls2PrevLen + 300))}`);
    result('shell still running after 2nd ls', Module._friscy_stopped() === 1,
        `stopped=${Module._friscy_stopped()}`);

    // --- Simulate user typing "exit" + Enter ---
    feedAndResume(Module, inputBuffer, 'exit\n');

    result('shell exited cleanly', Module._friscy_stopped() === 0,
        `stopped=${Module._friscy_stopped()}`);
}

// Test: sh -c with pipe (clone+execve chain)
console.log('\nTest: sh -c with pipe simulation');
{
    const inputBuffer = [];
    let stdout = '';

    const createFriscy = (await import(join(RUNTIME_DIR, 'friscy.js') + '?v=2')).default;
    const Module = await createFriscy({
        noInitialRun: true,
        print: (t) => { stdout += t + '\n'; },
        printErr: () => {},
        _stdinBuffer: inputBuffer,
        _stdinEOF: true,
    });

    Module.FS.writeFile('/rootfs.tar', new Uint8Array(readFileSync(ROOTFS_PATH)));

    await Module.callMain(['--rootfs', '/rootfs.tar', '/bin/busybox', 'sh', '-c',
        'echo hello && echo world']);

    let resumeCount = 0;
    while (Module._friscy_stopped() && resumeCount < 100) {
        Module._friscy_resume();
        resumeCount++;
    }

    result('sh -c multi-command output', stdout.includes('hello') && stdout.includes('world'),
        `stdout: ${JSON.stringify(stdout.substring(0, 300))}`);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
