#!/usr/bin/env node
// Test whether 2GB allocation works in the friscy Wasm module
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(__dirname, '..', 'friscy-bundle');

async function main() {
    console.log('[alloc] Loading Emscripten module...');
    const { default: createFriscy } = await import(join(BUNDLE, 'friscy.js'));

    const module = await createFriscy({
        noInitialRun: true,
        print: (text) => console.log('[stdout]', text),
        printErr: (text) => console.error('[stderr]', text),
    });

    const HEAPU8 = module.HEAPU8;
    console.log('[alloc] Initial memory:', HEAPU8.length, 'bytes =',
        (HEAPU8.length / 1024 / 1024 / 1024).toFixed(2), 'GB');

    // Test increasingly large allocations
    const sizes = [
        ['256MB', 256 * 1024 * 1024],
        ['512MB', 512 * 1024 * 1024],
        ['1GB', 1024 * 1024 * 1024],
        ['1.5GB', 1536 * 1024 * 1024],
        ['1.9GB', 1945 * 1024 * 1024],
        ['2GB', 2 * 1024 * 1024 * 1024],
        ['2GB+4K', 2 * 1024 * 1024 * 1024 + 4096],
    ];

    for (const [name, size] of sizes) {
        try {
            // Use unsigned representation for the size
            const sizeU32 = size >>> 0;
            console.log(`[alloc] Trying malloc(${name} = ${sizeU32} = 0x${sizeU32.toString(16)})...`);
            const ptr = module._malloc(sizeU32);
            if (ptr === 0) {
                console.log(`[alloc] ${name}: malloc returned NULL`);
            } else {
                console.log(`[alloc] ${name}: SUCCESS at ptr=0x${(ptr >>> 0).toString(16)}`);
                const newHeap = module.HEAPU8.length;
                console.log(`[alloc]   Memory now: ${(newHeap / 1024 / 1024 / 1024).toFixed(2)} GB`);

                // Try to access the pointer + near the end
                try {
                    module.HEAPU8[ptr] = 42;
                    console.log(`[alloc]   Write to ptr OK`);
                } catch (e) {
                    console.log(`[alloc]   Write to ptr FAILED: ${e.message}`);
                }

                if (sizeU32 > 100) {
                    try {
                        module.HEAPU8[ptr + sizeU32 - 1] = 99;
                        console.log(`[alloc]   Write to ptr+end OK (at 0x${((ptr + sizeU32 - 1) >>> 0).toString(16)})`);
                    } catch (e) {
                        console.log(`[alloc]   Write to ptr+end FAILED: ${e.message}`);
                    }
                }

                // Free it for the next test
                module._free(ptr);
            }
        } catch (e) {
            console.log(`[alloc] ${name}: EXCEPTION: ${e.constructor.name}: ${e.message}`);
            break;
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
