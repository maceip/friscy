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
const WAIT_FOR_EXIT = process.env.FRISCY_TEST_WAIT_FOR_EXIT !== '0';
const METRIC_WAIT_TIMEOUT_MS = Number.parseInt(process.env.FRISCY_TEST_METRIC_WAIT_TIMEOUT_MS || '120000', 10);

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
    let instructionCount = null;
    let guestExitCode = null;
    let foundAtMs = null;
    let completionMs = null;
    let finalJitStats = null;

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
            if (text.includes('[JIT] Compiler loaded')) {
                jitCompilerLoaded = true;
            }
            if (text.includes('[JIT] Compiled region')) {
                jitRegionsCompiled += 1;
            }
            const instMatch = text.match(/Instructions:\s*([0-9]+)/);
            if (instMatch) {
                instructionCount = Number.parseInt(instMatch[1], 10);
            }
            const guestExitMatch = text.match(/Exit code:\s*([0-9]+)/);
            if (guestExitMatch) {
                guestExitCode = Number.parseInt(guestExitMatch[1], 10);
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

            if (!found && content.includes(EXPECTED_OUTPUT)) {
                found = true;
                foundAtMs = Date.now();
                if (!WAIT_FOR_EXIT) {
                    break;
                }
                console.log('[test] Expected output observed; waiting for exit/metrics...');
            }

            if (found && WAIT_FOR_EXIT) {
                const metricWaitElapsed = Date.now() - (foundAtMs || start);
                if (status.includes('Exited') || status.includes('Error')) {
                    break;
                }
                if (guestExitCode !== null && instructionCount !== null && metricWaitElapsed >= 1000) {
                    break;
                }
                if (metricWaitElapsed >= METRIC_WAIT_TIMEOUT_MS) {
                    console.log('[test] Metric wait timeout reached; proceeding with collected data');
                    break;
                }
            } else if (status.includes('Exited') || status.includes('Error')) {
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
        try {
            finalJitStats = await page.evaluate(() => window.__friscyJitStats || null);
        } catch {
            finalJitStats = null;
        }
        completionMs = Date.now();

        console.log('\n=== TERMINAL CONTENT (head) ===');
        console.log(termData.slice(0, 1200));
        console.log(`=== END (${termData.length} chars) ===\n`);

        const matchedVersion = termData.includes('Claude Code') && /\d+\.\d+\.\d+/.test(termData);
        const hasModuleError =
            termData.includes('MODULE_NOT_FOUND') ||
            termData.includes('Cannot find module') ||
            termData.includes('[worker] Error:');
        const pass =
            found &&
            matchedVersion &&
            !hasModuleError &&
            guestExitCode === 0;

        console.log(`"${EXPECTED_OUTPUT}" found: ${found}`);
        console.log(`[METRIC] claude_version_match=${matchedVersion ? 1 : 0}`);
        console.log(`[METRIC] guest_exit_code=${guestExitCode ?? -1}`);
        console.log(`[METRIC] instructions=${instructionCount ?? -1}`);
        console.log(`[METRIC] jit_compiler_loaded=${jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] jit_regions_compiled=${jitRegionsCompiled}`);
        const firstOutputSeconds = foundAtMs ? ((foundAtMs - start) / 1000) : -1;
        const completionSeconds = completionMs ? ((completionMs - start) / 1000) : ((Date.now() - start) / 1000);
        console.log(`[METRIC] first_output_s=${firstOutputSeconds.toFixed(3)}`);
        console.log(`[METRIC] completion_s=${completionSeconds.toFixed(3)}`);
        console.log(`[METRIC] misses_before_steady_state=${finalJitStats?.missesBeforeSteady ?? -1}`);
        console.log(`[METRIC] predictor_hit_rate=${Number.isFinite(finalJitStats?.predictorHitRate) ? finalJitStats.predictorHitRate.toFixed(6) : '-1'}`);
        console.log(`[METRIC] miss_rate=${Number.isFinite(finalJitStats?.missRate) ? finalJitStats.missRate.toFixed(6) : '-1'}`);
        console.log(`[METRIC] queue_peak=${finalJitStats?.compileQueuePeak ?? -1}`);
        console.log(`[METRIC] queue_depth_end=${finalJitStats?.queueDepth ?? -1}`);
        console.log(`[METRIC] markov_predictions_accepted=${finalJitStats?.markovPredictionsAccepted ?? -1}`);
        console.log(`[METRIC] markov_predictions_evaluated=${finalJitStats?.markovPredictionsEvaluated ?? -1}`);
        console.log(`Total time: ${completionSeconds.toFixed(1)}s`);

        if (!pass) {
            if (!matchedVersion) console.log('[FAIL] missing semantic Claude version line');
            if (guestExitCode !== 0) console.log(`[FAIL] guest exit code is not 0: ${guestExitCode}`);
            if (hasModuleError) console.log('[FAIL] detected module/runtime error in terminal output');
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
