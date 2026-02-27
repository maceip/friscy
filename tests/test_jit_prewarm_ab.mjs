#!/usr/bin/env node

import puppeteer from 'puppeteer';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(PROJECT_ROOT, 'friscy-bundle');

const REQUESTED_PORT = Number.parseInt(process.env.FRISCY_TEST_PORT || '8099', 10);
const ROOTFS_URL = process.env.FRISCY_TEST_ROOTFS_URL || './rootfs.tar';
const GUEST_CMD = process.env.FRISCY_TEST_CMD || 'i=0; while [ $i -lt 200000 ]; do i=$((i+1)); done; echo done';
const TIMEOUT_MS = Number.parseInt(process.env.FRISCY_TEST_TIMEOUT_MS || '180000', 10);
const CONTROL_QUERY = process.env.FRISCY_TEST_CONTROL_QUERY || '?example=alpine&jithot=1&jitawait=1&nojitprewarm=1';
const CANDIDATE_QUERY = process.env.FRISCY_TEST_CANDIDATE_QUERY || '?example=alpine&jithot=1&jitawait=1';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isContextChurn(err) {
    const msg = err && err.message ? err.message : String(err);
    return msg.includes('Execution context was destroyed') ||
        msg.includes('Cannot find context with specified id');
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
            probe.close((err) => err ? reject(err) : resolve(port));
        });
    });
}

function parseTelemetryFromConsole(text) {
    const m = text.match(/\[worker\] resume telemetry (\{.*\})/);
    if (!m) return null;
    try {
        return JSON.parse(m[1]);
    } catch {
        return null;
    }
}

