#!/usr/bin/env node
// Puppeteer test: load friscy, boot bash, run `claude --version`,
// capture the syscall ring and all worker console output.

import puppeteer from 'puppeteer';

const URL = process.argv[2] || 'http://localhost:8080/?example=claude-code';
const TIMEOUT = 120_000; // 2 minutes max

(async () => {
    const browser = await puppeteer.launch({
        headless: 'shell',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--enable-features=SharedArrayBuffer',
            // Required for cross-origin isolation
            '--disable-web-security',
        ],
    });

    const page = await browser.newPage();

    // Collect ALL console messages (worker stderr goes here)
    const logs = [];
    const syscallRing = [];
    const abortLines = [];
    const tidLines = [];

    page.on('console', (msg) => {
        const text = msg.text();
        logs.push(text);

        // Capture syscall ring entries
        if (text.includes('[ABORT-child]') || text.includes('[ABORT]')) {
            abortLines.push(text);
        }
        if (text.includes('sys#')) {
            syscallRing.push(text);
        }
        if (text.includes('set_tid_address')) {
            tidLines.push(text);
        }
        // Print interesting lines in real time
        if (text.includes('[friscy]') ||
            text.includes('[ABORT') ||
            text.includes('set_tid') ||
            text.includes('ebreak') ||
            text.includes('EBREAK') ||
            text.includes('execve') ||
            text.includes('fork-') ||
            text.includes('sys#') ||
            text.includes('Process exited') ||
            text.includes('Claude') ||
            text.includes('version')) {
            console.log(`[console] ${text}`);
        }
    });

    page.on('pageerror', (err) => {
        console.log(`[page-error] ${err.message}`);
    });

    console.log(`Loading ${URL}...`);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
    console.log('Page loaded, waiting for terminal...');

    // Wait for the terminal to appear and bash prompt
    await page.waitForFunction(
        () => {
            const el = document.querySelector('.xterm-screen');
            if (!el) return false;
            const text = el.textContent || '';
            return text.includes('bash') || text.includes('#') || text.includes('$');
        },
        { timeout: TIMEOUT }
    );
    console.log('Bash prompt detected.');

    // Small delay to let bash fully initialize
    await new Promise(r => setTimeout(r, 2000));

    // Type the command
    const cmd = process.argv[3] || 'claude';
    console.log(`Typing: ${cmd}`);
    await page.keyboard.type(cmd, { delay: 50 });
    await page.keyboard.press('Enter');

    // Wait for either success (version output) or failure (ABORT / Process exited)
    console.log('Waiting for result...');
    const startTime = Date.now();
    let result = 'timeout';

    while (Date.now() - startTime < TIMEOUT) {
        await new Promise(r => setTimeout(r, 500));

        // Check for abort
        if (abortLines.length > 0) {
            result = 'abort';
            // Wait a bit more for the full ring dump
            await new Promise(r => setTimeout(r, 2000));
            break;
        }

        // Check terminal content for version output or prompt return
        const termText = await page.evaluate(() => {
            const el = document.querySelector('.xterm-screen');
            return el ? el.textContent : '';
        });

        if (termText.includes('Claude Code') || termText.includes('claude-code')) {
            result = 'success';
            break;
        }

        // Check if Process exited appeared
        if (termText.includes('Process exited')) {
            result = 'process_exited';
            break;
        }

        // Check if we got back to a bash prompt after the command
        const lines = termText.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || '';
        if (lastLine.includes('bash') && lastLine.includes('#') &&
            logs.some(l => l.includes('fork-restore'))) {
            result = 'child_exited';
            await new Promise(r => setTimeout(r, 1000));
            break;
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Result: ${result}`);
    console.log(`${'='.repeat(60)}`);

    if (tidLines.length > 0) {
        console.log(`\n--- set_tid_address calls ---`);
        tidLines.forEach(l => console.log(l));
    }

    if (abortLines.length > 0) {
        console.log(`\n--- ABORT info ---`);
        abortLines.forEach(l => console.log(l));
    }

    if (syscallRing.length > 0) {
        console.log(`\n--- Syscall Ring (last 32 before crash) ---`);
        syscallRing.forEach(l => console.log(l));
    }

    // Get terminal content
    const finalTermText = await page.evaluate(() => {
        const el = document.querySelector('.xterm-screen');
        return el ? el.textContent : '';
    });
    console.log(`\n--- Terminal content ---`);
    // Print last 20 non-empty lines
    const termLines = finalTermText.split('\n').filter(l => l.trim());
    termLines.slice(-20).forEach(l => console.log(`  ${l.trim()}`));

    console.log(`\n--- Summary ---`);
    console.log(`Total console messages: ${logs.length}`);
    console.log(`ABORT lines: ${abortLines.length}`);
    console.log(`Syscall ring entries: ${syscallRing.length}`);
    console.log(`TID calls: ${tidLines.length}`);

    await browser.close();
    process.exit(result === 'success' ? 0 : 1);
})();
