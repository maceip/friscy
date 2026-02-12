#!/usr/bin/env node
// Test suite for Workstream D: Interactive terminal support
// Tests non-interactive commands and stdin read via stop/resume loop.
//
// The approach:
//   - isatty(stdin) returns false → ash runs in batch mode
//   - When stdin has no data, machine.stop() is called with PC rewound
//   - JS calls friscy_resume() after feeding data into _stdinBuffer
//
// NOTE: Each Wasm instance uses 512MB. We run tests sequentially with
// a single module to avoid OOM. Node --max-old-space-size may be needed.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = join(__dirname, '..', 'runtime', 'build');
const ROOTFS_PATH = join(__dirname, 'rootfs.tar');

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

function encode(str) {
    const buf = [];
    for (let i = 0; i < str.length; i++) buf.push(str.charCodeAt(i));
    return buf;
}

// Create a fresh module for each test. Returns an object with helpers.
async function freshModule(stdinData, stdinEOF) {
    const createFriscy = (await import(join(RUNTIME_DIR, 'friscy.js'))).default;
    let stdout = '';
    let stderr = '';
    const Module = await createFriscy({
        noInitialRun: true,
        print: (t) => { stdout += t + '\n'; },
        printErr: (t) => { stderr += t + '\n'; },
        _stdinBuffer: stdinData || [],
        _stdinEOF: stdinEOF !== undefined ? stdinEOF : false,
    });
    const rootfsData = readFileSync(ROOTFS_PATH);
    Module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));
    return {
        Module,
        stdout: () => stdout,
        stderr: () => stderr,
        async run(args, opts = {}) {
            await Module.callMain(args);
            let resumes = 0;
            while (Module._friscy_stopped() && resumes < (opts.maxResumes || 200)) {
                if (opts.feedData) opts.feedData(resumes);
                Module._friscy_resume();
                resumes++;
            }
            return { stopped: Module._friscy_stopped(), resumes };
        }
    };
}

// ============================================================
console.log('=== Workstream D: Local Validation ===');
console.log(`Runtime: ${RUNTIME_DIR}`);
console.log(`Rootfs: ${ROOTFS_PATH}\n`);

// Test 1: Stop/resume exports
{
    console.log('Test 1: Stop/resume exports');
    const m = await freshModule(null, true);
    result('_friscy_stopped exists', typeof m.Module._friscy_stopped === 'function',
        `type: ${typeof m.Module._friscy_stopped}`);
    result('_friscy_resume exists', typeof m.Module._friscy_resume === 'function',
        `type: ${typeof m.Module._friscy_resume}`);
}

// Test 2: Non-interactive echo
{
    console.log('\nTest 2: Non-interactive echo');
    const m = await freshModule(null, true);
    await m.run(['--rootfs', '/rootfs.tar', '/bin/busybox', 'echo', 'hello', 'world']);
    result('echo output', m.stdout().includes('hello world'),
        `got: ${JSON.stringify(m.stdout().substring(0, 200))}`);
}

// Test 3: Non-interactive ls
{
    console.log('\nTest 3: Non-interactive ls');
    const m = await freshModule(null, true);
    await m.run(['--rootfs', '/rootfs.tar', '/bin/busybox', 'ls', '/']);
    const out = m.stdout();
    result('ls shows bin', out.includes('bin'), `got: ${JSON.stringify(out.substring(0, 300))}`);
    result('ls shows etc', out.includes('etc'), `got: ${JSON.stringify(out.substring(0, 300))}`);
}

// Test 4: Cat with pre-filled stdin (buffer drain + EOF)
{
    console.log('\nTest 4: Cat with stdin data');
    const m = await freshModule(encode('hello from stdin\n'), true);
    await m.run(['--rootfs', '/rootfs.tar', '/bin/busybox', 'cat']);
    result('cat echoes stdin', m.stdout().includes('hello from stdin'),
        `got: ${JSON.stringify(m.stdout().substring(0, 200))}`);
}

// Test 5: Cat with delayed stdin (stop/resume)
{
    console.log('\nTest 5: Cat with delayed stdin (stop/resume)');
    const m = await freshModule([], false);
    const { resumes } = await m.run(
        ['--rootfs', '/rootfs.tar', '/bin/busybox', 'cat'],
        {
            feedData: (r) => {
                if (r === 0) {
                    // Feed data on first resume
                    const data = encode('delayed_data\n');
                    m.Module._stdinBuffer.push(...data);
                    m.Module._stdinEOF = true;
                }
            }
        }
    );
    result('stop/resume worked', resumes >= 1, `resumes: ${resumes}`);
    result('cat echoes delayed data', m.stdout().includes('delayed_data'),
        `got: ${JSON.stringify(m.stdout().substring(0, 200))}`);
}

// Test 6: Shell batch mode (single command)
{
    console.log('\nTest 6: Shell batch mode');
    const m = await freshModule(encode('echo batch_test_output\n'), true);
    await m.run(['--rootfs', '/rootfs.tar', '/bin/busybox', 'sh']);
    result('shell ran echo', m.stdout().includes('batch_test_output'),
        `stdout: ${JSON.stringify(m.stdout().substring(0, 400))}\nstderr: ${JSON.stringify(m.stderr().substring(0, 300))}`);
}

// Test 7: Shell batch mode (multiple commands)
{
    console.log('\nTest 7: Shell multi-command batch');
    const m = await freshModule(encode('echo first_cmd\necho second_cmd\n'), true);
    await m.run(['--rootfs', '/rootfs.tar', '/bin/busybox', 'sh']);
    const out = m.stdout();
    result('first command', out.includes('first_cmd'), `got: ${JSON.stringify(out.substring(0, 300))}`);
    result('second command', out.includes('second_cmd'), `got: ${JSON.stringify(out.substring(0, 300))}`);
}

// Test 8: sh -c "echo test" (uses clone+execve)
{
    console.log('\nTest 8: sh -c (clone+execve)');
    const m = await freshModule(null, true);
    await m.run(['--rootfs', '/rootfs.tar', '/bin/busybox', 'sh', '-c', 'echo fork_exec_test']);
    result('sh -c echo', m.stdout().includes('fork_exec_test'),
        `stdout: ${JSON.stringify(m.stdout().substring(0, 300))}\nstderr: ${JSON.stringify(m.stderr().substring(0, 300))}`);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
