#!/usr/bin/env node
// Test malloc + memset to simulate what "new PageData[524289]" does
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(__dirname, '..', 'friscy-bundle');

async function main() {
    console.log('[alloc2] Loading Emscripten module...');
    const { default: createFriscy } = await import(join(BUNDLE, 'friscy.js'));

    const module = await createFriscy({
        noInitialRun: true,
        print: (text) => console.log('[stdout]', text),
        printErr: (text) => console.error('[stderr]', text),
    });

    console.log('[alloc2] Initial memory:', module.HEAPU8.length, 'bytes');

    // Simulate VFS loading: allocate ~85MB that stays on the heap
    console.log('[alloc2] Simulating VFS data (~85MB)...');
    const vfsPtr = module._malloc(85 * 1024 * 1024);
    console.log('[alloc2] VFS ptr: 0x' + (vfsPtr >>> 0).toString(16));

    // Now try allocating 2GB+4K (same as arena)
    const ARENA_SIZE = 2147487744; // (1<<31) + 4096 = 0x80001000
    console.log('[alloc2] Allocating arena:', ARENA_SIZE, 'bytes (0x' + (ARENA_SIZE >>> 0).toString(16) + ')');

    try {
        const arenaPtr = module._malloc(ARENA_SIZE);
        if (arenaPtr === 0) {
            console.log('[alloc2] malloc returned NULL');
            return;
        }
        console.log('[alloc2] Arena ptr: 0x' + (arenaPtr >>> 0).toString(16));
        console.log('[alloc2] Arena end: 0x' + ((arenaPtr + ARENA_SIZE) >>> 0).toString(16));
        console.log('[alloc2] Memory size:', module.HEAPU8.length, '(' +
            (module.HEAPU8.length / 1024 / 1024 / 1024).toFixed(2) + ' GB)');

        // Test: can we access the LAST byte?
        try {
            module.HEAPU8[arenaPtr + ARENA_SIZE - 1] = 42;
            console.log('[alloc2] Last byte write OK');
        } catch (e) {
            console.log('[alloc2] Last byte write FAILED:', e.message);
        }

        // Now simulate what new PageData[] does: zero all memory
        // First try with small chunks
        console.log('[alloc2] Zeroing arena in 1MB chunks...');
        const chunkSize = 1024 * 1024; // 1MB
        let offset = 0;
        let chunkNum = 0;
        while (offset < ARENA_SIZE) {
            const size = Math.min(chunkSize, ARENA_SIZE - offset);
            try {
                module.HEAPU8.fill(0, arenaPtr + offset, arenaPtr + offset + size);
                chunkNum++;
                if (chunkNum % 100 === 0) {
                    process.stdout.write(`  ${(offset / 1024 / 1024).toFixed(0)}MB / ${(ARENA_SIZE / 1024 / 1024).toFixed(0)}MB\r`);
                }
            } catch (e) {
                console.log(`\n[alloc2] Fill FAILED at offset ${offset} (0x${offset.toString(16)}): ${e.message}`);
                console.log(`  Target address: 0x${(arenaPtr + offset).toString(16)}`);
                return;
            }
            offset += size;
        }
        console.log(`\n[alloc2] Zeroing complete: ${(ARENA_SIZE / 1024 / 1024).toFixed(0)}MB zeroed OK`);

        // Now try what ACTUALLY might fail: calling a Wasm function that does memset(ptr, 0, 2GB)
        // We can't easily do this from JS, but let's check if the issue might be the
        // size_t conversion in Wasm's memory.fill instruction
        console.log('[alloc2] All tests passed!');

    } catch (e) {
        console.log('[alloc2] EXCEPTION:', e.constructor.name + ':', e.message);
    }

    module._free(vfsPtr);
}

main().catch(e => { console.error(e); process.exit(1); });
