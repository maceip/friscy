#!/usr/bin/env node
// Test: Go echo server (labstack/echo) starts inside friscy emulator
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIR = join(__dirname, '..', 'friscy-bundle');
const ROOTFS_PATH = '/tmp/echo-rootfs.tar';

let termOutput = '';
const inputBuffer = [];

console.log('Loading friscy runtime...');
const createFriscy = (await import(join(BUNDLE_DIR, 'friscy.js'))).default;
const Module = await createFriscy({
    noInitialRun: true,
    print: (msg) => { console.log('[guest]', msg); },
    printErr: (msg) => { console.error('[guest-err]', msg); },
    _stdinBuffer: inputBuffer,
    _stdinEOF: false,
});

Module._termWrite = (msg) => {
    termOutput += msg;
    process.stdout.write(msg);
};

console.log('Loading rootfs...');
const rootfsData = readFileSync(ROOTFS_PATH);
Module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));

console.log('Starting echo server...');
const startTime = Date.now();

// Run the echo server binary directly
const mainPromise = Module.callMain(['--rootfs', '/rootfs.tar', '/usr/local/bin/echo_server']);

// Poll resume until we see the startup banner or timeout
const TIMEOUT_MS = 60000;
let found = false;

const poll = setInterval(() => {
    const elapsed = Date.now() - startTime;

    // Check if echo's startup banner appeared
    if (termOutput.includes('http server started') || termOutput.includes('⇨')) {
        clearInterval(poll);
        found = true;
        console.log(`\n\nSUCCESS: Echo server started in ${elapsed}ms`);
        console.log('Output:', termOutput.substring(0, 500));
        process.exit(0);
    }

    if (elapsed > TIMEOUT_MS) {
        clearInterval(poll);
        console.log(`\n\nTIMEOUT after ${TIMEOUT_MS}ms`);
        console.log('Output so far:', termOutput.substring(0, 1000));
        process.exit(1);
    }
}, 100);
