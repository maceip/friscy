#!/usr/bin/env node
import assert from 'node:assert/strict';
import jitManager from '../friscy-bundle/jit_manager.js';

const RUN_WASM_BYTES = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00,
    0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x00, 0x0b,
]);

function cleanupScheduler() {
    if (jitManager.schedulerTimer !== null) {
        clearInterval(jitManager.schedulerTimer);
        jitManager.schedulerTimer = null;
    }
}

function resetHarness() {
    cleanupScheduler();
    jitManager.reset();
    jitManager.wasmMemory = new WebAssembly.Memory({ initial: 2 });
}

async function testFastToCompatFallback() {
    resetHarness();
    let fastCalls = 0;
    let compatCalls = 0;
    jitManager.jitCompiler = {
        compile_region_fast() {
            fastCalls += 1;
            throw new Error('fast failed');
        },
        compile_region() {
            compatCalls += 1;
            return RUN_WASM_BYTES;
        },
        compile_region_optimized: null,
        supportsTiering: false,
    };

    await jitManager.compileRegion(0x1000, 'unit-fallback', 'baseline');

    const entry = jitManager.getCompiledRegion(0x1000);
    assert.ok(entry, 'expected compiled region after fallback');
    assert.equal(entry.tier, 'compat', 'expected compat tier after fast failure');
    assert.equal(fastCalls, 1, 'expected one fast attempt');
    assert.equal(compatCalls, 1, 'expected one compat fallback attempt');
    assert.equal(jitManager.stats.compileFailures, 0, 'fallback success must not count as compile failure');
    console.log('[PASS] fallback: fast -> compat compiles successfully');
}

async function testSpeculativePrewarmDoesNotCountFailure() {
    resetHarness();
    jitManager.jitCompiler = {
        compile_region_fast() {
            throw new Error('fast failed');
        },
        compile_region() {
            throw new Error('compat failed');
        },
        compile_region_optimized: null,
        supportsTiering: false,
    };

    const ok = await jitManager.prewarmRegionAt(0x2345);
    assert.equal(ok, false, 'prewarm should fail with failing compilers');
    assert.equal(jitManager.stats.compileFailures, 0, 'speculative prewarm failure must not increment compileFailures');
    console.log('[PASS] prewarm: speculative failures do not inflate compileFailures');
}

async function testQueueDrainIsImmediate() {
    resetHarness();
    jitManager.jitCompiler = {
        compile_region_fast() {
            return RUN_WASM_BYTES;
        },
        compile_region() {
            return RUN_WASM_BYTES;
        },
        compile_region_optimized: null,
        supportsTiering: false,
    };

    const queued = jitManager.queueCompileRequest(0x3000, { reason: 'unit-queue', requestedTier: 'baseline' });
    assert.equal(queued, true, 'expected queue enqueue success');

    await new Promise((resolve) => setTimeout(resolve, 30));

    const entry = jitManager.getCompiledRegion(0x3000);
    assert.ok(entry, 'expected queue to drain without waiting scheduler interval');
    assert.ok(jitManager.stats.regionsCompiled >= 1, 'expected at least one compiled region');
    console.log('[PASS] queue: enqueue triggers immediate compile processing');
}

async function main() {
    try {
        await testFastToCompatFallback();
        await testSpeculativePrewarmDoesNotCountFailure();
        await testQueueDrainIsImmediate();
        console.log('[PASS] #2 JIT prewarm reliability spec is green');
    } finally {
        cleanupScheduler();
    }
}

main().catch((err) => {
    cleanupScheduler();
    console.error(err);
    process.exit(1);
});
