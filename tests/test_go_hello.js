#!/usr/bin/env node
// Test: minimal Go hello world in friscy
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIR = join(__dirname, '..', 'friscy-bundle');

let termOutput = '';
const inputBuffer = [];

console.log('Loading friscy runtime...');
const createFriscy = (await import(join(BUNDLE_DIR, 'friscy.js'))).default;
const Module = await createFriscy({
    noInitialRun: true,
    print: (msg) => { console.log('[out]', msg); },
    printErr: (msg) => { console.error('[err]', msg); },
    _stdinBuffer: inputBuffer,
    _stdinEOF: false,
});

Module._termWrite = (msg) => {
    termOutput += msg;
};

console.log('Loading rootfs...');
const rootfsData = readFileSync('/tmp/hello-rootfs.tar');
Module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));

console.log('Running Go hello world...');
const start = Date.now();
const result = await Module.callMain(['--rootfs', '/rootfs.tar', '/usr/local/bin/hello']);
const elapsed = Date.now() - start;

console.log(`\nExit code: ${result}`);
console.log(`Time: ${elapsed}ms`);
console.log(`Term output: ${JSON.stringify(termOutput)}`);

if (termOutput.includes('Hello from Go in friscy!')) {
    console.log('SUCCESS: Go binary works in friscy!');
    process.exit(0);
} else {
    console.log('FAIL: Expected "Hello from Go in friscy!" in output');
    process.exit(1);
}
