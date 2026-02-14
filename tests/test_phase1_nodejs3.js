#!/usr/bin/env node
// test_phase1_nodejs3.js — Dump full terminal content for Node.js boot
// Verifies what actually ran and checks instruction count

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
const MARKER = 'NODEJS_REAL_xK3m';

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
            server.on('error', e => { clearTimeout(t); reject(e); });
        });

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                   '--js-flags=--max-old-space-size=4096'],
        });
        const page = await browser.newPage();

        // Capture ALL console messages
        const allConsole = [];
        page.on('console', msg => {
            allConsole.push(`[${msg.type()}] ${msg.text()}`);
        });

        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for machine to exit
        const start = Date.now();
        while (Date.now() - start < 600000) {
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return el ? el.textContent : '';
            });
            if (status.includes('Exited') || status.includes('Error')) {
                console.log('[test] Machine finished:', status);
                break;
            }
            if ((Date.now() - start) % 30000 < 1100) {
                console.log(`[test] ${Math.floor((Date.now()-start)/1000)}s waiting...`);
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        // Wait a moment for ring buffer to drain
        await new Promise(r => setTimeout(r, 500));

        // Dump FULL terminal content using xterm buffer API
        const termData = await page.evaluate(() => {
            // Try xterm buffer API for full scrollback
            const term = document.querySelector('.xterm-rows');
            const visible = term ? term.textContent : 'NO XTERM';
            // Also try to get total rows from xterm
            return { visible: visible, length: visible ? visible.length : 0 };
        });

        console.log('\n=== TERMINAL CONTENT ===');
        console.log(termData.visible);
        console.log(`=== END (${termData.length} chars) ===\n`);

        // Check for marker
        const found = termData.visible.includes(MARKER);
        console.log(`Marker "${MARKER}" found: ${found}`);

        // Print relevant console messages
        console.log('\n=== KEY CONSOLE MESSAGES ===');
        for (const msg of allConsole) {
            if (msg.includes('Instructions') || msg.includes('Exit code') ||
                msg.includes('exit_group') || msg.includes(MARKER) ||
                msg.includes('Error') || msg.includes('error') ||
                msg.includes('Execution complete') || msg.includes('simulate'))
                console.log(msg);
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
