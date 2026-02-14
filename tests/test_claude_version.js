#!/usr/bin/env node
// test_claude_version.js — Run `claude --version` in browser emulator

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
const ROOTFS_URL = process.env.FRISCY_TEST_ROOTFS_URL || './nodejs.tar';
const CLAUDE_CMD = process.env.FRISCY_TEST_CLAUDE_CMD || '/usr/bin/node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js --version';
const EXPECTED_OUTPUT = process.env.FRISCY_TEST_EXPECTED_OUTPUT || 'Claude Code';
const PAGE_QUERY = process.env.FRISCY_TEST_QUERY || '?noproxy';

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

function splitCommand(command) {
    return command
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

async function main() {
    let server = null;
    let browser = null;
    let originalManifest = null;
    let jitCompilerLoaded = false;
    let jitRegionsCompiled = 0;

    try {
        const port = await pickOpenPort(REQUESTED_PORT);
        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');

        const entrypoint = splitCommand(CLAUDE_CMD);
        if (entrypoint.length === 0) {
            throw new Error('empty FRISCY_TEST_CLAUDE_CMD');
        }

        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: 'test-claude',
            rootfs: ROOTFS_URL,
            entrypoint,
            workdir: '/',
            env: [
                'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                'HOME=/root',
                'TERM=xterm-256color',
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
        console.log(`[test] Expected: ${EXPECTED_OUTPUT}`);
        console.log(`[test] Query: ${PAGE_QUERY || '(none)'}`);

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
            if (text.includes('[JIT] Compiler loaded')) {
                jitCompilerLoaded = true;
            }
            if (text.includes('[JIT] Compiled region')) {
                jitRegionsCompiled += 1;
            }
            console.log(`[chrome] [${msg.type()}] ${text}`);
        });
        page.on('pageerror', err => {
            console.log(`[chrome-error] ${err.message}`);
        });

        await page.goto(`http://127.0.0.1:${port}${PAGE_QUERY}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        console.log('[test] Page loaded');

        const start = Date.now();
        let found = false;
        let lastLog = 0;

        while (Date.now() - start < 1800000) {
            let status = '';
            let content = '';
            try {
                status = await page.evaluate(() => {
                    const el = document.getElementById('status');
                    return el ? el.textContent : 'NO STATUS ELEMENT';
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

            if (content.includes(EXPECTED_OUTPUT)) {
                found = true;
                break;
            }

            if (status.includes('Exited') || status.includes('Error')) {
                console.log('[test] Machine finished:', status);
                break;
            }

            const elapsed = Math.floor((Date.now() - start) / 1000);
            if (elapsed - lastLog >= 30) {
                lastLog = elapsed;
                console.log(`[test] ${elapsed}s waiting... status="${status}" xterm-len=${content.length}`);
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        const termData = await page.evaluate(() => {
            const term = document.querySelector('.xterm-rows');
            return term ? term.textContent : 'NO XTERM';
        });

        console.log('\n=== TERMINAL CONTENT (head) ===');
        console.log(termData.slice(0, 1200));
        console.log(`=== END (${termData.length} chars) ===\n`);

        console.log(`"${EXPECTED_OUTPUT}" found: ${found}`);
        console.log(`[METRIC] jit_compiler_loaded=${jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] jit_regions_compiled=${jitRegionsCompiled}`);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`Total time: ${elapsed}s`);

        return found ? 0 : 1;
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
