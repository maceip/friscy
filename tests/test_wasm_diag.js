#!/usr/bin/env node
// Diagnose the exact OOB in the Wasm build using Node.js directly (no browser needed)

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(__dirname, '..', 'friscy-bundle');

const manifestPath = join(BUNDLE, 'manifest.json');
const originalManifest = readFileSync(manifestPath, 'utf8');

async function main() {
    try {
        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: "test",
            entrypoint: "/bin/busybox echo FRISCY_WORKS",
            workdir: "/",
            env: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
            aot: [],
        }, null, 2));

        console.log('[diag] Loading Emscripten module factory...');
        const { default: createFriscy } = await import(join(BUNDLE, 'friscy.js'));
        console.log('[diag] Module factory loaded');

        const rootfsData = readFileSync(join(BUNDLE, 'rootfs.tar'));
        console.log('[diag] Rootfs loaded:', rootfsData.length, 'bytes');

        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        console.log('[diag] Entrypoint:', manifest.entrypoint);

        const module = await createFriscy({
            noInitialRun: true,
            print: (text) => console.log('[stdout]', text),
            printErr: (text) => console.error('[stderr]', text),
            onAbort: (what) => console.error('[ABORT]', what),
        });

        console.log('[diag] Module created successfully');

        // Check heap state
        const heapU8 = module.HEAPU8;
        console.log('[diag] HEAPU8 length:', heapU8.length, 'bytes (' +
            (heapU8.length / 1024 / 1024 / 1024).toFixed(2) + ' GB)');

        // Load rootfs into VFS
        console.log('[diag] Writing rootfs to Emscripten FS...');
        module.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));
        console.log('[diag] Rootfs written');

        // Parse entrypoint and build args
        const parts = manifest.entrypoint.split(' ');
        // callMain expects argv[1..] (argv[0] is added by Emscripten)
        const args = ['--rootfs', '/rootfs.tar', ...parts];
        console.log('[diag] callMain args:', args);

        try {
            const result = await module.callMain(args);
            console.log('[diag] callMain returned:', result);
        } catch (e) {
            console.error('[diag] callMain ERROR:', e.constructor.name + ':', e.message);
            if (e.stack) {
                // Print stack trace, looking for Wasm function indices
                const lines = e.stack.split('\n');
                for (const line of lines) {
                    console.error('[diag]', line.trim());
                }
            }
        }

        // Check friscy_stopped
        try {
            const stopped = module.wasmExports.friscy_stopped();
            console.log('[diag] friscy_stopped():', stopped);
            if (stopped) {
                console.log('[diag] Machine stopped for stdin - trying friscy_resume()');
                const resumed = await module.wasmExports.friscy_resume();
                console.log('[diag] friscy_resume() returned:', resumed);
            }
        } catch (e) {
            console.error('[diag] wasmExports check error:', e.message);
        }

    } catch (e) {
        console.error('[diag] FATAL:', e.constructor.name + ':', e.message);
        if (e.stack) {
            const lines = e.stack.split('\n');
            for (const line of lines) {
                console.error('[diag]', line.trim());
            }
        }
    } finally {
        writeFileSync(manifestPath, originalManifest);
    }
}

main();
