#!/usr/bin/env node
// test_phase1_nodejs.js — Phase 1 verification: Node.js boot via Worker+SAB
//
// Tests that Node.js can boot inside the emulator running in a Worker.
// Verifies UI doesn't freeze (no "tab unresponsive") by checking animation frames.

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
        // Override manifest to run node -e 'console.log(42)'
        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');
        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: "test-nodejs",
            entrypoint: "/usr/bin/node --jitless --max-old-space-size=256 -e console.log(42)",
            workdir: "/",
            env: [
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "NODE_OPTIONS=--jitless --max-old-space-size=256",
                "HOME=/root",
            ],
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
            // Only log interesting messages
            if (text.includes('error') || text.includes('Error') ||
                text.includes('Exit') || text.includes('exit') ||
                text.includes('[friscy]') || text.includes('42'))
                console.log('[chrome]', text);
        });
        page.on('pageerror', err => {
            errors.push(err.message);
            console.log('[chrome-error]', err.message);
        });

        console.log('[test] Loading page...');
        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait up to 5 minutes for Node.js to boot and output "42"
        console.log('[test] Waiting for Node.js to boot...');
        const start = Date.now();
        let found = false;

        // Also track animation frames to verify UI isn't frozen
        await page.evaluate(() => {
            window._frameCount = 0;
            window._lastFrameTime = performance.now();
            function countFrames() {
                window._frameCount++;
                window._lastFrameTime = performance.now();
                requestAnimationFrame(countFrames);
            }
            requestAnimationFrame(countFrames);
        });

        while (Date.now() - start < 300000) { // 5 minute timeout
            const content = await page.evaluate(() => {
                const el = document.querySelector('.xterm-rows');
                return el ? el.textContent : '';
            });
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return el ? el.textContent : '';
            });

            if (content.includes('42')) {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                console.log(`[PASS] Node.js -e 'console.log(42)' works in ${elapsed}s`);
                found = true;
                break;
            }

            // Check for fatal errors
            if (status.includes('Error')) {
                console.log('[FAIL] Error during startup:', status);
                break;
            }

            // Log progress every 15s
            if ((Date.now() - start) % 15000 < 1100) {
                const frames = await page.evaluate(() => window._frameCount);
                const elapsed = Math.floor((Date.now() - start) / 1000);
                console.log(`[test] ${elapsed}s status="${status}" frames=${frames} xterm-len=${content.length}`);
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        if (!found) {
            const finalContent = await page.evaluate(() => {
                const el = document.querySelector('.xterm-rows');
                return el ? el.textContent : 'NO XTERM';
            });
            console.log('[FAIL] Did not find "42" in terminal output');
            console.log('[INFO] Terminal content:', finalContent.slice(0, 500));
        }

        // Check UI responsiveness (animation frames should have been running)
        const frames = await page.evaluate(() => window._frameCount);
        const elapsed = (Date.now() - start) / 1000;
        const fps = frames / elapsed;
        console.log(`[INFO] UI responsiveness: ${frames} frames in ${elapsed.toFixed(1)}s (${fps.toFixed(1)} fps)`);
        if (fps < 5) {
            console.log('[WARN] Low FPS suggests UI thread may have been blocked');
        } else {
            console.log('[PASS] UI thread stayed responsive during Node.js boot');
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
