#!/usr/bin/env node
// Puppeteer test: run VH shim test inside RISC-V emulator in browser
import puppeteer from 'puppeteer';

const PORT = process.argv[2] || '9876';
const URL = `http://localhost:${PORT}?example=vh-test`;
const TIMEOUT = 180_000; // 3 minutes — Node.js boot is slow in emulator

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function test() {
    console.log(`[test] Launching browser, target: ${URL}`);
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--enable-features=SharedArrayBuffer',
        ],
    });

    const page = await browser.newPage();

    // Collect all console output
    const allLogs = [];
    page.on('console', msg => {
        const text = msg.text();
        allLogs.push(text);
        // Print friscy/worker messages for progress tracking
        if (text.includes('[friscy]') || text.includes('[worker]')) {
            process.stdout.write(`  ${text}\n`);
        }
    });
    page.on('pageerror', err => {
        console.error(`  [page-error] ${err.message}`);
    });

    console.log(`[test] Navigating...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for test to complete — look for the summary line in terminal output
    console.log('[test] Waiting for VH shim test to complete...');
    const startTime = Date.now();
    let termText = '';
    let testDone = false;

    while (Date.now() - startTime < TIMEOUT) {
        termText = await page.evaluate(() => {
            const rows = document.querySelector('.xterm-rows');
            return rows ? rows.textContent : '';
        }).catch(() => '');

        if (termText.includes('VectorHeart Shim Test Results')) {
            testDone = true;
            break;
        }

        // Check for fatal errors
        const fatalError = allLogs.find(m =>
            (m.includes('[worker] Error:') || m.includes('[worker] Run failed:'))
            && !m.includes('EBREAK')
            && !m.includes('[JIT]')
        );
        if (fatalError) {
            console.error(`[test] Fatal error detected: ${fatalError}`);
            break;
        }

        // Progress indicator
        if ((Date.now() - startTime) % 10_000 < 600) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const resumeCount = allLogs.filter(m => m.includes('[worker] resume')).length;
            console.log(`[test] Still waiting... ${elapsed}s elapsed, ${resumeCount} resumes`);
        }

        await sleep(500);
    }

    // Extract terminal content
    console.log('\n[test] === Terminal Output ===');
    // Get lines from terminal
    const lines = termText.split(/\s{2,}/).filter(l => l.trim());
    lines.forEach(l => console.log(`  ${l}`));

    // Parse results
    const passMatches = termText.match(/Passed:\s*(\d+)/);
    const failMatches = termText.match(/Failed:\s*(\d+)/);
    const passCount = passMatches ? parseInt(passMatches[1]) : 0;
    const failCount = failMatches ? parseInt(failMatches[1]) : 0;

    console.log('\n[test] === Summary ===');
    if (testDone) {
        console.log(`[test] Test completed: ${passCount} passed, ${failCount} failed`);
        if (failCount === 0) {
            console.log('[test] ALL TESTS PASSED');
        } else {
            console.log('[test] SOME TESTS FAILED');
        }
    } else {
        console.error('[test] Test did not complete within timeout');
        console.error('[test] Last 20 console messages:');
        allLogs.slice(-20).forEach(m => console.error(`  ${m}`));
    }

    // Also try simple shell test if the test example didn't load
    if (!testDone && !termText.includes('PASS') && !termText.includes('FAIL')) {
        console.log('\n[test] VH test did not produce output. Checking if shell is available...');
        console.log(`[test] Terminal text: "${termText.slice(0, 200)}"`);
    }

    await browser.close();
    process.exit(testDone && failCount === 0 ? 0 : 1);
}

test().catch(e => {
    console.error('[test] Fatal:', e);
    process.exit(1);
});
