#!/usr/bin/env node
// Test: multiple commands in interactive shell (including fork-requiring ones)
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
let termOutput = '';

const createFriscy = (await import(join(RUNTIME_DIR, 'friscy.js'))).default;
const Module = await createFriscy({
    noInitialRun: true,
    print: () => {},
    printErr: () => {},
    _stdinBuffer: inputBuffer,
    _stdinEOF: false,
});

Module._termWrite = (msg) => { termOutput += msg; };

const rootfsData = readFileSync(ROOTFS_PATH);
Module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));

await Module.callMain(['--rootfs', '/rootfs.tar', '/bin/busybox', 'sh']);

function feedAndResume(cmd) {
    termOutput = '';
    inputBuffer.push(...encode(cmd + '\n'));
    for (let i = 0; i < 50; i++) {
        Module._friscy_resume();
        if (Module._friscy_stopped()) break;
    }
    return { output: termOutput, stopped: Module._friscy_stopped() };
}

let pass = 0;
let fail = 0;

function check(name, result, expected) {
    const ok = result.stopped === 1 && result.output.includes(expected);
    if (ok) { pass++; console.log(`PASS: ${name}`); }
    else {
        fail++;
        console.log(`FAIL: ${name}`);
        console.log(`  stopped=${result.stopped} expected=1`);
        console.log(`  output=${JSON.stringify(result.output.substring(0, 200))}`);
        console.log(`  expected to contain: ${JSON.stringify(expected)}`);
    }
}

// Test 1: echo (builtin, no fork)
check('echo hello', feedAndResume('echo hello'), 'hello');

// Test 2: ls / (external, requires fork)
check('ls /', feedAndResume('ls /'), 'bin');

// Test 3: echo after ls (verify shell survived fork)
check('echo after_ls', feedAndResume('echo after_ls'), 'after_ls');

// Test 4: ls /bin (another fork)
check('ls /bin', feedAndResume('ls /bin'), 'busybox');

// Test 5: echo after second ls
check('echo after_ls2', feedAndResume('echo after_ls2'), 'after_ls2');

// Test 6: pwd (builtin)
check('pwd', feedAndResume('pwd'), '/');

// Test 7: cat /etc/passwd (fork + file read)
check('cat /etc/passwd', feedAndResume('cat /etc/passwd'), 'root');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
