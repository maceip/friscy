#!/usr/bin/env node
// test_claude_haiku.js — Run `claude -p "write me a haiku"` in browser emulator
// and verify the guest returns a haiku-like multi-line response.

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
const ROOTFS_URL = process.env.FRISCY_TEST_ROOTFS_URL || './nodejs-claude.tar';
const PAGE_QUERY = process.env.FRISCY_TEST_QUERY || '?proxy=https://78.141.219.102:4433/connect';
const CLAUDE_CMD = process.env.FRISCY_TEST_CLAUDE_CMD || 'claude -p "write me a haiku"';
const WAIT_FOR_EXIT = process.env.FRISCY_TEST_WAIT_FOR_EXIT !== '0';
const METRIC_WAIT_TIMEOUT_MS = Number.parseInt(process.env.FRISCY_TEST_METRIC_WAIT_TIMEOUT_MS || '180000', 10);

function forwardEnv() {
    const env = [
        'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'HOME=/root',
        'TERM=xterm-256color',
        'NO_COLOR=1',
    ];
    for (const [key, value] of Object.entries(process.env)) {
        if (!value) continue;
        if (key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_')) {
            env.push(`${key}=${value}`);
        }
    }
    return env;
}

async function canBindPort(port) {
    return new Promise((resolve) => {
        const probe = createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.once('listening', () => probe.close(() => resolve(true)));
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

function extractHaikuRows(rows) {
    const trimmed = rows.map((line) => line.trim());
    const separators = [];
    for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i].includes('----------------------------------------')) {
            separators.push(i);
        }
    }
    if (separators.length >= 2) {
        return trimmed
            .slice(separators[0] + 1, separators[1])
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }

    return trimmed.filter((line) => {
        if (!line) return false;
        if (line.startsWith('[friscy]')) return false;
        if (line.startsWith('Process exited')) return false;
        if (line.startsWith('Image:')) return false;
        if (line.startsWith('Network:')) return false;
        if (line.startsWith('friscy fast')) return false;
        if (line.startsWith('Run Docker')) return false;
        return true;
    });
}

function looksLikeHaiku(lines) {
    const alphaLines = lines.filter((line) => /[A-Za-z]/.test(line));
    if (alphaLines.length < 3) {
        return false;
    }
    const errPattern = /(error|failed|exception|unauthorized|forbidden|rate limit|timeout)/i;
    if (alphaLines.some((line) => errPattern.test(line))) {
        return false;
    }
    return true;
}

