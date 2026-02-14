#!/usr/bin/env node
// test_claude_version.js — Run `claude --version` in the browser emulator
// Expected: ~3.4B instructions, outputs "X.Y.Z (Claude Code)"

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(PROJECT_ROOT, 'friscy-bundle');

const PORT = 8099;

async function main() {
    let server = null;
    let browser = null;

    try {
        server = spawn('node', [join(BUNDLE_DIR, 'serve.js'), String(PORT)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: BUNDLE_DIR,
        });
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('server timeout')), 5000);
            server.stdout.on('data', d => {
                if (d.toString().includes('http://')) { clearTimeout(t); resolve(); }
            });
            server.on('error', e => { clearTimeout(t); reject(e); });
        });
        console.log(`[test] Server on :${PORT}`);

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                   '--js-flags=--max-old-space-size=4096'],
        });
        const page = await browser.newPage();

        // Log ALL console messages from the page
        page.on('console', msg => {
            const text = msg.text();
            console.log(`[chrome] [${msg.type()}] ${text}`);
        });
        page.on('pageerror', err => {
            console.log(`[chrome-error] ${err.message}`);
        });

        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('[test] Page loaded');

        const start = Date.now();
        let lastLog = 0;

        while (Date.now() - start < 1800000) { // 30 minute timeout
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return el ? el.textContent : 'NO STATUS ELEMENT';
            });

            if (status.includes('Exited') || status.includes('Error')) {
                console.log('[test] Machine finished:', status);
                break;
            }

            const elapsed = Math.floor((Date.now() - start) / 1000);
            if (elapsed - lastLog >= 30) {
                lastLog = elapsed;
                console.log(`[test] ${elapsed}s waiting... status="${status}"`);
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        await new Promise(r => setTimeout(r, 1000));

        const termData = await page.evaluate(() => {
            const term = document.querySelector('.xterm-rows');
            return term ? term.textContent : 'NO XTERM';
        });

        console.log('\n=== TERMINAL CONTENT ===');
        console.log(termData);
        console.log(`=== END (${termData.length} chars) ===\n`);

        const found = termData.includes('Claude Code');
        console.log(`"Claude Code" found: ${found}`);

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`Total time: ${elapsed}s`);

        process.exit(found ? 0 : 1);
    } finally {
        if (browser) try { await browser.close(); } catch {}
        if (server) server.kill('SIGTERM');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
