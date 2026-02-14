#!/usr/bin/env node
// test_browser_basic.js — Quick sanity: can friscy even boot in Chrome?
//
// Tests with a simple command (busybox echo) to isolate whether the
// 31-bit arena OOB is from arena allocation or from Node.js specifically.

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(PROJECT_ROOT, 'friscy-bundle');

const PORT = 8098;

async function main() {
    let server = null;
    let browser = null;
    let originalManifest = null;

    try {
        // Override manifest to use a simple command
        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');
        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: "test",
            entrypoint: "/bin/busybox echo FRISCY_WORKS",
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
            const t = setTimeout(() => reject(new Error('timeout')), 5000);
            server.stdout.on('data', d => { if (d.toString().includes('http://')) { clearTimeout(t); resolve(); } });
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
        const consoleLog = [];
        page.on('console', msg => {
            consoleLog.push(msg.text());
        });
        page.on('pageerror', err => errors.push(err.message));

        console.log('[test] Loading page...');
        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait up to 60s for the command to complete
        console.log('[test] Waiting for output...');
        const start = Date.now();
        let found = false;
        while (Date.now() - start < 60000) {
            const content = await page.evaluate(() => {
                const el = document.querySelector('.xterm-rows');
                return el ? el.textContent : '';
            });
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return el ? el.textContent : '';
            });

            if (content.includes('FRISCY_WORKS')) {
                console.log('[PASS] busybox echo works in Chrome');
                found = true;
                break;
            }
            if (content.includes('Error') || content.includes('memory access out of bounds')) {
                console.log('[FAIL] Error in terminal:', content.trim().slice(-200));
                break;
            }
            // Check console for errors
            const oob = consoleLog.find(m => m.includes('memory access out of bounds'));
            if (oob) {
                console.log('[FAIL] OOB error — 31-bit arena too large for Wasm');
                console.log('[INFO] Last console messages:');
                consoleLog.slice(-10).forEach(m => console.log(`  ${m}`));
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!found) {
            console.log('[INFO] All console messages:');
            consoleLog.forEach(m => console.log(`  ${m}`));
        }

        process.exit(found ? 0 : 1);
    } finally {
        // Restore manifest
        if (originalManifest) {
            const manifestPath = join(BUNDLE_DIR, 'manifest.json');
            writeFileSync(manifestPath, originalManifest);
        }
        if (browser) try { await browser.close(); } catch {}
        if (server) server.kill('SIGTERM');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
