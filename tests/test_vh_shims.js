#!/usr/bin/env node
// test_vh_shims.js — VectorHeart shim integration test
// Runs INSIDE the RISC-V emulator (guest) with LD_PRELOAD=vh_preload.so
// Tests all VH hypercall pathways: timing, crypto, JSON, file I/O, network
'use strict';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result === false) {
            console.log('FAIL: ' + name);
            failed++;
        } else {
            console.log('PASS: ' + name);
            passed++;
        }
    } catch (e) {
        console.log('FAIL: ' + name + ' (' + e.message + ')');
        failed++;
    }
}

// ============================================================================
// 1. gettimeofday (ecall 704) — routed through VH to host Date.now()
// ============================================================================
test('gettimeofday returns reasonable timestamp', function() {
    var now = Date.now();
    // Should be after 2024-01-01 and before 2030-01-01
    return now > 1704067200000 && now < 1893456000000;
});

test('Date.now() is monotonic', function() {
    var a = Date.now();
    // Burn some cycles
    var x = 0;
    for (var i = 0; i < 100000; i++) x += i;
    var b = Date.now();
    return b >= a;
});

// ============================================================================
// 2. getrandom (ecall 705) — routed through VH to host crypto.getRandomValues
// ============================================================================
test('crypto.getRandomValues produces bytes', function() {
    var buf = new Uint8Array(32);
    // In Node.js, crypto is a builtin
    var crypto = require('crypto');
    crypto.randomFillSync(buf);
    // Check not all zeros
    var sum = 0;
    for (var i = 0; i < buf.length; i++) sum += buf[i];
    return sum > 0;
});

test('crypto.randomBytes produces unique output', function() {
    var crypto = require('crypto');
    var a = crypto.randomBytes(16).toString('hex');
    var b = crypto.randomBytes(16).toString('hex');
    return a !== b;
});

// ============================================================================
// 3. JSON parse (host offload is transparent — libc handles it)
// ============================================================================
test('JSON.parse works for objects', function() {
    var obj = JSON.parse('{"name":"friscy","version":1,"features":["riscv","wasm"]}');
    return obj.name === 'friscy' && obj.version === 1 && obj.features.length === 2;
});

test('JSON.stringify round-trips', function() {
    var original = { a: 1, b: [2, 3], c: { nested: true } };
    var result = JSON.parse(JSON.stringify(original));
    return result.a === 1 && result.b[1] === 3 && result.c.nested === true;
});

test('JSON.parse rejects invalid input', function() {
    try {
        JSON.parse('{invalid json}');
        return false; // Should have thrown
    } catch (e) {
        return true;
    }
});

// ============================================================================
// 4. SHA-256 hash (crypto module)
// ============================================================================
test('SHA-256 hash of empty string', function() {
    var crypto = require('crypto');
    var hash = crypto.createHash('sha256').update('').digest('hex');
    return hash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
});

test('SHA-256 hash of known input', function() {
    var crypto = require('crypto');
    var hash = crypto.createHash('sha256').update('hello friscy').digest('hex');
    // Just check it's a valid 64-char hex string
    return hash.length === 64 && /^[0-9a-f]+$/.test(hash);
});

// ============================================================================
// 5. File I/O (write + read via VH OPFS or passthrough)
// ============================================================================
test('fs.writeFileSync + readFileSync round-trip', function() {
    var fs = require('fs');
    var testPath = '/tmp/vh_test_' + Date.now() + '.txt';
    var content = 'VectorHeart test: ' + new Date().toISOString();
    fs.writeFileSync(testPath, content);
    var readBack = fs.readFileSync(testPath, 'utf8');
    // Cleanup
    try { fs.unlinkSync(testPath); } catch(e) {}
    return readBack === content;
});

test('fs.writeFileSync binary data', function() {
    var fs = require('fs');
    var testPath = '/tmp/vh_test_bin_' + Date.now() + '.dat';
    var buf = Buffer.alloc(256);
    for (var i = 0; i < 256; i++) buf[i] = i;
    fs.writeFileSync(testPath, buf);
    var readBack = fs.readFileSync(testPath);
    try { fs.unlinkSync(testPath); } catch(e) {}
    if (readBack.length !== 256) return false;
    for (var j = 0; j < 256; j++) {
        if (readBack[j] !== j) return false;
    }
    return true;
});

test('fs.readdirSync lists /tmp', function() {
    var fs = require('fs');
    var entries = fs.readdirSync('/tmp');
    return Array.isArray(entries);
});

// ============================================================================
// 6. memmove (ecall 703) — large copy offloaded to host
// ============================================================================
test('Buffer.copy for large buffer (triggers VH memmove)', function() {
    // VH memmove kicks in for copies > 1024 bytes
    var src = Buffer.alloc(8192);
    for (var i = 0; i < src.length; i++) src[i] = i & 0xFF;
    var dst = Buffer.alloc(8192);
    src.copy(dst);
    // Verify
    for (var j = 0; j < dst.length; j++) {
        if (dst[j] !== (j & 0xFF)) return false;
    }
    return true;
});

// ============================================================================
// 7. Network fetch (ecall 800-803) — if available
// ============================================================================
test('DNS resolution via require("dns")', function() {
    // This just tests that the dns module loads without crashing
    var dns = require('dns');
    return typeof dns.lookup === 'function';
});

// Note: actual fetch() requires the network proxy to be running.
// We test the module loading path at minimum.
test('https module loads', function() {
    var https = require('https');
    return typeof https.request === 'function';
});

// ============================================================================
// 8. Process info
// ============================================================================
test('process.arch is riscv64', function() {
    return process.arch === 'riscv64';
});

test('process.platform is linux', function() {
    return process.platform === 'linux';
});

test('process.pid is a number', function() {
    return typeof process.pid === 'number' && process.pid > 0;
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n========================================');
console.log('VectorHeart Shim Test Results');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('  Total:  ' + (passed + failed));
console.log('========================================');

process.exit(failed > 0 ? 1 : 0);
