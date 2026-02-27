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
const GUEST_CMD = process.env.FRISCY_TEST_CMD ||
    'i=0; while [ $i -lt 200000 ]; do i=$((i+1)); done; echo done';
const TIMEOUT_MS = Number.parseInt(process.env.FRISCY_TEST_TIMEOUT_MS || '120000', 10);
const LEGACY_QUERY = process.env.FRISCY_TEST_LEGACY_QUERY || '?example=alpine&nojit&legacyresume=1';
const ENABLED_QUERY = process.env.FRISCY_TEST_ENABLED_QUERY || '?example=alpine&nojit';
const REQUIRE_DONE_OUTPUT = process.env.FRISCY_TEST_REQUIRE_DONE_OUTPUT !== '0';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

        // We only need resume telemetry and a stable terminal snapshot.
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

function assertLegacy(result) {
    const t = result.telemetry;
    const checks = [
        { ok: !!t, msg: 'telemetry present' },
        { ok: !!t && t.timesliceResumeEnabled === false, msg: 'timesliceResumeEnabled=false' },
        { ok: !!t && Number(t.resumeCount) === 0, msg: 'resumeCount=0' },
        { ok: !!t && Number(t.stopTimeslice) >= 1, msg: 'stopTimeslice>=1' },
    ];
    if (REQUIRE_DONE_OUTPUT) checks.push({ ok: !result.flat.includes('done'), msg: 'terminal does not contain done' });
    return checks;
}

function assertEnabled(result) {
    const t = result.telemetry;
    const checks = [
        { ok: !!t, msg: 'telemetry present' },
        { ok: !!t && t.timesliceResumeEnabled === true, msg: 'timesliceResumeEnabled=true' },
        { ok: !!t && Number(t.resumeCount) > 0, msg: 'resumeCount>0' },
        { ok: !!t && Number(t.timesliceResumeAttempts) > 0, msg: 'timesliceResumeAttempts>0' },
        { ok: !!t && Number(t.stopTimeslice) > 0, msg: 'stopTimeslice>0' },
    ];
    if (REQUIRE_DONE_OUTPUT) checks.push({ ok: result.flat.includes('done'), msg: 'terminal contains done' });
    return checks;
}

function printChecks(prefix, checks) {
    for (const c of checks) {
        console.log(`${c.ok ? '[PASS]' : '[FAIL]'} ${prefix}: ${c.msg}`);
    }
}

function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function computeJitActivityScore(result) {
    const t = result.telemetry || {};
    const s = t.jitSummary || {};
    return (
        (result.jitCompilerLoaded ? 1 : 0) +
        num(result.jitRegionsCompiled) +
        num(s.compiledRegionCount) +
        (num(s.queueDepth) > 0 ? 1 : 0) +
        (num(s.compileFailures) > 0 ? 1 : 0) +
        (num(s.prewarmAttempts) > 0 ? 1 : 0) +
        (num(t.jitDispatches) > 0 ? 1 : 0)
    );
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
            image: 'test-main-path-jit-activation',
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

        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--js-flags=--max-old-space-size=4096',
            ],
        });

        const legacy = await runCase(browser, port, LEGACY_QUERY, 'legacy');
        const enabled = await runCase(browser, port, ENABLED_QUERY, 'enabled');

        const legacyDone = legacy.flat.includes('done') ? 1 : 0;
        const enabledDone = enabled.flat.includes('done') ? 1 : 0;
        const legacyResumeCount = Number(legacy.telemetry?.resumeCount ?? 0);
        const enabledResumeCount = Number(enabled.telemetry?.resumeCount ?? 0);
        const legacyJitActivityScore = computeJitActivityScore(legacy);
        const enabledJitActivityScore = computeJitActivityScore(enabled);

        console.log(`[telemetry] legacy=${JSON.stringify(legacy.telemetry)}`);
        console.log(`[telemetry] enabled=${JSON.stringify(enabled.telemetry)}`);
        console.log(`[timing] legacy_elapsed_ms=${legacy.elapsedMs}`);
        console.log(`[timing] enabled_elapsed_ms=${enabled.elapsedMs}`);
        console.log(`[config] legacy_query=${LEGACY_QUERY}`);
        console.log(`[config] enabled_query=${ENABLED_QUERY}`);
        console.log(`[METRIC] legacy_elapsed_ms=${legacy.elapsedMs}`);
        console.log(`[METRIC] enabled_elapsed_ms=${enabled.elapsedMs}`);
        console.log(`[METRIC] legacy_done=${legacyDone}`);
        console.log(`[METRIC] enabled_done=${enabledDone}`);
        console.log(`[METRIC] legacy_resume_count=${legacyResumeCount}`);
        console.log(`[METRIC] enabled_resume_count=${enabledResumeCount}`);
        console.log(`[METRIC] legacy_jit_compiler_loaded=${legacy.jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] enabled_jit_compiler_loaded=${enabled.jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] legacy_jit_regions_compiled=${legacy.jitRegionsCompiled}`);
        console.log(`[METRIC] enabled_jit_regions_compiled=${enabled.jitRegionsCompiled}`);
        console.log(`[METRIC] legacy_jit_activity_score=${legacyJitActivityScore}`);
        console.log(`[METRIC] enabled_jit_activity_score=${enabledJitActivityScore}`);

        const legacyChecks = assertLegacy(legacy);
        const enabledChecks = assertEnabled(enabled);
        printChecks('legacy', legacyChecks);
        printChecks('enabled', enabledChecks);

        const pass = legacyChecks.every(c => c.ok) && enabledChecks.every(c => c.ok);
        if (pass) {
            console.log('[PASS] #1 main-path JIT activation spec is green');
            process.exit(0);
        } else {
            if (legacy.pageError) console.log(`[FAIL] legacy pageerror=${legacy.pageError}`);
            if (enabled.pageError) console.log(`[FAIL] enabled pageerror=${enabled.pageError}`);
            console.log('[FAIL] #1 main-path JIT activation spec failed');
            process.exit(1);
        }
    } finally {
        if (originalManifest) {
            try {
                writeFileSync(join(BUNDLE_DIR, 'manifest.json'), originalManifest);
            } catch {
                // Ignore restore failures.
            }
        }
        if (browser) {
            try {
                await browser.close();
            } catch {
                // Ignore close failures.
            }
        }
        if (server) server.kill('SIGTERM');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
