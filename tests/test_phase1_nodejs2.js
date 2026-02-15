#!/usr/bin/env node
// test_phase1_nodejs2.js — Rigorous Node.js boot test
//
// Verifies node -e 'console.log("42")' actually runs in the emulator.

import puppeteer from 'puppeteer';
import { createServer } from 'net';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(PROJECT_ROOT, 'friscy-bundle');

const REQUESTED_PORT = Number.parseInt(process.env.FRISCY_TEST_PORT || '8099', 10);
const NODE_EVAL = process.env.FRISCY_TEST_NODE_EVAL || 'console.log("42")';
const EXPECTED_OUTPUT = process.env.FRISCY_TEST_EXPECTED_OUTPUT || '42';
const ROOTFS_URL = process.env.FRISCY_TEST_ROOTFS_URL || './rootfs.tar';
const PAGE_QUERY = process.env.FRISCY_TEST_QUERY || '';
const WAIT_FOR_EXIT = process.env.FRISCY_TEST_WAIT_FOR_EXIT === '1';
const METRIC_WAIT_TIMEOUT_MS = Number.parseInt(process.env.FRISCY_TEST_METRIC_WAIT_TIMEOUT_MS || '30000', 10);

async function canBindPort(port) {
    return new Promise((resolve) => {
        const probe = createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.once('listening', () => {
            probe.close(() => resolve(true));
        });
        probe.listen(port, '127.0.0.1');
    });
}

async function pickOpenPort(preferredPort) {
    if (Number.isInteger(preferredPort) && preferredPort > 0 && await canBindPort(preferredPort)) {
        return preferredPort;
    }
    return new Promise((resolve, reject) => {
        const probe = createServer();
        probe.unref();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const addr = probe.address();
            const port = (typeof addr === 'object' && addr) ? addr.port : 8099;
            probe.close((err) => {
                if (err) reject(err);
                else resolve(port);
            });
        });
    });
}

async function main() {
    let server = null;
    let browser = null;
    let originalManifest = null;
    let instructionCount = null;
    let jitRegionsCompiled = 0;
    let jitCompilerLoaded = false;
    let found = false;
    let elapsedSeconds = null;
    let foundAtMs = null;

    try {
        const port = await pickOpenPort(REQUESTED_PORT);
        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');
        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: "test-nodejs",
            rootfs: ROOTFS_URL,
            entrypoint: [
                "/usr/bin/node",
                "--jitless",
                "--max-old-space-size=256",
                "-e",
                NODE_EVAL,
            ],
            workdir: "/",
            env: [
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "NODE_OPTIONS=--jitless --max-old-space-size=256",
                "HOME=/root",
            ],
            aot: [],
        }, null, 2));

        server = spawn('node', [join(BUNDLE_DIR, 'serve.js'), String(port)], {
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
        console.log(`[test] Node eval: ${NODE_EVAL}`);
        console.log(`[test] Expected output: ${EXPECTED_OUTPUT}`);
        console.log(`[test] Page query: ${PAGE_QUERY || '(none)'}`);
        console.log(`[test] Wait for exit metrics: ${WAIT_FOR_EXIT ? 'yes' : 'no'}`);
        console.log(`[test] Server on :${port}`);

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
            const instMatch = text.match(/Instructions:\s*([0-9]+)/);
            if (instMatch) {
                instructionCount = Number.parseInt(instMatch[1], 10);
            }
            if (text.includes('[JIT] Compiler loaded')) {
                jitCompilerLoaded = true;
            }
            if (text.includes('[JIT] Compiled region')) {
                jitRegionsCompiled += 1;
            }
            // Log key events
            if (text.includes('error') || text.includes('Error') ||
                text.includes('[JIT]') ||
                text.includes(EXPECTED_OUTPUT) || text.includes('Instructions') ||
                text.includes('Exit code') || text.includes('exit_group') ||
                text.includes('Execution complete'))
                console.log(`[chrome] [${msg.type()}] ${text}`);
        });
        page.on('pageerror', err => {
            console.log('[chrome-error]', err.message);
        });

        console.log('[test] Loading page...');
        await page.goto(`http://127.0.0.1:${port}${PAGE_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log(`[test] Waiting for output: ${EXPECTED_OUTPUT}`);
        const start = Date.now();

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

            if (!found && content.includes(EXPECTED_OUTPUT)) {
                elapsedSeconds = Number(((Date.now() - start) / 1000).toFixed(3));
                console.log(`[PASS] Node.js produced output in ${elapsedSeconds}s`);
                found = true;
                foundAtMs = Date.now();
                if (!WAIT_FOR_EXIT) {
                    break;
                }
                console.log('[test] Output observed; waiting for completion metrics...');
            }

            if (status.includes('Error')) {
                console.log('[FAIL] Error:', status);
                break;
            }

            if (found && WAIT_FOR_EXIT) {
                const metricWaitElapsed = Date.now() - (foundAtMs || start);
                if (status.includes('Exited')) {
                    break;
                }
                if (instructionCount !== null && metricWaitElapsed >= 1000) {
                    break;
                }
                if (metricWaitElapsed >= METRIC_WAIT_TIMEOUT_MS) {
                    console.log('[test] Metric wait timeout reached; continuing without full completion stats');
                    break;
                }
            } else if (status.includes('Exited')) {
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
            console.log(`[FAIL] Did not find ${EXPECTED_OUTPUT} in terminal output`);
        }
        if (elapsedSeconds !== null) {
            console.log(`[METRIC] elapsed_s=${elapsedSeconds}`);
        }
        if (instructionCount !== null) {
            console.log(`[METRIC] instructions=${instructionCount}`);
        }
        console.log(`[METRIC] jit_compiler_loaded=${jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] jit_regions_compiled=${jitRegionsCompiled}`);
        return { found, elapsedSeconds, instructionCount, jitCompilerLoaded, jitRegionsCompiled };
    } finally {
        if (originalManifest) {
            try { writeFileSync(join(BUNDLE_DIR, 'manifest.json'), originalManifest); } catch {}
        }
        if (browser) try { await browser.close(); } catch {}
        if (server) server.kill('SIGTERM');
    }
}

main()
    .then(result => process.exit(result.found ? 0 : 1))
    .catch(e => { console.error(e); process.exit(1); });
