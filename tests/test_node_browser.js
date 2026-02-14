#!/usr/bin/env node
// test_node_browser.js — End-to-end test: boot Node.js inside friscy in Chrome
//
// This is the hard test. It proves:
//   1. friscy.wasm loads in a real browser (3GB WebAssembly.Memory)
//   2. JSPI (JS Promise Integration) works for async I/O
//   3. The 82MB rootfs with Node.js unpacks and mounts correctly
//   4. execve works (sh -> node transition)
//   5. Node.js V8 boots inside the RISC-V emulator inside WebAssembly
//   6. stdout flows through the xterm.js terminal
//
// Usage: node tests/test_node_browser.js
//
// Requires: puppeteer (npm install), Chrome (auto-downloaded by puppeteer)

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(PROJECT_ROOT, 'friscy-bundle');

const PORT = 8099;
const TIMEOUT_MS = 180_000; // 3 minutes — Node.js boot is slow in emulator

async function main() {
    let server = null;
    let browser = null;
    let passed = false;

    try {
        // 1. Start the static file server with COOP/COEP headers
        console.log(`[test] Starting server on port ${PORT}...`);
        server = spawn('node', [join(BUNDLE_DIR, 'serve.js'), String(PORT)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: BUNDLE_DIR,
        });

        // Wait for server to be ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Server start timeout')), 5000);
            server.stdout.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('http://')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            server.stderr.on('data', (data) => {
                console.error(`[server-err] ${data.toString().trim()}`);
            });
            server.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        console.log(`[test] Server ready at http://localhost:${PORT}`);

        // 2. Launch Chrome via Puppeteer
        console.log('[test] Launching Chrome...');
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                // Allow 4GB Wasm memory (needed for 3GB INITIAL_MEMORY)
                '--js-flags=--max-old-space-size=4096',
                // Enable JSPI (should be default in Chrome 145, but be explicit)
                '--enable-features=WebAssemblyJSPromiseIntegration',
            ],
        });

        const page = await browser.newPage();

        // Collect console output from the page
        const consoleMessages = [];
        page.on('console', (msg) => {
            const text = msg.text();
            consoleMessages.push(text);
            // Show key messages
            if (text.includes('friscy') || text.includes('Node') || text.includes('node') ||
                text.includes('Error') || text.includes('error') || text.includes('rootfs') ||
                text.includes('Execution') || text.includes('exit')) {
                console.log(`[chrome] ${text}`);
            }
        });

        // Catch page errors
        page.on('pageerror', (err) => {
            console.error(`[chrome-error] ${err.message}`);
        });

        // 3. Navigate to friscy
        console.log('[test] Loading friscy page...');
        await page.goto(`http://localhost:${PORT}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });

        // 4. Wait for Node.js output in the terminal
        //    The manifest entrypoint runs: node --jitless -e "console.log(42)"
        //    which should print "42" and exit.
        //
        //    We poll the xterm.js terminal buffer for the output.
        console.log('[test] Waiting for Node.js to boot (this takes 1-3 minutes)...');

        const startTime = Date.now();
        let terminalContent = '';
        let foundOutput = false;

        while (Date.now() - startTime < TIMEOUT_MS) {
            // Read terminal content from xterm.js buffer
            terminalContent = await page.evaluate(() => {
                const termEl = document.querySelector('.xterm-rows');
                return termEl ? termEl.textContent : '';
            });

            // Also check the status element
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return el ? el.textContent : '';
            });

            // Check for expected output "42" from console.log(42)
            if (terminalContent.includes('42')) {
                console.log(`[test] Found Node.js output: 42`);
                foundOutput = true;
            }

            // Check for OOB crash
            const oob = consoleMessages.find(m => m.includes('memory access out of bounds'));
            if (oob) {
                console.error('[FAIL] OOB error in Wasm build');
                consoleMessages.slice(-15).forEach(m => console.error(`  ${m}`));
                break;
            }

            if (foundOutput) {
                break;
            }

            // Progress indicator
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            if (Number(elapsed) % 15 === 0) {
                process.stdout.write(`\r[test] Waiting... ${elapsed}s`);
            }

            await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
        }

        console.log(''); // Newline after progress

        // 5. Assert results
        if (foundOutput) {
            console.log(`\n[PASS] Node.js booted in Chrome and printed 42`);
            console.log(`[PASS] Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
            passed = true;
        } else {
            console.error('\n[FAIL] Node.js output not found in terminal');
            console.error('[FAIL] Terminal content (last 500 chars):');
            console.error(terminalContent.slice(-500));
            console.error('[FAIL] Console messages (last 20):');
            consoleMessages.slice(-20).forEach(m => console.error(`  ${m}`));
        }

    } catch (err) {
        console.error(`\n[FAIL] ${err.message}`);
        if (err.stack) console.error(err.stack);
    } finally {
        // Cleanup
        if (browser) {
            try { await browser.close(); } catch {}
        }
        if (server) {
            server.kill('SIGTERM');
        }
    }

    process.exit(passed ? 0 : 1);
}

main();
