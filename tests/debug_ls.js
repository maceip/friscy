#!/usr/bin/env node
// Debug test: trace exactly what happens during interactive ls /
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

const inputBuffer = [];
let stdout = '';
let stderr = '';
let termErrors = [];

const createFriscy = (await import(join(RUNTIME_DIR, 'friscy.js'))).default;
const Module = await createFriscy({
    noInitialRun: true,
    print: (t) => { stdout += t + '\n'; },
    printErr: (t) => { stderr += t + '\n'; },
    _stdinBuffer: inputBuffer,
    _stdinEOF: false,
});

// Capture _termWrite messages (from EM_ASM error display in friscy_resume)
Module._termWrite = (msg) => {
    termErrors.push(msg);
    process.stderr.write(`[termWrite] ${msg}\n`);
};

const rootfsData = readFileSync(ROOTFS_PATH);
Module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));

console.log('--- Starting shell ---');
await Module.callMain(['--rootfs', '/rootfs.tar', '/bin/busybox', 'sh']);
console.log(`After callMain: stopped=${Module._friscy_stopped()}`);

// Feed echo command to verify basic operation
console.log('\n--- Feeding: echo hello ---');
inputBuffer.push(...encode('echo hello\n'));
Module._friscy_resume();
console.log(`After echo resume: stopped=${Module._friscy_stopped()} buf=${inputBuffer.length}`);
console.log(`stdout: ${JSON.stringify(stdout)}`);

// Clear stdout for ls test
const prevLen = stdout.length;

// Feed ls /
console.log('\n--- Feeding: ls / ---');
inputBuffer.push(...encode('ls /\n'));

// Resume with detailed logging
let resumeCount = 0;
let lastStopped;
do {
    const ret = Module._friscy_resume();
    resumeCount++;
    lastStopped = Module._friscy_stopped();
    const newOutput = stdout.substring(prevLen);
    console.log(`  resume #${resumeCount}: ret=${ret} stopped=${lastStopped} buf=${inputBuffer.length} newOut=${newOutput.length}ch`);
} while (lastStopped && inputBuffer.length > 0 && resumeCount < 50);

console.log(`\nAfter feedAndResume loop: stopped=${lastStopped} resumes=${resumeCount}`);

// If machine stopped but not waiting for stdin, try more resumes
if (!lastStopped) {
    console.log('\nMachine is NOT waiting for stdin (stopped=0). Trying additional resumes...');
    for (let i = 0; i < 5; i++) {
        const ret = Module._friscy_resume();
        const s = Module._friscy_stopped();
        console.log(`  extra resume #${i+1}: ret=${ret} stopped=${s}`);
        if (s) {
            console.log('  -> Machine is now waiting for stdin!');
            lastStopped = s;
            break;
        }
    }
}

const lsOutput = stdout.substring(prevLen);
console.log(`\nls output: ${JSON.stringify(lsOutput.substring(0, 500))}`);
console.log(`stderr (last 500ch): ${stderr.substring(Math.max(0, stderr.length - 500))}`);
console.log(`termErrors: ${JSON.stringify(termErrors)}`);
console.log(`\nFinal state: stopped=${lastStopped}`);

// Now try feeding exit to see if shell is alive
if (lastStopped) {
    console.log('\n--- Feeding: exit ---');
    inputBuffer.push(...encode('exit\n'));
    Module._friscy_resume();
    console.log(`After exit: stopped=${Module._friscy_stopped()}`);
}
