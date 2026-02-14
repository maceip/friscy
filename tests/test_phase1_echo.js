#!/usr/bin/env node
// test_phase1_echo.js — Phase 1 verification: busybox echo via Worker+SAB
//
// Tests that the Worker-based architecture can run busybox echo and
// deliver output through the stdout ring buffer to xterm.

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
            const t = setTimeout(() => reject(new Error('server timeout')), 5000);
            server.stdout.on('data', d => {
                const s = d.toString();
                console.log('[server]', s.trim());
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
        const consoleLog = [];
        page.on('console', msg => {
            const text = `[${msg.type()}] ${msg.text()}`;
            consoleLog.push(text);
            console.log('[chrome]', text);
        });
        page.on('pageerror', err => {
            errors.push(err.message);
            console.log('[chrome-error]', err.message);
        });
        page.on('requestfailed', req => {
            console.log('[chrome-reqfail]', req.url(), req.failure()?.errorText);
        });
        // Catch HTTP error responses (404, 500, etc.)
        page.on('response', resp => {
            if (resp.status() >= 400 && !resp.url().includes('favicon')) {
                console.log(`[chrome-http-${resp.status()}]`, resp.url());
            }
        });
        // Track workers
        page.on('workercreated', w => console.log('[chrome-worker] created:', w.url()));
        page.on('workerdestroyed', w => console.log('[chrome-worker] destroyed:', w.url()));

        console.log('[test] Loading page...');
        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait up to 90s for the command to complete
        console.log('[test] Waiting for output...');
        const start = Date.now();
        let found = false;
        while (Date.now() - start < 90000) {
            const content = await page.evaluate(() => {
                const el = document.querySelector('.xterm-rows');
                return el ? el.textContent : '';
            });
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return el ? el.textContent : '';
            });

            if (content.includes('FRISCY_WORKS')) {
                console.log('[PASS] busybox echo works in Chrome via Worker+SAB');
                found = true;
                break;
            }
            if (content.includes('Error') && content.includes('SharedArrayBuffer')) {
                console.log('[FAIL] SharedArrayBuffer not available');
                break;
            }

            // Check for fatal errors
            const fatal = errors.find(m =>
                m.includes('memory access out of bounds') ||
                m.includes('SharedArrayBuffer') ||
                m.includes('not a constructor')
            );
            if (fatal) {
                console.log('[FAIL] Fatal error:', fatal);
                break;
            }

            // Log status periodically (every 5s instead of 10s for more detail)
            if ((Date.now() - start) % 5000 < 1100) {
                const stage = await page.evaluate(() => {
                    const el = document.getElementById('progress-stage');
                    return el ? el.textContent : '';
                });
                const detail = await page.evaluate(() => {
                    const el = document.getElementById('progress-detail');
                    return el ? el.textContent : '';
                });
                const overlayHidden = await page.evaluate(() => {
                    const el = document.getElementById('progress-overlay');
                    return el ? el.classList.contains('hidden') : true;
                });
                console.log(`[test] ${Math.floor((Date.now()-start)/1000)}s status="${status}" stage="${stage}" detail="${detail}" overlay=${overlayHidden?'hidden':'visible'} xterm-len=${content.length}`);
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        if (!found) {
            console.log('[FAIL] Did not find FRISCY_WORKS in terminal output');
            console.log('[INFO] All console messages:');
            consoleLog.forEach(m => console.log(`  ${m}`));
            console.log('[INFO] Errors:', errors);

            // Grab whatever is in the terminal
            const finalContent = await page.evaluate(() => {
                const el = document.querySelector('.xterm-rows');
                return el ? el.textContent : 'NO XTERM';
            });
            console.log('[INFO] Terminal content:', finalContent.slice(0, 500));
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