async function main() {
    let server = null;
    let browser = null;
    let originalManifest = null;
    let instructionCount = null;
    let guestExitCode = null;
    let jitCompilerLoaded = false;
    let jitRegionsCompiled = 0;

    try {
        const port = await pickOpenPort(REQUESTED_PORT);
        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');

        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: 'test-claude-haiku',
            rootfs: ROOTFS_URL,
            entrypoint: ['/bin/sh', '-lc', CLAUDE_CMD],
            workdir: '/',
            env: forwardEnv(),
            aot: [],
        }, null, 2));

        server = spawn('node', [join(BUNDLE_DIR, 'serve.js'), String(port)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: BUNDLE_DIR,
        });
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('server timeout')), 5000);
            server.stdout.on('data', d => {
                if (d.toString().includes('http://')) {
                    clearTimeout(t);
                    resolve();
                }
            });
            server.stderr.on('data', d => console.log('[server-err]', d.toString().trim()));
            server.on('error', e => {
                clearTimeout(t);
                reject(e);
            });
        });

        console.log(`[test] Server on :${port}`);
        console.log(`[test] Rootfs URL: ${ROOTFS_URL}`);
        console.log(`[test] Command: ${CLAUDE_CMD}`);
        console.log(`[test] Query: ${PAGE_QUERY}`);
        console.log(`[test] Wait for exit metrics: ${WAIT_FOR_EXIT ? 'yes' : 'no'}`);

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
            if (instMatch) instructionCount = Number.parseInt(instMatch[1], 10);
            const exitMatch = text.match(/Exit code:\s*([0-9]+)/);
            if (exitMatch) guestExitCode = Number.parseInt(exitMatch[1], 10);
            if (text.includes('[JIT] Compiler loaded')) jitCompilerLoaded = true;
            if (text.includes('[JIT] Compiled region')) jitRegionsCompiled += 1;
            console.log(`[chrome] [${msg.type()}] ${text}`);
        });
        page.on('pageerror', err => console.log(`[chrome-error] ${err.message}`));

        await page.goto(`http://127.0.0.1:${port}${PAGE_QUERY}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        console.log('[test] Page loaded');

        const start = Date.now();
        let lastLog = 0;
        let sawPromptOutput = false;
        let sawPromptAt = null;

        while (Date.now() - start < 1800000) {
            let status = '';
            let content = '';
            try {
                status = await page.evaluate(() => {
                    const el = document.getElementById('status');
                    return el ? el.textContent : '';
                });
                content = await page.evaluate(() => {
                    const el = document.querySelector('.xterm-rows');
                    return el ? el.textContent : '';
                });
            } catch (err) {
                const message = err && err.message ? err.message : String(err);
                if (message.includes('Execution context was destroyed') ||
                    message.includes('Cannot find context with specified id')) {
                    await new Promise(r => setTimeout(r, 250));
                    continue;
                }
                throw err;
            }

            if (!sawPromptOutput && /[A-Za-z]/.test(content)) {
                sawPromptOutput = true;
                sawPromptAt = Date.now();
            }

            if (WAIT_FOR_EXIT && sawPromptOutput) {
                const waited = Date.now() - (sawPromptAt || start);
                if (status.includes('Exited') || status.includes('Error')) break;
                if (guestExitCode !== null && instructionCount !== null && waited >= 1000) break;
                if (waited >= METRIC_WAIT_TIMEOUT_MS) {
                    console.log('[test] Metric wait timeout reached');
                    break;
                }
            } else if (status.includes('Exited') || status.includes('Error')) {
                break;
            }

            const elapsed = Math.floor((Date.now() - start) / 1000);
            if (elapsed - lastLog >= 30) {
                lastLog = elapsed;
                console.log(`[test] ${elapsed}s waiting... status="${status}" xterm-len=${content.length}`);
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        const rowData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.xterm-rows > div'))
                .map(el => (el.textContent || '').replace(/\u00a0/g, ' '))
                .map(line => line.trimEnd());
            const term = document.querySelector('.xterm-rows');
            const flat = term ? term.textContent : '';
            return { rows, flat };
        });

        const haikuRows = extractHaikuRows(rowData.rows);
        const haikuLike = looksLikeHaiku(haikuRows);
        const hasRuntimeError =
            rowData.flat.includes('MODULE_NOT_FOUND') ||
            rowData.flat.includes('Cannot find module') ||
            rowData.flat.includes('[worker] Error:');
        const pass =
            haikuLike &&
            !hasRuntimeError &&
            guestExitCode === 0 &&
            Number.isFinite(instructionCount) &&
            instructionCount > 0;

        console.log('\n=== HAIKU CANDIDATE ROWS ===');
        for (const line of haikuRows.slice(0, 12)) {
            console.log(line);
        }
        console.log(`=== END (${haikuRows.length} row(s)) ===\n`);

        console.log(`[METRIC] haiku_like=${haikuLike ? 1 : 0}`);
        console.log(`[METRIC] guest_exit_code=${guestExitCode ?? -1}`);
        console.log(`[METRIC] instructions=${instructionCount ?? -1}`);
        console.log(`[METRIC] jit_compiler_loaded=${jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] jit_regions_compiled=${jitRegionsCompiled}`);

        if (!pass) {
            if (!haikuLike) console.log('[FAIL] response did not look like a multi-line haiku');
            if (guestExitCode !== 0) console.log(`[FAIL] guest exit code is not 0: ${guestExitCode}`);
            if (hasRuntimeError) console.log('[FAIL] runtime/module error detected in terminal output');
        }

        return pass ? 0 : 1;
    } finally {
        if (originalManifest) {
            try { writeFileSync(join(BUNDLE_DIR, 'manifest.json'), originalManifest); } catch {}
        }
        if (browser) try { await browser.close(); } catch {}
        if (server) server.kill('SIGTERM');
    }
}

main()
    .then(code => process.exit(code))
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
