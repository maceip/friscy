#!/usr/bin/env node
// test_phase1_stdin.js — Phase 1 verification: stdin via Worker+SAB
//
// Tests that interactive stdin works through the SharedArrayBuffer bridge.
// Runs busybox cat, sends input, checks for echoed output.

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(PROJECT_ROOT, 'friscy-bundle');

const PORT = 8099;

async function main() {
    let server = null;
    let browser = null;
    let originalManifest = null;

    try {
        // Override manifest to run cat (reads stdin, writes to stdout)
        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');
        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: "test-stdin",
            entrypoint: "/bin/busybox cat",
            workdir: "/",
            env: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
            aot: [],
        }, null, 2));

        // Start server
        server = spawn('node', [join(BUNDLE_DIR, 'serve.js'), String(PORT)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: BUNDLE_DIR,
        });
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('server timeout')), 5000);
            server.stdout.on('data', d => {
                const s = d.toString();
                if (s.includes('http://')) { clearTimeout(t); resolve(); }
            });
            server.stderr.on('data', d => console.log('[server-err]', d.toString().trim()));
            server.on('error', e => { clearTimeout(t); reject(e); });
        });
        console.log(`[test] Server on :${PORT}`);

        // Launch Chrome
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--js-flags=--max-old-space-size=4096',
            ],
        });
        const page = await browser.newPage();

        const errors = [];
        page.on('console', msg => {
            const text = `[${msg.type()}] ${msg.text()}`;
            if (text.includes('error') || text.includes('Error') || text.includes('stdin') || text.includes('STDIN'))
                console.log('[chrome]', text);
        });
        page.on('pageerror', err => {
            errors.push(err.message);
            console.log('[chrome-error]', err.message);
        });

        console.log('[test] Loading page...');
        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for the machine to be running (status = Interactive)
        console.log('[test] Waiting for interactive...');
        const start = Date.now();
        let interactive = false;
        while (Date.now() - start < 30000) {
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return el ? el.textContent : '';
            });
            if (status.includes('Interactive')) {
                interactive = true;
                break;
            }
            if (status.includes('Error')) {
                console.log('[FAIL] Error during startup:', status);
                process.exit(1);
            }
            await new Promise(r => setTimeout(r, 500));
        }
        if (!interactive) {
            console.log('[FAIL] Never reached Interactive state');
            process.exit(1);
        }
        console.log('[test] Interactive mode reached');

        // Wait a moment for cat to start and request stdin
        await new Promise(r => setTimeout(r, 2000));

        // Send stdin data directly to the queue
        console.log('[test] Sending stdin data...');
        await page.evaluate(() => {
            const text = 'STDIN_TEST_OK\n';
            for (let i = 0; i < text.length; i++) {
                const ch = text.charCodeAt(i);
                window._friscyStdinQueue.push(ch === 0x0d ? 0x0a : ch);
            }
        });

        // Wait for the echoed output in the terminal
        console.log('[test] Waiting for echo...');
        let found = false;
        const echoStart = Date.now();
        while (Date.now() - echoStart < 20000) {
            const content = await page.evaluate(() => {
                const el = document.querySelector('.xterm-rows');
                return el ? el.textContent : '';
            });
            if (content.includes('STDIN_TEST_OK')) {
                console.log('[PASS] stdin works in Chrome via Worker+SAB');
                found = true;
                break;
            }
            await new Promise(r => setTimeout(r, 500));
        }

        if (!found) {
            const finalContent = await page.evaluate(() => {
                const el = document.querySelector('.xterm-rows');
                return el ? el.textContent : 'NO XTERM';
            });
            console.log('[FAIL] Did not find STDIN_TEST_OK in terminal output');
            console.log('[INFO] Terminal content:', finalContent.slice(0, 500));
        }

        process.exit(found ? 0 : 1);
    } finally {
        if (originalManifest) {
            const manifestPath = join(BUNDLE_DIR, 'manifest.json');
            try { writeFileSync(manifestPath, originalManifest); } catch {}
        }
        if (browser) try { await browser.close(); } catch {}
        if (server) server.kill('SIGTERM');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
