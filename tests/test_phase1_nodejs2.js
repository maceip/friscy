#!/usr/bin/env node
// test_phase1_nodejs2.js — Rigorous Node.js boot test
//
// Verifies node -e 'console.log(42)' actually runs in the emulator.
// Uses a unique marker to avoid false positives.

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
const MARKER = 'NODEJS_BOOT_7xQ9';
const ROOTFS_URL = process.env.FRISCY_TEST_ROOTFS_URL || './rootfs.tar';

async function main() {
    let server = null;
    let browser = null;
    let originalManifest = null;

    try {
        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');
        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: "test-nodejs",
            rootfs: ROOTFS_URL,
            entrypoint: `/usr/bin/node --jitless --max-old-space-size=256 -e console.log('${MARKER}')`,
            workdir: "/",
            env: [
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "NODE_OPTIONS=--jitless --max-old-space-size=256",
                "HOME=/root",
            ],
            aot: [],
        }, null, 2));

        server = spawn('node', [join(BUNDLE_DIR, 'serve.js'), String(PORT)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: BUNDLE_DIR,
        });
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('server timeout')), 5000);
            server.stdout.on('data', d => {
                if (d.toString().includes('http://')) { clearTimeout(t); resolve(); }
            });
            server.stderr.on('data', d => console.log('[server-err]', d.toString().trim()));
            server.on('error', e => { clearTimeout(t); reject(e); });
        });
        console.log(`[test] Rootfs URL: ${ROOTFS_URL}`);
        console.log(`[test] Server on :${PORT}`);

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

        page.on('console', msg => {
            const text = msg.text();
            // Log key events
            if (text.includes('error') || text.includes('Error') ||
                text.includes(MARKER) || text.includes('Instructions') ||
                text.includes('Exit code') || text.includes('exit_group') ||
                text.includes('Execution complete'))
                console.log(`[chrome] [${msg.type()}] ${text}`);
        });
        page.on('pageerror', err => {
            console.log('[chrome-error]', err.message);
        });

        console.log('[test] Loading page...');
        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log(`[test] Waiting for marker: ${MARKER}`);
        const start = Date.now();
        let found = false;

        while (Date.now() - start < 600000) { // 10 minute timeout
            let content = '';
            let status = '';
            try {
                content = await page.evaluate(() => {
                    const el = document.querySelector('.xterm-rows');
                    return el ? el.textContent : '';
                });
                status = await page.evaluate(() => {
                    const el = document.getElementById('status');
                    return el ? el.textContent : '';
                });
            } catch (err) {
                const message = err && err.message ? err.message : String(err);
                // The page occasionally reloads during startup; retry after navigation settles.
                if (message.includes('Execution context was destroyed') ||
                    message.includes('Cannot find context with specified id')) {
                    await new Promise(r => setTimeout(r, 250));
                    continue;
                }
                throw err;
            }

            if (content.includes(MARKER)) {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                console.log(`[PASS] Node.js produced output in ${elapsed}s`);
                found = true;
                break;
            }

            if (status.includes('Error')) {
                console.log('[FAIL] Error:', status);
                break;
            }

            if (status.includes('Exited')) {
                // Machine exited — dump terminal content
                console.log('[INFO] Machine exited. Status:', status);
                console.log('[INFO] Terminal content (first 1000 chars):');
                console.log(content.slice(0, 1000));
                break;
            }

            if ((Date.now() - start) % 15000 < 1100) {
                const elapsed = Math.floor((Date.now() - start) / 1000);
                console.log(`[test] ${elapsed}s status="${status}" xterm-len=${content.length}`);
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        if (!found) {
            console.log(`[FAIL] Did not find ${MARKER} in terminal output`);
        }

        process.exit(found ? 0 : 1);
    } finally {
        if (originalManifest) {
            try { writeFileSync(join(BUNDLE_DIR, 'manifest.json'), originalManifest); } catch {}
        }
        if (browser) try { await browser.close(); } catch {}
        if (server) server.kill('SIGTERM');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
