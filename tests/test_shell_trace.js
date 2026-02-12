#!/usr/bin/env node
// Trace all syscalls during interactive shell
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = join(__dirname, '..', 'runtime', 'build');
const ROOTFS_PATH = join(__dirname, 'rootfs.tar');

const createFriscy = (await import(join(RUNTIME_DIR, 'friscy.js'))).default;

const commands = 'echo hello\nexit\n';
const buf = [];
for (let i = 0; i < commands.length; i++) buf.push(commands.charCodeAt(i));

const Module = await createFriscy({
    noInitialRun: true,
    print: () => {},
    printErr: (text) => process.stderr.write(text + '\n'),
    _stdinBuffer: buf,
    _stdinEOF: false,
});

Module.FS.writeFile('/rootfs.tar', new Uint8Array(readFileSync(ROOTFS_PATH)));
setTimeout(() => { Module._stdinEOF = true; }, 5000);

const exitCode = await Module.callMain([
    '--rootfs', '/rootfs.tar',
    '/bin/busybox', 'sh'
]);
console.log('\nExit:', exitCode, 'Buffer left:', Module._stdinBuffer.length);
