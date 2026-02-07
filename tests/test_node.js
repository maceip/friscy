// test_node.js - Node.js test runner for friscy
//
// Usage:
//   node test_node.js <riscv64-elf-binary> [args...]
//   node test_node.js --rootfs <rootfs.tar> <entry-binary> [args...]
//
// Examples:
//   node test_node.js ./guest
//   node test_node.js --rootfs alpine.tar /bin/busybox ls -la

import initModule from './build/friscy.js';
import { readFileSync, existsSync } from 'fs';
import { argv } from 'process';
import { basename } from 'path';

async function run() {
    // Parse arguments
    let rootfsPath = null;
    let binaryPath = null;
    let guestArgs = [];

    let i = 2;
    while (i < argv.length) {
        if (argv[i] === '--rootfs') {
            if (i + 2 >= argv.length) {
                console.error("Error: --rootfs requires <tarfile> and <entry-binary>");
                process.exit(1);
            }
            rootfsPath = argv[++i];
            binaryPath = argv[++i];
        } else if (argv[i] === '--help' || argv[i] === '-h') {
            console.log("friscy - Docker container runner via libriscv (Node.js)");
            console.log("");
            console.log("Usage:");
            console.log("  node test_node.js <riscv64-elf-binary> [args...]");
            console.log("  node test_node.js --rootfs <rootfs.tar> <entry-binary> [args...]");
            console.log("");
            console.log("Examples:");
            console.log("  node test_node.js ./guest");
            console.log("  node test_node.js --rootfs alpine.tar /bin/busybox ls -la");
            process.exit(0);
        } else {
            if (!binaryPath) {
                binaryPath = argv[i];
            }
            // Collect remaining as guest args
            while (i < argv.length) {
                guestArgs.push(argv[i++]);
            }
            break;
        }
        i++;
    }

    if (!binaryPath) {
        console.error("Error: No binary specified");
        console.error("Usage: node test_node.js <riscv64-elf-binary> [args...]");
        process.exit(1);
    }

    // Build arguments for friscy
    const friscyArgs = [];

    if (rootfsPath) {
        // Container mode
        if (!existsSync(rootfsPath)) {
            console.error(`Error: Rootfs not found: ${rootfsPath}`);
            process.exit(1);
        }

        console.log(`[node] Loading rootfs: ${rootfsPath}`);
        const rootfsData = readFileSync(rootfsPath);

        friscyArgs.push('--rootfs', '/rootfs.tar', binaryPath);
        friscyArgs.push(...guestArgs.slice(1));  // Skip the entry binary from guestArgs

        const Module = await initModule({
            print: (text) => console.log(text),
            printErr: (text) => console.error(text),
            preRun: [(mod) => {
                // Write rootfs tar to Emscripten VFS
                mod.FS.writeFile('/rootfs.tar', new Uint8Array(rootfsData));
            }],
            arguments: friscyArgs,
        });

    } else {
        // Standalone binary mode
        if (!existsSync(binaryPath)) {
            console.error(`Error: Binary not found: ${binaryPath}`);
            process.exit(1);
        }

        console.log(`[node] Loading binary: ${binaryPath}`);
        const binaryData = readFileSync(binaryPath);
        const vfsPath = '/' + basename(binaryPath);

        friscyArgs.push(vfsPath);
        friscyArgs.push(...guestArgs.slice(1));

        const Module = await initModule({
            print: (text) => console.log(text),
            printErr: (text) => console.error(text),
            preRun: [(mod) => {
                // Write binary to Emscripten VFS
                mod.FS.writeFile(vfsPath, new Uint8Array(binaryData));
            }],
            arguments: friscyArgs,
        });
    }

    console.log("[node] Execution complete.");
}

run().catch(err => {
    console.error("[node] Runtime error:", err);
    process.exit(1);
});
