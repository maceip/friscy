#!/usr/bin/env node
// Diagnose the exact OOB in the Wasm build — capture full stack trace
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(__dirname, '..', 'friscy-bundle');
const PORT = 8097;

async function main() {
    // Start server
    const server = spawn('node', [join(BUNDLE, 'serve.js'), String(PORT)], {
        stdio: ['ignore', 'pipe', 'pipe'], cwd: BUNDLE,
    });
    await new Promise((r, j) => {
        const t = setTimeout(() => j('timeout'), 5000);
        server.stdout.on('data', d => { if (d.toString().includes('http://')) { clearTimeout(t); r(); } });
    });

    const browser = await puppeteer.launch({
        headless: true,
        dumpio: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
               '--js-flags=--max-old-space-size=4096 --wasm-max-mem-pages=65536'],
    });
    const page = await browser.newPage();

    // Capture ALL errors with full stack traces
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Error') || text.includes('error') || text.includes('friscy') ||
            text.includes('Loading') || text.includes('memory')) {
            console.log(`[chrome] ${text}`);
        }
    });
    page.on('pageerror', err => {
        console.log(`[PAGE ERROR] ${err.message}`);
        console.log(`[STACK] ${err.stack}`);
    });

    // Inject error handler BEFORE the page loads friscy
    await page.evaluateOnNewDocument(() => {
        window.addEventListener('error', (e) => {
            console.error(`[UNCAUGHT] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
            if (e.error && e.error.stack) {
                console.error(`[STACK] ${e.error.stack}`);
            }
        });
        window.addEventListener('unhandledrejection', (e) => {
            const err = e.reason;
            console.error(`[REJECTION] ${err}`);
            if (err && err.stack) {
                console.error(`[STACK] ${err.stack}`);
            }
        });
    });

    console.log('[test] Loading friscy page...');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the error to manifest
    await new Promise(r => setTimeout(r, 15000));

    // Also try to read Wasm memory info
    const memInfo = await page.evaluate(() => {
        if (window._friscyModule && window._friscyModule.wasmMemory) {
            const mem = window._friscyModule.wasmMemory;
            return { bufferSize: mem.buffer.byteLength };
        }
        return { bufferSize: 'N/A (module not exposed)' };
    });
    console.log('[test] Wasm memory:', JSON.stringify(memInfo));

    await browser.close();
    server.kill('SIGTERM');
}

main().catch(e => { console.error(e); process.exit(1); });
