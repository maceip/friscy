#!/usr/bin/env node
// Test: run claude -p in browser emulator, wait for output
import puppeteer from 'puppeteer';

const EXAMPLE = process.argv[2] || 'claude-plain';
const PORT = process.argv[3] || '9090';
const URL = `http://localhost:${PORT}?example=${EXAMPLE}`;
const TIMEOUT = Infinity; // No timeout — run until exit or error

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function test() {
    console.log(`[test] Example: ${EXAMPLE}`);
    console.log(`[test] URL: ${URL}`);
    const startTime = Date.now();

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-features=SharedArrayBuffer'],
    });

    const page = await browser.newPage();
    const allLogs = [];
    page.on('console', msg => {
        const text = msg.text();
        allLogs.push(text);
        if (text.includes('[friscy]') || text.includes('[worker]') || text.includes('[resume]')) {
            process.stdout.write(`  ${text}\n`);
        }
    });
    page.on('pageerror', err => console.error(`  [page-error] ${err.message}`));

    console.log(`[test] Navigating...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    console.log('[test] Waiting for haiku output...');
    let lastElapsed = 0;

    while (Date.now() - startTime < TIMEOUT) {
        const termText = await page.evaluate(() => {
            const rows = document.querySelector('.xterm-rows');
            return rows ? rows.textContent : '';
        }).catch(() => '');

        // Check for haiku-like output or process exit
        if (termText.includes('Process exited') || termText.includes('exit code')) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n[test] Process exited after ${elapsed}s`);
            console.log(`[test] === Terminal Output ===`);
            const lines = termText.split(/\s{2,}/).filter(l => l.trim());
            lines.forEach(l => console.log(`  ${l}`));
            break;
        }

        // Check for fatal errors
        const fatalError = allLogs.find(m =>
            (m.includes('[worker] Error:') || m.includes('[worker] Run failed:'))
            && !m.includes('EBREAK') && !m.includes('[JIT]')
        );
        if (fatalError) {
            console.error(`[test] Fatal error: ${fatalError}`);
            break;
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (elapsed > lastElapsed && elapsed % 10 === 0) {
            lastElapsed = elapsed;
            const resumeCount = allLogs.filter(m => m.includes('[worker] resume') || m.includes('[resume]')).length;
            console.log(`[test] Still waiting... ${elapsed}s elapsed, ${resumeCount} resumes`);
        }

        await sleep(500);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[test] Total time: ${totalTime}s`);

    await browser.close();
}

test().catch(e => { console.error('[test] Fatal:', e); process.exit(1); });