async function runCase(browser, port, query, label) {
    const page = await browser.newPage();
    let telemetry = null;
    let pageError = null;
    let jitCompilerLoaded = false;
    let jitRegionsCompiled = 0;

    page.on('console', (msg) => {
        const text = msg.text();
        const parsed = parseTelemetryFromConsole(text);
        if (parsed) telemetry = parsed;
        if (text.includes('[JIT] Compiler loaded')) jitCompilerLoaded = true;
        if (text.includes('[JIT] Compiled region')) jitRegionsCompiled++;
        console.log(`[${label}] [${msg.type()}] ${text}`);
    });
    page.on('pageerror', (err) => {
        pageError = err.message || String(err);
        console.log(`[${label}] [pageerror] ${pageError}`);
    });

    await page.goto(`http://127.0.0.1:${port}${query}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
    });

    const startedMs = Date.now();
    let status = '';
    let flat = '';
    while (Date.now() - startedMs < TIMEOUT_MS) {
        try {
            const snap = await page.evaluate(() => {
                const statusEl = document.getElementById('status');
                const rows = document.querySelector('.xterm-rows');
                return {
                    status: statusEl ? statusEl.textContent || '' : '',
                    flat: rows ? rows.textContent || '' : '',
                };
            });
            status = snap.status;
            flat = snap.flat;
        } catch (err) {
            if (isContextChurn(err)) {
                await delay(250);
                continue;
            }
            throw err;
        }

        if (telemetry) {
            await delay(400);
            break;
        }
        await delay(250);
    }

    const elapsedMs = Date.now() - startedMs;
    await page.close();

    return { telemetry, status, flat, elapsedMs, pageError, jitCompilerLoaded, jitRegionsCompiled };
}

function checkControl(result) {
    const t = result.telemetry;
    const s = t?.jitSummary || null;
    return [
        { ok: !!t, msg: 'telemetry present' },
        { ok: !!t && t.timesliceResumeEnabled === true, msg: 'timesliceResumeEnabled=true' },
        { ok: !!t && Number(t.resumeCount) > 0, msg: 'resumeCount>0' },
        { ok: !!s && Number(s.prewarmSuccesses ?? 0) === 0, msg: 'prewarmSuccesses=0 (nojitprewarm)' },
    ];
}

function checkCandidate(result) {
    const t = result.telemetry;
    const s = t?.jitSummary || null;
    return [
        { ok: !!t, msg: 'telemetry present' },
        { ok: !!t && t.timesliceResumeEnabled === true, msg: 'timesliceResumeEnabled=true' },
        { ok: !!t && Number(t.resumeCount) > 0, msg: 'resumeCount>0' },
        { ok: !!s && Number(s.prewarmSuccesses ?? 0) > 0, msg: 'prewarmSuccesses>0' },
        { ok: !!s && s.compilerPrewarmed === true, msg: 'compilerPrewarmed=true' },
    ];
}

function printChecks(prefix, checks) {
    for (const c of checks) {
        console.log(`${c.ok ? '[PASS]' : '[FAIL]'} ${prefix}: ${c.msg}`);
    }
}

function metricNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : -1;
}

async function main() {
    let server = null;
    let browser = null;
    let originalManifest = null;

    try {
        const port = await pickOpenPort(REQUESTED_PORT);
        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');

        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: 'test-jit-prewarm-ab',
            rootfs: ROOTFS_URL,
            entrypoint: ['/bin/sh', '-lc', GUEST_CMD],
            workdir: '/',
            env: [
                'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                'HOME=/root',
                'TERM=xterm-256color',
                'NO_COLOR=1',
            ],
            aot: [],
        }, null, 2));

        server = spawn('node', [join(BUNDLE_DIR, 'serve.js'), String(port)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: BUNDLE_DIR,
        });
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('server timeout')), 8000);
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

        console.log(`[test] server=${port}`);
        console.log(`[test] rootfs=${ROOTFS_URL}`);
        console.log(`[test] cmd=${GUEST_CMD}`);
        console.log(`[test] control_query=${CONTROL_QUERY}`);
        console.log(`[test] candidate_query=${CANDIDATE_QUERY}`);

        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--js-flags=--max-old-space-size=4096',
            ],
        });

        const control = await runCase(browser, port, CONTROL_QUERY, 'control');
        const candidate = await runCase(browser, port, CANDIDATE_QUERY, 'candidate');

        const cSummary = control.telemetry?.jitSummary || {};
        const nSummary = candidate.telemetry?.jitSummary || {};

        console.log(`[METRIC] control_elapsed_ms=${control.elapsedMs}`);
        console.log(`[METRIC] candidate_elapsed_ms=${candidate.elapsedMs}`);
        console.log(`[METRIC] control_resume_count=${metricNumber(control.telemetry?.resumeCount)}`);
        console.log(`[METRIC] candidate_resume_count=${metricNumber(candidate.telemetry?.resumeCount)}`);
        console.log(`[METRIC] control_jit_compiler_loaded=${control.jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] candidate_jit_compiler_loaded=${candidate.jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] control_jit_regions_compiled=${control.jitRegionsCompiled}`);
        console.log(`[METRIC] candidate_jit_regions_compiled=${candidate.jitRegionsCompiled}`);
        console.log(`[METRIC] control_prewarm_successes=${metricNumber(cSummary.prewarmSuccesses)}`);
        console.log(`[METRIC] candidate_prewarm_successes=${metricNumber(nSummary.prewarmSuccesses)}`);
        console.log(`[METRIC] control_compiler_prewarmed=${cSummary.compilerPrewarmed ? 1 : 0}`);
        console.log(`[METRIC] candidate_compiler_prewarmed=${nSummary.compilerPrewarmed ? 1 : 0}`);
        console.log(`[METRIC] control_first_compile_latency_ms=${metricNumber(cSummary.firstCompileLatencyMs)}`);
        console.log(`[METRIC] candidate_first_compile_latency_ms=${metricNumber(nSummary.firstCompileLatencyMs)}`);

        const controlChecks = checkControl(control);
        const candidateChecks = checkCandidate(candidate);
        printChecks('control', controlChecks);
        printChecks('candidate', candidateChecks);

        const pass = controlChecks.every(c => c.ok) && candidateChecks.every(c => c.ok);
        if (pass) {
            console.log('[PASS] #2 jit prewarm A/B harness is green');
            process.exit(0);
        }
        if (control.pageError) console.log(`[FAIL] control pageerror=${control.pageError}`);
        if (candidate.pageError) console.log(`[FAIL] candidate pageerror=${candidate.pageError}`);
        console.log('[FAIL] #2 jit prewarm A/B harness failed');
        process.exit(1);
    } finally {
        if (originalManifest) {
            try {
                writeFileSync(join(BUNDLE_DIR, 'manifest.json'), originalManifest);
            } catch {
                // ignore
            }
        }
        if (browser) {
            try {
                await browser.close();
            } catch {
                // ignore
            }
        }
        if (server) server.kill('SIGTERM');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
